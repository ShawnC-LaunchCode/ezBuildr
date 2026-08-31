import { describe, expect, it } from 'vitest';

import {
    buildActionCatalog,
    buildOperatorCatalog,
    buildOpCatalog,
    buildStepTypeCatalog,
    buildWorkflowVocabulary,
    getAllowedStepTypes,
    getConfigKeys,
    parseStepConfigForMode,
    validateGeneratedWorkflowForMode,
    validateWorkflowPatchOpsForMode,
} from '../../../shared/aiVocabulary';
import { conditionalActionEnum } from '../../../shared/schema/workflow';
import { comparisonOperatorSchema } from '../../../shared/types/conditions';
import { CANONICAL_STEP_TYPES, LEGACY_STEP_ADAPTERS } from '../../../shared/types/stepConfigs';
import { workflowPatchOpSchema, type WorkflowPatchOp } from '../../../shared/validation/aiWorkflowEdit.schema';
import { buildDefaultSystemPrompt, DEFAULT_SYSTEM_PROMPT } from '../../../server/services/AiSettingsService';

function catalogLine(catalog: string, type: string): string | undefined {
    return catalog.split('\n').find((line) => line.startsWith(`- ${type}`));
}

describe('mode-aware canonical AI vocabulary', () => {
    it('lists every canonical type in Advanced exactly once (AC1)', () => {
        const lines = buildStepTypeCatalog('advanced').split('\n');
        expect(lines).toHaveLength(CANONICAL_STEP_TYPES.length);
        for (const type of CANONICAL_STEP_TYPES) {
            expect(lines.filter((line) => line.startsWith(`- ${type}:`))).toHaveLength(1);
        }
    });

    it('never lists a retired stored type in either mode (AC1)', () => {
        for (const mode of ['easy', 'advanced'] as const) {
            const lines = buildStepTypeCatalog(mode).split('\n');
            for (const retiredType of Object.keys(LEGACY_STEP_ADAPTERS)) {
                expect(lines.some((line) => line.startsWith(`- ${retiredType}:`))).toBe(false);
            }
        }
    });

    it('lists the friendly Easy presets but maps them to canonical types (AC2)', () => {
        const catalog = buildStepTypeCatalog('easy');
        expect(catalogLine(catalog, 'text')).toContain('Short Text');
        expect(catalogLine(catalog, 'text')).toContain('Long Text');
        expect(catalogLine(catalog, 'boolean')).toContain('Yes/No');
        expect(catalogLine(catalog, 'date_time')).toContain('Date/Time');
        expect(catalogLine(catalog, 'choice')).toContain('Single Select');
        expect(catalogLine(catalog, 'number')).toContain('Currency');
        expect(catalogLine(catalog, 'file_upload')).toContain('File Upload');
        expect(buildWorkflowVocabulary('easy')).toContain(
            'presets are labels/configs, never type names',
        );
    });

    it('hides Advanced-only types and settings from Easy (AC2)', () => {
        const catalog = buildStepTypeCatalog('easy');
        for (const type of ['multi_field', 'js_question', 'computed', 'final_documents', 'signature_block']) {
            expect(catalogLine(catalog, type)).toBeUndefined();
        }
        expect(catalogLine(catalog, 'boolean')).not.toContain('trueAlias');
        expect(catalogLine(catalog, 'choice')).not.toContain('randomizeOrder');
        expect(catalogLine(catalog, 'number')).not.toContain('formatOnInput');
    });

    it('derives every Advanced config key exactly once from its canonical schema (AC3)', () => {
        const catalog = buildStepTypeCatalog('advanced');
        for (const type of CANONICAL_STEP_TYPES) {
            const keys = getConfigKeys(type, 'advanced');
            if (keys === null || keys.length === 0) { continue; }
            expect(new Set(keys).size, `${type} has a duplicate derived key`).toBe(keys.length);
            const line = catalogLine(catalog, type);
            expect(line).toBe(`- ${type}: ${keys.join(', ')}`);
        }
    });

    it('keeps both mode vocabularies inside the prompt budget (AC3)', () => {
        expect(buildWorkflowVocabulary('easy').length).toBeLessThan(8000);
        expect(buildWorkflowVocabulary('advanced').length).toBeLessThan(8000);
    });

    it('rejects retired types in both modes instead of normalizing them (AC4)', () => {
        expect(() => parseStepConfigForMode('short_text', { variant: 'short' }, 'easy'))
            .toThrow('is not canonical');
        expect(() => parseStepConfigForMode('number_advanced', { mode: 'number' }, 'advanced'))
            .toThrow('is not canonical');
    });

    it('rejects an Advanced-only type and key in Easy server validation (AC2, AC5)', () => {
        expect(() => parseStepConfigForMode('multi_field', undefined, 'easy'))
            .toThrow('Easy mode forbids step type "multi_field"');
        expect(() => parseStepConfigForMode('number', {
            mode: 'number',
            thousandsSeparator: true,
            formatOnInput: true,
        }, 'easy')).toThrow('Easy mode forbids config key(s) for "number"');
    });

    it('accepts the same implemented type and detailed key in Advanced (AC3, AC5)', () => {
        expect(parseStepConfigForMode('number', {
            mode: 'number',
            thousandsSeparator: true,
            formatOnInput: true,
        }, 'advanced')).toEqual({
            mode: 'number',
            thousandsSeparator: true,
            formatOnInput: true,
        });
    });

    it('allows only static Choice sources in Easy and all implemented sources in Advanced', () => {
        const dynamicChoice = {
            display: 'dropdown',
            options: { type: 'list', listVariable: 'contacts' },
        };
        expect(() => parseStepConfigForMode('choice', dynamicChoice, 'easy'))
            .toThrow('Easy mode forbids choice dynamic option sources');
        expect(() => parseStepConfigForMode('choice', dynamicChoice, 'advanced')).not.toThrow();
    });

    it('recursively rejects hidden and retired types inside List configs', () => {
        const listConfig = {
            fields: [{
                kind: 'question', id: 'field-1', alias: 'hidden', type: 'multi_field',
                title: 'Hidden', order: 0,
                config: { layout: 'first_last', fields: [], storeAs: 'separate' },
            }],
        };
        expect(() => parseStepConfigForMode('list', listConfig, 'easy'))
            .toThrow('Easy mode forbids step type "multi_field"');
    });

    it('handles signature_block without inventing a config contract (AC3)', () => {
        expect(getConfigKeys('signature_block', 'advanced')).toBeNull();
        expect(catalogLine(buildStepTypeCatalog('advanced'), 'signature_block'))
            .toBe('- signature_block: (no config contract; omit config)');
        expect(parseStepConfigForMode('signature_block', undefined, 'advanced')).toBeUndefined();
        expect(() => parseStepConfigForMode('signature_block', { penColor: 'blue' }, 'advanced'))
            .toThrow('has no config contract; omit config');
    });

    it('uses the same allowlist for generated workflows and patch ops (AC4, AC5)', () => {
        const workflow = {
            pages: [{ steps: [{ type: 'text', config: { variant: 'short' } }] }],
        };
        expect(() => validateGeneratedWorkflowForMode(workflow, 'easy')).not.toThrow();

        const ops: WorkflowPatchOp[] = [{
            op: 'step.create', pageId: 'page-1', type: 'text', title: 'Name',
            config: { variant: 'short' },
        }];
        expect(() => validateWorkflowPatchOpsForMode(ops, 'easy')).not.toThrow();
    });

    it('rejects a forbidden model patch before application (AC5)', () => {
        const ops: WorkflowPatchOp[] = [{
            op: 'step.create', pageId: 'page-1', type: 'js_question', title: 'Hidden',
            config: { display: 'hidden', code: 'emit(1)', inputKeys: [], outputKey: 'x' },
        }];
        expect(() => validateWorkflowPatchOpsForMode(ops, 'easy'))
            .toThrow('Easy mode forbids step type "js_question"');
    });

    it('derives operator, action, and operation catalogs from their schemas', () => {
        expect(buildOperatorCatalog().split(', ')).toEqual(comparisonOperatorSchema.options);
        expect(buildActionCatalog().split(', ')).toEqual(conditionalActionEnum.enumValues);
        const opNames = workflowPatchOpSchema.options.map(
            (option) => (option.shape.op as { value: string }).value,
        );
        expect(buildOpCatalog().split('\n')).toEqual(opNames.map((op) => `- ${op}`));
    });

    it('renders the selected mode catalog into the default prompt', () => {
        expect(DEFAULT_SYSTEM_PROMPT).toContain('{{workflowVocabulary}}');
        const easy = buildDefaultSystemPrompt('easy');
        const advanced = buildDefaultSystemPrompt('advanced');
        expect(easy).toContain(buildWorkflowVocabulary('easy'));
        expect(easy).not.toContain('- js_question:');
        expect(advanced).toContain(buildWorkflowVocabulary('advanced'));
        expect(advanced).toContain('- js_question:');
    });

    it('reports the exact mode-visible canonical type sets', () => {
        expect(getAllowedStepTypes('advanced')).toEqual(CANONICAL_STEP_TYPES);
        expect(getAllowedStepTypes('easy')).toContain('list');
        expect(getAllowedStepTypes('easy')).not.toContain('computed');
    });
});

/**
 * ICW2-12 — the prompt vocabulary must be generated from the platform's own
 * enums and schemas, not hand-listed. The load-bearing property under test is
 * that adding a step type or an op teaches the model with no prompt edit, so
 * these assertions are written against the enums themselves rather than
 * against a snapshot of expected text.
 */
import { describe, it, expect } from 'vitest';

import {
    buildActionCatalog,
    buildOperatorCatalog,
    buildOpCatalog,
    buildStepTypeCatalog,
    buildWorkflowVocabulary,
    getConfigKeys,
} from '../../../shared/aiVocabulary';
import { conditionalActionEnum, stepTypeEnum } from '../../../shared/schema/workflow';
import { comparisonOperatorSchema } from '../../../shared/types/conditions';
import { workflowPatchOpSchema } from '../../../shared/validation/aiWorkflowEdit.schema';

import { DEFAULT_SYSTEM_PROMPT } from '../../../server/services/AiSettingsService';

describe('AI vocabulary derivation', () => {
    it('documents every step type in stepTypeEnum (AC1)', () => {
        const catalog = buildStepTypeCatalog();
        for (const type of stepTypeEnum.enumValues) {
            expect(catalog, `missing step type: ${type}`).toContain(`- ${type}`);
        }
        // The audit's complaint: ~19 of 38 taught. All of them now.
        expect(stepTypeEnum.enumValues.length).toBeGreaterThan(30);
        expect(catalog.split('\n')).toHaveLength(stepTypeEnum.enumValues.length);
    });

    it('teaches the previously-omitted types the audit called out', () => {
        const catalog = buildStepTypeCatalog();
        for (const type of ['repeater', 'computed', 'js_question', 'loop_group',
            'final_documents', 'true_false', 'multi_field', 'choice',
            'number_advanced', 'address_advanced']) {
            expect(catalog, `missing: ${type}`).toContain(`- ${type}`);
        }
    });

    it('derives config keys from the step config schemas, not a hand list', () => {
        // radio's config schema carries options; the model needs that key name
        // or it emits choice steps with no options (the ICW2-2 failure mode).
        expect(getConfigKeys('radio')).toContain('options[]');
        expect(getConfigKeys('number')).toEqual(expect.arrayContaining(['min', 'max']));
        // A type with no registered schema is still listed, just without keys.
        expect(getConfigKeys('short_text')).toBeNull();
        expect(buildStepTypeCatalog()).toContain('- short_text');
    });

    it('documents every comparison operator the engine can evaluate', () => {
        const catalog = buildOperatorCatalog();
        for (const operator of comparisonOperatorSchema.options) {
            expect(catalog, `missing operator: ${operator}`).toContain(operator);
        }
        // The 8 engine operators the audit flagged as unreachable are present.
        for (const operator of ['starts_with', 'ends_with', 'includes_all', 'diff_days', 'on_or_after']) {
            expect(catalog).toContain(operator);
        }
    });

    it('documents every conditional action', () => {
        const catalog = buildActionCatalog();
        for (const action of conditionalActionEnum.enumValues) {
            expect(catalog).toContain(action);
        }
    });

    it('derives the op list from the patch union so it cannot drift', () => {
        const catalog = buildOpCatalog();
        const opNames = workflowPatchOpSchema.options.map(
            (option) => (option.shape.op as { value: string }).value
        );
        for (const op of opNames) {
            expect(catalog, `missing op: ${op}`).toContain(`- ${op}`);
        }
        expect(catalog.split('\n')).toHaveLength(opNames.length);
        // Ops added in ICW2-12 are taught automatically.
        expect(catalog).toContain('- section.setVisibleIf');
        expect(catalog).toContain('- step.reorder');
    });

    it('tells the model that visibleIf is an object, not a string', () => {
        const vocabulary = buildWorkflowVocabulary();
        expect(vocabulary).toContain('Condition expressions are objects, not strings');
        expect(vocabulary).toContain('"type":"condition"');
    });

    it('splices the generated vocabulary into the default system prompt', () => {
        expect(DEFAULT_SYSTEM_PROMPT).toContain(buildWorkflowVocabulary());
        // Placeholders the route substitutes must survive.
        expect(DEFAULT_SYSTEM_PROMPT).toContain('{{interviewerRole}}');
        expect(DEFAULT_SYSTEM_PROMPT).toContain('{{readingLevel}}');
        expect(DEFAULT_SYSTEM_PROMPT).toContain('{{tone}}');
    });

    it('keeps the vocabulary within a sane prompt budget', () => {
        // Names + one-line config summaries, never full JSON schemas.
        expect(buildWorkflowVocabulary().length).toBeLessThan(8000);
    });
});

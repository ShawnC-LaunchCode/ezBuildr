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
    TEMPORARY_CONFIG_KEY_EXCLUSIONS,
    validateConfigKeyExclusions,
} from '../../../shared/aiVocabulary';
import { conditionalActionEnum, stepTypeEnum } from '../../../shared/schema/workflow';
import { comparisonOperatorSchema } from '../../../shared/types/conditions';
import { workflowPatchOpSchema } from '../../../shared/validation/aiWorkflowEdit.schema';

import { DEFAULT_SYSTEM_PROMPT } from '../../../server/services/AiSettingsService';

// Keys still awaiting an implementation. A family ticket that implements one
// releases it from here *and* from the manifest -- the two are asserted equal
// on purpose, so neither can drift alone. `boolean.displayStyle` was released
// by STB-5, which implemented all four styles end to end.
const AUDITED_INERT_CONFIG_KEYS = {
    radio: ['displayLayout'],
    date_time: ['showDate', 'showTime'],
    file_upload: ['previewThumbnails'],
    phone_advanced: ['defaultCountry', 'allowedCountries'],
    datetime_unified: ['timezone', 'showTimezone'],
    choice: ['allowOther', 'otherLabel', 'randomizeOrder'],
    email_advanced: ['requireVerification'],
    number_advanced: [
        'mode',
        'validation',
        'currency',
        'formatOnInput',
        'thousandsSeparator',
        'prefix',
        'suffix',
    ],
    website_advanced: ['validateDns'],
    address_advanced: ['country', 'allowedCountries'],
    display_advanced: ['allowHtml'],
} as const;

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
        for (const type of ['computed', 'js_question',
            'final_documents', 'true_false', 'multi_field', 'choice',
            'number_advanced', 'address_advanced']) {
            expect(catalog, `missing: ${type}`).toContain(`- ${type}`);
        }
    });

    it('derives config keys from the step config schemas, not a hand list', () => {
        // radio's config schema carries options; the model needs that key name
        // or it emits choice steps with no options (the ICW2-2 failure mode).
        expect(getConfigKeys('radio')).toContain('options[]');
        // Canonical `number` groups its limits under `validation` (STB-9). The
        // model must still see them, one level in -- withdrawing min/max from
        // the vocabulary would silently cost AI the ability to set limits.
        expect(getConfigKeys('number')).toEqual(
            expect.arrayContaining(['validation.min', 'validation.max']),
        );
        // A type with no registered schema is still listed, just without keys.
        expect(getConfigKeys('short_text')).toBeNull();
        expect(buildStepTypeCatalog()).toContain('- short_text');
    });

    it('does not advertise the audited inert config keys (STB-1 AC1, AC4)', () => {
        expect(TEMPORARY_CONFIG_KEY_EXCLUSIONS).toEqual(AUDITED_INERT_CONFIG_KEYS);

        const catalog = buildStepTypeCatalog();
        for (const [stepType, excludedKeys] of Object.entries(AUDITED_INERT_CONFIG_KEYS)) {
            const advertisedKeys = getConfigKeys(stepType);
            expect(advertisedKeys, `missing config schema for ${stepType}`).not.toBeNull();

            const catalogLine = catalog
                .split('\n')
                .find((line) => line.startsWith(`- ${stepType}:`));
            expect(catalogLine, `missing catalog line for ${stepType}`).toBeDefined();

            for (const key of excludedKeys) {
                expect(
                    advertisedKeys?.some((description) =>
                        description === key ||
                        description.startsWith(`${key}[`) ||
                        description.startsWith(`${key}(`)
                    ),
                    `${stepType}.${key} was still advertised`,
                ).toBe(false);
                expect(catalogLine, `${stepType}.${key} was still present in the catalog`).not.toContain(key);
            }
        }
    });

    it('keeps implemented sibling config keys advertised (STB-1 AC2)', () => {
        expect(getConfigKeys('choice')).toContain('options');
        expect(getConfigKeys('number')).toEqual(
            expect.arrayContaining(['validation.min', 'validation.max']),
        );
        // A cross-field rule makes the schema a ZodEffects; the catalog must
        // still see through it rather than reporting the type as freeform.
        expect(getConfigKeys('number')).not.toBeNull();
        expect(getConfigKeys('number')).toContain('thousandsSeparator');
    });

    it('advertises a key once its family implements it (STB-5)', () => {
        // STB-1's manifest is containment for keys with no behaviour behind
        // them. STB-5 implemented Boolean `displayStyle` end to end -- three
        // renderers, an editor control, a legal schema value -- so the
        // exclusion had to come off, or AI stays barred from a capability that
        // works. The guard only catches exclusions naming a *missing* field;
        // nothing catches one that has quietly become unnecessary.
        expect(getConfigKeys('boolean')).toEqual(
            expect.arrayContaining(['displayStyle(buttons|radio|toggle|checkbox)']),
        );
    });

  it('fails loudly when an exclusion drifts from the type or schema (STB-1 AC3)', () => {
        expect(() => validateConfigKeyExclusions({
            choice: ['removedSchemaKey'],
        })).toThrowError('AI vocabulary exclusion names missing schema key "choice.removedSchemaKey"');

        expect(() => validateConfigKeyExclusions({
            missing_type: ['options'],
        })).toThrowError('AI vocabulary exclusion names unknown step type "missing_type"');

        expect(() => validateConfigKeyExclusions({
            short_text: ['placeholder'],
        })).toThrowError('AI vocabulary exclusion names step type "short_text" with no config schema');
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
        expect(catalog).toContain('- page.setVisibleIf');
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

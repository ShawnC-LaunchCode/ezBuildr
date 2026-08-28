import { describe, it, expect } from 'vitest';

import {
    getConfigSchema,
    validateStepConfig,
    FinalBlockConfigSchema,
    TextAdvancedConfigSchema as _TextAdvancedConfigSchema,
    ChoiceAdvancedConfigSchema,
    BooleanAdvancedConfigSchema,
    ListConfigSchema
} from '../../../../shared/validation/stepConfigSchemas';
import { LIST_VALIDATION_MAX_DEPTH } from '../../../../shared/validation/BlockValidation';
import type { ListConfig, ListField } from '../../../../shared/types/stepConfigs';

describe('Step Config Schemas', () => {
    describe('getConfigSchema', () => {
        it('should return schema for known types', () => {
            expect(getConfigSchema('text')).toBeDefined();
            expect(getConfigSchema('phone')).toBeDefined();
            expect(getConfigSchema('final_documents')).toBeDefined();
        });

        it('should return undefined for unknown types', () => {
            expect(getConfigSchema('unknown_type')).toBeUndefined();
        });
    });

    describe('validateStepConfig', () => {
        it('should validate valid config', () => {
            const config = {
                variant: 'short',
                validation: {},
                placeholder: 'Enter text'
            };
            const result = validateStepConfig('text', config);
            expect(result.success).toBe(true);
            expect(result.data).toMatchObject(config);
        });

        it('should fail invalid config (invalid enum value)', () => {
            const config = {
                variant: 'medium', // invalid variant, must be short or long
                validation: {}
            };
            const result = validateStepConfig('text', config);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should pass through if no schema exists', () => {
            const config = { anything: 'goes' };
            const result = validateStepConfig('unknown_type', config);
            expect(result.success).toBe(true);
            expect(result.data).toBe(config);
        });
    });

    describe('Specific Schema Validations', () => {
        describe('BooleanAdvancedConfigSchema', () => {
            it.each(['buttons', 'radio', 'toggle', 'checkbox'] as const)(
                'accepts the legal %s display style',
                (displayStyle) => {
                    const result = BooleanAdvancedConfigSchema.safeParse({
                        trueLabel: 'Yes',
                        falseLabel: 'No',
                        storeAsBoolean: true,
                        displayStyle,
                    });
                    expect(result.success).toBe(true);
                }
            );

            it('rejects an unknown display style', () => {
                expect(BooleanAdvancedConfigSchema.safeParse({
                    trueLabel: 'Yes',
                    falseLabel: 'No',
                    storeAsBoolean: true,
                    displayStyle: 'segmented',
                }).success).toBe(false);
            });
        });

        describe('FinalBlockConfigSchema', () => {
            it('should enforce unique aliases', () => {
                const validConfig = {
                    markdownHeader: 'Done',
                    documents: [
                        { id: '1', documentId: 'd1', alias: 'doc1' },
                        { id: '2', documentId: 'd2', alias: 'doc2' }
                    ]
                };
                const validResult = FinalBlockConfigSchema.safeParse(validConfig);
                expect(validResult.success).toBe(true);

                const invalidConfig = {
                    markdownHeader: 'Done',
                    documents: [
                        { id: '1', documentId: 'd1', alias: 'doc1' },
                        { id: '2', documentId: 'd2', alias: 'doc1' } // Duplicate alias
                    ]
                };
                const invalidResult = FinalBlockConfigSchema.safeParse(invalidConfig);
                expect(invalidResult.success).toBe(false);
                if (!invalidResult.success) {
                    expect(invalidResult.error.issues[0].message).toContain('aliases must be unique');
                }
            });

            it('accepts one or both supported output formats and rejects an empty selection', () => {
                const baseConfig = { markdownHeader: 'Done', documents: [] };

                expect(FinalBlockConfigSchema.safeParse({ ...baseConfig, outputFormats: ['docx'] }).success).toBe(true);
                expect(FinalBlockConfigSchema.safeParse({ ...baseConfig, outputFormats: ['docx', 'pdf'] }).success).toBe(true);
                expect(FinalBlockConfigSchema.safeParse({ ...baseConfig, outputFormats: [] }).success).toBe(false);
            });

            it('ties each delivery destination config to its type', () => {
                const result = FinalBlockConfigSchema.safeParse({
                    markdownHeader: 'Done',
                    documents: [],
                    deliveryDestinations: [{
                        id: 'mismatched-webhook',
                        type: 'webhook',
                        config: { to: 'recipient@example.com' },
                    }],
                });

                expect(result.success).toBe(false);
            });

            it('accepts valid email, webhook, and cloud storage destinations', () => {
                const result = FinalBlockConfigSchema.safeParse({
                    markdownHeader: 'Done',
                    documents: [],
                    deliveryDestinations: [
                        {
                            id: 'email-destination',
                            type: 'email',
                            config: { to: 'recipient@example.com', attachDocuments: true },
                        },
                        {
                            id: 'webhook-destination',
                            type: 'webhook',
                            config: { url: 'https://example.com/delivery', secret: 'secret' },
                        },
                        {
                            id: 'cloud-destination',
                            type: 'cloud_storage',
                            config: { provider: 's3', bucket: 'documents' },
                        },
                    ],
                });

                expect(result.success).toBe(true);
            });

            it('rejects a webhook destination with a non-URL endpoint', () => {
                const result = FinalBlockConfigSchema.safeParse({
                    markdownHeader: 'Done',
                    documents: [],
                    deliveryDestinations: [{
                        id: 'invalid-webhook',
                        type: 'webhook',
                        config: { url: 'internal-host' },
                    }],
                });

                expect(result.success).toBe(false);
            });
        });

        describe('ChoiceAdvancedConfigSchema', () => {
            it('should require at least one option', () => {
                const invalidConfig = {
                    display: 'dropdown',
                    allowMultiple: false,
                    options: [] // Empty
                };
                const result = ChoiceAdvancedConfigSchema.safeParse(invalidConfig);
                expect(result.success).toBe(false);
            });

            it('should validate valid options', () => {
                const validConfig = {
                    display: 'dropdown',
                    allowMultiple: false,
                    options: [{ id: 'opt1', label: 'Option 1' }]
                };
                const result = ChoiceAdvancedConfigSchema.safeParse(validConfig);
                expect(result.success).toBe(true);
            });
        });

        describe('ListConfigSchema (LIST2-3)', () => {
            function questionField(overrides: Partial<Extract<ListField, { kind: 'question' }>> = {}): ListField {
                return {
                    kind: 'question',
                    id: 'f-1',
                    alias: 'field_1',
                    type: 'short_text',
                    title: 'Field 1',
                    order: 0,
                    ...overrides,
                };
            }

            function listField(overrides: Partial<Extract<ListField, { kind: 'list' }>> = {}): ListField {
                return {
                    kind: 'list',
                    id: 'f-nested',
                    alias: 'nested',
                    title: 'Nested',
                    order: 1,
                    list: { fields: [questionField()] },
                    ...overrides,
                };
            }

            it('is registered under "list" in getConfigSchema, unlike before LIST2-3', () => {
                expect(getConfigSchema('list')).toBeDefined();
            });

            it('AC1: rejects a malformed field alias', () => {
                const config: ListConfig = { fields: [questionField({ alias: '2bad' })] };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(false);
            });

            it('AC1: accepts a well-formed alias', () => {
                const config: ListConfig = { fields: [questionField({ alias: 'first_name' })] };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(true);
            });

            it('AC2: rejects two fields with the same alias at the same level', () => {
                const config: ListConfig = {
                    fields: [
                        questionField({ id: 'f-1', alias: 'dup' }),
                        questionField({ id: 'f-2', alias: 'DUP' }),
                    ],
                };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(false);
            });

            it('AC2: accepts the same alias reused at two different levels', () => {
                const config: ListConfig = {
                    fields: [
                        questionField({ id: 'f-1', alias: 'name' }),
                        listField({
                            id: 'f-2',
                            alias: 'addresses',
                            list: { fields: [questionField({ id: 'f-3', alias: 'name' })] },
                        }),
                    ],
                };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(true);
            });

            it(`AC3: rejects nesting deeper than LIST_VALIDATION_MAX_DEPTH (${LIST_VALIDATION_MAX_DEPTH})`, () => {
                // Builds LIST_VALIDATION_MAX_DEPTH + 1 nested ListConfig levels — one level past the cap.
                let deepest: ListConfig = { fields: [questionField()] };
                for (let i = 0; i < LIST_VALIDATION_MAX_DEPTH; i += 1) {
                    deepest = { fields: [listField({ id: `f-level-${i}`, list: deepest })] };
                }
                const result = validateStepConfig('list', deepest);
                expect(result.success).toBe(false);
            });

            it(`AC3: accepts nesting exactly at LIST_VALIDATION_MAX_DEPTH (${LIST_VALIDATION_MAX_DEPTH})`, () => {
                let deepest: ListConfig = { fields: [questionField()] };
                for (let i = 0; i < LIST_VALIDATION_MAX_DEPTH - 1; i += 1) {
                    deepest = { fields: [listField({ id: `f-level-${i}`, list: deepest })] };
                }
                const result = validateStepConfig('list', deepest);
                expect(result.success).toBe(true);
            });

            it('AC4: rejects a question field whose type is outside LIST_FIELD_QUESTION_TYPES', () => {
                const config = {
                    fields: [{ ...questionField(), type: 'signature_block' }],
                };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(false);
            });

            it('AC5: a well-formed config round-trips unchanged — no field dropped or reordered', () => {
                const config: ListConfig = {
                    fields: [
                        questionField({ id: 'f-1', alias: 'first_name', order: 0 }),
                        listField({
                            id: 'f-2',
                            alias: 'addresses',
                            order: 1,
                            list: {
                                fields: [
                                    questionField({ id: 'f-3', alias: 'street', order: 0, required: true }),
                                    questionField({ id: 'f-4', alias: 'city', order: 1, type: 'choice' }),
                                ],
                            },
                        }),
                    ],
                    minItems: 1,
                    maxItems: 10,
                    labelTemplate: '{first_name}',
                    addButtonText: 'Add person',
                };
                const result = validateStepConfig('list', config);
                expect(result.success).toBe(true);
                expect(result.data).toEqual(config);
            });

            it('ListConfigSchema is exported directly for consumers that want it without the string dispatch', () => {
                expect(ListConfigSchema.safeParse({ fields: [] }).success).toBe(true);
            });
        });
    });
});

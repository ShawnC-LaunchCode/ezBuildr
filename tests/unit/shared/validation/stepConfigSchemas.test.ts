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

        it.each(['date', 'time', 'datetime'] as const)('accepts canonical date_time kind %s', (kind) => {
            const config = {
                kind,
                minDate: '2026-01-01',
                maxDate: '2026-12-31',
                defaultToToday: true,
                timeFormat: '24h',
                timeStep: 5,
            };
            const result = validateStepConfig('date_time', config);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(config);
        });

        it.each([
            {},
            { kind: 'calendar' },
            { kind: 'time', timeStep: 0 },
            { kind: 'datetime', timeFormat: 'military' },
        ])('rejects invalid canonical date_time config %#', (config) => {
            expect(validateStepConfig('date_time', config).success).toBe(false);
        });

        it('strips retired and deferred date_time keys from the active contract', () => {
            const result = validateStepConfig('date_time', {
                kind: 'datetime',
                showDate: true,
                showTime: true,
                timezone: 'America/Chicago',
                showTimezone: true,
            });
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ kind: 'datetime' });
        });
    });

    describe('Canonical Configs (STB-13)', () => {
        it('should accept valid canonical phone config and silently strip removed keys', () => {
            const valid = validateStepConfig('phone', {
                format: 'US',
                placeholder: 'Phone number',
                validation: { strict: true }
            });
            expect(valid.success).toBe(true);

            const stripped = validateStepConfig('phone', {
                format: 'US',
                allowedCountries: ['US', 'CA'], // removed key
            });
            expect(stripped.success).toBe(true);
            expect(stripped.data).toEqual({ format: 'US' });
            expect(stripped.data).not.toHaveProperty('allowedCountries');
        });

        it('should accept valid canonical email config and silently strip removed keys', () => {
            const valid = validateStepConfig('email', {
                allowMultiple: true,
                maxEmails: 2,
                restrictDomains: ['example.com']
            });
            expect(valid.success).toBe(true);

            const stripped = validateStepConfig('email', {
                allowMultiple: true,
                requireVerification: true, // removed key
            });
            expect(stripped.success).toBe(true);
            expect(stripped.data).toEqual({ allowMultiple: true });
            expect(stripped.data).not.toHaveProperty('requireVerification');
        });

        it('should accept valid canonical website config and silently strip removed keys', () => {
            const valid = validateStepConfig('website', {
                requireProtocol: true,
                allowedProtocols: ['https']
            });
            expect(valid.success).toBe(true);

            const stripped = validateStepConfig('website', {
                requireProtocol: true,
                validateDns: true, // removed key
            });
            expect(stripped.success).toBe(true);
            expect(stripped.data).toEqual({ requireProtocol: true });
            expect(stripped.data).not.toHaveProperty('validateDns');
        });

        it('should still validate legacy configs under the retired type name and strip removed keys (read-compat)', () => {
            const legacy = validateStepConfig('phone_advanced', {
                format: 'international',
                defaultCountry: 'US'
            });
            expect(legacy.success).toBe(true);
            expect(legacy.data).toEqual({ format: 'international' });
            expect(legacy.data).not.toHaveProperty('defaultCountry');
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

    describe('STB-14 Acceptance Tests (Round 3)', () => {
        describe('AC 5/6: Legacy read-compat strict rejection & canonical output', () => {
            it('address_advanced: validates strictly and returns canonical shape', () => {
                const legacyValid = {country:'US', fields:[{key:'street1',label:'Street',type:'text',required:true}], autoComplete:true};
                const legacyGarbage = {...legacyValid, bogusKey: 123};
                const legacyMissingField = {country:'US', autoComplete:true}; // missing fields

                // Valid legacy read
                const result1 = validateStepConfig('address_advanced', legacyValid);
                expect(result1.success).toBe(true);
                expect(result1.data).toEqual({ country: 'US', fields: ['street', 'city', 'state', 'zip'] });

                // Strict rejection
                const result2 = validateStepConfig('address_advanced', legacyGarbage);
                expect(result2.success).toBe(false);

                // Missing required legacy keys
                const result3 = validateStepConfig('address_advanced', legacyMissingField);
                expect(result3.success).toBe(false);

                // Canonical shape (when reading as standard address)
                const canonicalValid = { country: 'US', fields: ['street', 'city', 'state', 'zip'] };
                const result4 = validateStepConfig('address', canonicalValid);
                expect(result4.success).toBe(true);
            });

            it('scale_advanced: validates strictly and returns canonical shape', () => {
                const config1 = {min:1,max:5,step:1,display:'buttons' as const,showValue:true};
                const config2 = {min:1,max:5,step:1,display:'stars' as const,stars:5,color:'#ff0000'};
                const configGarbage = {min:1,max:5,step:1,display:'slider' as const, foo: 'bar'};

                // Valid legacy read mapping to canonical (buttons -> slider)
                const result1 = validateStepConfig('scale_advanced', config1);
                expect(result1.success).toBe(true);
                expect(result1.data).toEqual({ min: 1, max: 5, step: 1, display: 'slider', showValue: true });

                // Valid legacy read mapping to canonical (stars -> stars)
                const result2 = validateStepConfig('scale_advanced', config2);
                expect(result2.success).toBe(true);
                expect(result2.data).toEqual({ min: 1, max: 5, step: 1, display: 'stars' });

                // Strict rejection
                const result3 = validateStepConfig('scale_advanced', configGarbage);
                expect(result3.success).toBe(false);

                // Canonical shape (when reading as standard scale)
                const canonicalValid = { min: 1, max: 5, step: 1, display: 'slider' };
                const result4 = validateStepConfig('scale', canonicalValid);
                expect(result4.success).toBe(true);
            });

            it('display_advanced: validates strictly and returns canonical shape', () => {
                const config = {markdown:'# H', allowHtml:false, template:true, variables:['firstName']};
                const configGarbage = {...config, unknownProp: 42};
                const configMissing = {allowHtml: false}; // missing markdown

                const result1 = validateStepConfig('display_advanced', config);
                expect(result1.success).toBe(true);
                expect(result1.data).toEqual({ markdown: '# H' });

                const result2 = validateStepConfig('display_advanced', configGarbage);
                expect(result2.success).toBe(false);

                const result3 = validateStepConfig('display_advanced', configMissing);
                expect(result3.success).toBe(false);

                // Canonical shape
                const canonicalValid = { markdown: '# H' };
                const result4 = validateStepConfig('display', canonicalValid);
                expect(result4.success).toBe(true);
            });
        });
    });
});

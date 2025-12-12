import { describe, it, expect } from 'vitest';
import {
    getConfigSchema,
    validateStepConfig,
    FinalBlockConfigSchema,
    TextAdvancedConfigSchema,
    ChoiceAdvancedConfigSchema
} from '../../../../shared/validation/stepConfigSchemas';

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

        it('should fail invalid config (missing required fields)', () => {
            const config = {
                // Missing variant
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
    });
});

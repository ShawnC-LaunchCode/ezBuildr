import { describe, it, expect, vi } from 'vitest';
import { validateValue, ValidatorOptions } from '../../../../shared/validation/Validator';
import { ValidationSchema } from '../../../../shared/validation/ValidationSchema';
import { ValidationRule } from '../../../../shared/validation/ValidationRule';

// Mock condition evaluator since it's an external dependency
vi.mock('../../../../shared/conditionEvaluator', () => ({
    evaluateConditionExpression: vi.fn((condition, values) => {
        // Simple mock logic: if condition is 'true', return true, else false
        if (condition === 'mock-true') return true;
        if (condition === 'mock-false') return false;
        return false;
    }),
}));

describe('Validator', () => {
    describe('validateValue', () => {
        it('should validate required values', async () => {
            const schema: ValidationSchema = {
                required: true,
                rules: [],
            };

            // Empty string
            expect(await validateValue({ schema, value: '' })).toEqual({
                valid: false,
                errors: expect.arrayContaining([expect.stringContaining('required')]),
            });

            // Null
            expect(await validateValue({ schema, value: null })).toEqual({
                valid: false,
                errors: expect.arrayContaining([expect.stringContaining('required')]),
            });

            // Valid string
            expect(await validateValue({ schema, value: 'test' })).toEqual({
                valid: true,
                errors: [],
            });
        });

        it('should respect custom required message', async () => {
            const schema: ValidationSchema = {
                required: true,
                requiredMessage: 'Custom Required Message',
                rules: [],
            };

            expect(await validateValue({ schema, value: '' })).toEqual({
                valid: false,
                errors: ['Custom Required Message'],
            });
        });

        it('should skip other validation if value is empty and not required', async () => {
            const schema: ValidationSchema = {
                required: false,
                rules: [
                    { type: 'minLength', value: 5 },
                ],
            };

            expect(await validateValue({ schema, value: '' })).toEqual({
                valid: true,
                errors: [],
            });
        });

        describe('Numeric Rules', () => {
            it('should validate minValue', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'minValue', value: 10 }],
                };

                expect(await validateValue({ schema, value: 5 })).toEqual({
                    valid: false,
                    errors: expect.any(Array),
                });
                expect(await validateValue({ schema, value: 10 })).toEqual({ valid: true, errors: [] });
                expect(await validateValue({ schema, value: 15 })).toEqual({ valid: true, errors: [] });
            });

            it('should validate maxValue', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'maxValue', value: 10 }],
                };

                expect(await validateValue({ schema, value: 15 })).toEqual({
                    valid: false,
                    errors: expect.any(Array),
                });
                expect(await validateValue({ schema, value: 10 })).toEqual({ valid: true, errors: [] });
                expect(await validateValue({ schema, value: 5 })).toEqual({ valid: true, errors: [] });
            });
        });

        describe('String Rules', () => {
            it('should validate minLength', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'minLength', value: 3 }],
                };

                expect(await validateValue({ schema, value: 'ab' })).toEqual({
                    valid: false,
                    errors: expect.any(Array),
                });
                expect(await validateValue({ schema, value: 'abc' })).toEqual({ valid: true, errors: [] });
            });

            it('should validate maxLength', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'maxLength', value: 3 }],
                };

                expect(await validateValue({ schema, value: 'abcd' })).toEqual({
                    valid: false,
                    errors: expect.any(Array),
                });
                expect(await validateValue({ schema, value: 'abc' })).toEqual({ valid: true, errors: [] });
            });

            it('should validate email', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'email' }],
                };

                expect(await validateValue({ schema, value: 'invalid-email' })).toEqual({ valid: false, errors: expect.any(Array) });
                expect(await validateValue({ schema, value: 'test@example.com' })).toEqual({ valid: true, errors: [] });
            });

            it('should validate url', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'url' }],
                };

                expect(await validateValue({ schema, value: 'not-a-url' })).toEqual({ valid: false, errors: expect.any(Array) });
                expect(await validateValue({ schema, value: 'https://example.com' })).toEqual({ valid: true, errors: [] });
            });

            it('should validate pattern (regex)', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{ type: 'pattern', regex: '^abc.*' }], // Starts with abc
                };

                expect(await validateValue({ schema, value: 'xyz' })).toEqual({ valid: false, errors: expect.any(Array) });
                expect(await validateValue({ schema, value: 'abcThisIsFine' })).toEqual({ valid: true, errors: [] });
            });
        });

        describe('Conditional Rules', () => {
            it('should pass if condition evaluates to true', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{
                        type: 'conditional',
                        condition: 'mock-true' as any // Type cast because mock logic string input
                    }]
                };
                // In validator logic: if evaluateCondition returns FALSE, it errors.
                // So 'mock-true' should NOT error.

                // Wait, re-reading logic:
                // if (!met) { return formatMessage(...) }
                // So if met is FALSE, it returns error.
                // So if we want PASS, we need 'mock-true' to return TRUE.

                // My mock returns: if (condition === 'mock-true') return true;
                // So this should pass.

                expect(await validateValue({ schema, value: 'val' })).toEqual({ valid: true, errors: [] });
            });

            it('should fail if condition evaluates to false', async () => {
                const schema: ValidationSchema = {
                    required: false,
                    rules: [{
                        type: 'conditional',
                        condition: 'mock-false' as any,
                        message: 'Condition failed'
                    }]
                };

                // My mock returns false for 'mock-false'
                // Validator checks !false -> returns error.

                expect(await validateValue({ schema, value: 'val' })).toEqual({
                    valid: false,
                    errors: ['Condition failed']
                });
            });
        });
    });
});

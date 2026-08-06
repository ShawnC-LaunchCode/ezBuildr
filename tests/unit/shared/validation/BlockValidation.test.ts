import { describe, it, expect } from 'vitest';

import { getValidationSchema, type StepLike } from '../../../../shared/validation/BlockValidation';

/**
 * RUN2-3: a required question of a type the runner cannot render or does not
 * recognize at all previously still pushed
 * a "required" rule, making the section unfinishable — the Next button would
 * report the field as required for a control that never appears on screen.
 * `getValidationSchema` must never require these types, regardless of
 * `step.required`.
 */
describe('getValidationSchema', () => {
    const baseStep = (overrides: Partial<StepLike>): StepLike => ({
        id: 'step-1',
        type: 'short_text',
        config: null,
        required: true,
        ...overrides,
    });

    describe('runner-unsupported/unknown step types (RUN2-3)', () => {
        it('returns no required rule and required=false for an unrecognized type', () => {
            const type = 'some_future_type';
            const step = baseStep({ type, required: true });

            const schema = getValidationSchema(step);

            expect(schema.rules).not.toContainEqual(expect.objectContaining({ type: 'required' }));
            expect(schema.required).toBe(false);
        });

        it('requires file_upload now that the runner has a real upload control', () => {
            const step = baseStep({ type: 'file_upload', required: true, config: { maxFiles: 3 } });

            const schema = getValidationSchema(step);

            expect(schema.rules).toContainEqual(expect.objectContaining({ type: 'required' }));
            expect(schema.required).toBe(true);
        });
    });

    describe('runner-rendered step types (unchanged behavior)', () => {
        it('still requires a rendered type (short_text) when step.required is true', () => {
            const step = baseStep({ type: 'short_text', required: true });

            const schema = getValidationSchema(step);

            expect(schema.rules).toContainEqual(expect.objectContaining({ type: 'required' }));
            expect(schema.required).toBe(true);
        });

        it('does not require a rendered type when step.required is false', () => {
            const step = baseStep({ type: 'short_text', required: false });

            const schema = getValidationSchema(step);

            expect(schema.rules).not.toContainEqual(expect.objectContaining({ type: 'required' }));
            expect(schema.required).toBe(false);
        });
    });
});

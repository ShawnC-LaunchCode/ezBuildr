import { describe, it, expect, vi } from 'vitest';

import { validatePage } from '../../../../shared/validation/PageValidator';
import { validateValue } from '../../../../shared/validation/Validator';

// Mock validateValue
vi.mock('../../../../shared/validation/Validator', () => ({
    validateValue: vi.fn(),
}));

describe('PageValidator', () => {
    const mockValidateValue = validateValue as any;

    it('should return valid if all blocks are valid', async () => {
        mockValidateValue.mockResolvedValue({ valid: true, errors: [] });

        const schemas = {
            'block1': { required: true, rules: [] },
            'block2': { required: false, rules: [] }
        };
        const values = { 'block1': 'val1', 'block2': 'val2' };

        const result = await validatePage({ schemas, values });

        expect(result.valid).toBe(true);
        expect(result.blockErrors).toEqual({});
        expect(mockValidateValue).toHaveBeenCalledTimes(2);
    });

    it('should aggregate errors from invalid blocks', async () => {
        // Setup mock to fail for block2
        mockValidateValue.mockImplementation(async (args: any) => {
            const { value } = args;
            if (value === 'invalid') {
                return { valid: false, errors: ['Error 1'] };
            }
            return { valid: true, errors: [] };
        });

        const schemas = {
            'block1': { required: true, rules: [] },
            'block2': { required: true, rules: [] }
        };
        const values = { 'block1': 'valid', 'block2': 'invalid' };

        const result = await validatePage({ schemas, values });

        expect(result.valid).toBe(false);
        expect(result.blockErrors).toHaveProperty('block2');
        expect(result.blockErrors['block2']).toEqual(['Error 1']);
        expect(result.blockErrors).not.toHaveProperty('block1');
    });

    it('should pass allValues context to validator', async () => {
        mockValidateValue.mockResolvedValue({ valid: true, errors: [] });

        const schemas = { 'block1': { required: false, rules: [] } };
        const values = { 'block1': 'val' };
        const allValues = { 'block1': 'val', 'other': 'context' };

        await validatePage({ schemas, values, allValues });

        expect(mockValidateValue).toHaveBeenCalledWith(expect.objectContaining({
            values: allValues
        }));
    });
});

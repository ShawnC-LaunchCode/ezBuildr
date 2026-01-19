
import { describe, it, expect, vi } from 'vitest';

import type { ValidateConfig, BlockContext, CompareRule, ConditionalRequiredRule, ForEachRule } from '@shared/types/blocks';

import { ValidateBlockRunner } from '../../server/services/blockRunners/ValidateBlockRunner';

// Mock dependencies to avoid loading real DB/Repositories
vi.mock('../../server/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));

describe('BlockRunner Validation Logic', () => {
    const runner = new ValidateBlockRunner();
    // Helper to create a mock block for testing
    const createMockBlock = () => ({
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'validate' as const,
        phase: 'onNext' as const,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
        sectionId: null,
        virtualStepId: null,
    });

    it('should pass if no rules are present', async () => {
        const config: ValidateConfig = { rules: [] };
        const context: any = { data: {}, aliasMap: {} };
        const result = await runner.execute(config, context, createMockBlock());
        expect(result.success).toBe(true);
    });

    describe('Compare Rules', () => {
        const rule: CompareRule = {
            type: 'compare',
            left: 'age',
            op: 'greater_than',
            right: 18,
            rightType: 'constant',
            message: 'Must be over 18'
        };
        const config: ValidateConfig = { rules: [rule] };

        it('should pass on valid comparison', async () => {
            const context: any = { data: { age: 20 }, aliasMap: { age: 'step-1' } };
            const result = await runner.execute(config, context, createMockBlock());
            expect(result.success).toBe(true);
        });

        it('should fail on invalid comparison and map alias to ID', async () => {
            const context: any = { data: { age: 10 }, aliasMap: { age: 'step-1' } };
            const result = await runner.execute(config, context, createMockBlock());
            expect(result.success).toBe(false);
            expect(result.errors).toContain('Must be over 18');
            expect(result.fieldErrors?.['step-1']).toContain('Must be over 18');
        });

        it('should compare with variable', async () => {
            const varRule: CompareRule = { ...rule, rightType: 'variable', right: 'minAge' };
            const varConfig = { rules: [varRule] };

            const context: any = { data: { age: 20, minAge: 21 }, aliasMap: {} };
            const result = await runner.execute(varConfig, context, createMockBlock());
            expect(result.success).toBe(false);
        });
    });

    describe('Conditional Required Rules', () => {
        const rule: ConditionalRequiredRule = {
            type: 'conditional_required',
            when: { key: 'married', op: 'equals', value: 'yes' },
            requiredFields: ['spouseName'],
            message: 'Spouse Name is required'
        };
        const config: ValidateConfig = { rules: [rule] };

        it('should enforce requirement if condition met', async () => {
            const context: any = {
                data: { married: 'yes', spouseName: '' },
                aliasMap: { spouseName: 'step-spouse' }
            };
            const result = await runner.execute(config, context, createMockBlock());
            expect(result.success).toBe(false);
            expect(result.fieldErrors?.['step-spouse']).toBeDefined();
        });

        it('should ignore requirement if condition not met', async () => {
            const context: any = {
                data: { married: 'no', spouseName: '' },
                aliasMap: {}
            };
            const result = await runner.execute(config, context, createMockBlock());
            expect(result.success).toBe(true);
        });
    });

    describe('ForEach Rules', () => {
        const rule: ForEachRule = {
            type: 'foreach',
            listKey: 'children',
            itemAlias: 'child',
            rules: [
                {
                    assert: { key: 'child.age', op: 'is_not_empty' },
                    message: 'Child age required'
                } as any
            ]
        };
        const config: ValidateConfig = { rules: [rule] };

        it('should validate items in list', async () => {
            const context: any = {
                data: {
                    children: [
                        { name: 'Alice', age: 10 },
                        { name: 'Bob' } // Missing age
                    ]
                },
                aliasMap: { children: 'step-list' }
            };

            const result = await runner.execute(config, context, createMockBlock());
            expect(result.success).toBe(false); // Bob fails
            expect(result.errors).toContain('Child age required');
            // Logic maps error to main list field currently
            expect(result.fieldErrors?.['step-list']).toBeDefined();
        });
    });

});


import { describe, it, expect, vi } from 'vitest';

import type { ValidateConfig, BlockContext, CompareRule, ConditionalRequiredRule, ForEachRule } from '@shared/types/blocks';

import { BlockRunner } from '../../server/services/BlockRunner';

// Mock dependencies to avoid loading real DB/Repositories
vi.mock('../../server/db', () => ({
    db: {},
    initializeDatabase: vi.fn(),
    dbInitPromise: Promise.resolve()
}));
vi.mock('../../server/repositories', () => ({
    workflowQueriesRepository: {},
    stepValueRepository: {}
}));
vi.mock('../../server/services/BlockService', () => ({ blockService: {} }));
vi.mock('../../server/services/TransformBlockService', () => ({ transformBlockService: {} }));
vi.mock('../../server/services/CollectionService', () => ({ collectionService: {} }));
vi.mock('../../server/services/RecordService', () => ({ recordService: {} }));
vi.mock('../../server/services/WorkflowService', () => ({ workflowService: {} }));
vi.mock('../../server/services/scripting/LifecycleHookService', () => ({ lifecycleHookService: {} }));
vi.mock('../../server/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('../../server/lib/queries/QueryRunner', () => ({ queryRunner: {} }));
vi.mock('../../server/lib/writes/WriteRunner', () => ({ writeRunner: {} }));
vi.mock('../../server/lib/external/ExternalSendRunner', () => ({ externalSendRunner: {} }));
vi.mock('../../server/services/analytics/AnalyticsService', () => ({ analyticsService: {} }));

describe('BlockRunner Validation Logic', () => {
    const runner = new BlockRunner();
    // Access private method
    const executeValidate = (runner as any).executeValidateBlock.bind(runner);

    it('should pass if no rules are present', () => {
        const config: ValidateConfig = { rules: [] };
        const context: any = { data: {}, aliasMap: {} };
        const result = executeValidate(config, context);
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

        it('should pass on valid comparison', () => {
            const context: any = { data: { age: 20 }, aliasMap: { age: 'step-1' } };
            const result = executeValidate(config, context);
            expect(result.success).toBe(true);
        });

        it('should fail on invalid comparison and map alias to ID', () => {
            const context: any = { data: { age: 10 }, aliasMap: { age: 'step-1' } };
            const result = executeValidate(config, context);
            expect(result.success).toBe(false);
            expect(result.errors).toContain('Must be over 18');
            expect(result.fieldErrors?.['step-1']).toContain('Must be over 18');
        });

        it('should compare with variable', () => {
            const varRule: CompareRule = { ...rule, rightType: 'variable', right: 'minAge' };
            const varConfig = { rules: [varRule] };

            const context: any = { data: { age: 20, minAge: 21 }, aliasMap: {} };
            const result = executeValidate(varConfig, context);
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

        it('should enforce requirement if condition met', () => {
            const context: any = {
                data: { married: 'yes', spouseName: '' },
                aliasMap: { spouseName: 'step-spouse' }
            };
            const result = executeValidate(config, context);
            expect(result.success).toBe(false);
            expect(result.fieldErrors?.['step-spouse']).toBeDefined();
        });

        it('should ignore requirement if condition not met', () => {
            const context: any = {
                data: { married: 'no', spouseName: '' },
                aliasMap: {}
            };
            const result = executeValidate(config, context);
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

        it('should validate items in list', () => {
            const context: any = {
                data: {
                    children: [
                        { name: 'Alice', age: 10 },
                        { name: 'Bob' } // Missing age
                    ]
                },
                aliasMap: { children: 'step-list' }
            };

            const result = executeValidate(config, context);
            expect(result.success).toBe(false); // Bob fails
            expect(result.errors).toContain('Child age required');
            // Logic maps error to main list field currently
            expect(result.fieldErrors?.['step-list']).toBeDefined();
        });
    });

});

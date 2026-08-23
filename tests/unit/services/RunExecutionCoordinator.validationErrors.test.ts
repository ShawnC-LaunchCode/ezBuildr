import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListConfig, ListValue } from '@shared/types/stepConfigs';

import { workflowRepository, workflowRunRepository } from '../../../server/repositories';
import { logicService } from '../../../server/services/LogicService';
import { RunExecutionCoordinator, type ExecutionContext } from '../../../server/services/runs/RunExecutionCoordinator';
import type { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';
import type { RunDefinition, RunDefinitionProvider, RunStep } from '../../../server/services/workflow-runs/RunDefinitionProvider';

vi.mock('../../../server/logger', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../server/logger')>();
    return {
        ...actual,
        logger: {
            ...actual.logger,
            warn: vi.fn(),
        },
    };
});

const ORIGINAL_VALIDATION_MODE = process.env.SERVER_FIELD_VALIDATION;
const CONTEXT: ExecutionContext = {
    workflowId: 'workflow-1',
    runId: 'run-1',
    userId: 'user-1',
    mode: 'live',
};

function makeStep(overrides: Partial<RunStep>): RunStep {
    return {
        id: 'step-1',
        workflowId: 'workflow-1',
        pageId: 'page-1',
        type: 'short_text',
        title: 'Question',
        description: null,
        required: false,
        alias: null,
        order: 0,
        isVirtual: false,
        config: null,
        visibleIf: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    } as RunStep;
}

function makeDefinition(step: RunStep): RunDefinition {
    return {
        sections: [],
        pages: [{
            id: 'page-1',
            workflowId: 'workflow-1',
            sectionId: null,
            title: 'Household',
            description: null,
            order: 0,
            visibleIf: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }],
        steps: [step],
        logicRules: [],
        source: 'live',
    } as RunDefinition;
}

function makeCoordinator(step: RunStep, values: Record<string, unknown>): RunExecutionCoordinator {
    const persistence = {
        bulkSaveValues: vi.fn().mockResolvedValue(undefined),
        getRunValues: vi.fn().mockResolvedValue(values),
    } as unknown as RunPersistenceWriter;
    const runRepository = {
        findById: vi.fn().mockResolvedValue({
            id: 'run-1',
            workflowId: 'workflow-1',
            workflowVersionId: null,
        }),
    } as unknown as typeof workflowRunRepository;
    const definitionProvider = {
        getDefinition: vi.fn().mockResolvedValue(makeDefinition(step)),
    } as unknown as RunDefinitionProvider;

    return new RunExecutionCoordinator(
        persistence,
        logicService,
        workflowRepository,
        runRepository,
        definitionProvider
    );
}

function makeListFixture(ages: number[]): { step: RunStep; value: ListValue } {
    const config: ListConfig = {
        fields: [{
            kind: 'question',
            id: 'age-field',
            alias: 'age',
            type: 'number',
            title: 'Age',
            order: 0,
            config: { min: 0, max: 17 },
        }],
    };
    const value: ListValue = {
        items: ages.map((age, index) => ({
            itemId: `child-${index + 1}`,
            values: { age },
        })),
    };

    return {
        step: makeStep({
            id: 'children-step',
            type: 'list',
            title: 'Children',
            alias: 'children',
            config: config as unknown as Record<string, unknown>,
        }),
        value,
    };
}

describe('RunExecutionCoordinator page-submit validation messages (LIST2-15)', () => {
    beforeEach(() => {
        process.env.SERVER_FIELD_VALIDATION = 'enforce';
    });

    afterEach(() => {
        if (ORIGINAL_VALIDATION_MODE === undefined) {
            delete process.env.SERVER_FIELD_VALIDATION;
        } else {
            process.env.SERVER_FIELD_VALIDATION = ORIGINAL_VALIDATION_MODE;
        }
    });

    it('identifies the failing list item and field path in the returned message (AC1)', async () => {
        const { step, value } = makeListFixture([18]);
        const coordinator = makeCoordinator(step, { [step.id]: value });

        const result = await coordinator.submitPage(CONTEXT, 'page-1', [
            { stepId: step.id, value },
        ]);

        expect(result).toEqual({
            success: false,
            errors: ['Children (children[0].age): Must be no more than 17'],
        });
    });

    it('returns distinguishable messages for the same field failing in two list items (AC2)', async () => {
        const { step, value } = makeListFixture([18, 19]);
        const coordinator = makeCoordinator(step, { [step.id]: value });

        const result = await coordinator.submitPage(CONTEXT, 'page-1', [
            { stepId: step.id, value },
        ]);

        expect(result).toEqual({
            success: false,
            errors: [
                'Children (children[0].age): Must be no more than 17',
                'Children (children[1].age): Must be no more than 17',
            ],
        });
    });

    it('keeps a real non-list validation message byte-identical (AC3)', async () => {
        const step = makeStep({
            id: 'nickname-step',
            title: 'Nickname',
            required: true,
        });
        const coordinator = makeCoordinator(step, {});

        const result = await coordinator.submitPage(CONTEXT, 'page-1', []);

        expect(result).toEqual({
            success: false,
            errors: ['Nickname: Nickname is required'],
        });
    });
});

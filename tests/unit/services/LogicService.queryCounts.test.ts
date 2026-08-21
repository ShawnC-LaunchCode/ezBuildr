import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { LogicRule, Section, Step, StepValue, WorkflowRun } from '@shared/schema';

import { LogicService } from '../../../server/services/LogicService';
import { RunDefinitionProvider } from '../../../server/services/workflow-runs/RunDefinitionProvider';
import { RunLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';

// RLS-5: the run/document path now opens tenant-scoped transactions via
// `withCurrentTenant` (server/utils/rlsContext.ts), which calls the real
// `db.transaction`. This suite calls those services directly rather than
// through HTTP, so `db` must be mocked or the chain throws "Database not
// initialized". The stub `tx` needs a working `execute` — that is what
// `applyTenantToTransaction` uses to set the GUC.
vi.mock("../../../server/db", () => {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  return {
    db: {
      ...tx,
      transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    },
    getDb: vi.fn(() => ({ ...tx })),
    initializeDatabase: vi.fn(),
  };
});


function makeSections(): Section[] {
    return Array.from({ length: 3 }, (_, index) => ({
        id: `section-${index + 1}`,
        workflowId: 'wf-1',
        title: `Section ${index + 1}`,
        order: index,
    })) as Section[];
}

function makeSteps(sections: Section[]): Step[] {
    return sections.flatMap((section) =>
        Array.from({ length: 4 }, (_, index) => ({
            id: `${section.id}-step-${index + 1}`,
            workflowId: 'wf-1',
            sectionId: section.id,
            type: 'short_text',
            title: `${section.title} Step ${index + 1}`,
            order: index,
            required: false,
            alias: `${section.id}_step_${index + 1}`,
            config: {},
            isVirtual: false,
        }))
    ) as Step[];
}

function makeRunValues(steps: Step[]): StepValue[] {
    return steps.map((step) => ({
        runId: 'run-1',
        stepId: step.id,
        value: `value-${step.id}`,
    })) as StepValue[];
}

describe('Logic query counts', () => {
    let sections: Section[];
    let steps: Step[];
    let runValues: StepValue[];
    let runData: Record<string, unknown>;
    let sectionRepo: { findByWorkflowId: ReturnType<typeof vi.fn> };
    let stepRepo: {
        findBySectionIds: ReturnType<typeof vi.fn>;
        findByWorkflowIdWithAliases: ReturnType<typeof vi.fn>;
    };
    let logicRuleRepo: { findByWorkflowId: ReturnType<typeof vi.fn> };
    let valueRepo: {
        findByRunId: ReturnType<typeof vi.fn>;
        getRunDataAsJson: ReturnType<typeof vi.fn>;
    };
    let runRepo: { findById: ReturnType<typeof vi.fn> };
    let logicSvc: LogicService;

    beforeEach(() => {
        sections = makeSections();
        steps = makeSteps(sections);
        runValues = makeRunValues(steps);
        runData = Object.fromEntries(runValues.map((value) => [value.stepId, value.value]));

        sectionRepo = {
            findByWorkflowId: vi.fn().mockResolvedValue(sections),
        };
        stepRepo = {
            findBySectionIds: vi.fn().mockResolvedValue(steps),
            findByWorkflowIdWithAliases: vi.fn().mockResolvedValue(steps),
        };
        logicRuleRepo = {
            findByWorkflowId: vi.fn().mockResolvedValue([] as LogicRule[]),
        };
        valueRepo = {
            findByRunId: vi.fn().mockResolvedValue(runValues),
            getRunDataAsJson: vi.fn().mockResolvedValue(runData),
        };
        // RVP-2: LogicService now resolves sections/steps/rules through
        // RunDefinitionProvider (RVP-1) rather than reading the live repos
        // directly. This run has no workflowVersionId, so the provider takes
        // its 'live' branch -- the same sectionRepo/stepRepo/logicRuleRepo
        // reads these tests already assert on, just one hop further away.
        runRepo = {
            findById: vi.fn().mockResolvedValue({
                id: 'run-1',
                workflowId: 'wf-1',
                workflowVersionId: null,
            } as WorkflowRun),
        };
        const definitionProvider = new RunDefinitionProvider(
            undefined,
            sectionRepo as unknown as ConstructorParameters<typeof RunDefinitionProvider>[1],
            stepRepo as unknown as ConstructorParameters<typeof RunDefinitionProvider>[2],
            logicRuleRepo as unknown as ConstructorParameters<typeof RunDefinitionProvider>[3]
        );

        logicSvc = new LogicService(
            runRepo as unknown as ConstructorParameters<typeof LogicService>[0],
            definitionProvider,
            valueRepo as unknown as ConstructorParameters<typeof LogicService>[2]
        );
    });

    it('determineStartSection builds one logic context for a multi-section workflow', async () => {
        const service = new RunLifecycleService(
            valueRepo as unknown as ConstructorParameters<typeof RunLifecycleService>[0],
            stepRepo as unknown as ConstructorParameters<typeof RunLifecycleService>[1],
            sectionRepo as unknown as ConstructorParameters<typeof RunLifecycleService>[2],
            {} as ConstructorParameters<typeof RunLifecycleService>[3],
            logicSvc
        );

        const result = await service.determineStartSection('run-1', 'wf-1');

        expect(result).toBe('section-3');
        expect(logicRuleRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(sectionRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(stepRepo.findBySectionIds).toHaveBeenCalledTimes(1);
        expect(stepRepo.findByWorkflowIdWithAliases).toHaveBeenCalledTimes(0);
        expect(valueRepo.findByRunId).toHaveBeenCalledTimes(1);
    });

    it('evaluateNavigation loads sections, steps, rules, and values at most once', async () => {
        await logicSvc.evaluateNavigation('wf-1', 'run-1', 'section-1');

        expect(sectionRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(stepRepo.findBySectionIds).toHaveBeenCalledTimes(1);
        expect(logicRuleRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(valueRepo.getRunDataAsJson).toHaveBeenCalledTimes(1);
    });

    it('validateCompletion loads sections, steps, rules, and values at most once', async () => {
        await logicSvc.validateCompletion('wf-1', 'run-1');

        expect(sectionRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(stepRepo.findBySectionIds).toHaveBeenCalledTimes(1);
        expect(logicRuleRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
        expect(valueRepo.getRunDataAsJson).toHaveBeenCalledTimes(1);
    });
});

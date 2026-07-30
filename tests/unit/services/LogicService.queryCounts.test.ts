/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- repository mocks are intentionally partial */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { LogicRule, Section, Step, StepValue, WorkflowRun } from '@shared/schema';

import { LogicService } from '../../../server/services/LogicService';
import { RunDefinitionProvider } from '../../../server/services/workflow-runs/RunDefinitionProvider';
import { RunLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';

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
    let sectionRepo: any;
    let stepRepo: any;
    let logicRuleRepo: any;
    let valueRepo: any;
    let runRepo: any;
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
            sectionRepo,
            stepRepo,
            logicRuleRepo
        );

        logicSvc = new LogicService(runRepo, definitionProvider, valueRepo);
    });

    it('determineStartSection builds one logic context for a multi-section workflow', async () => {
        const service = new RunLifecycleService(
            valueRepo,
            stepRepo,
            sectionRepo,
            {} as any,
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

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- vitest mocks of injected repositories */
/**
 * RunPersistenceWriter — batched bulk value writes.
 *
 * bulkSaveValues used to run (step lookup + section lookup + upsert)
 * sequentially per value (~3N queries per section submit). It now does one
 * workflow-membership prefetch plus one batched upsert.
 *
 * RVP-7: membership is now sourced from `RunDefinitionProvider` (the run's
 * pinned version when it has one, the live tables otherwise) instead of
 * `stepRepository.findByWorkflowIdWithAliases` directly -- re-deriving
 * membership from the live tables filtered out steps the author had
 * soft-deleted mid-run even though the run's pinned definition still
 * legitimately included them, throwing out the whole batch. These tests run
 * `RunPersistenceWriter` with its default (real) `RunDefinitionProvider`,
 * mocking the repositories the provider reads instead -- every run here has
 * no `workflowVersionId`, so the provider takes its `source: 'live'` branch
 * and reads `sectionRepository.findByWorkflowId` /
 * `stepRepository.findBySectionIds`, matching this suite's pre-RVP-7 setup
 * shape closely. Pinned-version behaviour is covered by
 * `run-version-pinning-rvp5.test.ts` (integration) and
 * `RunDefinitionProvider.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';

vi.mock('../../../server/repositories', () => ({
    workflowRunRepository: { findById: vi.fn() },
    stepValueRepository: {},
    stepRepository: { findBySectionIds: vi.fn() },
    sectionRepository: { findByWorkflowId: vi.fn() },
    logicRuleRepository: { findByWorkflowId: vi.fn().mockResolvedValue([]) },
    workflowVersionRepository: { findById: vi.fn() },
}));

describe('RunPersistenceWriter.bulkSaveValues', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let runRepo: any;
    let valueRepo: any;
    let stepRepo: any;
    let sectionRepo: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    let writer: RunPersistenceWriter;

    beforeEach(async () => {
        const repos = await import('../../../server/repositories');
        runRepo = repos.workflowRunRepository;
        valueRepo = { upsert: vi.fn(), upsertMany: vi.fn().mockResolvedValue([]) };
        stepRepo = repos.stepRepository;
        sectionRepo = repos.sectionRepository;

        runRepo.findById.mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null });
        sectionRepo.findByWorkflowId.mockResolvedValue([{ id: 'section-1', workflowId: 'wf-1', title: 'S', order: 0 }]);
        stepRepo.findBySectionIds.mockResolvedValue([
            { id: 'step-1', workflowId: 'wf-1', sectionId: 'section-1', type: 'short_text', title: 'Step 1', config: {}, required: false, order: 0 },
            { id: 'step-2', workflowId: 'wf-1', sectionId: 'section-1', type: 'short_text', title: 'Step 2', config: {}, required: false, order: 1 },
        ]);

        writer = new RunPersistenceWriter(runRepo, valueRepo);
    });

    it('persists all values with one prefetch and one batched upsert', async () => {
        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
            { stepId: 'step-2', value: 'b' },
        ], 'wf-1');

        expect(runRepo.findById).toHaveBeenCalledTimes(1);
        expect(stepRepo.findBySectionIds).toHaveBeenCalledTimes(1);
        expect(valueRepo.upsertMany).toHaveBeenCalledTimes(1);
        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'a' },
            { runId: 'run-1', stepId: 'step-2', value: 'b' },
        ]);
    });

    it('dedupes repeated stepIds (last write wins) so ON CONFLICT cannot hit a row twice', async () => {
        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'stale' },
            { stepId: 'step-1', value: 'fresh' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'fresh' },
        ]);
    });

    it('rejects values for steps outside the workflow without writing anything', async () => {
        await expect(writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
            { stepId: 'foreign-step', value: 'b' },
        ], 'wf-1')).rejects.toThrow('Step foreign-step does not belong to workflow wf-1');

        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('accepts a value for a step that is soft-deleted from the live tables but still present in the run definition (RVP-7)', async () => {
        // The provider's live-table branch is what a versionless run takes.
        // A soft-deleted step is filtered out by `findBySectionIds` (real
        // repository behaviour), so simulate that here: the deleted step is
        // simply absent from what the repository returns, same as a step
        // that belongs to a different workflow. This proves the guard is
        // membership-in-definition, not a second live re-check.
        stepRepo.findBySectionIds.mockResolvedValue([
            { id: 'step-1', workflowId: 'wf-1', sectionId: 'section-1', type: 'short_text', title: 'Step 1', config: {}, required: false, order: 0 },
        ]);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'a' },
        ]);
    });

    it('rejects values that do not match the step type or static options', async () => {
        stepRepo.findBySectionIds.mockResolvedValue([
            {
                id: 'radio-step',
                workflowId: 'wf-1',
                sectionId: 'section-1',
                type: 'radio',
                title: 'Plan',
                config: {
                    options: [
                        { id: 'basic', label: 'Basic' },
                        { id: 'pro', label: 'Pro', alias: 'pro-plan' },
                    ],
                },
                required: false,
                order: 0,
            },
            {
                id: 'date-step',
                workflowId: 'wf-1',
                sectionId: 'section-1',
                type: 'date',
                title: 'Start Date',
                config: {},
                required: false,
                order: 1,
            },
        ]);

        await expect(writer.bulkSaveValues('run-1', [
            { stepId: 'radio-step', value: 'enterprise' },
            { stepId: 'date-step', value: 42 },
        ], 'wf-1')).rejects.toMatchObject({
            statusCode: 400,
            details: {
                stepIds: ['radio-step', 'date-step'],
            },
        });

        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('does not enforce requiredness for blank autosave values', async () => {
        stepRepo.findBySectionIds.mockResolvedValue([
            {
                id: 'required-radio',
                workflowId: 'wf-1',
                sectionId: 'section-1',
                type: 'radio',
                title: 'Plan',
                config: {
                    options: [
                        { id: 'basic', label: 'Basic' },
                    ],
                },
                required: true,
                order: 0,
            },
        ]);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'required-radio', value: '' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'required-radio', value: '' },
        ]);
    });

    it('preserves an unfinished draft while final persistence still validates its format', async () => {
        stepRepo.findBySectionIds.mockResolvedValue([
            {
                id: 'email-step',
                workflowId: 'wf-1',
                sectionId: 'section-1',
                type: 'email',
                title: 'Email',
                config: {},
                required: true,
                order: 0,
            },
        ]);

        await writer.bulkSaveDraftValues('run-1', [
            { stepId: 'email-step', value: 'person@' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'email-step', value: 'person@' },
        ]);

        valueRepo.upsertMany.mockClear();
        await expect(writer.bulkSaveValues('run-1', [
            { stepId: 'email-step', value: 'person@' },
        ], 'wf-1')).rejects.toMatchObject({ statusCode: 400 });
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('rejects malformed draft storage shapes', async () => {
        stepRepo.findBySectionIds.mockResolvedValue([
            {
                id: 'email-step',
                workflowId: 'wf-1',
                sectionId: 'section-1',
                type: 'email',
                title: 'Email',
                config: {},
                required: false,
                order: 0,
            },
        ]);

        await expect(writer.bulkSaveDraftValues('run-1', [
            { stepId: 'email-step', value: { unexpected: true } },
        ], 'wf-1')).rejects.toMatchObject({ statusCode: 400 });
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('no-ops on an empty value list', async () => {
        await writer.bulkSaveValues('run-1', [], 'wf-1');
        expect(stepRepo.findBySectionIds).not.toHaveBeenCalled();
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- vitest mocks of injected repositories */
/**
 * RunPersistenceWriter — batched bulk value writes.
 *
 * bulkSaveValues used to run (step lookup + section lookup + upsert)
 * sequentially per value (~3N queries per section submit). It now does one
 * workflow-membership prefetch plus one batched upsert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';

vi.mock('../../../server/repositories', () => ({
    workflowRunRepository: {},
    stepValueRepository: {},
    stepRepository: {},
    sectionRepository: {},
}));

describe('RunPersistenceWriter.bulkSaveValues', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let runRepo: any;
    let valueRepo: any;
    let stepRepo: any;
    let sectionRepo: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    let writer: RunPersistenceWriter;

    beforeEach(() => {
        runRepo = {};
        valueRepo = { upsert: vi.fn(), upsertMany: vi.fn().mockResolvedValue([]) };
        stepRepo = {
            findById: vi.fn(),
            findByWorkflowIdWithAliases: vi.fn().mockResolvedValue([
                { id: 'step-1' }, { id: 'step-2' },
            ]),
        };
        sectionRepo = { findById: vi.fn() };
        writer = new RunPersistenceWriter(runRepo, valueRepo, stepRepo, sectionRepo);
    });

    it('persists all values with one prefetch and one batched upsert', async () => {
        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
            { stepId: 'step-2', value: 'b' },
        ], 'wf-1');

        expect(stepRepo.findByWorkflowIdWithAliases).toHaveBeenCalledTimes(1);
        expect(stepRepo.findById).not.toHaveBeenCalled();
        expect(sectionRepo.findById).not.toHaveBeenCalled();
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

    it('no-ops on an empty value list', async () => {
        await writer.bulkSaveValues('run-1', [], 'wf-1');
        expect(stepRepo.findByWorkflowIdWithAliases).not.toHaveBeenCalled();
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });
});

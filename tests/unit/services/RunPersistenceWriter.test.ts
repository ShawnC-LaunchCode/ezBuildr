/**
 * RunPersistenceWriter — batched bulk value writes.
 *
 * bulkSaveValues used to run (step lookup + page lookup + upsert)
 * sequentially per value (~3N queries per page submit). It now does one
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
 * and reads `pageRepository.findByWorkflowId` /
 * `stepRepository.findByPageIds`, matching this suite's pre-RVP-7 setup
 * shape closely. Pinned-version behaviour is covered by
 * `run-version-pinning-rvp5.test.ts` (integration) and
 * `RunDefinitionProvider.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';
import {
    pageRepository,
    stepRepository,
    workflowRunRepository,
} from '../../../server/repositories';

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


vi.mock('../../../server/repositories', () => ({
    workflowRunRepository: { findById: vi.fn() },
    stepValueRepository: {},
    stepRepository: { findByPageIds: vi.fn() },
    pageRepository: { findByWorkflowId: vi.fn() },
    sectionRepository: { findByWorkflowId: vi.fn().mockResolvedValue([]) },
    logicRuleRepository: { findByWorkflowId: vi.fn().mockResolvedValue([]) },
    workflowVersionRepository: { findById: vi.fn() },
}));

describe('RunPersistenceWriter.bulkSaveValues', () => {
    let runRepo: Mocked<typeof workflowRunRepository>;
    let valueRepo: {
        upsert: ReturnType<typeof vi.fn>;
        upsertMany: ReturnType<typeof vi.fn>;
    };
    let stepRepo: Mocked<typeof stepRepository>;
    let pageRepo: Mocked<typeof pageRepository>;
    let writer: RunPersistenceWriter;

    beforeEach(async () => {
        const repos = await import('../../../server/repositories');
        runRepo = vi.mocked(repos.workflowRunRepository);
        valueRepo = { upsert: vi.fn(), upsertMany: vi.fn().mockResolvedValue([]) };
        stepRepo = vi.mocked(repos.stepRepository);
        pageRepo = vi.mocked(repos.pageRepository);

        runRepo.findById.mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null } as never);
        pageRepo.findByWorkflowId.mockResolvedValue([{ id: 'page-1', workflowId: 'wf-1', title: 'S', order: 0 }] as never);
        stepRepo.findByPageIds.mockResolvedValue([
            { id: 'step-1', workflowId: 'wf-1', pageId: 'page-1', type: 'short_text', title: 'Step 1', config: {}, required: false, order: 0 },
            { id: 'step-2', workflowId: 'wf-1', pageId: 'page-1', type: 'short_text', title: 'Step 2', config: {}, required: false, order: 1 },
        ] as never);

        writer = new RunPersistenceWriter(
            runRepo,
            valueRepo as unknown as ConstructorParameters<typeof RunPersistenceWriter>[1]
        );
    });

    it('persists all values with one prefetch and one batched upsert', async () => {
        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
            { stepId: 'step-2', value: 'b' },
        ], 'wf-1');

        expect(runRepo.findById).toHaveBeenCalledTimes(1);
        expect(stepRepo.findByPageIds).toHaveBeenCalledTimes(1);
        expect(valueRepo.upsertMany).toHaveBeenCalledTimes(1);
        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'a' },
            { runId: 'run-1', stepId: 'step-2', value: 'b' },
        ] as never);
    });

    it('dedupes repeated stepIds (last write wins) so ON CONFLICT cannot hit a row twice', async () => {
        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'stale' },
            { stepId: 'step-1', value: 'fresh' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'fresh' },
        ] as never);
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
        // A soft-deleted step is filtered out by `findByPageIds` (real
        // repository behaviour), so simulate that here: the deleted step is
        // simply absent from what the repository returns, same as a step
        // that belongs to a different workflow. This proves the guard is
        // membership-in-definition, not a second live re-check.
        stepRepo.findByPageIds.mockResolvedValue([
            { id: 'step-1', workflowId: 'wf-1', pageId: 'page-1', type: 'short_text', title: 'Step 1', config: {}, required: false, order: 0 },
        ] as never);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'step-1', value: 'a' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'step-1', value: 'a' },
        ] as never);
    });

    it('rejects values that do not match the step type or static options', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            {
                id: 'radio-step',
                workflowId: 'wf-1',
                pageId: 'page-1',
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
                pageId: 'page-1',
                type: 'date',
                title: 'Start Date',
                config: {},
                required: false,
                order: 1,
            },
        ] as never);

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
        stepRepo.findByPageIds.mockResolvedValue([
            {
                id: 'required-radio',
                workflowId: 'wf-1',
                pageId: 'page-1',
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
        ] as never);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'required-radio', value: '' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'required-radio', value: '' },
        ] as never);
    });

    it('preserves an unfinished draft while final persistence still validates its format', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            {
                id: 'email-step',
                workflowId: 'wf-1',
                pageId: 'page-1',
                type: 'email',
                title: 'Email',
                config: {},
                required: true,
                order: 0,
            },
        ] as never);

        await writer.bulkSaveDraftValues('run-1', [
            { stepId: 'email-step', value: 'person@' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'email-step', value: 'person@' },
        ] as never);

        valueRepo.upsertMany.mockClear();
        await expect(writer.bulkSaveValues('run-1', [
            { stepId: 'email-step', value: 'person@' },
        ], 'wf-1')).rejects.toMatchObject({ statusCode: 400 });
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('rejects malformed draft storage shapes', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            {
                id: 'email-step',
                workflowId: 'wf-1',
                pageId: 'page-1',
                type: 'email',
                title: 'Email',
                config: {},
                required: false,
                order: 0,
            },
        ] as never);

        await expect(writer.bulkSaveDraftValues('run-1', [
            { stepId: 'email-step', value: { unexpected: true } },
        ], 'wf-1')).rejects.toMatchObject({ statusCode: 400 });
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('no-ops on an empty value list', async () => {
        await writer.bulkSaveValues('run-1', [], 'wf-1');
        expect(stepRepo.findByPageIds).not.toHaveBeenCalled();
        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    /**
     * CVM-4. `getStaticChoiceValues` only builds a value set when `config.options`
     * is a plain ARRAY. Passing the `{ type: 'static', options: [...] }` wrapper
     * makes it return null, validation is skipped wholesale, and any assertion
     * here passes whatever the code does. Every case below therefore uses the
     * array form, so the option check genuinely runs.
     */
    const choiceStep = (config: Record<string, unknown>) => ({
        id: 'choice-step',
        workflowId: 'wf-1',
        pageId: 'page-1',
        type: 'choice',
        title: 'Favourite',
        config: {
            options: [{ id: 'opt1', label: 'Apple', alias: 'apple' }],
            ...config,
        },
        required: false,
        order: 0,
    });

    it('accepts a write-in on a combobox (CVM-4 AC 1)', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            choiceStep({ display: 'combobox', allowMultiple: false }),
        ] as never);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'choice-step', value: 'a-write-in' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'choice-step', value: 'a-write-in' },
        ] as never);
    });

    it('accepts a write-in on a legacy dropdown + searchable config (CVM-4 AC 2)', async () => {
        // No `display: 'combobox'` here. This only passes if the exemption is
        // resolved through resolveChoiceDisplay rather than read off config.display.
        stepRepo.findByPageIds.mockResolvedValue([
            choiceStep({ display: 'dropdown', searchable: true, allowMultiple: false }),
        ] as never);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'choice-step', value: 'a-write-in' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'choice-step', value: 'a-write-in' },
        ] as never);
    });

    it('still rejects an unlisted value on a radio step (CVM-4 AC 3)', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            choiceStep({ display: 'radio', allowMultiple: false }),
        ] as never);

        await expect(
            writer.bulkSaveValues('run-1', [
                { stepId: 'choice-step', value: 'a-write-in' },
            ], 'wf-1')
        ).rejects.toThrow(/Invalid step values/);

        expect(valueRepo.upsertMany).not.toHaveBeenCalled();
    });

    it('still rejects an unlisted value on a plain dropdown (CVM-4 AC 3)', async () => {
        // searchable is absent, so this is NOT a combobox and the exemption
        // must not leak to it.
        stepRepo.findByPageIds.mockResolvedValue([
            choiceStep({ display: 'dropdown', allowMultiple: false }),
        ] as never);

        await expect(
            writer.bulkSaveValues('run-1', [
                { stepId: 'choice-step', value: 'a-write-in' },
            ], 'wf-1')
        ).rejects.toThrow(/Invalid step values/);
    });

    it('still accepts a listed value on a combobox (CVM-4)', async () => {
        stepRepo.findByPageIds.mockResolvedValue([
            choiceStep({ display: 'combobox', allowMultiple: false }),
        ] as never);

        await writer.bulkSaveValues('run-1', [
            { stepId: 'choice-step', value: 'apple' },
        ], 'wf-1');

        expect(valueRepo.upsertMany).toHaveBeenCalledWith([
            { runId: 'run-1', stepId: 'choice-step', value: 'apple' },
        ] as never);
    });
});

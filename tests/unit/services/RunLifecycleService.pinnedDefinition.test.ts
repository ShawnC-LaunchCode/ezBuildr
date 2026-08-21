/**
 * RunLifecycleService.determineStartSection — pinned-definition sourcing
 * (RVP-4, AC1).
 *
 * `determineStartSection` builds its LogicContext via
 * `LogicService.buildContext`, which RVP-2 already sourced from the run's
 * pinned definition (`RunDefinitionProvider`, RVP-1). This test proves that
 * plumbing actually reaches `determineStartSection`: a pinned run's start
 * section is resolved from the version's graph, not the live
 * sections/steps tables, and a versionless run still falls back to the live
 * tables unchanged (AC3).
 */
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowRun } from '@shared/schema';

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


const RUN_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const PINNED_SECTION_ID = '44444444-4444-4444-8444-444444444444';
const PINNED_STEP_ID = '55555555-5555-4555-8555-555555555555';
// Exists only in the live tables -- simulates an author reorganising sections
// after the respondent's run started.
const LIVE_ONLY_SECTION_ID = '66666666-6666-4666-8666-666666666666';

function makePinnedRun(): WorkflowRun {
  return { id: RUN_ID, workflowId: WORKFLOW_ID, workflowVersionId: VERSION_ID } as WorkflowRun;
}

function makeVersionlessRun(): WorkflowRun {
  return { id: RUN_ID, workflowId: WORKFLOW_ID, workflowVersionId: null } as WorkflowRun;
}

function makeHarness() {
  const versionRepo = {
    findById: vi.fn().mockResolvedValue({
      id: VERSION_ID,
      workflowId: WORKFLOW_ID,
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      graphJson: {
        title: 'Pinned interview',
        sections: [{
          id: PINNED_SECTION_ID,
          title: 'Pinned section',
          order: 0,
          steps: [
            { id: PINNED_STEP_ID, type: 'short_text', title: 'Pinned required step', order: 0, required: true },
          ],
        }],
        logicRules: [] as unknown[],
      },
    }),
  };
  // Live tables carry a DIFFERENT section than the pinned graph. If
  // determineStartSection ever fell back to reading these for a pinned run,
  // it would land on this section instead of the pinned one.
  const sectionRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([
      { id: LIVE_ONLY_SECTION_ID, workflowId: WORKFLOW_ID, title: 'Live-only section', order: 0, createdAt: new Date() },
    ]),
  };
  const stepRepo = {
    findBySectionIds: vi.fn().mockResolvedValue([]),
  };
  const logicRuleRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([]),
  };
  const runRepo = { findById: vi.fn() };
  const valueRepoForLogic = { getRunDataAsJson: vi.fn().mockResolvedValue({}) };
  const valueRepoForLifecycle = { findByRunId: vi.fn().mockResolvedValue([]) };

  const definitionProvider = new RunDefinitionProvider(
    versionRepo as never,
    sectionRepo as never,
    stepRepo as never,
    logicRuleRepo as never,
  );
  const logicSvc = new LogicService(runRepo as never, definitionProvider, valueRepoForLogic as never);
  const lifecycleSvc = new RunLifecycleService(
    valueRepoForLifecycle as never,
    stepRepo as never,
    sectionRepo as never,
    {} as never,
    logicSvc,
  );

  return { lifecycleSvc, runRepo, sectionRepo, stepRepo };
}

describe('RunLifecycleService.determineStartSection pinned-definition sourcing (RVP-4)', () => {
  it('AC1: resolves the start section from the pinned graph, not the live tables', async () => {
    const { lifecycleSvc, runRepo, sectionRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makePinnedRun());

    const result = await lifecycleSvc.determineStartSection(RUN_ID, WORKFLOW_ID);

    expect(result).toBe(PINNED_SECTION_ID);
    expect(sectionRepo.findByWorkflowId).not.toHaveBeenCalled();
  });

  it('editing the live workflow after the run started does not change the result', async () => {
    const { lifecycleSvc, runRepo, sectionRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makePinnedRun());

    const before = await lifecycleSvc.determineStartSection(RUN_ID, WORKFLOW_ID);

    // Simulate a further live edit landing between requests -- adding a
    // brand new section that would change the answer if it were consulted.
    sectionRepo.findByWorkflowId.mockResolvedValue([
      { id: 'brand-new-section', workflowId: WORKFLOW_ID, title: 'Another edit', order: 0, createdAt: new Date() },
    ]);

    const after = await lifecycleSvc.determineStartSection(RUN_ID, WORKFLOW_ID);

    expect(after).toBe(before);
  });

  it('AC3: a versionless run still resolves from the live tables (unchanged today-behavior)', async () => {
    const { lifecycleSvc, runRepo, sectionRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makeVersionlessRun());

    const result = await lifecycleSvc.determineStartSection(RUN_ID, WORKFLOW_ID);

    expect(result).toBe(LIVE_ONLY_SECTION_ID);
    expect(sectionRepo.findByWorkflowId).toHaveBeenCalledWith(WORKFLOW_ID, expect.anything());
  });
});

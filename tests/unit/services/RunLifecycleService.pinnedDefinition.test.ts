/**
 * RunLifecycleService.determineStartPage — pinned-definition sourcing
 * (RVP-4, AC1).
 *
 * `determineStartPage` builds its LogicContext via
 * `LogicService.buildContext`, which RVP-2 already sourced from the run's
 * pinned definition (`RunDefinitionProvider`, RVP-1). This test proves that
 * plumbing actually reaches `determineStartPage`: a pinned run's start
 * page is resolved from the version's graph, not the live
 * pages/steps tables, and a versionless run still falls back to the live
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
const PINNED_PAGE_ID = '44444444-4444-4444-8444-444444444444';
const PINNED_STEP_ID = '55555555-5555-4555-8555-555555555555';
// Exists only in the live tables -- simulates an author reorganising pages
// after the respondent's run started.
const LIVE_ONLY_PAGE_ID = '66666666-6666-4666-8666-666666666666';

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
        pages: [{
          id: PINNED_PAGE_ID,
          title: 'Pinned page',
          order: 0,
          steps: [
            { id: PINNED_STEP_ID, type: 'short_text', title: 'Pinned required step', order: 0, required: true },
          ],
        }],
        logicRules: [] as unknown[],
      },
    }),
  };
  // Live tables carry a DIFFERENT page than the pinned graph. If
  // determineStartPage ever fell back to reading these for a pinned run,
  // it would land on this page instead of the pinned one.
  const pageRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([
      { id: LIVE_ONLY_PAGE_ID, workflowId: WORKFLOW_ID, title: 'Live-only page', order: 0, createdAt: new Date() },
    ]),
  };
  const stepRepo = {
    findByPageIds: vi.fn().mockResolvedValue([]),
  };
  const logicRuleRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([]),
  };
  const runRepo = { findById: vi.fn() };
  const valueRepoForLogic = { getRunDataAsJson: vi.fn().mockResolvedValue({}) };
  const valueRepoForLifecycle = { findByRunId: vi.fn().mockResolvedValue([]) };

  const definitionProvider = new RunDefinitionProvider(
    versionRepo as never,
    pageRepo as never,
    stepRepo as never,
    logicRuleRepo as never,
  );
  const logicSvc = new LogicService(runRepo as never, definitionProvider, valueRepoForLogic as never);
  const lifecycleSvc = new RunLifecycleService(
    valueRepoForLifecycle as never,
    stepRepo as never,
    pageRepo as never,
    {} as never,
    logicSvc,
  );

  return { lifecycleSvc, runRepo, pageRepo, stepRepo };
}

describe('RunLifecycleService.determineStartPage pinned-definition sourcing (RVP-4)', () => {
  it('AC1: resolves the start page from the pinned graph, not the live tables', async () => {
    const { lifecycleSvc, runRepo, pageRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makePinnedRun());

    const result = await lifecycleSvc.determineStartPage(RUN_ID, WORKFLOW_ID);

    expect(result).toBe(PINNED_PAGE_ID);
    expect(pageRepo.findByWorkflowId).not.toHaveBeenCalled();
  });

  it('editing the live workflow after the run started does not change the result', async () => {
    const { lifecycleSvc, runRepo, pageRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makePinnedRun());

    const before = await lifecycleSvc.determineStartPage(RUN_ID, WORKFLOW_ID);

    // Simulate a further live edit landing between requests -- adding a
    // brand new page that would change the answer if it were consulted.
    pageRepo.findByWorkflowId.mockResolvedValue([
      { id: 'brand-new-page', workflowId: WORKFLOW_ID, title: 'Another edit', order: 0, createdAt: new Date() },
    ]);

    const after = await lifecycleSvc.determineStartPage(RUN_ID, WORKFLOW_ID);

    expect(after).toBe(before);
  });

  it('AC3: a versionless run still resolves from the live tables (unchanged today-behavior)', async () => {
    const { lifecycleSvc, runRepo, pageRepo } = makeHarness();
    runRepo.findById.mockResolvedValue(makeVersionlessRun());

    const result = await lifecycleSvc.determineStartPage(RUN_ID, WORKFLOW_ID);

    expect(result).toBe(LIVE_ONLY_PAGE_ID);
    expect(pageRepo.findByWorkflowId).toHaveBeenCalledWith(WORKFLOW_ID, expect.anything());
  });
});

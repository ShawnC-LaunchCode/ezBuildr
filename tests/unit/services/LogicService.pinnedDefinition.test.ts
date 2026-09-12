/**
 * LogicService — pinned-definition regression tests (RVP-2).
 *
 * Before this ticket, `evaluateNavigation` and `validateCompletion` always
 * re-read the LIVE `pages`/`steps`/`logic_rules` tables, even for a run
 * pinned to a version (`workflowVersionId` set). That meant an author
 * editing a published workflow retroactively changed what an in-flight
 * respondent's run was validated against. The worst case: a required
 * question added to the live workflow after a respondent started was never
 * shown to them, but `validateCompletion` demanded it anyway and permanently
 * blocked their submission with "Missing required steps: <title>" -- see
 * tickets/RUN_VERSION_PINNING_TICKETS.md, "consequence 2".
 *
 * These tests exercise the real `RunDefinitionProvider` (RVP-1) wired into a
 * real `LogicService` (not a mocked provider) so the assertions prove the
 * pinned graph is actually consulted instead of the live tables, and that a
 * versionless run still falls back to the live tables unchanged (AC3).
 */
import { describe, expect, it, vi } from 'vitest';

import type { LogicRule, WorkflowRun } from '@shared/schema';

import { LogicService } from '../../../server/services/LogicService';
import { RunDefinitionProvider } from '../../../server/services/workflow-runs/RunDefinitionProvider';
import {
  SECTION_MATRIX_RUN_ID,
  SECTION_MATRIX_VERSION_ID,
  SECTION_MATRIX_WORKFLOW_ID,
  sectionPageVisibilityCases,
  sectionPageVisibilityFixture,
} from '../../fixtures/sectionVisibilityMatrix';
import { buildTestWhen } from '../../helpers/conditionFixtures';

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
// A step that exists only in the LIVE tables -- simulates an author adding a
// required question to the workflow after the respondent's run started.
const LIVE_ONLY_REQUIRED_STEP_ID = '66666666-6666-4666-8666-666666666666';
const LIVE_ONLY_PAGE_ID = '77777777-7777-4777-8777-777777777777';
const PINNED_SECTION_ID = '88888888-8888-4888-8888-888888888888';
const PINNED_SECTION_PAGE_ID = '99999999-9999-4999-8999-999999999999';

function makePinnedRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: RUN_ID,
    workflowId: WORKFLOW_ID,
    workflowVersionId: VERSION_ID,
    ...overrides,
  } as WorkflowRun;
}

function makeVersionlessRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: RUN_ID,
    workflowId: WORKFLOW_ID,
    workflowVersionId: null,
    ...overrides,
  } as WorkflowRun;
}

/**
 * Live tables include an EXTRA page + required step that is NOT part of
 * the pinned version's graph -- this is the "author added a required
 * question mid-run" scenario. If a pinned run's evaluateNavigation/
 * validateCompletion ever fell back to reading these, the tests below would
 * fail (the live-only step would leak into requiredSteps/missingSteps).
 */
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
  const pageRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([
      { id: PINNED_PAGE_ID, workflowId: WORKFLOW_ID, title: 'Pinned page (edited live)', order: 0, createdAt: new Date() },
      { id: LIVE_ONLY_PAGE_ID, workflowId: WORKFLOW_ID, title: 'New page added mid-run', order: 1, createdAt: new Date() },
    ]),
  };
  const stepRepo = {
    findByPageIds: vi.fn().mockResolvedValue([
      { id: PINNED_STEP_ID, workflowId: WORKFLOW_ID, pageId: PINNED_PAGE_ID, type: 'short_text', title: 'Pinned required step', required: true, order: 0, isVirtual: false, createdAt: new Date(), updatedAt: new Date() },
      { id: LIVE_ONLY_REQUIRED_STEP_ID, workflowId: WORKFLOW_ID, pageId: LIVE_ONLY_PAGE_ID, type: 'short_text', title: 'New required step added mid-run', required: true, order: 0, isVirtual: false, createdAt: new Date(), updatedAt: new Date() },
    ]),
  };
  const logicRuleRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([] as LogicRule[]),
  };
  const sectionRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue([]),
  };
  const runRepo = {
    findById: vi.fn(),
  };
  const valueRepo = {
    getRunDataAsJson: vi.fn().mockResolvedValue({ [PINNED_STEP_ID]: 'answered' }),
  };

  const definitionProvider = new RunDefinitionProvider(
    versionRepo as never,
    pageRepo as never,
    stepRepo as never,
    logicRuleRepo as never,
    sectionRepo as never,
  );
  const logicSvc = new LogicService(runRepo as never, definitionProvider, valueRepo as never);

  return { logicSvc, runRepo, pageRepo, stepRepo, logicRuleRepo, versionRepo, valueRepo };
}

function makeSectionMatrixService(data: Record<string, unknown>): LogicService {
  const createdAt = new Date('2026-08-24T00:00:00.000Z');
  const versionRepo = {
    findById: vi.fn().mockResolvedValue({
      id: SECTION_MATRIX_VERSION_ID,
      workflowId: SECTION_MATRIX_WORKFLOW_ID,
      createdAt,
      graphJson: {
        title: 'SECT-7 parity fixture',
        sections: sectionPageVisibilityFixture.sections,
        pages: sectionPageVisibilityFixture.pages,
        logicRules: sectionPageVisibilityFixture.rules,
      },
    }),
  };
  const definitionProvider = new RunDefinitionProvider(
    versionRepo as never,
    { findByWorkflowId: vi.fn() } as never,
    { findByPageIds: vi.fn() } as never,
    { findByWorkflowId: vi.fn() } as never,
    { findByWorkflowId: vi.fn() } as never,
  );
  const runRepo = {
    findById: vi.fn().mockResolvedValue({
      id: SECTION_MATRIX_RUN_ID,
      workflowId: SECTION_MATRIX_WORKFLOW_ID,
      workflowVersionId: SECTION_MATRIX_VERSION_ID,
    } as WorkflowRun),
  };
  const valueRepo = { getRunDataAsJson: vi.fn().mockResolvedValue(data) };
  return new LogicService(runRepo as never, definitionProvider, valueRepo as never);
}

describe('LogicService pinned-definition sourcing (RVP-2)', () => {
  describe('SECT-7 shared Section/page visibility matrix', () => {
    it.each(sectionPageVisibilityCases)(
      'returns the exact shared page set for section=$sectionVisible/page=$pageVisible',
      async ({ data, expectedVisiblePageIds }) => {
        const logicSvc = makeSectionMatrixService(data);

        const navigation = await logicSvc.evaluateNavigation(
          SECTION_MATRIX_WORKFLOW_ID,
          SECTION_MATRIX_RUN_ID,
          null,
        );

        expect(navigation.visiblePages).toEqual(expectedVisiblePageIds);
      },
    );
  });

  describe('a run pinned to a version (AC1)', () => {
    it('evaluateNavigation resolves requiredSteps from the pinned graph, not the live tables', async () => {
      const { logicSvc, runRepo, pageRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makePinnedRun());

      const navigation = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);

      expect(navigation.requiredSteps).toEqual([PINNED_STEP_ID]);
      expect(navigation.requiredSteps).not.toContain(LIVE_ONLY_REQUIRED_STEP_ID);
      expect(navigation.visiblePages).toEqual([PINNED_PAGE_ID]);
      expect(navigation.visiblePages).not.toContain(LIVE_ONLY_PAGE_ID);
      // The live tables must not even be touched for a pinned run.
      expect(pageRepo.findByWorkflowId).not.toHaveBeenCalled();
    });

    it('editing the live workflow does not change navigation for the pinned run', async () => {
      const { logicSvc, runRepo, pageRepo, stepRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makePinnedRun());

      const before = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);

      // Simulate a further live edit landing between requests.
      pageRepo.findByWorkflowId.mockResolvedValue([
        { id: 'brand-new-page', workflowId: WORKFLOW_ID, title: 'Another edit', order: 0, createdAt: new Date() },
      ]);
      stepRepo.findByPageIds.mockResolvedValue([]);

      const after = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);

      expect(after).toEqual(before);
    });

    it('evaluates Section visibility from the pinned graph rather than live Sections', async () => {
      const { logicSvc, runRepo, versionRepo, pageRepo, valueRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makePinnedRun());
      versionRepo.findById.mockResolvedValue({
        id: VERSION_ID,
        workflowId: WORKFLOW_ID,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        graphJson: {
          title: 'Pinned interview',
          sections: [{ id: PINNED_SECTION_ID, title: 'Pinned Section', visibleIf: buildTestWhen('controller', 'is_true') }],
          pages: [
            {
              id: PINNED_PAGE_ID,
              sectionId: null,
              title: 'Controller',
              order: 0,
              steps: [{ id: PINNED_STEP_ID, type: 'yes_no', title: 'Controller', alias: 'controller', order: 0 }],
            },
            { id: PINNED_SECTION_PAGE_ID, sectionId: PINNED_SECTION_ID, title: 'Pinned member', order: 1, steps: [] },
          ],
          logicRules: [],
        },
      } as never);
      // A pinned run must not consult these live rows at all.
      pageRepo.findByWorkflowId.mockResolvedValue([]);

      const hidden = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);
      expect(hidden.visiblePages).toEqual([PINNED_PAGE_ID]);

      // Keep this assertion on the same service/provider instance and change only run data.
      valueRepo.getRunDataAsJson.mockResolvedValue({ [PINNED_STEP_ID]: true });
      const shown = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);
      expect(shown.visiblePages).toEqual([PINNED_PAGE_ID, PINNED_SECTION_PAGE_ID]);
      expect(pageRepo.findByWorkflowId).not.toHaveBeenCalled();
    });
  });

  describe('a required step added live after the run started (AC2 -- the point of this ticket)', () => {
    it('validateCompletion does not block completion on the live-only required step', async () => {
      const { logicSvc, runRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makePinnedRun());

      const result = await logicSvc.validateCompletion(WORKFLOW_ID, RUN_ID, { [PINNED_STEP_ID]: 'answered' });

      expect(result.valid).toBe(true);
      expect(result.missingSteps).toEqual([]);
      expect(result.missingStepTitles).toEqual([]);
    });

    it('does not report the live-only step as missing even when it is unanswered', async () => {
      const { logicSvc, runRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makePinnedRun());

      // Respondent answered the pinned step but obviously never saw (and
      // could not have answered) the step the author added afterward.
      const result = await logicSvc.validateCompletion(WORKFLOW_ID, RUN_ID, { [PINNED_STEP_ID]: 'answered' });

      expect(result.missingSteps).not.toContain(LIVE_ONLY_REQUIRED_STEP_ID);
      expect(result.valid).toBe(true);
    });
  });

  describe('a run with no workflowVersionId (AC3: behaves exactly as today)', () => {
    it('evaluateNavigation falls back to the live tables', async () => {
      const { logicSvc, runRepo, pageRepo, stepRepo, logicRuleRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makeVersionlessRun());

      const navigation = await logicSvc.evaluateNavigation(WORKFLOW_ID, RUN_ID, null);

      expect(pageRepo.findByWorkflowId).toHaveBeenCalledWith(WORKFLOW_ID, expect.anything());
      expect(stepRepo.findByPageIds).toHaveBeenCalled();
      expect(logicRuleRepo.findByWorkflowId).toHaveBeenCalledWith(WORKFLOW_ID, expect.anything());
      // Both pages (including the "live-only" one) are visible because
      // there is no pinned graph to restrict to -- this run always reads
      // live, so there is no "live-only" concept for it.
      expect(navigation.visiblePages).toEqual(
        expect.arrayContaining([PINNED_PAGE_ID, LIVE_ONLY_PAGE_ID])
      );
    });

    it('validateCompletion still blocks on a required live step with no value (unchanged today-behavior)', async () => {
      const { logicSvc, runRepo } = makeHarness();
      runRepo.findById.mockResolvedValue(makeVersionlessRun());

      const result = await logicSvc.validateCompletion(WORKFLOW_ID, RUN_ID, { [PINNED_STEP_ID]: 'answered' });

      expect(result.valid).toBe(false);
      expect(result.missingSteps).toContain(LIVE_ONLY_REQUIRED_STEP_ID);
    });
  });
});

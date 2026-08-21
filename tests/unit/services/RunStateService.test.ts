/**
 * RunStateService.getSharedRunDetails — final-block config resolution.
 *
 * RUN2-18: the version-pinned path used to look for a `nodes[]` graph shape
 * that VersionService.serializeWorkflow never emits (it emits
 * `sections[].steps[]`), so every shared run with a pinned version silently
 * returned `finalBlockConfig: null`. This covers the fixed sections[]-based
 * lookup (for both 'final' and 'final_documents' step types), confirms the
 * old nodes[] shape is no longer read at all, and confirms the draft-run
 * (no workflowVersionId) path is untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { WorkflowRun } from '@shared/schema';

import { RunStateService } from '../../../server/services/workflow-runs/RunStateService';
import { db } from '../../../server/db';
import { workflowRepository, stepRepository } from '../../../server/repositories';

// getSharedRunDetails now resolves the share link's tenant before reading
// `workflows`/`steps` (both RLS-covered) — the route carries no auth, so
// nothing else can. That resolution runs in a transaction, and the reads run
// in a tenant-scoped one, so the db mock needs `transaction`.
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ execute: vi.fn() })),
  },
}));

vi.mock('../../../server/services/WorkflowTenantResolver', () => ({
  workflowTenantResolver: { resolveForWorkflowId: vi.fn().mockResolvedValue('tenant-1') },
}));

vi.mock('../../../server/repositories', () => ({
  // RunStateService's constructor defaults reference these at the module level;
  // they're unused here since the tests inject explicit repo mocks below, but
  // must exist as exports for the mocked module to resolve.
  workflowRunRepository: {},
  runGeneratedDocumentsRepository: {},
  runCompletionJobRepository: {},
  workflowRepository: { findById: vi.fn() },
  stepRepository: { findByWorkflowIdWithAliases: vi.fn() },
}));

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    workflowVersionId: null,
    shareTokenExpiresAt: null,
    ...overrides,
  } as WorkflowRun;
}

/** Mocks the `db.select().from(workflowVersions).where(...).limit(1)` chain. */
function mockVersionSelect(graphJson: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ graphJson }]),
  };
  vi.mocked(db.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>);
  return chain;
}

describe('RunStateService.getSharedRunDetails', () => {
  let runRepo: { findByShareToken: ReturnType<typeof vi.fn> };
  let docsRepo: { findByRunId: ReturnType<typeof vi.fn> };
  let completionJobRepo: Record<string, never>;
  let service: RunStateService;

  beforeEach(() => {
    vi.clearAllMocks();
    runRepo = { findByShareToken: vi.fn() };
    docsRepo = { findByRunId: vi.fn().mockResolvedValue([]) };
    completionJobRepo = {};
    service = new RunStateService(
      runRepo as unknown as ConstructorParameters<typeof RunStateService>[0],
      docsRepo as unknown as ConstructorParameters<typeof RunStateService>[1],
      completionJobRepo as unknown as ConstructorParameters<typeof RunStateService>[2]
    );
    vi.mocked(workflowRepository.findById).mockResolvedValue({ accessSettings: {} } as never);
  });

  it('AC1: resolves the config of a "final" step in the pinned version sections[]', async () => {
    runRepo.findByShareToken.mockResolvedValue(makeRun({ workflowVersionId: 'v1' }));
    mockVersionSelect({
      sections: [
        { id: 's1', steps: [{ id: 'st1', type: 'short_text', config: {} }] },
        { id: 's2', steps: [{ id: 'st2', type: 'final', config: { documents: ['doc1'] } }] },
      ],
    });

    const result = await service.getSharedRunDetails('token');

    expect(result.finalBlockConfig).toEqual({ documents: ['doc1'] });
  });

  it('AC1: resolves the config of a "final_documents" step in the pinned version sections[]', async () => {
    runRepo.findByShareToken.mockResolvedValue(makeRun({ workflowVersionId: 'v1' }));
    mockVersionSelect({
      sections: [
        { id: 's1', steps: [{ id: 'st1', type: 'final_documents', config: { documents: ['doc2'] } }] },
      ],
    });

    const result = await service.getSharedRunDetails('token');

    expect(result.finalBlockConfig).toEqual({ documents: ['doc2'] });
  });

  it('AC2: returns null when the pinned version has no final block', async () => {
    runRepo.findByShareToken.mockResolvedValue(makeRun({ workflowVersionId: 'v1' }));
    mockVersionSelect({
      sections: [{ id: 's1', steps: [{ id: 'st1', type: 'short_text', config: {} }] }],
    });

    const result = await service.getSharedRunDetails('token');

    expect(result.finalBlockConfig).toBeNull();
  });

  it('AC4: a legacy nodes[] graph shape is no longer read (dead branch removed, not a fallback)', async () => {
    runRepo.findByShareToken.mockResolvedValue(makeRun({ workflowVersionId: 'v1' }));
    mockVersionSelect({
      nodes: [{ type: 'final', data: { config: { documents: ['legacy'] } } }],
    });

    const result = await service.getSharedRunDetails('token');

    expect(result.finalBlockConfig).toBeNull();
  });

  it('AC3: the draft-run path (no workflowVersionId) is unchanged — reads live steps table, never touches db.select', async () => {
    runRepo.findByShareToken.mockResolvedValue(makeRun({ workflowVersionId: null }));
    vi.mocked(stepRepository.findByWorkflowIdWithAliases).mockResolvedValue([
      { id: 'st1', type: 'final', config: { documents: ['draft-doc'] } },
    ] as never);

    const result = await service.getSharedRunDetails('token');

    expect(result.finalBlockConfig).toEqual({ documents: ['draft-doc'] });
    expect(db.select).not.toHaveBeenCalled();
  });
});

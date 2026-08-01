import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RunAuthResolver } from '../../../server/services/runs/RunAuthResolver';

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'active',
    isPublic: true,
    requireLogin: false,
    projectId: 'project-1',
    ...overrides,
  };
}

describe('RunAuthResolver.verifyCreateAccess', () => {
  const runRepo = { findById: vi.fn() };
  const workflowRepo = {
    findById: vi.fn(),
    findByPublicLink: vi.fn(),
    findBySlug: vi.fn(),
  };
  const projectRepo = { findById: vi.fn() };
  const workflowService = { verifyAccess: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    workflowRepo.findById.mockResolvedValue(undefined);
    workflowRepo.findByPublicLink.mockResolvedValue(undefined);
    workflowRepo.findBySlug.mockResolvedValue(undefined);
  });

  function createResolver(): RunAuthResolver {
    return new RunAuthResolver(
      runRepo as never,
      workflowRepo as never,
      projectRepo as never,
      workflowService as never
    );
  }

  it('rejects anonymous launches when the public workflow requires login', async () => {
    workflowRepo.findByPublicLink.mockResolvedValue(makeWorkflow({ requireLogin: true }));

    await expect(createResolver().verifyCreateAccess('client-intake', undefined))
      .rejects.toMatchObject({
        message: 'Authentication required for this workflow',
        statusCode: 401,
      });
  });

  it('allows a signed-in respondent to launch a public require-login workflow', async () => {
    const workflow = makeWorkflow({ requireLogin: true });
    workflowRepo.findByPublicLink.mockResolvedValue(workflow);

    await expect(createResolver().verifyCreateAccess('client-intake', 'respondent-1'))
      .resolves.toBe(workflow);
    expect(workflowService.verifyAccess).not.toHaveBeenCalled();
  });

  it('hides private workflows from anonymous public-link callers', async () => {
    workflowRepo.findByPublicLink.mockResolvedValue(makeWorkflow({ isPublic: false }));

    await expect(createResolver().verifyCreateAccess('private-intake', undefined))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('keeps private UUID launches behind the existing tenant and ACL check', async () => {
    const workflow = makeWorkflow({ isPublic: false, status: 'draft' });
    workflowRepo.findById.mockResolvedValue(workflow);
    workflowService.verifyAccess.mockResolvedValue(workflow);

    await expect(createResolver().verifyCreateAccess(workflow.id, 'creator-1'))
      .resolves.toBe(workflow);
    expect(workflowService.verifyAccess).toHaveBeenCalledWith(workflow.id, 'creator-1');
  });
});

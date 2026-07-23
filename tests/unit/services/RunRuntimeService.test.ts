import { describe, expect, it, vi } from 'vitest';

import { RunRuntimeService } from '../../../server/services/workflow-runs/RunRuntimeService';

const runId = '11111111-1111-4111-8111-111111111111';
const workflowId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const sectionId = '44444444-4444-4444-8444-444444444444';
const controllerId = '55555555-5555-4555-8555-555555555555';
const targetId = '66666666-6666-4666-8666-666666666666';

function makeRun() {
  return {
    id: runId,
    workflowId,
    workflowVersionId: versionId,
    currentSectionId: sectionId,
    completed: false,
    generationStatus: null,
  };
}

function makeService(overrides: {
  run?: unknown;
  version?: unknown;
  access?: 'owner' | 'creator' | 'public' | 'none';
} = {}) {
  const run = overrides.run ?? makeRun();
  const runRepo = { findById: vi.fn().mockResolvedValue(run) };
  const valueRepo = {
    findByRunId: vi.fn().mockResolvedValue([
      { id: 'value-1', runId, stepId: controllerId, value: 'yes', createdAt: null, updatedAt: null },
    ]),
  };
  const versionRepo = {
    findById: vi.fn().mockResolvedValue(overrides.version ?? {
      id: versionId,
      workflowId,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      graphJson: {
        title: 'Pinned interview',
        description: 'Versioned definition',
        projectId: null,
        sections: [{
          id: sectionId,
          title: 'Questions',
          order: 1,
          steps: [
            { id: controllerId, type: 'short_text', title: 'Controller', order: 1, alias: 'controller' },
            { id: targetId, type: 'short_text', title: 'Target', order: 2 },
          ],
        }],
        logicRules: [{
          conditionStepAlias: 'controller',
          operator: 'equals',
          conditionValue: 'yes',
          targetType: 'step',
          targetId,
          action: 'show',
        }],
      },
    }),
  };
  const authResolver = {
    resolveRun: vi.fn().mockResolvedValue({
      run,
      access: overrides.access ?? 'owner',
      mode: 'live',
    }),
  };
  return {
    service: new RunRuntimeService(runRepo as never, valueRepo as never, versionRepo as never, authResolver as never),
    runRepo,
    valueRepo,
    versionRepo,
  };
}

describe('RunRuntimeService', () => {
  it('returns a sanitized pinned definition and resolves rule aliases', async () => {
    const { service } = makeService();

    const runtime = await service.getRuntime(runId, { tokenRunId: runId });

    expect(runtime.contractVersion).toBe(1);
    expect(runtime.run).toEqual({
      id: runId,
      workflowId,
      workflowVersionId: versionId,
      currentSectionId: sectionId,
      completed: false,
      generationStatus: null,
    });
    expect(runtime.workflow.title).toBe('Pinned interview');
    expect(runtime.steps).toHaveLength(2);
    expect(runtime.logicRules[0]).toMatchObject({
      conditionStepId: controllerId,
      targetStepId: targetId,
    });
    expect(runtime.values[0]).toMatchObject({ stepId: controllerId, value: 'yes' });
    expect(runtime.run).not.toHaveProperty('runToken');
    expect(runtime.run).not.toHaveProperty('tokenExpiresAt');
  });

  it('rejects a token authenticated for another run', async () => {
    const { service, runRepo } = makeService();

    await expect(service.getRuntime(runId, {
      tokenRunId: '77777777-7777-4777-8777-777777777777',
    })).rejects.toThrow('Access denied - run mismatch');
    expect(runRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects creator callers without run access', async () => {
    const { service } = makeService({ access: 'none' });

    await expect(service.getRuntime(runId, { userId: 'user-1' }))
      .rejects.toThrow('Access denied - insufficient permissions for this run');
  });

  it('fails explicitly for an incompatible version snapshot', async () => {
    const { service } = makeService({
      version: { id: versionId, workflowId, createdAt: new Date(), graphJson: {} },
    });

    await expect(service.getRuntime(runId, { tokenRunId: runId }))
      .rejects.toThrow('Invalid runtime definition for workflow version');
  });

  it('accepts a serialized version whose nullable fields are explicit null (runner-500 regression)', async () => {
    // Real serialized versions carry explicit `null` (not `undefined`) for every
    // nullable column. `.optional()` used to reject that, so `GET /runtime`
    // 500'd for every newly-activated workflow. This asserts the schema tolerates
    // the real shape and the mapping coalesces the nulls.
    const { service } = makeService({
      version: {
        id: versionId,
        workflowId,
        createdAt: new Date('2026-07-18T00:00:00.000Z'),
        graphJson: {
          title: 'Pinned interview',
          description: null,
          projectId: null,
          sections: [{
            id: sectionId,
            title: 'Questions',
            description: null,
            order: 1,
            visibleIf: null,
            skipIf: null,
            config: null,
            steps: [{
              id: controllerId,
              type: 'short_text',
              title: 'Controller',
              description: null,
              required: null,
              config: null,
              order: 1,
              alias: null,
              visibleIf: null,
              repeaterConfig: null,
              defaultValue: null,
              isVirtual: null,
            }],
          }],
          logicRules: null,
        },
      },
    });

    const runtime = await service.getRuntime(runId, { tokenRunId: runId });

    expect(runtime.steps).toHaveLength(1);
    expect(runtime.steps[0]).toMatchObject({
      repeaterConfig: null,
      config: null,
      alias: null,
      description: null,
      required: false,
    });
    expect(runtime.logicRules).toEqual([]);
  });
});

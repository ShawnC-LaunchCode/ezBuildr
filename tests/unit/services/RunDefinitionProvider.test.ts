import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

import { logger } from '../../../server/logger';
import { RunDefinitionProvider } from '../../../server/services/workflow-runs/RunDefinitionProvider';
import { buildTestWhen } from '../../helpers/conditionFixtures';

const runId = '11111111-1111-4111-8111-111111111111';
const workflowId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const sectionId = '44444444-4444-4444-8444-444444444444';
const controllerId = '55555555-5555-4555-8555-555555555555';
const targetId = '66666666-6666-4666-8666-666666666666';

function makeRun(overrides: Partial<{ workflowVersionId: string | null }> = {}) {
  return {
    id: runId,
    workflowId,
    workflowVersionId: versionId,
    currentSectionId: sectionId,
    completed: false,
    generationStatus: null,
    ...overrides,
  } as never;
}

function makeProvider(overrides: {
  version?: unknown;
  liveSections?: unknown[];
  liveSteps?: unknown[];
  liveLogicRules?: unknown[];
} = {}) {
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
          when: buildTestWhen('controller', 'equals', 'yes'),
          targetType: 'step',
          targetId,
          action: 'show',
        }],
      },
    }),
  };
  const sectionRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue(overrides.liveSections ?? [
      {
        id: sectionId,
        workflowId,
        title: 'Live section',
        description: null,
        order: 0,
        visibleIf: null,
        skipIf: null,
        config: null,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]),
  };
  const stepRepo = {
    findBySectionIds: vi.fn().mockResolvedValue(overrides.liveSteps ?? [
      {
        id: targetId,
        workflowId,
        sectionId,
        type: 'short_text',
        title: 'Live step',
        description: null,
        required: false,
        alias: null,
        visibleIf: null,
        order: 0,
        isVirtual: false,
        defaultValue: null,
        config: null,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]),
  };
  const logicRuleRepo = {
    findByWorkflowId: vi.fn().mockResolvedValue(overrides.liveLogicRules ?? []),
  };
  return {
    provider: new RunDefinitionProvider(
      versionRepo as never,
      sectionRepo as never,
      stepRepo as never,
      logicRuleRepo as never,
    ),
    versionRepo,
    sectionRepo,
    stepRepo,
    logicRuleRepo,
  };
}

describe('RunDefinitionProvider', () => {
  describe('a run pinned to a version (AC1)', () => {
    it('returns sections, steps and logic rules sourced from the pinned graph', async () => {
      const { provider } = makeProvider();

      const definition = await provider.getDefinition(makeRun());

      expect(definition.source).toBe('version');
      expect(definition.sections).toEqual([
        expect.objectContaining({ id: sectionId, title: 'Questions' }),
      ]);
      expect(definition.steps).toHaveLength(2);
      expect(definition.steps.map((s) => s.id)).toEqual([controllerId, targetId]);
      // Alias resolution: the rule references the controller step by alias,
      // the provider must resolve it to the step's id, not leave it empty.
      expect(definition.logicRules).toEqual([
        expect.objectContaining({ conditionStepId: controllerId, targetStepId: targetId }),
      ]);
      expect(definition.graph).toMatchObject({ title: 'Pinned interview' });
    });
  });

  describe('a run with no workflowVersionId (AC3)', () => {
    it('returns the live-table definition with source: live', async () => {
      const { provider, sectionRepo, stepRepo, logicRuleRepo, versionRepo } = makeProvider();

      const definition = await provider.getDefinition(makeRun({ workflowVersionId: null }));

      expect(definition.source).toBe('live');
      expect(definition.graph).toBeUndefined();
      expect(definition.sections).toEqual([
        expect.objectContaining({ id: sectionId, title: 'Live section' }),
      ]);
      expect(definition.steps).toEqual([
        expect.objectContaining({ id: targetId, title: 'Live step' }),
      ]);
      expect(sectionRepo.findByWorkflowId).toHaveBeenCalledWith(workflowId);
      expect(stepRepo.findBySectionIds).toHaveBeenCalledWith([sectionId]);
      expect(logicRuleRepo.findByWorkflowId).toHaveBeenCalledWith(workflowId);
      // The pinned-version path must not be touched for a versionless run.
      expect(versionRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('an incompatible version snapshot (RUN2-10, AC4)', () => {
    function makeIncompatible() {
      return makeProvider({
        version: { id: versionId, workflowId, createdAt: new Date(), graphJson: {} },
      });
    }

    it('fails closed with a 4xx rather than rendering an untrusted definition', async () => {
      const { provider } = makeIncompatible();

      await expect(provider.getDefinition(makeRun())).rejects.toMatchObject({ statusCode: 400 });
    });

    it('logs the Zod issues with run, workflow and version ids', async () => {
      vi.mocked(logger.error).mockClear();
      const { provider } = makeIncompatible();

      await expect(provider.getDefinition(makeRun())).rejects.toThrow();

      expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
      const logged = vi.mocked(logger.error).mock.calls[0][0] as {
        runId: string; workflowId: string; versionId: string; issues: unknown[];
      };
      expect(logged).toMatchObject({ runId, workflowId, versionId });
      expect(Array.isArray(logged.issues)).toBe(true);
      expect(logged.issues.length).toBeGreaterThan(0);
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RunLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

interface HookParams {
  phase: 'beforeFinalBlock' | 'afterDocumentsGenerated';
  data: Record<string, unknown>;
}

interface HookResult {
  data: Record<string, unknown>;
  errors: string[];
}

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  findRun: vi.fn(),
  findExistingDocuments: vi.fn(),
  tryMarkGenerationStarted: vi.fn(),
  updateGenerationStatus: vi.fn(),
  findWorkflow: vi.fn(),
  findProject: vi.fn(),
  createDocument: vi.fn(),
  executeHooksForPhase: vi.fn<(params: HookParams) => Promise<HookResult>>(),
  render: vi.fn(),
  getDefinition: vi.fn(),
  buildRunData: vi.fn(),
}));

vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../server/repositories', () => ({
  stepValueRepository: {},
  stepRepository: {},
  sectionRepository: {},
  documentTemplateRepository: {},
  workflowRunRepository: {
    findById: mocks.findRun,
    tryMarkGenerationStarted: mocks.tryMarkGenerationStarted,
    updateGenerationStatus: mocks.updateGenerationStatus,
  },
  workflowRepository: {
    findById: mocks.findWorkflow,
  },
  runGeneratedDocumentsRepository: {
    findByRunId: mocks.findExistingDocuments,
    createDocument: mocks.createDocument,
  },
  projectRepository: {
    findById: mocks.findProject,
  },
}));

vi.mock('../../../server/services/BlockRunner', () => ({ blockRunner: {} }));
vi.mock('../../../server/services/LogicService', () => ({ logicService: {} }));
vi.mock('../../../server/services/runs/RunPersistenceWriter', () => ({
  RunPersistenceWriter: class RunPersistenceWriter {},
}));
vi.mock('../../../server/services/workflow-runs/RunDataService', () => ({ runDataService: {} }));
vi.mock('../../../server/services/workflow-runs/RunDefinitionProvider', () => ({
  RunDefinitionProvider: class RunDefinitionProvider {},
  runDefinitionProvider: {},
}));
vi.mock('../../../server/services/document/VariableNormalizer', () => ({
  getListConfigsByAlias: vi.fn(() => ({})),
  getChoiceListBindingsByAlias: vi.fn(() => ({})),
}));
vi.mock('../../../server/services/document/delivery/DocumentDeliveryService', () => ({
  documentDeliveryService: { enqueueDeliveriesForRun: vi.fn() },
}));
vi.mock('../../../server/services/scripting/LifecycleHookService', () => ({
  lifecycleHookService: { executeHooksForPhase: mocks.executeHooksForPhase },
}));
vi.mock('../../../server/services/document/FinalBlockRenderer', () => ({
  createProjectTemplateResolver: vi.fn(() => vi.fn()),
  finalBlockRenderer: { render: mocks.render },
}));

const generatedDocument = {
  alias: 'contract',
  filename: 'contract.docx',
  filePath: 'C:/tmp/contract.docx',
  storageKey: 'runs/run-1/documents/contract.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 123,
};

function makeService(): RunLifecycleService {
  return new RunLifecycleService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { buildForRun: mocks.buildRunData } as never,
    { getDefinition: mocks.getDefinition } as never,
  );
}

describe('RunLifecycleService document-generation lifecycle hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;

    mocks.findRun.mockResolvedValue({ id: RUN_ID, workflowId: WORKFLOW_ID });
    mocks.findExistingDocuments.mockResolvedValue([]);
    mocks.tryMarkGenerationStarted.mockResolvedValue(true);
    mocks.updateGenerationStatus.mockResolvedValue(undefined);
    mocks.findWorkflow.mockResolvedValue({ id: WORKFLOW_ID, projectId: PROJECT_ID });
    mocks.findProject.mockResolvedValue({ id: PROJECT_ID, tenantId: 'tenant-1' });
    mocks.getDefinition.mockResolvedValue({
      sections: [],
      logicRules: [],
      steps: [{
        id: 'final-step',
        type: 'final',
        config: {
          markdownHeader: '',
          documents: [{ id: 'document-1', documentId: 'template-1', alias: 'contract' }],
        },
      }],
    });
    mocks.buildRunData.mockResolvedValue({ byAlias: { clientName: 'Ada' } });
    mocks.executeHooksForPhase.mockImplementation(async ({ phase, data }) => {
      mocks.events.push(`hook:${phase}`);
      if (phase === 'beforeFinalBlock') {
        return { data: { ...data, hookAdded: 'from beforeFinalBlock' }, errors: [] };
      }
      return { data, errors: [] };
    });
    mocks.render.mockImplementation(async () => {
      mocks.events.push('render');
      return {
        documents: [generatedDocument],
        skipped: [],
        failed: [],
        totalGenerated: 1,
        isArchived: false,
      };
    });
    mocks.createDocument.mockImplementation(async () => {
      mocks.events.push('persist');
    });
  });

  it('runs beforeFinalBlock before rendering and afterDocumentsGenerated after persistence', async () => {
    const result = await makeService().generateDocuments(RUN_ID);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      documentsGenerated: 1,
      documents: [generatedDocument],
    }));
    expect(mocks.executeHooksForPhase).toHaveBeenCalledTimes(2);
    expect(mocks.executeHooksForPhase).toHaveBeenNthCalledWith(1, {
      workflowId: WORKFLOW_ID,
      runId: RUN_ID,
      phase: 'beforeFinalBlock',
      data: { clientName: 'Ada' },
    });
    expect(mocks.executeHooksForPhase).toHaveBeenNthCalledWith(2, {
      workflowId: WORKFLOW_ID,
      runId: RUN_ID,
      phase: 'afterDocumentsGenerated',
      data: {
        clientName: 'Ada',
        hookAdded: 'from beforeFinalBlock',
        documents: [{
          filename: generatedDocument.filename,
          mimeType: generatedDocument.mimeType,
          size: generatedDocument.size,
        }],
      },
    });
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      stepValues: {
        clientName: 'Ada',
        hookAdded: 'from beforeFinalBlock',
      },
    }));
    expect(mocks.events).toEqual([
      'hook:beforeFinalBlock',
      'render',
      'persist',
      'hook:afterDocumentsGenerated',
    ]);
  });

  it.each(['beforeFinalBlock', 'afterDocumentsGenerated'] as const)(
    'still returns generated documents when the %s hook throws',
    async (failingPhase) => {
      mocks.executeHooksForPhase.mockImplementation(async ({ phase, data }) => {
        mocks.events.push(`hook:${phase}`);
        if (phase === failingPhase) {
          throw new Error(`${failingPhase} failed`);
        }
        return { data, errors: [] };
      });

      const result = await makeService().generateDocuments(RUN_ID);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        documentsGenerated: 1,
        documents: [generatedDocument],
      }));
      expect(mocks.render).toHaveBeenCalledTimes(1);
      expect(mocks.createDocument).toHaveBeenCalledTimes(1);
      expect(mocks.updateGenerationStatus).toHaveBeenLastCalledWith(RUN_ID, 'done');
    },
  );
});

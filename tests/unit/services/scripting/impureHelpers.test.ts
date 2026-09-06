import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JsQuestionConfig, CodeBlockRepeat } from '@shared/types/steps';

import { pageRepository, stepRepository } from '../../../../server/repositories';
import type { DbTransaction } from '../../../../server/repositories/BaseRepository';
import { StepService } from '../../../../server/services/StepService';
import { ASTValidator } from '../../../../server/services/scripting/ASTValidator';
import { IMPURE_HELPERS, helperLibrary } from '../../../../server/services/scripting/HelperLibrary';
import { createTestPage, createTestStep } from '../../../factories/workflowFactory';

vi.mock('../../../../server/services/WorkflowService', () => ({
  workflowService: { verifyAccess: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../../../server/repositories', () => ({
  stepRepository: {
    findById: vi.fn(), findByPageId: vi.fn(), findByPageIds: vi.fn(),
    findByWorkflowIdWithAliases: vi.fn(), countByWorkflowId: vi.fn(),
    create: vi.fn(), update: vi.fn(),
  },
  pageRepository: { findById: vi.fn(), findByIdAndWorkflow: vi.fn(), findByWorkflowId: vi.fn() },
  stepValueRepository: {},
}));

const validator = new ASTValidator();
const service = new StepService();
const tx = {
  transaction: vi.fn(async (callback: (scopedTx: DbTransaction) => Promise<unknown>) => callback(tx)),
} as unknown as DbTransaction;
const page = createTestPage('workflow', { id: 'page' });
const savedStep = createTestStep(page.id, {
  id: 'block', workflowId: 'workflow', type: 'js_question', alias: 'block',
  config: { code: 'emit({ result: 1 });', inputs: [], outputs: [{ key: 'result', type: 'number' }] },
});

function config(code: string, repeat?: CodeBlockRepeat): JsQuestionConfig {
  return { code, inputs: [], outputs: [{ key: 'result', type: 'object' }],
    ...(repeat === undefined ? {} : { repeat }) };
}

function save(mode: 'create' | 'update', block: JsQuestionConfig) {
  return mode === 'create'
    ? service.createStep('workflow', page.id, 'user', {
      type: 'js_question', title: 'Block', alias: 'block', config: block,
    }, tx)
    : service.updateStep(savedStep.id, 'workflow', 'user', { config: block }, tx);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pageRepository.findById).mockResolvedValue(page);
  vi.mocked(pageRepository.findByIdAndWorkflow).mockResolvedValue(page);
  vi.mocked(pageRepository.findByWorkflowId).mockResolvedValue([page]);
  vi.mocked(stepRepository.findById).mockResolvedValue(savedStep);
  vi.mocked(stepRepository.findByPageId).mockResolvedValue([]);
  vi.mocked(stepRepository.findByPageIds).mockResolvedValue([]);
  vi.mocked(stepRepository.findByWorkflowIdWithAliases).mockResolvedValue([]);
  vi.mocked(stepRepository.countByWorkflowId).mockResolvedValue(0);
  vi.mocked(stepRepository.create).mockImplementation(async data => createTestStep(page.id, { ...data, id: 'created' }));
  vi.mocked(stepRepository.update).mockImplementation(async (_id, data) => ({ ...savedStep, ...data }));
});

describe('CB-6 impure helpers', () => {
  it.each(['now', 'random', 'randomInt'])('AC 1: detects direct %s()', name => {
    expect(validator.validateJavaScript(`emit({ result: ${name}() });`)).toMatchObject({
      valid: true, impureHelpers: [name],
    });
  });

  it.each([
    ['helpers.now()', 'now'],
    ['const { now } = helpers; now()', 'now'],
    ['const { now: clock } = helpers; clock()', 'now'],
    ['helpers.date.now()', 'now'],
    ['const { date: { now: clock } } = helpers; clock()', 'now'],
    ['const h = helpers; const clock = h.date.now; clock()', 'now'],
    ['helpers.math.random()', 'random'],
    ['helpers["math"]["randomInt"](1, 3)', 'randomInt'],
    ['helpers.http.get("https://example.test")', 'http.get'],
    ['const { http: api } = helpers; api.post("https://example.test", {})', 'http.post'],
  ])('AC 6: detects %s', (code, name) => {
    expect(validator.validateJavaScript(`${code}; emit({ result: 1 });`).impureHelpers).toEqual([name]);
  });

  it('AC 5: the non-empty catalog contains required names and resolves every real helper', () => {
    expect(Object.keys(IMPURE_HELPERS).length).toBeGreaterThan(0);
    expect(Object.keys(IMPURE_HELPERS)).toEqual(expect.arrayContaining(['now', 'random', 'randomInt']));
    for (const path of Object.values(IMPURE_HELPERS)) {
      let helper: unknown = helperLibrary;
      for (const key of path.split('.')) {
        expect(helper).toBeTypeOf('object');
        helper = (helper as Record<string, unknown>)[key];
      }
      expect(helper).toBeTypeOf('function');
    }
  });

  it('does not flag strings, comments, or unrelated object methods', () => {
    expect(validator.validateJavaScript('const other = { now: () => 1 }; other.now(); /* random() */ emit({ result: "now()" });').impureHelpers).toEqual([]);
  });

  describe.each(['create', 'update'] as const)('%s save boundary', mode => {
    describe.each(['onChange', undefined] as const)('repeat=%s', repeat => {
      it.each(['now', 'random', 'randomInt'])('AC 2: rejects %s before writing', async name => {
        const block = config(`emit({ result: ${name}() });`, repeat);
        if (repeat === undefined) { expect(block).not.toHaveProperty('repeat'); }
        const saving = save(mode, block);
        await expect(saving).rejects.toThrow(new RegExp(`${name}.*once.*always`));
        await expect(saving).rejects.toMatchObject({ statusCode: 400 });
        expect(stepRepository.create).not.toHaveBeenCalled();
        expect(stepRepository.update).not.toHaveBeenCalled();
      });
    });

    it.each(['once', 'always'] as const)('AC 3: saves impure blocks on %s', async repeat => {
      for (const name of ['now', 'random', 'randomInt']) {
        const block = config(`emit({ result: ${name}() });`, repeat);
        await expect(save(mode, block)).resolves.toMatchObject({ config: block });
      }
    });

    it.each(['onChange', 'once', 'always'] as const)('AC 4: saves pure blocks on %s', async repeat => {
      const block = config('emit({ result: helpers.number.round(1.25) });', repeat);
      await expect(save(mode, block)).resolves.toMatchObject({ config: block });
    });

    it.each(['helpers.now()', 'const { now } = helpers; now()'])('AC 6: rejects aliased calls at save: %s', async code => {
      await expect(save(mode, config(`${code}; emit({ result: 1 });`))).rejects.toThrow(/now.*once.*always/);
      expect(stepRepository.create).not.toHaveBeenCalled();
      expect(stepRepository.update).not.toHaveBeenCalled();
    });
  });
});

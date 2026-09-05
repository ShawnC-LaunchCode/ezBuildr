import { createHash } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';
import type { JsQuestionConfig } from '@shared/types/steps';

import { codeBlockService } from '../../server/services/codeBlocks/CodeBlockService';
import { getVisibleStepIds } from '../../server/services/runs/RunVisibility';
import { runDefinitionProvider } from '../../server/services/workflow-runs/RunDefinitionProvider';
import * as sandbox from '../../server/utils/enhancedSandboxExecutor';
import { runWithTenantContext } from '../../server/utils/rlsContext';
import { buildTestWhen } from '../helpers/conditionFixtures';
import { createAuthenticatedAgent, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

const DEFAULT_CONFIG: JsQuestionConfig = {
  code: 'emit({ total: (input.income_a + input.income_b) / input.num_children });',
  inputs: ['income_a', 'income_b', 'num_children'].map(key => ({ key, required: true })),
  outputs: [{ key: 'total', type: 'number' }],
};

describe.sequential('CB-2 Code Block readiness and change gates', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflowIds: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-2 gates', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const id of workflowIds) {
      await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id));
    }
    await ctx.cleanup();
  });

  async function fixture(config: JsQuestionConfig = DEFAULT_CONFIG, hideChildren = false) {
    const created = await agent.post('/api/workflows')
      .send({ title: `Gate proof ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    const workflowId = created.body.id as string;
    workflowIds.push(workflowId);
    const pages = await getOwnerDb().insert(schema.pages).values(
      [1, 2, 3, 4].map(order => ({ workflowId, title: `Page ${order}`, order }))
    ).returning();
    const inputs = await getOwnerDb().insert(schema.steps).values([
      { workflowId, pageId: pages[0].id, type: 'number' as const, title: 'Income A', alias: 'income_a', order: 1 },
      { workflowId, pageId: pages[0].id, type: 'number' as const, title: 'Income B', alias: 'income_b', order: 2 },
      { workflowId, pageId: pages[1].id, type: 'number' as const, title: 'Children', alias: 'num_children', order: 1 },
      { workflowId, pageId: pages[2].id, type: 'text' as const, title: 'Unrelated', alias: 'unrelated', order: 1 },
    ]).returning();
    // The block's own page is not submitted: CB-3 owns automatic eligibility.
    const blockResponse = await agent.post(`/api/pages/${pages[3].id}/steps`).send({
      type: 'js_question', title: 'Gate calculation', config,
    }).expect(201);
    const block = { id: blockResponse.body.id as string, workflowId };
    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'total')));
    if (hideChildren) {
      await getOwnerDb().insert(schema.logicRules).values({
        workflowId, conditionStepId: inputs[0].id,
        when: buildTestWhen(inputs[0].id, 'equals', 0),
        targetType: 'step', targetStepId: inputs[2].id, action: 'hide',
      });
    }
    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = runResponse.body.data.runId as string;
    const token = runResponse.body.data.runToken as string;

    async function submit(page: number, answers: Record<string, unknown>): Promise<void> {
      const values = Object.entries(answers).map(([alias, value]) => ({
        stepId: inputs.find(step => step.alias === alias)!.id, value,
      }));
      const response = await request(ctx.baseURL).post(`/api/runs/${runId}/pages/${pages[page - 1].id}/submit`)
        .set('Authorization', `Bearer ${token}`).send({ values }).expect(200);
      expect(response.body.success).toBe(true);
    }
    async function evaluate() {
      const rows = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, runId));
      return runWithTenantContext(ctx.tenantId, () => codeBlockService.evaluate(
        runId, block, Object.fromEntries(rows.map(row => [row.stepId, row.value]))
      ));
    }
    async function state() {
      const rows = await getOwnerDb().select().from(schema.codeBlockRuns)
        .where(and(eq(schema.codeBlockRuns.runId, runId), eq(schema.codeBlockRuns.stepId, block.id)));
      expect(rows).toHaveLength(1);
      return rows[0];
    }
    async function outputRows() {
      return getOwnerDb().select().from(schema.stepValues)
        .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, output.id)));
    }
    return { workflowId, pages, inputs, block, runId, submit, evaluate, state, outputRows };
  }

  it('walks real page submits: unready, fired, unchanged without sandbox execution, then changed and fired', async () => {
    const f = await fixture();
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers'); // call-through, real ScriptEngine + sandbox
    await f.submit(1, { income_a: 100, income_b: 200 });
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'skipped_unready', pendingInputs: ['num_children'], inputHash: null });
    expect(await f.outputRows()).toHaveLength(0);
    expect(executions).toHaveBeenCalledTimes(0);

    await f.submit(2, { num_children: 3 });
    await f.evaluate();
    const fired = await f.state();
    expect(fired).toMatchObject({ status: 'fired', pendingInputs: [], errorMessage: null });
    expect(fired.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fired.firedAt).toBeInstanceOf(Date);
    expect((await f.outputRows())[0].value).toBe(100);
    expect(executions).toHaveBeenCalledTimes(1);

    await f.submit(3, { unrelated: 'different answer' });
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'skipped_unchanged', inputHash: fired.inputHash, firedAt: fired.firedAt });
    expect(executions).toHaveBeenCalledTimes(1);
    await f.evaluate();
    expect(executions).toHaveBeenCalledTimes(1);

    await f.submit(1, { income_a: 400 });
    await f.evaluate();
    expect((await f.state()).status).toBe('fired');
    expect((await f.state()).inputHash).not.toBe(fired.inputHash);
    expect((await f.outputRows())[0].value).toBe(200);
    expect(executions).toHaveBeenCalledTimes(2);
  });

  it('passes an absent optional input to the real sandbox as null and detects optional changes', async () => {
    const f = await fixture({
      code: 'emit({ total: input.num_children === null ? 17 : input.num_children });',
      inputs: [{ key: 'num_children', required: false }], outputs: DEFAULT_CONFIG.outputs,
    });
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.evaluate();
    expect((await f.state()).status).toBe('fired');
    expect((await f.outputRows())[0].value).toBe(17);
    expect(executions.mock.calls[0][0].input).toEqual({ num_children: null });
    await f.submit(2, { num_children: 5 });
    await f.evaluate();
    expect((await f.outputRows())[0].value).toBe(5);
    expect(executions).toHaveBeenCalledTimes(2);
  });

  it('resolves a required input as absent only when a real logic rule hides its step', async () => {
    const f = await fixture({
      code: 'emit({ total: input.num_children === null ? 23 : input.num_children });',
      inputs: [{ key: 'num_children', required: true }], outputs: DEFAULT_CONFIG.outputs,
    }, true);
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.submit(1, { income_a: 1 });
    await f.evaluate();
    expect((await f.state()).status).toBe('skipped_unready');
    expect(executions).toHaveBeenCalledTimes(0);
    await f.submit(1, { income_a: 0 });
    const [run] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, f.runId));
    const runtime = await runWithTenantContext(ctx.tenantId, () => runDefinitionProvider.getDefinition(run));
    expect(getVisibleStepIds(runtime, { [f.inputs[0].id]: 0 })).not.toContain(f.inputs[2].id);
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'fired', pendingInputs: [] });
    expect((await f.outputRows())[0].value).toBe(23);
    expect(executions).toHaveBeenCalledTimes(1);
    expect(executions.mock.calls[0][0].input).toEqual({ num_children: null });
    await f.submit(1, { income_a: 1 });
    await f.evaluate();
    expect((await f.state()).status).toBe('skipped_unready');
    expect(executions).toHaveBeenCalledTimes(1);
  });

  it('treats an actual JSON-null answer row as resolved', async () => {
    const f = await fixture({
      code: 'emit({ total: input.num_children === null ? 31 : 0 });',
      inputs: [{ key: 'num_children', required: true }], outputs: DEFAULT_CONFIG.outputs,
    });
    // JSON null is a stored answer; SQL NULL is disallowed by step_values.
    await getOwnerDb().insert(schema.stepValues).values({
      runId: f.runId, stepId: f.inputs[2].id, value: sql`'null'::jsonb`,
    });
    const [row] = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, f.runId), eq(schema.stepValues.stepId, f.inputs[2].id)));
    expect(row).toBeDefined();
    expect(row.value).toBeNull();
    await f.evaluate();
    expect((await f.state()).status).toBe('fired');
    expect((await f.outputRows())[0].value).toBe(31);
  });

  it('refuses evaluation from another tenant before writing state or executing', async () => {
    const f = await fixture();
    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({ name: `Other ${nanoid()}` }).returning();
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    try {
      await expect(runWithTenantContext(otherTenant.id, () => codeBlockService.evaluate(f.runId, f.block, {})))
        .rejects.toThrow(/Access denied|Run not found/);
      expect(await getOwnerDb().select().from(schema.codeBlockRuns).where(eq(schema.codeBlockRuns.runId, f.runId)))
        .toHaveLength(0);
      expect(executions).toHaveBeenCalledTimes(0);
    } finally {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenant.id));
    }
  });

  it('does not mistake caller-provided values for persisted required answers', async () => {
    const f = await fixture();
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    const result = await runWithTenantContext(ctx.tenantId, () => codeBlockService.evaluate(f.runId, f.block, {
      income_a: 1, income_b: 2, num_children: 3,
      ...Object.fromEntries(f.inputs.map(step => [step.id, 1])),
    }));
    expect(result.state.pendingInputs).toEqual(['income_a', 'income_b', 'num_children']);
    expect(executions).toHaveBeenCalledTimes(0);
  });

  it('canonicalizes nested object keys while preserving meaningful array order', async () => {
    const f = await fixture({
      code: 'emit({ total: input.income_a.items[0].x });',
      inputs: [{ key: 'income_a', required: true }], outputs: DEFAULT_CONFIG.outputs,
    });
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await getOwnerDb().insert(schema.stepValues).values({
      runId: f.runId, stepId: f.inputs[0].id, value: { items: [{ x: 1, y: 2 }, { x: 9 }], extra: true },
    });
    await f.evaluate();
    const firstHash = (await f.state()).inputHash;
    await getOwnerDb().update(schema.stepValues).set({ value: { extra: true, items: [{ y: 2, x: 1 }, { x: 9 }] } })
      .where(and(eq(schema.stepValues.runId, f.runId), eq(schema.stepValues.stepId, f.inputs[0].id)));
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'skipped_unchanged', inputHash: firstHash });
    expect(executions).toHaveBeenCalledTimes(1);
    await getOwnerDb().update(schema.stepValues).set({ value: { extra: true, items: [{ x: 9 }, { x: 1, y: 2 }] } })
      .where(and(eq(schema.stepValues.runId, f.runId), eq(schema.stepValues.stepId, f.inputs[0].id)));
    await f.evaluate();
    expect((await f.outputRows())[0].value).toBe(9);
    expect(executions).toHaveBeenCalledTimes(2);
  });

  it('hashes the tuple in sorted key order independently of declaration order', async () => {
    const f = await fixture({ ...DEFAULT_CONFIG, inputs: [...DEFAULT_CONFIG.inputs].reverse() });
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.submit(1, { income_a: 100, income_b: 200 });
    await f.submit(2, { num_children: 3 });
    await f.evaluate();
    const hash = createHash('sha256').update(JSON.stringify({ income_a: 100, income_b: 200, num_children: 3 })).digest('hex');
    expect((await f.state()).inputHash).toBe(hash);
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'skipped_unchanged', inputHash: hash });
    expect(executions).toHaveBeenCalledTimes(1);
  });

  it('records script errors, clears old outputs, and retries instead of treating failure as a clean hash', async () => {
    const f = await fixture({
      code: "if (input.num_children === 0) { throw new Error('zero children'); } emit({ total: 10 / input.num_children });",
      inputs: [{ key: 'num_children', required: true }], outputs: DEFAULT_CONFIG.outputs,
    });
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.submit(2, { num_children: 2 });
    await f.evaluate();
    expect((await f.outputRows())[0].value).toBe(5);
    await f.submit(2, { num_children: 0 });
    expect((await f.evaluate()).success).toBe(false);
    expect(await f.state()).toMatchObject({ status: 'error', inputHash: null, errorMessage: expect.stringContaining('zero children') });
    expect(await f.outputRows()).toHaveLength(0);
    await f.evaluate();
    expect(executions).toHaveBeenCalledTimes(3);
    await f.submit(2, { num_children: 2 });
    await f.evaluate();
    expect(await f.state()).toMatchObject({ status: 'fired', errorMessage: null });
    expect((await f.outputRows())[0].value).toBe(5);
  });

  it('enforces a unique state row per run and block in the database', async () => {
    const f = await fixture();
    await f.evaluate();
    await expect(getOwnerDb().insert(schema.codeBlockRuns).values({
      runId: f.runId, stepId: f.block.id, status: 'fired',
    })).rejects.toThrow();
    expect((await f.state()).status).toBe('skipped_unready');
  });

  it('refuses a block from a different workflow before creating state', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(runWithTenantContext(ctx.tenantId, () => codeBlockService.evaluate(f.runId, other.block, {})))
      .rejects.toThrow('Access denied - Code Block belongs to different workflow');
    expect(await getOwnerDb().select().from(schema.codeBlockRuns).where(eq(schema.codeBlockRuns.runId, f.runId)))
      .toHaveLength(0);
  });
});

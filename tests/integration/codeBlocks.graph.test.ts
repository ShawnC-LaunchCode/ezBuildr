import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';
import type { JsQuestionConfig } from '@shared/types/steps';

import { createAuthenticatedAgent, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

/**
 * CB-4 AC 1, 3, 4, 5 and the cross-tenant clause. The ordering rules themselves
 * (AC 2, 6) are proven without a database in
 * tests/unit/services/codeBlocks/CodeBlockGraph.test.ts; this file proves the
 * parts that only exist once real chained blocks run against the real sandbox
 * and the real `steps_workflow_alias_unique` index.
 */
describe.sequential('CB-4 Code Block dependency graph', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflowIds: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-4 graph', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const id of workflowIds) {
      await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id));
    }
    await ctx.cleanup();
  });

  async function workflow() {
    const created = await agent.post('/api/workflows')
      .send({ title: `Graph proof ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    const workflowId = created.body.id as string;
    workflowIds.push(workflowId);
    const pages = await getOwnerDb().insert(schema.pages).values(
      [1, 2].map(order => ({ workflowId, title: `Page ${order}`, order }))
    ).returning();
    const [income] = await getOwnerDb().insert(schema.steps).values([
      { workflowId, pageId: pages[0].id, type: 'number' as const, title: 'Income', alias: 'income', order: 1 },
    ]).returning();
    return { workflowId, pages, income };
  }

  /** `order` is set ADVERSARIALLY: the consumer is created first and carries the
   * LOWER order integer, so a definition-order sweep would run it before its
   * producer and read a stale value. */
  async function addBlock(
    pageId: string,
    title: string,
    config: JsQuestionConfig,
    order: number
  ): Promise<string> {
    const response = await agent.post(`/api/pages/${pageId}/steps`)
      .send({ type: 'js_question', title, config, order });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function valueOf(runId: string, workflowId: string, alias: string) {
    const [step] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, alias)));
    const rows = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, step.id)));
    return rows[0]?.value;
  }

  it('AC 1: a chained producer and consumer both resolve in ONE pass', async () => {
    const w = await workflow();
    // Consumer created FIRST, with the lower order integer.
    await addBlock(w.pages[1].id, 'Net', {
      code: 'emit({ net_total: input.gross_total - 10 });',
      inputs: [{ key: 'gross_total', required: true }],
      outputs: [{ key: 'net_total', type: 'number' }],
    }, 1);
    await addBlock(w.pages[1].id, 'Gross', {
      code: 'emit({ gross_total: input.income * 2 });',
      inputs: [{ key: 'income', required: true }],
      outputs: [{ key: 'gross_total', type: 'number' }],
    }, 99);

    const run = await agent.post(`/api/workflows/${w.workflowId}/runs`).send({}).expect(201);
    const runId = run.body.data.runId as string;
    const token = run.body.data.runToken as string;

    await request(ctx.baseURL).post(`/api/runs/${runId}/pages/${w.pages[0].id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ values: [{ stepId: w.income.id, value: 50 }] }).expect(200);

    // ONE submit. Both must be written: gross_total = 100, net_total = 90.
    // Under definition order the consumer runs first, sees no gross_total, and
    // net_total is still missing after this pass.
    expect(await valueOf(runId, w.workflowId, 'gross_total')).toBe(100);
    expect(await valueOf(runId, w.workflowId, 'net_total')).toBe(90);
  });

  it('AC 4: a three-deep chain A -> B -> C resolves in one pass', async () => {
    const w = await workflow();
    // Created in reverse dependency order, with reversed order integers too.
    await addBlock(w.pages[1].id, 'C', {
      code: 'emit({ c_out: input.b_out + 1 });',
      inputs: [{ key: 'b_out', required: true }],
      outputs: [{ key: 'c_out', type: 'number' }],
    }, 1);
    await addBlock(w.pages[1].id, 'B', {
      code: 'emit({ b_out: input.a_out + 1 });',
      inputs: [{ key: 'a_out', required: true }],
      outputs: [{ key: 'b_out', type: 'number' }],
    }, 2);
    await addBlock(w.pages[1].id, 'A', {
      code: 'emit({ a_out: input.income + 1 });',
      inputs: [{ key: 'income', required: true }],
      outputs: [{ key: 'a_out', type: 'number' }],
    }, 3);

    const run = await agent.post(`/api/workflows/${w.workflowId}/runs`).send({}).expect(201);
    const runId = run.body.data.runId as string;
    const token = run.body.data.runToken as string;

    await request(ctx.baseURL).post(`/api/runs/${runId}/pages/${w.pages[0].id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ values: [{ stepId: w.income.id, value: 1 }] }).expect(200);

    expect(await valueOf(runId, w.workflowId, 'a_out')).toBe(2);
    expect(await valueOf(runId, w.workflowId, 'b_out')).toBe(3);
    expect(await valueOf(runId, w.workflowId, 'c_out')).toBe(4);
  });

  it('AC 3: a save that would create a cycle is rejected and persists nothing', async () => {
    const w = await workflow();
    await addBlock(w.pages[1].id, 'Support', {
      code: 'emit({ support_total: input.net_income * 2 });',
      inputs: [{ key: 'net_income', required: true }],
      outputs: [{ key: 'support_total', type: 'number' }],
    }, 1);

    const before = await getOwnerDb().select().from(schema.steps)
      .where(eq(schema.steps.workflowId, w.workflowId));

    // This closes the loop: it consumes support_total and produces net_income,
    // which the block above consumes.
    const rejected = await agent.post(`/api/pages/${w.pages[1].id}/steps`).send({
      type: 'js_question',
      title: 'Net income',
      config: {
        code: 'emit({ net_income: input.support_total + 1 });',
        inputs: [{ key: 'support_total', required: true }],
        outputs: [{ key: 'net_income', type: 'number' }],
      },
      order: 2,
    });

    expect(rejected.status).toBe(400);
    expect(JSON.stringify(rejected.body)).toMatch(/cycle/i);
    // Names the variables, in the author's vocabulary rather than step ids.
    expect(JSON.stringify(rejected.body)).toMatch(/support_total|net_income/);

    // Nothing persisted: no new question step, and no virtual output step for
    // the rejected block's declared output.
    const after = await getOwnerDb().select().from(schema.steps)
      .where(eq(schema.steps.workflowId, w.workflowId));
    expect(after).toHaveLength(before.length);
    expect(after.some(step => step.alias === 'net_income')).toBe(false);
  });

  it('AC 5: two blocks declaring the SAME output alias are rejected', async () => {
    const w = await workflow();
    await addBlock(w.pages[1].id, 'First writer', {
      code: 'emit({ shared_total: input.income + 1 });',
      inputs: [{ key: 'income', required: true }],
      outputs: [{ key: 'shared_total', type: 'number' }],
    }, 1);

    const before = await getOwnerDb().select().from(schema.steps)
      .where(eq(schema.steps.workflowId, w.workflowId));

    // One writer per variable is what makes the graph a static DAG; a second
    // writer must be refused rather than silently rewiring the graph.
    const rejected = await agent.post(`/api/pages/${w.pages[1].id}/steps`).send({
      type: 'js_question',
      title: 'Second writer',
      config: {
        code: 'emit({ shared_total: input.income + 2 });',
        inputs: [{ key: 'income', required: true }],
        outputs: [{ key: 'shared_total', type: 'number' }],
      },
      order: 2,
    });

    // The rejection itself is what is asserted -- not merely that the first
    // save succeeded, which would pass even with no constraint at all.
    expect(rejected.status).toBeGreaterThanOrEqual(400);

    const after = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, w.workflowId), eq(schema.steps.alias, 'shared_total')));
    expect(after.filter(step => step.deletedAt === null)).toHaveLength(1);
    expect(before.length).toBeLessThanOrEqual(
      (await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, w.workflowId))).length
    );
  });

  it('cross-tenant: a block in another tenant workflow never enters this graph', async () => {
    const w = await workflow();
    await addBlock(w.pages[1].id, 'Mine', {
      code: 'emit({ mine_total: input.income + 1 });',
      inputs: [{ key: 'income', required: true }],
      outputs: [{ key: 'mine_total', type: 'number' }],
    }, 1);

    const foreign = await setupIntegrationTest({ tenantName: `CB-4 foreign ${nanoid()}`, createProject: true });
    try {
      const foreignAgent = createAuthenticatedAgent(foreign.baseURL, foreign.authToken);
      const created = await foreignAgent.post('/api/workflows')
        .send({ title: `Foreign ${nanoid()}`, projectId: foreign.projectId }).expect(201);
      const foreignWorkflowId = created.body.id as string;
      const [foreignPage] = await getOwnerDb().insert(schema.pages)
        .values([{ workflowId: foreignWorkflowId, title: 'Foreign page', order: 1 }]).returning();

      // Same alias as the block above. Graph construction is scoped to ONE
      // workflow, so this is legal and must not collide, cycle, or be pulled
      // into the other tenant's ordering.
      const response = await foreignAgent.post(`/api/pages/${foreignPage.id}/steps`).send({
        type: 'js_question',
        title: 'Foreign block',
        config: {
          code: 'emit({ mine_total: 1 });',
          inputs: [],
          outputs: [{ key: 'mine_total', type: 'number' }],
        },
        order: 1,
      });
      expect(response.status).toBe(201);

      await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, foreignWorkflowId));
    } finally {
      await foreign.cleanup();
    }
  });
});

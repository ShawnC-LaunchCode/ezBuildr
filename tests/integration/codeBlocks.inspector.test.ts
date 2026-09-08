import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { codeBlockRunRepository } from '../../server/repositories/CodeBlockRunRepository';
import { stepRepository } from '../../server/repositories';
import { createAuthenticatedAgent, createTestUser, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { expectCrossTenantDenied } from '../helpers/expectDenied';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('CB-9 inspector API', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pages: string[];
  let adults: string;
  let children: string;
  let blockId: string;
  let outputId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-9 inspector', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const workflow = await agent.post('/api/workflows')
      .send({ title: `CB-9 inspector ${randomUUID()}`, projectId: ctx.projectId }).expect(201);
    workflowId = workflow.body.id as string;
    const [first] = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId));
    const second = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: 'Children' }).expect(201);
    const third = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: 'Confirm' }).expect(201);
    pages = [first.id, second.body.id as string, third.body.id as string];
    const a = await agent.post(`/api/pages/${pages[0]}/steps`).send({ type: 'number', title: 'Adults', alias: 'num_adults', config: {} }).expect(201);
    const c = await agent.post(`/api/pages/${pages[1]}/steps`).send({ type: 'number', title: 'Children', alias: 'num_children', config: {} }).expect(201);
    adults = a.body.id as string;
    children = c.body.id as string;
    const block = await agent.post(`/api/pages/${pages[1]}/steps`).send({
      type: 'js_question', title: 'Party size', alias: 'partySizeBlock',
      config: { code: 'emit({ party_size: input.num_adults + input.num_children });',
        inputs: [{ key: 'num_adults', required: true }, { key: 'num_children', required: true }],
        outputs: [{ key: 'party_size', type: 'number' }], repeat: 'onChange' },
    }).expect(201);
    blockId = block.body.id as string;
    const [output] = await getOwnerDb().select().from(schema.steps).where(and(
      eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'party_size')));
    outputId = output.id;
    const [foreign] = await getOwnerDb().insert(schema.tenants).values({ name: `CB-9 foreign ${randomUUID()}`, plan: 'pro' }).returning();
    foreignTenantId = foreign.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });
  async function preview(): Promise<string> {
    const response = await agent.post(`/api/workflows/${workflowId}/preview-runs`).send({}).expect(201);
    return response.body.runId as string;
  }
  async function advance(runId: string, pageId: string, values: Array<{ stepId: string; value: number }>) {
    return agent.post(`/api/runs/${runId}/pages/${pageId}/advance`)
      .send({ values, submissionKey: randomUUID() }).expect(200);
  }

  it('supplies real virtual metadata omitted from pinned runtime, without inventing a state row', async () => {
    const runId = await preview();
    const runtime = await agent.get(`/api/runs/${runId}/runtime`).expect(200);
    // Retained diagnostic for CB-B7: inspector must not depend on runtime containing this step.
    expect(runtime.body.data.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: outputId })]));
    const response = await agent.get(`/api/runs/${runId}/code-blocks`).expect(200);
    expect(response.body.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: outputId, alias: 'party_size', isVirtual: true, declaredType: 'number', source: 'code block', blockStepId: blockId }),
      expect.objectContaining({ stepId: adults, alias: 'num_adults', isVirtual: false, source: 'question' }),
    ]));
    expect(response.body.blockStates).toEqual([]);
    expect(response.body.variables).not.toEqual(expect.arrayContaining([expect.objectContaining({ stepId: blockId })]));
  });

  it('returns persisted waiting, fired and unchanged states matching each advance and computed value', async () => {
    const runId = await preview();
    const one = await advance(runId, pages[0], [{ stepId: adults, value: 2 }]);
    expect(one.body.data.blockStates).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: blockId, status: 'skipped_unready', pendingInputs: ['num_children'] })]));
    const initialRead = await agent.get(`/api/runs/${runId}/code-blocks`).expect(200);
    expect(initialRead.body.blockStates).toEqual(one.body.data.blockStates);
    const two = await advance(runId, pages[1], [{ stepId: children, value: 3 }]);
    expect(two.body.data.values[outputId]).toBe(5);
    expect(two.body.data.blockStates).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: blockId, status: 'fired' })]));
    const three = await advance(runId, pages[2], []);
    expect(three.body.data.values[outputId]).toBe(5);
    expect(three.body.data.blockStates).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: blockId, status: 'skipped_unchanged' })]));
    const read = await agent.get(`/api/runs/${runId}/code-blocks`).expect(200);
    expect(read.body.blockStates).toEqual(three.body.data.blockStates);
    const row = await codeBlockRunRepository.findByRunAndStep(runId, blockId);
    expect(row?.status).toBe('skipped_unchanged');
  });

  it('denies another tenant BEFORE reading either block rows or variable metadata', async () => {
    const runId = await preview();
    const states = vi.spyOn(codeBlockRunRepository, 'findByRunId');
    const variables = vi.spyOn(stepRepository, 'findByWorkflowIdWithAliases');
    await agent.get(`/api/runs/${runId}/code-blocks`).expect(200);
    expect(states).toHaveBeenCalledTimes(1);
    expect(variables).toHaveBeenCalledTimes(1);
    states.mockClear(); variables.mockClear();
    const denied = await request(ctx.baseURL).get(`/api/runs/${runId}/code-blocks`).set('Authorization', `Bearer ${foreignToken}`);
    expectCrossTenantDenied(denied.status);
    expect(denied.body).not.toHaveProperty('variables');
    expect(denied.body).not.toHaveProperty('blockStates');
    expect(states).not.toHaveBeenCalled();
    expect(variables).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated, malformed and missing run requests without reading states', async () => {
    const states = vi.spyOn(codeBlockRunRepository, 'findByRunId');
    await request(ctx.baseURL).get(`/api/runs/${randomUUID()}/code-blocks`).expect(401);
    await agent.get('/api/runs/not-a-uuid/code-blocks').expect(400);
    await agent.get(`/api/runs/${randomUUID()}/code-blocks`).expect(404);
    expect(states).not.toHaveBeenCalled();
  });

  it('refuses a retired preview before reading its states', async () => {
    const runId = await preview();
    await agent.delete(`/api/preview-runs/${runId}`).expect(204);
    const states = vi.spyOn(codeBlockRunRepository, 'findByRunId');
    await agent.get(`/api/runs/${runId}/code-blocks`).expect(404);
    expect(states).not.toHaveBeenCalled();
  });

  it('returns the real sandbox error message from its persisted row', async () => {
    await agent.put(`/api/steps/${blockId}`).send({ config: {
      code: 'throw new Error("CB9 deliberate error");', inputs: [],
      outputs: [{ key: 'party_size', type: 'number' }], repeat: 'onChange',
    } }).expect(200);
    const runId = await preview();
    const submitted = await advance(runId, pages[0], [{ stepId: adults, value: 2 }]);
    const read = await agent.get(`/api/runs/${runId}/code-blocks`).expect(200);
    expect(read.body.blockStates).toEqual(submitted.body.data.blockStates);
    expect(read.body.blockStates).toEqual(expect.arrayContaining([expect.objectContaining({
      stepId: blockId, status: 'error', errorMessage: expect.stringContaining('CB9 deliberate error'),
    })]));
  });
});

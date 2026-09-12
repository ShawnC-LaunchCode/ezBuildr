import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { JsQuestionConfig } from '@shared/types/steps';

import { ScriptEngine } from '../../server/services/scripting/ScriptEngine';
import { createAuthenticatedAgent, createTestUser, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('CB-5 derivation persistence', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let foreignTenantId: string;
  let foreignToken: string;
  const engine = new ScriptEngine();

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-5 derivation', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const workflow = await agent.post('/api/workflows').send({ title: `Derivation ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    workflowId = workflow.body.id as string;
    const page = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: 'Calculations' }).expect(201);
    pageId = page.body.id as string;
    const [foreign] = await getOwnerDb().insert(schema.tenants).values({ name: `Foreign ${nanoid()}`, plan: 'pro' }).returning();
    foreignTenantId = foreign.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });
  afterAll(async () => {
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  async function reload(id: string): Promise<JsQuestionConfig> {
    const response = await agent.get(`/api/steps/${id}`).expect(200);
    return response.body.config as JsQuestionConfig;
  }

  it('derives on create and update, persists through the real API and preserves manual edits on re-save', async () => {
    const code = 'const support_total = input.income_a; emit({ support_total, extra_total: 2 });';
    const validation = await engine.validate({ language: 'javascript', code });
    expect(validation.derivedInputs).toEqual(['income_a']);
    expect(validation.derivedOutputs).toEqual(['support_total', 'extra_total']);
    const created = await agent.post(`/api/pages/${pageId}/steps`).send({
      type: 'js_question', title: 'Support calculation',
      config: { code, inputs: [], outputs: [{ key: 'support_total', type: 'number' }] },
    }).expect(201);
    const id = created.body.id as string;
    const saved = await reload(id);
    expect(saved.inputs).toEqual([{ key: 'income_a', required: true }]);
    expect(saved.outputs).toEqual([{ key: 'support_total', type: 'number' }, { key: 'extra_total', type: 'object' }]);
    const [row] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, id));
    expect(row.config).toEqual(saved);
    saved.inputs = [{ key: 'income_a', required: false }, { key: 'manual_only', required: false }];
    saved.outputs[1].type = 'number';
    saved.code = 'emit({ support_total: input.income_a, extra_total: input.new_income, added_total: 3 });';
    expect((await engine.validate({ language: 'javascript', code: saved.code })).derivedInputs).toEqual(['income_a', 'new_income']);
    await agent.put(`/api/steps/${id}`).send({ config: saved }).expect(200);
    const updated = await reload(id);
    expect(updated.inputs).toEqual([...saved.inputs, { key: 'new_income', required: true }]);
    expect(updated.outputs).toEqual([...saved.outputs, { key: 'added_total', type: 'object' }]);
    await agent.put(`/api/steps/${id}`).send({ config: updated }).expect(200);
    expect(await reload(id)).toEqual(updated);
  });

  it.each([
    ['input', 'const k = "manual"; emit({ dynamic_input_out: input.static_input + input[k] });', 'dynamic_input_out'],
    ['output', 'const obj = {}; if (input.static_input) { emit({ dynamic_output_out: 1, static_extra: 2 }); } else { emit(obj); }', 'dynamic_output_out'],
  ])('dynamic %s warns without blocking save or discarding static keys', async (kind, code, outputKey) => {
    const validation = await engine.validate({ language: 'javascript', code });
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain(`Dynamic ${kind} access: declare ${kind} keys manually; they cannot all be derived from code.`);
    const created = await agent.post(`/api/pages/${pageId}/steps`).send({
      type: 'js_question', title: `Dynamic ${kind}`,
      config: { code, inputs: [], outputs: [{ key: outputKey, type: 'object' }] },
    }).expect(201);
    const saved = await reload(created.body.id as string);
    expect(saved.inputs).toEqual([{ key: 'static_input', required: true }]);
    expect(saved.outputs.map(output => output.key)).toEqual(kind === 'input' ? [outputKey] : [outputKey, 'static_extra']);
  });

  it('refuses a foreign tenant saving derived config into this workflow', async () => {
    const foreign = createAuthenticatedAgent(ctx.baseURL, foreignToken);
    const code = 'emit({ denied_out: input.income_a });';
    const validation = await engine.validate({ language: 'javascript', code });
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const response = await foreign.post(`/api/pages/${pageId}/steps`).send({
      type: 'js_question', title: 'Denied', config: {
        code,
        inputs: validation.derivedInputs?.map(key => ({ key, required: true })),
        outputs: validation.derivedOutputs?.map(key => ({ key, type: 'object' })),
      },
    });
    expect([403, 404]).toContain(response.status);
    expect(await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId))).toEqual(before);
  });
});


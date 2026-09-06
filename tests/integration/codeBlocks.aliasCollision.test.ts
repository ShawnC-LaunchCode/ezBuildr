import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { stepService } from '../../server/services/StepService';
import { lifecycleHookService } from '../../server/services/scripting/LifecycleHookService';
import { runWithTenantContext, withTenant } from '../../server/utils/rlsContext';
import { createAuthenticatedAgent, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

function block(title: string, key: string) {
  return {
    type: 'js_question', title,
    config: { code: `emit({ ${key}: 1 });`, inputs: [], outputs: [{ key, type: 'number' }] },
  };
}

describe.sequential('CB-7 alias ownership', () => {
  let ctx: IntegrationTestContext;
  let foreign: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflowIds: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-7 aliases', createProject: true });
    foreign = await setupIntegrationTest({ tenantName: 'CB-7 foreign aliases', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterAll(async () => {
    for (const id of workflowIds) {
      await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id));
    }
    await foreign.cleanup();
    await ctx.cleanup();
  });

  async function workflow(context = ctx) {
    const client = createAuthenticatedAgent(context.baseURL, context.authToken);
    const created = await client.post('/api/workflows')
      .send({ title: `Aliases ${nanoid()}`, projectId: context.projectId }).expect(201);
    const id = created.body.id as string;
    workflowIds.push(id);
    const page = await client.post(`/api/workflows/${id}/pages`).send({ title: 'Calculations' }).expect(201);
    return { id, pageId: page.body.id as string, client };
  }

  async function rows(workflowId: string) {
    return getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), isNull(schema.steps.deletedAt)));
  }

  it('names the owning block on create and question collision, with no partial writes', async () => {
    const w = await workflow();
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Block A', 'total')).expect(201);
    const before = await rows(w.id);
    const rejected = await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Block B', 'total'));
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('total');
    expect(rejected.body.message).toContain('Block A');
    expect(rejected.body.message).not.toContain('23505');
    const question = await agent.post(`/api/pages/${w.pageId}/steps`)
      .send({ type: 'number', title: 'Question B', alias: 'total', config: { validation: {} } });
    expect(question.status).toBe(400);
    expect(question.body.message).toContain('Block A');
    expect(await rows(w.id)).toEqual(before);
  });

  it('names an existing question when a block output collides', async () => {
    const w = await workflow();
    await agent.post(`/api/pages/${w.pageId}/steps`)
      .send({ type: 'number', title: 'Income question', alias: 'income', config: { validation: {} } }).expect(201);
    const rejected = await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Income block', 'income'));
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('income');
    expect(rejected.body.message).toContain('Income question');
    expect(await rows(w.id)).toHaveLength(1);
  });

  it('rejects a genuine case difference: Total versus total', async () => {
    const w = await workflow();
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Capital owner', 'Total')).expect(201);
    const rejected = await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Lowercase contender', 'total'));
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('total');
    expect(rejected.body.message).toContain('Capital owner');
    expect((await rows(w.id)).filter(row => row.isVirtual).map(row => row.alias)).toEqual(['Total']);
  });

  it('allows immediate reuse after soft deletion, preserving the deleted rows', async () => {
    const w = await workflow();
    const first = await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Deleted block', 'total')).expect(201);
    const before = await rows(w.id);
    await agent.delete(`/api/steps/${String(first.body.id)}`).expect(204);
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Replacement block', 'total')).expect(201);
    const all = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, w.id));
    expect(all.filter(row => before.some(old => old.id === row.id))).toHaveLength(2);
    expect(all.filter(row => before.some(old => old.id === row.id)).every(row => row.deletedAt !== null)).toBe(true);
    expect((await rows(w.id)).filter(row => row.alias === 'total')).toHaveLength(1);
  });

  it('persists the same alias in workflows belonging to different tenants', async () => {
    const a = await workflow();
    const b = await workflow(foreign);
    await a.client.post(`/api/pages/${a.pageId}/steps`).send(block('Tenant A block', 'total')).expect(201);
    await b.client.post(`/api/pages/${b.pageId}/steps`).send(block('Tenant B block', 'total')).expect(201);
    expect(ctx.tenantId).not.toBe(foreign.tenantId);
    expect((await rows(a.id)).filter(row => row.alias === 'total')).toHaveLength(1);
    expect((await rows(b.id)).filter(row => row.alias === 'total')).toHaveLength(1);
  });

  it('rejects conflicting updates atomically and permits retaining a block’s own output', async () => {
    const w = await workflow();
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Original owner', 'total')).expect(201);
    const second = await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Second block', 'other')).expect(201);
    const id = String(second.body.id);
    await agent.put(`/api/steps/${id}`).send({ config: block('Second block', 'other').config }).expect(200);
    const before = await rows(w.id);
    const rejected = await agent.put(`/api/steps/${id}`).send({ config: block('Second block', 'total').config });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('Original owner');
    expect(await rows(w.id)).toEqual(before);
  });

  it('translates a real wrapped unique violation when restoring an alias already reused', async () => {
    const w = await workflow();
    const old = await agent.post(`/api/pages/${w.pageId}/steps`)
      .send({ type: 'number', title: 'Old question', alias: 'total', config: { validation: {} } }).expect(201);
    const oldId = String(old.body.id);
    await agent.delete(`/api/steps/${oldId}`).expect(204);
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Replacement owner', 'total')).expect(201);
    // restoreStep reaches the real unique index without a preflight alias check.
    // On the ticket base this rejects with DrizzleQueryError (cause.code 23505).
    const error: unknown = await runWithTenantContext(ctx.tenantId, () => stepService.restoreStep(oldId, ctx.userId))
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ statusCode: 400, message: expect.stringContaining('total') });
    expect(error).toMatchObject({ message: expect.stringContaining('Replacement owner') });
    const [deleted] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, oldId));
    expect(deleted.deletedAt).not.toBeNull();
  });

  it('prevents a lifecycle hook from becoming a second writer for a block output', async () => {
    const w = await workflow();
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Sole writer', 'total')).expect(201);
    await agent.post(`/api/workflows/${w.id}/lifecycle-hooks`).send({
      name: 'Second writer', phase: 'beforePage', language: 'javascript',
      code: 'emit({ fresh: 1, Total: 99 });', inputKeys: [], outputKeys: ['fresh', 'Total'], enabled: true,
    }).expect(201);
    const run = await agent.post(`/api/workflows/${w.id}/runs`).send({}).expect(201);
    const result = await runWithTenantContext(ctx.tenantId, () => lifecycleHookService.executeHooksForPhase({
      workflowId: w.id, runId: String(run.body.data.runId), phase: 'beforePage', pageId: w.pageId, data: {},
    }));
    expect(result.success).toBe(false);
    expect(result.errors?.[0].error).toContain('cannot overwrite existing variable "Total"');
    expect(result.data).toEqual({});
  });

  it('translates the unique violation inside a caller transaction without aborting that transaction', async () => {
    const w = await workflow();
    const first = await agent.post(`/api/pages/${w.pageId}/steps`)
      .send({ type: 'number', title: 'Old question', alias: 'total', config: { validation: {} } }).expect(201);
    const oldId = String(first.body.id);
    await agent.delete(`/api/steps/${oldId}`).expect(204);
    await agent.post(`/api/pages/${w.pageId}/steps`).send(block('Current owner', 'total')).expect(201);
    await withTenant(ctx.tenantId, async tx => {
      await expect(stepService.restoreStep(oldId, ctx.userId, tx)).rejects.toMatchObject({
        statusCode: 400, message: expect.stringContaining('Current owner'),
      });
      const [old] = await tx.select().from(schema.steps).where(eq(schema.steps.id, oldId));
      expect(old.deletedAt).not.toBeNull();
    });
  });
});

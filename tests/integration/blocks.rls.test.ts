import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';
import { expectCrossTenantDenied } from '../helpers/expectDenied';

/**
 * CLN-7: block CRUD through the real routes, which must hold under a genuine
 * non-owner role (`RLS_RESTRICTED=true`), not only as the owner.
 *
 * The block services used to read `pages` and write `steps` on the bare pool.
 * Both tables are RLS-covered, so under enforcement:
 * - creating any data block threw "workflow has no pages";
 * - the virtual-step insert failed its policy;
 * - renaming a block's output variable was an UPDATE that matched zero rows
 *   and failed silently.
 *
 * No RLS-gated suite had ever created a block through the route before
 * `listTools.listSource.test.ts` (CLN-3). Fixtures and observations use
 * `getOwnerDb()`, so this suite asserts what the APP can do, never what the
 * harness can see.
 */
describe.sequential('CLN-7: block CRUD under RLS', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let foreignAgent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let foreignTenantId: string;

  const created: Record<'list_tools' | 'read_table' | 'query', { blockId: string; virtualStepId: string }> = {
    list_tools: { blockId: '', virtualStepId: '' },
    read_table: { blockId: '', virtualStepId: '' },
    query: { blockId: '', virtualStepId: '' },
  };
  let validateBlockId: string;

  async function stepAlias(stepId: string): Promise<string | null | undefined> {
    const [row] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
    return row?.alias;
  }

  async function blockRow(blockId: string) {
    const [row] = await getOwnerDb().select().from(schema.blocks).where(eq(schema.blocks.id, blockId));
    return row;
  }

  async function blockCount(): Promise<number> {
    return (await getOwnerDb().select().from(schema.blocks).where(eq(schema.blocks.workflowId, workflowId))).length;
  }

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CLN-7 blocks', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent.post('/api/workflows')
      .send({ title: `Blocks RLS ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    workflowId = workflow.body.id as string;

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId, title: 'Blocks page', order: 0,
    }).returning();
    pageId = page.id;

    const [foreignTenant] = await getOwnerDb().insert(schema.tenants)
      .values({ name: `CLN-7 foreign ${nanoid()}`, plan: 'pro' }).returning();
    foreignTenantId = foreignTenant.id;
    foreignAgent = createAuthenticatedAgent(ctx.baseURL, (await createTestUser(ctx, 'owner', foreignTenantId)).token);
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('creates list_tools, read_table and query blocks, each with its aliased virtual step', async () => {
    const cases = [
      { type: 'list_tools' as const, alias: 'lt_out', config: { sourceListVar: 'src_list', outputListVar: 'lt_out' } },
      { type: 'read_table' as const, alias: 'rt_out', config: { dataSourceId: randomUUID(), tableId: randomUUID(), outputKey: 'rt_out' } },
      { type: 'query' as const, alias: 'q_out', config: { queryId: randomUUID(), outputVariableName: 'q_out' } },
    ];

    for (const c of cases) {
      const response = await agent.post(`/api/workflows/${workflowId}/blocks`)
        .send({ type: c.type, phase: 'onNext', name: `${c.type} block`, config: c.config })
        .expect(201);
      const block = response.body.data as { id: string; virtualStepId: string; type: string };
      expect(block.type).toBe(c.type);
      expect(block.virtualStepId).toBeTruthy();
      created[c.type] = { blockId: block.id, virtualStepId: block.virtualStepId };

      // The virtual step really exists, carries the output alias, and is virtual.
      const [step] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, block.virtualStepId));
      expect(step).toMatchObject({ alias: c.alias, isVirtual: true, workflowId });
    }
  });

  it('renames the virtual step when the output variable changes (a silent no-op under RLS before CLN-7)', async () => {
    await agent.put(`/api/blocks/${created.list_tools.blockId}`)
      .send({ config: { outputListVar: 'lt_renamed' } }).expect(200);
    expect(await stepAlias(created.list_tools.virtualStepId)).toBe('lt_renamed');

    await agent.put(`/api/blocks/${created.read_table.blockId}`)
      .send({ config: { outputKey: 'rt_renamed' } }).expect(200);
    expect(await stepAlias(created.read_table.virtualStepId)).toBe('rt_renamed');

    await agent.put(`/api/blocks/${created.query.blockId}`)
      .send({ config: { outputVariableName: 'q_renamed' } }).expect(200);
    expect(await stepAlias(created.query.virtualStepId)).toBe('q_renamed');
  });

  it('creates a page-scoped generic block, lists every block, reorders it and deletes it', async () => {
    const response = await agent.post(`/api/workflows/${workflowId}/blocks`)
      .send({ type: 'validate', phase: 'onPageSubmit', pageId, config: { rules: [] } })
      .expect(201);
    validateBlockId = response.body.data.id as string;
    expect((await blockRow(validateBlockId))?.pageId).toBe(pageId);

    // Listing is what came back EMPTY under enforcement; assert the real ids.
    const listed = await agent.get(`/api/workflows/${workflowId}/blocks`).expect(200);
    const ids = (listed.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining([
      created.list_tools.blockId, created.read_table.blockId, created.query.blockId, validateBlockId,
    ]));

    await agent.get(`/api/blocks/${validateBlockId}`).expect(200);

    await agent.put(`/api/workflows/${workflowId}/blocks/reorder`)
      .send({ blocks: [{ id: validateBlockId, order: 7 }] }).expect(200);
    expect((await blockRow(validateBlockId))?.order).toBe(7);

    await agent.delete(`/api/blocks/${validateBlockId}`).expect(200);
    expect(await blockRow(validateBlockId)).toBeUndefined();
  });

  it('creates a List Tools block through the Choice editor\'s create-list-tools route', async () => {
    const response = await agent.post(`/api/workflows/${workflowId}/steps/${randomUUID()}/create-list-tools`)
      .send({ sourceListVar: 'choice_src', pageId })
      .expect(201);
    const block = response.body.data.block as { id: string; virtualStepId: string };
    expect(response.body.data.outputVar).toBe('choice_src_filtered');
    expect(await stepAlias(block.virtualStepId)).toBe('choice_src_filtered');
  });

  it('denies a foreign tenant create, read, update and delete, and changes nothing', async () => {
    const before = await blockCount();
    const target = created.list_tools;

    expectCrossTenantDenied((await foreignAgent.post(`/api/workflows/${workflowId}/blocks`)
      .send({ type: 'list_tools', phase: 'onNext', name: 'intruder', config: { sourceListVar: 'x', outputListVar: 'intruder_out' } })).status);
    expectCrossTenantDenied((await foreignAgent.get(`/api/workflows/${workflowId}/blocks`)).status);
    expectCrossTenantDenied((await foreignAgent.get(`/api/blocks/${target.blockId}`)).status);
    expectCrossTenantDenied((await foreignAgent.put(`/api/blocks/${target.blockId}`)
      .send({ config: { outputListVar: 'hijacked' } })).status);
    expectCrossTenantDenied((await foreignAgent.delete(`/api/blocks/${target.blockId}`)).status);

    expect(await blockCount()).toBe(before);
    expect(await blockRow(target.blockId)).toBeDefined();
    expect(await stepAlias(target.virtualStepId)).toBe('lt_renamed');
  });
});

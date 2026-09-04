import { and, eq, inArray, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { runDataService } from '../../server/services/workflow-runs/RunDataService';
import { withTenant } from '../../server/utils/rlsContext';
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

const OUTPUTS = [
  { key: 'alpha', type: 'string' as const },
  { key: 'count', type: 'number' as const },
  { key: 'enabled', type: 'boolean' as const },
];

describe.sequential('CB-1 Code Block multi-output vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let codeBlockId: string;
  let virtualSteps: Array<typeof schema.steps.$inferSelect>;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'CB-1 Code Blocks',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Code Block workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Calculations' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `CB-1 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('saves three declared outputs as exactly three virtual computed steps and denies a foreign tenant', async () => {
    const create = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'js_question',
        title: 'Multi output calculation',
        alias: 'multiOutputCalculation',
        config: {
          code: "emit({ alpha: 'ready', count: 3, enabled: true });",
          inputs: [],
          outputs: OUTPUTS,
          timeoutMs: 1000,
        },
      })
      .expect(201);
    codeBlockId = create.body.id as string;

    expect(create.body.type).toBe('js_question');
    expect(create.body.config).toMatchObject({ inputs: [], outputs: OUTPUTS });
    expect(create.body.config).not.toHaveProperty('display');
    expect(create.body.config).not.toHaveProperty('inputKeys');
    expect(create.body.config).not.toHaveProperty('outputKey');

    virtualSteps = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(and(eq(schema.steps.pageId, pageId), eq(schema.steps.isVirtual, true), isNull(schema.steps.deletedAt)));
    expect(virtualSteps).toHaveLength(3);
    expect(virtualSteps.map(step => ({ alias: step.alias, type: step.type })).sort((a, b) => String(a.alias).localeCompare(String(b.alias))))
      .toEqual([
        { alias: 'alpha', type: 'computed' },
        { alias: 'count', type: 'computed' },
        { alias: 'enabled', type: 'computed' },
      ]);

    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const denied = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({
        type: 'js_question',
        title: 'Foreign Code Block',
        config: { code: 'emit({ foreign: true });', inputs: [], outputs: [{ key: 'foreign', type: 'boolean' }] },
      });
    // 403, not 404: a cross-tenant save fails the service's authorization
    // check, and `classifyRouteError` maps "Access denied" (and the RLS
    // no-tenant-in-context throw) to 403 -- only a "not found" message maps to
    // 404. See server/utils/routeErrors.ts and CLAUDE.md convention 2. Pinned
    // to the exact code rather than a 403/404 set so a future change to the
    // denial path cannot pass silently.
    expect(denied.status).toBe(403);
    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
  });

  it('persists every emitted value against its virtual step and exposes exact non-null aliases', async () => {
    const createRun = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    const submit = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [] })
      .expect(200);
    expect(submit.body).toMatchObject({ success: true });

    const virtualIds = virtualSteps.map(step => step.id);
    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), inArray(schema.stepValues.stepId, virtualIds)));
    expect(saved).toHaveLength(3);
    const valueByStepId = Object.fromEntries(saved.map(value => [value.stepId, value.value]));
    expect(valueByStepId[virtualSteps.find(step => step.alias === 'alpha')!.id]).toBe('ready');
    expect(valueByStepId[virtualSteps.find(step => step.alias === 'count')!.id]).toBe(3);
    expect(valueByStepId[virtualSteps.find(step => step.alias === 'enabled')!.id]).toBe(true);

    const runData = await withTenant(ctx.tenantId, tx => runDataService.buildForRun(runId, workflowId, tx));
    expect(runData.byAlias).toMatchObject({ alpha: 'ready', count: 3, enabled: true });
    expect(runData.byAlias.alpha).not.toBeNull();
    expect(runData.byAlias.count).not.toBeNull();
    expect(runData.byAlias.enabled).not.toBeNull();
  });

  it('fails on an undeclared emitted key, names it, and nulls the whole output set', async () => {
    await agent
      .put(`/api/steps/${codeBlockId}`)
      .send({
        config: {
          code: "emit({ alpha: 'bad', count: 9, enabled: false, surprise: 'not declared' });",
          inputs: [],
          outputs: OUTPUTS,
          timeoutMs: 1000,
        },
      })
      .expect(200);

    const createRun = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;
    const submit = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [] })
      .expect(200);

    expect(submit.body.success).toBe(false);
    expect(submit.body.errors).toContainEqual(expect.stringContaining('surprise'));
    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(and(
        eq(schema.stepValues.runId, runId),
        inArray(schema.stepValues.stepId, virtualSteps.map(step => step.id)),
      ));
    expect(saved).toHaveLength(0);
    const runData = await withTenant(ctx.tenantId, tx => runDataService.buildForRun(runId, workflowId, tx));
    expect(runData.byAlias).toMatchObject({ alpha: null, count: null, enabled: null });
  });

  it('loads and runs a legacy single-output config through the adapter', async () => {
    const legacyPage = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Legacy calculation' })
      .expect(201);
    const legacyPageId = legacyPage.body.id as string;
    const [legacyStep] = await getOwnerDb().insert(schema.steps).values({
      workflowId,
      pageId: legacyPageId,
      type: 'js_question',
      title: 'Legacy Code Block',
      alias: 'legacy_result',
      order: 1,
      required: false,
      config: {
        display: 'hidden',
        code: 'emit(42);',
        inputKeys: [],
        outputKey: 'legacy_result',
        timeoutMs: 1000,
      },
    }).returning();

    const loaded = await agent.get(`/api/pages/${legacyPageId}/steps`).expect(200);
    const loadedLegacy = (loaded.body as Array<Record<string, unknown>>).find(step => step.id === legacyStep.id);
    expect(loadedLegacy?.config).toMatchObject({
      code: 'emit(42);',
      inputs: [],
      outputs: [{ key: 'legacy_result', type: 'object' }],
    });

    const createRun = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;
    const submit = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${legacyPageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [] })
      .expect(200);
    expect(submit.body.success).toBe(true);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, legacyStep.id)));
    expect(saved).toHaveLength(1);
    expect(saved[0]?.value).toBe(42);
  });

  it('soft-deletes every virtual output and immediately frees all output aliases', async () => {
    await agent.delete(`/api/steps/${codeBlockId}`).expect(204);

    const deleted = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(inArray(schema.steps.id, [codeBlockId, ...virtualSteps.map(step => step.id)]));
    expect(deleted).toHaveLength(4);
    expect(deleted.every(step => step.deletedAt !== null)).toBe(true);

    const replacement = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'js_question',
        title: 'Replacement calculation',
        alias: 'replacementCalculation',
        config: {
          code: "emit({ alpha: 'new', count: 1, enabled: true });",
          inputs: [],
          outputs: OUTPUTS,
        },
      })
      .expect(201);
    expect(replacement.body.type).toBe('js_question');
  });
});

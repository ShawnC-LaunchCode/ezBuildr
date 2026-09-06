/**
 * CB-8 AC 6: the editor's test panel, end to end.
 *
 * `POST /api/steps/:stepId/code-block/test` runs the author's code in the SAME
 * `isolated-vm` sandbox the run engine uses. Nothing here is stubbed — a mocked
 * endpoint would prove the panel renders a fixture and nothing about whether
 * the block actually works.
 *
 * The cross-tenant case asserts NO EXECUTION, not merely a denial status. A
 * route that runs the sandbox and returns 404 afterwards passes a status-only
 * check while happily executing a stranger's script, so the spy is armed on a
 * legitimate call first and only then checked for silence.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { classifySaveError } from '../../client/src/components/builder/questions/js-question/saveErrors';
import { testLimiter } from '../../server/middleware/rateLimiting';
import { scriptEngine } from '../../server/services/scripting/ScriptEngine';
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

const TEST_ROUTE = '/api/steps/:stepId/code-block/test';

type ExpressLayer = { route?: { path?: string; stack?: Array<{ handle?: unknown }> } };

/** Express 4 keeps the mounted middleware chain on the router's layer stack. */
function middlewareFor(app: Express, path: string): unknown[] {
  const stack = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack;
  const layer = stack.find(candidate => candidate.route?.path === path);
  return (layer?.route?.stack ?? []).map(entry => entry.handle);
}

describe.sequential('CB-8 Code Block test endpoint', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let stepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'CB-8 Code Block editor',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `CB-8 workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Totals' })
      .expect(201);
    pageId = page.body.id as string;

    const step = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'js_question',
        title: 'Order total',
        alias: 'orderTotalBlock',
        config: {
          code: 'emit({ order_total: input.price * input.quantity });',
          inputs: [{ key: 'price', required: true }, { key: 'quantity', required: true }],
          outputs: [{ key: 'order_total', type: 'number' }],
          timeoutMs: 1000,
        },
      })
      .expect(201);
    stepId = step.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `CB-8 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('is mounted behind hybridAuth and the shared testLimiter', async () => {
    const chain = middlewareFor(ctx.app, TEST_ROUTE);
    // A limiter that is declared and never mounted is the failure mode this
    // asserts against: an unmounted limiter is indistinguishable from a mounted
    // one at the response level, because `testLimiter` skips in NODE_ENV=test.
    expect(chain).toContain(testLimiter);
    expect(chain.length).toBeGreaterThanOrEqual(3);
    expect(await request(ctx.baseURL).post(`/api/steps/${stepId}/code-block/test`).send({}))
      .toMatchObject({ status: 401 });
  });

  it('executes the saved block in the real sandbox and returns what it emitted', async () => {
    const response = await agent
      .post(`/api/steps/${stepId}/code-block/test`)
      .send({ testData: { price: 12.5, quantity: 4 } })
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      executed: true,
      output: { order_total: 50 },
      derivedInputs: ['price', 'quantity'],
      derivedOutputs: ['order_total'],
    });
  });

  it('executes UNSAVED code from the editor, not the persisted code', async () => {
    const response = await agent
      .post(`/api/steps/${stepId}/code-block/test`)
      .send({
        code: 'emit({ order_total: input.price + input.quantity, note: "edited" });',
        testData: { price: 10, quantity: 1 },
      })
      .expect(200);

    expect(response.body.output).toEqual({ order_total: 11, note: 'edited' });

    // Proves the override did not leak into storage: the saved block still
    // multiplies.
    const [saved] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
    expect(saved.config).toMatchObject({ code: 'emit({ order_total: input.price * input.quantity });' });
  });

  it('validates without executing when no sample data is given, and surfaces CB-5 warnings', async () => {
    const executeSpy = vi.spyOn(scriptEngine, 'execute');
    const response = await agent
      .post(`/api/steps/${stepId}/code-block/test`)
      .send({ code: 'const k = "quantity"; emit({ order_total: input.price * input[k] });' })
      .expect(200);

    expect(executeSpy).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({ success: true, executed: false, derivedInputs: ['price'] });
    expect(response.body.warnings).toContain(
      'Dynamic input access: declare input keys manually; they cannot all be derived from code.'
    );
  });

  it('reports a sandbox failure as a failed run rather than a server error', async () => {
    const response = await agent
      .post(`/api/steps/${stepId}/code-block/test`)
      .send({ code: 'throw new Error("boom");', testData: {} })
      .expect(200);

    expect(response.body).toMatchObject({ success: false, executed: true });
    expect(response.body.error).toContain('boom');
  });

  it('refuses a step in another tenant WITHOUT executing anything', async () => {
    const executeSpy = vi.spyOn(scriptEngine, 'execute');

    // Arm the spy on a call that must succeed, so "not called" below cannot be
    // a spy that was never wired to the code path in the first place.
    await agent
      .post(`/api/steps/${stepId}/code-block/test`)
      .send({ testData: { price: 2, quantity: 3 } })
      .expect(200);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    executeSpy.mockClear();

    const denied = await request(ctx.baseURL)
      .post(`/api/steps/${stepId}/code-block/test`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ testData: { price: 2, quantity: 3 } });

    // 403, not 404: the step resolves, and it is `verifyAccess` that refuses.
    // `classifyRouteError` maps "Access denied" (and the RLS no-tenant throw) to
    // 403 — see server/utils/routeErrors.ts. Pinned to the exact code so a
    // change to the denial path cannot pass silently.
    expect(denied.status).toBe(403);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('404s a step that does not exist, and 400s a step that is not a Code Block', async () => {
    const missing = await agent
      .post(`/api/steps/${randomUUID()}/code-block/test`)
      .send({ testData: {} });
    expect(missing.status).toBe(404);

    const notACodeBlock = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'text', title: 'Client name', alias: 'clientName',
        config: { variant: 'short' },
      })
      .expect(201);
    const wrongType = await agent
      .post(`/api/steps/${notACodeBlock.body.id}/code-block/test`)
      .send({ testData: {} });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.message).toContain('is not a Code Block');
  });

  /**
   * CB-8 AC 7, from the other end.
   *
   * Every message below is produced by REALLY provoking the rejection through
   * the API — no phrase is retyped into the test — and then handed to the same
   * `classifySaveError` the modal uses. That is what makes the editor's inline
   * placement a fact about the server's contract rather than about a fixture:
   * reword a server error and this test goes red.
   */
  describe.sequential('save rejections route to the field that caused them', () => {
    it('CB-6: an impure helper under repeat "onChange" lands on the repeat control', async () => {
      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            code: 'emit({ order_total: helpers.date.now() });',
            inputs: [], outputs: [{ key: 'order_total', type: 'number' }],
            repeat: 'onChange',
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('impure helper');
      expect(classifySaveError(rejected.body.message as string)).toBe('repeat');
    });

    it('CB-7: an output key already owned by another step lands on the outputs panel', async () => {
      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            code: 'emit({ clientName: 1 });',
            inputs: [], outputs: [{ key: 'clientName', type: 'number' }],
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('already in use');
      expect(classifySaveError(rejected.body.message as string)).toBe('outputs');
    });

    it('CB-5: a derived output key that is not a legal variable name lands on the outputs panel', async () => {
      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            // A literal key the AST pass CAN derive but that is not a legal
            // variable name, so `validateAliasFormat` refuses it during save.
            code: 'emit({ order_total: 1, "2 bad": 1 });',
            inputs: [], outputs: [{ key: 'order_total', type: 'number' }],
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('Variable names must start with');
      expect(classifySaveError(rejected.body.message as string)).toBe('outputs');
    });

    it('CB-5: a script the AST pass refuses lands on the code field', async () => {
      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            code: 'process.exit(); emit({ order_total: 1 });',
            inputs: [], outputs: [{ key: 'order_total', type: 'number' }],
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('Script validation failed');
      expect(classifySaveError(rejected.body.message as string)).toBe('code');
    });

    it('CB-3: a missing trigger page lands on the trigger control', async () => {
      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            code: 'emit({ order_total: 1 });',
            inputs: [], outputs: [{ key: 'order_total', type: 'number' }],
            trigger: 'atPage',
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('triggerPageId');
      expect(classifySaveError(rejected.body.message as string)).toBe('trigger');
    });

    it('CB-4: a dependency cycle lands on the outputs panel', async () => {
      const second = await agent
        .post(`/api/pages/${pageId}/steps`)
        .send({
          type: 'js_question',
          title: 'Downstream block',
          alias: 'downstreamBlock',
          config: {
            code: 'emit({ downstream: input.order_total });',
            inputs: [{ key: 'order_total', required: true }],
            outputs: [{ key: 'downstream', type: 'number' }],
          },
        })
        .expect(201);
      expect(second.body.id).toBeTruthy();

      const rejected = await agent
        .put(`/api/steps/${stepId}`)
        .send({
          config: {
            code: 'emit({ order_total: input.downstream });',
            inputs: [{ key: 'downstream', required: true }],
            outputs: [{ key: 'order_total', type: 'number' }],
          },
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('cycle');
      expect(classifySaveError(rejected.body.message as string)).toBe('outputs');

      // The workflow is unchanged: a refused save persists nothing.
      const [saved] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
      expect(saved.config).toMatchObject({ code: 'emit({ order_total: input.price * input.quantity });' });
    });
  });
});

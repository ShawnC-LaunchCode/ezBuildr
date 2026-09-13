/**
 * RUN-P1 / CLN-2: `onPageEnter` blocks and `beforePage` lifecycle hooks never
 * ran. `blockRunner.runPhase` was called for `onNext`, `onPageSubmit`,
 * `onRunComplete` and `onRunStart` only -- the `onPageEnter` phase (and the
 * `beforePage` lifecycle hook it maps to inside `BlockRunner.runPhase`) was
 * never dispatched from anywhere.
 *
 * This file proves, through the real HTTP routes with the DB, `BlockRunner`,
 * `LifecycleHookService` and the sandbox unmocked:
 *  - creating a run fires the first page's `onPageEnter` phase exactly once
 *    (RunLifecycleService.executeOnRunStart, RunService.ts call sites);
 *  - navigating to a page fires that page's `onPageEnter` phase exactly once
 *    (RunExecutionCoordinator.runNext);
 *  - back-navigation (re-arriving at an already-visited page) re-fires it, a
 *    GET does not;
 *  - preview inherits the same per-block suppression as every other phase
 *    (mode threaded through, no new rule);
 *  - a cross-tenant caller is denied and writes no hook-execution log row;
 *  - Code Blocks are not evaluated an extra time because onPageEnter now runs.
 */
import { and, eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import * as schema from '@shared/schema';

import { codeBlockService } from '../../server/services/codeBlocks/CodeBlockService';
import { datavaultTablesService, datavaultColumnsService, datavaultRowsService } from '../../server/services';
import { enterTenantContextForTests, runWithTenantContext } from '../../server/utils/rlsContext';
import {
  setupIntegrationTest,
  createAuthenticatedAgent,
  createTestUser,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture writes and verification reads are the OBSERVER, not the
// application under test -- see tests/helpers/ownerDb.ts.
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('RUN-P1: onPageEnter phase dispatch', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  let agent: ReturnType<typeof createAuthenticatedAgent>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'RUN-P1 onPageEnter', createProject: true });
    factory = new TestFactory();
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /** Two pages, one non-required text step each -- nothing here blocks `/next`. */
  async function twoPageWorkflow() {
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const page1 = await factory.createPage(workflow.id, { title: 'Page 1', order: 0 });
    const page2 = await factory.createPage(workflow.id, { title: 'Page 2', order: 1 });
    await factory.createStep(page1.id, { title: 'Q1', alias: 'q1', required: false, order: 0 });
    await factory.createStep(page2.id, { title: 'Q2', alias: 'q2', required: false, order: 0 });
    return { workflow, page1, page2 };
  }

  async function createBeforePageHook(workflowId: string, pageId: string, name: string): Promise<string> {
    const res = await agent.post(`/api/workflows/${workflowId}/lifecycle-hooks`).send({
      name,
      phase: 'beforePage',
      pageId,
      language: 'javascript',
      code: 'emit({ entered: true });',
      inputKeys: [],
      outputKeys: ['entered'],
      enabled: true,
    }).expect(201);
    return res.body.data.id as string;
  }

  /** A DataVault table this suite owns, for a `write` block's real create-mode
   *  write -- the concrete "does an onPageEnter block also run" proof, and
   *  (via preview) the "does a write block still not write" proof. */
  async function createWriteTargetTable(): Promise<{ tableId: string; columnId: string }> {
    enterTenantContextForTests(ctx.tenantId);
    const database = await factory.createDatabase(ctx.projectId!, ctx.tenantId, ctx.userId);
    const table = await datavaultTablesService.createTable({
      name: `RUN-P1 table ${database.id}`,
      databaseId: database.id,
      ownerUserId: ctx.userId,
      tenantId: ctx.tenantId,
    });
    const column = await datavaultColumnsService.createColumn({
      tableId: table.id,
      name: 'Marker',
      type: 'text',
      required: false,
    }, ctx.tenantId);
    return { tableId: table.id, columnId: column.id };
  }

  async function createOnPageEnterWriteBlock(
    workflowId: string, pageId: string, tableId: string, columnId: string, value: string
  ): Promise<void> {
    await getOwnerDb().insert(schema.blocks).values({
      workflowId,
      pageId,
      type: 'write',
      phase: 'onPageEnter',
      config: {
        dataSourceId: tableId,
        tableId,
        mode: 'create',
        columnMappings: [{ columnId, value }],
      },
      order: 0,
    } as never);
  }

  async function writeTargetRows(tableId: string) {
    const { rows } = await runWithTenantContext(ctx.tenantId, () =>
      datavaultRowsService.getRowsWithOptions(ctx.tenantId, tableId, { limit: 50 }));
    return rows;
  }

  async function beforePageLogRows(runId: string) {
    return getOwnerDb().select().from(schema.scriptExecutionLog)
      .where(and(eq(schema.scriptExecutionLog.runId, runId), eq(schema.scriptExecutionLog.phase, 'beforePage')));
  }

  it('creating a run fires the first page\'s onPageEnter phase (its beforePage hook) exactly once', async () => {
    const { workflow, page1 } = await twoPageWorkflow();
    const hookId = await createBeforePageHook(workflow.id, page1.id, 'Page 1 hook');

    const created = await agent.post(`/api/workflows/${workflow.id}/runs`).send({}).expect(201);
    const runId = created.body.data.runId as string;
    expect(created.body.data.currentPageId).toBe(page1.id);

    const rows = await beforePageLogRows(runId);
    const page1Rows = rows.filter((row) => row.scriptId === hookId);
    expect(page1Rows).toHaveLength(1);
    expect(page1Rows[0].status).toBe('success');
  });

  it('navigating from page 1 to page 2 fires page 2\'s onPageEnter exactly once, runs its beforePage hook and its block, and does not evaluate Code Blocks an extra time', async () => {
    const { workflow, page1, page2 } = await twoPageWorkflow();
    const hookId = await createBeforePageHook(workflow.id, page2.id, 'Page 2 hook');
    const { tableId, columnId } = await createWriteTargetTable();
    await createOnPageEnterWriteBlock(workflow.id, page2.id, tableId, columnId, 'entered-on-page2-live');

    // A Code Block whose evaluation must not double-fire because onPageEnter
    // was added -- CB-3's evaluateAll must still run exactly once per next().
    // Title deliberately does not slug-collide with the output key ("total")
    // -- the block's own auto-derived alias colliding with its own output key
    // is a separate, unrelated 400 (StepService.validateOutputAliases).
    await agent.post(`/api/pages/${page1.id}/steps`).send({
      type: 'js_question',
      title: 'Sum block',
      config: { code: 'emit({ total: 1 });', inputs: [], outputs: [{ key: 'total', type: 'number' }] },
    }).expect(201);

    const created = await agent.post(`/api/workflows/${workflow.id}/runs`).send({}).expect(201);
    const runId = created.body.data.runId as string;

    const evaluateAllSpy = vi.spyOn(codeBlockService, 'evaluateAll');
    evaluateAllSpy.mockClear();

    const next = await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    expect(next.body.data.nextPageId).toBe(page2.id);

    // AC5: the phase dispatch added by this ticket does not call Code Blocks'
    // evaluateAll a second time -- still exactly the one call `runNext` always
    // made for a standalone `next()`.
    expect(evaluateAllSpy).toHaveBeenCalledTimes(1);
    evaluateAllSpy.mockRestore();

    const rows = await beforePageLogRows(runId);
    expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(1);

    const dvRows = await writeTargetRows(tableId);
    expect(dvRows.filter((row) => row.values[columnId] === 'entered-on-page2-live')).toHaveLength(1);
  });

  it('back-navigation re-fires onPageEnter on re-arrival; a GET does not fire it', async () => {
    const { workflow, page1, page2 } = await twoPageWorkflow();
    const hookId = await createBeforePageHook(workflow.id, page2.id, 'Page 2 hook (back-nav)');

    const created = await agent.post(`/api/workflows/${workflow.id}/runs`).send({}).expect(201);
    const runId = created.body.data.runId as string;

    const first = await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    expect(first.body.data.nextPageId).toBe(page2.id);
    let rows = await beforePageLogRows(runId);
    expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(1);

    // A GET must not fire it again. (`GET /api/runs/:runId` alone does not
    // chain `optionalHybridAuth`, so it only accepts a run-token bearer, not
    // this creator session agent -- `/runtime` does chain it and reads the
    // same run, so it is the equivalent read for a session-authenticated call.)
    await agent.get(`/api/runs/${runId}/runtime`).expect(200);
    rows = await beforePageLogRows(runId);
    expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(1);

    // Simulate the respondent having navigated back to page 1. Back is
    // client-side-only today (client/src/hooks/runner/useRunNavigation.ts's
    // handlePrev just decrements a local index -- there is no "go back" HTTP
    // verb), so the server-observable equivalent of "the respondent is back
    // on an earlier page" is the run's cursor sitting there when the next
    // `/next` call is made.
    await getOwnerDb().update(schema.workflowRuns)
      .set({ currentPageId: page1.id })
      .where(eq(schema.workflowRuns.id, runId));

    const second = await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    expect(second.body.data.nextPageId).toBe(page2.id);
    rows = await beforePageLogRows(runId);
    expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(2);
  });

  it('preview navigation still fires the beforePage hook, but a write block does not write', async () => {
    const { workflow, page1: _page1, page2 } = await twoPageWorkflow();
    const hookId = await createBeforePageHook(workflow.id, page2.id, 'Page 2 hook (preview)');
    const { tableId, columnId } = await createWriteTargetTable();
    await createOnPageEnterWriteBlock(workflow.id, page2.id, tableId, columnId, 'entered-on-page2-preview');

    const previewRes = await agent.post(`/api/workflows/${workflow.id}/preview-runs`).send({}).expect(201);
    const runId = previewRes.body.runId as string;
    expect(previewRes.body.executionMode).toBe('preview');

    const next = await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    expect(next.body.data.nextPageId).toBe(page2.id);

    const rows = await beforePageLogRows(runId);
    expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(1);

    // The write block's own, pre-existing preview suppression (WriteBlockRunner
    // short-circuits on `isPreview`) must still apply now that onPageEnter
    // actually reaches it -- no row written for this run's marker.
    const dvRows = await writeTargetRows(tableId);
    expect(dvRows.filter((row) => row.values[columnId] === 'entered-on-page2-preview')).toHaveLength(0);
  });

  it('denies a cross-tenant next call, and writes no beforePage log row', async () => {
    const { workflow, page2 } = await twoPageWorkflow();
    const hookId = await createBeforePageHook(workflow.id, page2.id, 'Page 2 hook (cross-tenant)');

    const created = await agent.post(`/api/workflows/${workflow.id}/runs`).send({}).expect(201);
    const runId = created.body.data.runId as string;

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({ name: 'RUN-P1 stranger tenant' }).returning();
    const stranger = await createTestUser(ctx, 'owner', tenant.id);
    try {
      const other = createAuthenticatedAgent(ctx.baseURL, stranger.token);
      const res = await other.post(`/api/runs/${runId}/next`).send({});
      expect([403, 404]).toContain(res.status);

      const rows = await beforePageLogRows(runId);
      expect(rows.filter((row) => row.scriptId === hookId)).toHaveLength(0);
    } finally {
      await getOwnerDb().delete(schema.users).where(eq(schema.users.id, stranger.userId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
    }
  });
});

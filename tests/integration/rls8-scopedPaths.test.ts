/**
 * RLS-8: code paths that read or wrote an RLS-covered table on the bare pool.
 *
 * Every assertion here is about a result that was SILENTLY wrong in production
 * once RLS was enforced (2026-09-13): an unscoped read of a covered table
 * returns zero rows, not an error, and an unscoped UPDATE matches zero rows.
 * So each test checks the data a path produced, never just its status code —
 * most of these answered 200 while doing nothing.
 *
 * These discriminate only under the RLS gate (`RLS_RESTRICTED=true`, which runs
 * the app pool as a non-owner role). In an ordinary run the app connects as the
 * table owner, RLS never applies, and the old code passes too. Seeding goes
 * through the owner connection so the fixture itself is not what is tested.
 */
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { computeAndSaveSLIs } from '../../server/jobs/metricsRollup';
import { authService } from '../../server/services/AuthService';
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';
import { TestFactory } from '../helpers/testFactory';

describe('RLS-8: tenant-scoped paths return real data under enforcement', () => {
  let ctx: IntegrationTestContext;
  let projectId: string;
  let workflowId: string;
  let versionId: string;
  let api: ReturnType<typeof createAuthenticatedAgent>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'RLS-8', createProject: true });
    projectId = ctx.projectId!;
    api = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const { workflow, version } = await new TestFactory().createWorkflow(projectId, ctx.userId);
    workflowId = workflow.id;
    versionId = version.id;
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  /** One rollup an hour ago, in the caller's own tenant. */
  async function seedRollup(overrides: Partial<typeof schema.metricsRollups.$inferInsert> = {}) {
    const hourAgo = new Date(Math.floor((Date.now() - 3_600_000) / 3_600_000) * 3_600_000);
    await getOwnerDb().insert(schema.metricsRollups).values({
      tenantId: ctx.tenantId,
      projectId,
      workflowId,
      bucketStart: hourAgo,
      bucket: '1h',
      runsCount: 10,
      runsSuccess: 9,
      runsError: 1,
      durP95: 1200,
      ...overrides,
    });
  }

  describe('workflow analytics', () => {
    beforeAll(async () => {
      await seedRollup();
    });

    it('GET /timeseries returns the tenant\'s own rollups', async () => {
      const res = await api.get(
        `/api/workflow-analytics/timeseries?projectId=${projectId}&workflowId=${workflowId}&bucket=1h&window=1d`,
      );
      expect(res.status).toBe(200);
      // Was `[]`: the rollups query ran on the bare pool.
      expect(res.body.timeseries.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /sli counts the tenant\'s runs and returns its SLI history', async () => {
      await getOwnerDb().insert(schema.sliWindows).values({
        tenantId: ctx.tenantId,
        projectId,
        workflowId,
        windowStart: new Date(Date.now() - 7 * 86_400_000),
        windowEnd: new Date(),
        successPct: 90,
        p95Ms: 1200,
        errorBudgetBurnPct: 1000,
      });

      const res = await api.get(`/api/workflow-analytics/sli?projectId=${projectId}&workflowId=${workflowId}`);
      expect(res.status).toBe(200);
      // Was 0 runs (and so a perfect 100% success rate) and an empty history.
      expect(res.body.current.totalRuns).toBeGreaterThanOrEqual(10);
      expect(res.body.history.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('the SLI job saves a window for each tenant\'s project (no ambient tenant in a job)', async () => {
    const jobProject = await getOwnerDb().insert(schema.projects).values({
      title: `RLS-8 SLI job ${nanoid()}`,
      name: `RLS-8 SLI job ${nanoid()}`,
      tenantId: ctx.tenantId,
      creatorId: ctx.userId,
      ownerId: ctx.userId,
    }).returning();
    const jobProjectId = jobProject[0].id;
    await seedRollup({ projectId: jobProjectId, workflowId: null });

    // Called straight from the test body: like the real worker, there is no
    // request and so no tenant in context. Before the fix every row threw
    // "RLS: no tenant in context." inside the job's own catch.
    await computeAndSaveSLIs();

    const windows = await getOwnerDb().select().from(schema.sliWindows)
      .where(eq(schema.sliWindows.projectId, jobProjectId));
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].tenantId).toBe(ctx.tenantId);
  });

  describe('snapshots', () => {
    let snapshotId: string;

    beforeAll(async () => {
      const factory = new TestFactory();
      const page = await factory.createPage(workflowId);
      const answered = await factory.createStep(page.id, {
        workflowId, alias: 'full_name', type: 'text', required: true,
      });
      // Required and never answered: validation has to notice it is missing.
      await factory.createStep(page.id, {
        workflowId, alias: 'favourite_colour', type: 'text', required: true, order: 1,
      });
      const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
        workflowId,
        workflowVersionId: versionId,
        runToken: `rls8-${nanoid()}`,
        createdBy: `creator:${ctx.userId}`,
      }).returning();
      await getOwnerDb().insert(schema.stepValues).values({
        runId: run.id, stepId: answered.id, value: 'Ada Lovelace',
      });

      const created = await api.post(`/api/workflows/${workflowId}/snapshots`).send({ name: 'RLS-8 snapshot' });
      expect(created.status).toBe(201);
      snapshotId = created.body.id;

      const saved = await api.post(`/api/workflows/${workflowId}/snapshots/${snapshotId}/save-from-run`)
        .send({ runId: run.id });
      expect(saved.status).toBe(200);
    });

    it('save-from-run captures the run\'s answers', async () => {
      const res = await api.get(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`);
      expect(res.status).toBe(200);
      // Was `{}`: the step_values ⋈ steps join could see no steps.
      expect(res.body).toEqual({ full_name: 'Ada Lovelace' });
    });

    it('validate sees the workflow\'s steps and reports the missing required one', async () => {
      const res = await api.get(`/api/workflows/${workflowId}/snapshots/${snapshotId}/validate`);
      expect(res.status).toBe(200);
      // Was `safe` for every snapshot: there were no steps to check against.
      expect(res.body.severity).toBe('soft_breaking');
      expect(res.body.reasons).toContain('Missing required field: favourite_colour');
    });
  });

  it('a tenant owner can change a member\'s role', async () => {
    const member = await createTestUser(ctx, 'viewer');

    const res = await api.put(`/api/tenants/${ctx.tenantId}/users/${member.userId}/role`).send({ role: 'builder' });
    // Was 404 "User not found in this tenant": the UPDATE saw no tenant rows.
    expect(res.status).toBe(200);

    const [row] = await getOwnerDb().select({ tenantRole: schema.users.tenantRole })
      .from(schema.users).where(eq(schema.users.id, member.userId));
    expect(row.tenantRole).toBe('builder');
  });

  it('verifying an email persists for a user who already has a tenant', async () => {
    const member = await createTestUser(ctx, 'viewer');
    await getOwnerDb().update(schema.users).set({ emailVerified: false }).where(eq(schema.users.id, member.userId));
    const token = await authService.generateEmailVerificationToken(member.userId, member.email);

    const res = await api.post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);

    // The endpoint answered 200 before the fix too — the UPDATE simply matched
    // no row. Only the stored flag tells the two apart.
    const [row] = await getOwnerDb().select({ emailVerified: schema.users.emailVerified })
      .from(schema.users).where(eq(schema.users.id, member.userId));
    expect(row.emailVerified).toBe(true);
  });
});

/**
 * BLK-1 — `blocks` tenant isolation, and the execution path that reads it.
 *
 * Migration 0050 gave `blocks` an ownership-derived `tenant_isolation` policy,
 * the last workflow-owned table without one. This suite proves both halves,
 * and the second half is the one that matters:
 *
 *  - **Isolation at the ROUTE.** Tenant B cannot read tenant A's block, by id
 *    or by list. ⚠️ Measured 2026-09-20: this half passes even with the policy
 *    replaced by `USING (true)`, because `BlockService.verifyAccess` refuses
 *    first — so it is a defence-in-depth regression test, NOT a proof of the
 *    policy. The policy itself is proven in `rls10-policyIsolation.test.ts`,
 *    which enumerates `blocks` from `pg_policies` and DOES go red against
 *    `USING (true)` (verified). Do not read this file as the isolation proof.
 *  - **Execution still works.** A block whose absence is silent must still run
 *    for its own tenant, and for an anonymous public-link run.
 *
 * Why the execution half exists: under enforcement an unscoped read of a
 * covered table returns ZERO rows rather than erroring, and
 * `BlockRunner.runPhase` treats an empty list as "nothing to run" and returns
 * success. So the policy alone would have stopped every block in the product
 * from executing, with every caller still reporting 200. A suite that asserted
 * only the cross-tenant denial would have passed against exactly that.
 *
 * The probe is a `validate` block on `onPageSubmit`, chosen because its
 * absence is SILENT in the most useful way: if the block does not load, a
 * submission that should be refused is accepted instead. `onRunStart` blocks
 * are no good here — `executeOnRunStart` discards their returned data, so a
 * prefill block that never ran looks identical to one that did.
 */
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { versionService } from '../../server/services/VersionService';
import { runWithTenantContext } from '../../server/utils/rlsContext';
import {
  setupIntegrationTest,
  createTestUser,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { expectCrossTenantDenied } from '../helpers/expectDenied';
// RLS-5: fixture writes and verification reads are the TEST OBSERVER, not the
// application — under RLS_RESTRICTED the app pool is a genuine non-owner, and
// these writes would be refused by the very policies under test.
import { getOwnerDb } from '../helpers/ownerDb';
import { TestFactory } from '../helpers/testFactory';

const BLOCKED_EMAIL = 'blocked@example.com';

describe.sequential('BLK-1: blocks RLS + execution path', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'BLK-1 blocks RLS', createProject: true });
    factory = new TestFactory();

    // A genuinely separate tenant. `createTestUser` without an override puts
    // the user in ctx's OWN tenant, which would prove nothing here.
    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `BLK-1 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  /**
   * A published workflow with one email question and a `validate` block that
   * refuses one specific value on page submit.
   *
   * ⚠️ `isPublic` is a parameter, and the default is PRIVATE deliberately.
   * 0050's `is_public AND status = 'active'` disjunct makes a public
   * workflow's blocks readable with no tenant pinned at all — so a public
   * fixture cannot tell a correctly-scoped read from an unscoped one. Measured
   * 2026-09-20: with a public fixture, the owner-execution test below passed
   * even with the scoping reverted to the pre-BLK-1 bare-pool read, which is
   * precisely the regression it exists to catch.
   */
  async function makeWorkflowWithValidateBlock({ isPublic = false }: { isPublic?: boolean } = {}) {
    const { workflow, version: emptyVersion } = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: { status: 'active', isPublic },
    });
    const page = await factory.createPage(workflow.id, { title: 'P1', order: 0 });
    const emailStep = await factory.createStep(page.id, {
      title: 'Email', alias: 'email', type: 'email', required: false, order: 0,
    });

    const [block] = await getOwnerDb().insert(schema.blocks).values({
      workflowId: workflow.id,
      pageId: page.id,
      type: 'validate',
      phase: 'onPageSubmit',
      enabled: true,
      order: 0,
      config: {
        // Keyed by STEP ID, not alias: the phase's data map is
        // `RunPersistenceWriter.getRunValues`, which keys by `stepId`, and
        // only CollectionBlockRunner resolves `aliasMap`. A rule keyed 'email'
        // silently matches nothing and the rule never fires — which looks
        // exactly like the block not loading, the thing this suite exists to
        // detect.
        rules: [{
          assert: { key: emailStep.id, op: 'not_equals', value: BLOCKED_EMAIL },
          message: 'That address is not accepted',
        }],
      },
    }).returning();

    // `createDraftVersion` is called directly here, not over HTTP, so nothing
    // has populated the async tenant context the way `hybridAuth` would. Under
    // RLS_RESTRICTED a PRIVATE workflow is then invisible to it and it throws
    // "Workflow not found". Standing in for the request is the test's job, not
    // a reason to make the fixture public — see the note above.
    const version = (await runWithTenantContext(
      ctx.tenantId,
      () => versionService.createDraftVersion(workflow.id, ctx.userId),
    )) ?? emptyVersion;
    await getOwnerDb().update(schema.workflows)
      .set({ currentVersionId: version.id })
      .where(eq(schema.workflows.id, workflow.id));

    return { workflow, page, emailStep, block };
  }

  describe('isolation at the route (defence in depth — see the header)', () => {
    it('hides one tenant\'s block from another, by id and by list', async () => {
      const { workflow, block } = await makeWorkflowWithValidateBlock();

      const byId = await request(ctx.baseURL)
        .get(`/api/blocks/${block.id}`)
        .set('Authorization', `Bearer ${foreignToken}`);
      expectCrossTenantDenied(byId.status);

      const byList = await request(ctx.baseURL)
        .get(`/api/workflows/${workflow.id}/blocks`)
        .set('Authorization', `Bearer ${foreignToken}`);
      // Either refused outright, or an empty list — never this block.
      if (byList.status === 200) {
        const ids = ((byList.body.data ?? []) as Array<{ id: string }>).map((b) => b.id);
        expect(ids).not.toContain(block.id);
      } else {
        expectCrossTenantDenied(byList.status);
      }

      // The owner still sees it — otherwise the two assertions above would
      // pass just as well against a policy that hides the row from everyone.
      const owner = await request(ctx.baseURL)
        .get(`/api/blocks/${block.id}`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .expect(200);
      expect(owner.body.data.id).toBe(block.id);
    });
  });

  describe('execution', () => {
    it('still runs the block for the workflow owner (the silent-failure case)', async () => {
      const { workflow, page, emailStep } = await makeWorkflowWithValidateBlock();

      const created = await request(ctx.baseURL)
        .post(`/api/workflows/${workflow.id}/runs`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({})
        .expect(201);
      const runId = created.body.data.runId as string;

      const refused = await request(ctx.baseURL)
        .post(`/api/runs/${runId}/pages/${page.id}/submit`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({ values: [{ stepId: emailStep.id, value: BLOCKED_EMAIL }] });

      // If the block did not load, this submission is ACCEPTED and the run
      // advances — which is exactly what an unscoped read would produce.
      expect(refused.body.success).toBe(false);
      expect(JSON.stringify(refused.body)).toContain('That address is not accepted');

      // And a value the rule permits still goes through, so the failure above
      // is the rule firing rather than submit being broken outright.
      const accepted = await request(ctx.baseURL)
        .post(`/api/runs/${runId}/pages/${page.id}/submit`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({ values: [{ stepId: emailStep.id, value: 'fine@example.com' }] });
      expect(accepted.body.success).not.toBe(false);
    });

    it('still runs the block for an anonymous public-link run (the USING disjunct)', async () => {
      const { workflow, page, emailStep } = await makeWorkflowWithValidateBlock({ isPublic: true });

      const started = await request(ctx.baseURL)
        .post(`/api/workflows/public/${workflow.publicLink}/start`)
        .send({})
        .expect(201);
      const runId = started.body.data.runId as string;
      // `creatorOrRunTokenAuth` falls back to a run token presented as a
      // bearer credential — there is no separate run-token header.
      const runToken = started.body.data.runToken as string;
      expect(runToken).toBeTruthy();

      const refused = await request(ctx.baseURL)
        .post(`/api/runs/${runId}/pages/${page.id}/submit`)
        .set('Authorization', `Bearer ${runToken}`)
        .send({ values: [{ stepId: emailStep.id, value: BLOCKED_EMAIL }] });

      // An anonymous run has no tenant to pin. The policy's
      // `is_public AND status = 'active'` disjunct is what keeps this working;
      // without it the block is invisible and the submission is accepted.
      expect(refused.body.success).toBe(false);
      expect(JSON.stringify(refused.body)).toContain('That address is not accepted');
    });
  });
});

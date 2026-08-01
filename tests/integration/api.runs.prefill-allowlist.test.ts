/**
 * RUN2-6: URL/query prefill bypasses the intake prefill allowlist.
 *
 * The runner turns every unreserved URL query parameter into
 * `initialValues` and sends it to POST /api/workflows/:id/runs or
 * POST /api/workflows/public/:slug/start. Before this fix those routes wrote
 * any key matching a step alias or id straight into step values with no
 * allowlist consulted at all — `intakeConfig.allowPrefill: false` did
 * nothing outside the (separate) IntakeService portal path. That let anyone
 * with a run link seed any question, including ones meant to be computed,
 * internal, or gated behind logic, and that data flows into generated
 * documents and DataVault writeback.
 *
 * This file proves the shared `filterPrefillValues` helper
 * (server/utils/prefillFilter.ts) is actually enforced by RunService on both
 * routes, and that it only ever touches caller-supplied values.
 */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { versionService } from '../../server/services/VersionService';
import { RunLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

describe.sequential('RUN2-6: run-creation prefill allowlist', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'RUN2-6 prefill allowlist',
      createProject: true,
    });
    factory = new TestFactory();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  async function getStepValues(runId: string): Promise<(typeof schema.stepValues.$inferSelect)[]> {
    return db
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
  }

  /** Workflow with one "email" step and one "internal_notes" step, published
   *  and public so both the authenticated and anonymous public-link routes
   *  can create runs against it. */
  async function makeWorkflowWithSteps(intakeConfig?: Record<string, unknown>) {
    const { workflow, version: emptyVersion } = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: {
        status: 'active',
        isPublic: true,
        ...(intakeConfig !== undefined ? { intakeConfig } : {}),
      },
    });
    const section = await factory.createSection(workflow.id, { title: 'S1', order: 0 });
    const emailStep = await factory.createStep(section.id, {
      title: 'Email', alias: 'email', type: 'email', required: false, order: 0,
    });
    const secretStep = await factory.createStep(section.id, {
      title: 'Internal Notes', alias: 'internal_notes', required: false, order: 1,
    });
    // Anonymous run creation needs a published version to pin to, and RVP-2
    // now actually resolves navigation/completion from that pinned graph --
    // so it must reflect the section/steps just created above, not the empty
    // snapshot `factory.createWorkflow` produced before they existed.
    // `createDraftVersion` returns null only when the checksum is unchanged,
    // which can't happen here (the live workflow just gained content).
    const version = (await versionService.createDraftVersion(workflow.id, ctx.userId)) ?? emptyVersion;
    await db
      .update(schema.workflows)
      .set({ currentVersionId: version.id })
      .where(eq(schema.workflows.id, workflow.id));
    return { workflow, version, emailStep, secretStep };
  }

  describe('AC1: allowPrefill !== true drops all caller-supplied initialValues', () => {
    it('drops initialValues on the authenticated creator route (POST /api/workflows/:id/runs) when intakeConfig is absent', async () => {
      const { workflow, emailStep } = await makeWorkflowWithSteps();

      const createResponse = await request(ctx.baseURL)
        .post(`/api/workflows/${workflow.id}/runs`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({ initialValues: { email: 'attacker@evil.com', [emailStep.id]: 'also-attacker' } })
        .expect(201);

      const runId = createResponse.body.data.runId as string;
      const values = await getStepValues(runId);
      expect(values).toHaveLength(0);
    });

    it('drops initialValues on the anonymous public-link route (POST /api/workflows/public/:slug/start) when allowPrefill is explicitly false', async () => {
      const { workflow } = await makeWorkflowWithSteps({ allowPrefill: false, allowedPrefillKeys: ['email'] });

      const createResponse = await request(ctx.baseURL)
        .post(`/api/workflows/public/${workflow.publicLink}/start`)
        .send({ initialValues: { email: 'attacker@evil.com' } })
        .expect(201);

      const runId = createResponse.body.data.runId as string;
      const values = await getStepValues(runId);
      expect(values).toHaveLength(0);
    });
  });

  describe('AC2: allowPrefill true only applies allowedPrefillKeys', () => {
    it('applies only the allowed key and silently drops the rest (no error) on the authenticated route', async () => {
      const { workflow, emailStep, secretStep } = await makeWorkflowWithSteps({
        allowPrefill: true,
        allowedPrefillKeys: ['email'],
      });

      const createResponse = await request(ctx.baseURL)
        .post(`/api/workflows/${workflow.id}/runs`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          initialValues: {
            email: 'legit@example.com',
            internal_notes: 'should not be settable via a URL param',
          },
        })
        .expect(201); // disallowed keys are dropped, not rejected as an error

      const runId = createResponse.body.data.runId as string;
      const values = await getStepValues(runId);
      expect(values).toHaveLength(1);
      expect(values[0].stepId).toBe(emailStep.id);
      expect(values[0].value).toBe('legit@example.com');
      expect(values.some(v => v.stepId === secretStep.id)).toBe(false);
    });

    it('applies only the allowed key on the anonymous public-link route', async () => {
      const { workflow, emailStep, secretStep } = await makeWorkflowWithSteps({
        allowPrefill: true,
        allowedPrefillKeys: ['email'],
      });

      const createResponse = await request(ctx.baseURL)
        .post(`/api/workflows/public/${workflow.publicLink}/start`)
        .send({
          initialValues: {
            email: 'legit@example.com',
            internal_notes: 'nope',
          },
        })
        .expect(201);

      const runId = createResponse.body.data.runId as string;
      const values = await getStepValues(runId);
      expect(values).toHaveLength(1);
      expect(values[0].stepId).toBe(emailStep.id);
      expect(values[0].value).toBe('legit@example.com');
      expect(values.some(v => v.stepId === secretStep.id)).toBe(false);
    });
  });

  describe('AC3: snapshot- and randomize-derived values are unaffected by the filter', () => {
    it('keeps a snapshot-sourced value (and rejects the attacker override) even though intakeConfig forbids prefill entirely', async () => {
      const { workflow, version, emailStep } = await makeWorkflowWithSteps(); // no intakeConfig -> allowPrefill defaults to falsy

      const [snapshot] = await db
        .insert(schema.workflowSnapshots)
        .values({
          workflowId: workflow.id,
          name: `RUN2-6 snapshot ${Date.now()}`,
          values: { email: 'from-snapshot@example.com' },
          workflowVersionId: version.id,
        })
        .returning();

      const createResponse = await request(ctx.baseURL)
        .post(`/api/workflows/${workflow.id}/runs`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          snapshotId: snapshot.id,
          // Attacker-controlled value trying to override the snapshot via the
          // same key; must be dropped, not merged over the snapshot value.
          initialValues: { email: 'attacker@evil.com' },
        })
        .expect(201);

      const runId = createResponse.body.data.runId as string;
      const values = await getStepValues(runId);
      const emailValue = values.find(v => v.stepId === emailStep.id);
      expect(emailValue?.value).toBe('from-snapshot@example.com');
    });

    it('keeps a randomize-derived value even though intakeConfig forbids prefill entirely', async () => {
      const { workflow, emailStep } = await makeWorkflowWithSteps(); // no intakeConfig -> allowPrefill defaults to falsy

      // Stub the (network-bound, AI-driven) random value generator so this
      // stays a deterministic, offline integration test — everything else
      // (auth, DB writes, the filter itself) runs for real.
      const randomizeSpy = vi
        .spyOn(RunLifecycleService.prototype, 'generateRandomValues')
        .mockResolvedValue({ email: 'from-randomize@example.com' });

      try {
        const createResponse = await request(ctx.baseURL)
          .post(`/api/workflows/${workflow.id}/runs`)
          .set('Authorization', `Bearer ${ctx.authToken}`)
          .send({
            randomize: true,
            initialValues: { email: 'attacker@evil.com' },
          })
          .expect(201);

        const runId = createResponse.body.data.runId as string;
        const values = await getStepValues(runId);
        const emailValue = values.find(v => v.stepId === emailStep.id);
        expect(emailValue?.value).toBe('from-randomize@example.com');
      } finally {
        randomizeSpy.mockRestore();
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

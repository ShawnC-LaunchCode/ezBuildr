import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { hashToken } from '../../server/utils/encryption';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential('GET /api/runs/:runId/runtime', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let versionId: string;
  let sectionId: string;
  let stepId: string;
  let runId: string;
  let runToken: string;
  let otherRunId: string;
  let otherRunToken: string;
  let expiredRunId: string;
  let expiredRunToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Runtime endpoint integration',
      createProject: true,
    });
    const factory = new TestFactory();
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    workflowId = workflow.id;
    versionId = version.id;

    const section = await factory.createSection(workflowId, {
      title: 'Mutable live section',
      description: 'This text must not reach the pinned runtime',
    });
    sectionId = section.id;
    const step = await factory.createStep(sectionId, {
      title: 'Mutable live step',
      alias: 'legalName',
    });
    stepId = step.id;

    await getOwnerDb().update(schema.workflowVersions)
      .set({
        graphJson: {
          title: 'Pinned interview',
          description: 'Pinned description',
          projectId: ctx.projectId,
          settings: { progressBar: true },
          internalSecret: 'must-not-leak',
          sections: [{
            id: sectionId,
            title: 'Pinned section',
            description: 'Pinned section description',
            order: 0,
            privateNote: 'must-not-leak',
            steps: [{
              id: stepId,
              type: 'short_text',
              title: 'Pinned name question',
              description: 'Pinned step description',
              required: true,
              alias: 'legalName',
              order: 0,
              config: { placeholder: 'Full name' },
              serverOnly: 'must-not-leak',
            }],
          }],
          logicRules: [],
        },
      })
      .where(eq(schema.workflowVersions.id, versionId));

    runToken = `runtime-${randomUUID()}`;
    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: versionId,
      runToken: hashToken(runToken),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      createdBy: 'anon',
      currentSectionId: sectionId,
      metadata: { privateContext: 'must-not-leak' },
    }).returning();
    runId = run.id;

    await getOwnerDb().insert(schema.stepValues).values({
      runId,
      stepId,
      value: 'Ada Lovelace',
    });

    otherRunToken = `other-runtime-${randomUUID()}`;
    const [otherRun] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: versionId,
      runToken: hashToken(otherRunToken),
      tokenExpiresAt: new Date(Date.now() + 60_000),
    }).returning();
    otherRunId = otherRun.id;

    expiredRunToken = `expired-runtime-${randomUUID()}`;
    const [expiredRun] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: versionId,
      runToken: hashToken(expiredRunToken),
      tokenExpiresAt: new Date(Date.now() - 60_000),
    }).returning();
    expiredRunId = expiredRun.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('returns the sanitized pinned definition, cursor, and saved values for the matching run token', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${runToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      contractVersion: 1,
      run: {
        id: runId,
        workflowId,
        workflowVersionId: versionId,
        currentSectionId: sectionId,
        completed: false,
      },
      workflow: {
        id: workflowId,
        title: 'Pinned interview',
        description: 'Pinned description',
        projectId: ctx.projectId,
        settings: { progressBar: true },
      },
      sections: [{
        id: sectionId,
        workflowId,
        title: 'Pinned section',
        description: 'Pinned section description',
        order: 0,
      }],
      steps: [{
        id: stepId,
        workflowId,
        sectionId,
        type: 'short_text',
        title: 'Pinned name question',
        required: true,
        alias: 'legalName',
        config: { placeholder: 'Full name' },
      }],
      logicRules: [],
      values: [{ runId, stepId, value: 'Ada Lovelace' }],
    });

    expect(Object.keys(response.body.data.run).sort()).toEqual([
      'completed',
      'currentSectionId',
      'generationStatus',
      'id',
      'workflowId',
      'workflowVersionId',
    ]);
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toContain(runToken);
    expect(serialized).not.toContain(hashToken(runToken));
    expect(serialized).not.toContain('must-not-leak');
  });

  it('denies a valid token belonging to a different run', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${otherRunToken}`)
      .expect(403);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Access denied - run mismatch',
    });
    expect(otherRunId).not.toBe(runId);
  });

  it('denies requests without authentication', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Unauthorized');
  });

  it('denies an expired run token', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/runs/${expiredRunId}/runtime`)
      .set('Authorization', `Bearer ${expiredRunToken}`)
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Unauthorized - Run token has expired',
    });
  });

  it('rejects a malformed run UUID', async () => {
    const response = await request(ctx.baseURL)
      .get('/api/runs/not-a-uuid/runtime')
      .set('Authorization', `Bearer ${runToken}`)
      .expect(400);

    expect(response.body).toMatchObject({ success: false, error: 'Invalid input' });
  });

  it('keeps serving the pinned snapshot after the live section and step change', async () => {
    await getOwnerDb().update(schema.sections)
      .set({ title: 'Changed live section', description: 'Changed live description' })
      .where(eq(schema.sections.id, sectionId));
    await getOwnerDb().update(schema.steps)
      .set({ title: 'Changed live step', required: false, config: { placeholder: 'Changed' } })
      .where(eq(schema.steps.id, stepId));

    const response = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${runToken}`)
      .expect(200);

    expect(response.body.data.sections[0]).toMatchObject({
      id: sectionId,
      title: 'Pinned section',
      description: 'Pinned section description',
    });
    expect(response.body.data.steps[0]).toMatchObject({
      id: stepId,
      title: 'Pinned name question',
      required: true,
      config: { placeholder: 'Full name' },
    });
    expect(JSON.stringify(response.body.data)).not.toContain('Changed live');
  });
});

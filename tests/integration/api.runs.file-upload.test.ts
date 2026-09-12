import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { setVirusScannerInstance, resetVirusScannerInstance } from '../../server/services/security/VirusScanner';
import { storageProvider } from '../../server/services/storage';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe('run-scoped file uploads (GH-146)', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let stepId: string;
  let runId: string;
  let otherTenantId: string;
  const storedKeys: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ createProject: true });
    setVirusScannerInstance({
      scan: async buffer => ({
        safe: true,
        scannerName: 'integration-test',
        scannedAt: new Date(),
        scanDurationMs: 1,
        fileSize: buffer.length,
      }),
      isHealthy: async () => true,
    });

    const [workflow] = await getOwnerDb().insert(schema.workflows).values({
      title: 'File upload workflow',
      name: 'File upload workflow',
      creatorId: ctx.userId,
      ownerId: ctx.userId,
      ownerType: 'user',
      ownerUuid: ctx.userId,
      projectId: ctx.projectId,
      status: 'draft',
    }).returning();
    workflowId = workflow.id;

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId,
      title: 'Files',
      order: 0,
    }).returning();
    const [step] = await getOwnerDb().insert(schema.steps).values({
      workflowId,
      pageId: page.id,
      type: 'file_upload',
      title: 'Evidence',
      alias: 'evidence',
      order: 0,
      required: true,
      config: { allowedTypes: ['application/pdf'], maxSize: 1024, maxFiles: 2 },
    }).returning();
    stepId = step.id;

    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      runToken: 'file-upload-integration-token',
      completed: false,
    }).returning();
    runId = run.id;

    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({ name: 'Other upload tenant', plan: 'pro' }).returning();
    otherTenantId = otherTenant.id;
  });

  afterAll(async () => {
    resetVirusScannerInstance();
    await Promise.all(storedKeys.map(key => storageProvider.deleteFile(key)));
    await ctx.cleanup();
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it('streams to tenant-scoped storage and persists file metadata as the step answer', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'brief.pdf', contentType: 'application/pdf' });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const uploaded = response.body.data.files[0] as { storageKey: string; filename: string; url: string };
    storedKeys.push(uploaded.storageKey);
    expect(uploaded.storageKey).toMatch(new RegExp(`^tenants/${ctx.tenantId}/runs/${runId}/steps/${stepId}/`));
    expect(uploaded.filename).toBe('brief.pdf');
    expect(uploaded.url).toBeTruthy();
    expect(await storageProvider.exists(uploaded.storageKey)).toBe(true);

    const [answer] = await getOwnerDb().select().from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(answer.stepId).toBe(stepId);
    expect(answer.value).toEqual([
      expect.objectContaining({ storageKey: uploaded.storageKey, filename: 'brief.pdf', mimeType: 'application/pdf' }),
    ]);
  });

  it('rejects a MIME type outside the question configuration without persisting it', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .attach('files', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not allowed/i);
    const [answer] = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, runId));
    expect(answer.value).toHaveLength(1);
  });

  it('denies a user from another tenant', async () => {
    const otherUser = await createTestUser(ctx, 'viewer', otherTenantId);
    const response = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'brief.pdf', contentType: 'application/pdf' });

    expect([403, 404]).toContain(response.status);
  });

  // STB-23 round 1: `RunFileUploadService.resolveContext` used to derive
  // tenantId ONLY via workflow.projectId -> project.tenantId, so any upload
  // against an "Unfiled" workflow (projectId null - a supported, first-class
  // state) failed with a misleading "Project for run not found" 404. Round 1
  // resolved from the ambient tenant hybridAuth already pins - but that only
  // covers the authenticated-JWT path.
  //
  // STB-23 round 2: the customer-facing run-token path (how actual
  // respondents upload) has NO ambient tenant by the time this service runs.
  // This route reopens the RLS async context after multer
  // (server/routes/runs.routes.ts, "re-open the tenant async context after
  // multer"), and that reopen only re-seeds from req.tenantId - which
  // runTokenAuth never sets. So on an Unfiled workflow (no project to fall
  // back to either) the round-1 fix still 404'd with "Tenant for run not
  // found" for every real respondent. The AC6/AC7 test below hits that path
  // specifically with a bare run token, no user JWT at all.
  describe('unfiled workflow (no project)', () => {
    let unfiledWorkflowId: string;
    let unfiledStepId: string;
    let unfiledRunId: string;
    let unfiledRunTokenPathRunId: string;
    let unfiledRunTokenPathToken: string;
    const unfiledStoredKeys: string[] = [];

    beforeAll(async () => {
      const [workflow] = await getOwnerDb().insert(schema.workflows).values({
        title: 'Unfiled file upload workflow',
        name: 'Unfiled file upload workflow',
        creatorId: ctx.userId,
        ownerId: ctx.userId,
        ownerType: 'user',
        ownerUuid: ctx.userId,
        projectId: null,
        status: 'draft',
      }).returning();
      unfiledWorkflowId = workflow.id;

      const [page] = await getOwnerDb().insert(schema.pages).values({
        workflowId: unfiledWorkflowId,
        title: 'Files',
        order: 0,
      }).returning();
      const [step] = await getOwnerDb().insert(schema.steps).values({
        workflowId: unfiledWorkflowId,
        pageId: page.id,
        type: 'file_upload',
        title: 'Evidence',
        alias: 'evidence',
        order: 0,
        required: true,
        config: { allowedTypes: ['application/pdf'], maxSize: 1024, maxFiles: 2 },
      }).returning();
      unfiledStepId = step.id;

      const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
        workflowId: unfiledWorkflowId,
        runToken: 'unfiled-file-upload-integration-token',
        completed: false,
      }).returning();
      unfiledRunId = run.id;

      // A second, independent run for the run-token-path test (AC6/AC7) so
      // it doesn't share maxFiles bookkeeping or ordering with the
      // authenticated-JWT tests above.
      const [runTokenPathRun] = await getOwnerDb().insert(schema.workflowRuns).values({
        workflowId: unfiledWorkflowId,
        runToken: `unfiled-run-token-path-${Date.now()}`,
        completed: false,
      }).returning();
      unfiledRunTokenPathRunId = runTokenPathRun.id;
      unfiledRunTokenPathToken = runTokenPathRun.runToken;
    });

    afterAll(async () => {
      await Promise.all(unfiledStoredKeys.map(key => storageProvider.deleteFile(key)));
    });

    it('uploads to a run on a project-less workflow and the file is retrievable (AC1)', async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/runs/${unfiledRunId}/steps/${unfiledStepId}/files`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'brief.pdf', contentType: 'application/pdf' });

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const uploaded = response.body.data.files[0] as { storageKey: string; filename: string; url: string };
      unfiledStoredKeys.push(uploaded.storageKey);
      expect(uploaded.storageKey).toMatch(new RegExp(`^tenants/${ctx.tenantId}/runs/${unfiledRunId}/steps/${unfiledStepId}/`));
      expect(await storageProvider.exists(uploaded.storageKey)).toBe(true);

      const [answer] = await getOwnerDb().select().from(schema.stepValues)
        .where(eq(schema.stepValues.runId, unfiledRunId));
      expect(answer.value).toEqual([
        expect.objectContaining({ storageKey: uploaded.storageKey, filename: 'brief.pdf', mimeType: 'application/pdf' }),
      ]);
    });

    it('denies a user from another tenant on a project-less workflow and writes nothing (AC3)', async () => {
      const otherUser = await createTestUser(ctx, 'viewer', otherTenantId);
      const response = await request(ctx.baseURL)
        .post(`/api/runs/${unfiledRunId}/steps/${unfiledStepId}/files`)
        .set('Authorization', `Bearer ${otherUser.token}`)
        .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'alien.pdf', contentType: 'application/pdf' });

      expect([403, 404]).toContain(response.status);
      const answers = await getOwnerDb().select().from(schema.stepValues)
        .where(eq(schema.stepValues.runId, unfiledRunId));
      expect(answers.some(a => (a.value as unknown[] | null)?.some(
        (v) => (v as { filename?: string }).filename === 'alien.pdf'
      ))).toBe(false);
    });

    it('uploads via a bare run token (no user JWT) on a project-less workflow (AC6/AC7)', async () => {
      // This is the actual customer-facing respondent path: an anonymous
      // link visitor with only a run token, never a user session. Round 1
      // of this ticket only proved the authenticated-JWT path (see the
      // header comment above) and shipped still broken here.
      const response = await request(ctx.baseURL)
        .post(`/api/runs/${unfiledRunTokenPathRunId}/steps/${unfiledStepId}/files`)
        .set('Authorization', `Bearer ${unfiledRunTokenPathToken}`)
        .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'respondent.pdf', contentType: 'application/pdf' });

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const uploaded = response.body.data.files[0] as { storageKey: string; filename: string; url: string };
      unfiledStoredKeys.push(uploaded.storageKey);
      expect(uploaded.storageKey).toMatch(new RegExp(`^tenants/${ctx.tenantId}/runs/${unfiledRunTokenPathRunId}/steps/${unfiledStepId}/`));
      expect(await storageProvider.exists(uploaded.storageKey)).toBe(true);

      const [answer] = await getOwnerDb().select().from(schema.stepValues)
        .where(eq(schema.stepValues.runId, unfiledRunTokenPathRunId));
      expect(answer.value).toEqual([
        expect.objectContaining({ storageKey: uploaded.storageKey, filename: 'respondent.pdf', mimeType: 'application/pdf' }),
      ]);
    });
  });
});

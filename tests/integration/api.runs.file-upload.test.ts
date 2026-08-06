import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { setVirusScannerInstance, resetVirusScannerInstance } from '../../server/services/security/VirusScanner';
import { storageProvider } from '../../server/services/storage';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';

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

    const [workflow] = await db.insert(schema.workflows).values({
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

    const [section] = await db.insert(schema.sections).values({
      workflowId,
      title: 'Files',
      order: 0,
    }).returning();
    const [step] = await db.insert(schema.steps).values({
      workflowId,
      sectionId: section.id,
      type: 'file_upload',
      title: 'Evidence',
      alias: 'evidence',
      order: 0,
      required: true,
      config: { allowedTypes: ['application/pdf'], maxSize: 1024, maxFiles: 2 },
    }).returning();
    stepId = step.id;

    const [run] = await db.insert(schema.workflowRuns).values({
      workflowId,
      runToken: 'file-upload-integration-token',
      completed: false,
    }).returning();
    runId = run.id;

    const [otherTenant] = await db.insert(schema.tenants).values({ name: 'Other upload tenant', plan: 'pro' }).returning();
    otherTenantId = otherTenant.id;
  });

  afterAll(async () => {
    resetVirusScannerInstance();
    await Promise.all(storedKeys.map(key => storageProvider.deleteFile(key)));
    await ctx.cleanup();
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
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

    const [answer] = await db.select().from(schema.stepValues)
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
    const [answer] = await db.select().from(schema.stepValues).where(eq(schema.stepValues.runId, runId));
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
});

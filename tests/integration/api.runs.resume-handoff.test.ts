import { randomBytes } from 'crypto';

import { desc, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { hashToken } from '../../server/utils/encryption';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential('GH-147 save, resume, and staff handoff', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let versionId: string;
  let sectionId: string;
  let stepId: string;
  let runId: string;
  let originalRunToken: string;
  let otherTenantId: string;
  let otherTenantUserId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'GH-147 owner', createProject: true });
    const factory = new TestFactory();
    const created = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: { status: 'active', isPublic: true },
    });
    workflowId = created.workflow.id;
    versionId = created.version.id;
    const section = await factory.createSection(workflowId, { title: 'Saved section', order: 0 });
    sectionId = section.id;
    const step = await factory.createStep(sectionId, {
      title: 'Validated name',
      alias: 'validatedName',
      required: true,
      order: 0,
    });
    stepId = step.id;
    await getOwnerDb().update(schema.workflowVersions).set({
      graphJson: {
        title: 'Resume interview',
        description: null,
        projectId: ctx.projectId,
        sections: [{
          id: sectionId,
          title: 'Saved section',
          order: 0,
          steps: [{
            id: stepId,
            type: 'short_text',
            title: 'Validated name',
            required: true,
            alias: 'validatedName',
            order: 0,
          }],
        }],
        logicRules: [],
      },
    }).where(eq(schema.workflowVersions.id, versionId));
    await getOwnerDb().update(schema.workflows)
      .set({ currentVersionId: versionId })
      .where(eq(schema.workflows.id, workflowId));

    const createResponse = await request(ctx.baseURL)
      .post(`/api/workflows/${workflowId}/runs`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({})
      .expect(201);
    runId = createResponse.body.data.runId as string;
    originalRunToken = createResponse.body.data.runToken as string;

    const submitResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/sections/${sectionId}/submit`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .send({ values: [{ stepId, value: 'Ada Lovelace' }] })
      .expect(200);
    expect(submitResponse.body.success).toBe(true);

    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({ name: 'Outside tenant' }).returning();
    otherTenantId = otherTenant.id;
    const [otherUser] = await getOwnerDb().insert(schema.users).values({
      email: `outside-${randomBytes(6).toString('hex')}@example.com`,
      tenantId: otherTenantId,
      emailVerified: true,
      isActive: true,
    }).returning();
    otherTenantUserId = otherUser.id;
  });

  afterAll(async () => {
    if (otherTenantUserId) {
      await getOwnerDb().delete(schema.users).where(eq(schema.users.id, otherTenantUserId));
    }
    if (otherTenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    }
    if (ctx?.tenantId) {
      await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, ctx.tenantId));
    }
    await ctx.cleanup();
  });

  it('emails a hashed one-time link and restores the saved cursor and validated answer', async () => {
    const recipientEmail = `resume-${randomBytes(6).toString('hex')}@example.com`;
    const createLinkResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume-links`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .send({ email: recipientEmail, expiryMinutes: 60 })
      .expect(202);
    expect(new Date(createLinkResponse.body.data.expiresAt).getTime())
      .toBeGreaterThan(Date.now() + 50 * 60_000);

    const [storedLink] = await getOwnerDb().select()
      .from(schema.runResumeLinks)
      .where(eq(schema.runResumeLinks.runId, runId))
      .orderBy(desc(schema.runResumeLinks.createdAt))
      .limit(1);
    const [queuedEmail] = await getOwnerDb().select()
      .from(schema.emailQueue)
      .where(eq(schema.emailQueue.to, recipientEmail))
      .orderBy(desc(schema.emailQueue.createdAt))
      .limit(1);
    const tokenMatch = /[?&]resume=([a-f0-9]+)/i.exec(queuedEmail.html);
    expect(tokenMatch?.[1]).toBeTruthy();
    const resumeToken = tokenMatch![1];
    expect(storedLink.tokenHash).toBe(hashToken(resumeToken));
    expect(storedLink.tokenHash).not.toBe(resumeToken);

    const redeemResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume`)
      .send({ token: resumeToken })
      .expect(200);
    const restoredRunToken = redeemResponse.body.data.runToken as string;
    expect(restoredRunToken).not.toBe(originalRunToken);
    expect(redeemResponse.body.data.currentSectionId).toBe(sectionId);

    const runtimeResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${restoredRunToken}`)
      .expect(200);
    expect(runtimeResponse.body.data.run.currentSectionId).toBe(sectionId);
    expect(runtimeResponse.body.data.values).toEqual([
      expect.objectContaining({ runId, stepId, value: 'Ada Lovelace' }),
    ]);

    await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .expect(401);
    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume`)
      .send({ token: resumeToken })
      .expect(401);

    const auditRows = await getOwnerDb().select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, runId));
    expect(auditRows.map(row => row.action)).toEqual(expect.arrayContaining([
      'run_resume_link_created',
      'run_resume_link_accessed',
    ]));
  });

  it('enforces resume-link expiration without consuming or auditing the credential', async () => {
    const expiredToken = randomBytes(32).toString('hex');
    const [expiredLink] = await getOwnerDb().insert(schema.runResumeLinks).values({
      tenantId: ctx.tenantId,
      runId,
      tokenHash: hashToken(expiredToken),
      recipientEmail: 'expired@example.com',
      expiresAt: new Date(Date.now() - 60_000),
    }).returning();

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume`)
      .send({ token: expiredToken })
      .expect(401);

    const [stored] = await getOwnerDb().select()
      .from(schema.runResumeLinks)
      .where(eq(schema.runResumeLinks.id, expiredLink.id));
    expect(stored.usedAt).toBeNull();
  });

  it('hands an in-progress run to a tenant user and denies a cross-tenant assignee', async () => {
    const assignee = await createTestUser(ctx, 'viewer');

    const handoffResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/handoff`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ assigneeUserId: assignee.userId, expiryMinutes: 60 })
      .expect(200);
    expect(handoffResponse.body.data).toMatchObject({
      assignedToUserId: assignee.userId,
      clientEmail: assignee.email.toLowerCase(),
    });

    const [storedRun] = await getOwnerDb().select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    expect(storedRun.assignedToUserId).toBe(assignee.userId);
    expect(storedRun.clientEmail).toBe(assignee.email.toLowerCase());
    expect(storedRun.assignmentUpdatedAt).not.toBeNull();

    const assignedRuntime = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .expect(200);
    expect(assignedRuntime.body.data.values).toEqual([
      expect.objectContaining({ runId, stepId, value: 'Ada Lovelace' }),
    ]);

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/handoff`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({ clientEmail: 'forwarded@example.com', expiryMinutes: 60 })
      .expect(403);

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/handoff`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ assigneeUserId: otherTenantUserId, expiryMinutes: 60 })
      .expect(403);

    const auditRows = await getOwnerDb().select({ action: schema.auditLogs.action })
      .from(schema.auditLogs)
      .where(inArray(schema.auditLogs.action, ['run_handoff', 'run_resume_link_created']));
    expect(auditRows.some(row => row.action === 'run_handoff')).toBe(true);
  });
});

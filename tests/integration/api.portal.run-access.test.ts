import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { workflowRunRepository } from '../../server/repositories';
import { authService } from '../../server/services/AuthService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

describe.sequential('portal-assigned run access', () => {
  let ctx: IntegrationTestContext | null = null;
  let workflowId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Portal assignment owner',
      createProject: true,
    });
    const factory = new TestFactory();
    const created = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: { status: 'active' },
    });
    workflowId = created.workflow.id;
    await db.update(schema.workflows)
      .set({ currentVersionId: created.version.id })
      .where(eq(schema.workflows.id, workflowId));
    const section = await factory.createSection(workflowId);
    await factory.createStep(section.id, { alias: 'name' });
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('persists an authenticated assignment and lets only that portal email mint a fresh run token', async () => {
    const assignedEmail = 'Client@example.com';
    const createResponse = await request(ctx!.baseURL)
      .post(`/api/workflows/${workflowId}/runs`)
      .set('Authorization', `Bearer ${ctx!.authToken}`)
      .send({ clientEmail: assignedEmail })
      .expect(201);

    const runId = createResponse.body.data.runId as string;
    const [storedRun] = await db.select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    expect(storedRun.clientEmail).toBe('client@example.com');
    expect(storedRun.accessMode).toBe('portal');

    const portalToken = authService.createPortalToken('client@example.com');
    const accessResponse = await request(ctx!.baseURL)
      .post(`/api/portal/runs/${runId}/access-token`)
      .set('Authorization', `Bearer ${portalToken}`)
      .expect(200);

    const runToken = accessResponse.body.data.runToken as string;
    expect(accessResponse.body.data.expiresAt).toBeTruthy();
    expect((await workflowRunRepository.findByToken(runToken))?.id).toBe(runId);

    const otherPortalToken = authService.createPortalToken('other@example.com');
    await request(ctx!.baseURL)
      .post(`/api/portal/runs/${runId}/access-token`)
      .set('Authorization', `Bearer ${otherPortalToken}`)
      .expect(404);
  });
});

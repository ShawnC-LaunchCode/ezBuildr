import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as schema from '@shared/schema';
import { workflowRunRepository } from '../../server/repositories';

import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
import { getOwnerDb } from '../helpers/ownerDb';

describe('run file uploads', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  let workflowId: string;
  let stepId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'File upload tenant',
      createProject: true,
    });
    factory = new TestFactory();

    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    workflowId = workflow.id;

    // Unpinned run: config resolves from the live steps table, which is where
    // TestFactory creates it. `createPage`'s second argument is column
    // overrides, not a version id.
    const page = await factory.createPage(workflowId);
    const step = await factory.createStep(page.id, {
      type: 'file_upload',
      title: 'Evidence',
      alias: 'evidence',
      config: { maxFiles: 2, allowedTypes: ['image/png', 'application/pdf'] },
    });
    stepId = step.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  async function createRun() {
    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      runToken: `test-token-${Date.now()}`,
    }).returning();
    return run;
  }

  it('uploads a file to a run step, retrieves a signed URL, and deletes it', async () => {
    const run = await createRun();
    const runId = run.id;
    const runToken = run.runToken;
    console.log(`[DEBUG] Created run ${run.id} with token ${runToken}`);
    const foundRun = await workflowRunRepository.findByToken(runToken);
    console.log(`[DEBUG] findByToken returned:`, foundRun?.id);

    // 1. Upload file
    const uploadRes = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${runToken}`)
      .attach('files', Buffer.from('fake image data'), 'test.png');
    
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    
    const fileValue = uploadRes.body.data.files[0];
    expect(fileValue.filename).toBe('test.png');
    expect(fileValue.storageKey).toContain(`tenants/${ctx.tenantId}/runs/${runId}/steps/${stepId}/`);

    // 2. Fetch signed URL
    const fetchUrlRes = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/steps/${stepId}/files/url`)
      .set('Authorization', `Bearer ${runToken}`)
      .query({ storageKey: fileValue.storageKey });
    
    expect(fetchUrlRes.status).toBe(200);
    expect(fetchUrlRes.body.data.url).toBeDefined();

    // 3. Delete file
    const deleteRes = await request(ctx.baseURL)
      .delete(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ storageKey: fileValue.storageKey });
    
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });

  it('denies cross-tenant and missing-token access', async () => {
    const run = await createRun();
    const runId = run.id;

    // Create another tenant to simulate cross-tenant access
    const alienCtx = await setupIntegrationTest({
      tenantName: 'Alien tenant',
      createProject: true,
    });
    const alienFactory = new TestFactory();
    const alienWorkflow = (await alienFactory.createWorkflow(alienCtx.projectId!, alienCtx.userId)).workflow;
    
    // Create alien run
    const [alienRun] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId: alienWorkflow.id,
      runToken: `alien-token-${Date.now()}`,
    }).returning();
    const alienRunToken = alienRun.runToken;

    // 1. Missing token
    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .attach('files', Buffer.from('test'), 'test.png')
      .expect(401);

    // 2. Alien token
    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/steps/${stepId}/files`)
      .set('Authorization', `Bearer ${alienRunToken}`)
      .attach('files', Buffer.from('test'), 'test.png')
      .expect(403);

    await alienCtx.cleanup();
  });
});

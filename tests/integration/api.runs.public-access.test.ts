import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential('public run access policy', () => {
  let ownerCtx: IntegrationTestContext | null = null;
  let outsiderCtx: IntegrationTestContext | null = null;
  let requireLoginSlug: string;
  let privateWorkflowId: string;
  let privateSlug: string;

  beforeAll(async () => {
    ownerCtx = await setupIntegrationTest({
      tenantName: 'Public run owner',
      createProject: true,
    });
    outsiderCtx = await setupIntegrationTest({
      tenantName: 'Public run outsider',
    });

    // Fixture rows belong to the observer, not the application pool (RLS-5).
    const factory = new TestFactory(getOwnerDb());
    const requireLogin = await factory.createWorkflow(ownerCtx.projectId!, ownerCtx.userId, {
      workflow: {
        status: 'active',
        isPublic: true,
        requireLogin: true,
      },
    });
    const publicSection = await factory.createSection(requireLogin.workflow.id);
    await factory.createStep(publicSection.id, { alias: 'publicQuestion' });
    await getOwnerDb().update(schema.workflows)
      .set({ currentVersionId: requireLogin.version.id })
      .where(eq(schema.workflows.id, requireLogin.workflow.id));
    requireLoginSlug = requireLogin.workflow.publicLink!;

    const privateWorkflow = await factory.createWorkflow(ownerCtx.projectId!, ownerCtx.userId, {
      workflow: {
        status: 'active',
        isPublic: false,
      },
    });
    const privateSection = await factory.createSection(privateWorkflow.workflow.id);
    await factory.createStep(privateSection.id, { alias: 'privateQuestion' });
    await getOwnerDb().update(schema.workflows)
      .set({ currentVersionId: privateWorkflow.version.id })
      .where(eq(schema.workflows.id, privateWorkflow.workflow.id));
    privateWorkflowId = privateWorkflow.workflow.id;
    privateSlug = privateWorkflow.workflow.publicLink!;
  });

  afterAll(async () => {
    await outsiderCtx?.cleanup();
    await ownerCtx?.cleanup();
  });

  it('returns 401 when an anonymous respondent opens a require-login workflow', async () => {
    const response = await request(ownerCtx!.baseURL)
      .post(`/api/workflows/public/${requireLoginSlug}/start`)
      .send({})
      .expect(401);

    expect(response.body.error).toBe('Authentication required for this workflow');
  });

  it('allows a signed-in respondent from another tenant to run a public require-login workflow', async () => {
    const response = await request(ownerCtx!.baseURL)
      .post(`/api/workflows/public/${requireLoginSlug}/start`)
      .set('Authorization', `Bearer ${outsiderCtx!.authToken}`)
      .send({})
      .expect(201);

    expect(response.body.data.workflowId).toBeDefined();
    expect(response.body.data.runToken).toBeTypeOf('string');
  });

  it('hides a private workflow from anonymous public-link callers', async () => {
    await request(ownerCtx!.baseURL)
      .post(`/api/workflows/public/${privateSlug}/start`)
      .send({})
      .expect(404);
  });

  it('denies a cross-tenant authenticated UUID launch for a private workflow', async () => {
    await request(ownerCtx!.baseURL)
      .post(`/api/workflows/${privateWorkflowId}/runs`)
      .set('Authorization', `Bearer ${outsiderCtx!.authToken}`)
      .send({})
      .expect(403);
  });
});

import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import { beforeAll, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../../server/db';
import type { DbTransaction } from '../../../server/repositories/BaseRepository';
import { workflowTenantResolver } from '../../../server/services/WorkflowTenantResolver';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';

/**
 * Contract tests for {@link workflowTenantResolver}.
 *
 * These run against a real database because the resolver's whole job is to walk
 * real ownership rows. The case that matters most — a workflow transferred to
 * an organization — is invisible to a mocked test, because the bug was that the
 * ownership columns were never read at all.
 */
describeWithDb('WorkflowTenantResolver', () => {
  // Tenant A: where the workflow is created.
  let tenantAId: string;
  let userAId: string;
  let projectAId: string;

  // Tenant B: where the workflow is transferred to.
  let tenantBId: string;
  let userBId: string;
  let orgBId: string;

  beforeAll(async () => {
    const factory = new TestFactory(db as unknown as DbTransaction);

    const a = await factory.createTenant();
    tenantAId = a.tenant.id;
    userAId = a.user.id;
    projectAId = a.project.id;

    const b = await factory.createTenant();
    tenantBId = b.tenant.id;
    userBId = b.user.id;

    const [org] = await db
      .insert(schema.organizations)
      .values({
        id: randomUUID(),
        name: 'Receiving Org',
        slug: `receiving-org-${randomUUID()}`,
        tenantId: tenantBId,
        createdByUserId: userBId,
      })
      .returning();
    orgBId = org.id;
  });

  /** Create a workflow, then apply raw column overrides to shape the fixture. */
  async function makeWorkflow(
    overrides: Partial<typeof schema.workflows.$inferInsert>
  ): Promise<string> {
    const factory = new TestFactory(db as unknown as DbTransaction);
    const { workflow } = await factory.createWorkflow(projectAId, userAId);
    if (Object.keys(overrides).length > 0) {
      await db
        .update(schema.workflows)
        .set(overrides)
        .where(eq(schema.workflows.id, workflow.id));
    }
    return workflow.id;
  }

  it('resolves a filed workflow to its project tenant', async () => {
    const workflowId = await makeWorkflow({});
    await expect(workflowTenantResolver.resolveForWorkflowId(workflowId)).resolves.toBe(
      tenantAId
    );
  });

  it("resolves a transferred org-owned workflow to the new owner's tenant, not the creator's", async () => {
    // This is the exact shape WorkflowService.transferOwnership() leaves behind
    // when a workflow moves to an org that does not own its project: ownership
    // columns repointed, projectId nulled, creatorId deliberately untouched.
    const workflowId = await makeWorkflow({
      ownerType: 'org',
      ownerUuid: orgBId,
      projectId: null,
    });

    const resolved = await workflowTenantResolver.resolveForWorkflowId(workflowId);

    expect(resolved).toBe(tenantBId);
    // Before the resolver was centralized, every block runner and branding
    // returned tenantAId here — the creator's tenant — while the workflow's
    // DataVault data had already been moved to tenant B.
    expect(resolved).not.toBe(tenantAId);
  });

  it("resolves a transferred user-owned workflow to the new owner's tenant", async () => {
    const workflowId = await makeWorkflow({
      ownerType: 'user',
      ownerUuid: userBId,
      projectId: null,
    });

    await expect(workflowTenantResolver.resolveForWorkflowId(workflowId)).resolves.toBe(
      tenantBId
    );
  });

  it('never returns ownerUuid itself as the tenant id', async () => {
    // GH-170's defect: ownerUuid is a users.id or organizations.id discriminated
    // by ownerType, never a tenants.id. Using it directly produced an IDOR.
    const workflowId = await makeWorkflow({
      ownerType: 'org',
      ownerUuid: orgBId,
      projectId: null,
    });

    const resolved = await workflowTenantResolver.resolveForWorkflowId(workflowId);

    expect(resolved).not.toBe(orgBId);
    expect(resolved).toBe(tenantBId);
  });

  it("falls back to the creator's tenant for a legacy workflow with no ownership columns", async () => {
    const workflowId = await makeWorkflow({
      ownerType: null,
      ownerUuid: null,
      projectId: null,
    });

    await expect(workflowTenantResolver.resolveForWorkflowId(workflowId)).resolves.toBe(
      tenantAId
    );
  });

  it('fails closed when nothing resolves', async () => {
    await expect(
      workflowTenantResolver.resolveForWorkflowId(randomUUID())
    ).resolves.toBeNull();
  });

  it('fails closed on an org principal whose organization no longer exists', async () => {
    const workflowId = await makeWorkflow({
      ownerType: 'org',
      ownerUuid: randomUUID(),
      projectId: null,
      creatorId: null,
      ownerId: null,
    });

    await expect(
      workflowTenantResolver.resolveForWorkflowId(workflowId)
    ).resolves.toBeNull();
  });

  it('prefers the run owner over the workflow when resolving for a run', async () => {
    const workflowId = await makeWorkflow({});
    const [workflow] = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId));

    const run = {
      ownerType: 'org',
      ownerUuid: orgBId,
      createdBy: `creator:${userAId}`,
    } as unknown as schema.WorkflowRun;

    // The workflow alone would resolve to tenant A via its project; the run's
    // own principal wins because a transfer updates runs too.
    await expect(workflowTenantResolver.resolveForRun(run, workflow)).resolves.toBe(
      tenantBId
    );
  });
});

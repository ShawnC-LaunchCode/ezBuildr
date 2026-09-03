/**
 * ICW2-7 — Activating a workflow must create a published version, which in turn
 * satisfies the anonymous-run precondition (the public-share dead-end fix).
 *
 * End-to-end: build (page + step) → mark public → changeStatus('active')
 * → an anonymous run starts with no "no published version" error.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workflows, users, tenants, projects, pages, steps, workflowRuns, auditLogs } from "@shared/schema";

import { runService } from "../../server/services/RunService";
import { workflowService } from "../../server/services/WorkflowService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

describe("ICW2-7 activation creates a version and unblocks anonymous runs", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;
  let workflowId: string;
  const publicSlug = `pub-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const [tenant] = await getOwnerDb().insert(tenants).values({ name: "Activation Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;
    const [user] = await getOwnerDb().insert(users).values({
      email: `activation_${Date.now()}@example.com`,
      fullName: "Activation Tester",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;
    const [project] = await getOwnerDb().insert(projects).values({
      title: "Activation Project",
      name: "Activation Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;

    // A public workflow with real content so serialization/lint have something to publish.
    const [workflow] = await getOwnerDb().insert(workflows).values({
      title: "Public Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
      isPublic: true,
      publicLink: publicSlug,
    }).returning();
    workflowId = workflow.id;

    const [page] = await getOwnerDb().insert(pages).values({ workflowId, title: "Page 1", order: 0 }).returning();
    await getOwnerDb().insert(steps).values({
      workflowId, pageId: page.id, title: "Your name", type: "text", alias: "name", order: 0,
    });
  });

  afterAll(async () => {
    if (workflowId) {
      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
      await getOwnerDb().delete(steps).where(eq(steps.workflowId, workflowId));
      await getOwnerDb().delete(pages).where(eq(pages.workflowId, workflowId));
      await getOwnerDb().delete(workflows).where(eq(workflows.id, workflowId));
    }
    if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {

      try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* table may be empty */ }
      await getOwnerDb().delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  it("sets currentVersionId on activation and lets an anonymous run start", async () => {
    // RLS-5: this test drives `runService` / `workflowService` DIRECTLY, so no
    // middleware opens a tenant context for them. Entering it here (not in a
    // hook — that does not propagate into a test body) is recipe step 3.
    enterTenantContextForTests(tenantId);
    // Reproduce the pre-fix dead-end: the OLD activation flipped status to 'active'
    // without ever creating a version, so createAnonymousRun hit the version guard.
    await getOwnerDb().update(workflows)
      .set({ status: "active", currentVersionId: null })
      .where(eq(workflows.id, workflowId));
    await expect(runService.createAnonymousRun(publicSlug)).rejects.toThrow(/no published version/i);

    // Back to draft, then activate through the real service path (ICW2-7).
    await getOwnerDb().update(workflows).set({ status: "draft" }).where(eq(workflows.id, workflowId));
    const activated = await workflowService.changeStatus(workflowId, userId, "active");
    expect(activated.status).toBe("active");
    expect(activated.currentVersionId).toBeTruthy();

    // After: the same public link now starts an anonymous run bound to the published version.
    const run = await runService.createAnonymousRun(publicSlug);
    expect(run.workflowId).toBe(workflowId);
    expect(run.workflowVersionId).toBe(activated.currentVersionId);
    expect(run.createdBy).toBe("anon");
  });

  it("publishing turns on public access and mints links that stay unique per title", async () => {
    enterTenantContextForTests(tenantId);

    // Two workflows sharing a title, neither public and neither holding a link:
    // exactly the state the builder's Publish button starts from.
    const sharedTitle = `Collision Interview ${randomUUID().slice(0, 8)}`;
    const createdIds: string[] = [];

    for (let i = 0; i < 2; i++) {
      const [wf] = await getOwnerDb().insert(workflows).values({
        title: sharedTitle,
        projectId,
        creatorId: userId,
        ownerId: userId,
        status: "draft",
        isPublic: false,
        publicLink: null,
      }).returning();
      createdIds.push(wf.id);
      const [page] = await getOwnerDb().insert(pages)
        .values({ workflowId: wf.id, title: "Page 1", order: 0 }).returning();
      await getOwnerDb().insert(steps).values({
        workflowId: wf.id, pageId: page.id, title: "Your name", type: "text", alias: "name", order: 0,
      });
    }

    try {
      const first = await workflowService.changeStatus(createdIds[0], userId, "active");
      const second = await workflowService.changeStatus(createdIds[1], userId, "active");

      // Publishing alone is now enough to make the workflow reachable.
      for (const activated of [first, second]) {
        expect(activated.status).toBe("active");
        expect(activated.isPublic).toBe(true);
        expect(activated.publicLink).toBeTruthy();
      }

      // The links must not collide: public_link has no unique constraint, and
      // findByPublicLink would otherwise resolve one owner's link to the other's
      // workflow.
      expect(first.publicLink).not.toBe(second.publicLink);

      // Both links actually start a run, against their own workflow.
      const firstRun = await runService.createAnonymousRun(first.publicLink!);
      const secondRun = await runService.createAnonymousRun(second.publicLink!);
      expect(firstRun.workflowId).toBe(createdIds[0]);
      expect(secondRun.workflowId).toBe(createdIds[1]);
    } finally {
      for (const id of createdIds) {
        await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, id));
        await getOwnerDb().delete(steps).where(eq(steps.workflowId, id));
        await getOwnerDb().delete(pages).where(eq(pages.workflowId, id));
        await getOwnerDb().delete(workflows).where(eq(workflows.id, id));
      }
    }
  });
});

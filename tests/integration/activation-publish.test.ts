/**
 * ICW2-7 — Activating a workflow must create a published version, which in turn
 * satisfies the anonymous-run precondition (the public-share dead-end fix).
 *
 * End-to-end: build (section + step) → mark public → changeStatus('active')
 * → an anonymous run starts with no "no published version" error.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workflows, users, tenants, projects, sections, steps, workflowRuns, auditLogs } from "@shared/schema";

import { db } from "../../server/db";
import { runService } from "../../server/services/RunService";
import { workflowService } from "../../server/services/WorkflowService";

describe("ICW2-7 activation creates a version and unblocks anonymous runs", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;
  let workflowId: string;
  const publicSlug = `pub-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const [tenant] = await db.insert(tenants).values({ name: "Activation Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;
    const [user] = await db.insert(users).values({
      email: `activation_${Date.now()}@example.com`,
      fullName: "Activation Tester",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;
    const [project] = await db.insert(projects).values({
      title: "Activation Project",
      name: "Activation Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;

    // A public workflow with real content so serialization/lint have something to publish.
    const [workflow] = await db.insert(workflows).values({
      title: "Public Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
      isPublic: true,
      publicLink: publicSlug,
    }).returning();
    workflowId = workflow.id;

    const [section] = await db.insert(sections).values({ workflowId, title: "Page 1", order: 0 }).returning();
    await db.insert(steps).values({
      workflowId, sectionId: section.id, title: "Your name", type: "short_text", alias: "name", order: 0,
    });
  });

  afterAll(async () => {
    if (workflowId) {
      await db.delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
      await db.delete(steps).where(eq(steps.workflowId, workflowId));
      await db.delete(sections).where(eq(sections.workflowId, workflowId));
      await db.delete(workflows).where(eq(workflows.id, workflowId));
    }
    if (projectId) { await db.delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {
      // eslint-disable-next-line no-empty
      try { await db.delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* table may be empty */ }
      await db.delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await db.delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  it("sets currentVersionId on activation and lets an anonymous run start", async () => {
    // Reproduce the pre-fix dead-end: the OLD activation flipped status to 'active'
    // without ever creating a version, so createAnonymousRun hit the version guard.
    await db.update(workflows)
      .set({ status: "active", currentVersionId: null })
      .where(eq(workflows.id, workflowId));
    await expect(runService.createAnonymousRun(publicSlug)).rejects.toThrow(/no published version/i);

    // Back to draft, then activate through the real service path (ICW2-7).
    await db.update(workflows).set({ status: "draft" }).where(eq(workflows.id, workflowId));
    const activated = await workflowService.changeStatus(workflowId, userId, "active");
    expect(activated.status).toBe("active");
    expect(activated.currentVersionId).toBeTruthy();

    // After: the same public link now starts an anonymous run bound to the published version.
    const run = await runService.createAnonymousRun(publicSlug);
    expect(run.workflowId).toBe(workflowId);
    expect(run.workflowVersionId).toBe(activated.currentVersionId);
    expect(run.createdBy).toBe("anon");
  });
});

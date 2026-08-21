/**
 * RUN2-7 — POST /api/workflows/:id/publish must clear the same lint gate that
 * PUT /api/workflows/:id/status enforces.
 *
 * publishVersion sets status to 'active' itself, so before this fix the publish
 * door — the one the builder actually uses — activated workflows with zero
 * validation while the status door refused them.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { workflows, users, tenants, projects, sections, steps, workflowVersions, workflowRuns, auditLogs } from "@shared/schema";

import { runService } from "../../server/services/RunService";
import { VersionService, versionService } from "../../server/services/VersionService";
import { runRuntimeService } from "../../server/services/workflow-runs/RunRuntimeService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe("RUN2-7 publish is gated on lint", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;
  let outsiderId: string;
  let invalidWorkflowId: string;
  let validWorkflowId: string;

  beforeAll(async () => {
    const [tenant] = await getOwnerDb().insert(tenants).values({ name: "Publish Gate Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;

    const [user] = await getOwnerDb().insert(users).values({
      email: `publishgate_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "Publish Gate Owner",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;

    const [outsider] = await getOwnerDb().insert(users).values({
      email: `outsider_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "No Access",
      tenantId,
      role: "user",
      tenantRole: "viewer",
    }).returning();
    outsiderId = outsider.id;

    const [project] = await getOwnerDb().insert(projects).values({
      title: "Publish Gate Project",
      name: "Publish Gate Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;

    // Invalid: a section with no questions at all -> lint error
    // "Workflow must have at least one question."
    const [invalid] = await getOwnerDb().insert(workflows).values({
      title: "Empty Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    invalidWorkflowId = invalid.id;
    await getOwnerDb().insert(sections).values({ workflowId: invalidWorkflowId, title: "Page 1", order: 0 });

    // Valid: a section with a real question.
    const [valid] = await getOwnerDb().insert(workflows).values({
      title: "Good Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    validWorkflowId = valid.id;
    const [validSection] = await getOwnerDb().insert(sections)
      .values({ workflowId: validWorkflowId, title: "Page 1", order: 0 })
      .returning();
    await getOwnerDb().insert(steps).values({
      workflowId: validWorkflowId,
      sectionId: validSection.id,
      title: "Your name",
      type: "short_text",
      alias: "name",
      order: 0,
    });
  });

  afterAll(async () => {
    for (const id of [invalidWorkflowId, validWorkflowId]) {
      if (!id) { continue; }
      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, id));
      await getOwnerDb().delete(workflowVersions).where(eq(workflowVersions.workflowId, id));
      await getOwnerDb().delete(steps).where(eq(steps.workflowId, id));
      await getOwnerDb().delete(sections).where(eq(sections.workflowId, id));
      await getOwnerDb().delete(workflows).where(eq(workflows.id, id));
    }
    if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
    for (const id of [userId, outsiderId]) {
      if (!id) { continue; }

      try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, id)); } catch (e) { /* may be empty */ }
      await getOwnerDb().delete(users).where(eq(users.id, id));
    }
    if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  it("refuses to publish a workflow with lint errors, and creates no version", async () => {
    await expect(versionService.publishVersion(invalidWorkflowId, userId))
      .rejects.toThrow(/Cannot publish workflow:.*at least one question/i);

    const versions = await getOwnerDb().select().from(workflowVersions)
      .where(eq(workflowVersions.workflowId, invalidWorkflowId));
    expect(versions).toHaveLength(0);

    const [wf] = await getOwnerDb().select().from(workflows).where(eq(workflows.id, invalidWorkflowId));
    expect(wf.status).toBe("draft");
    expect(wf.currentVersionId).toBeNull();
  });

  it("surfaces the failure as a 400, not a 500", async () => {
    await expect(versionService.publishVersion(invalidWorkflowId, userId))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("force: true publishes anyway and records the overridden lint errors", async () => {
    const version = await versionService.publishVersion(invalidWorkflowId, userId, "forced past lint", true);
    expect(version.published).toBe(true);

    const [wf] = await getOwnerDb().select().from(workflows).where(eq(workflows.id, invalidWorkflowId));
    expect(wf.status).toBe("active");
    expect(wf.currentVersionId).toBe(version.id);

    const logs = await getOwnerDb().select().from(auditLogs).where(eq(auditLogs.entityId, version.id));
    const publishLog = logs.find(log => log.action === "publish");
    expect(publishLog).toBeDefined();
    const details = publishLog?.details as { forced?: boolean; lintErrorsOverridden?: string[] };
    expect(details.forced).toBe(true);
    expect(details.lintErrorsOverridden?.join(" ")).toMatch(/at least one question/i);
  });

  it("publishes a lint-clean workflow normally", async () => {
    const version = await versionService.publishVersion(validWorkflowId, userId, "clean");
    expect(version.published).toBe(true);

    const [wf] = await getOwnerDb().select().from(workflows).where(eq(workflows.id, validWorkflowId));
    expect(wf.status).toBe("active");
    expect(wf.currentVersionId).toBe(version.id);
  });

  it("guarantees a workflow that passes the gate also loads at run time (RUN2-9 AC3)", async () => {
    // The structural gate requires UUID ids specifically so that anything it
    // admits parses against RunRuntimeService's VersionRuntimeSchema. Prove the
    // loop closes: publish -> start a run -> load the pinned runtime.
    const version = await versionService.publishVersion(validWorkflowId, userId, "runtime check");
    const run = await runService.createRun(validWorkflowId, userId, {});
    const runtime = await runRuntimeService.getRuntime(run.id, { userId });

    expect(runtime.run.workflowVersionId).toBe(version.id);
    expect(runtime.sections.length).toBeGreaterThan(0);
    expect(runtime.steps.length).toBeGreaterThan(0);

    await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.id, run.id));
  });

  it("checks authorization before doing any serialization work", async () => {
    const serializeSpy = vi.spyOn(VersionService.prototype, "serializeWorkflow");
    try {
      await expect(versionService.publishVersion(validWorkflowId, outsiderId))
        .rejects.toThrow(/Access denied/i);
      // The ACL check must short-circuit before the expensive serialize call.
      expect(serializeSpy).not.toHaveBeenCalled();
    } finally {
      serializeSpy.mockRestore();
    }
  });
});

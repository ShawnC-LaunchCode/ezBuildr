/**
 * RVP-6 — every new run gets pinned to a version at creation (Option B).
 *
 * `RunService.createRun` used to permit an authenticated creator's run to
 * stay versionless when the workflow had neither a published nor a pinned
 * version (only logging "run might be unstable"). That is the root cause the
 * rest of the Run Version Pinning initiative removes: a run with no
 * `workflowVersionId` has nothing for the pinned-definition provider (RVP-1)
 * to resolve from.
 *
 * Fix: when an authenticated creator's run resolves no version, auto-create
 * one via `versionService.createDraftVersion` and pin the run to it. Handle
 * `createDraftVersion`'s null return (checksum unchanged, no new row) by
 * reusing the latest existing version instead of treating it as a failure.
 * The anonymous guard is untouched -- it must keep throwing.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workflows, users, tenants, projects, sections, steps, workflowVersions, workflowRuns, auditLogs } from "@shared/schema";

import { runService } from "../../server/services/RunService";
import { versionService } from "../../server/services/VersionService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe("RVP-6 pin every new run at creation (Option B)", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const [tenant] = await getOwnerDb().insert(tenants).values({ name: "RVP-6 Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;
    const [user] = await getOwnerDb().insert(users).values({
      email: `rvp6_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "RVP-6 Tester",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;
    const [project] = await getOwnerDb().insert(projects).values({
      title: "RVP-6 Project",
      name: "RVP-6 Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;
  });

  afterAll(async () => {
    if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {

      try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* table may be empty */ }
      await getOwnerDb().delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  /** A workflow with real content (so serialization has something to
   * checksum) and, deliberately, no `currentVersionId`/`pinnedVersionId`.
   * Defaults to draft/private (the authenticated-creator preview case); pass
   * `{ status: 'active', isPublic: true }` for the anonymous-run case, since
   * `RunAuthResolver.verifyCreateAccess` only lets an anonymous caller reach
   * the version check at all when the workflow is active and public. */
  async function makeVersionlessWorkflow(overrides?: { status?: 'draft' | 'active'; isPublic?: boolean }) {
    const [workflow] = await getOwnerDb().insert(workflows).values({
      title: "RVP-6 Draft",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: overrides?.status ?? "draft",
      isPublic: overrides?.isPublic ?? false,
    }).returning();
    const [section] = await getOwnerDb().insert(sections).values({ workflowId: workflow.id, title: "Page 1", order: 0 }).returning();
    await getOwnerDb().insert(steps).values({
      workflowId: workflow.id, sectionId: section.id, title: "Your name", type: "short_text", alias: "name", order: 0,
    });
    return workflow;
  }

  async function versionsFor(workflowId: string) {
    return getOwnerDb().select().from(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
  }

  // Each test creates and tears down its own workflow (runs before
  // sections/steps/versions before the workflow itself), since the
  // per-workflow version count is exactly what these tests assert on.
  async function cleanupWorkflow(workflowId: string): Promise<void> {
    await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
    await getOwnerDb().delete(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
    await getOwnerDb().delete(steps).where(eq(steps.workflowId, workflowId));
    await getOwnerDb().delete(sections).where(eq(sections.workflowId, workflowId));
    await getOwnerDb().delete(workflows).where(eq(workflows.id, workflowId));
  }

  it("AC1: pins an authenticated creator's run to a newly created draft version when the workflow has none", async () => {
    const workflow = await makeVersionlessWorkflow();
    try {
      const run = await runService.createRun(workflow.id, userId, {});

      expect(run.workflowVersionId).toBeTruthy();

      const versions = await versionsFor(workflow.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe(run.workflowVersionId);
      expect(versions[0].isDraft).toBe(true);

      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.id, run.id));
    } finally {
      await cleanupWorkflow(workflow.id);
    }
  });

  it("AC2: reuses the latest existing version on a second unchanged run instead of creating another one", async () => {
    const workflow = await makeVersionlessWorkflow();
    try {
      const firstRun = await runService.createRun(workflow.id, userId, {});
      const secondRun = await runService.createRun(workflow.id, userId, {});

      // Same workflow content both times -> createDraftVersion's checksum
      // comparison finds nothing changed and returns null; RunService must
      // fall back to the latest existing version rather than leaving the
      // second run versionless or erroring.
      expect(secondRun.workflowVersionId).toBe(firstRun.workflowVersionId);

      const versions = await versionsFor(workflow.id);
      expect(versions).toHaveLength(1);

      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, workflow.id));
    } finally {
      await cleanupWorkflow(workflow.id);
    }
  });

  it("AC3: does not create a version when the workflow already resolves a published version", async () => {
    const workflow = await makeVersionlessWorkflow();
    try {
      const published = await versionService.publishVersion(workflow.id, userId, "rvp6 publish");
      const versionsBefore = await versionsFor(workflow.id);
      expect(versionsBefore).toHaveLength(1);

      const run = await runService.createRun(workflow.id, userId, {});

      expect(run.workflowVersionId).toBe(published.id);
      const versionsAfter = await versionsFor(workflow.id);
      expect(versionsAfter).toHaveLength(1);

      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.id, run.id));
    } finally {
      await cleanupWorkflow(workflow.id);
    }
  });

  it("AC4: still refuses an anonymous run on a workflow with no published version, and creates no version", async () => {
    // Must be active + public: that's the only way RunAuthResolver.verifyCreateAccess
    // lets an anonymous (userId undefined) caller past the workflow lookup and
    // down into the version check this test is targeting.
    const workflow = await makeVersionlessWorkflow({ status: 'active', isPublic: true });
    try {
      await expect(runService.createRun(workflow.id, undefined, {})).rejects.toThrow(
        "Workflow has no published version for anonymous runs"
      );

      const versions = await versionsFor(workflow.id);
      expect(versions).toHaveLength(0);
    } finally {
      await cleanupWorkflow(workflow.id);
    }
  });
});

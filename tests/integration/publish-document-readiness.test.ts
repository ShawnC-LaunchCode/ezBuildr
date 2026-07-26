/**
 * GH-152 — publishing must refuse a workflow whose final documents cannot be
 * generated.
 *
 * The RUN2 publish gate covered runner step support and logic references but
 * never looked at documents, so a final block pointing at a template that does
 * not exist published cleanly and then failed for every respondent:
 * `RunLifecycleService` resolves each `documentId` through
 * `documentTemplateRepository.findByIdAndProjectId(documentId, projectId)` and
 * `createTemplateResolver` throws `notFound` when it misses.
 *
 * This exercises the real `publishVersion` path against a real database, so it
 * covers `buildReadinessContext`'s query as well as the pure rules — the pure
 * rules themselves are unit-tested in
 * `tests/unit/services/workflowStructureRules.documentReadiness.test.ts`.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  workflows, users, tenants, projects, sections, steps,
  workflowVersions, workflowRuns, auditLogs, templates,
} from "@shared/schema";

import { db } from "../../server/db";
import { versionService } from "../../server/services/VersionService";

const MISSING_TEMPLATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("GH-152 publish is gated on document readiness", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;
  let workflowId: string;
  let finalStepId: string;
  let realTemplateId: string;

  beforeAll(async () => {
    const [tenant] = await db.insert(tenants)
      .values({ name: "Doc Readiness Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;

    const [user] = await db.insert(users).values({
      email: `docready_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "Doc Readiness Owner",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;

    const [project] = await db.insert(projects).values({
      title: "Doc Readiness Project",
      name: "Doc Readiness Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;

    // A real template in this project — the control for the "publishes once the
    // template exists" case below.
    const [template] = await db.insert(templates).values({
      projectId,
      name: "Engagement Letter",
      fileRef: `doc-readiness-${randomUUID().slice(0, 8)}.docx`,
      type: "docx",
    }).returning();
    realTemplateId = template.id;

    // A workflow that is otherwise entirely publishable: one real question plus
    // a final block whose document points at a template id that does not exist.
    const [workflow] = await db.insert(workflows).values({
      title: "Interview With Broken Final Docs",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    workflowId = workflow.id;

    const [section] = await db.insert(sections)
      .values({ workflowId, title: "Page 1", order: 0 }).returning();
    await db.insert(steps).values({
      workflowId,
      sectionId: section.id,
      title: "Your name",
      type: "short_text",
      alias: "name",
      order: 0,
    });

    const [finalStep] = await db.insert(steps).values({
      workflowId,
      sectionId: section.id,
      title: "Your documents",
      type: "final_documents",
      alias: "final_docs",
      order: 1,
      config: {
        markdownHeader: "# Your documents",
        documents: [
          { id: "d1", documentId: MISSING_TEMPLATE_ID, alias: "engagement_letter" },
        ],
      },
    }).returning();
    finalStepId = finalStep.id;
  });

  afterAll(async () => {
    if (workflowId) {
      await db.delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
      await db.delete(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
      await db.delete(steps).where(eq(steps.workflowId, workflowId));
      await db.delete(sections).where(eq(sections.workflowId, workflowId));
      await db.delete(workflows).where(eq(workflows.id, workflowId));
    }
    if (realTemplateId) { await db.delete(templates).where(eq(templates.id, realTemplateId)); }
    if (projectId) { await db.delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {
      // eslint-disable-next-line no-empty
      try { await db.delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* may be empty */ }
      await db.delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await db.delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  it("refuses to publish when a final document references a template that does not exist", async () => {
    await expect(versionService.publishVersion(workflowId, userId))
      .rejects.toThrow(/Cannot publish workflow:.*references a template that does not exist/i);
  });

  it("surfaces the refusal as a 400 and creates no version", async () => {
    await expect(versionService.publishVersion(workflowId, userId))
      .rejects.toMatchObject({ statusCode: 400 });

    const versions = await db.select().from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId));
    expect(versions).toHaveLength(0);

    const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    expect(wf.status).toBe("draft");
    expect(wf.currentVersionId).toBeNull();
  });

  it("publishes the same workflow once the document points at a real template", async () => {
    // The only change is the template id — proving the gate resolves against the
    // project's actual templates rather than rejecting final blocks wholesale.
    await db.update(steps).set({
      config: {
        markdownHeader: "# Your documents",
        documents: [
          { id: "d1", documentId: realTemplateId, alias: "engagement_letter" },
        ],
      },
    }).where(eq(steps.id, finalStepId));

    const version = await versionService.publishVersion(workflowId, userId, "documents resolved");
    expect(version.published).toBe(true);

    const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    expect(wf.status).toBe("active");
    expect(wf.currentVersionId).toBe(version.id);
  });

  it("refuses a template belonging to a different project", async () => {
    // Tenancy/scoping guard: an id that exists but not in this workflow's project
    // must be treated as missing, exactly as findByIdAndProjectId would at run time.
    const [otherProject] = await db.insert(projects).values({
      title: "Someone Else's Project",
      name: "Someone Else's Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    const [foreignTemplate] = await db.insert(templates).values({
      projectId: otherProject.id,
      name: "Foreign Template",
      fileRef: `foreign-${randomUUID().slice(0, 8)}.docx`,
      type: "docx",
    }).returning();

    try {
      await db.update(steps).set({
        config: {
          markdownHeader: "# Your documents",
          documents: [
            { id: "d1", documentId: foreignTemplate.id, alias: "engagement_letter" },
          ],
        },
      }).where(eq(steps.id, finalStepId));

      await expect(versionService.publishVersion(workflowId, userId))
        .rejects.toThrow(/references a template that does not exist/i);
    } finally {
      await db.delete(templates).where(eq(templates.id, foreignTemplate.id));
      await db.delete(projects).where(eq(projects.id, otherProject.id));
    }
  });
});

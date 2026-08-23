/**
 * GH-152 — publishing must refuse a workflow whose final documents cannot be
 * generated.
 *
 * The RUN2 publish gate covered runner step support and logic references but
 * never looked at documents, so a final block pointing at a template that does
 * not exist published cleanly and then failed for every respondent:
 * `RunLifecycleService` resolves each `documentId` through
 * `documentTemplateRepository.findByIdAndProjectId(documentId, projectId)` and
 * `createProjectTemplateResolver` throws `notFound` when it misses.
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
  workflows, users, tenants, projects, pages, steps,
  workflowVersions, workflowRuns, auditLogs, templates,
} from "@shared/schema";

import { versionService } from "../../server/services/VersionService";
import { workflowLintService } from "../../server/services/WorkflowLintService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
// RLS-5 recipe step 3: direct service calls get no middleware, so the tenant
// context is entered per test body — a hook entry does not propagate.
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

const MISSING_TEMPLATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("GH-152 publish is gated on document readiness", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;
  let workflowId: string;
  let finalStepId: string;
  let realTemplateId: string;

  beforeAll(async () => {
    const [tenant] = await getOwnerDb().insert(tenants)
      .values({ name: "Doc Readiness Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;

    const [user] = await getOwnerDb().insert(users).values({
      email: `docready_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "Doc Readiness Owner",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;

    const [project] = await getOwnerDb().insert(projects).values({
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
    const [template] = await getOwnerDb().insert(templates).values({
      projectId,
      name: "Engagement Letter",
      fileRef: `doc-readiness-${randomUUID().slice(0, 8)}.docx`,
      type: "docx",
    }).returning();
    realTemplateId = template.id;

    // A workflow that is otherwise entirely publishable: one real question plus
    // a final block whose document points at a template id that does not exist.
    const [workflow] = await getOwnerDb().insert(workflows).values({
      title: "Interview With Broken Final Docs",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    workflowId = workflow.id;

    const [page] = await getOwnerDb().insert(pages)
      .values({ workflowId, title: "Page 1", order: 0 }).returning();
    await getOwnerDb().insert(steps).values({
      workflowId,
      pageId: page.id,
      title: "Your name",
      type: "short_text",
      alias: "name",
      order: 0,
    });

    const [finalStep] = await getOwnerDb().insert(steps).values({
      workflowId,
      pageId: page.id,
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
      await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
      await getOwnerDb().delete(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
      await getOwnerDb().delete(steps).where(eq(steps.workflowId, workflowId));
      await getOwnerDb().delete(pages).where(eq(pages.workflowId, workflowId));
      await getOwnerDb().delete(workflows).where(eq(workflows.id, workflowId));
    }
    if (realTemplateId) { await getOwnerDb().delete(templates).where(eq(templates.id, realTemplateId)); }
    if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {

      try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* may be empty */ }
      await getOwnerDb().delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  it("refuses to publish when a final document references a template that does not exist", async () => {

    enterTenantContextForTests(tenantId);
    await expect(versionService.publishVersion(workflowId, userId))
      .rejects.toThrow(/Cannot publish workflow:.*references a template that does not exist/i);
  });

  it("surfaces the refusal as a 400 and creates no version", async () => {

    enterTenantContextForTests(tenantId);
    await expect(versionService.publishVersion(workflowId, userId))
      .rejects.toMatchObject({ statusCode: 400 });

    const versions = await getOwnerDb().select().from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId));
    expect(versions).toHaveLength(0);

    const [wf] = await getOwnerDb().select().from(workflows).where(eq(workflows.id, workflowId));
    expect(wf.status).toBe("draft");
    expect(wf.currentVersionId).toBeNull();
  });

  it("shows the builder's Review tab the same document finding the publish gate blocks on", async () => {

    enterTenantContextForTests(tenantId);
    // Regression guard for the Review/publish split: `WorkflowLintService.lint`
    // used to run only `lintWorkflowContent`, which never looks at documents, so
    // the Review tab reported this workflow clean and publishing then failed on
    // it. The two must resolve findings through the same path.
    const issues = await workflowLintService.lint(workflowId, userId);

    const documentIssue = issues.find(issue => issue.category === "documents");
    expect(documentIssue, JSON.stringify(issues)).toBeDefined();
    expect(documentIssue).toMatchObject({
      type: "error",
      category: "documents",
    });
    expect(documentIssue?.message).toMatch(/references a template that does not exist/i);

    // The deep link has to land on something selectable, or "Fix" is decorative.
    expect(documentIssue?.target.tab).toBe("pages");
    expect(documentIssue?.target.stepId).toBe(finalStepId);

    // ...and it is the very finding that blocks publishing, not a lookalike.
    const gate = versionService.validateWorkflow(
      workflowId,
      await versionService.serializeWorkflow(workflowId, userId) as never,
      { knownTemplateIds: new Set<string>([realTemplateId]) }
    );
    expect(gate.errors).toContain(documentIssue?.message);
  });

  it("publishes the same workflow once the document points at a real template", async () => {

    enterTenantContextForTests(tenantId);
    // The only change is the template id — proving the gate resolves against the
    // project's actual templates rather than rejecting final blocks wholesale.
    await getOwnerDb().update(steps).set({
      config: {
        markdownHeader: "# Your documents",
        documents: [
          { id: "d1", documentId: realTemplateId, alias: "engagement_letter" },
        ],
      },
    }).where(eq(steps.id, finalStepId));

    const version = await versionService.publishVersion(workflowId, userId, "documents resolved");
    expect(version.published).toBe(true);

    const [wf] = await getOwnerDb().select().from(workflows).where(eq(workflows.id, workflowId));
    expect(wf.status).toBe("active");
    expect(wf.currentVersionId).toBe(version.id);
  });

  it("refuses a template belonging to a different project", async () => {

    enterTenantContextForTests(tenantId);
    // Tenancy/scoping guard: an id that exists but not in this workflow's project
    // must be treated as missing, exactly as findByIdAndProjectId would at run time.
    const [otherProject] = await getOwnerDb().insert(projects).values({
      title: "Someone Else's Project",
      name: "Someone Else's Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    const [foreignTemplate] = await getOwnerDb().insert(templates).values({
      projectId: otherProject.id,
      name: "Foreign Template",
      fileRef: `foreign-${randomUUID().slice(0, 8)}.docx`,
      type: "docx",
    }).returning();

    try {
      await getOwnerDb().update(steps).set({
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
      await getOwnerDb().delete(templates).where(eq(templates.id, foreignTemplate.id));
      await getOwnerDb().delete(projects).where(eq(projects.id, otherProject.id));
    }
  });
});

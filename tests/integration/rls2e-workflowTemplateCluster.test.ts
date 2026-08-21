/**
 * RLS-2e vertical proof for the Workflow/template cluster: WorkflowService
 * and VersionService each open exactly ONE tenant-scoped transaction at the
 * service boundary (copying the `withTx` shape RLS-2a established — see
 * docs/architecture/TENANT_ISOLATION_RLS.md §2b/§2c) and fail closed when
 * no tenant is in the async context.
 *
 * Both services are Variant 1 from §2c: neither takes a `tenantId`
 * argument (workflows/workflow_versions have no `tenant_id` column of
 * their own — tenancy is derived from ownership, §2d), so `withTx` is the
 * reuse-or-open-ambient shape only, same as CollectionFieldService /
 * OrganizationService.
 *
 * This is a direct-service-call suite (no HTTP) so it binds the ambient
 * tenant context explicitly with `enterTenantContextForTests` inside each
 * test body — binding in beforeAll/beforeEach does not propagate into the
 * test (AsyncLocalStorage.enterWith is scoped per vitest hook/test
 * execution; measured in RLS-2b/2c/2d, not assumed).
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";
import type { InsertWorkflow } from "@shared/schema";

import { initializeDatabase } from "../../server/db";
import { projectRepository, sectionRepository, workflowRepository } from "../../server/repositories";
import { templateService } from "../../server/services/TemplateService";
import { templateValidationService } from "../../server/services/TemplateValidationService";
import { versionService } from "../../server/services/VersionService";
import { workflowClonerService } from "../../server/services/WorkflowClonerService";
import { workflowService } from "../../server/services/WorkflowService";
import { enterTenantContextForTests, getCurrentTenantId, withTenant } from "../../server/utils/rlsContext";
// Fixture creation and cleanup are the OBSERVER (tests/helpers/ownerDb.ts).
// The assertions still run against the application pool — including the
// `current_setting` probe, which is specifically about that pool.
import { getOwnerDb } from "../helpers/ownerDb";

describe("Workflow/template cluster service-boundary tenant transaction (RLS-2e)", () => {
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    await initializeDatabase();

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
      name: `RLS-2e Workflow Cluster ${nanoid()}`,
      plan: "pro",
    }).returning();
    tenantId = tenant.id;

    const [user] = await getOwnerDb().insert(schema.users).values({
      email: `rls2e-workflow-${nanoid()}@example.com`,
      fullName: "RLS-2e Workflow Cluster User",
      tenantId,
    }).returning();
    userId = user.id;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.creatorId, userId));
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, tenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  // AC4 — fail-closed, per converted service in this cluster. A per-cluster
  // parameterised test is explicitly acceptable per the ticket.
  describe("the no-tenant path fails closed", () => {
    // Staged rollout: `withCurrentTenant` only THROWS on a missing tenant once
    // RLS is actually enforced. Before that it warns and runs unscoped, because
    // failing early buys no safety while every row is visible anyway — and
    // throwing unconditionally broke real customer paths (anonymous runs,
    // run-token requests). These assertions are about the enforced behaviour,
    // so turn enforcement on for their duration and restore it after.
    const priorRlsEnforced = process.env.RLS_ENFORCED;
    beforeAll(() => { process.env.RLS_ENFORCED = "true"; });
    afterAll(() => {
      if (priorRlsEnforced === undefined) { delete process.env.RLS_ENFORCED; }
      else { process.env.RLS_ENFORCED = priorRlsEnforced; }
    });

    it.each([
      {
        name: "WorkflowService.listWorkflows",
        call: () => workflowService.listWorkflows(userId),
      },
      {
        name: "WorkflowService.listUnfiledWorkflows",
        call: () => workflowService.listUnfiledWorkflows(userId),
      },
      {
        name: "VersionService.listVersions",
        call: () => versionService.listVersions("00000000-0000-0000-0000-000000000000"),
      },
      {
        name: "VersionService.getLatestVersion",
        call: () => versionService.getLatestVersion("00000000-0000-0000-0000-000000000000"),
      },
      {
        name: "TemplateService.listTemplates",
        call: () => templateService.listTemplates("00000000-0000-0000-0000-000000000000"),
      },
      {
        name: "TemplateValidationService.validate",
        call: () => templateValidationService.validate(
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000000"
        ),
      },
      {
        name: "WorkflowClonerService.copyProject",
        call: () => workflowClonerService.copyProject("00000000-0000-0000-0000-000000000000", userId),
      },
      {
        name: "WorkflowClonerService.copyWorkflow",
        call: () => workflowClonerService.copyWorkflow("00000000-0000-0000-0000-000000000000", userId),
      },
    ])("$name throws and never reaches the repository when there is no tenant in the async context", async ({ call }) => {
      expect(getCurrentTenantId()).toBeUndefined();
      const findByUserAccessSpy = vi.spyOn(workflowRepository, "findByUserAccess");
      const projectFindByIdSpy = vi.spyOn(projectRepository, "findById");
      await expect(call()).rejects.toThrow(/no tenant in context/i);
      expect(findByUserAccessSpy).not.toHaveBeenCalled();
      expect(projectFindByIdSpy).not.toHaveBeenCalled();
      findByUserAccessSpy.mockRestore();
      projectFindByIdSpy.mockRestore();
    });
  });

  // AC5 — a multi-repository operation in this cluster shares the IDENTICAL
  // transaction object across both repositories, not merely the same
  // tenant. WorkflowService.createWorkflow spans workflowRepo.create and
  // sectionRepo.create (the default first section).
  it("opens exactly one transaction for WorkflowService.createWorkflow spanning workflowRepo and sectionRepo", async () => {
    enterTenantContextForTests(tenantId);

    const seenTxs: unknown[] = [];
    const originalCreate = workflowRepository.create.bind(workflowRepository);
    const createSpy = vi.spyOn(workflowRepository, "create").mockImplementation(async (data, tx) => {
      seenTxs.push(tx);
      return originalCreate(data, tx);
    });
    const originalSectionCreate = sectionRepository.create.bind(sectionRepository);
    const sectionCreateSpy = vi.spyOn(sectionRepository, "create").mockImplementation(async (data, tx) => {
      seenTxs.push(tx);
      return originalSectionCreate(data, tx);
    });

    enterTenantContextForTests(tenantId);
    const workflow = await workflowService.createWorkflow(
      { title: `RLS-2e Multi-Repo Workflow ${nanoid()}`, creatorId: userId } as InsertWorkflow,
      userId
    );

    createSpy.mockRestore();
    sectionCreateSpy.mockRestore();

    expect(workflow.id).toBeDefined();
    expect(seenTxs).toHaveLength(2);
    expect(seenTxs[0]).toBeDefined();
    // The discriminating assertion: same object reference across both
    // repositories, not merely two transactions scoped to the same tenant.
    expect(seenTxs[0]).toBe(seenTxs[1]);

    await getOwnerDb().delete(schema.sections).where(eq(schema.sections.workflowId, workflow.id));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflow.id));
  });

  it("reuses a caller-supplied transaction instead of opening a nested one (WorkflowService.verifyAccess)", async () => {
    enterTenantContextForTests(tenantId);
    const workflow = await workflowService.createWorkflow(
      { title: `RLS-2e Reuse-Tx Workflow ${nanoid()}`, creatorId: userId } as InsertWorkflow,
      userId
    );

    enterTenantContextForTests(tenantId);
    // A caller-supplied transaction, but a TENANT-SCOPED one — which is what a
    // real caller passing `tx` into a converted service always has. A bare
    // `db.transaction` here carries no GUC, so `verifyAccess`'s read of
    // `workflows` returns nothing under the restricted role and the assertion
    // never gets to run.
    await withTenant(tenantId, async (tx) => {
      const findByIdOrSlugSpy = vi.spyOn(workflowRepository, "findByIdOrSlug");
      await workflowService.verifyAccess(workflow.id, userId, "view", tx);
      // Reused the caller's tx, not a freshly opened one.
      expect(findByIdOrSlugSpy).toHaveBeenCalledWith(workflow.id, tx);
      findByIdOrSlugSpy.mockRestore();
    });

    await getOwnerDb().delete(schema.sections).where(eq(schema.sections.workflowId, workflow.id));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflow.id));
  });

  // Positive-path proof that WorkflowClonerService.copyWorkflow still works
  // end-to-end inside the tenant-scoped transaction — the ~30 private copy
  // helpers below `performWorkflowCopy` already threaded `tx` before this
  // ticket; this proves threading a REAL tenant-scoped `tx` through the
  // whole chain (instead of the bare `db.transaction()` it used to open)
  // did not break the copy.
  it("WorkflowClonerService.copyWorkflow copies a workflow and its default section inside one tenant transaction", async () => {
    enterTenantContextForTests(tenantId);
    const source = await workflowService.createWorkflow(
      { title: `RLS-2e Cloner Source ${nanoid()}`, creatorId: userId } as InsertWorkflow,
      userId
    );

    enterTenantContextForTests(tenantId);
    const result = await workflowClonerService.copyWorkflow(source.id, userId, {
      includeRelatedDatavault: false,
      clearAccess: true,
    });

    expect(result.workflow).toBeDefined();
    expect(result.workflow!.id).not.toBe(source.id);
    expect(result.workflow!.creatorId).toBe(userId);

    const copiedSections = await getOwnerDb()
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.workflowId, result.workflow!.id));
    expect(copiedSections).toHaveLength(1);

    await getOwnerDb().delete(schema.sections).where(eq(schema.sections.workflowId, result.workflow!.id));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, result.workflow!.id));
    await getOwnerDb().delete(schema.sections).where(eq(schema.sections.workflowId, source.id));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, source.id));
  });

  // Positive-path proof VersionService.publishVersion's new 5th param (`tx`,
  // inserted after `force`) didn't shift any existing positional call —
  // exercises the real route-shaped call (workflowId, userId, notes, force)
  // via WorkflowService.changeStatus, which now passes `false, scopedTx`.
  it("WorkflowService.changeStatus('active') publishes a version through VersionService.publishVersion inside one transaction", async () => {
    enterTenantContextForTests(tenantId);
    const workflow = await workflowService.createWorkflow(
      { title: `RLS-2e Publish ${nanoid()}`, creatorId: userId } as InsertWorkflow,
      userId
    );
    const section = await getOwnerDb().query.sections.findFirst({ where: eq(schema.sections.workflowId, workflow.id) });
    await getOwnerDb().insert(schema.steps).values({
      workflowId: workflow.id,
      sectionId: section!.id,
      type: "short_text",
      title: "Q1",
      alias: "q1",
      order: 1,
    });

    enterTenantContextForTests(tenantId);
    const updated = await workflowService.changeStatus(workflow.id, userId, "active");
    expect(updated.status).toBe("active");
    expect(updated.currentVersionId).toBeDefined();

    const version = await versionService.getVersion(updated.currentVersionId!);
    expect(version?.published).toBe(true);

    await getOwnerDb().update(schema.workflows).set({ currentVersionId: null }).where(eq(schema.workflows.id, workflow.id));
    await getOwnerDb().delete(schema.workflowVersions).where(eq(schema.workflowVersions.workflowId, workflow.id));
    await getOwnerDb().delete(schema.steps).where(eq(schema.steps.sectionId, section!.id));
    await getOwnerDb().delete(schema.sections).where(eq(schema.sections.workflowId, workflow.id));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflow.id));
  });
});

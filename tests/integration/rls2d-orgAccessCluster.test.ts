/**
 * RLS-2d vertical proof for the Org/access cluster: OrganizationService,
 * ProjectService and TeamService each open exactly ONE tenant-scoped
 * transaction at the service boundary (copying the `withTx` shape RLS-2a
 * established — see docs/architecture/TENANT_ISOLATION_RLS.md §2b/§2c) and
 * fail closed when no tenant is in the async context.
 *
 * This is a direct-service-call suite (no HTTP) so it can bind the ambient
 * tenant context explicitly with `enterTenantContextForTests` inside each
 * test body — binding in beforeAll/beforeEach does not propagate into the
 * test (AsyncLocalStorage.enterWith is scoped per vitest hook/test
 * execution; measured in RLS-2b/2c, not assumed).
 */
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db, initializeDatabase } from "../../server/db";
import { projectRepository, workflowRepository } from "../../server/repositories";
import { organizationService } from "../../server/services/OrganizationService";
import { projectService } from "../../server/services/ProjectService";
import { teamService } from "../../server/services/TeamService";
import { enterTenantContextForTests, getCurrentTenantId } from "../../server/utils/rlsContext";
// Fixture creation and cleanup are the OBSERVER (tests/helpers/ownerDb.ts).
// The assertions still run against the application pool — including the
// `current_setting` probe, which is specifically about that pool.
import { getOwnerDb } from "../helpers/ownerDb";

describe("Org/access cluster service-boundary tenant transaction (RLS-2d)", () => {
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    await initializeDatabase();

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
      name: `RLS-2d Org Cluster ${nanoid()}`,
      plan: "pro",
    }).returning();
    tenantId = tenant.id;

    const [user] = await getOwnerDb().insert(schema.users).values({
      email: `rls2d-org-${nanoid()}@example.com`,
      fullName: "RLS-2d Org Cluster User",
      tenantId,
    }).returning();
    userId = user.id;
  });

  afterAll(async () => {
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
        name: "OrganizationService.getUserOrganizations",
        call: () => organizationService.getUserOrganizations(userId),
      },
      {
        name: "ProjectService.listProjects",
        call: () => projectService.listProjects(userId),
      },
      {
        name: "TeamService.getUserTeams",
        call: () => teamService.getUserTeams(userId),
      },
    ])("$name throws and never reaches the repository when there is no tenant in the async context", async ({ call }) => {
      expect(getCurrentTenantId()).toBeUndefined();
      const findByIdSpy = vi.spyOn(projectRepository, "findById");
      await expect(call()).rejects.toThrow(/no tenant in context/i);
      expect(findByIdSpy).not.toHaveBeenCalled();
      findByIdSpy.mockRestore();
    });
  });

  // AC5 — a multi-repository operation in this cluster shares the IDENTICAL
  // transaction object across both repositories, not merely the same
  // tenant. ProjectService.getProjectWithWorkflows spans projectRepo
  // (via verifyProjectAccess -> findById) and workflowRepo (findByProjectId).
  it("opens exactly one transaction for a service call spanning projectRepo and workflowRepo", async () => {
    enterTenantContextForTests(tenantId);

    const project = await projectService.createProject(
      {
        title: "RLS-2d Multi-Repo Project",
        name: "RLS-2d Multi-Repo Project",
        creatorId: userId,
        ownerId: userId,
        tenantId,
      } as schema.InsertProject,
      userId
    );

    const seenTxs: unknown[] = [];
    const originalFindById = projectRepository.findById.bind(projectRepository);
    const findByIdSpy = vi.spyOn(projectRepository, "findById").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalFindById(id, tx);
    });
    const originalFindByProjectId = workflowRepository.findByProjectId.bind(workflowRepository);
    const findByProjectIdSpy = vi.spyOn(workflowRepository, "findByProjectId")
      .mockImplementation(async (projectId, options, tx) => {
        seenTxs.push(tx);
        return originalFindByProjectId(projectId, options, tx);
      });

    enterTenantContextForTests(tenantId);
    const result = await projectService.getProjectWithWorkflows(project.id, userId);

    findByIdSpy.mockRestore();
    findByProjectIdSpy.mockRestore();

    expect(result.id).toBe(project.id);
    // 3, not 2: `verifyProjectAccess` calls `projectRepo.findById` once, and
    // `aclService.resolveRoleForProject` (called from inside
    // `verifyProjectAccess`) calls the SAME singleton `projectRepository`
    // again for its own ownership check, before `workflowRepo.findByProjectId`
    // runs — all three inside the one transaction `getProjectWithWorkflows`
    // opened.
    expect(seenTxs).toHaveLength(3);
    expect(seenTxs[0]).toBeDefined();
    // The discriminating assertion: same object reference across all three
    // calls (two different repositories), not merely three transactions that
    // happen to be scoped to the same tenant.
    expect(seenTxs[0]).toBe(seenTxs[1]);
    expect(seenTxs[1]).toBe(seenTxs[2]);

    await getOwnerDb().delete(schema.projects).where(eq(schema.projects.id, project.id));
  });

  // The GUC set inside the transaction is the CALLER's tenant, and does not
  // survive on the pool afterwards (the pooled-connection leak `is_local =>
  // true` exists to prevent). OrganizationService has no repository layer to
  // spy on, so this reads the GUC back via AuditLogger.log — createOrganization
  // calls it with the SAME `tx` as every other query in the operation — which
  // is the same technique rls2a-collectionService.test.ts uses via a
  // repository method.
  it("sets the GUC to the caller's tenant inside OrganizationService's transaction, and it does not survive the transaction", async () => {
    enterTenantContextForTests(tenantId);

    const { AuditLogger } = await import("../../server/lib/audit/auditLogger");
    const orgs = schema.organizations;
    let observedGuc: unknown;
    const originalLog = AuditLogger.log.bind(AuditLogger);
    const logSpy = vi.spyOn(AuditLogger, "log").mockImplementation(async (event, executor) => {
      const executable = executor as unknown as { execute?: (q: unknown) => Promise<unknown> };
      if (executable && typeof executable.execute === "function") {
        const r = await executable.execute(
          sql`SELECT current_setting('app.current_tenant_id', true) AS t`
        );
        const rows = (r as { rows?: Array<{ t: unknown }> }).rows ?? (r as Array<{ t: unknown }>);
        observedGuc = rows?.[0]?.t;
      }
      return originalLog(event, executor);
    });

    const org = await organizationService.createOrganization(
      { name: `RLS-2d GUC Check ${nanoid()}` },
      userId
    );
    logSpy.mockRestore();

    expect(observedGuc).toBe(tenantId);

    // AC4 half 2 — a query issued on the pool AFTER the transaction commits
    // must see no tenant at all.
    const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
    const afterRows = (after as unknown as { rows?: Array<{ t: unknown }> }).rows
      ?? (after as unknown as Array<{ t: unknown }>);
    const afterVal = afterRows?.[0]?.t;
    expect(afterVal === null || afterVal === "").toBe(true);

    await getOwnerDb().delete(schema.organizationMemberships).where(eq(schema.organizationMemberships.orgId, org.id));
    await getOwnerDb().delete(orgs).where(eq(orgs.id, org.id));
  });
});

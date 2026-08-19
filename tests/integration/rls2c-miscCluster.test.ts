/**
 * RLS-2c vertical proof for the Misc cluster: ReviewTaskService and
 * SignatureRequestService each open ONE tenant-scoped transaction at the
 * service boundary, and both fail closed / stay safe with no ambient tenant.
 *
 * Neither service is reached by any route today (both back an e-signature /
 * document-review feature that is wired only partway — see
 * server/services/SignatureRequestService.ts's class comment and the
 * project's `esign-registry-never-initialized` finding), so this suite calls
 * the services directly rather than building an Express app the way
 * tests/integration/rls2a-collectionService.test.ts does. Every call that
 * needs one is wrapped in `runWithTenantContext`, matching
 * tests/integration/collections.e2e.test.ts's established idiom for direct
 * service calls under RLS.
 */
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db, initializeDatabase } from "../../server/db";
import { projectRepository, reviewTaskRepository, signatureRequestRepository, workflowRepository } from "../../server/repositories";
import { reviewTaskService } from "../../server/services/ReviewTaskService";
import { signatureRequestService } from "../../server/services/SignatureRequestService";
import { getCurrentTenantId, runWithTenantContext } from "../../server/utils/rlsContext";

function firstValue(result: unknown): unknown {
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>);
  return rows?.[0]?.t;
}

describe("Misc cluster service-boundary tenant transaction (RLS-2c)", () => {
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let runId: string;

  beforeAll(async () => {
    await initializeDatabase();

    const [tenant] = await db.insert(schema.tenants).values({
      name: `RLS-2c Misc Tenant ${nanoid()}`,
      plan: "pro",
    }).returning();
    tenantId = tenant.id;

    const [user] = await db.insert(schema.users).values({
      id: `rls2c-misc-${nanoid()}`,
      email: `rls2c-misc-${nanoid()}@example.com`,
      fullName: "RLS-2c Misc Test User",
      firstName: "RLS2c",
      lastName: "Misc",
      tenantId,
      tenantRole: "owner",
      authProvider: "local",
      lastPasswordChange: null,
      defaultMode: "easy",
    }).returning();
    userId = user.id;

    const [project] = await db.insert(schema.projects).values({
      name: "RLS-2c Misc Project",
      title: "RLS-2c Misc Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
      ownerType: "user",
      ownerUuid: userId,
    }).returning();
    projectId = project.id;

    const [workflow] = await db.insert(schema.workflows).values({
      title: "RLS-2c Misc Workflow",
      creatorId: userId,
      ownerId: userId,
      ownerType: "user",
      ownerUuid: userId,
      projectId,
      status: "draft",
    }).returning();
    workflowId = workflow.id;

    const [run] = await db.insert(schema.workflowRuns).values({
      workflowId,
      runToken: `rls2c-misc-run-token-${nanoid()}`,
      ownerType: "user",
      ownerUuid: userId,
    }).returning();
    runId = run.id;
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  // AC5 — a multi-repository proof for this cluster: createReviewTask spans
  // workflowRepository, projectRepository AND reviewTaskRepository inside one
  // `withTx`. Unlike the unit test (which supplies mockTx externally and only
  // proves threading), this spies on the REAL repositories while the SERVICE
  // itself opens the transaction, so the identical-object assertion actually
  // proves single-transaction behaviour rather than pass-through.
  it("ReviewTaskService.createReviewTask opens exactly one transaction shared by workflowRepository and projectRepository", async () => {
    const seenTxs: unknown[] = [];
    const originalWorkflowFind = workflowRepository.findById.bind(workflowRepository);
    const workflowSpy = vi.spyOn(workflowRepository, "findById").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalWorkflowFind(id, tx);
    });
    const originalProjectFind = projectRepository.findById.bind(projectRepository);
    const projectSpy = vi.spyOn(projectRepository, "findById").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalProjectFind(id, tx);
    });

    const task = await runWithTenantContext(tenantId, () =>
      reviewTaskService.createReviewTask({
        runId,
        workflowId,
        nodeId: "review-node-1",
        tenantId,
        projectId,
        reviewerId: userId,
      } as unknown as Parameters<typeof reviewTaskService.createReviewTask>[0])
    );

    workflowSpy.mockRestore();
    projectSpy.mockRestore();

    expect(task).toBeDefined();
    expect(seenTxs).toHaveLength(2);
    expect(seenTxs[0]).toBeDefined();
    expect(seenTxs[0]).toBe(seenTxs[1]);

    await db.delete(schema.reviewTasks).where(eq(schema.reviewTasks.id, task.id));
  });

  // AC4 — the no-tenant path fails closed for a service with no explicit
  // tenantId argument (ReviewTaskService: authorization is userId/ACL-based).
  it("ReviewTaskService.getReviewTask throws with no ambient tenant and never calls the repository", async () => {
    expect(getCurrentTenantId()).toBeUndefined();

    const spy = vi.spyOn(reviewTaskRepository, "findById");

    await expect(
      reviewTaskService.getReviewTask("00000000-0000-0000-0000-000000000000", userId)
    ).rejects.toThrow(/no tenant in context/i);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // AC4 — the mismatch guard for the one ReviewTaskService method that DOES
  // carry an explicit tenantId (createReviewTask, via `data` — review_tasks.
  // tenant_id is NOT NULL).
  it("ReviewTaskService.createReviewTask throws on an ambient/argument tenant mismatch and never calls the repository", async () => {
    const spy = vi.spyOn(reviewTaskRepository, "create");

    await runWithTenantContext(tenantId, async () => {
      await expect(
        reviewTaskService.createReviewTask({
          runId,
          workflowId,
          nodeId: "review-node-mismatch",
          tenantId: "00000000-0000-0000-0000-000000000000", // deliberately NOT `tenantId`
          projectId,
          reviewerId: userId,
        } as unknown as Parameters<typeof reviewTaskService.createReviewTask>[0])
      ).rejects.toThrow(/tenant mismatch/i);
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // AC4 — the mismatch guard for the one SignatureRequestService method that
  // DOES carry an explicit tenantId (createSignatureRequest, via `data`).
  it("SignatureRequestService.createSignatureRequest throws on an ambient/argument tenant mismatch and never calls the repository", async () => {
    const spy = vi.spyOn(signatureRequestRepository, "create");

    await runWithTenantContext(tenantId, async () => {
      await expect(
        signatureRequestService.createSignatureRequest({
          runId: "00000000-0000-0000-0000-000000000000",
          workflowId,
          nodeId: "node-1",
          tenantId: "00000000-0000-0000-0000-000000000000", // deliberately NOT `tenantId`
          projectId,
          signerEmail: "a@b.com",
          signerName: "A",
          status: "pending",
          expiresAt: new Date(Date.now() + 86_400_000),
        } as unknown as Parameters<typeof signatureRequestService.createSignatureRequest>[0])
      ).rejects.toThrow(/tenant mismatch/i);
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // The public-portal proof: signDocument (and the getSignatureRequestByToken
  // it wraps) run with NO ambient tenant — a run-token holder is never a
  // tenant user — and the write is scoped to the row's OWN resolved tenant,
  // not a constant and not the ambient context (there is none).
  it("SignatureRequestService.signDocument succeeds with no ambient tenant, and scopes its write to the request's own tenant", async () => {
    const created = await runWithTenantContext(tenantId, () =>
      signatureRequestService.createSignatureRequest({
        runId,
        workflowId,
        nodeId: "node-2",
        tenantId,
        projectId,
        signerEmail: "signer@example.com",
        signerName: "Signer",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
      } as unknown as Parameters<typeof signatureRequestService.createSignatureRequest>[0])
    );

    expect(getCurrentTenantId()).toBeUndefined();

    const original = signatureRequestRepository.updateStatus.bind(signatureRequestRepository);
    let observedGuc: unknown;
    const spy = vi.spyOn(signatureRequestRepository, "updateStatus").mockImplementation(async (id, status, completedAt, tx) => {
      if (tx) {
        const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
        observedGuc = firstValue(r);
      }
      return original(id, status, completedAt, tx);
    });

    const signed = await signatureRequestService.signDocument(created.token);

    spy.mockRestore();

    expect(signed.status).toBe("signed");
    expect(observedGuc).toBe(tenantId);

    const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
    expect(firstValue(after) === null || firstValue(after) === "").toBe(true);
  });
});

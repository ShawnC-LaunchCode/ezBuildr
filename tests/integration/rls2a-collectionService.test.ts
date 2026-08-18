/**
 * RLS-2a vertical proof: CollectionService opens ONE tenant-scoped
 * transaction at the service boundary, threads it down to every repository
 * call, and fails closed when it cannot establish the caller's tenant.
 *
 * Why this file builds its own Express app instead of using
 * setupIntegrationTest(): that shared harness builds its app from
 * registerRoutes() alone and never mounts the `rlsContext` middleware — see
 * TM-B1 in tickets/BACKLOG.md, and the same workaround in
 * tests/integration/rls-context.middleware.test.ts. `rlsContext` must run
 * BEFORE the collections routes for `withCurrentTenant()` to have anything
 * to read, so it has to be mounted before `registerRoutes(app)` is called,
 * which the shared helper does not expose a hook for. This file mirrors
 * server/index.ts / server/production.ts ordering directly: rlsContext
 * first, then registerRoutes (which wires each route's own inline
 * hybridAuth).
 */
import { eq, sql } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db, initializeDatabase } from "../../server/db";
import { rlsContext } from "../../server/middleware/rlsContext";
import { collectionRepository, collectionFieldRepository } from "../../server/repositories";
import { registerRoutes } from "../../server/routes";
import { collectionService } from "../../server/services/CollectionService";
import { getCurrentTenantId, runWithTenantContext } from "../../server/utils/rlsContext";

import type { Server } from "http";

function firstValue(result: unknown): unknown {
  // node-postgres returns { rows: [...] }; be defensive across driver shapes
  // (same helper as tests/integration/rls-context.test.ts).
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>);
  return rows?.[0]?.t;
}

interface TenantCtx {
  tenantId: string;
  token: string;
}

describe("CollectionService service-boundary tenant transaction (RLS-2a)", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let tenantA: TenantCtx;
  let tenantB: TenantCtx;

  async function makeTenant(name: string): Promise<TenantCtx> {
    const [tenant] = await db.insert(schema.tenants).values({
      name: `${name} ${nanoid()}`,
      plan: "pro",
    }).returning();

    const email = `rls2a-${nanoid()}@example.com`;
    const res = await request(baseURL).post("/api/auth/register").send({
      email,
      password: "StrongTestUser123!@#",
      firstName: "RLS2a",
      lastName: "Test",
    });
    if (res.status !== 201) {
      throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    }

    await db.update(schema.users)
      .set({ tenantId: tenant.id, role: "admin", tenantRole: "owner" })
      .where(eq(schema.users.id, res.body.user.id));

    return { tenantId: tenant.id, token: res.body.token as string };
  }

  beforeAll(async () => {
    await initializeDatabase();

    app = express();
    app.use(express.json());
    // Mounted BEFORE registerRoutes, mirroring the real entrypoints — see
    // the file header for why this can't use setupIntegrationTest().
    app.use(rlsContext);
    server = await registerRoutes(app);

    baseURL = await new Promise<string>((resolve) => {
      const s = server.listen(0, () => {
        const addr = s.address();
        const port = typeof addr === "object" && addr ? addr.port : 5000;
        resolve(`http://localhost:${port}`);
      });
    });

    tenantA = await makeTenant("RLS-2a Tenant A");
    tenantB = await makeTenant("RLS-2a Tenant B");
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantA.tenantId));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantB.tenantId));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // AC4 — both halves. Either alone proves nothing (see the ticket's
  // Vertical proof): the GUC must be set to the CALLER's tenant during the
  // operation, and it must NOT survive the transaction on the pool.
  describe("the GUC set inside the transaction", () => {
    it("equals the caller's tenant for a multi-repository operation (getCollectionWithFields spans collectionRepo + fieldRepo), and does not survive the transaction", async () => {
      const createRes = await request(baseURL)
        .post(`/api/tenants/${tenantA.tenantId}/collections`)
        .set("Authorization", `Bearer ${tenantA.token}`)
        .send({ name: "RLS-2a Widgets", slug: `rls2a-widgets-${nanoid()}` });
      expect(createRes.status).toBe(201);
      const collectionId = createRes.body.id as string;

      // Spy on the repository call inside verifyTenantOwnership to read the
      // GUC back from WITHIN the transaction CollectionService opened —
      // querying it any other way would just prove the value made it to
      // Postgres, not that it was visible while the operation ran.
      const original = collectionRepository.findById.bind(collectionRepository);
      let observedGuc: unknown;
      const spy = vi.spyOn(collectionRepository, "findById").mockImplementation(async (id, tx) => {
        if (tx) {
          const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
          observedGuc = firstValue(r);
        }
        return original(id, tx);
      });

      const getRes = await request(baseURL)
        .get(`/api/tenants/${tenantA.tenantId}/collections/${collectionId}?fields=true`)
        .set("Authorization", `Bearer ${tenantA.token}`);

      spy.mockRestore();

      expect(getRes.status).toBe(200);
      expect(observedGuc).toBe(tenantA.tenantId);

      // AC4 half 2 — the pooled-connection leak `is_local => true` exists to
      // prevent. A later query on the pool (not the finished transaction)
      // must see no tenant at all.
      const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
      const afterVal = firstValue(after);
      expect(afterVal === null || afterVal === "").toBe(true);
    });

    it("is the CALLER's tenant, not a constant — a different tenant's request observes its own id", async () => {
      const createRes = await request(baseURL)
        .post(`/api/tenants/${tenantB.tenantId}/collections`)
        .set("Authorization", `Bearer ${tenantB.token}`)
        .send({ name: "RLS-2a Gadgets", slug: `rls2a-gadgets-${nanoid()}` });
      expect(createRes.status).toBe(201);
      const collectionId = createRes.body.id as string;

      const original = collectionRepository.findById.bind(collectionRepository);
      let observedGuc: unknown;
      const spy = vi.spyOn(collectionRepository, "findById").mockImplementation(async (id, tx) => {
        if (tx) {
          const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
          observedGuc = firstValue(r);
        }
        return original(id, tx);
      });

      const getRes = await request(baseURL)
        .get(`/api/tenants/${tenantB.tenantId}/collections/${collectionId}?fields=true`)
        .set("Authorization", `Bearer ${tenantB.token}`);

      spy.mockRestore();

      expect(getRes.status).toBe(200);
      expect(observedGuc).toBe(tenantB.tenantId);
      expect(observedGuc).not.toBe(tenantA.tenantId);
    });
  });

  // AC1 — a single transaction for a multi-repository operation, not one per
  // repository call. Proven by counting how many times a transaction was
  // opened for one logical service call: exactly one `findById` call and one
  // `findByCollectionId` call must share the SAME transaction object.
  it("opens exactly one transaction for a service call spanning two repositories", async () => {
    const createRes = await request(baseURL)
      .post(`/api/tenants/${tenantA.tenantId}/collections`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "RLS-2a Single-Tx Check", slug: `rls2a-single-tx-${nanoid()}` });
    const collectionId = createRes.body.id as string;

    // Spy on BOTH repositories getCollectionWithFields touches and capture
    // the exact `tx` object each one received. AC1 is "one transaction, not
    // one per repository call" — the direct proof is that collectionRepo and
    // fieldRepo were handed the identical transaction reference, not merely
    // that both saw the same tenant id (two separate transactions opened
    // back-to-back for the same tenant would also pass a same-tenant check).
    const seenTxs: unknown[] = [];
    const originalFindById = collectionRepository.findById.bind(collectionRepository);
    const findByIdSpy = vi.spyOn(collectionRepository, "findById").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalFindById(id, tx);
    });
    const originalFindFields = collectionFieldRepository.findByCollectionId.bind(collectionFieldRepository);
    const findFieldsSpy = vi.spyOn(collectionFieldRepository, "findByCollectionId")
      .mockImplementation(async (id, tx) => {
        seenTxs.push(tx);
        return originalFindFields(id, tx);
      });

    const getRes = await request(baseURL)
      .get(`/api/tenants/${tenantA.tenantId}/collections/${collectionId}?fields=true`)
      .set("Authorization", `Bearer ${tenantA.token}`);

    findByIdSpy.mockRestore();
    findFieldsSpy.mockRestore();

    expect(getRes.status).toBe(200);
    expect(seenTxs).toHaveLength(2);
    expect(seenTxs[0]).toBeDefined();
    // The discriminating assertion: same object reference, not just
    // structurally similar or scoped to the same tenant.
    expect(seenTxs[0]).toBe(seenTxs[1]);
  });

  // AC5 — a call with no tenant in the async context and no explicit tx must
  // fail closed, never silently run unscoped.
  describe("the no-tenant path fails closed", () => {
    it("throws and never calls the repository when there is no tenant in the async context", async () => {
      expect(getCurrentTenantId()).toBeUndefined();

      const spy = vi.spyOn(collectionRepository, "findById");

      await expect(
        collectionService.getCollection("00000000-0000-0000-0000-000000000000", tenantA.tenantId)
      ).rejects.toThrow(/no tenant in context/i);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // Reviewer-required: the ambient-context-vs-argument mismatch guard
  // (server/services/CollectionService.ts, `withTx`) is mutation-tested, not
  // just asserted — see the accompanying report for the disable/re-enable
  // proof. This is the guard actually firing end to end against a real
  // service instance and real repository, not just the isolated unit test.
  describe("the ambient-vs-argument tenant mismatch guard", () => {
    it("throws instead of opening a transaction scoped to the wrong tenant, and never calls the repository", async () => {
      const spy = vi.spyOn(collectionRepository, "findById");

      await runWithTenantContext(tenantA.tenantId, async () => {
        await expect(
          collectionService.getCollection("00000000-0000-0000-0000-000000000000", tenantB.tenantId)
        ).rejects.toThrow(/tenant mismatch/i);
      });

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // AC2 / AC3 sanity at the HTTP level: cross-tenant access is still denied
  // by the service-layer eq(tenantId, ...) predicate (unchanged by RLS-2a),
  // independent of the GUC mechanics above.
  it("still denies cross-tenant access via the service-layer tenant check (AC3: predicates stay)", async () => {
    const createRes = await request(baseURL)
      .post(`/api/tenants/${tenantA.tenantId}/collections`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "RLS-2a Cross-Tenant Guard", slug: `rls2a-cross-tenant-${nanoid()}` });
    const collectionId = createRes.body.id as string;

    const crossRes = await request(baseURL)
      .get(`/api/tenants/${tenantB.tenantId}/collections/${collectionId}`)
      .set("Authorization", `Bearer ${tenantB.token}`);

    expect([403, 404]).toContain(crossRes.status);
  });
});

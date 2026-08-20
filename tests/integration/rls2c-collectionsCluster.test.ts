/**
 * RLS-2c vertical proof for the Collections/records cluster:
 * RecordService and CollectionFieldService each open ONE tenant-scoped
 * transaction at the service boundary and thread it down to every
 * repository call, and both fail closed when no tenant can be established.
 *
 * Same rationale as tests/integration/rls2a-collectionService.test.ts for
 * building its own Express app: the shared setupIntegrationTest() harness
 * builds its app from registerRoutes() alone and never mounts `rlsContext`
 * (TM-B1). `rlsContext` must run BEFORE the collections routes for
 * `withCurrentTenant()` to have anything to read.
 */
import { eq, sql } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db, initializeDatabase } from "../../server/db";
import { rlsContext } from "../../server/middleware/rlsContext";
import { collectionRepository, collectionFieldRepository, recordRepository } from "../../server/repositories";
import { registerRoutes } from "../../server/routes";
import { collectionFieldService } from "../../server/services/CollectionFieldService";
import { recordService } from "../../server/services/RecordService";
import { getCurrentTenantId } from "../../server/utils/rlsContext";

import type { Server } from "http";

function firstValue(result: unknown): unknown {
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>);
  return rows?.[0]?.t;
}

interface TenantCtx {
  tenantId: string;
  token: string;
}

describe("Collections/records cluster service-boundary tenant transaction (RLS-2c)", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let tenantA: TenantCtx;
  let collectionId: string;

  async function makeTenant(name: string): Promise<TenantCtx> {
    const [tenant] = await db.insert(schema.tenants).values({
      name: `${name} ${nanoid()}`,
      plan: "pro",
    }).returning();

    const email = `rls2c-records-${nanoid()}@example.com`;
    const res = await request(baseURL).post("/api/auth/register").send({
      email,
      password: "StrongTestUser123!@#",
      firstName: "RLS2c",
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
    app.use(rlsContext);
    server = await registerRoutes(app);

    baseURL = await new Promise<string>((resolve) => {
      const s = server.listen(0, () => {
        const addr = s.address();
        const port = typeof addr === "object" && addr ? addr.port : 5000;
        resolve(`http://localhost:${port}`);
      });
    });

    tenantA = await makeTenant("RLS-2c Records Tenant");

    const createRes = await request(baseURL)
      .post(`/api/tenants/${tenantA.tenantId}/collections`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "RLS-2c Widgets", slug: `rls2c-widgets-${nanoid()}` });
    expect(createRes.status).toBe(201);
    collectionId = createRes.body.id as string;

    const fieldRes = await request(baseURL)
      .post(`/api/tenants/${tenantA.tenantId}/collections/${collectionId}/fields`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "Label", slug: "label", type: "text", isRequired: false });
    expect(fieldRes.status).toBe(201);
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantA.tenantId));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // AC5 — at least one multi-repository service in this cluster must prove the
  // IDENTICAL transaction object reached two repositories. createRecord spans
  // collectionRepository (ownership check) and collectionFieldRepository
  // (default/validation lookups) inside recordService's single `withTx`.
  it("RecordService.createRecord opens exactly one transaction shared by collectionRepository and collectionFieldRepository", async () => {
    const seenTxs: unknown[] = [];
    const originalCollectionFind = collectionRepository.findById.bind(collectionRepository);
    const collectionSpy = vi.spyOn(collectionRepository, "findById").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalCollectionFind(id, tx);
    });
    const originalFieldFind = collectionFieldRepository.findByCollectionId.bind(collectionFieldRepository);
    const fieldSpy = vi.spyOn(collectionFieldRepository, "findByCollectionId").mockImplementation(async (id, tx) => {
      seenTxs.push(tx);
      return originalFieldFind(id, tx);
    });

    const createRes = await request(baseURL)
      .post(`/api/tenants/${tenantA.tenantId}/collections/${collectionId}/records`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ data: { label: "hello" } });

    collectionSpy.mockRestore();
    fieldSpy.mockRestore();

    expect(createRes.status).toBe(201);
    expect(seenTxs.length).toBeGreaterThanOrEqual(2);
    expect(seenTxs[0]).toBeDefined();
    // The discriminating assertion: same object reference, not just the same
    // tenant scoping two separately-opened transactions would also satisfy.
    expect(seenTxs[0]).toBe(seenTxs[1]);
  });

  // AC4 — the GUC observed inside the transaction is the caller's tenant, and
  // does not leak onto the pool afterward.
  it("sets app.current_tenant_id to the caller's tenant inside RecordService's transaction, and it does not survive on the pool", async () => {
    const original = recordRepository.findByCollectionId.bind(recordRepository);
    let observedGuc: unknown;
    const spy = vi.spyOn(recordRepository, "findByCollectionId").mockImplementation(async (id, options, tx) => {
      if (tx) {
        const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
        observedGuc = firstValue(r);
      }
      return original(id, options, tx);
    });

    const listRes = await request(baseURL)
      .get(`/api/tenants/${tenantA.tenantId}/collections/${collectionId}/records`)
      .set("Authorization", `Bearer ${tenantA.token}`);

    spy.mockRestore();

    expect(listRes.status).toBe(200);
    expect(observedGuc).toBe(tenantA.tenantId);

    const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
    const afterVal = firstValue(after);
    expect(afterVal === null || afterVal === "").toBe(true);
  });

  // AC4 — fails closed for both services in this cluster: no ambient tenant,
  // no supplied tx, repository never reached.
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

    it("RecordService.getRecord throws and never calls the repository", async () => {
      expect(getCurrentTenantId()).toBeUndefined();

      const spy = vi.spyOn(recordRepository, "findById");

      await expect(
        recordService.getRecord("00000000-0000-0000-0000-000000000000", tenantA.tenantId)
      ).rejects.toThrow(/no tenant in context/i);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("CollectionFieldService.listFields throws and never calls the repository", async () => {
      expect(getCurrentTenantId()).toBeUndefined();

      const spy = vi.spyOn(collectionFieldRepository, "findByCollectionId");

      await expect(
        collectionFieldService.listFields(collectionId)
      ).rejects.toThrow(/no tenant in context/i);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

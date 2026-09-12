/**
 * RLS-6 vertical proof: the admin console's cross-tenant read path
 * (`server/db/adminDb.ts`, a BYPASSRLS connection pool) survives
 * `FORCE ROW LEVEL SECURITY`, while the same class of query on the NORMAL
 * pool — as a non-owner, non-bypass role with the tenant GUC pinned — sees
 * only one tenant.
 *
 * HARD RULE (see the ticket): both halves are asserted in ONE test. Either
 * alone proves nothing about isolation — a world where RLS enforces nothing
 * at all would also make the admin-crosses-tenants half true, and a world
 * where the admin path is broken would still leave the isolation half true.
 * Only together do they prove "the admin path is the ONE thing crossing the
 * boundary, and RLS is genuinely enforced everywhere else" (the ticket's own
 * words for the discriminating case).
 *
 * Why FORCE is set here even though neither role technically needs it to
 * pass: `ezbuildr_admin_bypass`'s exemption comes from the BYPASSRLS
 * attribute, which survives FORCE unconditionally (Postgres: "superusers and
 * roles with BYPASSRLS always bypass row security"). Setting FORCE is what
 * turns this into a genuine proof that the exemption is BYPASSRLS, not an
 * accident of which role happens to own the table — without it, a future
 * regression that made the admin role the table owner instead of granting
 * BYPASSRLS would pass this test for the wrong reason.
 *
 * Why this file builds its own Express app instead of using
 * setupIntegrationTest(): same reason as
 * tests/integration/rls2a-collectionService.test.ts — that shared harness
 * builds its app from registerRoutes() alone, which is sufficient here since
 * admin routes don't need rlsContext (they never call withCurrentTenant).
 */
import { randomUUID } from "crypto";

import { eq, sql } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

/**
 * OWNER connection: this suite CREATEs roles, GRANTs, and sets FORCE ROW LEVEL
 * SECURITY — all owner-only operations. Under RLS_RESTRICTED the app pool is a
 * deliberate non-owner, so every one of them failed and the whole suite skipped.
 * Its cross-tenant assertions run through the roles it creates and through
 * adminDb, never through the app pool, so nothing here is weakened.
 */
import { getOwnerDb } from "../helpers/ownerDb";
import { initializeDatabase } from "../../server/db";
import { closeAdminDb, initializeAdminDb } from "../../server/db/adminDb";
import { registerRoutes } from "../../server/routes";

import type { Server } from "http";

function rows(result: unknown): Array<Record<string, unknown>> {
  // node-postgres returns { rows: [...] }; be defensive across driver shapes
  // (same helper as rls-context.test.ts / rls-phase4-workflows.test.ts).
  return (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>)
    ?? [];
}

const ADMIN_ROLE = "ezbuildr_admin_bypass";
// Test-only password for a throwaway local/Docker database — never a real
// secret, and distinct from the migration's deliberate no-password default
// (see 0024_certain_nightcrawler.sql and .env.example for why a real
// environment sets this out of band instead).
const ADMIN_PASSWORD = `rls6-test-${randomUUID()}`;

describe("RLS-6: admin cross-tenant read path (BYPASSRLS), audited", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let schemaName = "public";
  let restrictedRole = "rls_tester_public";

  let tenantAId: string;
  let tenantBId: string;
  let adminUserId: string;
  let adminToken: string;
  let userBId: string;

  beforeAll(async () => {
    await initializeDatabase();

    schemaName = String(
      process.env.TEST_SCHEMA
      ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__
      ?? "public",
    ).replace(/[^a-zA-Z0-9_]/g, "_");
    restrictedRole = `rls_tester_${schemaName}`;

    // 1. The admin BYPASSRLS role, created HERE and idempotently — the same
    //    convention this file already uses for `restrictedRole` below.
    //
    //    It is deliberately NOT created by a migration. Roles are
    //    cluster-level, not database-level, so a `CREATE ROLE` in the
    //    migration chain is a side effect on the whole server and may be
    //    refused outright on a managed Postgres without elevated rights.
    //    Provisioning the real role per environment belongs to RLS-4 AC2
    //    (Railway/Neon configuration), alongside the restricted application
    //    role it is the counterpart to.
    //
    //    Reviewer note (2026-08-19): an earlier revision assumed a migration
    //    had already created this role. It passed locally only because a
    //    previous `db:migrate` had left the role in the shared test container
    //    — roles outlive the database — so the suite would have failed on any
    //    fresh cluster, i.e. in CI. Creating it here removes that hidden
    //    dependency entirely.
    await getOwnerDb().execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ADMIN_ROLE}') THEN
          CREATE ROLE "${ADMIN_ROLE}" LOGIN BYPASSRLS;
        END IF;
      END $$;
    `));
    // Password is set per run rather than baked into the role: ALTER ROLE ...
    // WITH PASSWORD is not additive, so this is safe to re-run.
    await getOwnerDb().execute(sql.raw(`ALTER ROLE "${ADMIN_ROLE}" WITH PASSWORD '${ADMIN_PASSWORD}'`));
    await getOwnerDb().execute(sql.raw(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${ADMIN_ROLE}"`));
    await getOwnerDb().execute(sql.raw(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schemaName}" TO "${ADMIN_ROLE}"`));

    // 2. A non-owner, non-bypass role standing in for RLS-4's future
    //    application role — the exact convention
    //    tests/integration/rls-phase4-workflows.test.ts uses. Created here
    //    too (idempotently) since file execution order across a worker is
    //    not guaranteed.
    await getOwnerDb().execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${restrictedRole}') THEN
          CREATE ROLE "${restrictedRole}" NOLOGIN;
        END IF;
      END $$;
    `));
    await getOwnerDb().execute(sql.raw(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${restrictedRole}"`));
    await getOwnerDb().execute(sql.raw(`GRANT SELECT ON "${schemaName}".users TO "${restrictedRole}"`));

    // 3. Simulate RLS-4's end state for `users`, for this test only.
    await getOwnerDb().execute(sql.raw(`ALTER TABLE "${schemaName}".users FORCE ROW LEVEL SECURITY`));

    // 4. Point the admin pool at this worker's schema, exactly as
    //    server/db/adminDb.ts does in production via search_path pinning on
    //    connect — driven by the same TEST_SCHEMA/__TEST_SCHEMA__ globals.
    const baseUrl = String(
      (global as unknown as Record<string, unknown>).__BASE_DB_URL__
      ?? process.env.TEST_DATABASE_URL
      ?? process.env.DATABASE_URL,
    );
    const adminUrl = new URL(baseUrl);
    adminUrl.username = ADMIN_ROLE;
    adminUrl.password = ADMIN_PASSWORD;
    process.env.ADMIN_DATABASE_URL = adminUrl.toString();
    await initializeAdminDb();

    // 5. Real app, real routes.
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
    baseURL = await new Promise<string>((resolve) => {
      const s = server.listen(0, () => {
        const addr = s.address();
        const port = typeof addr === "object" && addr ? addr.port : 5000;
        resolve(`http://localhost:${port}`);
      });
    });

    // 6. Two tenants: a platform admin in tenant A, a plain user in tenant B.
    const [tenantA] = await getOwnerDb().insert(schema.tenants)
      .values({ name: `RLS-6 Tenant A ${nanoid()}`, plan: "pro" }).returning();
    const [tenantB] = await getOwnerDb().insert(schema.tenants)
      .values({ name: `RLS-6 Tenant B ${nanoid()}`, plan: "pro" }).returning();
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminRes = await request(baseURL).post("/api/auth/register").send({
      email: `rls6-admin-${nanoid()}@example.com`,
      password: "StrongTestUser123!@#",
      firstName: "RLS6",
      lastName: "Admin",
    });
    if (adminRes.status !== 201) {
      throw new Error(`admin register failed: ${JSON.stringify(adminRes.body)}`);
    }
    adminUserId = adminRes.body.user.id as string;
    adminToken = adminRes.body.token as string;
    await getOwnerDb().update(schema.users)
      .set({ tenantId: tenantAId, role: "admin", tenantRole: "owner" })
      .where(eq(schema.users.id, adminUserId));

    const userBRes = await request(baseURL).post("/api/auth/register").send({
      email: `rls6-userb-${nanoid()}@example.com`,
      password: "StrongTestUser123!@#",
      firstName: "RLS6",
      lastName: "UserB",
    });
    if (userBRes.status !== 201) {
      throw new Error(`user B register failed: ${JSON.stringify(userBRes.body)}`);
    }
    userBId = userBRes.body.user.id as string;
    await getOwnerDb().update(schema.users).set({ tenantId: tenantBId }).where(eq(schema.users.id, userBId));
  });

  afterAll(async () => {
    try {
      await getOwnerDb().execute(sql.raw(`ALTER TABLE "${schemaName}".users NO FORCE ROW LEVEL SECURITY`));
    } catch {
      /* best-effort: leave for the next run rather than fail teardown */
    }
    try {
      await getOwnerDb().delete(schema.users).where(eq(schema.users.id, adminUserId));
      await getOwnerDb().delete(schema.users).where(eq(schema.users.id, userBId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantAId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantBId));
    } catch {
      /* best-effort cleanup */
    }
    await closeAdminDb();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("admin (BYPASSRLS) crosses tenants under FORCE, is audited, AND the same read on the normal pool with the GUC pinned sees only one tenant", async () => {
    // --- AC3: the admin console still returns cross-tenant results once
    //     FORCE is on — proven by an HTTP round-trip through the real route
    //     → hybridAuth → isAdmin → AdminAccessService → adminDb chain. ---
    const res = await request(baseURL)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const seenIds = (res.body as Array<{ id: string }>).map((u) => u.id);
    expect(seenIds).toContain(adminUserId); // tenant A — the caller's own tenant
    expect(seenIds).toContain(userBId);     // tenant B — proves it crossed the boundary

    // --- AC5: every cross-tenant read writes an admin_access_log row. ---
    const logRows = rows(await getOwnerDb().execute(sql`
      SELECT * FROM admin_access_log
      WHERE actor_user_id = ${adminUserId}
        AND action = 'admin.users.listAllWithWorkflowCounts'
      ORDER BY created_at DESC LIMIT 1
    `));
    expect(logRows).toHaveLength(1);
    expect(logRows[0].target_tenant_id).toBeNull(); // global list — no single target tenant

    // --- AC4, in the SAME test — the discriminating half. The identical
    //     class of query (SELECT from `users`), run on the NORMAL pool as a
    //     non-owner/non-bypass role with the GUC pinned to tenant A, must
    //     see ONLY tenant A. Without this half, AC3 alone would be equally
    //     true in a world where RLS enforces nothing at all. ---
    const restrictedRows = await getOwnerDb().transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE "${restrictedRole}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${schemaName}", public`));
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantAId}, true)`);
      return rows(await tx.execute(sql`SELECT id FROM users`));
    });
    const restrictedIds = restrictedRows.map((r) => r.id as string);
    expect(restrictedIds).toContain(adminUserId); // tenant A — visible
    expect(restrictedIds).not.toContain(userBId);  // tenant B — must NOT be visible
  });

  it("fails closed: the restricted role with no tenant GUC sees no cross-tenant row, even under FORCE", async () => {
    // 0001_enable_rls.sql's policy for direct-tenant_id tables (users
    // included) is the raw `current_setting(...)::uuid` cast, with no
    // NULLIF guard — unlike the ownership-derived workflows/pages/steps
    // policies, which route through app_current_tenant() specifically to
    // collapse '' to NULL (see RLS-4 AC5's "known trap: an empty-string GUC
    // behaves differently from an unset one"). A pooled connection can carry
    // an empty-string residue instead of a true NULL from an earlier
    // transaction, and the raw cast then THROWS rather than filtering to
    // zero rows. Either outcome — an empty result or this specific cast
    // error — proves no cross-tenant row was returned; fixing 0001's cast
    // itself is RLS-3/RLS-4 scope, not this ticket's.
    try {
      const noContextRows = await getOwnerDb().transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE "${restrictedRole}"`));
        await tx.execute(sql.raw(`SET LOCAL search_path TO "${schemaName}", public`));
        return rows(await tx.execute(sql`SELECT id FROM users`));
      });
      expect(noContextRows).toHaveLength(0);
    } catch (err) {
      // Drizzle wraps the underlying pg error in a DrizzleQueryError whose
      // own .message is a generic "Failed query" summary — the real
      // Postgres error (code 22P02, invalid_text_representation) is on
      // `.cause`, not the top-level message.
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      expect(cause?.code).toBe("22P02");
      expect(String(cause?.message)).toMatch(/invalid input syntax for type uuid/i);
    }
  });

  it("no policy gained a platform-admin clause, and the admin role is not the table owner (AC6 sanity)", async () => {
    const policyRows = rows(await getOwnerDb().execute(sql.raw(`
      SELECT qual FROM pg_policies
      WHERE schemaname = '${schemaName}' AND tablename = 'users' AND policyname = 'tenant_isolation'
    `)));
    expect(policyRows).toHaveLength(1);
    expect(String(policyRows[0].qual)).not.toMatch(/is_platform_admin/i);

    const ownerRows = rows(await getOwnerDb().execute(sql.raw(`
      SELECT tableowner FROM pg_tables WHERE schemaname = '${schemaName}' AND tablename = 'users'
    `)));
    expect(ownerRows[0]?.tableowner).not.toBe(ADMIN_ROLE);
  });
});

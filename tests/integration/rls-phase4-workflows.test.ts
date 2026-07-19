/**
 * ICW-B2 / SEC-051 phase 4 — RLS isolation for workflows / sections / steps.
 *
 * These three tables carry no direct `tenant_id`; migration 0005 adds a
 * `tenant_isolation` policy that resolves the tenant through the ownership model
 * (owner_type/owner_uuid -> users|organizations, or project_id -> projects, or
 * legacy owner_id/creator_id). This test proves the policies actually filter
 * rows across tenants.
 *
 * RLS cannot be observed as the table owner or a superuser (both bypass it), and
 * the test DB connects as `postgres`. So every visibility assertion runs inside
 * a transaction under `SET LOCAL ROLE <non-owner role>` with a transaction-local
 * `app.current_tenant_id`, exactly as production enforcement will (doc §6).
 *
 * The migration is applied here in beforeAll (it is idempotent) so the test does
 * not depend on the shared per-worker schema having been built with it — which
 * also serves as proof the migration SQL applies cleanly.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { sql } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, test } from "vitest";

import { db } from "../../server/db";

// The phase-4 workflows/sections/steps policies (+ app_current_tenant /
// app_owner_tenant) were consolidated into 0001_enable_rls.sql when the
// migration chain was regenerated. Applying the whole file here is idempotent
// (DROP POLICY IF EXISTS + to_regclass guards + CREATE OR REPLACE).
const MIGRATION_SQL = readFileSync(
  join(process.cwd(), "migrations", "0001_enable_rls.sql"),
  "utf-8",
);

// Unique suffix so reruns against a reused per-worker schema don't collide.
const RUN = randomUUID().slice(0, 8);
// Resolved at runtime in beforeAll — the per-worker schema is exposed via the
// __TEST_SCHEMA__ global (same lookup server/db uses) and is not yet populated
// in process.env when this module is first evaluated.
let schema = "public";
let TEST_ROLE = "rls_tester_public";

const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const orgB = randomUUID();
const wfUserA = randomUUID();
const wfUserB = randomUUID();
const wfOrgB = randomUUID();
const secA = randomUUID();
const secB = randomUUID();
const stepA = randomUUID();
const stepB = randomUUID();
const emailA = `a-${RUN}@rls.test`;
const emailB = `b-${RUN}@rls.test`;
const orgBSlug = `org-b-${RUN}`;
const tenantAName = `Tenant A ${RUN}`;
const tenantBName = `Tenant B ${RUN}`;
const orgBName = `Org B ${RUN}`;

function rows(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>)
    ?? [];
}

/** Run a query as the non-owner test role, scoped to `tenant` (or no tenant). */
async function asTenant<T>(
  tenant: string | null,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE "${TEST_ROLE}"`));
    // SET ROLE drops the login role's search_path (rls_tester defaults to
    // "$user",public), so pin it back to the test schema for this transaction.
    await tx.execute(sql.raw(`SET LOCAL search_path TO "${schema}", public`));
    if (tenant !== null) {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant}, true)`);
    }
    return fn(tx);
  });
}

beforeAll(async () => {
  // 0. Resolve the actual per-worker schema (see note above).
  schema = String(
    process.env.TEST_SCHEMA
    ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__
    ?? "public",
  ).replace(/[^a-zA-Z0-9_]/g, "_");
  TEST_ROLE = `rls_tester_${schema}`;

  // 1. Apply the phase-4 migration (idempotent) into the current schema.
  await db.execute(sql.raw(MIGRATION_SQL));

  // 2. A non-owner, non-superuser role so RLS is actually enforced for it.
  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
        CREATE ROLE "${TEST_ROLE}" NOLOGIN;
      END IF;
    END $$;
  `));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA "${schema}" TO "${TEST_ROLE}"`));
  await db.execute(sql.raw(
    `GRANT SELECT, INSERT ON `
    + `"${schema}".workflows, "${schema}".sections, "${schema}".steps, `
    + `"${schema}".users, "${schema}".organizations, "${schema}".projects `
    + `TO "${TEST_ROLE}"`,
  ));

  // 3. Seed two tenants with user-owned + org-owned workflows (as superuser,
  //    which bypasses RLS for the insert).
  await db.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantA}, ${tenantAName}), (${tenantB}, ${tenantBName})`);
  await db.execute(sql`INSERT INTO users (id, email, tenant_id) VALUES (${userA}, ${emailA}, ${tenantA}), (${userB}, ${emailB}, ${tenantB})`);
  await db.execute(sql`INSERT INTO organizations (id, name, slug, tenant_id) VALUES (${orgB}, ${orgBName}, ${orgBSlug}, ${tenantB})`);

  // workflow owned by user A (tenant A)
  await db.execute(sql`INSERT INTO workflows (id, title, owner_type, owner_uuid, owner_id, creator_id) VALUES (${wfUserA}, ${"WF User A"}, 'user', ${userA}, ${userA}, ${userA})`);
  // workflow owned by user B (tenant B)
  await db.execute(sql`INSERT INTO workflows (id, title, owner_type, owner_uuid, owner_id, creator_id) VALUES (${wfUserB}, ${"WF User B"}, 'user', ${userB}, ${userB}, ${userB})`);
  // workflow owned by org B (tenant B) — exercises the org resolution branch
  await db.execute(sql`INSERT INTO workflows (id, title, owner_type, owner_uuid, owner_id, creator_id) VALUES (${wfOrgB}, ${"WF Org B"}, 'org', ${orgB}, ${userB}, ${userB})`);

  await db.execute(sql`INSERT INTO sections (id, workflow_id, title, "order") VALUES (${secA}, ${wfUserA}, 'Sec A', 1), (${secB}, ${wfUserB}, 'Sec B', 1)`);
  await db.execute(sql`INSERT INTO steps (id, workflow_id, section_id, type, title, "order") VALUES (${stepA}, ${wfUserA}, ${secA}, 'short_text', 'Step A', 1), (${stepB}, ${wfUserB}, ${secB}, 'short_text', 'Step B', 1)`);
});

afterAll(async () => {
  // Clean up seeded rows (as superuser; ignore if already gone).
  try {
    await db.execute(sql`DELETE FROM steps WHERE id IN (${stepA}, ${stepB})`);
    await db.execute(sql`DELETE FROM sections WHERE id IN (${secA}, ${secB})`);
    await db.execute(sql`DELETE FROM workflows WHERE id IN (${wfUserA}, ${wfUserB}, ${wfOrgB})`);
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgB}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${userA}, ${userB})`);
    await db.execute(sql`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`);
  } catch {
    /* best-effort cleanup */
  }
});

describe("RLS phase 4: app_owner_tenant resolution (SEC-051 / ICW-B2)", () => {
  test("resolves a workflow's tenant from each ownership path", async () => {
    const r = await db.execute(sql`
      SELECT
        app_owner_tenant('user', ${userA}, NULL, NULL, NULL)      AS by_owner_user,
        app_owner_tenant('org',  ${orgB}, NULL, NULL, NULL)       AS by_owner_org,
        app_owner_tenant('user', NULL, ${userB}, NULL, NULL)      AS by_legacy_owner,
        app_owner_tenant('user', NULL, NULL, ${userA}, NULL)      AS by_creator,
        app_owner_tenant('user', 'does-not-exist', NULL, NULL, NULL) AS orphan
    `);
    const row = rows(r)[0];
    expect(row.by_owner_user).toBe(tenantA);
    expect(row.by_owner_org).toBe(tenantB);
    expect(row.by_legacy_owner).toBe(tenantB);
    expect(row.by_creator).toBe(tenantA);
    expect(row.orphan).toBeNull(); // fail-closed: unresolvable owner -> NULL
  });
});

describe("RLS phase 4: cross-tenant row isolation", () => {
  test("tenant A sees only its own workflow / section / step", async () => {
    const { wf, sec, st } = await asTenant(tenantA, async (tx) => ({
      wf: rows(await tx.execute(sql`SELECT id FROM workflows`)).map((r) => r.id),
      sec: rows(await tx.execute(sql`SELECT id FROM sections`)).map((r) => r.id),
      st: rows(await tx.execute(sql`SELECT id FROM steps`)).map((r) => r.id),
    }));
    expect(wf).toContain(wfUserA);
    expect(wf).not.toContain(wfUserB);
    expect(wf).not.toContain(wfOrgB);
    expect(sec).toEqual([secA]);
    expect(st).toEqual([stepA]);
  });

  test("tenant B sees only its own rows, including the org-owned workflow", async () => {
    const wf = await asTenant(tenantB, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM workflows`)).map((r) => r.id),
    );
    expect(wf).toContain(wfUserB);
    expect(wf).toContain(wfOrgB); // org-owned resolves to tenant B
    expect(wf).not.toContain(wfUserA);
  });

  test("no tenant context => zero rows (fail-closed)", async () => {
    const counts = await asTenant(null, async (tx) => ({
      wf: rows(await tx.execute(sql`SELECT id FROM workflows`)).length,
      sec: rows(await tx.execute(sql`SELECT id FROM sections`)).length,
      st: rows(await tx.execute(sql`SELECT id FROM steps`)).length,
    }));
    expect(counts).toEqual({ wf: 0, sec: 0, st: 0 });
  });
});

describe("RLS phase 4: WITH CHECK blocks cross-tenant writes", () => {
  test("inserting a workflow that resolves to another tenant is rejected", async () => {
    await expect(
      asTenant(tenantA, async (tx) => {
        // owner_uuid = userB resolves to tenant B, but the GUC is tenant A.
        await tx.execute(sql`INSERT INTO workflows (id, title, owner_type, owner_uuid, owner_id, creator_id) VALUES (${randomUUID()}, 'sneaky', 'user', ${userB}, ${userB}, ${userB})`);
      }),
    ).rejects.toThrow();
  });

  test("inserting a workflow for the current tenant is allowed", async () => {
    const okId = randomUUID();
    await asTenant(tenantA, async (tx) => {
      await tx.execute(sql`INSERT INTO workflows (id, title, owner_type, owner_uuid, owner_id, creator_id) VALUES (${okId}, 'legit', 'user', ${userA}, ${userA}, ${userA})`);
    });
    // Confirm it landed, then clean up as superuser.
    const seen = rows(await db.execute(sql`SELECT id FROM workflows WHERE id = ${okId}`));
    expect(seen).toHaveLength(1);
    await db.execute(sql`DELETE FROM workflows WHERE id = ${okId}`);
  });
});

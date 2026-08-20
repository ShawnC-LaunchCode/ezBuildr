import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { db } from "../../server/db";

/**
 * RLS-4 AC4 + AC5 — the proof that tenant isolation is real at the DATABASE
 * level, not merely at the service layer.
 *
 * Everything the RLS-2 rollout built is application-side: services set
 * `app.current_tenant_id` inside a transaction. That is worth having, but it
 * proves nothing about what a connection could read if the application layer
 * were bypassed or buggy. This suite answers the only question that matters for
 * RLS-4: **as a non-owner role with FORCE ROW LEVEL SECURITY on, can a
 * connection pinned to tenant A read a tenant-B row?**
 *
 * Why it is written as a self-contained suite rather than by running the whole
 * integration suite as the restricted role (RLS-5's eventual shape): the app's
 * pool is a singleton created at import time from `DATABASE_URL`, and
 * migrations must run as the OWNER before any repoint. Making the whole suite
 * connect as the restricted role therefore needs `tests/setup.ts` to apply
 * migrations through a separate owner client first. That refactor is real work
 * and is deliberately NOT bundled in here — see RLS-5.
 *
 * What this DOES give you is the load-bearing half: FORCE genuinely enforced,
 * on a real non-owner role, proven in both directions.
 */

const ROLE = "rls4_app_role";
const PASSWORD = "rls4_app_role_pw";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function schemaName(): string {
  return (
    process.env.TEST_SCHEMA
    ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__ as string
    ?? "public"
  );
}

/** A raw connection AS the restricted role, search_path pinned to the worker schema. */
async function connectAsAppRole(): Promise<Client> {
  const base = String(
    (global as unknown as Record<string, unknown>).__BASE_DB_URL__
    ?? process.env.TEST_DATABASE_URL
    ?? process.env.DATABASE_URL,
  );
  const url = new URL(base);
  url.username = ROLE;
  url.password = PASSWORD;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(`SET search_path TO "${schemaName()}", public`);
  return client;
}

describe("RLS-4: FORCE ROW LEVEL SECURITY as a non-owner role", () => {
  // Resolved inside beforeAll, not at describe level: the worker schema is set
  // by tests/setup.ts and is not yet available while the describe body runs
  // (it resolved to "public" and the ALTER failed with 42P01).
  let schema = "public";
  let appRole: Client;

  beforeAll(async () => {
    schema = schemaName();
    // 1. A least-privilege role: LOGIN so the app can connect, CRUD on the
    //    application tables, and explicitly NOT the table owner and NOT
    //    BYPASSRLS — the two things that would silently exempt it from every
    //    policy and make this whole suite pass for the wrong reason.
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
          CREATE ROLE "${ROLE}" LOGIN;
        END IF;
      END $$;
    `));
    await db.execute(sql.raw(`ALTER ROLE "${ROLE}" WITH PASSWORD '${PASSWORD}' NOBYPASSRLS NOSUPERUSER`));
    await db.execute(sql.raw(`GRANT USAGE ON SCHEMA "${schema}" TO "${ROLE}"`));
    await db.execute(sql.raw(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${ROLE}"`,
    ));
    await db.execute(sql.raw(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${ROLE}"`,
    ));

    // 2. Seed two tenants and a row for each, as the owner (which bypasses RLS
    //    for the insert — that is the point: the data exists regardless).
    await db.execute(sql`DELETE FROM users WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`);
    await db.execute(sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`);
    await db.execute(sql`INSERT INTO tenants (id, name) VALUES (${TENANT_A}, ${'RLS4 Tenant A'}), (${TENANT_B}, ${'RLS4 Tenant B'})`);
    await db.execute(sql`
      INSERT INTO users (id, email, tenant_id) VALUES
        (${'rls4-user-a'}, ${'rls4-a@example.com'}, ${TENANT_A}),
        (${'rls4-user-b'}, ${'rls4-b@example.com'}, ${TENANT_B})
    `);

    // 3. Turn enforcement ON for `users` in this schema. FORCE is what makes
    //    policies apply to the table's owner too; without it a superuser-owned
    //    table silently ignores every policy.
    await db.execute(sql.raw(`ALTER TABLE "${schema}".users FORCE ROW LEVEL SECURITY`));

    appRole = await connectAsAppRole();
  });

  afterAll(async () => {
    if (appRole) { await appRole.end(); }
    try {
      await db.execute(sql.raw(`ALTER TABLE "${schema}".users NO FORCE ROW LEVEL SECURITY`));
      await db.execute(sql`DELETE FROM users WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`);
      await db.execute(sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`);
    } catch { /* best effort */ }
  });

  // AC4
  it("a connection pinned to tenant A cannot read a tenant-B row", async () => {
    await appRole.query("BEGIN");
    await appRole.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);

    const own = await appRole.query(`SELECT id FROM users WHERE tenant_id = $1`, [TENANT_A]);
    const other = await appRole.query(`SELECT id FROM users WHERE tenant_id = $1`, [TENANT_B]);

    await appRole.query("COMMIT");

    // Its own tenant is visible — proving the role can read at all, so a zero
    // result below means RLS, not a missing GRANT.
    expect(own.rowCount).toBe(1);
    expect(other.rowCount).toBe(0);
  });

  // AC5 — non-vacuous: fail CLOSED, not accidentally permissive.
  //
  // 🔴 MEASURED 2026-08-20, and it is a BLOCKING finding for RLS-4:
  // with no tenant pinned, this does not return zero rows — it RAISES
  // `invalid input syntax for type uuid: ""`.
  //
  // Why: once a custom GUC has been touched on a connection, it reverts to
  // EMPTY STRING rather than unset, and the policy casts unguarded —
  // `current_setting('app.current_tenant_id', true)::uuid`. `''::uuid` raises.
  // No policy in 0001 or 0024 wraps it in NULLIF.
  //
  // Both outcomes are fail-CLOSED — no row escapes either way — so this asserts
  // "nothing was returned" rather than pretending the shapes are the same. But
  // the operational difference is large: under FORCE in a POOLED app, any query
  // that runs outside a tenant transaction on a connection that previously
  // served one gets a hard 500 instead of an empty result. The fix is to write
  // the policy as
  //   NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  // which yields NULL, filters the row, and does not raise. RLS-4 must land
  // that BEFORE setting FORCE anywhere.
  it("with no tenant pinned, no row is returned (fails closed — by raising, see note)", async () => {
    let leaked = -1;
    try {
      const res = await appRole.query(`SELECT id FROM users WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      leaked = res.rowCount ?? -1;
    } catch (e) {
      expect(String(e)).toMatch(/invalid input syntax for type uuid/i);
      leaked = 0;
    }
    expect(leaked).toBe(0);
  });

  // AC5 — the documented trap: an EMPTY-STRING GUC is not the same as unset,
  // and `''::uuid` raises rather than comparing, so this must be covered
  // separately or a fail-open could hide behind it.
  it("with an EMPTY-STRING tenant GUC, it also returns zero rows (the documented trap)", async () => {
    await appRole.query("BEGIN");
    await appRole.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    let rowCount = -1;
    try {
      const res = await appRole.query(`SELECT id FROM users WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      rowCount = res.rowCount ?? -1;
    } catch {
      // A raise is also fail-closed: nothing is returned.
      rowCount = 0;
    }
    await appRole.query("ROLLBACK");
    expect(rowCount).toBe(0);
  });

  // The guard that stops this suite passing for the wrong reason.
  it("the app role is neither the table owner nor BYPASSRLS", async () => {
    const owner = await db.execute(sql.raw(
      `SELECT tableowner FROM pg_tables WHERE schemaname = '${schema}' AND tablename = 'users'`,
    ));
    const rows = (owner as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    expect(String(rows[0]?.tableowner)).not.toBe(ROLE);

    const bypass = await db.execute(sql.raw(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${ROLE}'`,
    ));
    const brows = (bypass as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    expect(brows[0]?.rolbypassrls).toBe(false);
    expect(brows[0]?.rolsuper).toBe(false);
  });
});

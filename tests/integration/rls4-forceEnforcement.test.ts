import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * ⚠️ OWNER connection, deliberately — and it does NOT weaken this suite.
 *
 * `ownerDb`'s warning against `rls-*` suites protects suites that assert what
 * the APP's restricted pool can see. This suite does not work that way: it
 * creates its own non-owner role and asserts visibility under `SET LOCAL ROLE`
 * inside a transaction, which is a stronger and self-contained mechanism. Both
 * halves REQUIRE ownership — creating a role, applying a migration, and
 * `SET LOCAL ROLE` itself are all owner operations, so under RLS_RESTRICTED
 * this suite failed at setup with `must be owner of table ...` and every test
 * was skipped.
 */
import { getOwnerDb } from "../helpers/ownerDb";

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
    await getOwnerDb().execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
          CREATE ROLE "${ROLE}" LOGIN;
        END IF;
      END $$;
    `));
    await getOwnerDb().execute(sql.raw(`ALTER ROLE "${ROLE}" WITH PASSWORD '${PASSWORD}' NOBYPASSRLS NOSUPERUSER`));
    await getOwnerDb().execute(sql.raw(`GRANT USAGE ON SCHEMA "${schema}" TO "${ROLE}"`));
    await getOwnerDb().execute(sql.raw(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${ROLE}"`,
    ));
    await getOwnerDb().execute(sql.raw(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${ROLE}"`,
    ));

    // 2. Seed two tenants and a row for each, as the owner (which bypasses RLS
    //    for the insert — that is the point: the data exists regardless).
    await getOwnerDb().execute(sql`DELETE FROM users WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`);
    await getOwnerDb().execute(sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`);
    await getOwnerDb().execute(sql`INSERT INTO tenants (id, name) VALUES (${TENANT_A}, ${'RLS4 Tenant A'}), (${TENANT_B}, ${'RLS4 Tenant B'})`);
    await getOwnerDb().execute(sql`
      INSERT INTO users (id, email, tenant_id) VALUES
        (${'rls4-user-a'}, ${'rls4-a@example.com'}, ${TENANT_A}),
        (${'rls4-user-b'}, ${'rls4-b@example.com'}, ${TENANT_B})
    `);

    // 3. Turn enforcement ON for `users` in this schema. FORCE is what makes
    //    policies apply to the table's owner too; without it a superuser-owned
    //    table silently ignores every policy.
    await getOwnerDb().execute(sql.raw(`ALTER TABLE "${schema}".users FORCE ROW LEVEL SECURITY`));

    appRole = await connectAsAppRole();
  });

  afterAll(async () => {
    if (appRole) { await appRole.end(); }
    try {
      await getOwnerDb().execute(sql.raw(`ALTER TABLE "${schema}".users NO FORCE ROW LEVEL SECURITY`));
      await getOwnerDb().execute(sql`DELETE FROM users WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`);
      await getOwnerDb().execute(sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`);
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
  // Was BLOCKING as of 2026-08-20: with no tenant pinned, this used to RAISE
  // `invalid input syntax for type uuid: ""` instead of returning zero rows,
  // because once a custom GUC has been touched on a connection it reverts to
  // EMPTY STRING rather than unset, and the policy cast unguarded —
  // `current_setting('app.current_tenant_id', true)::uuid`. `''::uuid` raises.
  //
  // Fixed by migration 0026 (`rls_nullif_guc_cast`), which rewrites every
  // direct-tenant_id policy as
  //   NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  // so the empty string yields NULL, the row is filtered, and nothing raises.
  // This assertion is now the strict form the handoff called for: a bare
  // rowCount check with no catch branch. If it starts raising again, the fix
  // did not take (or something reintroduced an unguarded cast).
  it("with no tenant pinned, no row is returned (fails closed, without raising)", async () => {
    const res = await appRole.query(`SELECT id FROM users WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    expect(res.rowCount).toBe(0);
  });

  // AC5 — the documented trap: an EMPTY-STRING GUC is not the same as unset,
  // and used to raise rather than compare, so this must be covered separately
  // or a fail-open could hide behind it. Same NULLIF fix applies here.
  it("with an EMPTY-STRING tenant GUC, it also returns zero rows without raising (the documented trap)", async () => {
    await appRole.query("BEGIN");
    await appRole.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const res = await appRole.query(`SELECT id FROM users WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await appRole.query("ROLLBACK");
    expect(res.rowCount).toBe(0);
  });

  // The guard that stops this suite passing for the wrong reason.
  it("the app role is neither the table owner nor BYPASSRLS", async () => {
    const owner = await getOwnerDb().execute(sql.raw(
      `SELECT tableowner FROM pg_tables WHERE schemaname = '${schema}' AND tablename = 'users'`,
    ));
    const rows = (owner as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    expect(String(rows[0]?.tableowner)).not.toBe(ROLE);

    const bypass = await getOwnerDb().execute(sql.raw(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${ROLE}'`,
    ));
    const brows = (bypass as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    expect(brows[0]?.rolbypassrls).toBe(false);
    expect(brows[0]?.rolsuper).toBe(false);
  });
});

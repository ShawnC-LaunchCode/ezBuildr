/**
 * DVH-3 / SEC-051 — RLS coverage for datavault_rows / datavault_values /
 * datavault_columns / datavault_table_permissions / datavault_database_access /
 * datavault_table_access.
 *
 * `migrations/0001_enable_rls.sql` staged tenant_isolation policies for five
 * DataVault tables with a direct tenant_id column (datavault_api_tokens,
 * datavault_databases, datavault_number_sequences, datavault_row_notes,
 * datavault_tables) but left the two tables holding actual customer data —
 * datavault_rows and datavault_values — uncovered, plus datavault_columns,
 * datavault_table_permissions, datavault_database_access and
 * datavault_table_access. `migrations/0011_datavault_rls_phase4.sql` closes
 * that gap with ownership-derived policies (none of the six has a tenant_id
 * column; tenancy is derived through datavault_tables / datavault_databases).
 *
 * RLS cannot be observed as the table owner or a superuser (both bypass it),
 * and the test DB connects as `postgres`. So every visibility assertion runs
 * inside a transaction under `SET LOCAL ROLE <non-owner role>` with a
 * transaction-local `app.current_tenant_id`, mirroring
 * tests/integration/rls-phase4-workflows.test.ts exactly (including the
 * search_path fix `SET ROLE` requires).
 *
 * The migration is applied here in beforeAll (it is idempotent) so the test
 * does not depend on the shared per-worker schema having been built with it —
 * which also serves as proof the migration SQL applies cleanly.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { sql } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, test } from "vitest";

import { db } from "../../server/db";

const MIGRATION_SQL = readFileSync(
  join(process.cwd(), "migrations", "0011_datavault_rls_phase4.sql"),
  "utf-8",
);

// Unique suffix so reruns against a reused per-worker schema don't collide.
const RUN = randomUUID().slice(0, 8);
// Resolved at runtime in beforeAll — see rls-phase4-workflows.test.ts for why.
let schema = "public";
let TEST_ROLE = "rls_tester_public";

const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const emailA = `dvh3-a-${RUN}@rls.test`;
const emailB = `dvh3-b-${RUN}@rls.test`;

const tenantAName = `DVH-3 Tenant A ${RUN}`;
const tenantBName = `DVH-3 Tenant B ${RUN}`;
const tableASlug = `table-a-${RUN}`;
const tableBSlug = `table-b-${RUN}`;

const dbA = randomUUID();
const dbB = randomUUID();
const tableA = randomUUID();
const tableB = randomUUID();
const columnA = randomUUID();
const columnB = randomUUID();
const rowA = randomUUID();
const rowB = randomUUID();
const valueA = randomUUID();
const valueB = randomUUID();
const tablePermA = randomUUID();
const tablePermB = randomUUID();
const dbAccessA = randomUUID();
const dbAccessB = randomUUID();
const tableAccessA = randomUUID();
const tableAccessB = randomUUID();

function rows(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>)
    ?? [];
}

/**
 * Run a query as the non-owner test role, scoped to `tenant`.
 * - `tenant` a uuid string  -> SET_LOCAL the GUC to that value (normal case).
 * - `tenant` === null       -> never call set_config at all (GUC unset).
 * - `tenant` === ""         -> explicitly set the GUC to an empty string
 *   (distinct from unset — exercises app_current_tenant()'s NULLIF collapse,
 *   criterion 4's fail-closed-on-empty-string case).
 */
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
  // 0. Resolve the actual per-worker schema.
  schema = String(
    process.env.TEST_SCHEMA
    ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__
    ?? "public",
  ).replace(/[^a-zA-Z0-9_]/g, "_");
  TEST_ROLE = `rls_tester_${schema}`;

  // 1. Apply the DVH-3 migration (idempotent) into the current schema.
  await db.execute(sql.raw(MIGRATION_SQL));

  // 2. A non-owner, non-superuser role so RLS is actually enforced for it.
  //    (Same role rls-phase4-workflows.test.ts creates — CREATE ROLE IF NOT
  //    EXISTS makes this safe whichever test file runs first.)
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
    + `"${schema}".datavault_databases, "${schema}".datavault_tables, `
    + `"${schema}".datavault_columns, "${schema}".datavault_rows, `
    + `"${schema}".datavault_values, "${schema}".datavault_table_permissions, `
    + `"${schema}".datavault_database_access, "${schema}".datavault_table_access, `
    + `"${schema}".users `
    + `TO "${TEST_ROLE}"`,
  ));

  // 3. Seed two tenants, each with a database/table/column/row/value and one
  //    permission/access row per access table (as superuser, bypassing RLS).
  await db.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantA}, ${tenantAName}), (${tenantB}, ${tenantBName})`);
  await db.execute(sql`INSERT INTO users (id, email, tenant_id) VALUES (${userA}, ${emailA}, ${tenantA}), (${userB}, ${emailB}, ${tenantB})`);

  await db.execute(sql`INSERT INTO datavault_databases (id, tenant_id, name) VALUES (${dbA}, ${tenantA}, 'DVH-3 DB A'), (${dbB}, ${tenantB}, 'DVH-3 DB B')`);
  await db.execute(sql`INSERT INTO datavault_tables (id, tenant_id, database_id, name, slug) VALUES (${tableA}, ${tenantA}, ${dbA}, 'Table A', ${tableASlug}), (${tableB}, ${tenantB}, ${dbB}, 'Table B', ${tableBSlug})`);
  await db.execute(sql`INSERT INTO datavault_columns (id, table_id, name, slug, type) VALUES (${columnA}, ${tableA}, 'Col A', 'col-a', 'text'), (${columnB}, ${tableB}, 'Col B', 'col-b', 'text')`);
  await db.execute(sql`INSERT INTO datavault_rows (id, table_id) VALUES (${rowA}, ${tableA}), (${rowB}, ${tableB})`);
  await db.execute(sql`INSERT INTO datavault_values (id, row_id, column_id, value) VALUES (${valueA}, ${rowA}, ${columnA}, ${'"value A"'}::jsonb), (${valueB}, ${rowB}, ${columnB}, ${'"value B"'}::jsonb)`);
  await db.execute(sql`INSERT INTO datavault_table_permissions (id, table_id, user_id, role) VALUES (${tablePermA}, ${tableA}, ${userA}, 'owner'), (${tablePermB}, ${tableB}, ${userB}, 'owner')`);
  await db.execute(sql`INSERT INTO datavault_database_access (id, database_id, principal_type, principal_id, role) VALUES (${dbAccessA}, ${dbA}, 'user', ${userA}, 'owner'), (${dbAccessB}, ${dbB}, 'user', ${userB}, 'owner')`);
  await db.execute(sql`INSERT INTO datavault_table_access (id, table_id, principal_type, principal_id, role) VALUES (${tableAccessA}, ${tableA}, 'user', ${userA}, 'owner'), (${tableAccessB}, ${tableB}, 'user', ${userB}, 'owner')`);
});

afterAll(async () => {
  // Clean up seeded rows (as superuser; ignore if already gone).
  try {
    await db.execute(sql`DELETE FROM datavault_table_access WHERE id IN (${tableAccessA}, ${tableAccessB})`);
    await db.execute(sql`DELETE FROM datavault_database_access WHERE id IN (${dbAccessA}, ${dbAccessB})`);
    await db.execute(sql`DELETE FROM datavault_table_permissions WHERE id IN (${tablePermA}, ${tablePermB})`);
    await db.execute(sql`DELETE FROM datavault_values WHERE id IN (${valueA}, ${valueB})`);
    await db.execute(sql`DELETE FROM datavault_rows WHERE id IN (${rowA}, ${rowB})`);
    await db.execute(sql`DELETE FROM datavault_columns WHERE id IN (${columnA}, ${columnB})`);
    await db.execute(sql`DELETE FROM datavault_tables WHERE id IN (${tableA}, ${tableB})`);
    await db.execute(sql`DELETE FROM datavault_databases WHERE id IN (${dbA}, ${dbB})`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${userA}, ${userB})`);
    await db.execute(sql`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`);
  } catch {
    /* best-effort cleanup */
  }
});

describe("DVH-3: assertions genuinely run as a non-owner role", () => {
  // A test that passes as the table owner or superuser proves nothing — RLS is
  // bypassed for both. This asserts, on every run, that `asTenant()` actually
  // switched to a NOLOGIN, non-superuser, non-BYPASSRLS role before any of the
  // isolation assertions below execute.
  test("SET LOCAL ROLE switches away from the connecting superuser", async () => {
    const roleAttrs = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)),
    );
    expect(roleAttrs[0].rolname).toBe(TEST_ROLE);
    expect(roleAttrs[0].rolsuper).toBe(false);
    expect(roleAttrs[0].rolbypassrls).toBe(false);
  });

  test("the test role is not the owner of datavault_rows (the connecting pool user is)", async () => {
    const outsideConnectionUser = rows(await db.execute(sql`SELECT current_user AS cu`))[0].cu;
    const tableOwner = rows(await db.execute(
      sql`SELECT pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.relname = 'datavault_rows'`,
    ))[0].owner;
    // The pool's own connection (superuser/owner, used for seeding) owns the
    // table — proving RLS would be silently bypassed if tests ran as it.
    expect(tableOwner).toBe(outsideConnectionUser);
    expect(TEST_ROLE).not.toBe(tableOwner);
  });
});

describe("DVH-3: policies exist for all six tables (criterion 1)", () => {
  test("pg_policies has a tenant_isolation policy for each of the six tables", async () => {
    const result = rows(await db.execute(sql`
      SELECT tablename FROM pg_policies
      WHERE schemaname = ${schema}
        AND policyname = 'tenant_isolation'
        AND tablename IN (
          'datavault_rows', 'datavault_values', 'datavault_columns',
          'datavault_table_permissions', 'datavault_database_access',
          'datavault_table_access'
        )
    `));
    const covered = result.map((r) => r.tablename).sort();
    expect(covered).toEqual([
      "datavault_columns",
      "datavault_database_access",
      "datavault_rows",
      "datavault_table_access",
      "datavault_table_permissions",
      "datavault_values",
    ]);
  });
});

describe("DVH-3: datavault_rows cross-tenant isolation (criterion 2)", () => {
  test("tenant A sees only its own row", async () => {
    const ids = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_rows WHERE id IN (${rowA}, ${rowB})`)).map((r) => r.id),
    );
    expect(ids).toEqual([rowA]);
  });

  test("tenant B sees only its own row", async () => {
    const ids = await asTenant(tenantB, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_rows WHERE id IN (${rowA}, ${rowB})`)).map((r) => r.id),
    );
    expect(ids).toEqual([rowB]);
  });
});

describe("DVH-3: datavault_values cross-tenant isolation via the two-hop derivation (criterion 3)", () => {
  test("tenant A sees only its own value", async () => {
    const ids = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_values WHERE id IN (${valueA}, ${valueB})`)).map((r) => r.id),
    );
    expect(ids).toEqual([valueA]);
  });

  test("tenant B sees only its own value", async () => {
    const ids = await asTenant(tenantB, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_values WHERE id IN (${valueA}, ${valueB})`)).map((r) => r.id),
    );
    expect(ids).toEqual([valueB]);
  });
});

describe("DVH-3: fail-closed on missing / empty tenant context (criterion 4)", () => {
  test("unset GUC => zero rows for datavault_rows and datavault_values", async () => {
    const counts = await asTenant(null, async (tx) => ({
      rows: rows(await tx.execute(sql`SELECT id FROM datavault_rows WHERE id IN (${rowA}, ${rowB})`)).length,
      values: rows(await tx.execute(sql`SELECT id FROM datavault_values WHERE id IN (${valueA}, ${valueB})`)).length,
    }));
    expect(counts).toEqual({ rows: 0, values: 0 });
  });

  test("empty-string GUC => zero rows, not a 22P02 cast error (app_current_tenant's NULLIF collapse)", async () => {
    const counts = await asTenant("", async (tx) => ({
      rows: rows(await tx.execute(sql`SELECT id FROM datavault_rows WHERE id IN (${rowA}, ${rowB})`)).length,
      values: rows(await tx.execute(sql`SELECT id FROM datavault_values WHERE id IN (${valueA}, ${valueB})`)).length,
    }));
    expect(counts).toEqual({ rows: 0, values: 0 });
  });
});

describe("DVH-3: the remaining four tables also isolate by tenant", () => {
  test("datavault_columns", async () => {
    const idsA = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_columns WHERE id IN (${columnA}, ${columnB})`)).map((r) => r.id),
    );
    expect(idsA).toEqual([columnA]);
    const idsB = await asTenant(tenantB, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_columns WHERE id IN (${columnA}, ${columnB})`)).map((r) => r.id),
    );
    expect(idsB).toEqual([columnB]);
  });

  test("datavault_table_permissions", async () => {
    const idsA = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_table_permissions WHERE id IN (${tablePermA}, ${tablePermB})`)).map((r) => r.id),
    );
    expect(idsA).toEqual([tablePermA]);
  });

  test("datavault_database_access", async () => {
    const idsB = await asTenant(tenantB, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_database_access WHERE id IN (${dbAccessA}, ${dbAccessB})`)).map((r) => r.id),
    );
    expect(idsB).toEqual([dbAccessB]);
  });

  test("datavault_table_access", async () => {
    const idsA = await asTenant(tenantA, async (tx) =>
      rows(await tx.execute(sql`SELECT id FROM datavault_table_access WHERE id IN (${tableAccessA}, ${tableAccessB})`)).map((r) => r.id),
    );
    expect(idsA).toEqual([tableAccessA]);
  });
});

describe("DVH-3: WITH CHECK blocks a cross-tenant write", () => {
  test("inserting a datavault_row under tenant B's table while scoped to tenant A is rejected", async () => {
    await expect(
      asTenant(tenantA, async (tx) => {
        await tx.execute(sql`INSERT INTO datavault_rows (id, table_id) VALUES (${randomUUID()}, ${tableB})`);
      }),
    ).rejects.toThrow();
  });

  test("inserting a datavault_row under the current tenant's own table is allowed", async () => {
    const okId = randomUUID();
    await asTenant(tenantA, async (tx) => {
      await tx.execute(sql`INSERT INTO datavault_rows (id, table_id) VALUES (${okId}, ${tableA})`);
    });
    const seen = rows(await db.execute(sql`SELECT id FROM datavault_rows WHERE id = ${okId}`));
    expect(seen).toHaveLength(1);
    await db.execute(sql`DELETE FROM datavault_rows WHERE id = ${okId}`);
  });
});

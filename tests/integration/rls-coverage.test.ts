/**
 * RLS-3 — coverage gate: every table with a `tenant_id` column must carry RLS
 * + a `tenant_isolation` policy.
 *
 * Context (measured against `dev`, a byte-identical Neon branch of production,
 * 2026-08-18 — RLS-3, closed; its detail is in
 * `tickets/backlog/ENVIRONMENTS_AND_RLS.md`, full text via
 * `git log -p -- tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`): `0001` and
 * `0004` are not broken — a scratch database built from the migration chain
 * alone gets all 27 policies they define (ENV-2). Production's tables were
 * created out of band by `db:push` before those migrations first ran for
 * real, so their `to_regclass` guards resolved NULL for a table that did not
 * exist *yet* and silently skipped it — 24 of 26 direct-tenant_id tables and
 * all 3 ownership-derived tables (workflows/pages/steps) ended up with no
 * RLS at all. `0024_repair_rls_coverage.sql` closes the gap on an
 * already-provisioned database.
 *
 * This suite is the AC5 "coverage" gate — a *general* assertion so a future
 * tenant-scoped table added without a policy fails CI, rather than becoming
 * the 25th silent gap. It is deliberately migration-agnostic: it queries
 * `information_schema`/`pg_catalog` for the current state, not the migration
 * source, so it would have caught this exact defect.
 *
 * Global integration setup applies the complete migration chain. Replaying
 * 0024 here would overwrite newer policy definitions and refers to the former
 * physical table name.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * ⚠️ This suite uses the OWNER connection, and that is correct here even though
 * `ownerDb`'s doc warns against it in `rls-*` suites. That warning protects
 * suites asserting what a restricted role can SEE — handing those an owner
 * handle makes them pass unconditionally.
 *
 * This suite asserts SCHEMA STRUCTURE, not visibility: it creates and drops
 * probe tables and reads `information_schema`. Every one of
 * those needs ownership (`must be owner of table ai_usage` is exactly how it
 * failed under RLS_RESTRICTED), and none of them is an application path. The
 * coverage assertions read the catalog, which the owner sees identically.
 */
import { getOwnerDb } from "../helpers/ownerDb";

// Resolved at runtime in beforeAll (per-worker schema is not yet populated in
// process.env when this module is first evaluated) — same lookup as the other
// RLS integration suites.
let schema = "public";

function rows(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>)
    ?? [];
}

/**
 * Every base table in `schema` that has a `tenant_id` column but is missing
 * either `relrowsecurity` or a policy named `tenant_isolation`.
 */
async function findUncoveredTenantIdTables(targetSchema: string): Promise<string[]> {
  const r = await getOwnerDb().execute(sql`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = ${targetSchema}
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = ${targetSchema}
          AND col.table_name = c.relname
          AND col.column_name = 'tenant_id'
      )
      AND NOT (
        c.relrowsecurity
        AND EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        )
      )
    ORDER BY 1
  `);
  return rows(r).map((row) => String(row.table_name));
}

/** RLS coverage state for one specific table, by name. */
async function tableRlsState(
  targetSchema: string,
  tableName: string,
): Promise<{ exists: boolean; rlsEnabled: boolean; hasPolicy: boolean }> {
  const r = await getOwnerDb().execute(sql`
    SELECT
      c.relrowsecurity AS rls_enabled,
      EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
      ) AS has_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = ${targetSchema} AND c.relname = ${tableName}
  `);
  const row = rows(r)[0];
  if (!row) {
    return { exists: false, rlsEnabled: false, hasPolicy: false };
  }
  return { exists: true, rlsEnabled: Boolean(row.rls_enabled), hasPolicy: Boolean(row.has_policy) };
}

beforeAll(async () => {
  schema = String(
    process.env.TEST_SCHEMA
      ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__
      ?? "public",
  ).replace(/[^a-zA-Z0-9_]/g, "_");

});

describe("RLS coverage (RLS-3 / SEC-051)", () => {
  test("every table with a tenant_id column has RLS enabled and a tenant_isolation policy", async () => {
    const uncovered = await findUncoveredTenantIdTables(schema);
    expect(uncovered).toEqual([]);
  });

  test("the coverage check is discriminating: a tenant_id table with no policy is flagged", async () => {
    const probeTable = `rls_coverage_probe_${schema}`;
    await getOwnerDb().execute(sql.raw(`
      CREATE TABLE "${schema}"."${probeTable}" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL
      )
    `));
    try {
      const uncovered = await findUncoveredTenantIdTables(schema);
      expect(uncovered).toContain(probeTable);
    } finally {
      await getOwnerDb().execute(sql.raw(`DROP TABLE IF EXISTS "${schema}"."${probeTable}"`));
    }
  });

  test("the coverage check clears once the probe table gets RLS + a tenant_isolation policy", async () => {
    const probeTable = `rls_coverage_probe2_${schema}`;
    await getOwnerDb().execute(sql.raw(`
      CREATE TABLE "${schema}"."${probeTable}" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL
      )
    `));
    try {
      await getOwnerDb().execute(sql.raw(`ALTER TABLE "${schema}"."${probeTable}" ENABLE ROW LEVEL SECURITY`));
      await getOwnerDb().execute(sql.raw(
        `CREATE POLICY tenant_isolation ON "${schema}"."${probeTable}" `
        + `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid) `
        + `WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`,
      ));
      const uncovered = await findUncoveredTenantIdTables(schema);
      expect(uncovered).not.toContain(probeTable);
    } finally {
      await getOwnerDb().execute(sql.raw(`DROP TABLE IF EXISTS "${schema}"."${probeTable}"`));
    }
  });

  // workflows/pages/steps carry no tenant_id column (tenancy is ownership-
  // derived), so they fall outside the tenant_id-column query above by
  // construction. They are covered by 0001 Part 3 / 0024 Part 2 all the same,
  // and by tests/integration/rls-phase4-workflows.test.ts for behaviour — this
  // is just coverage, kept here because 0024 is what actually applies it on a
  // database that predates this ticket.
  test.each(["workflows", "pages", "steps"])(
    "ownership-derived table %s has RLS enabled and a tenant_isolation policy",
    async (tableName) => {
      const state = await tableRlsState(schema, tableName);
      expect(state.exists).toBe(true);
      expect(state.rlsEnabled).toBe(true);
      expect(state.hasPolicy).toBe(true);
    },
  );
});

afterAll(async () => {
  // Best-effort: drop probe tables if a failed assertion left one behind.
  try {
    await getOwnerDb().execute(sql.raw(`DROP TABLE IF EXISTS "${schema}"."rls_coverage_probe_${schema}"`));
    await getOwnerDb().execute(sql.raw(`DROP TABLE IF EXISTS "${schema}"."rls_coverage_probe2_${schema}"`));
  } catch {
    /* best-effort cleanup */
  }
});

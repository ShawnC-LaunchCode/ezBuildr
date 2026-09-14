/**
 * RLS-10 — data-driven proof that every RLS policy actually ISOLATES, not just
 * that it is enabled and forced (that's `rls-coverage.test.ts`).
 *
 * `rls-coverage.test.ts` (RLS-3/0041) proves every policy-bearing table has
 * `relrowsecurity` + `relforcerowsecurity` on. It does NOT prove the policy's
 * predicate is correct — a policy can be enabled, forced, and simply wrong
 * (e.g. `USING (true)`, or a stale predicate after a rename). This suite
 * enumerates every table that currently carries a `tenant_isolation` policy
 * from `pg_policies` at runtime (never a hand-written list — that mistake was
 * made three times already: migrations 0001, 0011, 0024), seeds two tenants'
 * worth of real fixtures for each one, and asserts — as a genuine non-owner,
 * non-superuser role — that tenant A can see its own rows, cannot see tenant
 * B's rows, and cannot even UPDATE them.
 *
 * Coverage is driven by the catalog, not by `SEEDERS`: a table that starts
 * carrying a policy but has neither a seeder here nor a documented `SKIPPED`
 * entry fails the suite, naming the table (AC1/AC4).
 *
 * Re-audit measured on the dev Neon branch 2026-09-13: 38 policy tables, three
 * shapes (direct tenant_id, ownership-derived, and direct-plus-bootstrap-
 * disjunct) — see `tickets/ENVIRONMENTS_AND_RLS_TICKETS.md` RLS-10 for the
 * full matrix and the three rulings pinned below (AC5).
 */
import { randomUUID } from "crypto";

import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";

/**
 * ⚠️ OWNER connection, deliberately — same reasoning as `rls4-forceEnforcement`
 * and `rls-coverage`: this suite creates its own non-owner role and asserts
 * visibility via a raw connection AS that role. Seeding fixtures and reading
 * `pg_policies`/`pg_catalog` are both owner-side setup, never the thing under
 * test — handing the OBSERVER an owner handle does not weaken this suite; it
 * is what lets the two tenants' worth of fixtures get written at all.
 */
import { getOwnerDb } from "../helpers/ownerDb";
import { TestFactory } from "../helpers/testFactory";

const ROLE = "rls10_app_role";
const PASSWORD = "rls10_app_role_pw";

// Arbitrary, distinct from RLS5's 0x524c5335 ("RLS5") in tests/setup.ts — a
// different lock key so this role's provisioning doesn't serialize with an
// unrelated one, while still serializing with itself across concurrent
// workers/worktrees hitting the same database (RLS-11 cause 5).
const ROLE_PROVISION_LOCK = 0x524c5331; // "RLS1"
const MAX_PROVISION_ATTEMPTS = 5;

// Unique per test run so unique constraints (tokenHash, domain, slug...) never
// collide with a prior run against a reused per-worker schema.
const RUN = randomUUID().slice(0, 8);

function schemaName(): string {
  return (
    process.env.TEST_SCHEMA
    ?? (global as unknown as Record<string, unknown>).__TEST_SCHEMA__ as string
    ?? "public"
  );
}

function rows(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>)
    ?? [];
}

/** Same classification tests/setup.ts uses for its shared-role provisioning. */
function isConcurrentRoleWrite(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return (code === "XX000" && /tuple concurrently updated/.test(message ?? ""))
    || code === "23505" // concurrent CREATE ROLE: pg_authid_rolname_index
    || code === "42710"; // duplicate_object: another database created it first
}

/**
 * A least-privilege, non-owner, non-superuser role — bounded retry on the
 * concurrent-DDL codes RLS-11 cause 5 identified, using this suite's OWN
 * advisory lock key so it can't race `rls4`/`rls5`'s provisioning.
 */
async function provisionAppRole(schema: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await getOwnerDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ROLE_PROVISION_LOCK})`);
        await tx.execute(sql.raw(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
              CREATE ROLE "${ROLE}" LOGIN;
            END IF;
          END $$;
        `));
        await tx.execute(sql.raw(`ALTER ROLE "${ROLE}" WITH PASSWORD '${PASSWORD}' NOBYPASSRLS NOSUPERUSER`));
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA "${schema}" TO "${ROLE}"`));
        await tx.execute(sql.raw(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${ROLE}"`,
        ));
        await tx.execute(sql.raw(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${ROLE}"`,
        ));
      });
      return;
    } catch (error: unknown) {
      if (attempt >= MAX_PROVISION_ATTEMPTS || !isConcurrentRoleWrite(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.random() * 100));
    }
  }
}

/**
 * Guards against the suite passing for the wrong reason: if this role were
 * ever BYPASSRLS or SUPERUSER, every isolation check below would trivially
 * pass regardless of whether any policy actually filters anything. Checked
 * eagerly in `beforeAll`, before the (expensive) world-building and seeding,
 * so a misconfigured role fails fast as a setup error rather than silently
 * validating nothing.
 */
async function assertRoleIsRestricted(roleName: string): Promise<void> {
  const res = await getOwnerDb().execute(sql.raw(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${roleName}'`,
  ));
  const row = rows(res)[0];
  if (row?.rolbypassrls !== false || row?.rolsuper !== false) {
    throw new Error(
      `checkIsolation guard: role "${roleName}" must be NOBYPASSRLS/NOSUPERUSER `
      + `(got rolbypassrls=${String(row?.rolbypassrls)}, rolsuper=${String(row?.rolsuper)}) `
      + `— every isolation assertion below would pass for the wrong reason otherwise`,
    );
  }
}

/** A raw connection AS the restricted role, search_path pinned to the worker schema. */
async function connectAsAppRole(schema: string): Promise<Client> {
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
  await client.query(`SET search_path TO "${schema}", public`);
  return client;
}

/** Every table currently carrying a `tenant_isolation`-style policy, from the catalog. */
async function listPolicyTables(targetSchema: string): Promise<string[]> {
  const res = await getOwnerDb().execute(sql`
    SELECT DISTINCT c.relname AS table_name
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${targetSchema} AND c.relkind = 'r'
    ORDER BY 1
  `);
  return rows(res).map((r) => String(r.table_name));
}

/** Resolved from the catalog, never assumed to be "id" (RLS-10 shape requirement). */
async function resolvePrimaryKeyColumns(
  role: Client,
  targetSchema: string,
  table: string,
): Promise<string[]> {
  const res = await role.query(
    `SELECT a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.indisprimary AND n.nspname = $1 AND c.relname = $2
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [targetSchema, table],
  );
  return res.rows.map((r: { col: string }) => r.col);
}

/**
 * The five-condition matrix (RLS-10 ticket), run as the restricted role, each
 * condition in its own transaction so a raised error or a mutation never
 * bleeds into the next check. Returns violation messages; never calls
 * `expect` itself — callers decide what to do with the list (AC3 relies on
 * that: it wants the violations back, not a thrown assertion).
 */
interface IsolationContext {
  role: Client;
  /** Opens a brand-new restricted connection; the caller must `end()` it. */
  connectFresh: () => Promise<Client>;
  targetSchema: string;
  tenantAId: string;
  tenantBId: string;
}

async function checkIsolationImpl(
  ctx: IsolationContext,
  table: string,
  seededA: string[],
  seededB: string[],
): Promise<string[]> {
  const { role, connectFresh, targetSchema, tenantAId, tenantBId } = ctx;
  if (seededA.length === 0 || seededB.length === 0) {
    throw new Error(
      `checkIsolation: "${table}" needs at least one seeded row per tenant — `
      + `an empty set makes every condition pass vacuously`,
    );
  }
  const violations: string[] = [];
  const pkCols = await resolvePrimaryKeyColumns(role, targetSchema, table);
  if (pkCols.length !== 1) {
    throw new Error(
      `checkIsolation: table "${table}" has ${pkCols.length === 0 ? "no" : "a composite"} `
      + `primary key (${pkCols.join(", ")}) — not supported by this suite`,
    );
  }
  const pk = pkCols[0];
  const qualified = `"${targetSchema}"."${table}"`;
  const allSeeded = [...seededA, ...seededB];

  async function visibleIds(
    setup: () => Promise<void>,
    client: Client = role,
  ): Promise<Set<string>> {
    await client.query("BEGIN");
    try {
      await setup();
      const res = await client.query(
        `SELECT "${pk}"::text AS pk FROM ${qualified} WHERE "${pk}"::text = ANY($1::text[])`,
        [allSeeded],
      );
      return new Set(res.rows.map((r: { pk: string }) => r.pk));
    } finally {
      await client.query("ROLLBACK");
    }
  }

  // 1. No tenant GUC pinned — on a FRESH connection. Once any transaction on a
  //    connection has touched `app.current_tenant_id`, Postgres keeps the
  //    placeholder defined and it reads back as '' rather than unset, so on the
  //    shared `role` connection this condition silently became a second copy of
  //    condition 2 for every table after the first. A policy that opens up only
  //    when the setting is truly unset then passed — proven by mutation at
  //    review, 2026-09-13.
  const fresh = await connectFresh();
  let visibleNoGuc: Set<string>;
  try {
    visibleNoGuc = await visibleIds(async () => undefined, fresh);
  } finally {
    await fresh.end();
  }
  if (visibleNoGuc.size > 0) {
    violations.push(`${table}: rows visible with no tenant GUC pinned: ${[...visibleNoGuc].join(", ")}`);
  }

  // 2. The documented empty-string-GUC trap (migration 0026/0027).
  const visibleEmptyGuc = await visibleIds(async () => {
    await role.query(`SELECT set_config('app.current_tenant_id', '', true)`);
  });
  if (visibleEmptyGuc.size > 0) {
    violations.push(`${table}: rows visible with an empty-string tenant GUC: ${[...visibleEmptyGuc].join(", ")}`);
  }

  // 3. Tenant A pinned: must see its own seeded rows, never tenant B's.
  const visibleA = await visibleIds(async () => {
    await role.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantAId]);
  });
  const missingOwnA = seededA.filter((id) => !visibleA.has(id));
  const leakedBIntoA = seededB.filter((id) => visibleA.has(id));
  if (missingOwnA.length > 0) {
    violations.push(`${table}: tenant A cannot see its own rows: ${missingOwnA.join(", ")}`);
  }
  if (leakedBIntoA.length > 0) {
    violations.push(`${table}: tenant A can see tenant B's rows (cross-tenant leak): ${leakedBIntoA.join(", ")}`);
  }

  // 4. Tenant B pinned: the symmetric case.
  const visibleB = await visibleIds(async () => {
    await role.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantBId]);
  });
  const missingOwnB = seededB.filter((id) => !visibleB.has(id));
  const leakedAIntoB = seededA.filter((id) => visibleB.has(id));
  if (missingOwnB.length > 0) {
    violations.push(`${table}: tenant B cannot see its own rows: ${missingOwnB.join(", ")}`);
  }
  if (leakedAIntoB.length > 0) {
    violations.push(`${table}: tenant B can see tenant A's rows (cross-tenant leak): ${leakedAIntoB.join(", ")}`);
  }

  // 5. Tenant A pinned, attempt to UPDATE tenant B's rows: must affect zero.
  if (seededB.length > 0) {
    await role.query("BEGIN");
    try {
      await role.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantAId]);
      const res = await role.query(
        `UPDATE ${qualified} SET "${pk}" = "${pk}" WHERE "${pk}"::text = ANY($1::text[])`,
        [seededB],
      );
      if ((res.rowCount ?? 0) > 0) {
        violations.push(
          `${table}: tenant A was able to UPDATE ${res.rowCount} of tenant B's rows (expected 0)`,
        );
      }
    } finally {
      await role.query("ROLLBACK");
    }
  }

  return violations;
}

/** One tenant's worth of parent fixtures, shared by every per-table seeder below. */
interface World {
  tenantId: string;
  userId: string;
  projectId: string;
  workflowId: string;
  pageId: string;
  stepId: string;
  sectionId: string;
  organizationId: string;
  teamId: string;
  collectionId: string;
  databaseId: string;
  tableId: string;
  columnId: string;
  rowId: string;
  runId: string;
}

async function buildWorld(label: "A" | "B"): Promise<World> {
  const db = getOwnerDb();
  const factory = new TestFactory();

  const { tenant, user, project } = await factory.createTenant({
    tenant: { name: `RLS10 Tenant ${label} ${RUN}` },
  });
  // Deliberately private (default isPublic=false/status='draft') — ruling 2
  // (RLS-10) requires the matrix fixtures to NOT hit the public-workflow
  // escape, which is pinned separately below with its own fixture.
  const { workflow } = await factory.createWorkflow(project.id, user.id, {
    workflow: { title: `RLS10 Workflow ${label}` },
  });
  const page = await factory.createPage(workflow.id);
  const step = await factory.createStep(page.id);

  const [section] = await db.insert(schema.sections).values({
    workflowId: workflow.id,
    title: `RLS10 Section ${label}`,
  }).returning();

  const [organization] = await db.insert(schema.organizations).values({
    tenantId: tenant.id,
    name: `RLS10 Org ${label}`,
    slug: `rls10-org-${label.toLowerCase()}-${RUN}`,
    createdByUserId: user.id,
  }).returning();

  const [team] = await db.insert(schema.teams).values({
    tenantId: tenant.id,
    name: `RLS10 Team ${label}`,
  }).returning();

  const collection = await factory.createCollection(tenant.id, user.id);

  const database = await factory.createDatabase(project.id, tenant.id, user.id);
  // createTable's own insert omits tenantId (datavault_tables.tenant_id is
  // NOT NULL) — every other caller in this repo passes it explicitly via
  // overrides too (see tests/integration/preview.isolation.test.ts).
  const table = await factory.createTable(database.id, user.id, { tenantId: tenant.id });

  const [column] = await db.insert(schema.datavaultColumns).values({
    tableId: table.id,
    name: "Name",
    slug: "name",
    type: "text",
  }).returning();

  const [row] = await db.insert(schema.datavaultRows).values({
    tableId: table.id,
    createdBy: user.id,
  }).returning();

  const [run] = await db.insert(schema.workflowRuns).values({
    workflowId: workflow.id,
    runToken: `rls10-run-token-${label}-${RUN}`,
    executionMode: "live",
  }).returning();

  return {
    tenantId: tenant.id,
    userId: user.id,
    projectId: project.id,
    workflowId: workflow.id,
    pageId: page.id,
    stepId: step.id,
    sectionId: section.id,
    organizationId: organization.id,
    teamId: team.id,
    collectionId: collection.id,
    databaseId: database.id,
    tableId: table.id,
    columnId: column.id,
    rowId: row.id,
    runId: run.id,
  };
}

type Seeder = (world: World) => Promise<string[]>;

/**
 * How to seed ONE row for a given tenant's `World`, per policy-covered table.
 * Tables that are themselves part of the `World` (workflows, pages, steps,
 * sections, users, projects, organizations, teams, collections, the DataVault
 * database/table/column/row) just return the id `buildWorld` already created;
 * everything else inserts its own leaf row against that world's parents.
 *
 * Coverage is enforced by the AC1 test below via `listPolicyTables`, not by
 * this map alone — a table this map doesn't know about still fails the suite.
 */
const SEEDERS: Record<string, Seeder> = {
  workflows: async (w) => [w.workflowId],
  pages: async (w) => [w.pageId],
  steps: async (w) => [w.stepId],
  sections: async (w) => [w.sectionId],
  users: async (w) => [w.userId],
  projects: async (w) => [w.projectId],
  organizations: async (w) => [w.organizationId],
  teams: async (w) => [w.teamId],
  collections: async (w) => [w.collectionId],
  datavault_databases: async (w) => [w.databaseId],
  datavault_tables: async (w) => [w.tableId],
  datavault_columns: async (w) => [w.columnId],
  datavault_rows: async (w) => [w.rowId],

  ai_usage: async (w) => {
    const [row] = await getOwnerDb().insert(schema.aiUsage).values({
      tenantId: w.tenantId,
      provider: "openai",
      model: "rls10-test-model",
      inputTokens: 1,
      outputTokens: 1,
    }).returning({ id: schema.aiUsage.id });
    return [row.id];
  },

  audit_logs: async (w) => {
    const [row] = await getOwnerDb().insert(schema.auditLogs).values({
      tenantId: w.tenantId,
      userId: w.userId,
      action: "rls10.test",
      entityType: "test",
      entityId: "rls10",
    }).returning({ id: schema.auditLogs.id });
    return [row.id];
  },

  code_block_runs: async (w) => {
    const [row] = await getOwnerDb().insert(schema.codeBlockRuns).values({
      runId: w.runId,
      stepId: w.stepId,
      status: "fired",
    }).returning({ id: schema.codeBlockRuns.id });
    return [row.id];
  },

  collab_docs: async (w) => {
    const [row] = await getOwnerDb().insert(schema.collabDocs).values({
      workflowId: w.workflowId,
      tenantId: w.tenantId,
    }).returning({ id: schema.collabDocs.id });
    return [row.id];
  },

  connections: async (w) => {
    const [row] = await getOwnerDb().insert(schema.externalConnections).values({
      tenantId: w.tenantId,
      projectId: w.projectId,
      name: `RLS10 Connection ${w.tenantId}`,
      type: "api_key",
    }).returning({ id: schema.externalConnections.id });
    return [row.id];
  },

  datavault_api_tokens: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultApiTokens).values({
      databaseId: w.databaseId,
      tenantId: w.tenantId,
      label: "RLS10 token",
      tokenHash: `rls10-token-hash-${w.tenantId}`,
    }).returning({ id: schema.datavaultApiTokens.id });
    return [row.id];
  },

  datavault_number_sequences: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultNumberSequences).values({
      tenantId: w.tenantId,
      tableId: w.tableId,
      columnId: w.columnId,
    }).returning({ id: schema.datavaultNumberSequences.id });
    return [row.id];
  },

  datavault_row_notes: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultRowNotes).values({
      rowId: w.rowId,
      tenantId: w.tenantId,
      userId: w.userId,
      text: "RLS10 note",
    }).returning({ id: schema.datavaultRowNotes.id });
    return [row.id];
  },

  datavault_values: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultValues).values({
      rowId: w.rowId,
      columnId: w.columnId,
      value: { text: "RLS10 value" },
    }).returning({ id: schema.datavaultValues.id });
    return [row.id];
  },

  datavault_unique_keys: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultUniqueKeys).values({
      rowId: w.rowId,
      columnId: w.columnId,
      valueHash: Buffer.from(`rls10-${w.rowId}`),
    }).returning({ id: schema.datavaultUniqueKeys.id });
    return [row.id];
  },

  datavault_table_permissions: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultTablePermissions).values({
      tableId: w.tableId,
      userId: w.userId,
      role: "owner",
    }).returning({ id: schema.datavaultTablePermissions.id });
    return [row.id];
  },

  datavault_table_access: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultTableAccess).values({
      tableId: w.tableId,
      principalType: "user",
      principalId: w.userId,
      role: "owner",
    }).returning({ id: schema.datavaultTableAccess.id });
    return [row.id];
  },

  datavault_database_access: async (w) => {
    const [row] = await getOwnerDb().insert(schema.datavaultDatabaseAccess).values({
      databaseId: w.databaseId,
      principalType: "user",
      principalId: w.userId,
      role: "owner",
    }).returning({ id: schema.datavaultDatabaseAccess.id });
    return [row.id];
  },

  external_destinations: async (w) => {
    const [row] = await getOwnerDb().insert(schema.externalDestinations).values({
      tenantId: w.tenantId,
      name: "RLS10 destination",
      type: "http",
      config: {},
    }).returning({ id: schema.externalDestinations.id });
    return [row.id];
  },

  metrics_events: async (w) => {
    const [row] = await getOwnerDb().insert(schema.metricsEvents).values({
      tenantId: w.tenantId,
      projectId: w.projectId,
      workflowId: w.workflowId,
      runId: w.runId,
      type: "run_started",
    }).returning({ id: schema.metricsEvents.id });
    return [row.id];
  },

  metrics_rollups: async (w) => {
    const [row] = await getOwnerDb().insert(schema.metricsRollups).values({
      tenantId: w.tenantId,
      projectId: w.projectId,
      workflowId: w.workflowId,
      bucketStart: new Date(),
      bucket: "1d",
    }).returning({ id: schema.metricsRollups.id });
    return [row.id];
  },

  records: async (w) => {
    const [row] = await getOwnerDb().insert(schema.records).values({
      tenantId: w.tenantId,
      collectionId: w.collectionId,
      createdBy: w.userId,
    }).returning({ id: schema.records.id });
    return [row.id];
  },

  review_tasks: async (w) => {
    const [row] = await getOwnerDb().insert(schema.reviewTasks).values({
      runId: w.runId,
      workflowId: w.workflowId,
      nodeId: "rls10-node",
      tenantId: w.tenantId,
      projectId: w.projectId,
    }).returning({ id: schema.reviewTasks.id });
    return [row.id];
  },

  run_document_deliveries: async (w) => {
    const [row] = await getOwnerDb().insert(schema.runDocumentDeliveries).values({
      runId: w.runId,
      workflowId: w.workflowId,
      tenantId: w.tenantId,
      destinationType: "http",
    }).returning({ id: schema.runDocumentDeliveries.id });
    return [row.id];
  },

  run_resume_links: async (w) => {
    const [row] = await getOwnerDb().insert(schema.runResumeLinks).values({
      tenantId: w.tenantId,
      runId: w.runId,
      tokenHash: `rls10-resume-${w.runId}`,
      recipientEmail: "rls10-resume@example.com",
      expiresAt: new Date(Date.now() + 86_400_000),
    }).returning({ id: schema.runResumeLinks.id });
    return [row.id];
  },

  signature_requests: async (w) => {
    const [row] = await getOwnerDb().insert(schema.signatureRequests).values({
      runId: w.runId,
      workflowId: w.workflowId,
      nodeId: "rls10-node",
      tenantId: w.tenantId,
      projectId: w.projectId,
      signerEmail: "rls10-signer@example.com",
      token: `rls10-sig-token-${w.runId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    }).returning({ id: schema.signatureRequests.id });
    return [row.id];
  },

  sli_configs: async (w) => {
    const [row] = await getOwnerDb().insert(schema.sliConfigs).values({
      tenantId: w.tenantId,
      projectId: w.projectId,
      workflowId: w.workflowId,
    }).returning({ id: schema.sliConfigs.id });
    return [row.id];
  },

  sli_windows: async (w) => {
    const [row] = await getOwnerDb().insert(schema.sliWindows).values({
      tenantId: w.tenantId,
      projectId: w.projectId,
      workflowId: w.workflowId,
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 3_600_000),
    }).returning({ id: schema.sliWindows.id });
    return [row.id];
  },

  tenant_domains: async (w) => {
    const [row] = await getOwnerDb().insert(schema.tenantDomains).values({
      tenantId: w.tenantId,
      domain: `rls10-${RUN}-${w.tenantId}.example.com`,
    }).returning({ id: schema.tenantDomains.id });
    return [row.id];
  },

  workflow_blueprints: async (w) => {
    const [row] = await getOwnerDb().insert(schema.workflowBlueprints).values({
      tenantId: w.tenantId,
      creatorId: w.userId,
      name: "RLS10 blueprint",
      graphJson: {},
    }).returning({ id: schema.workflowBlueprints.id });
    return [row.id];
  },
};

/** Target zero — every real policy table above has a seeder. See AC4. */
const SKIPPED: Record<string, string> = {};

const KNOWN_TABLES = Object.keys(SEEDERS);

describe("RLS-10: data-driven proof that every policy actually isolates", () => {
  let schema_ = "public";
  let appRole: Client;
  let worldA: World;
  let worldB: World;
  let policyTables: string[];
  const seeded = new Map<string, { a: string[]; b: string[] }>();

  let checkIsolation: (table: string, seededA: string[], seededB: string[]) => Promise<string[]>;

  beforeAll(async () => {
    schema_ = schemaName();
    await provisionAppRole(schema_);
    await assertRoleIsRestricted(ROLE);
    appRole = await connectAsAppRole(schema_);

    worldA = await buildWorld("A");
    worldB = await buildWorld("B");

    checkIsolation = (table, a, b) => checkIsolationImpl({
      role: appRole,
      connectFresh: () => connectAsAppRole(schema_),
      targetSchema: schema_,
      tenantAId: worldA.tenantId,
      tenantBId: worldB.tenantId,
    }, table, a, b);

    policyTables = await listPolicyTables(schema_);

    for (const table of KNOWN_TABLES) {
      const seeder = SEEDERS[table];
      const [a, b] = await Promise.all([seeder(worldA), seeder(worldB)]);
      seeded.set(table, { a, b });
    }
  }, 120_000);

  afterAll(async () => {
    if (appRole) {
      await appRole.end();
    }
    // Best-effort: tenant deletion cascades almost everything (RLS-10 fixtures
    // are otherwise deliberately left in place, like every other RLS suite —
    // "other files in the same worker schema leave rows behind" is why
    // checkIsolation always intersects with its OWN seeded keys).
    try {
      await getOwnerDb().execute(sql`DELETE FROM tenants WHERE id IN (${worldA.tenantId}, ${worldB.tenantId})`);
    } catch {
      /* best effort */
    }
  });

  // AC1 + AC4: coverage is driven by the catalog, not by SEEDERS/SKIPPED.
  it("every policy-bearing table has a seeder or a documented SKIPPED reason", () => {
    const uncovered = policyTables.filter((t) => !(t in SEEDERS) && !(t in SKIPPED));
    expect(uncovered).toEqual([]);
  });

  it("SKIPPED is empty (target zero)", () => {
    expect(Object.keys(SKIPPED)).toEqual([]);
  });

  // AC2: all five matrix conditions, per table, via checkIsolation.
  describe.each(KNOWN_TABLES)("policy table: %s", (table) => {
    it("has no isolation violations across the 5-condition matrix", async () => {
      const fixtures = seeded.get(table);
      if (!fixtures) {
        throw new Error(`no fixtures were seeded for "${table}" — check SEEDERS/beforeAll wiring`);
      }
      const violations = await checkIsolation(table, fixtures.a, fixtures.b);
      expect(violations).toEqual([]);
    });
  });

  // AC3: checkIsolation is proven non-vacuous, on a probe table this test owns.
  describe("checkIsolation is non-vacuous (AC3)", () => {
    it("returns [] for a correct policy, a cross-tenant violation for USING(true), and an own-rows violation once the policy is dropped", async () => {
      const probeTable = `rls10_probe_${schema_}`;
      const qualified = `"${schema_}"."${probeTable}"`;

      try {
        await getOwnerDb().execute(sql.raw(`
          CREATE TABLE ${qualified} (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL
          )
        `));
        await getOwnerDb().execute(sql.raw(`ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`));
        await getOwnerDb().execute(sql.raw(`ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY`));
        await getOwnerDb().execute(sql.raw(
          `CREATE POLICY tenant_isolation ON ${qualified} `
          + `USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) `
          + `WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)`,
        ));
        await getOwnerDb().execute(sql.raw(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qualified} TO "${ROLE}"`,
        ));

        const insertedA = rows(await getOwnerDb().execute(
          sql`INSERT INTO ${sql.raw(qualified)} (tenant_id) VALUES (${worldA.tenantId}) RETURNING id`,
        ));
        const insertedB = rows(await getOwnerDb().execute(
          sql`INSERT INTO ${sql.raw(qualified)} (tenant_id) VALUES (${worldB.tenantId}) RETURNING id`,
        ));
        const probeA = String(insertedA[0]?.id);
        const probeB = String(insertedB[0]?.id);

        // Correct policy: no violations.
        const clean = await checkIsolation(probeTable, [probeA], [probeB]);
        expect(clean).toEqual([]);

        // Replace with USING(true): a cross-tenant leak must be reported.
        await getOwnerDb().execute(sql.raw(`DROP POLICY tenant_isolation ON ${qualified}`));
        await getOwnerDb().execute(sql.raw(
          `CREATE POLICY tenant_isolation ON ${qualified} USING (true) WITH CHECK (true)`,
        ));
        const leaking = await checkIsolation(probeTable, [probeA], [probeB]);
        expect(leaking.some((v) => v.includes("cross-tenant leak"))).toBe(true);

        // Drop the policy entirely: FORCE with no policy is default-deny, so
        // even tenant A loses its OWN row — a distinct failure shape.
        await getOwnerDb().execute(sql.raw(`DROP POLICY tenant_isolation ON ${qualified}`));
        const denyAll = await checkIsolation(probeTable, [probeA], [probeB]);
        expect(denyAll.some((v) => v.includes("cannot see its own rows"))).toBe(true);
      } finally {
        await getOwnerDb().execute(sql.raw(`DROP TABLE IF EXISTS ${qualified}`));
      }
    });
  });

  // AC5: the three deliberate rulings, pinned rather than "fixed".
  describe("pinned rulings (AC5)", () => {
    it("ruling 1: a NULL-tenant row is visible with no GUC and invisible once a tenant is pinned", async () => {
      const [auditRow] = await getOwnerDb().insert(schema.auditLogs).values({
        tenantId: null,
        action: "rls10.null-tenant",
        entityType: "test",
        entityId: "rls10-null",
      }).returning({ id: schema.auditLogs.id });

      const [projectRow] = await getOwnerDb().insert(schema.projects).values({
        tenantId: null,
        title: "RLS10 Null Project",
        creatorId: worldA.userId,
        ownerId: worldA.userId,
      }).returning({ id: schema.projects.id });

      const [userRow] = await getOwnerDb().insert(schema.users).values({
        tenantId: null,
        email: `rls10-null-${RUN}@example.com`,
      }).returning({ id: schema.users.id });

      const [blueprintRow] = await getOwnerDb().insert(schema.workflowBlueprints).values({
        tenantId: null,
        name: "RLS10 Null Blueprint",
        graphJson: {},
      }).returning({ id: schema.workflowBlueprints.id });

      const nullTenantFixtures: Record<string, string> = {
        audit_logs: auditRow.id,
        projects: projectRow.id,
        users: userRow.id,
        workflow_blueprints: blueprintRow.id,
      };

      for (const [table, id] of Object.entries(nullTenantFixtures)) {
        // A fresh connection, so "no GUC" means truly unset — on the shared one
        // it reads back as '' once the matrix has run (see checkIsolationImpl).
        const fresh = await connectAsAppRole(schema_);
        const visibleNoGuc = await fresh.query(
          `SELECT 1 FROM "${schema_}"."${table}" WHERE id::text = $1`,
          [id],
        ).finally(() => fresh.end());
        expect(visibleNoGuc.rowCount, `${table}: NULL-tenant row must be visible with no GUC pinned`).toBe(1);

        await appRole.query("BEGIN");
        await appRole.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [worldA.tenantId]);
        const visiblePinned = await appRole.query(
          `SELECT 1 FROM "${schema_}"."${table}" WHERE id::text = $1`,
          [id],
        );
        await appRole.query("ROLLBACK");
        expect(visiblePinned.rowCount, `${table}: NULL-tenant row must be invisible once a tenant is pinned`).toBe(0);
      }
    });

    it("ruling 2: a public, active workflow (and its page/step) is visible with no tenant GUC pinned", async () => {
      const factory = new TestFactory();
      const { workflow } = await factory.createWorkflow(worldA.projectId, worldA.userId, {
        workflow: { title: "RLS10 Public Workflow", isPublic: true, status: "active" },
      });
      const publicPage = await factory.createPage(workflow.id);
      const publicStep = await factory.createStep(publicPage.id);

      // A fresh connection, so "no tenant GUC" means truly unset (see checkIsolationImpl).
      const fresh = await connectAsAppRole(schema_);
      try {
        const wf = await fresh.query(`SELECT 1 FROM "${schema_}".workflows WHERE id = $1`, [workflow.id]);
        const pg = await fresh.query(`SELECT 1 FROM "${schema_}".pages WHERE id = $1`, [publicPage.id]);
        const st = await fresh.query(`SELECT 1 FROM "${schema_}".steps WHERE id = $1`, [publicStep.id]);

        expect(wf.rowCount).toBe(1);
        expect(pg.rowCount).toBe(1);
        expect(st.rowCount).toBe(1);
      } finally {
        await fresh.end();
      }
    });

    it("ruling 3: the restricted role is neither BYPASSRLS nor SUPERUSER", async () => {
      const res = await getOwnerDb().execute(sql.raw(
        `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${ROLE}'`,
      ));
      const row = rows(res)[0];
      expect(row?.rolbypassrls).toBe(false);
      expect(row?.rolsuper).toBe(false);
    });
  });
});

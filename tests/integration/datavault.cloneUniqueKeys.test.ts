import { randomUUID } from "crypto";

import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import { db } from "../../server/db";
import { createTestUser, setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

/**
 * DVH-5: cloning a workflow/project with DataVault data must backfill
 * `datavault_unique_keys` for the cloned unique/primary-key columns, or the
 * concurrent-insert race DVH-2 closed reopens for every value held by a
 * cloned row.
 */
describe.sequential("DataVault clone unique-key backfill (DVH-5)", () => {
  let ctx: IntegrationTestContext;
  let member: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "DVH-5 Clone Unique Keys",
      userRole: "admin",
      tenantRole: "owner",
    });
    member = await createTestUser(ctx, "builder");
    await getOwnerDb().insert(schema.organizationMemberships).values({
      orgId: ctx.orgId,
      userId: member.userId,
      role: "member",
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /**
   * Creates an org-owned project + workflow + DataVault database, scoped so
   * `WorkflowClonerService.collectRelatedDatavaultResources` picks the
   * database up via `scopeType: 'project'`. Callers add their own columns
   * and rows to the returned table.
   */
  async function createSourceProjectWithTable(tag: string): Promise<{
    projectId: string;
    tableId: string;
    tableName: string;
  }> {
    const suffix = `${tag}-${randomUUID()}`;

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: randomUUID(),
        title: `DVH-5 Source Project ${suffix}`,
        name: `DVH-5 Source Project ${suffix}`,
        tenantId: ctx.tenantId,
        creatorId: member.userId,
        createdBy: member.userId,
        ownerId: member.userId,
        ownerType: "org",
        ownerUuid: ctx.orgId,
        status: "active",
        archived: false,
      })
      .returning();

    const [workflow] = await db
      .insert(schema.workflows)
      .values({
        id: randomUUID(),
        projectId: project.id,
        title: `DVH-5 Source Workflow ${suffix}`,
        name: `DVH-5 Source Workflow ${suffix}`,
        creatorId: member.userId,
        ownerId: member.userId,
        ownerType: "org",
        ownerUuid: ctx.orgId,
        status: "active",
        isPublic: false,
        requireLogin: false,
        intakeConfig: {},
        settings: {},
      })
      .returning();

    await getOwnerDb().insert(schema.workflowVersions).values({
      id: randomUUID(),
      workflowId: workflow.id,
      versionNumber: 1,
      isDraft: false,
      graphJson: {},
      createdBy: member.userId,
      published: true,
    });

    const [database] = await db
      .insert(schema.datavaultDatabases)
      .values({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        name: `DVH-5 Database ${suffix}`,
        scopeType: "project",
        scopeId: project.id,
        ownerType: "org",
        ownerUuid: ctx.orgId,
      })
      .returning();

    const tableName = `DVH-5 Table ${suffix}`;
    const [table] = await db
      .insert(schema.datavaultTables)
      .values({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        ownerUserId: member.userId,
        databaseId: database.id,
        name: tableName,
        slug: `dvh5-table-${suffix}`,
        ownerType: "org",
        ownerUuid: ctx.orgId,
      })
      .returning();

    return { projectId: project.id, tableId: table.id, tableName };
  }

  async function addColumn(
    tableId: string,
    opts: { name: string; slug: string; isUnique?: boolean; isPrimaryKey?: boolean; orderIndex: number }
  ): Promise<string> {
    const [column] = await db
      .insert(schema.datavaultColumns)
      .values({
        id: randomUUID(),
        tableId,
        name: opts.name,
        slug: opts.slug,
        type: "text",
        isUnique: opts.isUnique ?? false,
        isPrimaryKey: opts.isPrimaryKey ?? false,
        orderIndex: opts.orderIndex,
      })
      .returning();
    return column.id;
  }

  async function addRow(
    tableId: string,
    values: Record<string, string>,
    opts: { deletedAt?: Date } = {}
  ): Promise<string> {
    const [row] = await db
      .insert(schema.datavaultRows)
      .values({
        id: randomUUID(),
        tableId,
        createdBy: member.userId,
        updatedBy: member.userId,
        deletedAt: opts.deletedAt ?? null,
      })
      .returning();

    for (const [columnId, value] of Object.entries(values)) {
      await getOwnerDb().insert(schema.datavaultValues).values({
        id: randomUUID(),
        rowId: row.id,
        columnId,
        value,
      });
    }

    return row.id;
  }

  function findClonedTable(ownerUuid: string, tableName: string) {
    return db
      .select()
      .from(schema.datavaultTables)
      .where(and(eq(schema.datavaultTables.ownerUuid, ownerUuid), eq(schema.datavaultTables.name, `dev_${tableName}`)));
  }

  it("Criterion 1 & 4: clone produces one unique-key row per live cloned value, and a duplicate insert is rejected by the constraint", async () => {
    const { projectId, tableId, tableName } = await createSourceProjectWithTable("c1c4");
    const uniqueColumnId = await addColumn(tableId, { name: "Employee ID", slug: "employee-id", isUnique: true, orderIndex: 1 });
    await addRow(tableId, { [uniqueColumnId]: "EMP-1" });
    await addRow(tableId, { [uniqueColumnId]: "EMP-2" });

    const copyRes = await request(ctx.baseURL)
      .post(`/api/projects/${projectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ includeRelatedDatavault: true, includeDatavaultData: true, clearAccess: true });
    expect(copyRes.status).toBe(201);
    expect(copyRes.body.data.copiedRows).toBe(2);

    const [clonedTable] = await findClonedTable(member.userId, tableName);
    expect(clonedTable).toBeDefined();

    const [clonedColumn] = await db
      .select()
      .from(schema.datavaultColumns)
      .where(and(eq(schema.datavaultColumns.tableId, clonedTable.id), eq(schema.datavaultColumns.slug, "employee-id")));
    expect(clonedColumn).toBeDefined();

    // Criterion 1: one key per live cloned value, asserted by querying the table directly.
    const keys = await db
      .select()
      .from(schema.datavaultUniqueKeys)
      .where(eq(schema.datavaultUniqueKeys.columnId, clonedColumn.id));
    expect(keys).toHaveLength(2);

    const clonedRows = await db
      .select()
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.tableId, clonedTable.id));
    expect(clonedRows).toHaveLength(2);
    const clonedRowIds = new Set(clonedRows.map((row) => row.id));
    for (const key of keys) {
      expect(clonedRowIds.has(key.rowId)).toBe(true);
    }

    // Criterion 4: the key already exists in the DB (proven above) *before* we
    // ever attempt the duplicate insert, and the duplicate is rejected by the
    // service (which is itself backed by the constraint DVH-2 added).
    const dupRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${clonedTable.id}/rows`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ values: { [clonedColumn.id]: "EMP-1" } });
    expect(dupRes.status).toBe(409);

    // The rejected duplicate did not add a second key for the same value.
    const keysAfterDup = await db
      .select()
      .from(schema.datavaultUniqueKeys)
      .where(eq(schema.datavaultUniqueKeys.columnId, clonedColumn.id));
    expect(keysAfterDup).toHaveLength(2);
  });

  it("Criterion 2: cloning without data adds no keys and does not error", async () => {
    const { projectId, tableId, tableName } = await createSourceProjectWithTable("c2");
    const uniqueColumnId = await addColumn(tableId, { name: "Code", slug: "code", isUnique: true, orderIndex: 1 });
    await addRow(tableId, { [uniqueColumnId]: "CODE-1" });

    const copyRes = await request(ctx.baseURL)
      .post(`/api/projects/${projectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ includeRelatedDatavault: true, includeDatavaultData: false, clearAccess: true });
    expect(copyRes.status).toBe(201);
    expect(copyRes.body.data.copiedRows).toBe(0);

    const [clonedTable] = await findClonedTable(member.userId, tableName);
    expect(clonedTable).toBeDefined();

    const [clonedColumn] = await db
      .select()
      .from(schema.datavaultColumns)
      .where(and(eq(schema.datavaultColumns.tableId, clonedTable.id), eq(schema.datavaultColumns.slug, "code")));
    expect(clonedColumn).toBeDefined();

    const keys = await db
      .select()
      .from(schema.datavaultUniqueKeys)
      .where(eq(schema.datavaultUniqueKeys.columnId, clonedColumn.id));
    expect(keys).toHaveLength(0);
  });

  it("Criterion 3: a primary-key-only column (isUnique false) is also backfilled", async () => {
    const { projectId, tableId, tableName } = await createSourceProjectWithTable("c3");
    const pkColumnId = await addColumn(tableId, { name: "Serial", slug: "serial", isUnique: false, isPrimaryKey: true, orderIndex: 1 });
    await addRow(tableId, { [pkColumnId]: "SER-1" });
    await addRow(tableId, { [pkColumnId]: "SER-2" });

    const copyRes = await request(ctx.baseURL)
      .post(`/api/projects/${projectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ includeRelatedDatavault: true, includeDatavaultData: true, clearAccess: true });
    expect(copyRes.status).toBe(201);

    const [clonedTable] = await findClonedTable(member.userId, tableName);
    expect(clonedTable).toBeDefined();

    const [clonedColumn] = await db
      .select()
      .from(schema.datavaultColumns)
      .where(and(eq(schema.datavaultColumns.tableId, clonedTable.id), eq(schema.datavaultColumns.slug, "serial")));
    expect(clonedColumn).toBeDefined();
    expect(clonedColumn.isPrimaryKey).toBe(true);
    expect(clonedColumn.isUnique).toBe(false);

    const keys = await db
      .select()
      .from(schema.datavaultUniqueKeys)
      .where(eq(schema.datavaultUniqueKeys.columnId, clonedColumn.id));
    expect(keys).toHaveLength(2);
  });

  it("Criterion 5: archived source rows are not cloned, so they get no keys in the clone", async () => {
    const { projectId, tableId, tableName } = await createSourceProjectWithTable("c5");
    const uniqueColumnId = await addColumn(tableId, { name: "Ticket", slug: "ticket", isUnique: true, orderIndex: 1 });
    await addRow(tableId, { [uniqueColumnId]: "LIVE-1" });
    await addRow(tableId, { [uniqueColumnId]: "ARCHIVED-1" }, { deletedAt: new Date() });

    const copyRes = await request(ctx.baseURL)
      .post(`/api/projects/${projectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ includeRelatedDatavault: true, includeDatavaultData: true, clearAccess: true });
    expect(copyRes.status).toBe(201);
    // copyDatavaultRows selects source rows with `isNull(deletedAt)` only, so
    // the archived row is not cloned at all.
    expect(copyRes.body.data.copiedRows).toBe(1);

    const [clonedTable] = await findClonedTable(member.userId, tableName);
    expect(clonedTable).toBeDefined();

    const clonedRows = await db
      .select()
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.tableId, clonedTable.id));
    expect(clonedRows).toHaveLength(1);

    const [clonedColumn] = await db
      .select()
      .from(schema.datavaultColumns)
      .where(and(eq(schema.datavaultColumns.tableId, clonedTable.id), eq(schema.datavaultColumns.slug, "ticket")));

    const keys = await db
      .select()
      .from(schema.datavaultUniqueKeys)
      .where(eq(schema.datavaultUniqueKeys.columnId, clonedColumn.id));
    expect(keys).toHaveLength(1);
    expect(keys[0].rowId).toBe(clonedRows[0].id);
  });

  it("Criterion 6: the backfill runs inside the clone's existing transaction, so a failure rolls back the whole clone", async () => {
    const { projectId, tableId, tableName } = await createSourceProjectWithTable("c6");
    const cleanColumnId = await addColumn(tableId, { name: "Clean", slug: "clean", isUnique: true, orderIndex: 1 });
    const dirtyColumnId = await addColumn(tableId, { name: "Dirty", slug: "dirty", isUnique: true, orderIndex: 2 });

    // A valid unique column, cloned cleanly.
    await addRow(tableId, { [cleanColumnId]: "CLEAN-1" });

    // Two live rows sharing the same value on a *second* unique column. This
    // is not reachable through the app's own write paths (assertUniqueValues
    // plus the datavault_unique_keys constraint both block it) -- it is
    // written directly to simulate corrupted source data and force
    // populateUniqueKeysForColumn's INSERT ... SELECT (no ON CONFLICT, by
    // design per DVH-2) to hit a real 23505 on the clone side.
    await addRow(tableId, { [dirtyColumnId]: "DUP" });
    await addRow(tableId, { [dirtyColumnId]: "DUP" });

    const copyRes = await request(ctx.baseURL)
      .post(`/api/projects/${projectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ includeRelatedDatavault: true, includeDatavaultData: true, clearAccess: true });

    expect(copyRes.status).toBe(500);

    // Nothing from this clone attempt survived: not the table, not the rows,
    // not the keys for the *other*, perfectly valid unique column.
    const clonedTables = await findClonedTable(member.userId, tableName);
    expect(clonedTables).toHaveLength(0);
  });
});

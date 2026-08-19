/**
 * RLS-2b vertical proof for the DataVault cluster (DatavaultApiTokensService,
 * DatavaultColumnsService, DatavaultDatabasesService, DatavaultRowNotesService,
 * DatavaultRowsService, DatavaultTablePermissionsService, DatavaultTablesService).
 *
 * AC5 requires, per cluster, at least one multi-repository service proving the
 * IDENTICAL transaction object reaches two repositories — same-tenant is not
 * the same claim as same-transaction (RLS-2a's own bar, copied here).
 * `DatavaultTablesService.createTable` is the natural pick: it always writes
 * to both `datavaultTablesRepository` (the table row) and
 * `datavaultColumnsRepository` (the auto-created primary-key column) in one
 * call, unconditionally.
 *
 * The fail-closed proof (AC4) for this cluster is the mocked-repo unit test
 * at tests/unit/services/rls2b-datavault.failClosed.test.ts — this file only
 * needs to prove the positive, real-database, real-transaction case, exactly
 * as rls2a-collectionService.test.ts split the two concerns.
 */
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db, initializeDatabase } from "../../server/db";
import { datavaultColumnsRepository, datavaultTablesRepository } from "../../server/repositories";
import { datavaultTablesService } from "../../server/services/DatavaultTablesService";
import { getCurrentTenantId, runWithTenantContext } from "../../server/utils/rlsContext";

function firstValue(result: unknown): unknown {
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>);
  return rows?.[0]?.t;
}

describe("RLS-2b DataVault cluster: service-boundary tenant transaction", () => {
  let tenantId: string;

  beforeAll(async () => {
    await initializeDatabase();
    const [tenant] = await db.insert(schema.tenants).values({
      name: `RLS-2b DataVault ${nanoid()}`,
      plan: "pro",
    }).returning();
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("AC5: DatavaultTablesService.createTable opens exactly one transaction for a call spanning two repositories", async () => {
    const seenTxs: unknown[] = [];
    const originalCreateTable = datavaultTablesRepository.create.bind(datavaultTablesRepository);
    const tableSpy = vi.spyOn(datavaultTablesRepository, "create").mockImplementation(async (data, tx) => {
      seenTxs.push(tx);
      return originalCreateTable(data, tx);
    });
    const originalCreateColumn = datavaultColumnsRepository.create.bind(datavaultColumnsRepository);
    const columnSpy = vi.spyOn(datavaultColumnsRepository, "create").mockImplementation(async (data, tx) => {
      seenTxs.push(tx);
      return originalCreateColumn(data, tx);
    });

    const table = await runWithTenantContext(tenantId, () =>
      datavaultTablesService.createTable({
        tenantId,
        name: `RLS-2b Table ${nanoid()}`,
      }));

    tableSpy.mockRestore();
    columnSpy.mockRestore();

    expect(table.tenantId).toBe(tenantId);
    expect(seenTxs).toHaveLength(2);
    expect(seenTxs[0]).toBeDefined();
    // The discriminating assertion: identical object reference, not merely
    // two transactions scoped to the same tenant.
    expect(seenTxs[0]).toBe(seenTxs[1]);

    await db.delete(schema.datavaultTables).where(eq(schema.datavaultTables.id, table.id));
  });

  it("AC1/AC4 half 1: the GUC set inside the transaction equals the caller's tenant", async () => {
    let observedGuc: unknown;
    const original = datavaultTablesRepository.create.bind(datavaultTablesRepository);
    const spy = vi.spyOn(datavaultTablesRepository, "create").mockImplementation(async (data, tx) => {
      if (tx) {
        const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
        observedGuc = firstValue(r);
      }
      return original(data, tx);
    });

    const table = await runWithTenantContext(tenantId, () =>
      datavaultTablesService.createTable({
        tenantId,
        name: `RLS-2b Table GUC ${nanoid()}`,
      }));

    spy.mockRestore();
    expect(observedGuc).toBe(tenantId);

    // AC4 half 2 — does not survive the transaction on the pool.
    const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
    const afterVal = firstValue(after);
    expect(afterVal === null || afterVal === "").toBe(true);

    await db.delete(schema.datavaultTables).where(eq(schema.datavaultTables.id, table.id));
  });

  it("the ambient-vs-argument tenant mismatch guard throws and never calls the repository", async () => {
    expect(getCurrentTenantId()).toBeUndefined();
    const otherTenantId = "00000000-0000-0000-0000-000000000000";
    const spy = vi.spyOn(datavaultTablesRepository, "create");

    await runWithTenantContext(tenantId, async () => {
      await expect(
        datavaultTablesService.createTable({ tenantId: otherTenantId, name: "Mismatch" })
      ).rejects.toThrow(/tenant mismatch/i);
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

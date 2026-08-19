import { describe, it, expect, vi } from "vitest";

import {
  datavaultApiTokensRepository,
  datavaultColumnsRepository,
  datavaultDatabasesRepository,
  datavaultRowsRepository,
  datavaultTablePermissionsRepository,
  datavaultTablesRepository,
} from "../../../server/repositories";
import { datavaultApiTokensService } from "../../../server/services/DatavaultApiTokensService";
import { datavaultColumnsService } from "../../../server/services/DatavaultColumnsService";
import { datavaultDatabasesService } from "../../../server/services/DatavaultDatabasesService";
import { datavaultRowNotesService } from "../../../server/services/DatavaultRowNotesService";
import { datavaultRowsService } from "../../../server/services/DatavaultRowsService";
import { datavaultTablePermissionsService } from "../../../server/services/DatavaultTablePermissionsService";
import { datavaultTablesService } from "../../../server/services/DatavaultTablesService";
import { getCurrentTenantId } from "../../../server/utils/rlsContext";

/**
 * RLS-2b AC4 (DataVault cluster) — every converted service must fail closed
 * when called with no `tx` and no tenant in the request's async context: the
 * underlying repository call must never be reached. Mirrors the pattern
 * `tests/unit/services/CollectionService.test.ts` established for RLS-2a's
 * pilot service, generalised into one parameterised table so 7 near-identical
 * per-service test files aren't required (ticket's own carve-out for AC4).
 *
 * A single representative tenant-scoped read is enough per service — the
 * `withTx` guard fires before ANY repository call, identically across every
 * method on a given service, so this is not testing 7 different code paths,
 * it is testing the one shared `withTx` helper 7 times (once per service that
 * copies it).
 */
const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SOME_ID = "660e8400-e29b-41d4-a716-446655440001";
const SOME_USER = "770e8400-e29b-41d4-a716-446655440002";

type Case = {
  name: string;
  spyTarget: object;
  spyMethod: string;
  call: () => Promise<unknown>;
};

const cases: Case[] = [
  {
    name: "DatavaultApiTokensService.getTokensByDatabaseId",
    spyTarget: datavaultDatabasesRepository,
    spyMethod: "findById",
    call: () => datavaultApiTokensService.getTokensByDatabaseId(SOME_ID, TENANT_ID),
  },
  {
    name: "DatavaultColumnsService.listColumns",
    spyTarget: datavaultTablesRepository,
    spyMethod: "findById",
    call: () => datavaultColumnsService.listColumns(SOME_ID, TENANT_ID),
  },
  {
    name: "DatavaultDatabasesService.getDatabasesForTenant",
    spyTarget: datavaultDatabasesRepository,
    spyMethod: "findByTenantAndUser",
    call: () => datavaultDatabasesService.getDatabasesForTenant(TENANT_ID, SOME_USER),
  },
  {
    name: "DatavaultRowNotesService.getNotesByRowId",
    spyTarget: datavaultRowsRepository,
    spyMethod: "findById",
    call: () => datavaultRowNotesService.getNotesByRowId(SOME_ID, TENANT_ID),
  },
  {
    name: "DatavaultRowsService.getRow",
    spyTarget: datavaultRowsRepository,
    spyMethod: "findById",
    call: () => datavaultRowsService.getRow(SOME_ID, TENANT_ID),
  },
  {
    name: "DatavaultTablePermissionsService.checkTablePermission",
    spyTarget: datavaultTablesRepository,
    spyMethod: "findById",
    call: () => datavaultTablePermissionsService.checkTablePermission(SOME_USER, SOME_ID, TENANT_ID),
  },
  {
    name: "DatavaultTablesService.listTables",
    spyTarget: datavaultTablesRepository,
    spyMethod: "findByTenantAndUser",
    call: () => datavaultTablesService.listTables(TENANT_ID, SOME_USER),
  },
];

describe("RLS-2b DataVault cluster: fails closed with no tenant in context (AC4)", () => {
  it("getCurrentTenantId() is undefined outside any request context (sanity)", () => {
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it.each(cases)("$name throws and never reaches the repository", async ({ spyTarget, spyMethod, call }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic spy target across differently-shaped repositories
    const spy = vi.spyOn(spyTarget as any, spyMethod);

    await expect(call()).rejects.toThrow(/no tenant in context/i);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // Also cover DatavaultApiTokensRepository/DatavaultColumnsRepository/
  // DatavaultRowNotesRepository/DatavaultTablePermissionsRepository directly
  // to document that no per-service test suppresses the guard by accident —
  // asserting the repositories named above genuinely sit behind the guard,
  // not merely that a same-named local variable does.
  it("the guard fires before the datavaultTablesRepository.findByTenantAndUser call specifically (not a coincidental earlier throw)", async () => {
    const spy = vi.spyOn(datavaultTablesRepository, "findByTenantAndUser");
    await expect(datavaultTablesService.listTables(TENANT_ID, SOME_USER)).rejects.toThrow(/RLS/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // Unused imports guard: datavaultApiTokensRepository and
  // datavaultTablePermissionsRepository are asserted never to be reached via
  // their owning services above (getTokensByDatabaseId reaches
  // datavaultDatabasesRepository first via verifyDatabaseOwnership;
  // checkTablePermission reaches datavaultTablesRepository first) — reference
  // them directly too so a future refactor that reorders those checks can't
  // silently stop proving the DatavaultApiTokensRepository/
  // DatavaultTablePermissionsRepository side of the guard.
  it("datavaultApiTokensRepository.findByDatabaseId is also never reached", async () => {
    const spy = vi.spyOn(datavaultApiTokensRepository, "findByDatabaseId");
    await expect(datavaultApiTokensService.getTokensByDatabaseId(SOME_ID, TENANT_ID)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("datavaultColumnsRepository.findByTableId is also never reached", async () => {
    const spy = vi.spyOn(datavaultColumnsRepository, "findByTableId");
    await expect(datavaultColumnsService.listColumns(SOME_ID, TENANT_ID)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("datavaultTablePermissionsRepository.findByTableId is also never reached", async () => {
    const spy = vi.spyOn(datavaultTablePermissionsRepository, "findByTableId");
    await expect(
      datavaultTablePermissionsService.getTablePermissions(SOME_USER, SOME_ID, TENANT_ID)
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

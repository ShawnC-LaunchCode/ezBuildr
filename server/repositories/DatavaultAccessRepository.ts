import { eq, and, inArray, or } from "drizzle-orm";

import {
  datavaultDatabaseAccess,
  datavaultTableAccess,
  type DatavaultDatabaseAccess,
  type DatavaultTableAccess,
  type InsertDatavaultDatabaseAccess,
  type InsertDatavaultTableAccess,
  type PrincipalType,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

export class DatavaultDatabaseAccessRepository extends BaseRepository<
  typeof datavaultDatabaseAccess,
  DatavaultDatabaseAccess,
  InsertDatavaultDatabaseAccess
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultDatabaseAccess, dbInstance);
  }

  async findByDatabaseId(databaseId: string, tx?: DbTransaction): Promise<DatavaultDatabaseAccess[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultDatabaseAccess)
      .where(eq(datavaultDatabaseAccess.databaseId, databaseId));
  }

  async findByDatabaseAndUser(
    databaseId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<DatavaultDatabaseAccess | undefined> {
    const database = this.getDb(tx);
    const [entry] = await database
      .select()
      .from(datavaultDatabaseAccess)
      .where(
        and(
          eq(datavaultDatabaseAccess.databaseId, databaseId),
          eq(datavaultDatabaseAccess.principalType, "user"),
          eq(datavaultDatabaseAccess.principalId, userId)
        )
      );
    return entry;
  }

  async findByDatabaseAndTeams(
    databaseId: string,
    teamIds: string[],
    tx?: DbTransaction
  ): Promise<DatavaultDatabaseAccess[]> {
    if (teamIds.length === 0) { return []; }
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultDatabaseAccess)
      .where(
        and(
          eq(datavaultDatabaseAccess.databaseId, databaseId),
          eq(datavaultDatabaseAccess.principalType, "team"),
          inArray(datavaultDatabaseAccess.principalId, teamIds)
        )
      );
  }

  async upsert(
    databaseId: string,
    principalType: PrincipalType,
    principalId: string,
    role: string,
    tx?: DbTransaction
  ): Promise<DatavaultDatabaseAccess> {
    const database = this.getDb(tx);
    const [entry] = await database
      .insert(datavaultDatabaseAccess)
      .values({ databaseId, principalType, principalId, role })
      .onConflictDoUpdate({
        target: [
          datavaultDatabaseAccess.databaseId,
          datavaultDatabaseAccess.principalType,
          datavaultDatabaseAccess.principalId,
        ],
        set: { role },
      })
      .returning();
    if (entry == null) { throw new Error("Failed to upsert database access"); }
    return entry;
  }

  async deleteManyByPrincipals(
    databaseId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    if (entries.length === 0) { return; }
    const database = this.getDb(tx);
    await database
      .delete(datavaultDatabaseAccess)
      .where(
        and(
          eq(datavaultDatabaseAccess.databaseId, databaseId),
          or(...entries.map((entry) =>
            and(
              eq(datavaultDatabaseAccess.principalType, entry.principalType),
              eq(datavaultDatabaseAccess.principalId, entry.principalId)
            )
          ))
        )
      );
  }
}

export class DatavaultTableAccessRepository extends BaseRepository<
  typeof datavaultTableAccess,
  DatavaultTableAccess,
  InsertDatavaultTableAccess
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultTableAccess, dbInstance);
  }

  async findByTableId(tableId: string, tx?: DbTransaction): Promise<DatavaultTableAccess[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTableAccess)
      .where(eq(datavaultTableAccess.tableId, tableId));
  }

  async findByTableAndUser(
    tableId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<DatavaultTableAccess | undefined> {
    const database = this.getDb(tx);
    const [entry] = await database
      .select()
      .from(datavaultTableAccess)
      .where(
        and(
          eq(datavaultTableAccess.tableId, tableId),
          eq(datavaultTableAccess.principalType, "user"),
          eq(datavaultTableAccess.principalId, userId)
        )
      );
    return entry;
  }

  async findByTableAndTeams(
    tableId: string,
    teamIds: string[],
    tx?: DbTransaction
  ): Promise<DatavaultTableAccess[]> {
    if (teamIds.length === 0) { return []; }
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTableAccess)
      .where(
        and(
          eq(datavaultTableAccess.tableId, tableId),
          eq(datavaultTableAccess.principalType, "team"),
          inArray(datavaultTableAccess.principalId, teamIds)
        )
      );
  }

  async upsert(
    tableId: string,
    principalType: PrincipalType,
    principalId: string,
    role: string,
    tx?: DbTransaction
  ): Promise<DatavaultTableAccess> {
    const database = this.getDb(tx);
    const [entry] = await database
      .insert(datavaultTableAccess)
      .values({ tableId, principalType, principalId, role })
      .onConflictDoUpdate({
        target: [
          datavaultTableAccess.tableId,
          datavaultTableAccess.principalType,
          datavaultTableAccess.principalId,
        ],
        set: { role },
      })
      .returning();
    if (entry == null) { throw new Error("Failed to upsert table access"); }
    return entry;
  }

  async deleteManyByPrincipals(
    tableId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    if (entries.length === 0) { return; }
    const database = this.getDb(tx);
    await database
      .delete(datavaultTableAccess)
      .where(
        and(
          eq(datavaultTableAccess.tableId, tableId),
          or(...entries.map((entry) =>
            and(
              eq(datavaultTableAccess.principalType, entry.principalType),
              eq(datavaultTableAccess.principalId, entry.principalId)
            )
          ))
        )
      );
  }
}

export const datavaultDatabaseAccessRepository = new DatavaultDatabaseAccessRepository();
export const datavaultTableAccessRepository = new DatavaultTableAccessRepository();

import { eq, and, or, isNull, gt } from "drizzle-orm";

import {
  datavaultApiTokens,
  type DatavaultApiToken,
  type InsertDatavaultApiToken,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for DataVault API tokens data access
 * Handles CRUD operations for API tokens used for external access
 */
export class DatavaultApiTokensRepository extends BaseRepository<
  typeof datavaultApiTokens,
  DatavaultApiToken,
  InsertDatavaultApiToken
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultApiTokens, dbInstance);
  }

  /**
   * Find all tokens for a specific database
   * Excludes the token hash for security
   */
  async findByDatabaseId(
    databaseId: string,
    tx?: DbTransaction
  ): Promise<Omit<DatavaultApiToken, 'tokenHash'>[]> {
    const database = this.getDb(tx);

    return database
      .select({
        id: datavaultApiTokens.id,
        databaseId: datavaultApiTokens.databaseId,
        tenantId: datavaultApiTokens.tenantId,
        label: datavaultApiTokens.label,
        scopes: datavaultApiTokens.scopes,
        createdAt: datavaultApiTokens.createdAt,
        expiresAt: datavaultApiTokens.expiresAt,
      })
      .from(datavaultApiTokens)
      .where(eq(datavaultApiTokens.databaseId, databaseId));
  }

  /**
   * Find a token by its hash (for authentication)
   * Returns null if token not found or expired
   */
  async findByTokenHash(
    tokenHash: string,
    tx?: DbTransaction
  ): Promise<DatavaultApiToken | null> {
    const database = this.getDb(tx);

    const [token] = await database
      .select()
      .from(datavaultApiTokens)
      .where(
        and(
          eq(datavaultApiTokens.tokenHash, tokenHash),
          // Token is not expired (either no expiry or expiry in future)
          or(
            isNull(datavaultApiTokens.expiresAt),
            gt(datavaultApiTokens.expiresAt, new Date())
          )
        )
      );

    return token || null;
  }

  async createToken(
    data: InsertDatavaultApiToken,
    tx?: DbTransaction
  ): Promise<DatavaultApiToken> {
    return this.create(data, tx);
  }

  /**
   * Delete a token by ID (revoke)
   */
  async deleteToken(tokenId: string, tx?: DbTransaction): Promise<void> {
    await this.delete(tokenId, tx);
  }

  /**
   * Find a token by ID with tenant and database verification
   */
  async findByIdWithAuth(
    tokenId: string,
    tenantId: string,
    databaseId: string,
    tx?: DbTransaction
  ): Promise<DatavaultApiToken | undefined> {
    const database = this.getDb(tx);

    const [token] = await database
      .select()
      .from(datavaultApiTokens)
      .where(
        and(
          eq(datavaultApiTokens.id, tokenId),
          eq(datavaultApiTokens.tenantId, tenantId),
          eq(datavaultApiTokens.databaseId, databaseId)
        )
      );

    return token;
  }

  /**
   * Delete all tokens for a specific database
   * Used when database is deleted (though cascade should handle this)
   */
  async deleteByDatabaseId(databaseId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultApiTokens)
      .where(eq(datavaultApiTokens.databaseId, databaseId));
  }

  /**
   * Check if a token hash already exists (for uniqueness)
   */
  async tokenHashExists(tokenHash: string, tx?: DbTransaction): Promise<boolean> {
    const database = this.getDb(tx);

    const [result] = await database
      .select({ id: datavaultApiTokens.id })
      .from(datavaultApiTokens)
      .where(eq(datavaultApiTokens.tokenHash, tokenHash))
      .limit(1);

    return !!result;
  }
}

// Singleton instance
export const datavaultApiTokensRepository = new DatavaultApiTokensRepository();

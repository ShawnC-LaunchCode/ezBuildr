import type { DatavaultApiToken, InsertDatavaultApiToken } from "@shared/schema";

import {
  datavaultApiTokensRepository,
  datavaultDatabasesRepository,
  type DbTransaction,
} from "../repositories";
import { generateApiToken, hashToken } from "../utils/encryption";

/**
 * Service layer for DataVault API tokens business logic
 * Handles API token generation, validation, and management
 */
export class DatavaultApiTokensService {
  private tokensRepo: typeof datavaultApiTokensRepository;
  private databasesRepo: typeof datavaultDatabasesRepository;

  constructor(
    tokensRepo?: typeof datavaultApiTokensRepository,
    databasesRepo?: typeof datavaultDatabasesRepository
  ) {
    this.tokensRepo = tokensRepo || datavaultApiTokensRepository;
    this.databasesRepo = databasesRepo || datavaultDatabasesRepository;
  }

  /**
   * Verify database belongs to tenant
   */
  private async verifyDatabaseOwnership(
    databaseId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = await this.databasesRepo.findById(databaseId, tx);

    if (!database) {
      throw new Error("Database not found");
    }

    if (database.tenantId !== tenantId) {
      throw new Error("Access denied - database belongs to different tenant");
    }
  }

  /**
   * Validate scopes array
   */
  private validateScopes(scopes: string[]): void {
    const validScopes = ['read', 'write'];

    if (!scopes || scopes.length === 0) {
      throw new Error("At least one scope is required");
    }

    for (const scope of scopes) {
      if (!validScopes.includes(scope)) {
        throw new Error(`Invalid scope: ${scope}. Valid scopes are: ${validScopes.join(', ')}`);
      }
    }

    // Ensure no duplicates
    const uniqueScopes = new Set(scopes);
    if (uniqueScopes.size !== scopes.length) {
      throw new Error("Duplicate scopes are not allowed");
    }
  }

  /**
   * Get all tokens for a database
   * Returns tokens without the hash for security
   */
  async getTokensByDatabaseId(
    databaseId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Omit<DatavaultApiToken, 'tokenHash'>[]> {
    // Verify database belongs to tenant
    await this.verifyDatabaseOwnership(databaseId, tenantId, tx);

    // Get tokens (hash is excluded in repository method)
    return this.tokensRepo.findByDatabaseId(databaseId, tx);
  }

  /**
   * Create a new API token
   * Returns the plain token ONCE (never stored or returned again)
   */
  async createToken(
    databaseId: string,
    tenantId: string,
    label: string,
    scopes: string[],
    expiresAt?: Date,
    tx?: DbTransaction
  ): Promise<{ token: DatavaultApiToken; plainToken: string }> {
    // Verify database belongs to tenant
    await this.verifyDatabaseOwnership(databaseId, tenantId, tx);

    // Validate inputs
    if (!label || label.trim().length === 0) {
      throw new Error("Token label cannot be empty");
    }

    if (label.length > 255) {
      throw new Error("Token label is too long (max 255 characters)");
    }

    this.validateScopes(scopes);

    // Validate expiration date
    if (expiresAt && expiresAt < new Date()) {
      throw new Error("Expiration date must be in the future");
    }

    // Generate a secure random token
    const plainToken = generateApiToken();

    // Hash the token for storage
    const tokenHash = hashToken(plainToken);

    // Check if hash already exists (extremely unlikely but possible)
    const hashExists = await this.tokensRepo.tokenHashExists(tokenHash, tx);
    if (hashExists) {
      // Regenerate token (collision, extremely rare)
      return this.createToken(databaseId, tenantId, label, scopes, expiresAt, tx);
    }

    // Create token record
    const token = await this.tokensRepo.createToken(
      {
        databaseId,
        tenantId,
        label: label.trim(),
        tokenHash,
        scopes,
        expiresAt: expiresAt || null,
      },
      tx
    );

    // Return both the token record and the plain token
    return { token, plainToken };
  }

  /**
   * Delete (revoke) a token
   */
  async deleteToken(
    tokenId: string,
    tenantId: string,
    databaseId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify database belongs to tenant
    await this.verifyDatabaseOwnership(databaseId, tenantId, tx);

    // Verify token exists and belongs to this database/tenant
    const token = await this.tokensRepo.findByIdWithAuth(tokenId, tenantId, databaseId, tx);

    if (!token) {
      throw new Error("Token not found or access denied");
    }

    // Delete token
    await this.tokensRepo.deleteToken(tokenId, tx);
  }

  /**
   * Validate a token for authentication
   * Returns token details if valid, null otherwise
   */
  async validateToken(
    plainToken: string,
    tx?: DbTransaction
  ): Promise<DatavaultApiToken | null> {
    if (!plainToken) {
      return null;
    }

    // Hash the provided token
    const tokenHash = hashToken(plainToken);

    // Find token by hash (repository checks expiration)
    return this.tokensRepo.findByTokenHash(tokenHash, tx);
  }

  /**
   * Check if a token has a specific scope
   */
  hasScope(token: DatavaultApiToken, requiredScope: string): boolean {
    return token.scopes.includes(requiredScope);
  }

  /**
   * Delete all tokens for a database
   * Used when database is deleted
   */
  async deleteTokensByDatabaseId(
    databaseId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify database belongs to tenant
    await this.verifyDatabaseOwnership(databaseId, tenantId, tx);

    // Delete all tokens
    await this.tokensRepo.deleteByDatabaseId(databaseId, tx);
  }
}

// Singleton instance
export const datavaultApiTokensService = new DatavaultApiTokensService();

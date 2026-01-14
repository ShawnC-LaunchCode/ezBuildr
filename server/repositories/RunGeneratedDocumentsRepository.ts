import { eq } from "drizzle-orm";

import { runGeneratedDocuments, type RunGeneratedDocument, type InsertRunGeneratedDocument } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for run generated documents data access
 */
export class RunGeneratedDocumentsRepository extends BaseRepository<
  typeof runGeneratedDocuments,
  RunGeneratedDocument,
  InsertRunGeneratedDocument
> {
  constructor(dbInstance?: typeof db) {
    super(runGeneratedDocuments, dbInstance);
  }

  /**
   * Find all documents by run ID
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<RunGeneratedDocument[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(runGeneratedDocuments)
      .where(eq(runGeneratedDocuments.runId, runId))
      .orderBy(runGeneratedDocuments.createdAt);
  }

  /**
   * Create a new generated document record
   */
  async createDocument(data: InsertRunGeneratedDocument, tx?: DbTransaction): Promise<RunGeneratedDocument> {
    const database = this.getDb(tx);
    const [created] = await database.insert(runGeneratedDocuments).values(data).returning();
    return created;
  }

  /**
   * Delete all documents for a run (used when regenerating)
   */
  async deleteByRunId(runId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(runGeneratedDocuments).where(eq(runGeneratedDocuments.runId, runId));
  }
}

// Singleton instance
export const runGeneratedDocumentsRepository = new RunGeneratedDocumentsRepository();

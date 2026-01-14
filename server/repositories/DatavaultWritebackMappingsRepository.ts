import { eq, and } from "drizzle-orm";

import {
  datavaultWritebackMappings,
  type DatavaultWritebackMapping,
  type InsertDatavaultWritebackMapping,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for DataVault writeback mappings data access
 * Handles CRUD operations for workflow-to-datavault writeback configurations
 */
export class DatavaultWritebackMappingsRepository extends BaseRepository<
  typeof datavaultWritebackMappings,
  DatavaultWritebackMapping,
  InsertDatavaultWritebackMapping
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultWritebackMappings, dbInstance);
  }

  /**
   * Find all writeback mappings for a workflow
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<DatavaultWritebackMapping[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.workflowId, workflowId));
  }

  /**
   * Find all writeback mappings for a table
   */
  async findByTableId(tableId: string, tx?: DbTransaction): Promise<DatavaultWritebackMapping[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.tableId, tableId));
  }

  /**
   * Find a specific writeback mapping by workflow and table
   */
  async findByWorkflowAndTable(
    workflowId: string,
    tableId: string,
    tx?: DbTransaction
  ): Promise<DatavaultWritebackMapping | undefined> {
    const database = this.getDb(tx);
    const [mapping] = await database
      .select()
      .from(datavaultWritebackMappings)
      .where(
        and(
          eq(datavaultWritebackMappings.workflowId, workflowId),
          eq(datavaultWritebackMappings.tableId, tableId)
        )
      );

    return mapping;
  }

  /**
   * Find a writeback mapping by ID
   */
  async findById(id: string, tx?: DbTransaction): Promise<DatavaultWritebackMapping | undefined> {
    const database = this.getDb(tx);
    const [mapping] = await database
      .select()
      .from(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.id, id));

    return mapping;
  }

  /**
   * Update a writeback mapping
   */
  async update(
    id: string,
    data: Partial<InsertDatavaultWritebackMapping>,
    tx?: DbTransaction
  ): Promise<DatavaultWritebackMapping> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(datavaultWritebackMappings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(datavaultWritebackMappings.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete a writeback mapping by ID
   */
  async deleteById(id: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.id, id));
  }

  /**
   * Delete all writeback mappings for a workflow
   */
  async deleteByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.workflowId, workflowId));
  }

  /**
   * Delete all writeback mappings for a table
   */
  async deleteByTableId(tableId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultWritebackMappings)
      .where(eq(datavaultWritebackMappings.tableId, tableId));
  }
}

// Singleton instance
export const datavaultWritebackMappingsRepository = new DatavaultWritebackMappingsRepository();

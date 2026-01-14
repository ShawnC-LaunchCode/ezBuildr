import { eq, and, asc, isNull, or } from "drizzle-orm";

import {
  documentHooks,
  type DocumentHook,
  type InsertDocumentHook,
} from "@shared/schema";
import type { DocumentHookPhase } from "@shared/types/scripting";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for document hook data access
 */
export class DocumentHookRepository extends BaseRepository<
  typeof documentHooks,
  DocumentHook,
  InsertDocumentHook
> {
  constructor(dbInstance?: typeof db) {
    super(documentHooks, dbInstance);
  }

  /**
   * Find document hooks by workflow ID, ordered by execution order
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<DocumentHook[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(documentHooks)
      .where(eq(documentHooks.workflowId, workflowId))
      .orderBy(asc(documentHooks.order));
  }

  /**
   * Find enabled document hooks by workflow ID, ordered by execution order
   */
  async findEnabledByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<DocumentHook[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(documentHooks)
      .where(and(eq(documentHooks.workflowId, workflowId), eq(documentHooks.enabled, true)))
      .orderBy(asc(documentHooks.order));
  }

  /**
   * Find enabled document hooks by workflow ID and phase, ordered by execution order
   * Optionally filter by document ID
   */
  async findEnabledByPhase(
    workflowId: string,
    phase: DocumentHookPhase,
    documentId?: string | null,
    tx?: DbTransaction
  ): Promise<DocumentHook[]> {
    const database = this.getDb(tx);

    // Build conditions
    const conditions = [
      eq(documentHooks.workflowId, workflowId),
      eq(documentHooks.phase, phase),
      eq(documentHooks.enabled, true),
    ];

    // If documentId is provided, include both document-specific AND global hooks
    // If documentId is null, only include global hooks
    if (documentId) {
      // Include hooks that match the document OR are global (null finalBlockDocumentId)
      return database
        .select()
        .from(documentHooks)
        .where(
          and(
            ...conditions,
            or(
              eq(documentHooks.finalBlockDocumentId, documentId),
              isNull(documentHooks.finalBlockDocumentId)
            )
          )
        )
        .orderBy(asc(documentHooks.order));
    } else {
      // Only global hooks
      conditions.push(isNull(documentHooks.finalBlockDocumentId));
      return database
        .select()
        .from(documentHooks)
        .where(and(...conditions))
        .orderBy(asc(documentHooks.order));
    }
  }

  /**
   * Delete document hooks by workflow ID
   */
  async deleteByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(documentHooks).where(eq(documentHooks.workflowId, workflowId));
  }

  /**
   * Find document hook by ID and verify ownership
   */
  async findByIdWithWorkflow(hookId: string, tx?: DbTransaction): Promise<DocumentHook | null> {
    const database = this.getDb(tx);
    const hooks = await database
      .select()
      .from(documentHooks)
      .where(eq(documentHooks.id, hookId))
      .limit(1);

    return hooks[0] || null;
  }
}

// Singleton instance
export const documentHookRepository = new DocumentHookRepository();

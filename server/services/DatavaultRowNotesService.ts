
import DOMPurify from 'isomorphic-dompurify';

import type { DatavaultRowNote } from "@shared/schema";

import {
  datavaultRowNotesRepository,
  datavaultRowsRepository,
  datavaultTablesRepository,
  type DbTransaction,
} from "../repositories";
import { logger } from "../logger";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";
/**
 * Service layer for DataVault row notes business logic
 * Handles row-level comments/notes with tenant verification and sanitization
 *
 * RLS-2b: copies the service-boundary tenant transaction pattern from
 * CollectionService (RLS-2a) — see docs/architecture/TENANT_ISOLATION_RLS.md §2b.
 */
export class DatavaultRowNotesService {
  private notesRepo: typeof datavaultRowNotesRepository;
  private rowsRepo: typeof datavaultRowsRepository;
  private tablesRepo: typeof datavaultTablesRepository;
  constructor(
    notesRepo?: typeof datavaultRowNotesRepository,
    rowsRepo?: typeof datavaultRowsRepository,
    tablesRepo?: typeof datavaultTablesRepository
  ) {
    this.notesRepo = notesRepo ?? datavaultRowNotesRepository;
    this.rowsRepo = rowsRepo ?? datavaultRowsRepository;
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
  }

  /** See CollectionService.withTx (RLS-2a) — identical shape, copied per RLS-2b. */
  private async withTx<T>(
    expectedTenantId: string,
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    const ambientTenantId = getCurrentTenantId();
    if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
      throw new Error(
        `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
        `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
        `silently scoping to the wrong tenant.`
      );
    }
    return withCurrentTenant(fn);
  }
  /**
   * Verify row belongs to tenant
   * Returns the row's table ID for further checks
   */
  private async verifyRowOwnership(
    rowId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<string> {
    const row = await this.rowsRepo.findById(rowId, tx);
    if (!row) {
      throw new Error("Row not found");
    }
    // Verify the table belongs to the tenant
    const table = await this.tablesRepo.findById(row.tableId, tx);
    if (!table) {
      throw new Error("Table not found");
    }
    if (table.tenantId !== tenantId) {
      throw new Error("Access denied - row belongs to different tenant");
    }
    return row.tableId;
  }
  /**
   * Sanitize note text to prevent XSS attacks
   * Strips all HTML tags and dangerous content
   */
  private sanitizeText(text: string): string {
    // Strip all HTML tags - notes should be plain text only

    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }
  /**
   * Get all notes for a row
   * Returns notes ordered by creation time (newest first)
   */
  async getNotesByRowId(
    rowId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultRowNote[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify row belongs to tenant
      await this.verifyRowOwnership(rowId, tenantId, scopedTx);
      // Get notes
      return this.notesRepo.findByRowIdAndTenant(rowId, tenantId, scopedTx);
    });
  }
  /**
   * Create a new note
   */
  async createNote(
    rowId: string,
    tenantId: string,
    userId: string,
    text: string,
    tx?: DbTransaction
  ): Promise<DatavaultRowNote> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify row belongs to tenant
      await this.verifyRowOwnership(rowId, tenantId, scopedTx);
      // Sanitize text
      const sanitizedText = this.sanitizeText(text);
      if (!sanitizedText || sanitizedText.trim().length === 0) {
        throw new Error("Note text cannot be empty");
      }
      const note = await this.notesRepo.createNote(
        {
          rowId,
          tenantId,
          userId,
          text: sanitizedText,
        },
        scopedTx
      );

      logger.debug({ noteId: note.id, tenantId: note.tenantId, userId: note.userId }, "Created note");
      return note;
    });
  }
  /**
   * Delete a note
   * Only the note owner or table owner can delete
   */
  async deleteNote(
    noteId: string,
    tenantId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      // Find note with tenant verification
      const note = await this.notesRepo.findByIdAndTenant(noteId, tenantId, scopedTx);
      if (!note) {

        logger.warn({ noteId, tenantId }, "Delete note failed: note not found");
        throw new Error("Note not found");
      }
      // Verify row belongs to tenant (for table owner check)
      const tableId = await this.verifyRowOwnership(note.rowId, tenantId, scopedTx);
      // Check if user is the note owner
      const isNoteOwner = note.userId === userId;
      // Check if user is the table owner
      const table = await this.tablesRepo.findById(tableId, scopedTx);
      const isTableOwner = table?.ownerUserId === userId;
      if (!isNoteOwner && !isTableOwner) {
        throw new Error("Access denied - only note owner or table owner can delete");
      }
      // Delete note
      await this.notesRepo.deleteNote(noteId, scopedTx);
    });
  }
  /**
   * Get a single note by ID with tenant verification
   */
  async getNoteById(
    noteId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultRowNote | null> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const note = await this.notesRepo.findByIdAndTenant(noteId, tenantId, scopedTx);
      if (!note) {
        return null;
      }
      // Verify the row still belongs to this tenant
      await this.verifyRowOwnership(note.rowId, tenantId, scopedTx);
      return note;
    });
  }
  /**
   * Delete all notes for a row
   * Used when row is deleted (though cascade should handle this)
   */
  async deleteNotesByRowId(
    rowId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify row belongs to tenant
      await this.verifyRowOwnership(rowId, tenantId, scopedTx);
      // Delete all notes
      await this.notesRepo.deleteByRowId(rowId, scopedTx);
    });
  }
}
// Singleton instance
export const datavaultRowNotesService = new DatavaultRowNotesService();
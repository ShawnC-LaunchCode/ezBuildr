import { z } from 'zod';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultRowNotesService, datavaultRowsService, datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, ERROR_ROW_NOT_FOUND, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault row notes endpoints (v4 Micro-Phase 3)
 */
export function registerDatavaultRowNoteRoutes(app: Express): void {
  /**
   * GET /api/datavault/rows/:rowId/notes
   * Get all notes for a row
   */
  app.get('/api/datavault/rows/:rowId/notes', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { rowId } = req.params;
      const row = await datavaultRowsService.getRow(rowId, tenantId);
      if (!row) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, row.row.tableId, tenantId, 'read');
      const notes = await datavaultRowNotesService.getNotesByRowId(rowId, tenantId);
      res.json(notes);
    } catch (error) {
      logger.error({ error }, 'Error fetching row notes');
      const { status, message } = classifyRouteError(error, 'Failed to fetch notes');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/rows/:rowId/notes
   * Create a new note for a row
   * Body: { text: string }
   */
  app.post('/api/datavault/rows/:rowId/notes', createLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const row = await datavaultRowsService.getRow(rowId, tenantId);
      if (!row) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, row.row.tableId, tenantId, 'write');
      const schema = z.object({
        text: z.string()
          .min(1, { message: 'Note text cannot be empty' })
          .max(10000, { message: 'Note text is too long (max 10000 characters)' }),
      });
      const { text } = schema.parse(req.body);
      const note = await datavaultRowNotesService.createNote(rowId, tenantId, userId, text);
      res.status(201).json(note);
    } catch (error) {
      logger.error({ error }, 'Error creating row note');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to create note');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/notes/:noteId
   * Delete a note
   * Only the note owner or table owner may delete
   */
  app.delete('/api/datavault/notes/:noteId', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { noteId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const note = await datavaultRowNotesService.getNoteById(noteId, tenantId);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      const row = await datavaultRowsService.getRow(note.rowId, tenantId);
      if (row) {
        await datavaultTablesService.requirePermission(userId, row.row.tableId, tenantId, 'write');
      }
      await datavaultRowNotesService.deleteNote(noteId, tenantId, userId);
      res.json({ success: true, message: 'Note deleted successfully' });
    } catch (error) {
      logger.error({ error }, 'Error deleting row note');
      const { status, message } = classifyRouteError(error, 'Failed to delete note');
      res.status(status).json({ message });
    }
  }));
}

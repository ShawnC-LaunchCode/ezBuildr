/**
 * Documents API Routes
 * Handles document template listing for Final Block configuration
 *
 * This is a simplified endpoint for Prompt 9.
 * Full document management will be implemented in Prompt 10.
 *
 * @version 1.0.0 - Prompt 9 (Final Block)
 * @date December 2025
 */

import type { Express, Request, Response } from 'express';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { templates } from '@/../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../logger';

const logger = createLogger({ module: 'documents-routes' });

/**
 * Register document-related routes
 */
export function registerDocumentRoutes(app: Express): void {
  /**
   * GET /api/documents
   * List all document templates available to the user
   *
   * Query params:
   * - projectId (optional): Filter by project
   *
   * Returns:
   * [
   *   { id: string, name: string, type: string, uploadedAt: Date },
   *   ...
   * ]
   */
  app.get('/api/documents', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId } = req.query;

      // Build query
      let query = db.select({
        id: templates.id,
        name: templates.name,
        type: templates.type,
        uploadedAt: templates.createdAt,
        fileRef: templates.fileRef,
      }).from(templates);

      // Filter by project if specified
      if (projectId && typeof projectId === 'string') {
        query = query.where(eq(templates.projectId, projectId)) as any;
      }

      // Filter by user (templates they own or have access to)
      // TODO: Implement proper ACL based on project membership
      // query = query.where(eq(templates.userId, userId)) as any;

      const documents = await query;

      // Format response
      const formattedDocs = documents.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type || 'docx',
        uploadedAt: doc.uploadedAt,
        fileRef: doc.fileRef,
      }));

      logger.info({ count: formattedDocs.length, userId, projectId }, 'Fetched documents');

      res.json(formattedDocs);
    } catch (error) {
      logger.error({ error }, 'Error fetching documents');
      res.status(500).json({ message: 'Failed to fetch documents' });
    }
  });

  /**
   * GET /api/documents/:id
   * Get a single document template by ID
   *
   * Returns:
   * { id: string, name: string, type: string, uploadedAt: Date, ... }
   */
  app.get('/api/documents/:id', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { id } = req.params;

      const [document] = await db
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.id, id)
          )
        )
        .limit(1);

      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }

      logger.info({ documentId: id, userId }, 'Fetched document');

      res.json({
        id: document.id,
        name: document.name,
        type: document.type || 'docx',
        uploadedAt: document.uploadedAt,
        fileRef: document.fileRef,
        projectId: document.projectId,
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching document');
      res.status(500).json({ message: 'Failed to fetch document' });
    }
  });

  logger.info('Document routes registered');
}

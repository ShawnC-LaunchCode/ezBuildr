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
import { eq, and } from 'drizzle-orm';
import { templates } from '@/../../shared/schema';
import { db } from '../db';
import { createLogger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { aclService } from '../services/AclService';
import { asyncHandler } from '../utils/asyncHandler';
import type { Express, Request, Response } from 'express';
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
  app.get('/api/documents', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized - no user ID' });
        return;
      }
      const { projectId } = req.query;
      let filteredDocs: Array<{
        id: string;
        name: string;
        type: string | null;
        uploadedAt: Date | null;
        fileRef: string | null;
        projectId: string | null;
      }> = [];
      // If projectId is specified, verify user has access to that project
      if (projectId && typeof projectId === 'string') {
        const hasAccess = await aclService.hasProjectRole(userId, projectId, 'view');
        if (!hasAccess) {
          logger.warn({ userId, projectId }, 'User denied access to project documents');
          res.status(403).json({ message: 'Forbidden - insufficient permissions for this project' });
          return;
        }
        // Fetch only documents for the specified project (Dec 2025 - Security fix)
        filteredDocs = await db.select({
          id: templates.id,
          name: templates.name,
          type: templates.type,
          uploadedAt: templates.createdAt,
          fileRef: templates.fileRef,
          projectId: templates.projectId,
        }).from(templates)
          .where(eq(templates.projectId, projectId));
      } else {
        // No projectId specified - this is a security concern as it could expose documents
        // from other projects. We should require projectId for security.
        // Return empty array instead of all documents (Dec 2025 - Security fix)
        logger.warn({ userId }, 'GET /api/documents called without projectId - returning empty array for security');
        filteredDocs = [];
      }
      // Format response
      const formattedDocs = filteredDocs.map((doc) => ({
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
  }));
  /**
   * GET /api/documents/:id
   * Get a single document template by ID
   *
   * Returns:
   * { id: string, name: string, type: string, uploadedAt: Date, ... }
   */
  app.get('/api/documents/:id', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized - no user ID' });
        return;
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
        res.status(404).json({ message: 'Document not found' });
        return;
      }
      // Check ACL based on document's project
      if (document.projectId) {
        const hasAccess = await aclService.hasProjectRole(userId, document.projectId, 'view');
        if (!hasAccess) {
          logger.warn({ userId, projectId: document.projectId, documentId: id }, 'User denied access to document');
          res.status(403).json({ message: 'Forbidden - insufficient permissions for this document' });
          return;
        }
      }
      logger.info({ documentId: id, userId }, 'Fetched document');
      res.json({
        id: document.id,
        name: document.name,
        type: document.type || 'docx',
        uploadedAt: document.createdAt,
        fileRef: document.fileRef,
        projectId: document.projectId,
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching document');
      res.status(500).json({ message: 'Failed to fetch document' });
    }
  }));
  logger.info('Document routes registered');
}
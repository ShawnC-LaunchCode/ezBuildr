import { z } from "zod";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { pageRepository } from "../repositories/PageRepository";
import { pageService } from "../services/PageService";
import { asyncHandler } from "../utils/asyncHandler";
import { withCurrentTenant } from "../utils/rlsContext";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Request, Response, NextFunction } from "express";

const logger = createLogger({ module: "pages-routes" });

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

const createPageBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  order: z.number().int().optional(),
  config: z.unknown().optional(),
  visibleIf: z.unknown().optional(),
});

const updatePageBodySchema = createPageBodySchema.partial();

const reorderPagesBodySchema = z.object({
  pages: z.array(z.object({
    id: z.string().uuid(),
    order: z.number().int(),
    sectionId: z.string().uuid().nullable(),
  }).strict()),
  deleteEmptySectionIds: z.array(z.string().uuid()).default([]),
}).strict();

function sendPageRouteError(error: unknown, res: Response, fallback: string): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid input", errors: error.errors });
    return;
  }
  const { status, message } = classifyRouteError(error, fallback);
  res.status(status).json({ message });
}
/**
 * Middleware helper: Look up workflowId from pageId before auto-revert
 * This allows auto-revert to work on simplified endpoints (without workflowId in path)
 */
async function lookupWorkflowIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pageId } = req.params;
    if (!pageId) {
      return next();
    }
    // RLS-5: `pages` is RLS-covered via its parent workflow's
    // ownership-derived policy — read inside the tenant-scoped transaction.
    const page = await withCurrentTenant((tx) =>
      pageRepository.findById(pageId, tx));
    if (!page) {
      res.status(404).json({ message: "Page not found" });
      return;
    }

    req.params.workflowId = page.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdMiddleware");
    next(error);
  }
}

/**
 * Middleware helper: Look up workflowId from pageId before auto-revert,
 * for the restore route only. Must find the page even when soft-deleted
 * (ICW2-B1) — unlike `lookupWorkflowIdMiddleware`, which uses the filtered
 * `findById` and would 404 before the restore ever runs.
 */
async function lookupWorkflowIdFromPageIncludingDeletedMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pageId } = req.params;
    if (!pageId) {
      return next();
    }
    // Same reason as the sibling middleware above: `pages` is RLS-covered
    // through its workflow's ownership-derived policy.
    const page = await withCurrentTenant((tx) =>
      pageRepository.findByIdIncludingDeleted(pageId, tx));
    if (!page) {
      res.status(404).json({ message: "Page not found" });
      return;
    }

    req.params.workflowId = page.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromPageIncludingDeletedMiddleware");
    next(error);
  }
}

/**
 * Register page-related routes
 * Handles page CRUD operations and reordering
 */

export function registerPageRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/pages
   * Create a new page
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.post('/api/workflows/:workflowId/pages', hybridAuth, createLimiter, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const pageData = createPageBodySchema.parse(req.body);
      const page = await pageService.createPage(workflowId, userId, pageData);
      res.status(201).json(page);
    } catch (error) {
      logger.error({ error }, "Error creating page");
      sendPageRouteError(error, res, "Failed to create page");
    }
  }));

  /**
   * GET /api/workflows/:workflowId/pages
   * Get all pages for a workflow
   */
  app.get('/api/workflows/:workflowId/pages', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const pages = await pageService.getPages(workflowId, userId);
      res.json(pages);
    } catch (error) {
      logger.error({ error }, "Error fetching pages");
      const { status, message } = classifyRouteError(error, "Failed to fetch pages");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/pages/:pageId
   * Get a single page with steps
   */
  app.get('/api/workflows/:workflowId/pages/:pageId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      const page = await pageService.getPageWithSteps(pageId, workflowId, userId);
      res.json(page);
    } catch (error) {
      logger.error({ error }, "Error fetching page");
      const { status, message } = classifyRouteError(error, "Failed to fetch page");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/pages/reorder
   * Reorder pages
   * NOTE: This route MUST come before /:pageId routes to avoid "reorder" being treated as an ID
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/pages/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const { pages, deleteEmptySectionIds } = reorderPagesBodySchema.parse(req.body);
      logger.info({ pages, workflowId }, "Reordering pages");
      const { affectedSkipRules } = await pageService.reorderPages(
        workflowId,
        userId,
        pages,
        deleteEmptySectionIds,
      );
      res.status(200).json({ message: "Pages reordered successfully", affectedSkipRules });
    } catch (error) {
      logger.error({ error }, "Error reordering pages");
      sendPageRouteError(error, res, "Failed to reorder pages");
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/pages/:pageId
   * Update a page
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/pages/:pageId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      const updateData = updatePageBodySchema.parse(req.body);
      const page = await pageService.updatePage(pageId, workflowId, userId, updateData);
      res.json(page);
    } catch (error) {
      logger.error({ error }, "Error updating page");
      sendPageRouteError(error, res, "Failed to update page");
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId/pages/:pageId
   * Delete a page
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.delete('/api/workflows/:workflowId/pages/:pageId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      await pageService.deletePage(pageId, workflowId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting page");
      const { status, message } = classifyRouteError(error, "Failed to delete page");
      res.status(status).json({ message });
    }
  }));

  // ===================================================================
  // SIMPLIFIED PAGE ENDPOINTS (without workflowId in path)
  // These endpoints look up the workflow from the page automatically
  // ===================================================================

  /**
   * PUT /api/pages/:pageId
   * Update a page (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookupWorkflowIdMiddleware
  app.put('/api/pages/:pageId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const updateData = updatePageBodySchema.parse(req.body);
      const updatedPage = await pageService.updatePageById(pageId, userId, updateData);
      res.json(updatedPage);
    } catch (error) {
      logger.error({ error }, "Error updating page");
      sendPageRouteError(error, res, "Failed to update page");
    }
  }));

  /**
   * GET /api/pages/:pageId/delete-impact
   * Preview the answers/runs that would be permanently destroyed by
   * deleting this page, aggregated across all its steps (workflow
   * looked up automatically). Read-only — used to gate the client's
   * destructive-confirm dialog (ICW2-13).
   */
  app.get('/api/pages/:pageId/delete-impact', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const impact = await pageService.getPageDeleteImpactById(pageId, userId);
      res.json(impact);
    } catch (error) {
      logger.error({ error }, "Error fetching page delete impact");
      const { status, message } = classifyRouteError(error, "Failed to fetch page delete impact");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/pages/:pageId
   * Delete a page (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookupWorkflowIdMiddleware
  app.delete('/api/pages/:pageId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      await pageService.deletePageById(pageId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting page");
      const { status, message } = classifyRouteError(error, "Failed to delete page");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/pages/:pageId/duplicate
   * Duplicate a page, its steps (fresh aliases), and its page-scoped
   * logic rules (workflow looked up automatically). ICW2-B5.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookupWorkflowIdMiddleware
  app.post('/api/pages/:pageId/duplicate', hybridAuth, createLimiter, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const page = await pageService.duplicatePage(pageId, userId);
      res.status(201).json(page);
    } catch (error) {
      logger.error({ error }, "Error duplicating page");
      const { status, message } = classifyRouteError(error, "Failed to duplicate page");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/pages/:pageId/restore
   * Restore a previously soft-deleted page and its steps (workflow
   * looked up automatically). Requires edit access. Restore UI is deferred
   * — this is server-side only (ICW2-B1).
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.post('/api/pages/:pageId/restore', hybridAuth, createLimiter, lookupWorkflowIdFromPageIncludingDeletedMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const page = await pageService.restorePage(pageId, userId);
      res.json(page);
    } catch (error) {
      logger.error({ error }, "Error restoring page");
      const { status, message } = classifyRouteError(error, "Failed to restore page");
      res.status(status).json({ message });
    }
  }));
}

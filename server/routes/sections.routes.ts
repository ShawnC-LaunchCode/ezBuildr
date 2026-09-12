import { z } from "zod";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { sectionRepository } from "../repositories/SectionRepository";
import { sectionService } from "../services/SectionService";
import { asyncHandler } from "../utils/asyncHandler";
import { withCurrentTenant } from "../utils/rlsContext";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Response } from "express";

const logger = createLogger({ module: "sections-routes" });
const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

const createSectionBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  visibleIf: z.unknown().optional(),
  pageIds: z.array(z.string().uuid()).min(1),
}).strict();

const updateSectionBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  visibleIf: z.unknown().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: "At least one field is required",
});

const lookupWorkflowIdMiddleware = asyncHandler(async (req, res, next) => {
    const { sectionId } = req.params;
    if (!sectionId) {
      next();
      return;
    }
    const section = await withCurrentTenant((tx) =>
      sectionRepository.findById(sectionId, tx));
    if (!section) {
      res.status(404).json({ message: "Section not found" });
      return;
    }
    req.params.workflowId = section.workflowId;
    next();
});

function sendError(
  error: unknown,
  res: Response,
  fallback: string,
): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid input", errors: error.errors });
    return;
  }
  const { status, message } = classifyRouteError(error, fallback);
  res.status(status).json({ message });
}

export function registerSectionRoutes(app: Express): void {
  app.post("/api/workflows/:workflowId/sections", hybridAuth, createLimiter, asyncHandler(autoRevertToDraft), asyncHandler(async (req, res) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ message: UNAUTHORIZED_MSG });
        return;
      }
      const { workflowId } = req.params;
      const { pageIds, ...data } = createSectionBodySchema.parse(req.body);
      const section = await sectionService.createSection(workflowId, userId, data, pageIds);
      res.status(201).json(section);
    } catch (error) {
      logger.error({ error }, "Error creating Section");
      sendError(error, res, "Failed to create Section");
    }
  }));

  app.get("/api/workflows/:workflowId/sections", hybridAuth, asyncHandler(async (req, res) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ message: UNAUTHORIZED_MSG });
        return;
      }
      const sections = await sectionService.getSections(req.params.workflowId, userId);
      res.json(sections);
    } catch (error) {
      logger.error({ error }, "Error fetching Sections");
      sendError(error, res, "Failed to fetch Sections");
    }
  }));

  app.put("/api/sections/:sectionId", hybridAuth, lookupWorkflowIdMiddleware, asyncHandler(autoRevertToDraft), asyncHandler(async (req, res) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ message: UNAUTHORIZED_MSG });
        return;
      }
      const data = updateSectionBodySchema.parse(req.body);
      const section = await sectionService.updateSection(req.params.sectionId, userId, data);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error updating Section");
      sendError(error, res, "Failed to update Section");
    }
  }));

  app.delete("/api/sections/:sectionId", hybridAuth, lookupWorkflowIdMiddleware, asyncHandler(autoRevertToDraft), asyncHandler(async (req, res) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ message: UNAUTHORIZED_MSG });
        return;
      }
      await sectionService.deleteSection(req.params.sectionId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting Section");
      sendError(error, res, "Failed to delete Section");
    }
  }));
}

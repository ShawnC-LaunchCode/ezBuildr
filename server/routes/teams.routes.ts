import { z } from "zod";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { teamService } from "../services/TeamService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from '../utils/routeErrors';

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "teams-routes" });

// Validation schemas
const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(["member", "admin"]).default("member"),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

/**
 * Register team-related routes
 */
// eslint-disable-next-line max-lines-per-function
export function registerTeamRoutes(app: Express): void {
  /**
   * POST /api/teams
   * Create a new team (user becomes team admin)
   */
  app.post("/api/teams", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const data = createTeamSchema.parse(req.body);
      const team = await teamService.createTeam(data, userId);

      res.status(201).json({ success: true, data: team });
    } catch (error) {
      logger.error({ error }, "Error creating team");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to create team",
      });
    }
  }));

  /**
   * GET /api/teams
   * Get all teams for the authenticated user
   */
  app.get("/api/teams", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const teams = await teamService.getUserTeams(userId);

      res.json({ success: true, data: teams });
    } catch (error) {
      logger.error({ error }, "Error fetching teams");
      res.status(500).json({
        success: false,
        error: "Failed to fetch teams",
      });
    }
  }));

  /**
   * GET /api/teams/:id
   * Get team details with members
   */
  app.get("/api/teams/:id", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const { id } = req.params;

      const team = await teamService.getTeamWithMembers(id, userId);
      res.json({ success: true, data: team });
    } catch (error) {
      logger.error({ error }, "Error fetching team");

      const { status, message } = classifyRouteError(error, "Failed to fetch team");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/teams/:id
   * Update team details (admin only)
   */
  app.put("/api/teams/:id", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const { id } = req.params;

      const data = updateTeamSchema.parse(req.body);
      const team = await teamService.updateTeam(id, userId, data);

      res.json({ success: true, data: team });
    } catch (error) {
      logger.error({ error }, "Error updating team");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to update team");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/teams/:id
   * Delete a team (admin only)
   */
  app.delete("/api/teams/:id", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const { id } = req.params;

      await teamService.deleteTeam(id, userId);
      res.json({ success: true, message: "Team deleted successfully" });
    } catch (error) {
      logger.error({ error }, "Error deleting team");

      const { status, message } = classifyRouteError(error, "Failed to delete team");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * POST /api/teams/:id/members
   * Add or update a team member (admin only)
   */
  app.post("/api/teams/:id/members", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const requestorId = req.userId;
      if (!requestorId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const { id } = req.params;

      const data = addMemberSchema.parse(req.body);
      const member = await teamService.addOrUpdateMember(id, requestorId, data);

      res.status(201).json({ success: true, data: member });
    } catch (error) {
      logger.error({ error }, "Error adding team member");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to add team member");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/teams/:id/members/:userId
   * Remove a team member (admin only)
   */
  app.delete("/api/teams/:id/members/:userId", hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const requestorId = req.userId;
      if (!requestorId) {
        return res.status(401).json({ success: false, error: UNAUTHORIZED_MSG });
      }

      const { id, userId } = req.params;

      await teamService.removeMember(id, requestorId, userId);
      res.json({ success: true, message: "Team member removed successfully" });
    } catch (error) {
      logger.error({ error }, "Error removing team member");

      const { status, message } = classifyRouteError(error, "Failed to remove team member");
      res.status(status).json({ success: false, error: message });
    }
  }));
}

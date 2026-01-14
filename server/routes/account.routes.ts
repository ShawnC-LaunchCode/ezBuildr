import { z } from "zod";

import { logger } from "../logger";
import { hybridAuth } from '../middleware/auth';
import { requireUser, type UserRequest } from '../middleware/requireUser';
import { accountService } from "../services/AccountService";

import type { Express, Request, Response } from "express";

/**
 * Register account-related routes
 * Handles user account preferences including mode settings
 */
export function registerAccountRoutes(app: Express): void {
  /**
   * GET /api/account/preferences
   * Get account preferences including default mode
   */
  app.get('/api/account/preferences', hybridAuth, requireUser, async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      const preferences = await accountService.getPreferences(user.id);
      res.json({ success: true, data: preferences });
    } catch (error) {
      logger.error({ err: error }, "Error fetching account preferences");
      const message = error instanceof Error ? error.message : "Failed to fetch preferences";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/account/preferences
   * Update account preferences including default mode
   */
  app.put('/api/account/preferences', hybridAuth, requireUser, async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      // Validate request body
      const schema = z.object({
        defaultMode: z.enum(['easy', 'advanced']),
      });

      const preferences = schema.parse(req.body);
      const updated = await accountService.updatePreferences(user.id, preferences);

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error({ error }, "Error updating account preferences");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: error.errors
        });
      }

      const message = error instanceof Error ? error.message : "Failed to update preferences";
      const status = message.includes("not found") ? 404 :
                     message.includes("Invalid") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });
}

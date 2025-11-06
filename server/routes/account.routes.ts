import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { accountService } from "../services/AccountService";
import { z } from "zod";

/**
 * Register account-related routes
 * Handles user account preferences including mode settings
 */
export function registerAccountRoutes(app: Express): void {
  /**
   * GET /api/account/preferences
   * Get account preferences including default mode
   */
  app.get('/api/account/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const preferences = await accountService.getPreferences(userId);
      res.json({ success: true, data: preferences });
    } catch (error) {
      console.error("Error fetching account preferences:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch preferences";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/account/preferences
   * Update account preferences including default mode
   */
  app.put('/api/account/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      // Validate request body
      const schema = z.object({
        defaultMode: z.enum(['easy', 'advanced']),
      });

      const preferences = schema.parse(req.body);
      const updated = await accountService.updatePreferences(userId, preferences);

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error updating account preferences:", error);

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

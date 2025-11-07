import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { userPreferencesService } from "../services/UserPreferencesService";
import { createLogger } from "../logger";

const logger = createLogger({ module: "user-preferences-routes" });

/**
 * Register user preferences routes
 */
export function registerUserPreferencesRoutes(app: Express): void {
  /**
   * GET /api/preferences
   * Get current user's preferences
   */
  app.get('/api/preferences', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const prefs = await userPreferencesService.getByUserId(userId);
      res.json(prefs);
    } catch (error) {
      logger.error({ error }, "Error fetching user preferences");
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  /**
   * PUT /api/preferences
   * Update current user's preferences
   */
  app.put('/api/preferences', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const updates = req.body;
      const updated = await userPreferencesService.update(userId, updates);
      res.json(updated);
    } catch (error) {
      logger.error({ error }, "Error updating user preferences");
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  /**
   * POST /api/preferences/reset
   * Reset user's preferences to defaults
   */
  app.post('/api/preferences/reset', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const defaults = await userPreferencesService.reset(userId);
      res.json(defaults);
    } catch (error) {
      logger.error({ error }, "Error resetting user preferences");
      res.status(500).json({ message: "Failed to reset preferences" });
    }
  });
}

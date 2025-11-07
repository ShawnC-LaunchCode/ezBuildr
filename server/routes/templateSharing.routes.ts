import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { TemplateSharingService } from "../services/TemplateSharingService";

const sharingService = new TemplateSharingService();

/**
 * Register template sharing routes
 * Handles template collaboration and permission management
 */
export function registerTemplateSharingRoutes(app: Express): void {

  /**
   * GET /api/templates/:id/shares
   * List all shares for a template (owner/admin only)
   */
  app.get("/api/templates/:id/shares", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const shares = await sharingService.listShares(id, user);
      res.json(shares);
    } catch (error: any) {
      logger.error("Error listing shares:", error);
      if (error.message.includes("Unauthorized")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to list shares" });
    }
  });

  /**
   * POST /api/templates/:id/share
   * Share a template with a user (by userId or email)
   * Body: { userId?: string, email?: string, access: "use" | "edit" }
   */
  app.post("/api/templates/:id/share", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId, email, access } = req.body;
      const user = req.user;

      if (!access || !["use", "edit"].includes(access)) {
        return res.status(400).json({ error: "Invalid access level. Must be 'use' or 'edit'" });
      }

      if (!userId && !email) {
        return res.status(400).json({ error: "Must provide either userId or email" });
      }

      const share = await sharingService.shareWithUser(id, user, {
        userId,
        email,
        access,
      });

      res.json(share);
    } catch (error: any) {
      logger.error("Error sharing template:", error);
      if (error.message.includes("Unauthorized")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes("Cannot share")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to share template" });
    }
  });

  /**
   * PUT /api/template-shares/:shareId
   * Update access level for a share
   * Body: { access: "use" | "edit" }
   */
  app.put("/api/template-shares/:shareId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { shareId } = req.params;
      const { access } = req.body;
      const user = req.user;

      if (!access || !["use", "edit"].includes(access)) {
        return res.status(400).json({ error: "Invalid access level. Must be 'use' or 'edit'" });
      }

      const share = await sharingService.updateAccess(shareId, user, access);

      if (!share) {
        return res.status(404).json({ error: "Share not found" });
      }

      res.json(share);
    } catch (error: any) {
      logger.error("Error updating share access:", error);
      if (error.message.includes("Unauthorized")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update share access" });
    }
  });

  /**
   * DELETE /api/template-shares/:shareId
   * Revoke a share
   */
  app.delete("/api/template-shares/:shareId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { shareId } = req.params;
      const user = req.user;
      const success = await sharingService.revoke(shareId, user);

      if (success) {
        res.json({ ok: true });
      } else {
        res.status(404).json({ error: "Share not found" });
      }
    } catch (error: any) {
      logger.error("Error revoking share:", error);
      if (error.message.includes("Unauthorized")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to revoke share" });
    }
  });

  /**
   * GET /api/templates-shared-with-me
   * List all templates shared with the current user
   */
  app.get("/api/templates-shared-with-me", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const sharedTemplates = await sharingService.listSharedWithUser(user.id, user.email!);
      res.json(sharedTemplates);
    } catch (error: any) {
      logger.error("Error listing shared templates:", error);
      res.status(500).json({ error: "Failed to list shared templates" });
    }
  });
}

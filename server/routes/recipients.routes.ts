import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { storage } from "../storage";
import { insertRecipientSchema, insertGlobalRecipientSchema } from "@shared/schema";
import { sendSurveyInvitation } from "../services/sendgrid";
import { surveyService, recipientService } from "../services";

/**
 * Register recipient-related routes
 * Handles survey recipients, global recipients, and invitation sending
 */
export function registerRecipientRoutes(app: Express): void {

  // ============================================================================
  // Survey Recipients Routes
  // ============================================================================

  /**
   * POST /api/surveys/:surveyId/recipients
   * Add a single recipient to a survey
   */
  app.post('/api/surveys/:surveyId/recipients', isAuthenticated, async (req: any, res) => {
    try {
      const survey = await storage.getSurvey(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const recipientData = insertRecipientSchema.parse({ ...req.body, surveyId: req.params.surveyId });
      const recipient = await storage.createRecipient(recipientData);
      res.json(recipient);
    } catch (error) {
      console.error("Error creating recipient:", error);
      res.status(500).json({ message: "Failed to create recipient" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/recipients
   * List all recipients for a survey
   */
  app.get('/api/surveys/:surveyId/recipients', isAuthenticated, async (req: any, res) => {
    try {
      const survey = await storage.getSurvey(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const recipients = await storage.getRecipientsBySurvey(req.params.surveyId);
      res.json(recipients);
    } catch (error) {
      console.error("Error fetching recipients:", error);
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  /**
   * POST /api/surveys/:surveyId/send-invitations
   * Send email invitations to selected recipients
   */
  app.post('/api/surveys/:surveyId/send-invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const survey = await storage.getSurvey(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      if (survey.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { recipientIds } = req.body;
      if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ message: "Recipient IDs are required" });
      }

      const allRecipients = await storage.getRecipientsBySurvey(req.params.surveyId);
      const recipientsToInvite = allRecipients.filter(recipient => recipientIds.includes(recipient.id));

      if (recipientsToInvite.length === 0) {
        return res.status(400).json({ message: "No valid recipients found" });
      }

      const user = await storage.getUser(userId);
      const creatorName = user ? `${user.firstName} ${user.lastName}`.trim() : undefined;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@vaultlogic.com';

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const recipient of recipientsToInvite) {
        try {
          const surveyUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/survey/${recipient.token}`;

          const emailResult = await sendSurveyInvitation({
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            surveyTitle: survey.title,
            surveyUrl: surveyUrl,
            creatorName: creatorName
          }, fromEmail);

          if (emailResult.success) {
            await storage.updateRecipient(recipient.id, { sentAt: new Date() });
            successCount++;
            results.push({
              recipientId: recipient.id,
              email: recipient.email,
              status: 'sent',
              message: 'Invitation sent successfully'
            });
          } else {
            errorCount++;
            results.push({
              recipientId: recipient.id,
              email: recipient.email,
              status: 'failed',
              message: emailResult.error || 'Failed to send invitation'
            });
          }
        } catch (error: any) {
          console.error(`Error sending invitation to ${recipient.email}:`, error);
          errorCount++;
          results.push({
            recipientId: recipient.id,
            email: recipient.email,
            status: 'failed',
            message: error.message || 'Error sending invitation'
          });
        }
      }

      const allFailed = errorCount > 0 && successCount === 0;
      const partialFailure = errorCount > 0 && successCount > 0;

      if (allFailed) {
        return res.status(400).json({
          success: false,
          message: `Failed to send ${errorCount} invitation(s)`,
          results: results,
          stats: {
            total: recipientsToInvite.length,
            sent: successCount,
            failed: errorCount
          }
        });
      } else if (partialFailure) {
        return res.status(207).json({
          success: false,
          message: `${successCount} invitation(s) sent successfully, ${errorCount} failed`,
          results: results,
          stats: {
            total: recipientsToInvite.length,
            sent: successCount,
            failed: errorCount
          }
        });
      } else {
        return res.json({
          success: true,
          message: `${successCount} invitation(s) sent successfully`,
          results: results,
          stats: {
            total: recipientsToInvite.length,
            sent: successCount,
            failed: errorCount
          }
        });
      }
    } catch (error) {
      console.error("Error sending survey invitations:", error);
      res.status(500).json({ message: "Failed to send survey invitations" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/recipients/status
   * Get recipient status with response tracking
   */
  app.get('/api/surveys/:surveyId/recipients/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const status = await recipientService.getRecipientStatus(req.params.surveyId, userId);
      res.json(status);
    } catch (error: any) {
      console.error("Error fetching recipient status:", error);
      if (error.message === "Survey not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to fetch recipient status" });
    }
  });

  /**
   * POST /api/recipients/:recipientId/send-reminder
   * Send a reminder to a single recipient
   */
  app.post('/api/recipients/:recipientId/send-reminder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const result = await recipientService.sendReminder(req.params.recipientId, userId);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error sending reminder:", error);
      if (error.message === "Recipient not found" || error.message === "Survey not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  /**
   * POST /api/surveys/:surveyId/send-reminders
   * Send reminders to multiple recipients
   */
  app.post('/api/surveys/:surveyId/send-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { recipientIds } = req.body;
      if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ message: "Recipient IDs are required" });
      }

      const result = await recipientService.sendReminders(req.params.surveyId, userId, recipientIds);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error sending reminders:", error);
      if (error.message === "Survey not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      if (error.message.includes("required")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to send reminders" });
    }
  });

  /**
   * POST /api/surveys/:surveyId/recipients/bulk-from-global
   * Bulk add global recipients to a survey
   */
  app.post('/api/surveys/:surveyId/recipients/bulk-from-global', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const survey = await storage.getSurvey(req.params.surveyId);
      if (!survey || survey.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { globalRecipientIds } = req.body;
      if (!globalRecipientIds || !Array.isArray(globalRecipientIds) || globalRecipientIds.length === 0) {
        return res.status(400).json({ message: "Global recipient IDs are required" });
      }

      const newRecipients = await storage.bulkAddGlobalRecipientsToSurvey(
        req.params.surveyId,
        globalRecipientIds,
        userId
      );

      res.json({
        message: `Successfully added ${newRecipients.length} recipients to survey`,
        recipients: newRecipients,
        addedCount: newRecipients.length
      });
    } catch (error) {
      console.error("Error bulk adding global recipients to survey:", error);
      if (error instanceof Error) {
        if (error.message.includes("All selected recipients are already in this survey")) {
          res.status(409).json({ message: error.message });
        } else if (error.message.includes("No valid global recipients found")) {
          res.status(404).json({ message: error.message });
        } else {
          res.status(500).json({ message: "Failed to add recipients to survey" });
        }
      } else {
        res.status(500).json({ message: "Failed to add recipients to survey" });
      }
    }
  });

  // ============================================================================
  // Global Recipients Routes
  // ============================================================================

  /**
   * POST /api/recipients/global
   * Create a new global recipient
   */
  app.post('/api/recipients/global', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const existingRecipient = await storage.getGlobalRecipientByCreatorAndEmail(userId, req.body.email);
      if (existingRecipient) {
        return res.status(409).json({ message: "Email already exists in your global recipient list" });
      }

      const globalRecipientData = insertGlobalRecipientSchema.parse({ ...req.body, creatorId: userId });
      const globalRecipient = await storage.createGlobalRecipient(globalRecipientData);
      res.json(globalRecipient);
    } catch (error) {
      console.error("Error creating global recipient:", error);
      res.status(500).json({ message: "Failed to create global recipient" });
    }
  });

  /**
   * GET /api/recipients/global
   * List all global recipients for the authenticated creator
   */
  app.get('/api/recipients/global', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const globalRecipients = await storage.getGlobalRecipientsByCreator(userId);
      res.json(globalRecipients);
    } catch (error) {
      console.error("Error fetching global recipients:", error);
      res.status(500).json({ message: "Failed to fetch global recipients" });
    }
  });

  /**
   * GET /api/recipients/global/:id
   * Get a single global recipient by ID
   */
  app.get('/api/recipients/global/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const globalRecipient = await storage.getGlobalRecipient(req.params.id);
      if (!globalRecipient) {
        return res.status(404).json({ message: "Global recipient not found" });
      }

      if (globalRecipient.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(globalRecipient);
    } catch (error) {
      console.error("Error fetching global recipient:", error);
      res.status(500).json({ message: "Failed to fetch global recipient" });
    }
  });

  /**
   * PUT /api/recipients/global/:id
   * Update a global recipient
   */
  app.put('/api/recipients/global/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const globalRecipient = await storage.getGlobalRecipient(req.params.id);
      if (!globalRecipient) {
        return res.status(404).json({ message: "Global recipient not found" });
      }

      if (globalRecipient.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (req.body.email && req.body.email !== globalRecipient.email) {
        const existingRecipient = await storage.getGlobalRecipientByCreatorAndEmail(userId, req.body.email);
        if (existingRecipient && existingRecipient.id !== req.params.id) {
          return res.status(409).json({ message: "Email already exists in your global recipient list" });
        }
      }

      const updates = insertGlobalRecipientSchema.partial().parse(req.body);
      const updatedGlobalRecipient = await storage.updateGlobalRecipient(req.params.id, updates);
      res.json(updatedGlobalRecipient);
    } catch (error) {
      console.error("Error updating global recipient:", error);
      res.status(500).json({ message: "Failed to update global recipient" });
    }
  });

  /**
   * DELETE /api/recipients/global/:id
   * Delete a single global recipient
   */
  app.delete('/api/recipients/global/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const globalRecipient = await storage.getGlobalRecipient(req.params.id);
      if (!globalRecipient) {
        return res.status(404).json({ message: "Global recipient not found" });
      }

      if (globalRecipient.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteGlobalRecipient(req.params.id);
      res.json({ message: "Global recipient deleted successfully" });
    } catch (error) {
      console.error("Error deleting global recipient:", error);
      res.status(500).json({ message: "Failed to delete global recipient" });
    }
  });

  /**
   * DELETE /api/recipients/global/bulk
   * Bulk delete global recipients
   */
  app.delete('/api/recipients/global/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Recipient IDs are required" });
      }

      const result = await storage.bulkDeleteGlobalRecipients(ids, userId);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error bulk deleting global recipients:", error);
      res.status(500).json({ message: "Failed to bulk delete global recipients" });
    }
  });
}

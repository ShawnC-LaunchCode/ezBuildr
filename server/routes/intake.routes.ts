import type { Express, Request, Response } from "express";
import { intakeService } from "../services/IntakeService";
import { runService } from "../services/RunService";
import { CaptchaService } from "../services/CaptchaService.js";
import { z } from "zod";
import { createLogger } from "../logger";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import type { CaptchaResponse } from "../../shared/types/intake.js";

const logger = createLogger({ module: "intake-routes" });

// Configure multer for file uploads
const upload = multer({
  dest: process.env.UPLOAD_DIR || "./uploads/intake",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only specific file types
    const allowedTypes = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  },
});

// Validation schemas
const createRunSchema = z.object({
  slug: z.string(),
  answers: z.record(z.any()).optional(),
  prefillParams: z.record(z.string()).optional(), // Stage 12.5: URL prefill
});

const saveProgressSchema = z.object({
  answers: z.record(z.any()),
});

const submitRunSchema = z.object({
  answers: z.record(z.any()),
  captcha: z.object({ // Stage 12.5: CAPTCHA validation
    type: z.enum(["simple", "recaptcha"]),
    token: z.string(),
    answer: z.string().optional(),
    recaptchaToken: z.string().optional(),
  }).optional(),
});

/**
 * Register intake portal routes
 * Public routes for workflow execution via slug
 */
export function registerIntakeRoutes(app: Express): void {
  /**
   * GET /intake/workflows/:slug/published
   * Get published workflow metadata and branding
   * Stage 12.5: Includes intakeConfig
   */
  app.get('/intake/workflows/:slug/published', async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;

      const data = await intakeService.getPublishedWorkflow(slug);

      res.json({
        success: true,
        data: {
          workflow: {
            id: data.workflow.id,
            title: data.workflow.title,
            description: data.workflow.description,
            requireLogin: data.workflow.requireLogin,
          },
          sections: data.sections,
          intakeConfig: data.intakeConfig, // Stage 12.5
          tenantBranding: data.tenantBranding,
        },
      });
    } catch (error) {
      logger.error({ error, slug: req.params.slug }, "Error fetching published workflow");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /intake/captcha/challenge
   * Generate a new CAPTCHA challenge
   * Stage 12.5: Simple math CAPTCHA
   */
  app.get('/intake/captcha/challenge', async (req: Request, res: Response) => {
    try {
      const challenge = CaptchaService.generateSimpleChallenge();

      res.json({
        success: true,
        data: challenge,
      });
    } catch (error) {
      logger.error({ error }, "Error generating CAPTCHA challenge");
      res.status(500).json({
        success: false,
        error: "Failed to generate CAPTCHA challenge",
      });
    }
  });

  /**
   * POST /intake/runs
   * Create a new intake run
   * Body: { slug, answers?, prefillParams? }
   * Stage 12.5: Supports prefillParams for URL-based prefill
   */
  app.post('/intake/runs', async (req: Request, res: Response) => {
    try {
      const data = createRunSchema.parse(req.body);

      // Get userId from session if authenticated
      const user = req.user || (req.session as any)?.user;
      const userId = user?.claims?.sub;

      const result = await intakeService.createIntakeRun(
        data.slug,
        userId,
        data.answers,
        data.prefillParams // Stage 12.5: URL prefill
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error }, "Error creating intake run");
      const message = error instanceof Error ? error.message : "Failed to create run";
      const status = message.includes("required") ? 401 : message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /intake/runs/:token/save
   * Save intake run progress (draft)
   * Body: { answers }
   */
  app.post('/intake/runs/:token/save', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const data = saveProgressSchema.parse(req.body);

      await intakeService.saveIntakeProgress(token, data.answers);

      res.json({
        success: true,
        message: "Progress saved",
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error saving intake progress");
      const message = error instanceof Error ? error.message : "Failed to save progress";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /intake/runs/:token/submit
   * Submit intake run (complete workflow)
   * Body: { answers, captcha? }
   * Stage 12.5: Validates CAPTCHA and sends email receipt
   */
  app.post('/intake/runs/:token/submit', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const data = submitRunSchema.parse(req.body);

      const result = await intakeService.submitIntakeRun(
        token,
        data.answers,
        data.captcha as CaptchaResponse | undefined // Stage 12.5: CAPTCHA
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error submitting intake run");
      const message = error instanceof Error ? error.message : "Failed to submit run";
      const status = message.includes("not found") ? 404 : message.includes("already completed") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /intake/runs/:token/status
   * Get intake run status
   */
  app.get('/intake/runs/:token/status', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const status = await intakeService.getIntakeRunStatus(token);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error fetching run status");
      const message = error instanceof Error ? error.message : "Failed to fetch status";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /intake/runs/:token/download
   * Download generated documents
   * Query: ?type=docx|pdf
   */
  app.get('/intake/runs/:token/download', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { type } = req.query;

      if (!type || (type !== 'docx' && type !== 'pdf')) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing type parameter (must be 'docx' or 'pdf')",
        });
      }

      // Get run status
      const status = await intakeService.getIntakeRunStatus(token);

      if (!status.completed) {
        return res.status(400).json({
          success: false,
          error: "Run is not completed yet",
        });
      }

      // TODO: Implement document generation and download
      // For now, return placeholder
      res.status(501).json({
        success: false,
        error: "Document download not yet implemented",
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error downloading document");
      const message = error instanceof Error ? error.message : "Failed to download document";
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /intake/upload
   * Upload file for intake form
   * Multipart form data
   */
  app.post('/intake/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file provided",
        });
      }

      // Generate secure file reference
      const fileRef = randomUUID() + path.extname(req.file.originalname);

      // TODO: Move file to permanent storage with virus scanning
      // For now, just return file reference

      res.json({
        success: true,
        data: {
          fileRef,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    } catch (error) {
      logger.error({ error }, "Error uploading file");
      const message = error instanceof Error ? error.message : "Failed to upload file";
      res.status(500).json({ success: false, error: message });
    }
  });
}

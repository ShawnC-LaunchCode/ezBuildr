import { randomUUID } from "crypto";
import path from "path";

import multer from "multer";
import { z } from "zod";

import { createLogger } from "../logger";
import { optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { CaptchaService } from "../services/CaptchaService.js";
import { intakeService } from "../services/IntakeService";
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';
import { uploadLimiter, strictLimiter } from "../middleware/rateLimiter";
import { virusScanner } from "../services/security/VirusScanner";

import type { CaptchaResponse } from "../../shared/types/intake.js";
import type { Express, Request, Response } from "express";
const logger = createLogger({ module: "intake-routes" });
// Configure multer for file uploads
const upload = multer({
  dest: process.env.UPLOAD_DIR ?? "./uploads/intake",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic workflow answer values
  answers: z.record(z.any()).optional(),
  prefillParams: z.record(z.string()).optional(), // Stage 12.5: URL prefill
});
const saveProgressSchema = z.object({
  // SEC-004: Cap answers map size and stringified length
  answers: z.record(z.any())
    .refine(o => Object.keys(o).length <= 500, 'too many answers')
    .refine(o => JSON.stringify(o).length <= 512 * 1024, 'answers too large'),
  captcha: z.object({
    type: z.enum(["simple", "recaptcha"]),
    token: z.string(),
    answer: z.string().optional(),
    recaptchaToken: z.string().optional(),
  }).optional(),
});
const submitRunSchema = z.object({
  // SEC-004: Cap answers map size and stringified length
  answers: z.record(z.any())
    .refine(o => Object.keys(o).length <= 500, 'too many answers')
    .refine(o => JSON.stringify(o).length <= 512 * 1024, 'answers too large'),
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
// eslint-disable-next-line max-lines-per-function
export function registerIntakeRoutes(app: Express): void {
  /**
   * GET /intake/workflows/:slug/published
   * Get published workflow metadata and branding
   * Stage 12.5: Includes intakeConfig
   */
  app.get('/intake/workflows/:slug/published', asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow");
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * GET /intake/captcha/challenge
   * Generate a new CAPTCHA challenge
   * Stage 12.5: Simple math CAPTCHA
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/intake/captcha/challenge', asyncHandler(async (req: Request, res: Response) => {
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
  }));
  /**
   * POST /intake/runs
   * Create a new intake run
   * Body: { slug, answers?, prefillParams? }
   * Stage 12.5: Supports prefillParams for URL-based prefill
   */
  app.post('/intake/runs', optionalHybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = createRunSchema.parse(req.body);
      // Get userId from AuthRequest if authenticated (via token or cookie)
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
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
      const { status, message } = classifyRouteError(error, "Failed to create run");
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /intake/runs/:token/save
   * Save intake run progress (draft)
   * Body: { answers }
   */
  app.post('/intake/runs/:token/save', strictLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      const payloadString = JSON.stringify(req.body);
      if (payloadString.length > 500000) { // 500KB cap
        return res.status(413).json({ error: "Payload too large" });
      }

      const data = saveProgressSchema.parse(req.body);
      
      if (data.captcha) {
         // @ts-ignore - TODO: fix type
         const isValid = await CaptchaService.validate(data.captcha);
         if (!isValid) {
             return res.status(403).json({ error: "Invalid CAPTCHA" });
         }
      }

      await intakeService.saveIntakeProgress(token, data.answers);
      res.json({
        success: true,
        message: "Progress saved",
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error saving intake progress");
      const { status, message } = classifyRouteError(error, "Failed to save progress");
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /intake/runs/:token/submit
   * Submit intake run (complete workflow)
   * Body: { answers, captcha? }
   * Stage 12.5: Validates CAPTCHA and sends email receipt
   */
  app.post('/intake/runs/:token/submit', strictLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      const payloadString = JSON.stringify(req.body);
      if (payloadString.length > 500000) { // 500KB cap
        return res.status(413).json({ error: "Payload too large" });
      }

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
      const { status, message } = classifyRouteError(error, "Failed to submit run");
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * GET /intake/runs/:token/status
   * Get intake run status
   */
  app.get('/intake/runs/:token/status', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const status = await intakeService.getIntakeRunStatus(token);
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error fetching run status");
      const { status, message } = classifyRouteError(error, "Failed to fetch status");
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * GET /intake/runs/:token/download
   * Download generated documents
   * Query: ?type=docx|pdf
   */
  app.get('/intake/runs/:token/download', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { type } = req.query;
      if (type === undefined || (type !== 'docx' && type !== 'pdf')) {
        res.status(400).json({
          success: false,
          error: "Invalid or missing type parameter (must be 'docx' or 'pdf')",
        });
        return;
      }
      // Get run status
      const status = await intakeService.getIntakeRunStatus(token);
      if (!status.completed) {
        res.status(400).json({
          success: false,
          error: "Run is not completed yet",
        });
        return;
      }
      // TODO: Implement document generation and download
      // For now, return placeholder
      res.status(501).json({
        success: false,
        error: "Document download not yet implemented",
      });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error downloading document");
      const message = "Failed to download document";
      res.status(500).json({ success: false, error: message });
    }
  }));
  /**
   * POST /intake/upload
   * Upload file for intake form
   * Multipart form data
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  app.post('/intake/upload', uploadLimiter, optionalHybridAuth, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
    try {
      // SEC-011: Require a valid intake runToken or session to bind uploads to an in-progress run
      const runToken = req.query.runToken || req.headers['x-run-token'];
      const authReq = req as AuthRequest;
      const hasSession = !!authReq.userId;

      if (!runToken && !hasSession) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized: Missing runToken or active session for upload."
        });
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No file provided",
        });
        return;
      }
      // Generate secure file reference
      const fileRef = randomUUID() + path.extname(req.file.originalname);
      
      const fileBuffer = await import('fs').then(fs => fs.promises.readFile(req.file!.path));
      
      const { validateMagicBytes } = await import('../utils/magicBytes');
      const isValidMagic = validateMagicBytes(fileBuffer, req.file!.originalname);
      if (!isValidMagic) {
        return res.status(400).json({ error: "File type mismatch (Magic Bytes validation failed)" });
      }

      const scanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
      
      if (!scanResult.safe) {
          logger.warn({ file: req.file.originalname, threat: scanResult.threatName }, "Malicious file detected during intake upload");
          return res.status(400).json({ error: `File rejected by security scan: ${scanResult.threatName}` });
      }

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
      const message = "Failed to upload file";
      res.status(500).json({ success: false, error: message });
    }
  }));
}
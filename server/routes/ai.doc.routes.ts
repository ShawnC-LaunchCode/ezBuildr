import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { Router } from "express";
import multer from "multer";


import { documentAIAssistService } from "../lib/ai/DocumentAIAssistService";
import { logger } from "../logger";
import { hybridAuth } from "../middleware/auth";
import { aiWorkflowRateLimit, aiDailyRateLimit } from "../middleware/ai.middleware";
import { uploadLimiter, strictLimiter } from "../middleware/rateLimiter";
import { AIError } from "../services/ai/AIError";
import { documentOnboardingService } from "../services/ai/DocumentOnboardingService";
import { virusScanner } from "../services/security/VirusScanner";
import { MAX_FILE_SIZE } from "../services/fileService";
import { classifyRouteError } from "../utils/routeErrors";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { RUNNER_RENDERED_STEP_TYPES } from "../../shared/types/runnerStepTypes";

import type { AuthRequest } from "../middleware/auth";
import type { AIErrorCode } from "../services/ai/types";

const router = Router();

// Callers send arrays of variable OBJECTS (e.g. { name, type } / { id, name, type }),
// which the service consumes via v.name/v.id/v.label/v.type. Validate that real
// shape while keeping the SEC-028 bounds: every field is enumerated and
// length-capped, and unknown keys are stripped — .passthrough() would let
// arbitrarily large unknown fields flow through to the AI prompt.
const variableObjectSchema = z
  .object({
    name: z.string().max(200),
    id: z.string().max(200).optional(),
    label: z.string().max(500).optional(),
    type: z.string().max(100).optional(),
    description: z.string().max(1000).optional(),
  })
  .strip();
const variableObjectArraySchema = z.array(variableObjectSchema).max(500);
const suggestMappingsSchema = z.object({
  templateVariables: variableObjectArraySchema,
  workflowVariables: variableObjectArraySchema
});
const suggestImprovementsSchema = z.object({
  variables: variableObjectArraySchema
});

// GH-167: the onboarding wizard's review step lets the author edit a
// question's type and alias before anything is generated. Enumerated and
// length-capped fields, `.strip()`'d, matching the SEC-028 precedent above.
const onboardingVariableSchema = z
  .object({
    name: z.string().min(1).max(200),
    // Every generated step must be fillable in PreviewRunner (AC3), so the
    // type is constrained to the canonical runner-fillable set rather than
    // any stepTypeEnum string -- see shared/types/runnerStepTypes.ts.
    type: z.enum([...RUNNER_RENDERED_STEP_TYPES] as [string, ...string[]]),
    alias: z.string().min(1).max(200),
    label: z.string().max(500).optional(),
  })
  .strip();
const generateOnboardingWorkflowSchema = z
  .object({
    projectId: z.string().uuid(),
    documentName: z.string().min(1).max(255),
    variables: z.array(onboardingVariableSchema).min(1).max(200),
  })
  .strip();

// SECURITY FIX: Use disk storage instead of memory to prevent DoS (OOM)
const upload = multer({
    storage: multer.diskStorage({
        destination: os.tmpdir(),
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()  }-${  crypto.randomBytes(4).toString('hex')}`;
            cb(null, `${file.fieldname  }-${  uniqueSuffix  }${path.extname(file.originalname)}`);
        }
    }),
    limits: {
        fileSize: MAX_FILE_SIZE, // 10MB default
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Only allow document types for template analysis
        const allowedMimeTypes = [
            'application/pdf',
            'application/x-pdf',
            'application/acrobat',
            'applications/vnd.pdf',
            'text/pdf',
            'text/x-pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/octet-stream', // Sometimes PDFs/DOCX are identified as this
            'text/plain',
            'text/markdown'
        ];
        const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md'];

        logger.debug({ filename: file.originalname, mimeType: file.mimetype, size: file.size }, 'Upload Debug: File received');

        // Two-tier validation: MIME type OR file extension
        // This handles cases where MIME type is unreliable (common with PDFs)
        const mimeValid = allowedMimeTypes.includes(file.mimetype);
        const extValid = allowedExtensions.some(ext =>
            file.originalname.toLowerCase().endsWith(ext)
        );

        if (!mimeValid && !extValid) {
            logger.warn({ filename: file.originalname, mimeType: file.mimetype }, 'Upload Rejected: Invalid file');
            return cb(new Error(
                `File type not supported. Please upload PDF or DOCX files only. ` +
                `Received: ${file.originalname} (${file.mimetype})`
            ));
        }

        // Additional security: Check for suspicious double extensions
        const filename = file.originalname.toLowerCase();
        const suspiciousPatterns = [
            '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.app',
            '.dmg', '.pkg', '.deb', '.rpm', '.msi', '.scr', '.com'
        ];

        if (suspiciousPatterns.some(pattern => filename.includes(pattern))) {
            logger.warn({ filename: file.originalname }, 'Upload Rejected: Suspicious extension');
            return cb(new Error(
                `File contains suspicious extension. Only PDF and DOCX files are allowed.`
            ));
        }

        cb(null, true);
    }
});

// Middleware
router.use(hybridAuth);

// Helper to cleanup temp files
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const cleanupFile = async (filePath?: string) => {
    if (filePath) {
        try {
            await fs.unlink(filePath);
        } catch (e: unknown) {
            // Ignore if file doesn't exist (ENOENT)
            if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) {
                logger.warn({ error: e, filePath }, 'Failed to cleanup temp upload file');
            }
        }
    }
};

/**
 * POST /api/ai/doc/analyze
 * Upload a file, save to temp disk, analyze, then delete.
 */
router.post("/analyze", uploadLimiter, (req, res, next) => {
    // SECURITY FIX: Add multer error handling
    upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof Error) {
            logger.error({ error: err, stack: err.stack, name: err.name }, 'Multer/Upload Error in analyze route');
        }
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ error: 'Too many files uploaded' });
            }
            return res.status(400).json({ error: err.message });
        } else if (err instanceof Error) {
            // Custom file filter error
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: 'File upload failed' });
        }
        next();
    });
}, asyncHandler(async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No file provided" });
            return;
        }

        const fileBuffer = await fs.readFile(req.file.path);
        
        const { validateMagicBytes } = await import('../utils/magicBytes');
        const isValidMagic = validateMagicBytes(fileBuffer, req.file.originalname);
        if (!isValidMagic) {
            res.status(400).json({ error: "File type mismatch (Magic Bytes validation failed)" });
            return;
        }

        const scanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
        if (!scanResult.safe) {
            logger.warn({ file: req.file.originalname, threat: scanResult.threatName }, "Malicious file detected in AI analyze route");
            res.status(400).json({ error: `File rejected by security scan: ${scanResult.threatName}` });
            return;
        }

        const result = await documentAIAssistService.analyzeTemplate(
            req.file.path,
            req.file.originalname,
            (req as AuthRequest).tenantId
        );
        res.json({ data: result });
    } catch (err) {
        logger.error({ error: err }, 'Template analysis failed');
        res.status(500).json({ error: 'Analysis failed due to an internal error.' });
    } finally {
        await cleanupFile(req.file?.path);
    }
}));

/**
 * POST /api/ai/doc/extract-text
 * Upload a file, return raw extracted text for chat context
 */
router.post("/extract-text", uploadLimiter, (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof Error) {
            logger.error({ error: err }, 'Upload Error: Multer failed');
            return res.status(400).json({ message: err.message, error: err.message });
        }
        if (err) {
            logger.error({ error: err }, 'Upload Error: Multer failed');
            return res.status(400).json({ message: 'File upload failed', error: 'File upload failed' });
        }
        next();
    });
}, asyncHandler(async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No file provided" });
            return;
        }

        const fileBuffer = await fs.readFile(req.file.path);
        
        const { validateMagicBytes } = await import('../utils/magicBytes');
        const isValidMagic = validateMagicBytes(fileBuffer, req.file.originalname);
        if (!isValidMagic) {
            res.status(400).json({ error: "File type mismatch (Magic Bytes validation failed)" });
            return;
        }

        const scanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
        if (!scanResult.safe) {
            logger.warn({ file: req.file.originalname, threat: scanResult.threatName }, "Malicious file detected in AI extract route");
            res.status(400).json({ error: `File rejected by security scan: ${scanResult.threatName}` });
            return;
        }

        const text = await documentAIAssistService.extractTextContent(req.file.path, req.file.originalname);
        res.json({ text });
    } catch (err) {
        logger.error({ error: err }, 'Text extraction failed');
        res.status(500).json({ error: "Text extraction failed" });
    } finally {
        await cleanupFile(req.file?.path);
    }
}));

/**
 * POST /api/ai/doc/suggest-mappings
 * Body: { templateVariables: [...], workflowVariables: [...] }
 */
router.post("/suggest-mappings", strictLimiter, asyncHandler(async (req, res) => {
    try {
        const { templateVariables, workflowVariables } = suggestMappingsSchema.parse(req.body);
        const mappings = await documentAIAssistService.suggestMappings(
            templateVariables as Parameters<typeof documentAIAssistService.suggestMappings>[0],
            workflowVariables as Parameters<typeof documentAIAssistService.suggestMappings>[1],
            (req as AuthRequest).tenantId
        );
        res.json({ data: mappings });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid input", details: err.errors });
        }
        logger.error({ error: err }, 'Mapping suggestion failed');
        res.status(500).json({ error: "Mapping suggestion failed" });
    }
}));

/**
 * POST /api/ai/doc/suggest-improvements
 * Body: { variables: [...] }
 * Returns aliases, formatting suggestions
 */
router.post("/suggest-improvements", strictLimiter, asyncHandler(async (req, res) => {
    try {
        const { variables } = suggestImprovementsSchema.parse(req.body);
        // Service takes variable names (string[]); callers send objects.
        const result = await documentAIAssistService.suggestImprovements(
            variables.map(v => v.name),
            (req as AuthRequest).tenantId
        );
        res.json({ data: result });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid input", details: err.errors });
        }
        logger.error({ error: err }, 'Improvement suggestion failed');
        res.status(500).json({ error: "Improvement suggestion failed" });
    }
}));

/**
 * Maps an error from the onboarding-generation pipeline to an HTTP status
 * plus a client-usable body. AI-provider failures (timeout/rate-limit/budget)
 * carry a `retryable` flag straight through from `AIError` so the wizard can
 * distinguish "try again" from "this request will never succeed" (AC4).
 * Authorization/not-found errors from `DocumentOnboardingService` follow the
 * shared `classifyRouteError` contract (see the `add-api-endpoint` skill).
 */
function classifyOnboardingError(error: unknown): { status: number; body: Record<string, unknown> } {
    if (error instanceof z.ZodError) {
        return { status: 400, body: { error: "Invalid input", details: error.errors } };
    }
    if (error instanceof AIError) {
        const statusByCode: Partial<Record<AIErrorCode, number>> = {
            RATE_LIMIT: 429,
            TIMEOUT: 504,
            BUDGET_EXCEEDED: 402,
            QUALITY_THRESHOLD: 422,
            VALIDATION_ERROR: 422,
        };
        const status = statusByCode[error.code] ?? 502;
        return {
            status,
            body: {
                error: error.message,
                retryable: error.retryable || error.code === 'TIMEOUT' || error.code === 'RATE_LIMIT',
            },
        };
    }
    const { status, message } = classifyRouteError(error, "Document onboarding generation failed");
    // Anything not explicitly 4xx-classified is an unexpected server-side
    // failure (provider outage, network blip) -- treat it as retryable.
    return { status, body: { error: message, retryable: status >= 500 } };
}

/**
 * POST /api/ai/doc/onboarding/generate-workflow
 * Body: { projectId, documentName, variables: [{ name, type, alias, label? }] }
 *
 * GH-167: turns the onboarding wizard's author-approved variable list into a
 * not-yet-persisted AIGeneratedWorkflow. See DocumentOnboardingService for
 * the composition (documentAIAssistService already ran client-side to
 * extract/suggest; this calls the AI workflow-generation service and
 * reconciles its output against the author's approved edits).
 */
router.post(
    "/onboarding/generate-workflow",
    strictLimiter,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(async (req, res) => {
        const authReq = req as AuthRequest;
        try {
            const userId = authReq.userId;
            if (!userId) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            const data = generateOnboardingWorkflowSchema.parse(req.body);
            const workflow = await documentOnboardingService.generateWorkflowFromVariables(
                userId,
                authReq.tenantId,
                data
            );
            res.json({ data: workflow });
        } catch (err) {
            const { status, body } = classifyOnboardingError(err);
            if (status >= 500) {
                logger.error({ error: err, userId: authReq.userId }, 'Document onboarding generation failed');
            }
            res.status(status).json(body);
        }
    })
);

export default router;

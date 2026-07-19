import { z } from "zod";

import type { Workflow, Section, Step, LogicRule } from "@shared/schema";

import { createLogger } from "../../logger";
import { hybridAuth } from "../../middleware/auth";
import { aiWorkflowRateLimit, aiDailyRateLimit } from "../../middleware/ai.middleware";
import { buildOpsDiff } from "@shared/aiOpsDiff";
import { aiWorkflowEditRequestSchema, aiPreferencesSchema, aiModelResponseSchema } from "@shared/validation/aiWorkflowEdit.schema";

import { AIError } from "../../services/ai/AIError";
import { AIProviderClient } from "../../services/ai/AIProviderClient";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";
import { resolveAiProviderConfig } from "../../services/ai/providerConfig";
import { aiSettingsService, DEFAULT_SYSTEM_PROMPT } from "../../services/AiSettingsService";
import { snapshotService } from "../../services/SnapshotService";
import { versionService } from "../../services/VersionService";
import { workflowPatchService } from "../../services/WorkflowPatchService";
import { workflowService } from "../../services/WorkflowService";

import type { AuthRequest } from "../../middleware/auth";
import type {
  AiEditProposal,
  AiModelResponse,
  AiWorkflowEditRequest,
  WorkflowPatchOp,
} from "@shared/validation/aiWorkflowEdit.schema";
import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "ai-workflow-edit-routes" });

// Define comprehensive workflow type used in context building
interface WorkflowWithDetails extends Workflow {
  sections: (Section & { steps: Step[] })[];
  logicRules: LogicRule[];
}

function getValidationDetailMessages(error: unknown): string[] {
  if (error === null || typeof error !== "object") {
    return [];
  }

  const details = (error as { details?: unknown }).details;
  if (!Array.isArray(details)) {
    return [];
  }

  return details.map((detail) => {
    if (detail !== null && typeof detail === "object") {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === "string") {
        return `Invalid operation schema: ${message}`;
      }
    }

    return "Invalid operation schema: Unknown validation error";
  });
}

/**
 * Register AI workflow editing routes
 */
export function registerAiWorkflowEditRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/ai/edit
   * AI-powered workflow editing
   */
  app.post(
    "/api/workflows/:workflowId/ai/edit",
    hybridAuth,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (req: Request, res: Response) => {

      try {
        const { workflowId } = req.params;
        const authReq = req as AuthRequest;
        const userId = authReq.userId ?? (authReq.user)?.id;

        if (!userId) {
          return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        // Verify edit access
        await workflowService.verifyAccess(workflowId, userId, 'edit');

        // 1. Validate request body (merge param ID into body for schema validation)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const bodyToValidate = {
          ...req.body,
          workflowId
        };
        const validationResult = aiWorkflowEditRequestSchema.safeParse(bodyToValidate);
        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: "Invalid request data",
            details: validationResult.error.issues
          });
        }
        const requestData = validationResult.data;
        // 2. Get current workflow

        const currentWorkflow = await workflowService.getWorkflowWithDetails(workflowId, userId) as WorkflowWithDetails;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!currentWorkflow) {
          return res.status(404).json({ success: false, error: "Workflow not found" });
        }

        // 3. Propose-only (dry run): generate ops and return them with a diff.
        // Nothing is written — no snapshot, no version, no rows — so Discard on
        // the client is genuinely a no-op (ICW2-10).
        if (requestData.dryRun === true) {
          return await proposeEdit(res, requestData, currentWorkflow, workflowId);
        }

        return await applyEdit(res, requestData, currentWorkflow, workflowId, userId);
      } catch (error) {
        logger.error({ error, workflowId: req.params.workflowId }, "Error in AI workflow edit");
        const actual = error instanceof Error ? error.message : "";
        const isUserError = actual.includes("Access denied") ||
          actual.includes("already exists") ||
          actual.includes("Duplicate") ||
          actual.includes("duplicate key") ||
          actual.includes("VALIDATION_ERROR");
        const status = isUserError ? (actual.includes("Access denied") ? 403 : 400) : 500;
        const errorMessage = status === 500 ? "Failed to process AI edit" : actual;
        res.status(status).json({ success: false, error: errorMessage });
      }
    }
  );
}

/**
 * Map a model-call failure onto the response contract. Shared by the propose
 * and generate-and-apply paths so both classify identically.
 */
function respondToModelFailure(res: Response, error: unknown, workflowId: string): Response {
  logger.error({ error, workflowId }, "AI model call failed");

  if (error !== null && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      success: false,
      error: 'Failed to apply operations',
      details: getValidationDetailMessages(error),
    });
  }

  // Provider rate-limit / transient exhaustion surfaces as a retriable 429.
  if (error instanceof AIError && error.code === 'RATE_LIMIT') {
    return res.status(429).json({
      success: false,
      error: "AI service is busy. Please try again in a moment.",
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }

  // Everything else: generic 500, no internal detail echoed.
  return res.status(500).json({ success: false, error: "AI model call failed" });
}

async function generateOps(
  requestData: AiWorkflowEditRequest,
  currentWorkflow: WorkflowWithDetails,
): Promise<AiModelResponse> {
  const systemPromptTemplate = await aiSettingsService.getEffectivePrompt();
  return callAiForWorkflowEdit(
    requestData.userMessage ?? '',
    currentWorkflow,
    requestData.preferences,
    systemPromptTemplate,
  );
}

/**
 * Dry run: generate ops, return them plus a reviewable diff, write nothing.
 */
async function proposeEdit(
  res: Response,
  requestData: AiWorkflowEditRequest,
  currentWorkflow: WorkflowWithDetails,
  workflowId: string,
): Promise<Response> {
  let aiResponse: AiModelResponse;
  try {
    aiResponse = await generateOps(requestData, currentWorkflow);
  } catch (error) {
    return respondToModelFailure(res, error, workflowId);
  }

  const proposal: AiEditProposal = {
    ops: aiResponse.ops,
    changes: buildOpsDiff(aiResponse.ops),
    summary: aiResponse.summary,
    confidence: aiResponse.confidence,
    warnings: aiResponse.warnings ?? [],
    questions: aiResponse.questions ?? [],
  };

  return res.status(200).json({ success: true, data: proposal });
}

/**
 * Apply ops through the snapshot + transaction pipeline. Ops either come from
 * the caller (a previously reviewed proposal) or are generated here for the
 * easy-mode auto-apply path. Caller-supplied ops get the same per-op Zod
 * validation (at request parse) and IDOR checks (in `applyOps`) as generated
 * ones, so they carry no extra privilege.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
async function applyEdit(
  res: Response,
  requestData: AiWorkflowEditRequest,
  currentWorkflow: WorkflowWithDetails,
  workflowId: string,
  userId: string,
): Promise<Response> {
  // Create BEFORE snapshot.
  // Fail closed: the AI-edit rollback story presumes a pre-edit snapshot
  // exists, so if we cannot create one we abort before mutating anything
  // rather than proceed with no safety net (ICW-16).
  let beforeSnapshot;
  try {
    beforeSnapshot = await snapshotService.createSnapshot(
      workflowId,
      `AI Edit BEFORE: ${new Date().toISOString()}`
    );
  } catch (error) {
    logger.error({ error, workflowId }, "Failed to create before snapshot — aborting AI edit");
    return res.status(503).json({
      success: false,
      error: "Could not create a pre-edit snapshot. No changes were made — please try again.",
    });
  }

  // Ops from a reviewed proposal, or freshly generated for auto-apply.
  let ops: WorkflowPatchOp[];
  let summary: string[];
  let confidence: number | undefined;
  let warnings: string[];
  let questions: AiModelResponse['questions'];

  if (requestData.ops !== undefined) {
    ops = requestData.ops;
    // Summary is re-derived from the ops server-side rather than trusted from
    // the client, so the recorded changelog always matches what was applied.
    summary = buildOpsDiff(ops).map((change) => change.explanation);
    warnings = [];
    questions = [];
  } else {
    let aiResponse: AiModelResponse;
    try {
      aiResponse = await generateOps(requestData, currentWorkflow);
    } catch (error) {
      return respondToModelFailure(res, error, workflowId);
    }
    ops = aiResponse.ops;
    summary = aiResponse.summary;
    confidence = aiResponse.confidence;
    warnings = aiResponse.warnings ?? [];
    questions = aiResponse.questions ?? [];
  }

  const { errors } = await workflowPatchService.applyOps(workflowId, userId, ops);
  if (errors.length > 0) {
    logger.error({ errors, workflowId }, "Failed to apply some AI operations");
    return res.status(400).json({
      success: false,
      error: "Failed to apply operations",
      details: errors,
    });
  }

  const updatedWorkflow = await workflowService.getWorkflowWithDetails(workflowId, userId);

  const aiMetadata = {
    source: 'ai-edit' as const,
    aiOpsCount: ops.length,
    aiGenerated: true,
    userPrompt: requestData.userMessage,
    confidence,
  };

  let draftVersion;
  let noChanges = false;
  try {
    draftVersion = await versionService.createDraftVersion(
      workflowId,
      userId,
      requestData.userMessage ?? 'AI generated edit',
      aiMetadata, // snapshots added after creation to avoid circular dep
    );
    if (!draftVersion) {
      noChanges = true;
    } else {
      // If workflow was active, revert to draft (because we made changes)
      if (updatedWorkflow.status === 'active') {
        await workflowService.changeStatus(workflowId, userId, 'draft');
      }
      try {
        const afterSnapshot = await snapshotService.createSnapshot(
          workflowId,
          `AI Edit AFTER: ${draftVersion.versionNumber}`,
          draftVersion.id
        );
        await versionService.updateAiMetadata(draftVersion.id, {
          ...aiMetadata,
          beforeSnapshotId: beforeSnapshot?.id,
          afterSnapshotId: afterSnapshot?.id
        });
      } catch (error) {
        logger.error({ error, workflowId }, "Failed to create after snapshot or update metadata");
      }
    }
  } catch (error) {
    logger.error({ error, workflowId }, "Failed to create draft version after AI edit");
  }

  return res.status(200).json({
    success: true,
    data: {
      workflowId: updatedWorkflow.id,
      versionId: draftVersion?.id ?? null,
      versionNumber: draftVersion?.versionNumber,
      noChanges,
      summary,
      warnings,
      questions,
    }
  });
}

/**
 * Generate workflow edit operations via the AI provider registry.
 *
 * Routes through `AIProviderClient` (retry/backoff/timeout/telemetry) rather
 * than constructing the provider SDK directly (ICW-13). Three properties are
 * security-load-bearing and preserved here:
 *  1. System/user role separation — the instruction template travels as the
 *     `systemMessage` (mapped to the provider's system instruction), never
 *     concatenated into the user turn (SEC-040).
 *  2. `fenceUntrusted` wrapping of workflow context and the user message.
 *  3. Strict `aiModelResponseSchema.safeParse` of the model output.
 */
async function callAiForWorkflowEdit(
  userMessage: string,
  currentWorkflow: WorkflowWithDetails,
  preferences?: z.infer<typeof aiPreferencesSchema>,
  systemPromptTemplate?: string,
): Promise<AiModelResponse> {
  // maxTokens raised above the provider's 4k default to fit larger edit outputs.
  const client = new AIProviderClient(resolveAiProviderConfig({ maxTokens: 8192 }));

  const systemPrompt = buildSystemPrompt(preferences, systemPromptTemplate);
  const workflowContext = buildWorkflowContext(currentWorkflow);

  // User turn carries only fenced, untrusted data. Instructions live in the
  // system message so injected content in the workflow/user text cannot be
  // interpreted as instructions.
  const userPrompt = `## Current Workflow State
${fenceUntrusted(workflowContext)}

## User Request
${fenceUntrusted(userMessage)}

## Instructions
Analyze the user's request and generate a JSON response with the following structure:
{
  "summary": ["bullet point 1", "bullet point 2", ...],
  "confidence": 0.0 to 1.0,
  "warnings": ["warning 1", ...] (optional),
  "questions": [
    {
      "id": "unique-id",
      "prompt": "question text",
      "type": "text|single_select|multi_select|number",
      "options": ["option1", "option2"] (for select types),
      "blocking": true/false
    }
  ] (optional),
  "ops": [
    { operation objects following the schema }
  ]
}
Return ONLY valid JSON. No markdown, no code blocks, just raw JSON.`;

  // Delegate to the registry client (handles retry/backoff/timeout/telemetry).
  const responseText = await client.callLLM(userPrompt, 'workflow_revision', systemPrompt);

  // Parse JSON response. The provider already strips code fences; keep a
  // defensive markdown fallback. Log only structural metadata, never the raw
  // response body (may echo tenant content — SEC-039).
  let parsedJson: unknown;
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    parsedJson = JSON.parse(jsonText);
  } catch {
    logger.error({ responseLength: responseText.length }, "Failed to parse AI JSON response");
    throw new Error("Invalid JSON response from AI model");
  }

  // Strict Zod validation (defense in depth, independent of per-op validation).
  const validationResult = aiModelResponseSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    logger.error(
      { issuePaths: validationResult.error.errors.map((e) => e.path.join('.')) },
      "AI generated an invalid response structure",
    );
    throw Object.assign(new Error("Invalid AI response structure"), {
      code: 'VALIDATION_ERROR',
      details: validationResult.error.errors,
    });
  }

  return validationResult.data;
}
/**
 * Build system prompt based on preferences
 */
function buildSystemPrompt(preferences?: z.infer<typeof aiPreferencesSchema>, template?: string): string {
  const readingLevel = preferences?.readingLevel ?? "standard";
  const tone = preferences?.tone ?? "neutral";
  const interviewerRole = preferences?.interviewerRole ?? "workflow designer";
  // Single source of truth for the default: DEFAULT_SYSTEM_PROMPT (ICW-15).
  const baseTemplate = template ?? DEFAULT_SYSTEM_PROMPT;
  return baseTemplate
    .replace(/{{interviewerRole}}/g, interviewerRole)
    .replace(/{{readingLevel}}/g, readingLevel)
    .replace(/{{tone}}/g, tone);
}
/**
 * Build workflow context summary
 */
function buildWorkflowContext(workflow: WorkflowWithDetails): string {
  const sections = workflow.sections ?? [];
  const logicRules = workflow.logicRules ?? [];
  let context = `Workflow: ${workflow.title}
Status: ${workflow.status}
Sections: ${sections.length}
`;
  for (const section of sections) {
    const steps = section.steps ?? [];
    context += `\n### Section ${section.order}: ${section.title}
Steps: ${steps.length}
`;
    for (const step of steps) {
      context += `  - [${step.type}] ${step.title}`;
      if (step.alias) { context += ` (alias: ${step.alias})`; }
      if (step.required) { context += ` [REQUIRED]`; }
      if (step.visibleIf) { context += ` [CONDITIONAL]`; }
      context += '\n';
    }
  }
  if (logicRules.length > 0) {
    context += `\nLogic Rules: ${logicRules.length}\n`;
  }
  return context;
}

import { z } from "zod";

import type { Workflow, Section, Step, LogicRule } from "@shared/schema";

import { createLogger } from "../../logger";
import { hybridAuth } from "../../middleware/auth";
import { aiWorkflowRateLimit, aiDailyRateLimit } from "../../middleware/ai.middleware";
import { aiWorkflowEditRequestSchema, aiPreferencesSchema, aiModelResponseSchema } from "../../schemas/aiWorkflowEdit.schema";
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
import type { AiModelResponse } from "../../schemas/aiWorkflowEdit.schema";
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
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, complexity, sonarjs/cognitive-complexity
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
        // 3. Create BEFORE snapshot.
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
        // 4. (Optional) Check permissions (handled by service mostly but context useful)
        // 5. Call AI model (Gemini)
        let aiResponse: AiModelResponse;
        try {
          const systemPromptTemplate = await aiSettingsService.getEffectivePrompt();
          aiResponse = await callAiForWorkflowEdit(
            requestData.userMessage,
            currentWorkflow,
            requestData.preferences,
            systemPromptTemplate
          );
        } catch (error) {
          logger.error({ error, workflowId }, "AI model call failed");

          if (error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'VALIDATION_ERROR') {
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
          return res.status(500).json({
            success: false,
            error: "AI model call failed",
          });
        }
        // 6. Apply patch operations
        const { summary: _summary, errors } = await workflowPatchService.applyOps(
          workflowId,
          userId,
          aiResponse.ops
        );
        if (errors.length > 0) {
          logger.error({ errors, workflowId }, "Failed to apply some AI operations");
          return res.status(400).json({
            success: false,
            error: "Failed to apply operations",
            details: errors,
          });
        }

        // 7. Get updated workflow
        const updatedWorkflow = await workflowService.getWorkflowWithDetails(workflowId, userId);
        // 8. Create new version (DRAFT)
        const graphJson = convertWorkflowToGraphJson(updatedWorkflow);
        let draftVersion;
        let noChanges = false;
        try {
          draftVersion = await versionService.createDraftVersion(
            workflowId,
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            graphJson as any,
            `AI Edit: ${requestData.userMessage.substring(0, 30)}${requestData.userMessage.length > 30 ? '...' : ''}`,
            {
              source: 'ai-edit',
              aiOpsCount: aiResponse.ops.length,
              aiGenerated: true,
              userPrompt: requestData.userMessage,
              confidence: aiResponse.confidence
              // snapshots added after creation to avoid circular dep
            }
          );
          if (!draftVersion) {
            noChanges = true;
          } else {
            // If workflow was active, revert to draft (because we made changes)
            if (updatedWorkflow.status === 'active') {
              await workflowService.changeStatus(workflowId, userId, 'draft');
            }
            // 9. Create AFTER snapshot
            let afterSnapshot;
            try {
              afterSnapshot = await snapshotService.createSnapshot(
                workflowId,
                `AI Edit AFTER: ${draftVersion.versionNumber}`,
                draftVersion.id
              );
              // 10. Update version metadata with snapshot IDs
              await versionService.updateAiMetadata(draftVersion.id, {
                source: 'ai-edit',
                aiOpsCount: aiResponse.ops.length,
                aiGenerated: true,
                userPrompt: requestData.userMessage,
                confidence: aiResponse.confidence,
                beforeSnapshotId: beforeSnapshot?.id,
                afterSnapshotId: afterSnapshot?.id
              });
            } catch (error) {
              logger.error({ error, workflowId }, "Failed to create after snapshot or update metadata");
            }
          }
        } catch (error) {
          logger.error({ error, workflowId }, "Failed to create draft version after AI edit");
          // Proceed, but warn?
        }
        res.status(200).json({
          success: true,
          data: {
            workflowId: updatedWorkflow.id,
            versionId: draftVersion?.id ?? null,
            versionNumber: draftVersion?.versionNumber,
            noChanges,
            summary: aiResponse.summary,
            warnings: aiResponse.warnings ?? [],
            questions: aiResponse.questions ?? []
          }
        });
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
/**
 * Convert workflow object to graphJson format for versioning
 */
function convertWorkflowToGraphJson(workflow: WorkflowWithDetails): Record<string, unknown> {
  // For now, return a simplified representation
  // In production, this would match the actual graphJson schema used by the builder
  return {
    pages: (workflow.sections ?? []).map((section: Section & { steps: Step[] }) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      blocks: (section.steps ?? []).map((step: Step) => ({
        id: step.id,
        type: step.type,
        title: step.title,
        alias: step.alias ?? undefined,
        required: step.required,
        config: step.config,
        visibleIf: step.visibleIf,
        defaultValue: step.defaultValue,
        order: step.order,
      })),
    })),
    metadata: {
      title: workflow.title,
      description: workflow.description,
    },
  };
}


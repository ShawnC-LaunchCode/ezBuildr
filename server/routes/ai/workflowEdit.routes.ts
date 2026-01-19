import { GoogleGenerativeAI } from "@google/generative-ai";
import { createLogger } from "../../logger";
import { hybridAuth, type  } from "../../middleware/auth";
import { aiWorkflowEditRequestSchema } from "../../schemas/aiWorkflowEdit.schema";
import { aiSettingsService } from "../../services/AiSettingsService";
import { snapshotService } from "../../services/SnapshotService";
import { versionService } from "../../services/VersionService";
import { workflowPatchService } from "../../services/WorkflowPatchService";
import { workflowService } from "../../services/WorkflowService";
import type { AiWorkflowEditResponse, AiModelResponse } from "../../schemas/aiWorkflowEdit.schema";
import type { Express, Request, Response } from "express";
const logger = createLogger({ module: "ai-workflow-edit-routes" });
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
    async (req: any, res: Response) => {
      console.log(`[DEBUG] Entered workflowEdit route handler. WorkflowId: ${req.params.workflowId}`);
      try {
        const { workflowId } = req.params;
        const userId = req.user.id;
        console.log(`[DEBUG] Validating request body`);
        // 1. Validate request body (merge param ID into body for schema validation)
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
        console.log(`[DEBUG] Fetching workflow details`);
        const currentWorkflow = await workflowService.getWorkflowWithDetails(workflowId, userId);
        if (!currentWorkflow) {
          return res.status(404).json({ success: false, error: "Workflow not found" });
        }
        // 3. Create BEFORE snapshot
        console.log(`[DEBUG] Creating snapshot`);
        let beforeSnapshot;
        try {
          beforeSnapshot = await snapshotService.createSnapshot(
            workflowId,
            `AI Edit BEFORE: ${new Date().toISOString()}`
          );
          console.log(`[DEBUG] Snapshot created`);
        } catch (error) {
          logger.error({ error, workflowId }, "Failed to create before snapshot");
          // Continue? Or fail? Usually fail safety.
          // For now assume success or log
        }
        // 4. (Optional) Check permissions (handled by service mostly but context useful)
        // 5. Call AI model (Gemini)
        console.log(`[DEBUG] Calling Gemini`);
        let aiResponse: AiModelResponse;
        try {
          const systemPromptTemplate = await aiSettingsService.getEffectivePrompt({ userId });
          aiResponse = await callGeminiForWorkflowEdit(
            requestData.userMessage,
            currentWorkflow,
            requestData.preferences,
            systemPromptTemplate
          );
          console.log(`[DEBUG] Gemini returned`);
        } catch (error) {
          logger.error({ error, workflowId }, "AI model call failed");
          return res.status(500).json({
            success: false,
            error: `AI model call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
        // 6. Apply patch operations
        console.log(`[DEBUG] Calling applyOps with ${aiResponse.ops.length} ops`);
        try {
          const { summary, errors } = await workflowPatchService.applyOps(
            workflowId,
            userId,
            aiResponse.ops
          );
          console.log(`[DEBUG] applyOps returned. Errors: ${errors.length}`);
          if (errors.length > 0) {
            logger.error({ errors, workflowId }, "Failed to apply some AI operations");
            return res.status(400).json({
              success: false,
              error: "Failed to apply operations",
              details: errors,
            });
          }
        } catch (applyError) {
          console.error("Debug: applyOps THREW error:", applyError);
          throw applyError;
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
            graphJson,
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
            versionId: draftVersion?.id || null,
            versionNumber: draftVersion?.versionNumber,
            noChanges,
            summary: aiResponse.summary,
            warnings: aiResponse.warnings || [],
            questions: aiResponse.questions || []
          }
        });
      } catch (error) {
        logger.error({ error, workflowId: req.params.workflowId }, "Error in AI workflow edit");
        const message = error instanceof Error ? error.message : "Failed to process AI edit";
        // Map common validation/duplicate errors to 400
        const isUserError = message.includes("Access denied") ||
          message.includes("already exists") ||
          message.includes("Duplicate") ||
          message.includes("duplicate key");
        const status = isUserError ? (message.includes("Access denied") ? 403 : 400) : 500;
        res.status(status).json({ success: false, error: message });
      }
    }
  );
}
/**
 * Call Gemini API to generate workflow edit operations
 */
async function callGeminiForWorkflowEdit(
  userMessage: string,
  currentWorkflow: any,
  preferences?: any,
  systemPromptTemplate?: string
): Promise<AiModelResponse> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  let genAI;
  try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
  } catch (err: any) {
    logger.error({ err }, "GoogleGenerativeAI Constructor Error");
    throw err;
  }
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  // Build system prompt
  const systemPrompt = buildSystemPrompt(preferences, systemPromptTemplate);
  // Build workflow context
  const workflowContext = buildWorkflowContext(currentWorkflow);
  // Full prompt
  const fullPrompt = `${systemPrompt}
## Current Workflow State
${workflowContext}
## User Request
${userMessage}
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
  logger.debug({ promptLength: fullPrompt.length }, "Calling Gemini API");
  const result = await model.generateContent(fullPrompt);
  const responseText = result.response.text();
  logger.debug({ responseLength: responseText.length }, "Received Gemini response");
  // Parse JSON response
  let parsedResponse: any;
  try {
    // Try to extract JSON if wrapped in markdown code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    parsedResponse = JSON.parse(jsonText);
  } catch (error) {
    logger.error({ error, responseText }, "Failed to parse Gemini JSON response");
    throw new Error("Invalid JSON response from AI model");
  }
  // Validate structure (basic check)
  if (!parsedResponse.summary || !parsedResponse.ops || typeof parsedResponse.confidence !== 'number') {
    throw new Error("Invalid AI response structure");
  }
  return parsedResponse as AiModelResponse;
}
/**
 * Build system prompt based on preferences
 */
function buildSystemPrompt(preferences?: any, template?: string): string {
  const readingLevel = preferences?.readingLevel || "standard";
  const tone = preferences?.tone || "neutral";
  const interviewerRole = preferences?.interviewerRole || "workflow designer";
  const baseTemplate = template || `You are an expert {{interviewerRole}} helping to build and refine workflow automation systems.
Your task is to analyze the user's request and generate structured operations to modify the workflow.
Guidelines:
- Reading level: {{readingLevel}}
- Tone: {{tone}}
- Generate clear, concise operation steps
- Avoid destructive DataVault operations (no table/column drops, no data deletion)
- Use tempId for new entities that might be referenced by other ops in the same batch
- Provide confidence score based on request clarity
- Ask questions if requirements are ambiguous
- Include warnings for potentially breaking changes
Available operation types:
- workflow.setMetadata
- section.create/update/delete/reorder
- step.create/update/delete/move/setVisibleIf/setRequired
- logicRule.create/update/delete (stub)
- document.add/update/setConditional/bindFields (stub)
- datavault.createTable/addColumns/createWritebackMapping (stub)`;
  return baseTemplate
    .replace(/{{interviewerRole}}/g, interviewerRole)
    .replace(/{{readingLevel}}/g, readingLevel)
    .replace(/{{tone}}/g, tone);
}
/**
 * Build workflow context summary
 */
function buildWorkflowContext(workflow: any): string {
  const sections = workflow.sections || [];
  const logicRules = workflow.logicRules || [];
  let context = `Workflow: ${workflow.title}
Status: ${workflow.status}
Sections: ${sections.length}
`;
  for (const section of sections) {
    const steps = section.steps || [];
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
function convertWorkflowToGraphJson(workflow: any): any {
  // For now, return a simplified representation
  // In production, this would match the actual graphJson schema used by the builder
  return {
    pages: (workflow.sections || []).map((section: any) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      blocks: (section.steps || []).map((step: any) => ({
        id: step.id,
        type: step.type,
        title: step.title,
        alias: step.alias,
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
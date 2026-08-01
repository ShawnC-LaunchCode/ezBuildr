import { randomUUID } from "crypto";

import type { Section, Workflow } from "@shared/schema";


import { IntakeConfigSchema } from "../../shared/zod-schemas.js";
import { RUN_TOKEN_CONFIG } from "../config/auth";
import { createLogger } from "../logger";
import { hashToken } from "../utils/encryption";
import { createError } from "../utils/errors";
import { filterPrefillValues } from "../utils/prefillFilter";
import { assertStepValueSizesWithinLimit } from "../utils/valueSizeLimit";
import { workflowRepository, workflowRunRepository, stepValueRepository, sectionRepository, projectRepository, stepRepository } from "../repositories";

import { CaptchaService } from "./CaptchaService.js";
import { intakeReceiptService } from "./IntakeReceiptService";
import { runService } from "./RunService";

import type { IntakeConfig, IntakeSubmitResult, CaptchaResponse } from "../../shared/types/intake.js";

const logger = createLogger({ module: "intake-service" });

/**
 * Service for public intake portal
 * Handles anonymous and authenticated workflow runs via public links
 */
export class IntakeService {
  /**
   * Get published workflow by slug (for intake portal)
   * Returns workflow metadata and tenant branding info
   */
  async getPublishedWorkflow(slug: string): Promise<{
    workflow: Workflow;
    sections: Section[];
    intakeConfig: IntakeConfig;
    tenantBranding?: {
      name: string;
      logo?: string;
      primaryColor?: string;
    };
  }> {
    // PERFORMANCE FIX: Use indexed query instead of loading all workflows
    const workflow = await workflowRepository.findBySlug(slug);

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (!workflow.isPublic) {
      throw new Error("Workflow is not public");
    }

    // Get workflow sections and steps
    const sections = await sectionRepository.findByWorkflowId(workflow.id);

    // Parse intakeConfig (JSONB field)
    const parsedConfig = IntakeConfigSchema.safeParse(workflow.intakeConfig);
    const intakeConfig: IntakeConfig = parsedConfig.success ? parsedConfig.data : {};
    if (!parsedConfig.success) {
      logger.warn({ workflowId: workflow.id, error: parsedConfig.error }, "Invalid intake configuration found");
    }

    // Get tenant branding (if projectId exists)
    let tenantBranding;
    if (workflow.projectId) {
      const project = await projectRepository.findById(workflow.projectId);
      if (project?.name) {
        // TODO: Add tenant branding fields to schema
        tenantBranding = {
          name: project.name,
        };
      }
    }

    return {
      workflow,
      sections,
      intakeConfig,
      tenantBranding,
    };
  }

  /**
   * Create a new intake run
   * Supports both authenticated and anonymous runs
   * Stage 12.5: Supports URL-based prefill
   */

  async createIntakeRun(
    slug: string,
    userId?: string,
    initialAnswers?: Record<string, unknown>,
    prefillParams?: Record<string, string>
  ): Promise<{ runId: string; runToken: string }> {
    // PERFORMANCE FIX: Use indexed query instead of loading all workflows
    const workflow = await workflowRepository.findBySlug(slug);

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (!workflow.isPublic) {
      throw new Error("Workflow is not public");
    }

    // Check if login is required
    if (workflow.requireLogin && !userId) {
      throw new Error("Authentication required for this workflow");
    }

    // Parse intakeConfig
    const parsedConfig = IntakeConfigSchema.safeParse(workflow.intakeConfig);
    const intakeConfig: IntakeConfig = parsedConfig.success ? parsedConfig.data : {};

    // Generate run token. The plaintext is returned to the caller; only its
    // hash is persisted.
    const runToken = randomUUID();
    const runTokenHash = hashToken(runToken);
    const tokenExpiresAt = new Date(Date.now() + RUN_TOKEN_CONFIG.EXPIRY_MS);

    // Create run
    const run = await workflowRunRepository.create({
      workflowId: workflow.id,
      runToken: runTokenHash,
      tokenExpiresAt,
      createdBy: userId ? `creator:${userId}` : "anon",
      completed: false,
      metadata: {
        intake: true,
        slug,
      },
    });

    // Handle prefill from URL parameters (Stage 12.5). Allowlist enforcement
    // (RUN2-6) lives in the shared filterPrefillValues helper so this same
    // check applies everywhere a run can be seeded from caller-supplied data.
    const filteredPrefillParams = filterPrefillValues(intakeConfig, prefillParams);
    if (Object.keys(filteredPrefillParams).length > 0) {
      // Get all steps to map aliases to stepIds
      const allSteps = await stepRepository.findByWorkflowIdWithAliases(workflow.id);
      const aliasToStepId = new Map<string, string>();
      for (const step of allSteps) {
        if (step.alias) {
          aliasToStepId.set(step.alias, step.id);
        }
      }

      // Process prefill parameters
      const prefillData = [];
      for (const [key, value] of Object.entries(filteredPrefillParams)) {
        const stepId = aliasToStepId.get(key);
        if (stepId) {
          prefillData.push({ runId: run.id, stepId, value });
          logger.info({ runId: run.id, key, stepId }, "Prefilled value from URL");
        }
      }
      if (prefillData.length > 0) {
        await stepValueRepository.upsertMany(prefillData);
      }
    }

    // Save initial answers if provided (takes precedence over prefill)
    if (initialAnswers) {
      const initialData = Object.entries(initialAnswers).map(([stepId, value]) => ({
        runId: run.id,
        stepId,
        value,
      }));
      if (initialData.length > 0) {
        await stepValueRepository.upsertMany(initialData);
      }
    }

    logger.info({ runId: run.id, slug, userId }, "Created intake run");

    return {
      runId: run.id,
      runToken, // plaintext for the client; DB holds only the hash
    };
  }

  /**
   * Save intake run progress (partial answers)
   * Used for draft/resume functionality
   */
  async saveIntakeProgress(
    runToken: string,
    answers: Record<string, unknown>
  ): Promise<void> {
    // Find run by token
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    // Reject expired run tokens. NULL expiry = grandfathered (never expires).
    if (run.tokenExpiresAt && run.tokenExpiresAt < new Date()) {
      throw new Error("Run token has expired");
    }

    if (run.completed) {
      throw createError.runCompleted();
    }

    // Save all answers
    const answersData = Object.entries(answers).map(([stepId, value]) => ({
      runId: run.id,
      stepId,
      value,
    }));
    if (answersData.length > 0) {
      assertStepValueSizesWithinLimit(answersData);
      await stepValueRepository.upsertMany(answersData);
    }

    logger.info({ runId: run.id, answerCount: Object.keys(answers).length }, "Saved intake progress");
  }

  /**
   * Submit intake run (complete the workflow)
   * Stage 12.5: Validates CAPTCHA and sends email receipt
   */
  async submitIntakeRun(
    runToken: string,
    finalAnswers: Record<string, unknown>,
    captchaResponse?: CaptchaResponse
  ): Promise<IntakeSubmitResult> {
    // Find run by token
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    // Reject expired run tokens. NULL expiry = grandfathered (never expires).
    if (run.tokenExpiresAt && run.tokenExpiresAt < new Date()) {
      throw new Error("Run token has expired");
    }

    if (run.completed) {
      throw createError.runCompleted();
    }

    // Get workflow to check intakeConfig
    const workflow = await workflowRepository.findById(run.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const parsedConfig = IntakeConfigSchema.safeParse(workflow.intakeConfig);
    const intakeConfig: IntakeConfig = parsedConfig.success ? parsedConfig.data : {};

    // Stage 12.5: Validate CAPTCHA if required
    if (intakeConfig.requireCaptcha) {
      if (!captchaResponse) {
        throw new Error("CAPTCHA response required");
      }

      const captchaResult = await CaptchaService.validateCaptcha(
        captchaResponse,
        workflow.id
      );

      if (!captchaResult.valid) {
        return {
          runId: run.id,
          status: "error",
          errors: [captchaResult.error ?? "CAPTCHA validation failed"],
        };
      }
    }

    // Save final answers
    const finalAnswersData = Object.entries(finalAnswers).map(([stepId, value]) => ({
      runId: run.id,
      stepId,
      value,
    }));
    if (finalAnswersData.length > 0) {
      assertStepValueSizesWithinLimit(finalAnswersData);
      await stepValueRepository.upsertMany(finalAnswersData);
    }

    // Complete the run using RunService
    try {
      await runService.completeRunNoAuth(run.id);

      logger.info({ runId: run.id }, "Completed intake run");

      const result: IntakeSubmitResult = {
        runId: run.id,
        status: "success",
      };

      // Stage 12.5: Send email receipt via separate service
      const receiptResult = await intakeReceiptService.sendReceipt(run.id, workflow, intakeConfig);
      if (receiptResult.attempted) {
        result.emailReceipt = {
          attempted: true,
          to: receiptResult.to,
          success: receiptResult.success,
          error: receiptResult.error
        };
      }



      return result;
    } catch (error) {
      logger.error({ error, runId: run.id }, "Failed to complete intake run");
      return {
        runId: run.id,
        status: "error",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }



  /**
   * Get intake run status
   * Used for polling after submission
   */
  async getIntakeRunStatus(runToken: string): Promise<{
    status: string;
    runId?: string;
    error?: string;
    completed: boolean;
  }> {
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    return {
      status: run.completed ? "completed" : "pending",
      runId: run.id,
      completed: run.completed ?? false,
    };
  }
}

export const intakeService = new IntakeService();

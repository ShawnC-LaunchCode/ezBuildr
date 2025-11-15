import { workflowRepository, workflowRunRepository, stepValueRepository, sectionRepository, projectRepository, stepRepository } from "../repositories";
import type { Workflow, WorkflowRun, InsertStepValue } from "@shared/schema";
import { randomUUID } from "crypto";
import { runService } from "./RunService";
import { createLogger } from "../logger";
import type { IntakeConfig, IntakeSubmitResult, CaptchaResponse } from "../../shared/types/intake.js";
import { CaptchaService } from "./CaptchaService.js";
import { sendIntakeReceipt } from "./emailService.js";

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
    sections: any[];
    intakeConfig: IntakeConfig;
    tenantBranding?: {
      name: string;
      logo?: string;
      primaryColor?: string;
    };
  }> {
    // Find workflow by slug
    const workflows = await workflowRepository.findAll();
    const workflow = workflows.find(w => w.slug === slug);

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (!workflow.isPublic) {
      throw new Error("Workflow is not public");
    }

    // Get workflow sections and steps
    const sections = await sectionRepository.findByWorkflowId(workflow.id);

    // Parse intakeConfig (JSONB field)
    const intakeConfig: IntakeConfig = (workflow.intakeConfig as any) || {};

    // Get tenant branding (if projectId exists)
    let tenantBranding;
    if (workflow.projectId) {
      const project = await projectRepository.findById(workflow.projectId);
      if (project) {
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
    initialAnswers?: Record<string, any>,
    prefillParams?: Record<string, string>
  ): Promise<{ runId: string; runToken: string }> {
    // Get workflow by slug
    const workflows = await workflowRepository.findAll();
    const workflow = workflows.find(w => w.slug === slug);

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
    const intakeConfig: IntakeConfig = (workflow.intakeConfig as any) || {};

    // Generate run token
    const runToken = randomUUID();

    // Create run
    const run = await workflowRunRepository.create({
      workflowId: workflow.id,
      runToken,
      createdBy: userId ? `creator:${userId}` : "anon",
      completed: false,
      metadata: {
        intake: true,
        slug,
      },
    } as any);

    // Handle prefill from URL parameters (Stage 12.5)
    if (prefillParams && intakeConfig.allowPrefill && intakeConfig.allowedPrefillKeys) {
      // Get all steps to map aliases to stepIds
      const allSteps = await (stepRepository as any).findByWorkflowId(workflow.id);
      const aliasToStepId = new Map<string, string>();
      for (const step of allSteps) {
        if (step.alias) {
          aliasToStepId.set(step.alias, step.id);
        }
      }

      // Process prefill parameters
      for (const [key, value] of Object.entries(prefillParams)) {
        // Only prefill if key is in allowedPrefillKeys
        if (intakeConfig.allowedPrefillKeys.includes(key)) {
          const stepId = aliasToStepId.get(key);
          if (stepId) {
            await stepValueRepository.upsert({
              runId: run.id,
              stepId,
              value,
            });
            logger.info({ runId: run.id, key, stepId }, "Prefilled value from URL");
          }
        }
      }
    }

    // Save initial answers if provided (takes precedence over prefill)
    if (initialAnswers) {
      for (const [stepId, value] of Object.entries(initialAnswers)) {
        await stepValueRepository.upsert({
          runId: run.id,
          stepId,
          value,
        });
      }
    }

    logger.info({ runId: run.id, slug, userId }, "Created intake run");

    return {
      runId: run.id,
      runToken: run.runToken,
    };
  }

  /**
   * Save intake run progress (partial answers)
   * Used for draft/resume functionality
   */
  async saveIntakeProgress(
    runToken: string,
    answers: Record<string, any>
  ): Promise<void> {
    // Find run by token
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Save all answers
    for (const [stepId, value] of Object.entries(answers)) {
      await stepValueRepository.upsert({
        runId: run.id,
        stepId,
        value,
      });
    }

    logger.info({ runId: run.id, answerCount: Object.keys(answers).length }, "Saved intake progress");
  }

  /**
   * Submit intake run (complete the workflow)
   * Stage 12.5: Validates CAPTCHA and sends email receipt
   */
  async submitIntakeRun(
    runToken: string,
    finalAnswers: Record<string, any>,
    captchaResponse?: CaptchaResponse
  ): Promise<IntakeSubmitResult> {
    // Find run by token
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get workflow to check intakeConfig
    const workflow = await workflowRepository.findById(run.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const intakeConfig: IntakeConfig = (workflow.intakeConfig as any) || {};

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
          errors: [captchaResult.error || "CAPTCHA validation failed"],
        };
      }
    }

    // Save final answers
    for (const [stepId, value] of Object.entries(finalAnswers)) {
      await stepValueRepository.upsert({
        runId: run.id,
        stepId,
        value,
      });
    }

    // Complete the run using RunService
    try {
      await runService.completeRunNoAuth(run.id);

      logger.info({ runId: run.id }, "Completed intake run");

      const result: IntakeSubmitResult = {
        runId: run.id,
        status: "success",
      };

      // Stage 12.5: Send email receipt if configured
      if (intakeConfig.sendEmailReceipt && intakeConfig.receiptEmailVar) {
        // Get all step values to find the email
        const allSteps = await (stepRepository as any).findByWorkflowId(workflow.id);
        const emailStep = allSteps.find((s: any) => s.alias === intakeConfig.receiptEmailVar);

        if (emailStep) {
          const stepValues = await stepValueRepository.findByRunId(run.id);
          const emailValue = stepValues.find(sv => sv.stepId === emailStep.id);

          if (emailValue && typeof emailValue.value === "string") {
            const email = emailValue.value;

            // Build summary (non-sensitive fields only)
            const summary: Record<string, any> = {};
            for (const step of allSteps) {
              if (step.alias && !this.isSensitiveField(step.alias)) {
                const value = stepValues.find(sv => sv.stepId === step.id);
                if (value) {
                  summary[step.alias] = value.value;
                }
              }
            }

            // Send receipt
            const emailResult = await sendIntakeReceipt({
              to: email,
              tenantId: workflow.projectId || "default",
              workflowId: workflow.id,
              workflowName: workflow.title,
              runId: run.id,
              summary,
            });

            result.emailReceipt = {
              attempted: true,
              to: email,
              success: emailResult.success,
              error: emailResult.error,
            };

            logger.info({ runId: run.id, email, success: emailResult.success }, "Sent intake receipt");
          } else {
            logger.warn({ runId: run.id, receiptEmailVar: intakeConfig.receiptEmailVar }, "Email field not found or invalid");
          }
        }
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
   * Check if a field name is sensitive (should not be included in email)
   */
  private isSensitiveField(fieldName: string): boolean {
    const lowerName = fieldName.toLowerCase();
    return (
      lowerName.includes("password") ||
      lowerName.includes("ssn") ||
      lowerName.includes("social_security") ||
      lowerName.includes("credit_card") ||
      lowerName.includes("cvv") ||
      lowerName.includes("secret") ||
      lowerName.includes("token")
    );
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
      completed: run.completed,
    };
  }
}

export const intakeService = new IntakeService();

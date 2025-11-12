import { workflowRepository, workflowRunRepository, stepValueRepository, sectionRepository, projectRepository } from "../repositories";
import type { Workflow, WorkflowRun, InsertStepValue } from "@shared/schema";
import { randomUUID } from "crypto";
import { runService } from "./RunService";
import { createLogger } from "../logger";

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
      tenantBranding,
    };
  }

  /**
   * Create a new intake run
   * Supports both authenticated and anonymous runs
   */
  async createIntakeRun(
    slug: string,
    userId?: string,
    initialAnswers?: Record<string, any>
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
    });

    // Save initial answers if provided
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
   * Returns run ID and status
   */
  async submitIntakeRun(
    runToken: string,
    finalAnswers: Record<string, any>
  ): Promise<{ runId: string; status: string }> {
    // Find run by token
    const run = await workflowRunRepository.findByToken(runToken);

    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
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

      return {
        runId: run.id,
        status: "success",
      };
    } catch (error) {
      logger.error({ error, runId: run.id }, "Failed to complete intake run");
      throw error;
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
      completed: run.completed,
    };
  }
}

export const intakeService = new IntakeService();

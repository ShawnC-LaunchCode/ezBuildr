import {
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  type DbTransaction,
} from "../repositories";
import type { Workflow, InsertWorkflow, Section, Step, LogicRule } from "@shared/schema";

/**
 * Service layer for workflow-related business logic
 */
export class WorkflowService {
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;

  constructor(
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository
  ) {
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
  }

  /**
   * Verify user owns the workflow
   */
  async verifyOwnership(workflowId: string, userId: string): Promise<Workflow> {
    const workflow = await this.workflowRepo.findById(workflowId);

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (workflow.creatorId !== userId) {
      throw new Error("Access denied - you do not own this workflow");
    }

    return workflow;
  }

  /**
   * Create a new workflow with a default first section
   */
  async createWorkflow(data: InsertWorkflow, creatorId: string): Promise<Workflow> {
    return await this.workflowRepo.transaction(async (tx) => {
      // Create workflow
      const workflow = await this.workflowRepo.create(
        {
          ...data,
          creatorId,
          status: 'draft',
        },
        tx
      );

      // Create default first section
      await this.sectionRepo.create(
        {
          workflowId: workflow.id,
          title: 'Section 1',
          order: 1,
        },
        tx
      );

      return workflow;
    });
  }

  /**
   * Get workflow by ID with full details (sections, steps, rules)
   */
  async getWorkflowWithDetails(workflowId: string, userId: string) {
    const workflow = await this.verifyOwnership(workflowId, userId);
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);

    // Group steps by section
    const sectionsWithSteps = sections.map((section) => ({
      ...section,
      steps: steps.filter((step) => step.sectionId === section.id),
    }));

    return {
      ...workflow,
      sections: sectionsWithSteps,
      logicRules,
    };
  }

  /**
   * List workflows for a user
   */
  async listWorkflows(creatorId: string): Promise<Workflow[]> {
    return await this.workflowRepo.findByCreatorId(creatorId);
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    data: Partial<InsertWorkflow>
  ): Promise<Workflow> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowRepo.update(workflowId, data);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    await this.verifyOwnership(workflowId, userId);
    await this.workflowRepo.delete(workflowId);
  }

  /**
   * Change workflow status
   */
  async changeStatus(
    workflowId: string,
    userId: string,
    status: 'draft' | 'active' | 'archived'
  ): Promise<Workflow> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowRepo.update(workflowId, { status, updatedAt: new Date() });
  }
}

// Singleton instance
export const workflowService = new WorkflowService();

import { stepRepository, sectionRepository } from "../repositories";
import type { Step, InsertStep } from "@shared/schema";
import { workflowService } from "./WorkflowService";

/**
 * Service layer for step-related business logic
 */
export class StepService {
  private stepRepo: typeof stepRepository;
  private sectionRepo: typeof sectionRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    stepRepo?: typeof stepRepository,
    sectionRepo?: typeof sectionRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.stepRepo = stepRepo || stepRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.workflowSvc = workflowSvc || workflowService;
  }

  /**
   * Validate that an alias is unique within a workflow
   */
  private async validateAliasUniqueness(
    workflowId: string,
    alias: string | null | undefined,
    excludeStepId?: string
  ): Promise<void> {
    // Skip validation if alias is null/undefined/empty
    if (!alias || alias.trim() === '') {
      return;
    }

    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map(s => s.id);

    // Get all steps for these sections
    const allSteps = await this.stepRepo.findBySectionIds(sectionIds);

    // Check if alias is already used by another step
    const conflictingStep = allSteps.find(
      s => s.alias?.toLowerCase() === alias.toLowerCase() && s.id !== excludeStepId
    );

    if (conflictingStep) {
      throw new Error(
        `Alias "${alias}" is already in use by another step in this workflow. Please choose a unique alias.`
      );
    }
  }

  /**
   * Create a new step
   */
  async createStep(
    workflowId: string,
    sectionId: string,
    userId: string,
    data: Omit<InsertStep, 'sectionId'>
  ): Promise<Step> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Validate alias uniqueness if provided
    if (data.alias) {
      await this.validateAliasUniqueness(workflowId, data.alias);
    }

    // Get current steps to determine next order
    const existingSteps = await this.stepRepo.findBySectionId(sectionId);
    const nextOrder = existingSteps.length > 0
      ? Math.max(...existingSteps.map((s) => s.order)) + 1
      : 1;

    return await this.stepRepo.create({
      ...data,
      sectionId,
      order: data.order ?? nextOrder,
    });
  }

  /**
   * Update step
   */
  async updateStep(
    stepId: string,
    workflowId: string,
    userId: string,
    data: Partial<InsertStep>
  ): Promise<Step> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    // Verify step's section belongs to workflow
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== workflowId) {
      throw new Error("Step not found in this workflow");
    }

    // Validate alias uniqueness if alias is being changed
    if (data.alias !== undefined && data.alias !== step.alias) {
      await this.validateAliasUniqueness(workflowId, data.alias, stepId);
    }

    return await this.stepRepo.update(stepId, data);
  }

  /**
   * Delete step
   */
  async deleteStep(stepId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    // Verify step's section belongs to workflow
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== workflowId) {
      throw new Error("Step not found in this workflow");
    }

    await this.stepRepo.delete(stepId);
  }

  /**
   * Reorder steps within a section
   */
  async reorderSteps(
    workflowId: string,
    sectionId: string,
    userId: string,
    stepOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Update each step's order
    for (const { id, order } of stepOrders) {
      await this.stepRepo.updateOrder(id, order);
    }
  }

  /**
   * Get steps for a section
   */
  async getSteps(workflowId: string, sectionId: string, userId: string): Promise<Step[]> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    return await this.stepRepo.findBySectionId(sectionId);
  }

  // ===================================================================
  // SIMPLIFIED METHODS (automatically look up workflowId from section/step)
  // ===================================================================

  /**
   * Get steps for a section (workflow looked up automatically)
   */
  async getStepsBySectionId(sectionId: string, userId: string): Promise<Step[]> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Use the existing method with the workflowId
    return await this.getSteps(section.workflowId, sectionId, userId);
  }

  /**
   * Create a new step (workflow looked up automatically)
   */
  async createStepBySectionId(
    sectionId: string,
    userId: string,
    data: Omit<InsertStep, 'sectionId'>
  ): Promise<Step> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Use the existing method with the workflowId
    return await this.createStep(section.workflowId, sectionId, userId, data);
  }

  /**
   * Reorder steps (workflow looked up automatically)
   */
  async reorderStepsBySectionId(
    sectionId: string,
    userId: string,
    stepOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Use the existing method with the workflowId
    await this.reorderSteps(section.workflowId, sectionId, userId, stepOrders);
  }

  /**
   * Update a step (workflow looked up automatically)
   */
  async updateStepById(
    stepId: string,
    userId: string,
    data: Partial<InsertStep>
  ): Promise<Step> {
    // Look up the step to get its section
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Use the existing method with the workflowId
    return await this.updateStep(stepId, section.workflowId, userId, data);
  }

  /**
   * Delete a step (workflow looked up automatically)
   */
  async deleteStepById(stepId: string, userId: string): Promise<void> {
    // Look up the step to get its section
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    // Use the existing method with the workflowId
    await this.deleteStep(stepId, section.workflowId, userId);
  }
}

// Singleton instance
export const stepService = new StepService();

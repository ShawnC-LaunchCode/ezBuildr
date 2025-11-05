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
}

// Singleton instance
export const stepService = new StepService();

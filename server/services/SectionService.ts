import { sectionRepository, workflowRepository, stepRepository } from "../repositories";
import type { Section, InsertSection } from "@shared/schema";
import { workflowService } from "./WorkflowService";

/**
 * Service layer for section-related business logic
 */
export class SectionService {
  private sectionRepo: typeof sectionRepository;
  private workflowRepo: typeof workflowRepository;
  private stepRepo: typeof stepRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    sectionRepo?: typeof sectionRepository,
    workflowRepo?: typeof workflowRepository,
    stepRepo?: typeof stepRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.sectionRepo = sectionRepo || sectionRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.workflowSvc = workflowSvc || workflowService;
  }

  /**
   * Create a new section
   */
  async createSection(
    workflowId: string,
    userId: string,
    data: Omit<InsertSection, 'workflowId'>
  ): Promise<Section> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Get current sections to determine next order
    const existingSections = await this.sectionRepo.findByWorkflowId(workflowId);
    const nextOrder = existingSections.length > 0
      ? Math.max(...existingSections.map((s) => s.order)) + 1
      : 1;

    return await this.sectionRepo.create({
      ...data,
      workflowId,
      order: data.order ?? nextOrder,
    });
  }

  /**
   * Update section
   */
  async updateSection(
    sectionId: string,
    workflowId: string,
    userId: string,
    data: Partial<InsertSection>
  ): Promise<Section> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    return await this.sectionRepo.update(sectionId, data);
  }

  /**
   * Delete section
   */
  async deleteSection(sectionId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    await this.sectionRepo.delete(sectionId);
  }

  /**
   * Reorder sections
   */
  async reorderSections(
    workflowId: string,
    userId: string,
    sectionOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Update each section's order
    for (const { id, order } of sectionOrders) {
      await this.sectionRepo.updateOrder(id, order);
    }
  }

  /**
   * Get sections for a workflow
   */
  async getSections(workflowId: string, userId: string): Promise<Section[]> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);
    return await this.sectionRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get section with steps
   */
  async getSectionWithSteps(sectionId: string, workflowId: string, userId: string) {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error("Section not found");
    }

    const steps = await this.stepRepo.findBySectionId(sectionId);

    return {
      ...section,
      steps,
    };
  }

  /**
   * Update section by ID only (looks up workflow automatically)
   */
  async updateSectionById(
    sectionId: string,
    userId: string,
    data: Partial<InsertSection>
  ): Promise<Section> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    await this.workflowSvc.verifyOwnership(section.workflowId, userId);
    return await this.sectionRepo.update(sectionId, data);
  }

  /**
   * Delete section by ID only (looks up workflow automatically)
   */
  async deleteSectionById(sectionId: string, userId: string): Promise<void> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    await this.workflowSvc.verifyOwnership(section.workflowId, userId);
    await this.sectionRepo.delete(sectionId);
  }
}

// Singleton instance
export const sectionService = new SectionService();

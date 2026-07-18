import { LIMITS, LimitExceededError } from "@shared/limits";
import type { Section, InsertSection, Step } from "@shared/schema";
import { db } from "../db";

import { sectionRepository, workflowRepository, stepRepository } from "../repositories";

import { workflowService } from "./WorkflowService";

const SECTION_NOT_FOUND = "Section not found";

/** `order` is optional at the API boundary — the service auto-increments it. */
type CreateSectionData = Omit<InsertSection, 'workflowId' | 'order'> & Partial<Pick<InsertSection, 'order'>>;

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
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.stepRepo = stepRepo ?? stepRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
  }

  /**
   * Create a new section
   */
  async createSection(
    workflowId: string,
    userId: string,
    data: CreateSectionData
  ): Promise<Section> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Get current sections to determine next order
    const existingSections = await this.sectionRepo.findByWorkflowId(workflowId);
    if (existingSections.length >= LIMITS.MAX_SECTIONS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Section limit reached (${LIMITS.MAX_SECTIONS_PER_WORKFLOW} per workflow)`
      );
    }
    const nextOrder = existingSections.length > 0
      ? Math.max(...existingSections.map((s) => s.order)) + 1
      : 1;

    return this.sectionRepo.create({
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
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.sectionRepo.update(sectionId, data);
  }

  /**
   * Delete section
   */
  async deleteSection(sectionId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
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
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Update each section's order
    await db.transaction(async (tx) => {
      for (const { id, order } of sectionOrders) {
        await this.sectionRepo.updateOrder(id, workflowId, order, tx);
      }
    });
  }

  /**
   * Get sections for a workflow
   */
  async getSections(workflowId: string, userId: string): Promise<Section[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);
    return this.sectionRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get sections for a workflow without ownership check
   * Used for preview/run token authentication
   */
  async getSectionsByWorkflowId(workflowId: string): Promise<Section[]> {
    return this.sectionRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get section with steps
   */
  async getSectionWithSteps(sectionId: string, workflowId: string, userId: string): Promise<Section & { steps: Step[] }> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
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
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');
    return this.sectionRepo.update(sectionId, data);
  }

  /**
   * Delete section by ID only (looks up workflow automatically)
   */
  async deleteSectionById(sectionId: string, userId: string): Promise<void> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');
    await this.sectionRepo.delete(sectionId);
  }
}

// Singleton instance
export const sectionService = new SectionService();

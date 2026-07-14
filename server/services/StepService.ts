import type { Step, InsertStep } from "@shared/schema";

import { logger } from "../logger";
import { stepRepository, sectionRepository } from "../repositories";

import { aliasRenameService } from "./AliasRenameService";
import { ALIAS_MAX_LENGTH, generateAliasFromLabel, generateUniqueAliasFromTaken } from "./stepAlias";
import { workflowService } from "./WorkflowService";

const SECTION_NOT_FOUND = "Section not found";
const STEP_NOT_FOUND = "Step not found";

/**
 * Format for new/changed aliases. Dots are not allowed (existing dotted
 * aliases are grandfathered — they collide with the dot-notation keys the
 * document normalizer produces for nested values).
 */
const ALIAS_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ALIAS_FORMAT_MESSAGE =
  'Variable names must start with a letter or underscore and contain only letters, numbers, and underscores.';
type CreateStepData = Omit<InsertStep, 'sectionId' | 'workflowId' | 'order'> & Partial<Pick<InsertStep, 'order'>>;
export { generateAliasFromLabel, generateUniqueAliasFromTaken };

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
    this.stepRepo = stepRepo ?? stepRepository;
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
  }

  /**
   * Validate the format of a new/changed alias (server-side counterpart of
   * the AliasField client validation, which was previously the only check)
   */
  private validateAliasFormat(alias: string): void {
    if (!ALIAS_FORMAT.test(alias)) {
      throw new Error(ALIAS_FORMAT_MESSAGE);
    }
    if (alias.length > ALIAS_MAX_LENGTH) {
      throw new Error(`Variable names must be at most ${ALIAS_MAX_LENGTH} characters.`);
    }
  }

  /** All aliases in a workflow, lowercased for case-insensitive comparison */
  private async getWorkflowAliases(workflowId: string): Promise<Set<string>> {
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const allSteps = await this.stepRepo.findBySectionIds(sections.map((s) => s.id), undefined, true);
    return new Set(
      allSteps
        .map((s) => s.alias?.toLowerCase())
        .filter((a): a is string => a !== undefined && a !== null && a !== '')
    );
  }

  /**
   * Generate a unique alias from a question label, suffixing with a number
   * when the base name is taken (clientName, clientName2, ...)
   */
  private async generateUniqueAlias(workflowId: string, label: string): Promise<string | null> {
    const taken = await this.getWorkflowAliases(workflowId);
    return generateUniqueAliasFromTaken(label, taken);
  }

  /**
   * Follow-the-label: while the alias is empty or still tracks the previous
   * label's auto-generated name, regenerate it when the label changes.
   * A customized alias is never touched. Returns the new alias or null.
   */
  private async maybeRegenerateAlias(
    workflowId: string,
    step: Step,
    data: Partial<InsertStep>
  ): Promise<string | null> {
    if (data.title === undefined || data.title === step.title || data.alias !== undefined) {
      return null;
    }

    const previousAuto = generateAliasFromLabel(step.title);
    const isAutoDerived = (alias: string, base: string): boolean =>
      alias === base || (alias.startsWith(base) && /^\d+$/.test(alias.slice(base.length)));
    const followsLabel =
      !step.alias || (previousAuto !== null && isAutoDerived(step.alias, previousAuto));

    if (!followsLabel) {
      return null;
    }
    return this.generateUniqueAlias(workflowId, data.title);
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
    const allSteps = await this.stepRepo.findBySectionIds(sectionIds, undefined, true);

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
    data: CreateStepData
  ): Promise<Step> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Validate alias if provided; otherwise auto-generate one from the
    // question label so the step's answer is available to documents
    // (steps without an alias are excluded from document data entirely)
    let alias = data.alias;
    if (alias) {
      this.validateAliasFormat(alias);
      await this.validateAliasUniqueness(workflowId, alias);
    } else if (data.title) {
      alias = await this.generateUniqueAlias(workflowId, data.title);
    }

    // Get current steps to determine next order
    const existingSteps = await this.stepRepo.findBySectionId(sectionId);
    const nextOrder = existingSteps.length > 0
      ? Math.max(...existingSteps.map((s) => s.order)) + 1
      : 1;

    return this.stepRepo.create({
      ...data,
      alias,
      workflowId,
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
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Verify step's section belongs to workflow
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== workflowId) {
      throw new Error("Step not found in this workflow");
    }

    // If sectionId is being changed, validate new section belongs to same workflow
    if (data.sectionId && data.sectionId !== step.sectionId) {
      const newSection = await this.sectionRepo.findById(data.sectionId);
      if (!newSection || newSection.workflowId !== workflowId) {
        throw new Error("Cannot move step to a section in a different workflow");
      }
    }

    // Validate alias format + uniqueness if alias is being changed
    // (existing aliases are grandfathered until edited)
    if (data.alias !== undefined && data.alias !== step.alias) {
      if (data.alias) {
        this.validateAliasFormat(data.alias);
      }
      await this.validateAliasUniqueness(workflowId, data.alias, stepId);
    }

    const updates = { ...data };
    delete updates.workflowId;
    const regenerated = await this.maybeRegenerateAlias(workflowId, step, data);
    if (regenerated !== null) {
      updates.alias = regenerated;
    }

    const updated = await this.stepRepo.update(stepId, updates);

    // Propagate the rename to workflow-scoped references (transform block
    // and hook inputKeys, Final Block mapping sources) so renaming a
    // variable does not silently break documents and transforms.
    const oldAlias = step.alias;
    const newAlias = updated.alias;
    if (oldAlias && newAlias && oldAlias !== newAlias) {
      try {
        await aliasRenameService.propagateRename(workflowId, oldAlias, newAlias);
      } catch (error) {
        logger.error(
          { error, workflowId, stepId, oldAlias, newAlias },
          'Alias rename propagation failed; references may still use the old name'
        );
      }
    }

    return updated;
  }

  /**
   * Delete step
   */
  async deleteStep(stepId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
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
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
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
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.stepRepo.findBySectionId(sectionId);
  }

  async verifyWorkflowAccess(workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'view');
  }

  async getWorkflowSteps(workflowId: string): Promise<Step[]> {
    return this.stepRepo.findByWorkflowIdWithAliases(workflowId);
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
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.getSteps(section.workflowId, sectionId, userId);
  }

  /**
   * Get steps for a section without ownership check
   * Used for preview/run token authentication
   * Validates that the section belongs to the expected workflow
   */
  async getStepsBySectionIdNoAuth(sectionId: string, expectedWorkflowId: string): Promise<Step[]> {
    // Look up the section
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Verify the section belongs to the expected workflow
    if (section.workflowId !== expectedWorkflowId) {
      throw new Error("Section does not belong to the specified workflow");
    }

    return this.stepRepo.findBySectionId(sectionId);
  }

  /**
   * Create a new step (workflow looked up automatically)
   */
  async createStepBySectionId(
    sectionId: string,
    userId: string,
    data: CreateStepData
  ): Promise<Step> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.createStep(section.workflowId, sectionId, userId, data);
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
      throw new Error(SECTION_NOT_FOUND);
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
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.updateStep(stepId, section.workflowId, userId, data);
  }

  /**
   * Delete a step (workflow looked up automatically)
   */
  async deleteStepById(stepId: string, userId: string): Promise<void> {
    // Look up the step to get its section
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    await this.deleteStep(stepId, section.workflowId, userId);
  }

  /**
   * Get a step by ID (workflow looked up automatically)
   */
  async getStepById(stepId: string, userId: string): Promise<Step> {
    // Look up the step
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Verify ownership
    await this.workflowSvc.verifyAccess(section.workflowId, userId);

    return step;
  }
}

// Singleton instance
export const stepService = new StepService();

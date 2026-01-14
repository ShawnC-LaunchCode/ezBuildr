import type { WorkflowVariable } from "@shared/schema";

import { sectionRepository, stepRepository } from "../repositories";

import { workflowService } from "./WorkflowService";

/**
 * Service layer for workflow variable management
 * Provides access to step aliases and variable references
 */
export class VariableService {
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
   * Get all variables (steps) for a workflow
   * Returns steps ordered by section.order, then step.order
   */
  async listVariables(workflowId: string, userId: string): Promise<WorkflowVariable[]> {
    // Verify ownership
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);

    if (sections.length === 0) {
      return [];
    }

    // Get all steps for these sections
    const sectionIds = sections.map(s => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);

    // Create a map of section ID to section for quick lookup
    const sectionMap = new Map(sections.map(s => [s.id, s]));

    // Build variables array
    const variables: WorkflowVariable[] = steps.map(step => {
      const section = sectionMap.get(step.sectionId);
      return {
        key: step.id,
        alias: step.alias,
        label: step.title,
        type: step.type,
        sectionId: step.sectionId,
        sectionTitle: section?.title || 'Unknown Section',
        stepId: step.id,
      };
    });

    return variables;
  }

  /**
   * Check if an alias is unique within a workflow
   * Returns true if alias is available, false if already in use
   */
  async isAliasUnique(
    workflowId: string,
    alias: string,
    excludeStepId?: string
  ): Promise<boolean> {
    const variables = await this.listVariables(workflowId, 'system');

    // Check if alias is already used by another step
    const existingVariable = variables.find(
      v => v.alias?.toLowerCase() === alias.toLowerCase() && v.stepId !== excludeStepId
    );

    return !existingVariable;
  }
}

// Singleton instance
export const variableService = new VariableService();

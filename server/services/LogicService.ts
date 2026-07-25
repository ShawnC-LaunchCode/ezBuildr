/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import type { Section, LogicRule } from "@shared/schema";
import {
  evaluateWorkflowVisibility,
  calculateNextSection,
  resolveNextSection,
  validateRequiredSteps,
  type LogicContext,
  type WorkflowVisibilityResult,
} from "@shared/workflowLogic";

import {
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  stepValueRepository,
} from "../repositories";

/**
 * Navigation result from logic evaluation
 */
export interface NavigationResult {
  visibleSections: string[];
  visibleSteps: string[];
  requiredSteps: string[];
  skipToSectionId?: string;
  nextSectionId: string | null;
  currentProgress: number; // 0-100
}

/**
 * Validation result for workflow completion
 */
export interface ValidationResult {
  valid: boolean;
  missingSteps: string[];
  missingStepTitles?: string[];
}

/**
 * Service layer for workflow logic evaluation and navigation
 */
export class LogicService {
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private valueRepo: typeof stepValueRepository;

  constructor(
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    valueRepo?: typeof stepValueRepository
  ) {
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.stepRepo = stepRepo ?? stepRepository;
    this.logicRuleRepo = logicRuleRepo ?? logicRuleRepository;
    this.valueRepo = valueRepo ?? stepValueRepository;
  }

  /**
   * Build a LogicContext to avoid N+1 queries
   */
  async buildContext(
    workflowId: string,
    data: Record<string, unknown>
  ): Promise<LogicContext> {
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);

    const sectionHideRulesMap = new Map<string, LogicRule[]>();
    const stepHideRulesMap = new Map<string, LogicRule[]>();
    
    for (const rule of logicRules) {
      if (rule.action === "hide") {
        if (rule.targetType === "section" && rule.targetSectionId) {
          if (!sectionHideRulesMap.has(rule.targetSectionId)) {
            sectionHideRulesMap.set(rule.targetSectionId, []);
          }
          sectionHideRulesMap.get(rule.targetSectionId)!.push(rule);
        } else if (rule.targetType === "step" && rule.targetStepId) {
          if (!stepHideRulesMap.has(rule.targetStepId)) {
            stepHideRulesMap.set(rule.targetStepId, []);
          }
          stepHideRulesMap.get(rule.targetStepId)!.push(rule);
        }
      }
    }

    const aliasResolver = (name: string): string | undefined => steps.find((s) => s.alias === name)?.id;

    return {
      workflowId,
      sections,
      steps,
      rules: logicRules,
      data,
      sectionHideRulesMap,
      stepHideRulesMap,
      aliasResolver,
    };
  }

  /**
   * Evaluate logic and determine next section for a workflow run
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Pre-builds rule index Maps for O(1) lookup instead of O(n) filtering
   *
   * @param workflowId - Workflow ID
   * @param runId - Current run ID
   * @param currentSectionId - Current section ID (null if starting)
   * @returns Navigation result with next section and visibility info
   */
  async evaluateNavigation(
    workflowId: string,
    runId: string,
    currentSectionId: string | null
  ): Promise<NavigationResult> {
    // Load all workflow components
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);
    // Build data object for evaluation
    const data = await this.valueRepo.getRunDataAsJson(runId);

    const visibility = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: logicRules,
      data,
      resolveAlias: (name) => steps.find((step) => step.alias === name)?.id,
    });
    const { visibleSections, visibleSteps, requiredSteps: visibleRequiredSteps } = visibility;

    // Calculate normal next section
    const nextSectionId = calculateNextSection(
      currentSectionId,
      sections.map((s) => ({ id: s.id, order: s.order })),
      visibleSections
    );

    // Resolve final next section (considering skip logic)
    const resolvedNextSectionId = resolveNextSection(
      currentSectionId,
      nextSectionId,
      visibility.ruleEvaluation.skipToSectionId,
      sections.map((s) => ({ id: s.id, order: s.order })),
      visibleSections
    );

    // Calculate progress
    const currentProgress = this.calculateProgress(
      currentSectionId,
      sections,
      visibleSections
    );

    return {
      visibleSections: Array.from(visibleSections),
      visibleSteps: Array.from(visibleSteps),
      requiredSteps: Array.from(visibleRequiredSteps),
      skipToSectionId: visibility.ruleEvaluation.skipToSectionId,
      nextSectionId: resolvedNextSectionId,
      currentProgress,
    };
  }

  /**
   * Validate workflow completion
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Uses same Map-based optimization as evaluateNavigation
   *
   * @param workflowId - Workflow ID
   * @param runId - Run ID to validate
   * @returns Validation result
   */
  async validateCompletion(
    workflowId: string,
    runId: string,
    runDataByStepId?: Record<string, unknown>
  ): Promise<ValidationResult> {
    // Load all workflow components
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);

    // Build data object for evaluation
    const data = runDataByStepId ?? await this.valueRepo.getRunDataAsJson(runId);

    const visibility = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: logicRules,
      data,
      resolveAlias: (name) => steps.find((step) => step.alias === name)?.id,
    });

    // Validate all visible required steps have values
    const validation = validateRequiredSteps(visibility.requiredSteps, data);

    // Get step titles for missing steps
    const missingStepTitles = validation.missingSteps
      .map((stepId) => steps.find((s) => s.id === stepId)?.title)
      .filter(Boolean) as string[];

    return {
      valid: validation.valid,
      missingSteps: validation.missingSteps,
      missingStepTitles,
    };
  }

  /**
   * Calculate progress percentage
   *
   * @param currentSectionId - Current section ID
   * @param sections - All sections
   * @param visibleSections - Set of visible section IDs
   * @returns Progress percentage (0-100)
   */
  private calculateProgress(
    currentSectionId: string | null,
    sections: Section[],
    visibleSections: Set<string>
  ): number {
    if (!currentSectionId) {
      return 0;
    }

    // Get sorted visible sections
    const sortedVisibleSections = sections
      .filter((s) => visibleSections.has(s.id))
      .sort((a, b) => a.order - b.order);

    if (sortedVisibleSections.length === 0) {
      return 100;
    }

    // Find index of current section
    const currentIndex = sortedVisibleSections.findIndex((s) => s.id === currentSectionId);

    if (currentIndex === -1) {
      return 0;
    }

    // Calculate progress: (currentIndex + 1) / total * 100
    const progress = Math.round(((currentIndex + 1) / sortedVisibleSections.length) * 100);

    return Math.min(100, Math.max(0, progress));
  }

  /**
   * Check if a section is visible based on logic rules and current data
   *
   * @param workflowId - Workflow ID
   * @param sectionId - Section ID to check
   * @param data - Current step values (key = stepId or alias, value = step value)
   * @returns true if section is visible, false otherwise
   */
  async isSectionVisible(
    ctx: LogicContext,
    sectionId: string
  ): Promise<boolean> {
    return this.evaluateContextVisibility(ctx).visibleSections.has(sectionId);
  }

  /**
   * Check if a step is visible based on logic rules and current data
   *
   * @param workflowId - Workflow ID
   * @param stepId - Step ID to check
   * @param data - Current step values (key = stepId or alias, value = step value)
   * @returns true if step is visible, false otherwise
   */
  async isStepVisible(
    ctx: LogicContext,
    stepId: string
  ): Promise<boolean> {
    return this.evaluateContextVisibility(ctx).visibleSteps.has(stepId);
  }

  /**
   * Check if a step is required based on logic rules and current data
   *
   * @param workflowId - Workflow ID
   * @param stepId - Step ID to check
   * @param data - Current step values (key = stepId or alias, value = step value)
   * @returns true if step is required, false otherwise
   */
  async isStepRequired(
    ctx: LogicContext,
    stepId: string
  ): Promise<boolean> {
    return this.evaluateContextVisibility(ctx).requiredSteps.has(stepId);
  }

  private evaluateContextVisibility(ctx: LogicContext): WorkflowVisibilityResult {
    return evaluateWorkflowVisibility({
      sections: ctx.sections,
      steps: ctx.steps,
      rules: ctx.rules,
      data: ctx.data,
      resolveAlias: ctx.aliasResolver,
    });
  }
}

// Singleton instance
export const logicService = new LogicService();

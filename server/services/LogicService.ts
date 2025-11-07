import {
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  stepValueRepository,
} from "../repositories";
import {
  evaluateRules,
  calculateNextSection,
  resolveNextSection,
  validateRequiredSteps,
  getEffectiveRequiredSteps,
} from "@shared/workflowLogic";
import type { Section, Step, LogicRule } from "@shared/schema";

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
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.valueRepo = valueRepo || stepValueRepository;
  }

  /**
   * Evaluate logic and determine next section for a workflow run
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
    const currentValues = await this.valueRepo.findByRunId(runId);

    // Build data object for evaluation
    const data: Record<string, any> = {};
    currentValues.forEach((v) => {
      data[v.stepId] = v.value;
    });

    // Evaluate all rules
    const evalResult = evaluateRules(logicRules, data);

    // Build visible sections set
    // Start with all sections, then apply hide rules
    const allSectionIds = new Set(sections.map((s) => s.id));
    const visibleSections = new Set(
      Array.from(allSectionIds).filter((id) => {
        // If explicitly shown by a rule, include it
        if (evalResult.visibleSections.has(id)) return true;
        // If not explicitly hidden, include it (default visible)
        // Check if any rules hide this section
        const hideRules = logicRules.filter(
          (r) => r.targetType === "section" && r.targetSectionId === id && r.action === "hide"
        );
        if (hideRules.length === 0) return true;
        // If there are hide rules, check if any are triggered
        return !hideRules.some((rule) => {
          const actualValue = data[rule.conditionStepId];
          // Simple condition check - should use evaluateCondition but keeping it simple
          return actualValue !== undefined;
        });
      })
    );

    // Build visible steps set (only from visible sections)
    const visibleSteps = new Set(
      steps
        .filter((step) => visibleSections.has(step.sectionId))
        .filter((step) => {
          // If explicitly shown by a rule, include it
          if (evalResult.visibleSteps.has(step.id)) return true;
          // If explicitly hidden by a rule, exclude it
          const hideRules = logicRules.filter(
            (r) => r.targetType === "step" && r.targetStepId === step.id && r.action === "hide"
          );
          if (hideRules.length === 0) return true;
          return !hideRules.some((rule) => {
            const actualValue = data[rule.conditionStepId];
            return actualValue !== undefined;
          });
        })
        .map((s) => s.id)
    );

    // Get initially required steps
    const initialRequiredSteps = new Set(steps.filter((s) => s.required).map((s) => s.id));

    // Get effective required steps (considering logic rules)
    const effectiveRequiredSteps = getEffectiveRequiredSteps(
      initialRequiredSteps,
      logicRules,
      data
    );

    // Filter to only include visible required steps
    const visibleRequiredSteps = new Set(
      Array.from(effectiveRequiredSteps).filter((id) => visibleSteps.has(id))
    );

    // Calculate normal next section
    const nextSectionId = calculateNextSection(
      currentSectionId,
      sections.map((s) => ({ id: s.id, order: s.order })),
      visibleSections
    );

    // Resolve final next section (considering skip logic)
    const resolvedNextSectionId = resolveNextSection(
      nextSectionId,
      evalResult.skipToSectionId,
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
      skipToSectionId: evalResult.skipToSectionId,
      nextSectionId: resolvedNextSectionId,
      currentProgress,
    };
  }

  /**
   * Validate workflow completion
   *
   * @param workflowId - Workflow ID
   * @param runId - Run ID to validate
   * @returns Validation result
   */
  async validateCompletion(workflowId: string, runId: string): Promise<ValidationResult> {
    // Load all workflow components
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);
    const currentValues = await this.valueRepo.findByRunId(runId);

    // Build data object for evaluation
    const data: Record<string, any> = {};
    currentValues.forEach((v) => {
      data[v.stepId] = v.value;
    });

    // Evaluate rules to determine visibility
    const evalResult = evaluateRules(logicRules, data);

    // Build visible sections
    const allSectionIds = new Set(sections.map((s) => s.id));
    const visibleSections = new Set(Array.from(allSectionIds).filter((id) => {
      if (evalResult.visibleSections.has(id)) return true;
      const hideRules = logicRules.filter(
        (r) => r.targetType === "section" && r.targetSectionId === id && r.action === "hide"
      );
      if (hideRules.length === 0) return true;
      return !hideRules.some((rule) => {
        const actualValue = data[rule.conditionStepId];
        return actualValue !== undefined;
      });
    }));

    // Build visible steps
    const visibleStepsInVisibleSections = steps.filter((step) =>
      visibleSections.has(step.sectionId)
    );

    const visibleSteps = new Set(
      visibleStepsInVisibleSections
        .filter((step) => {
          if (evalResult.visibleSteps.has(step.id)) return true;
          const hideRules = logicRules.filter(
            (r) => r.targetType === "step" && r.targetStepId === step.id && r.action === "hide"
          );
          if (hideRules.length === 0) return true;
          return !hideRules.some((rule) => {
            const actualValue = data[rule.conditionStepId];
            return actualValue !== undefined;
          });
        })
        .map((s) => s.id)
    );

    // Get initially required steps
    const initialRequiredSteps = new Set(steps.filter((s) => s.required).map((s) => s.id));

    // Get effective required steps
    const effectiveRequiredSteps = getEffectiveRequiredSteps(
      initialRequiredSteps,
      logicRules,
      data
    );

    // Filter to only visible required steps
    const visibleRequiredSteps = new Set(
      Array.from(effectiveRequiredSteps).filter((id) => visibleSteps.has(id))
    );

    // Validate all visible required steps have values
    const validation = validateRequiredSteps(visibleRequiredSteps, data);

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
}

// Singleton instance
export const logicService = new LogicService();

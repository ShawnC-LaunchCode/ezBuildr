import type { WorkflowRun, LogicRule } from "@shared/schema";
import {
  evaluateWorkflowVisibility,
  calculateNextSection,
  resolveNextSection,
  validateRequiredSteps,
  type LogicContext,
  type WorkflowVisibilityResult,
} from "@shared/workflowLogic";

import {
  workflowRunRepository,
  stepValueRepository,
} from "../repositories";

import {
  runDefinitionProvider,
  RunDefinitionProvider,
} from "./workflow-runs/RunDefinitionProvider";

const ERR_RUN_NOT_FOUND = "Run not found";

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
  private runRepo: typeof workflowRunRepository;
  private definitionProvider: RunDefinitionProvider;
  private valueRepo: typeof stepValueRepository;

  constructor(
    runRepo?: typeof workflowRunRepository,
    definitionProvider?: RunDefinitionProvider,
    valueRepo?: typeof stepValueRepository
  ) {
    this.runRepo = runRepo ?? workflowRunRepository;
    this.definitionProvider = definitionProvider ?? runDefinitionProvider;
    this.valueRepo = valueRepo ?? stepValueRepository;
  }

  /**
   * Load the run this decision is being made for and confirm it belongs to
   * the claimed workflow (mirrors the check `RunDefinitionProvider` itself
   * makes for a pinned version, RUN2-10 in spirit).
   *
   * RVP-2: every entry point below used to re-read the LIVE `sections`/
   * `steps`/`logic_rules` tables directly, so a respondent's in-flight run
   * was validated against whatever the author changed the workflow to be
   * *after* the run started -- not what the respondent was actually shown.
   * Resolving the run here and handing it to `RunDefinitionProvider` (RVP-1)
   * sources every decision from the run's pinned version instead (falling
   * back to the live tables for a run with no `workflowVersionId`, which is
   * the provider's `source: 'live'` branch).
   */
  private async resolveRun(workflowId: string, runId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run || run.workflowId !== workflowId) {
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    return run;
  }

  /**
   * Build a LogicContext to avoid N+1 queries
   */
  async buildContext(
    workflowId: string,
    data: Record<string, unknown>,
    runId: string
  ): Promise<LogicContext> {
    const run = await this.resolveRun(workflowId, runId);
    const { sections, steps, logicRules } = await this.definitionProvider.getDefinition(run);

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
      workflowId: run.workflowId,
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
   * RVP-2: sourced from the run's pinned definition (`RunDefinitionProvider`)
   * rather than the live `sections`/`steps`/`logic_rules` tables, so editing
   * the live workflow mid-run no longer desyncs navigation from what the
   * respondent is actually looking at. A run with no `workflowVersionId`
   * still resolves from the live tables (the provider's `source: 'live'`
   * fallback) -- unchanged from today's behavior.
   *
   * @param workflowId - Workflow ID (validated against the run's own workflowId)
   * @param runId - Current run ID
   * @param currentSectionId - Current section ID (null if starting)
   * @returns Navigation result with next section and visibility info
   */
  async evaluateNavigation(
    workflowId: string,
    runId: string,
    currentSectionId: string | null
  ): Promise<NavigationResult> {
    const run = await this.resolveRun(workflowId, runId);
    const { sections, steps, logicRules } = await this.definitionProvider.getDefinition(run);
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
   * RVP-2: the required-step set is now built from the run's pinned
   * definition, not the live workflow. Before this, a required question
   * added to the workflow after a respondent started would block their
   * submission with "Missing required steps: <title>" for a question they
   * were never shown and had no way to answer (RVP ticket, "consequence 2").
   * A run with no `workflowVersionId` still validates against the live
   * tables (the provider's `source: 'live'` fallback) -- unchanged.
   *
   * @param workflowId - Workflow ID (validated against the run's own workflowId)
   * @param runId - Run ID to validate
   * @returns Validation result
   */
  async validateCompletion(
    workflowId: string,
    runId: string,
    runDataByStepId?: Record<string, unknown>
  ): Promise<ValidationResult> {
    const run = await this.resolveRun(workflowId, runId);
    const { sections, steps, logicRules } = await this.definitionProvider.getDefinition(run);

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
    sections: Array<{ id: string; order: number }>,
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

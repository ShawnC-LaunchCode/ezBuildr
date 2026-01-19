/**
 * Intake Question Visibility Service (Stage 20 PR 3)
 *
 * Handles question-level conditional visibility for Intake Runner 2.0.
 * Evaluates visibleIf conditions to determine which questions should be
 * displayed within a page.
 */
import { createLogger } from "../logger";
import * as repositories from "../repositories";
import { evaluateVisibility } from "../workflows/conditionAdapter";
import type {  } from "../../shared/schema";
const logger = createLogger({ module: "intake-question-visibility" });
export interface QuestionVisibilityResult {
  /** All question IDs for the page (including hidden) */
  allQuestions: string[];
  /** Visible question IDs in order */
  visibleQuestions: string[];
  /** Hidden question IDs */
  hiddenQuestions: string[];
  /** Map of questionId -> visibility reason (for debugging) */
  visibilityReasons: Map<string, string>;
}
export interface QuestionValidationFilter {
  /** Question IDs that should be validated (visible + required) */
  requiredQuestions: string[];
  /** Question IDs that should be skipped in validation (hidden or optional) */
  skippedQuestions: string[];
}
export class IntakeQuestionVisibilityService {
  // PERFORMANCE OPTIMIZATION (Dec 2025): Visibility result cache to prevent N+1 queries
  // Cache key: `${runId}-${sectionId}`, expires after 30 seconds
  private visibilityCache = new Map<string, { result: QuestionVisibilityResult; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds
  constructor(
    private readonly stepRepo = repositories.stepRepository,
    private readonly stepValueRepo = repositories.stepValueRepository
  ) { }
  /**
   * Evaluates question visibility for a specific page
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Uses in-memory cache to prevent repeated evaluations within same run/section
   *
   * @param sectionId - Page (section) ID
   * @param runId - Current run ID
   * @param recordData - Optional collection record data for prefill
   * @returns Visibility result with visible/hidden question lists
   */
  async evaluatePageQuestions(
    sectionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<QuestionVisibilityResult> {
    // OPTIMIZATION: Check cache first (unless recordData is provided, as it affects evaluation)
    if (!recordData) {
      const cacheKey = `${runId}-${sectionId}`;
      const cached = this.visibilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        logger.debug({ runId, sectionId }, "Visibility cache hit");
        return cached.result;
      }
    }
    // Load all questions for this page
    const allQuestions = await this.stepRepo.findBySectionIds([sectionId]);
    logger.debug({ sectionId, questionCount: allQuestions.length }, "Evaluation context loaded");
    const sortedQuestions = allQuestions
      .filter(q => !q.isVirtual) // Exclude virtual steps (transform block outputs)
      .sort((a, b) => a.order - b.order);
    // Load all step values for this run to build context
    const stepValues = await this.stepValueRepo.findByRunId(runId);
    // Load all steps to map stepId -> alias (for variable resolution)
    const workflowId = allQuestions[0]?.sectionId; // Get workflow via section
    // TODO: Better way to get workflowId from sectionId
    const allSteps = sortedQuestions; // For now, just use page steps
    const stepIdToAlias = new Map<string, string>();
    for (const step of allSteps) {
      if (step.alias) {
        stepIdToAlias.set(step.id, step.alias);
      }
    }
    // Build evaluation context
    const variables: Record<string, any> = {};
    for (const sv of stepValues) {
      const alias = stepIdToAlias.get(sv.stepId);
      const key = alias || sv.stepId;
      variables[key] = sv.value;
    }
    // Include record data in variables if present
    if (recordData) {
      Object.assign(variables, recordData);
    }
    // Evaluate visibility for each question
    const visibleQuestions: string[] = [];
    const hiddenQuestions: string[] = [];
    const visibilityReasons = new Map<string, string>();
    for (const question of sortedQuestions) {
      let isVisible = true;
      let reason = "Always visible (no condition)";
      // Evaluate visibleIf condition
      if (question.visibleIf) {
        try {
          isVisible = evaluateVisibility(question.visibleIf, variables);
          if (isVisible) {
            reason = "Visible by condition";
          } else {
            reason = "Hidden by visibleIf condition";
            hiddenQuestions.push(question.id);
            logger.debug(
              { questionId: question.id, questionTitle: question.title },
              "Question hidden by visibleIf condition"
            );
          }
        } catch (error) {
          logger.error(
            { error, questionId: question.id, condition: question.visibleIf },
            "Error evaluating visibleIf condition"
          );
          // Default to visible on error (fail-safe)
          isVisible = true;
          reason = "Visible (error evaluating condition - fail-safe)";
        }
      }
      if (isVisible) {
        visibleQuestions.push(question.id);
      }
      visibilityReasons.set(question.id, reason);
    }
    const result: QuestionVisibilityResult = {
      allQuestions: sortedQuestions.map(q => q.id),
      visibleQuestions,
      hiddenQuestions,
      visibilityReasons,
    };
    // OPTIMIZATION: Cache result (only if no recordData, as it makes result dynamic)
    if (!recordData) {
      const cacheKey = `${runId}-${sectionId}`;
      this.visibilityCache.set(cacheKey, { result, timestamp: Date.now() });
      logger.debug({ runId, sectionId }, "Visibility result cached");
    }
    return result;
  }
  /**
   * Determines which questions should be validated for a page submission
   *
   * Hidden questions are excluded from validation.
   * Optional visible questions are included in validation (will allow empty).
   *
   * @param sectionId - Page (section) ID
   * @param runId - Current run ID
   * @param recordData - Optional collection record data
   * @returns Validation filter with required/skipped question lists
   */
  async getValidationFilter(
    sectionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<QuestionValidationFilter> {
    const visibility = await this.evaluatePageQuestions(sectionId, runId, recordData);
    // Load question details to check required status
    const questions = await this.stepRepo.findBySectionIds([sectionId]);
    const questionMap = new Map(questions.map(q => [q.id, q]));
    const requiredQuestions: string[] = [];
    const skippedQuestions: string[] = [];
    for (const questionId of visibility.allQuestions) {
      const question = questionMap.get(questionId);
      if (!question) {continue;}
      // Hidden questions are always skipped
      if (visibility.hiddenQuestions.includes(questionId)) {
        skippedQuestions.push(questionId);
        continue;
      }
      // Visible required questions must be validated
      if (question.required) {
        requiredQuestions.push(questionId);
      }
    }
    return {
      requiredQuestions,
      skippedQuestions,
    };
  }
  /**
   * Checks if a specific question is currently visible
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Reuses cached evaluatePageQuestions result instead of re-evaluating
   *
   * @param questionId - Question (step) ID
   * @param runId - Current run ID
   * @param recordData - Optional collection record data
   * @returns True if question is visible
   */
  async isQuestionVisible(
    questionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<boolean> {
    // Load question to get sectionId (FIXED: use findById instead of findBySectionIds)
    const question = await this.stepRepo.findById(questionId);
    if (!question) {
      return false;
    }
    // OPTIMIZATION: evaluatePageQuestions now uses internal cache
    const visibility = await this.evaluatePageQuestions(question.sectionId, runId, recordData);
    return visibility.visibleQuestions.includes(questionId);
  }
  /**
   * Gets the count of visible questions for a page
   * Useful for UI indicators and progress calculation
   *
   * @param sectionId - Page (section) ID
   * @param runId - Current run ID
   * @param recordData - Optional collection record data
   * @returns Count of visible questions
   */
  async getVisibleQuestionCount(
    sectionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<number> {
    const visibility = await this.evaluatePageQuestions(sectionId, runId, recordData);
    return visibility.visibleQuestions.length;
  }
  /**
   * Validates question conditions for potential issues
   *
   * @param sectionId - Page (section) ID
   * @returns Array of warning messages (empty if valid)
   */
  async validateQuestionConditions(sectionId: string): Promise<string[]> {
    const warnings: string[] = [];
    const questions = await this.stepRepo.findBySectionIds([sectionId]);
    for (const question of questions) {
      // Warn if required question has visibility condition (could be confusing)
      if (question.required && question.visibleIf) {
        warnings.push(
          `Question "${question.title}" is marked as required but has a visibleIf condition. ` +
          `It will only be required when visible.`
        );
      }
      // Warn if virtual step has visibility condition (doesn't make sense)
      if (question.isVirtual && question.visibleIf) {
        warnings.push(
          `Virtual step "${question.title}" has a visibleIf condition. ` +
          `Virtual steps are always hidden, so this condition is unnecessary.`
        );
      }
    }
    return warnings;
  }
  /**
   * Clears step values for hidden questions
   * When a question becomes hidden, its previously entered value should be cleared
   * to avoid validation issues and data inconsistencies.
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Uses batch query to load all step values once instead of N queries.
   *
   * @param sectionId - Page (section) ID
   * @param runId - Current run ID
   * @param recordData - Optional collection record data
   * @returns Array of cleared step IDs
   */
  async clearHiddenQuestionValues(
    sectionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<string[]> {
    const visibility = await this.evaluatePageQuestions(sectionId, runId, recordData);
    const clearedSteps: string[] = [];
    if (visibility.hiddenQuestions.length === 0) {
      return clearedSteps;
    }
    // OPTIMIZATION: Load all step values for this run once (instead of N queries)
    const allStepValues = await this.stepValueRepo.findByRunId(runId);
    const stepValueMap = new Map(allStepValues.map(sv => [sv.stepId, sv]));
    // For each hidden question, check if it has a value and clear it
    const idsToDelete: string[] = [];
    for (const questionId of visibility.hiddenQuestions) {
      const existingValue = stepValueMap.get(questionId);
      if (existingValue) {
        idsToDelete.push(existingValue.id);
        clearedSteps.push(questionId);
      }
    }
    // Perform batch delete if there are items to delete
    if (idsToDelete.length > 0) {
      // Use inArray for batch deletion
      const { inArray } = await import("drizzle-orm");
      const { stepValues } = await import("../../shared/schema");
      await this.stepValueRepo.deleteWhere(inArray(stepValues.id, idsToDelete));
      logger.debug(
        { runId, count: idsToDelete.length, clearedSteps },
        "Cleared values for hidden questions (batch)"
      );
    }
    return clearedSteps;
  }
  /**
   * Clear visibility cache for a specific run or all runs
   * Call this after step values are updated to ensure fresh evaluation
   *
   * PERFORMANCE OPTIMIZATION (Dec 2025):
   * Allows explicit cache invalidation when data changes
   *
   * @param runId - Optional run ID to clear (clears all if not provided)
   */
  clearCache(runId?: string): void {
    if (runId) {
      // Clear all cache entries for this run
      for (const key of Array.from(this.visibilityCache.keys())) {
        if (key.startsWith(`${runId}-`)) {
          this.visibilityCache.delete(key);
        }
      }
      logger.debug({ runId }, "Visibility cache cleared for run");
    } else {
      // Clear entire cache
      this.visibilityCache.clear();
      logger.debug("Visibility cache fully cleared");
    }
  }
  /**
   * Get cache statistics for monitoring/debugging
   *
   * @returns Cache size and oldest entry age
   */
  getCacheStats(): { size: number; oldestEntryAgeMs: number | null } {
    let oldestTimestamp: number | null = null;
    for (const entry of [...this.visibilityCache.values()]) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }
    return {
      size: this.visibilityCache.size,
      oldestEntryAgeMs: oldestTimestamp ? Date.now() - oldestTimestamp : null,
    };
  }
}
// Singleton instance
export const intakeQuestionVisibilityService = new IntakeQuestionVisibilityService();
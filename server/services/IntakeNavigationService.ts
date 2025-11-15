/**
 * Intake Navigation Service (Stage 20 PR 2)
 *
 * Handles page-level conditional navigation for Intake Runner 2.0.
 * Evaluates visibleIf and skipIf conditions to determine page visibility
 * and automatic skip logic.
 */

import { sectionRepository, stepRepository, stepValueRepository } from "../repositories";
import { evaluateCondition, type ConditionExpression, type EvaluationContext } from "../workflows/conditions";
import type { Section } from "@shared/schema";
import { createLogger } from "../logger";

const logger = createLogger({ module: "intake-navigation" });

export interface PageNavigationResult {
  /** List of visible page IDs in order */
  visiblePages: string[];

  /** Current page index (0-based) */
  currentPageIndex: number;

  /** Next page ID (null if at end) */
  nextPageId: string | null;

  /** Previous page ID (null if at start) */
  previousPageId: string | null;

  /** Progress percentage (0-100) */
  progress: number;

  /** Pages that were skipped due to skipIf conditions */
  skippedPages: string[];

  /** Pages that were hidden due to visibleIf conditions */
  hiddenPages: string[];
}

export class IntakeNavigationService {
  /**
   * Evaluates page conditions and returns navigation state
   *
   * @param workflowId - Workflow ID
   * @param runId - Current run ID
   * @param currentPageId - Current page ID (null if at start)
   * @param recordData - Optional collection record data for prefill
   * @returns Navigation result with visible pages and next/previous
   */
  async evaluateNavigation(
    workflowId: string,
    runId: string,
    currentPageId: string | null,
    recordData?: Record<string, any>
  ): Promise<PageNavigationResult> {
    // Load all pages (sections) for this workflow
    const allPages = await sectionRepository.findByWorkflowId(workflowId);
    const sortedPages = allPages.sort((a, b) => a.order - b.order);

    // Load all step values for this run to build context
    const stepValues = await stepValueRepository.findByRunId(runId);

    // Load all steps to map stepId -> alias
    const allSteps = await (stepRepository as any).findByWorkflowId(workflowId);
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

    const context: EvaluationContext = {
      variables,
      record: recordData,
    };

    // Evaluate visibility for each page
    const visibilityResults = new Map<string, boolean>();
    const hiddenPages: string[] = [];

    for (const page of sortedPages) {
      let isVisible = true;

      // Evaluate visibleIf condition
      if (page.visibleIf) {
        try {
          const condition = page.visibleIf as unknown as ConditionExpression;
          isVisible = evaluateCondition(condition, context);

          if (!isVisible) {
            logger.debug({ pageId: page.id, pageTitle: page.title }, "Page hidden by visibleIf condition");
            hiddenPages.push(page.id);
          }
        } catch (error) {
          logger.error({ error, pageId: page.id, condition: page.visibleIf }, "Error evaluating visibleIf condition");
          // Default to visible on error (fail-safe)
          isVisible = true;
        }
      }

      visibilityResults.set(page.id, isVisible);
    }

    // Filter to visible pages
    const visiblePages = sortedPages.filter(p => visibilityResults.get(p.id));

    // Evaluate skipIf for visible pages
    const skippedPages: string[] = [];
    const navigablePages = visiblePages.filter(page => {
      if (page.skipIf) {
        try {
          const condition = page.skipIf as unknown as ConditionExpression;
          const shouldSkip = evaluateCondition(condition, context);

          if (shouldSkip) {
            logger.debug({ pageId: page.id, pageTitle: page.title }, "Page skipped by skipIf condition");
            skippedPages.push(page.id);
            return false;
          }
        } catch (error) {
          logger.error({ error, pageId: page.id, condition: page.skipIf }, "Error evaluating skipIf condition");
          // Default to not skipping on error (fail-safe)
          return true;
        }
      }
      return true;
    });

    // Calculate current page index
    let currentPageIndex = 0;
    if (currentPageId) {
      const index = navigablePages.findIndex(p => p.id === currentPageId);
      currentPageIndex = index >= 0 ? index : 0;
    }

    // Calculate next and previous page IDs
    const nextPageId = currentPageIndex < navigablePages.length - 1
      ? navigablePages[currentPageIndex + 1].id
      : null;

    const previousPageId = currentPageIndex > 0
      ? navigablePages[currentPageIndex - 1].id
      : null;

    // Calculate progress (0-100)
    const progress = navigablePages.length > 0
      ? Math.round(((currentPageIndex + 1) / navigablePages.length) * 100)
      : 0;

    return {
      visiblePages: navigablePages.map(p => p.id),
      currentPageIndex,
      nextPageId,
      previousPageId,
      progress,
      skippedPages,
      hiddenPages,
    };
  }

  /**
   * Finds the first navigable page for a workflow run
   *
   * @param workflowId - Workflow ID
   * @param runId - Run ID
   * @param recordData - Optional collection record data
   * @returns First page ID or null if no navigable pages
   */
  async getFirstPage(
    workflowId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<string | null> {
    const nav = await this.evaluateNavigation(workflowId, runId, null, recordData);
    return nav.visiblePages.length > 0 ? nav.visiblePages[0] : null;
  }

  /**
   * Validates that a page is currently navigable
   *
   * @param workflowId - Workflow ID
   * @param runId - Run ID
   * @param pageId - Page ID to validate
   * @param recordData - Optional collection record data
   * @returns True if page is visible and not skipped
   */
  async isPageNavigable(
    workflowId: string,
    runId: string,
    pageId: string,
    recordData?: Record<string, any>
  ): Promise<boolean> {
    const nav = await this.evaluateNavigation(workflowId, runId, pageId, recordData);
    return nav.visiblePages.includes(pageId);
  }

  /**
   * Gets the complete page sequence for a workflow run
   * Useful for progress indicators and navigation breadcrumbs
   *
   * @param workflowId - Workflow ID
   * @param runId - Run ID
   * @param recordData - Optional collection record data
   * @returns Array of visible page IDs in order
   */
  async getPageSequence(
    workflowId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<string[]> {
    const nav = await this.evaluateNavigation(workflowId, runId, null, recordData);
    return nav.visiblePages;
  }

  /**
   * Detects potential infinite navigation loops
   * Checks if skipIf conditions could create circular skips
   *
   * @param workflowId - Workflow ID
   * @returns Array of error messages (empty if valid)
   */
  async validatePageConditions(workflowId: string): Promise<string[]> {
    const errors: string[] = [];
    const pages = await sectionRepository.findByWorkflowId(workflowId);

    // Check for pages with both visibleIf and skipIf (valid but potentially confusing)
    for (const page of pages) {
      if (page.visibleIf && page.skipIf) {
        errors.push(
          `Page "${page.title}" has both visibleIf and skipIf conditions. ` +
          `skipIf will only apply if the page is visible.`
        );
      }
    }

    // TODO: Add more sophisticated circular dependency detection
    // For now, we rely on the runner to detect infinite loops at runtime

    return errors;
  }
}

// Singleton instance
export const intakeNavigationService = new IntakeNavigationService();

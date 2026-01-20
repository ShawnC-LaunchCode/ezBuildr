/**
 * Intake Runner State Machine (Stage 20 PR 7)
 *
 * Pure state machine for intake workflow navigation and validation.
 * Integrates page conditions, question visibility, and validation.
 */
import type { Step } from "@shared/schema";
import { validatePage } from "./validation";
import type { IntakeNavigationService } from "../services/IntakeNavigationService";
import type { IntakeQuestionVisibilityService } from "../services/IntakeQuestionVisibilityService";
export interface IntakeRunnerState {
  /** Current page index (0-based) */
  currentPageIndex: number;
  /** Current page ID */
  currentPageId: string | null;
  /** All answers collected so far */
  answers: Record<string, any>;
  /** Pages that have been visited */
  visitedPages: Set<string>;
  /** Validation errors for current page */
  errors: Map<string, string[]>;
  /** Can navigate to next page */
  canGoNext: boolean;
  /** Can navigate to previous page */
  canGoBack: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Is workflow complete */
  isComplete: boolean;
}
export interface StateTransition {
  type: 'NEXT' | 'BACK' | 'GOTO' | 'UPDATE_ANSWER' | 'SUBMIT';
  pageId?: string;
  answersaround?: Record<string, any>;
}
export class IntakeStateMachine {
  constructor(
    private navigationService: IntakeNavigationService,
    private visibilityService: IntakeQuestionVisibilityService
  ) { }
  /**
   * Initialize state for a new workflow run
   */
  async initializeState(
    workflowId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<IntakeRunnerState> {
    const nav = await this.navigationService.evaluateNavigation(
      workflowId,
      runId,
      null,
      recordData
    );
    const firstPageId = nav.visiblePages.length > 0 ? nav.visiblePages[0] : null;
    return {
      currentPageIndex: 0,
      currentPageId: firstPageId,
      answers: {},
      visitedPages: new Set(firstPageId ? [firstPageId] : []),
      errors: new Map(),
      canGoNext: false, // Determined after validation
      canGoBack: false,
      progress: nav.progress,
      isComplete: false,
    };
  }
  /**
   * Navigate to next page
   */
  async goNext(
    state: IntakeRunnerState,
    workflowId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<IntakeRunnerState> {
    if (!state.canGoNext) {
      return state; // Can't advance if validation failed
    }
    const nav = await this.navigationService.evaluateNavigation(
      workflowId,
      runId,
      state.currentPageId,
      recordData
    );
    if (!nav.nextPageId) {
      // Reached end
      return {
        ...state,
        isComplete: true,
        canGoNext: false,
      };
    }
    const nextPageIndex = state.currentPageIndex + 1;
    const visitedPages = new Set(state.visitedPages);
    visitedPages.add(nav.nextPageId);
    return {
      ...state,
      currentPageIndex: nextPageIndex,
      currentPageId: nav.nextPageId,
      visitedPages,
      errors: new Map(), // Clear errors for new page
      canGoNext: false, // Will be determined after validation
      canGoBack: nav.previousPageId !== null,
      progress: nav.progress,
    };
  }
  /**
   * Navigate to previous page
   */
  async goBack(
    state: IntakeRunnerState,
    workflowId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<IntakeRunnerState> {
    if (!state.canGoBack) {
      return state;
    }
    const nav = await this.navigationService.evaluateNavigation(
      workflowId,
      runId,
      state.currentPageId,
      recordData
    );
    if (!nav.previousPageId) {
      return state; // No previous page
    }
    const prevPageIndex = state.currentPageIndex - 1;
    return {
      ...state,
      currentPageIndex: prevPageIndex,
      currentPageId: nav.previousPageId,
      errors: new Map(), // Clear errors
      canGoNext: true, // Allow going forward (page already visited)
      canGoBack: prevPageIndex > 0,
      progress: nav.progress,
    };
  }
  /**
   * Update answers and revalidate
   */
  async updateAnswers(
    state: IntakeRunnerState,
    updates: Record<string, any>,
    steps: Step[],
    sectionId: string,
    runId: string,
    recordData?: Record<string, any>
  ): Promise<IntakeRunnerState> {
    const newAnswers = {
      ...state.answers,
      ...updates,
    };
    // Get visible steps for current page
    const visibility = await this.visibilityService.evaluatePageQuestions(
      sectionId,
      runId,
      recordData
    );
    // Validate page
    const validationResult = validatePage(steps, newAnswers, visibility.visibleQuestions);
    const errors = new Map<string, string[]>();
    for (const error of validationResult.errors) {
      errors.set(error.fieldId, error.errors);
    }
    return {
      ...state,
      answers: newAnswers,
      errors,
      canGoNext: validationResult.valid,
    };
  }
  /**
   * Submit workflow (complete)
   */
  async submit(
    state: IntakeRunnerState
  ): Promise<IntakeRunnerState> {
    return {
      ...state,
      isComplete: true,
      canGoNext: false,
      canGoBack: false,
    };
  }
}
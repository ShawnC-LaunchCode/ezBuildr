/**
 * CB-3: when is a Code Block *eligible* to be evaluated?
 *
 * Firing is trigger × repeat (Decisions 3), two independent choices. This module
 * owns the trigger half: given an evaluation point and the run's page progress,
 * is this block eligible right now? The repeat half lives in
 * `CodeBlockService.evaluate`, because it needs the stored hash and fired_at.
 *
 * The readiness gate always wins over both (Decisions 4). Eligibility only says
 * "consider this block now"; it never forces a block to run with unresolved
 * inputs. That ordering is the whole point — firing unready is what writes NaN
 * into a document.
 *
 * Pure and DB-free on purpose: every trigger rule is decidable from the config
 * plus the run's page progress, so the table below is testable without a
 * database and cannot drift from the ticket's contract.
 */
import { resolveFiringPolicy, type JsQuestionConfig } from '@shared/types/steps';

/**
 * Where in a run's life an evaluation is happening.
 *
 * `submit` covers every during-the-run point — page submit, navigation, page
 * enter and resume-link landing. They are one kind deliberately: `everySubmit`
 * means "every page submit / navigation", and splitting them would invite four
 * subtly different answers to the same question.
 */
export type EvaluationPoint = 'runStart' | 'submit' | 'runComplete';

export type PageProgress = {
  /** The page being submitted / entered right now, if any. */
  currentPageId?: string | null;
  /** Pages the run has already reached (`workflow_runs.visited_page_ids`). */
  visitedPageIds?: readonly string[];
};

/**
 * Implements the ticket's trigger table literally.
 *
 * | trigger      | eligible when                                              |
 * |--------------|------------------------------------------------------------|
 * | everySubmit  | point === 'submit'                                          |
 * | atPage       | point === 'submit' AND triggerPageId reached or submitting  |
 * | runStart     | point === 'runStart'                                        |
 * | runComplete  | point === 'runComplete'                                     |
 */
export function isEligible(
  config: Pick<JsQuestionConfig, 'trigger' | 'repeat' | 'triggerPageId'>,
  point: EvaluationPoint,
  progress: PageProgress = {}
): boolean {
  const { trigger, triggerPageId } = resolveFiringPolicy(config);
  switch (trigger) {
    case 'runStart':
      return point === 'runStart';
    case 'runComplete':
      return point === 'runComplete';
    case 'atPage': {
      if (point !== 'submit') { return false; }
      // A floor, not a fixed point. Eligible from the moment that page is
      // submitted, and at every evaluation after -- so a block whose inputs are
      // not ready when its page submits fires later instead of never.
      if (triggerPageId === undefined) { return false; }
      if (progress.currentPageId === triggerPageId) { return true; }
      return (progress.visitedPageIds ?? []).includes(triggerPageId);
    }
    case 'everySubmit':
    default:
      return point === 'submit';
  }
}

/** Thrown shape matches the repo's error contract: "Validation error" maps to 400. */
export function validateFiringPolicy(config: Pick<JsQuestionConfig, 'trigger' | 'repeat' | 'triggerPageId'>): void {
  const { trigger, triggerPageId } = resolveFiringPolicy(config);
  if (trigger === 'atPage' && (triggerPageId === undefined || triggerPageId === '')) {
    throw new Error('Validation error: triggerPageId is required when trigger is "atPage"');
  }
  if (trigger !== 'atPage' && triggerPageId !== undefined) {
    throw new Error(`Validation error: triggerPageId is only allowed when trigger is "atPage", not "${trigger}"`);
  }
}

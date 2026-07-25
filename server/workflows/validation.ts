/**
 * Validation Engine for Intake Runner 2.0 (Stage 20 PR 6)
 *
 * Centralized validation with field-level validators, page aggregation,
 * and integration with conditional visibility.
 */

import type { Step } from "@shared/schema";
import { isRunnerRequirableStepType } from "@shared/types/runnerStepTypes";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validateValue } from "@shared/validation/Validator";

import { logger } from "../logger";

/**
 * RUN2-16 rollout switch.
 *
 * Format rules (minLength/maxLength/min/max/email/url/pattern) were enforced
 * only in the browser before this change, so runs already in flight may hold
 * values that violate them. Flipping straight to enforcement would start
 * failing those respondents mid-interview. Warn-mode logs every divergence
 * without blocking; set SERVER_FIELD_VALIDATION=enforce once the logs are
 * clean.
 *
 * `required` is unaffected by this switch — it was always enforced server-side
 * and still is, in both modes.
 */
export function isServerFieldValidationEnforced(): boolean {
  return process.env.SERVER_FIELD_VALIDATION === 'enforce';
}

export interface ValidationError {
  fieldId: string;
  fieldTitle: string;
  errors: string[];
}

export interface PageValidationResult {
  valid: boolean;
  errors: ValidationError[];
  errorCount: number;
}

/**
 * Split a field's validation errors into what actually blocks the submit.
 *
 * A `required` failure short-circuits `validateValue`, so when the value is
 * empty and the step is required every returned error IS the required error —
 * that has always blocked server-side and continues to, in both modes. Anything
 * else is a format rule, newly enforced by RUN2-16, and is only blocking once
 * SERVER_FIELD_VALIDATION=enforce.
 */
function partitionFieldErrors(
  errors: string[],
  step: Step,
  value: unknown,
  enforce: boolean
): string[] {
  if (errors.length === 0) {
    return [];
  }

  const isRequiredFailure = step.required === true && isEmpty(value);
  if (isRequiredFailure || enforce) {
    return errors;
  }

  logger.warn(
    { stepId: step.id, stepType: step.type, errors },
    'Server-side field validation would have rejected this value (warn mode)'
  );
  return [];
}

/**
 * Validates all fields on a page
 */
export async function validatePage(
  steps: Step[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values are dynamic per question type
  values: Record<string, any>,
  visibleStepIds: string[] // From IntakeQuestionVisibilityService
): Promise<PageValidationResult> {
  const errors: ValidationError[] = [];
  const visible = new Set(visibleStepIds);
  const enforce = isServerFieldValidationEnforced();

  for (const step of steps) {
    // Skip hidden steps
    if (!visible.has(step.id)) {
      continue;
    }

    // Skip virtual steps
    if (step.isVirtual) {
      continue;
    }

    // Skip step types the runner cannot render a fillable control for
    // (e.g. file_upload, loop_group, repeater, or an unrecognized type).
    // The runner shows only a skip notice for these, so neither a required
    // check nor a repeater instance-count check can ever be satisfied by
    // the respondent (RUN2-3) — mirrors the client-side skip in
    // shared/validation/BlockValidation.ts.
    if (!isRunnerRequirableStepType(step.type)) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = values[step.id];

    // RUN2-16: derive the rules from the SAME shared schema builder the client
    // uses, instead of the old server-only config that carried `required` and a
    // `// TODO: Extract from step.config` for everything else — which is why
    // every format rule was client-side-only and trivially bypassable.
    // Note: `repeater` is one of the runner's intentionally-unsupported types
    // (skipped above), so instance-count validation never runs here (RUN2-3).
    const schema = getValidationSchema({
      id: step.id,
      type: step.type,
      config: step.config,
      required: step.required ?? undefined,
    });
    // Keep the server's existing required wording ("<title> is required") rather
    // than the shared engine's generic default, so `required` behaviour is
    // byte-identical to before RUN2-16 for every respondent and caller.
    const result = await validateValue({
      schema: { ...schema, requiredMessage: `${step.title} is required` },
      value,
      values,
    });
    const fieldErrors = partitionFieldErrors(result.errors, step, value, enforce);

    if (fieldErrors.length > 0) {
      errors.push({
        fieldId: step.id,
        fieldTitle: step.title,
        errors: fieldErrors,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    errorCount: errors.reduce((sum, e) => sum + e.errors.length, 0),
  };
}

/**
 * Checks if a value is empty
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- checks emptiness across all value types
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * Formats validation errors for display
 */
export function formatValidationErrors(result: PageValidationResult): string[] {
  const messages: string[] = [];

  for (const error of result.errors) {
    for (const msg of error.errors) {
      messages.push(msg);
    }
  }

  return messages;
}

/**
 * Gets first error for a field (for inline display)
 */
export function getFieldError(
  result: PageValidationResult,
  fieldId: string
): string | null {
  const error = result.errors.find(e => e.fieldId === fieldId);
  return error && error.errors.length > 0 ? error.errors[0] : null;
}

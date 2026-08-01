/**
 * Validation Engine for Intake Runner 2.0 (Stage 20 PR 6)
 *
 * Centralized validation with field-level validators, page aggregation,
 * and integration with conditional visibility.
 */

import { isRunnerRequirableStepType } from "@shared/types/runnerStepTypes";
import type { ListConfig } from "@shared/types/stepConfigs";
import {
  getValidationSchema,
  validateListValue,
  type ListValidationErrors,
} from "@shared/validation/BlockValidation";
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
  path?: string;
  errors: string[];
}

/**
 * Minimal step shape `validatePage` needs. A live DB row (`Step` from
 * `@shared/schema`) and a run's pinned-definition snapshot (`RunStep` in
 * `server/services/workflow-runs/RunDefinitionProvider.ts`, RVP-1) both
 * satisfy this -- RVP-3 made `RunExecutionCoordinator.submitSection` source
 * steps from the run's definition provider (pinned graph or live tables)
 * instead of always reading the live `steps` table directly, so this can no
 * longer be pinned to the exact DB-inferred `Step` type. Mirrors the
 * `StepLike` precedent in `shared/validation/BlockValidation.ts`.
 */
export interface ValidatablePageStep {
  id: string;
  type: string;
  title: string;
  config: unknown;
  alias?: string | null;
  required?: boolean | null;
  isVirtual?: boolean | null;
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
  step: ValidatablePageStep,
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

function isListConfig(config: unknown): config is ListConfig {
  return typeof config === 'object'
    && config !== null
    && Array.isArray((config as { fields?: unknown }).fields);
}

/**
 * `step.config` is jsonb, so persisted or snapshot data can be malformed even
 * though authoring normally writes a ListConfig. Keep that bad data inside the
 * validation result instead of allowing it to crash section submission.
 */
function safelyValidateListValue(
  value: unknown,
  config: unknown,
  path: string
): ListValidationErrors {
  if (!isListConfig(config)) {
    return { [path]: ['Invalid list configuration'] };
  }

  try {
    return validateListValue(value, config, path);
  } catch {
    return { [path]: ['Invalid list configuration'] };
  }
}

function appendListValidationErrors(
  target: ValidationError[],
  step: ValidatablePageStep,
  value: unknown,
  enforce: boolean
): void {
  const rootPath = step.alias ?? step.id;
  const listErrors = safelyValidateListValue(value, step.config, rootPath);

  for (const [path, pathErrors] of Object.entries(listErrors)) {
    const blockingErrors = partitionFieldErrors(pathErrors, step, value, enforce);
    if (blockingErrors.length > 0) {
      target.push({
        fieldId: step.id,
        fieldTitle: step.title,
        path,
        errors: blockingErrors,
      });
    }
  }
}

/**
 * Validates all fields on a page
 */
export async function validatePage(
  steps: ValidatablePageStep[],
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = values[step.id];

    // List values have recursive, path-keyed validation that cannot be
    // represented by the flat ValidationRule[] schema used below. Validate
    // them before the runner-support guard so this wiring is already active
    // when the runner starts rendering lists (LIST-8).
    if (step.type === 'list') {
      appendListValidationErrors(errors, step, value, enforce);
      continue;
    }

    // Skip step types the runner cannot render a fillable control for
    // (e.g. file_upload, or an unrecognized type).
    // The runner shows only a skip notice for these, so neither a required
    // check can ever be satisfied by
    // the respondent (RUN2-3) — mirrors the client-side skip in
    // shared/validation/BlockValidation.ts.
    if (!isRunnerRequirableStepType(step.type)) {
      continue;
    }

    // RUN2-16: derive the rules from the SAME shared schema builder the client
    // uses, instead of the old server-only config that carried `required` and a
    // `// TODO: Extract from step.config` for everything else — which is why
    // every format rule was client-side-only and trivially bypassable.
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

/**
 * Runner step-type classification
 *
 * Single source of truth for which persisted step types the runner can
 * actually present a fillable control for. Consumed by:
 * - `client/src/components/runner/blocks/stepTypeRouting.ts` (render routing)
 * - `shared/validation/BlockValidation.ts` (client-side required-rule generation)
 * - `server/workflows/validation.ts` (server-side page-submit validation)
 *
 * Do not duplicate these lists elsewhere — a step type that is "unsupported"
 * or "unknown" here has no input a respondent can fill in, so neither
 * validator may require it (see RUN2-3: a required question the runner
 * cannot render makes the interview unfinishable).
 */

export type RunnerStepType =
  | "short_text"
  | "long_text"
  | "text"
  | "boolean"
  | "phone"
  | "email"
  | "website"
  | "date"
  | "time"
  | "date_time"
  | "number"
  | "currency"
  | "scale"
  | "choice"
  | "address"
  | "multi_field"
  | "display"
  | "final_documents"
  | "signature_block"
  | "js_question"
  | "computed"
  | "file_upload"
  | "list";

export const RUNNER_RENDERED_STEP_TYPES = [
  "short_text",
  "long_text",
  "text",
  "boolean",
  "phone",
  "email",
  "website",
  "date",
  "time",
  "date_time",
  "number",
  "currency",
  "scale",
  "choice",
  "address",
  "multi_field",
  "display",
  "final_documents",
  "signature_block",
  "file_upload",
  "list",
] as const satisfies readonly RunnerStepType[];

export const RUNNER_HIDDEN_STEP_TYPES = [
  "js_question",
  "computed",
] as const satisfies readonly RunnerStepType[];

export const RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES = [] as const satisfies readonly RunnerStepType[];

const NORMALIZED_STEP_TYPES: Record<string, RunnerStepType> = {
  yes_no: "boolean",
  true_false: "boolean",
  multiple_choice: "choice",
  radio: "choice",
  datetime: "date_time",
  datetime_unified: "date_time",
  phone_advanced: "phone",
  email_advanced: "email",
  number_advanced: "number",
  scale_advanced: "scale",
  website_advanced: "website",
  address_advanced: "address",
  display_advanced: "display",
  final: "final_documents",
  signature: "signature_block",
};

const renderedTypes = new Set<string>(RUNNER_RENDERED_STEP_TYPES);
const hiddenTypes = new Set<string>(RUNNER_HIDDEN_STEP_TYPES);
const unsupportedTypes = new Set<string>(RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES);

export function normalizeRunnerStepType(type: string): string {
  return NORMALIZED_STEP_TYPES[type] ?? type;
}

export type RunnerStepTypeStatus = "rendered" | "hidden" | "unsupported" | "unknown";

export function getRunnerStepTypeStatus(type: string): RunnerStepTypeStatus {
  const normalized = normalizeRunnerStepType(type);

  if (renderedTypes.has(normalized)) {
    return "rendered";
  }
  if (hiddenTypes.has(normalized)) {
    return "hidden";
  }
  if (unsupportedTypes.has(normalized)) {
    return "unsupported";
  }

  return "unknown";
}

/**
 * True when the runner can render a control for this step type that a
 * respondent could actually fill in — i.e. status is "rendered" or "hidden"
 * (execution-only steps like js_question/computed are populated by scripts,
 * not by the respondent, but that is unrelated to this fix and unchanged
 * here). "unsupported" and "unknown" types render only a skip notice, so a
 * `required` rule on one of them can never be satisfied (RUN2-3) and both
 * validators must skip it.
 */
export function isRunnerRequirableStepType(type: string): boolean {
  const status = getRunnerStepTypeStatus(type);
  return status !== "unsupported" && status !== "unknown";
}

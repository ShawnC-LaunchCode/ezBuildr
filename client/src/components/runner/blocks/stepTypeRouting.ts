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
  | "loop_group"
  | "repeater";

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
] as const satisfies readonly RunnerStepType[];

export const RUNNER_HIDDEN_STEP_TYPES = [
  "js_question",
  "computed",
] as const satisfies readonly RunnerStepType[];

export const RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES = [
  "file_upload",
  "loop_group",
  "repeater",
] as const satisfies readonly RunnerStepType[];

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

export function getRunnerStepTypeStatus(type: string): "rendered" | "hidden" | "unsupported" | "unknown" {
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

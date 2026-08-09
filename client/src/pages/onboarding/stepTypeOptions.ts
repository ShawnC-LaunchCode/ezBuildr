/**
 * Question-type picker options for the document onboarding wizard (GH-167).
 *
 * The type list comes from `RUNNER_RENDERED_STEP_TYPES` — the canonical,
 * already-exported set of `stepTypeEnum` members the runner can actually
 * present a fillable control for (see the `add-step-type` skill and
 * `shared/types/runnerStepTypes.ts`). This is deliberately *not* a
 * hand-picked subset: every generated step must be fillable in
 * PreviewRunner (AC3), and `RUNNER_RENDERED_STEP_TYPES` is exactly the set
 * that guarantees that.
 *
 * `BLOCK_REGISTRY` supplies labels for the types it covers; the handful of
 * runner-only types it doesn't register (file_upload, final_documents,
 * signature_block) get a small local fallback label.
 */
import { BLOCK_REGISTRY } from "@/lib/blockRegistry";
import { RUNNER_RENDERED_STEP_TYPES } from "@shared/types/runnerStepTypes";

const FALLBACK_LABELS: Record<string, string> = {
  file_upload: "File Upload",
  final_documents: "Final Documents",
  signature_block: "Signature",
};

const registryLabels = new Map(BLOCK_REGISTRY.map((entry) => [entry.type, entry.label]));

export interface StepTypeOption {
  value: string;
  label: string;
}

export const ONBOARDING_STEP_TYPE_OPTIONS: StepTypeOption[] = RUNNER_RENDERED_STEP_TYPES.map((type) => ({
  value: type,
  label: registryLabels.get(type) ?? FALLBACK_LABELS[type] ?? type,
}));

const RUNNER_TYPE_SET = new Set<string>(RUNNER_RENDERED_STEP_TYPES);

/** True when `type` is one of the picker's valid, runner-fillable options. */
export function isOnboardingStepType(type: string): boolean {
  return RUNNER_TYPE_SET.has(type);
}

/** Best-effort default question type for an AI-analyzed variable's coarse type. */
export function defaultStepTypeFor(analyzedType: string | undefined): string {
  switch (analyzedType) {
    case "date":
      return "date";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "long_text";
    case "text":
    default:
      return "short_text";
  }
}

/** camelCase alias fallback used when the AI didn't suggest one for a variable. */
export function toCamelCaseAlias(raw: string): string {
  const words = raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "field";
  }
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Human-readable title fallback derived from a raw variable/placeholder name. */
export function toHumanLabel(raw: string): string {
  const words = raw
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return raw;
  }
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

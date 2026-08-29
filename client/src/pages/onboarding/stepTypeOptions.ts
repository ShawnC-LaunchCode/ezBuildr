/**
 * Question-type picker options for the document onboarding wizard (GH-167).
 *
 * Persisted types come from `RUNNER_RENDERED_STEP_TYPES` — the canonical,
 * already-exported set the runner can present. Text is represented by two
 * friendly preset identities so Short Text and Long Text can share the
 * canonical stored `text` type without colliding in the picker.
 *
 * `BLOCK_REGISTRY` supplies labels for the types it covers; the handful of
 * runner-only types it doesn't register (file_upload, final_documents,
 * signature_block) get a small local fallback label.
 */
import { BLOCK_REGISTRY, QUESTION_PRESETS } from "@/lib/blockRegistry";
import { RUNNER_RENDERED_STEP_TYPES } from "@shared/types/runnerStepTypes";

import type { OnboardingVariable } from "./onboardingTypes";
import type { StepConfig } from "@shared/types/stepConfigs";

const FALLBACK_LABELS: Record<string, string> = {
  file_upload: "File Upload",
  final_documents: "Final Documents",
  signature_block: "Signature",
};

const registryLabels = new Map(BLOCK_REGISTRY.map((entry) => [entry.type, entry.label]));

export interface StepTypeOption {
  value: string;
  label: string;
  type: string;
  presetId?: string;
  createDefaultConfig?: () => StepConfig;
}

const ONBOARDING_PRESET_OPTIONS: StepTypeOption[] = QUESTION_PRESETS
  .filter((preset) => preset.canonicalType === "text" || preset.id === "easy.currency")
  .map((preset) => ({
    value: preset.id,
    label: preset.label,
    type: preset.persistedType,
    presetId: preset.id,
    createDefaultConfig: preset.createDefaultConfig,
  }));

export const ONBOARDING_STEP_TYPE_OPTIONS: StepTypeOption[] = [
  ...ONBOARDING_PRESET_OPTIONS,
  ...RUNNER_RENDERED_STEP_TYPES.filter((type) => type !== "text").map((type) => ({
    value: type,
    label: registryLabels.get(type) ?? FALLBACK_LABELS[type] ?? type,
    type,
  })),
];

const RUNNER_TYPE_SET = new Set<string>(RUNNER_RENDERED_STEP_TYPES);

/** True when `type` is one of the picker's valid, runner-fillable options. */
export function isOnboardingStepType(type: string): boolean {
  return RUNNER_TYPE_SET.has(type);
}

function selectionFromOption(option: StepTypeOption): Pick<OnboardingVariable, "type" | "presetId" | "config"> {
  return {
    type: option.type,
    presetId: option.presetId,
    config: option.createDefaultConfig?.(),
  };
}

export function selectOnboardingStepType(value: string): Pick<OnboardingVariable, "type" | "presetId" | "config"> {
  const option = ONBOARDING_STEP_TYPE_OPTIONS.find((candidate) => candidate.value === value);
  if (!option) {
    throw new Error(`Unsupported onboarding step selection: ${value}`);
  }
  return selectionFromOption(option);
}

export function onboardingStepTypeValue(variable: OnboardingVariable): string {
  if (variable.presetId && ONBOARDING_STEP_TYPE_OPTIONS.some((option) => option.value === variable.presetId)) {
    return variable.presetId;
  }
  if (variable.type === "text") {
    const variant = variable.config && "variant" in variable.config ? variable.config.variant : "short";
    return variant === "long" ? "easy.long-text" : "easy.short-text";
  }
  if (variable.type === "currency") {
    return "easy.currency";
  }
  if (variable.type === "number" && variable.config && "mode" in variable.config) {
    return variable.config.mode === "currency_whole" || variable.config.mode === "currency_decimal"
      ? "easy.currency"
      : variable.type;
  }
  return variable.type;
}

/** Best-effort canonical selection for an AI-analyzed variable's coarse type. */
export function defaultStepSelectionFor(
  analyzedType: string | undefined
): Pick<OnboardingVariable, "type" | "presetId" | "config"> {
  let value: string;
  switch (analyzedType) {
    case "date":
      value = "date";
      break;
    case "number":
      value = "number";
      break;
    case "boolean":
      value = "boolean";
      break;
    case "array":
      value = "easy.long-text";
      break;
    case "text":
    default:
      value = "easy.short-text";
      break;
  }
  return selectOnboardingStepType(value);
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

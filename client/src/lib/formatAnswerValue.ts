/**
 * Formats a collected answer value for read-only display. Shared by
 * ReviewPage.tsx (top-level step answers) and ListAnswerView.tsx (field
 * values inside a List item) so the two surfaces can't grow independent
 * formatting rules.
 */
import { normalizeRunnerStepType } from "@shared/types/runnerStepTypes";

export interface AnswerFormatContext {
  type?: string | null;
  config?: unknown;
}

interface ReviewChoiceOption {
  id?: string;
  alias?: string;
  label?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeChoiceOption(option: unknown): ReviewChoiceOption | null {
  if (typeof option === "string") {
    return { id: option, alias: option, label: option };
  }
  if (!isRecord(option)) {
    return null;
  }
  return {
    id: typeof option.id === "string" ? option.id : undefined,
    alias: typeof option.alias === "string" ? option.alias : undefined,
    label: typeof option.label === "string" ? option.label : undefined,
  };
}

function getChoiceOptions(config: unknown): ReviewChoiceOption[] {
  if (!isRecord(config)) {
    return [];
  }
  const rawOptions = config.options;
  const options = isRecord(rawOptions) && rawOptions.type === "static" ? rawOptions.options : rawOptions;
  if (!Array.isArray(options)) {
    return [];
  }
  return options.map(normalizeChoiceOption).filter((option): option is ReviewChoiceOption => option !== null);
}

function formatChoiceValue(value: unknown, config: unknown): string {
  const options = getChoiceOptions(config);
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    const storedValue = String(item);
    return options.find((option) =>
      option.id === storedValue || option.alias === storedValue || option.label === storedValue
    )?.label ?? storedValue;
  }).join(", ");
}

function formatAddressValue(value: unknown, config: unknown): string {
  if (!isRecord(value)) {
    return formatAnswerValue(value);
  }

  if (isRecord(config) && Array.isArray(config.fields)) {
    const configuredParts = config.fields.flatMap((field) => {
      if (!isRecord(field) || typeof field.key !== "string") {
        return [];
      }
      const fieldValue = value[field.key];
      if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
        return [];
      }
      const label = typeof field.label === "string" && field.label.trim() !== "" ? field.label : field.key;
      return [`${label}: ${formatAnswerValue(fieldValue)}`];
    });
    if (configuredParts.length > 0) {
      return configuredParts.join(", ");
    }
  }

  const stringValue = (key: string): string => typeof value[key] === "string" ? value[key].trim() : "";
  const locality = [stringValue("city"), [stringValue("state"), stringValue("zip")].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const knownParts = [
    stringValue("street"),
    stringValue("street2"),
    locality,
    stringValue("country"),
  ].filter(Boolean);
  if (knownParts.length > 0) {
    return knownParts.join(", ");
  }

  return Object.values(value)
    .filter((part): part is string | number | boolean =>
      typeof part === "string" || typeof part === "number" || typeof part === "boolean"
    )
    .map(String)
    .filter(Boolean)
    .join(", ");
}

function formatBooleanValue(value: boolean, config: unknown): string {
  if (!isRecord(config)) {
    return value ? "Yes" : "No";
  }

  const preferredKey = value ? "trueLabel" : "falseLabel";
  const legacyKey = value ? "yesLabel" : "noLabel";
  const configuredLabel = config[preferredKey] ?? config[legacyKey];
  return typeof configuredLabel === "string" && configuredLabel.trim() !== ""
    ? configuredLabel
    : value ? "Yes" : "No";
}

export function formatAnswerValue(val: unknown, context: AnswerFormatContext = {}): string {
  if (val === null || val === undefined || val === "") {
    return "Not answered";
  }

  const normalizedType = context.type ? normalizeRunnerStepType(context.type) : undefined;
  if (normalizedType === "choice") {
    return formatChoiceValue(val, context.config);
  }
  if (normalizedType === "address") {
    return formatAddressValue(val, context.config);
  }

  if (typeof val === "boolean") {
    return normalizedType === "boolean"
      ? formatBooleanValue(val, context.config)
      : val ? "Yes" : "No";
  }
  if (val instanceof Date) {
    return val.toLocaleDateString();
  }
  if (Array.isArray(val)) {
    return val.join(", ");
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

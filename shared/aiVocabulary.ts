/**
 * Canonical AI workflow vocabulary and its server-side capability contract.
 *
 * This text ships on every AI request, so entries stay to names, friendly
 * presets, and one-line config summaries — never full JSON schemas.
 */

import { z } from "zod";

import { conditionalActionEnum } from "./schema/workflow";
import { comparisonOperatorSchema } from "./types/conditions";
import {
  CANONICAL_STEP_TYPES,
  type CanonicalStepType,
  type ListConfig,
  type ListField,
} from "./types/stepConfigs";
import { getConfigSchema } from "./validation/stepConfigSchemas";
import { workflowPatchOpSchema, type WorkflowPatchOp } from "./validation/aiWorkflowEdit.schema";

import type { Mode } from "./mode";

interface StepCapability {
  easy: boolean;
  easyConfigKeys: readonly string[];
  easyPresets?: readonly string[];
}

/**
 * Easy exposure is product metadata, not a second stored toolbox. Advanced
 * always exposes every canonical type and every implemented schema key.
 */
export const CANONICAL_STEP_CAPABILITIES = {
  text: {
    easy: true,
    easyConfigKeys: ["variant", "validation.minLength", "validation.maxLength", "validation.pattern", "validation.patternMessage", "placeholder", "helpText", "autoComplete"],
    easyPresets: ['Short Text => {"variant":"short"}', 'Long Text => {"variant":"long"}'],
  },
  boolean: {
    easy: true,
    easyConfigKeys: ["trueLabel", "falseLabel", "defaultValue", "displayStyle"],
    easyPresets: ['Yes/No => {"trueLabel":"Yes","falseLabel":"No","displayStyle":"buttons"}', 'True/False => {"trueLabel":"True","falseLabel":"False","displayStyle":"buttons"}'],
  },
  phone: { easy: true, easyConfigKeys: ["format", "validation.strict", "placeholder"] },
  date_time: {
    easy: true,
    easyConfigKeys: ["kind", "minDate", "maxDate", "defaultToToday", "timeFormat", "timeStep"],
    easyPresets: ['Date => {"kind":"date"}', 'Time => {"kind":"time","timeFormat":"12h","timeStep":15}', 'Date/Time => {"kind":"datetime","timeFormat":"12h","timeStep":15}'],
  },
  choice: {
    easy: true,
    easyConfigKeys: ["display", "layout", "options", "min", "max", "allowOther", "otherLabel"],
    easyPresets: ['Single Select => {"display":"radio"}', 'Multiple Choice => {"display":"multiple"}'],
  },
  email: { easy: true, easyConfigKeys: ["allowMultiple", "maxEmails", "placeholder"] },
  number: {
    easy: true,
    easyConfigKeys: ["mode", "validation.min", "validation.max", "validation.step", "currency", "placeholder"],
    easyPresets: ['Number => {"mode":"number"}', 'Currency => {"mode":"currency_decimal","currency":"USD"}'],
  },
  scale: { easy: true, easyConfigKeys: ["min", "max", "step", "display", "showValue", "minLabel", "maxLabel"] },
  website: { easy: true, easyConfigKeys: ["requireProtocol", "allowedProtocols", "placeholder"] },
  address: { easy: true, easyConfigKeys: ["country", "fields", "requireAll"] },
  multi_field: { easy: false, easyConfigKeys: [] },
  display: { easy: true, easyConfigKeys: ["markdown"] },
  file_upload: {
    easy: true,
    easyConfigKeys: ["maxSize", "allowedTypes", "maxFiles", "previewThumbnails"],
    easyPresets: ['File Upload => {"maxFiles":1}'],
  },
  list: { easy: true, easyConfigKeys: ["fields", "minItems", "maxItems", "labelTemplate", "addButtonText", "allowReorder", "emptyStateText"] },
  js_question: { easy: false, easyConfigKeys: [] },
  computed: { easy: false, easyConfigKeys: [] },
  final_documents: { easy: false, easyConfigKeys: [] },
  signature_block: { easy: false, easyConfigKeys: [] },
} as const satisfies Record<CanonicalStepType, StepCapability>;

const CANONICAL_TYPE_SET = new Set<string>(CANONICAL_STEP_TYPES);

/** Unwrap optionals/defaults/nullables/effects to the underlying schema. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault || current instanceof z.ZodNullable) {
      current = (current as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = (current as unknown as { _def: { schema: z.ZodTypeAny } })._def.schema;
      continue;
    }
    return current;
  }
}

function describeNested(key: string, field: z.ZodTypeAny): string[] {
  const inner = unwrap(field);
  if (!(inner instanceof z.ZodObject)) { return []; }
  const shape = inner.shape as Record<string, z.ZodTypeAny>;
  return Object.keys(shape).map((child) => `${key}.${child}`);
}

function describeField(key: string, schema: z.ZodTypeAny): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodArray) { return `${key}[]`; }
  if (inner instanceof z.ZodEnum) {
    const values = (inner as z.ZodEnum<[string, ...string[]]>).options;
    return values.length <= 4 ? `${key}(${values.join('|')})` : key;
  }
  return key;
}

function configKeyName(description: string): string {
  return description.replace(/\[\]$/, "").replace(/\([^)]*\)$/, "");
}

function getImplementedConfigKeys(stepType: CanonicalStepType): string[] | null {
  const schema = getConfigSchema(stepType);
  if (!schema) { return null; }
  const unwrapped = unwrap(schema);
  if (!(unwrapped instanceof z.ZodObject)) { return null; }
  const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
  return Object.keys(shape).flatMap((key) => {
    const nested = describeNested(key, shape[key]);
    return nested.length > 0 ? nested : [describeField(key, shape[key])];
  });
}

export function isCanonicalStepType(value: string): value is CanonicalStepType {
  return CANONICAL_TYPE_SET.has(value);
}

export function getAllowedStepTypes(mode: Mode): readonly CanonicalStepType[] {
  return mode === "advanced"
    ? CANONICAL_STEP_TYPES
    : CANONICAL_STEP_TYPES.filter((type) => CANONICAL_STEP_CAPABILITIES[type].easy);
}

/** Config descriptions advertised and accepted for this canonical type/mode. */
export function getConfigKeys(stepType: CanonicalStepType, mode: Mode): string[] | null {
  const implemented = getImplementedConfigKeys(stepType);
  if (implemented === null || mode === "advanced") { return implemented; }
  const allowed = new Set<string>(CANONICAL_STEP_CAPABILITIES[stepType].easyConfigKeys);
  return implemented.filter((description) => allowed.has(configKeyName(description)));
}

function buildCatalogLine(type: CanonicalStepType, mode: Mode): string {
  const keys = getConfigKeys(type, mode);
  const capability = CANONICAL_STEP_CAPABILITIES[type];
  const presets = mode === "easy" && "easyPresets" in capability
    ? capability.easyPresets
    : undefined;
  const presetText = presets === undefined ? "" : ` [presets: ${presets.join("; ")}]`;
  if (keys === null) { return `- ${type}${presetText}: (no config contract; omit config)`; }
  if (keys.length === 0) { return `- ${type}${presetText}: (no config)`; }
  return `- ${type}${presetText}: ${keys.join(", ")}`;
}

/** One line per mode-visible canonical type. */
export function buildStepTypeCatalog(mode: Mode): string {
  return getAllowedStepTypes(mode).map((type) => buildCatalogLine(type, mode)).join("\n");
}

export function buildOperatorCatalog(): string {
  return comparisonOperatorSchema.options.join(', ');
}

export function buildActionCatalog(): string {
  return conditionalActionEnum.enumValues.join(', ');
}

export function getOpNames(): string[] {
  return workflowPatchOpSchema.options.map(
    (option) => (option.shape.op as z.ZodLiteral<string>).value,
  );
}

export function buildOpCatalog(): string {
  return getOpNames().map((op) => `- ${op}`).join('\n');
}

function disallowedConfigPaths(config: Record<string, unknown>, allowedKeys: readonly string[]): string[] {
  const allowed = new Set(allowedKeys);
  const invalid: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (allowed.has(key)) { continue; }
    const nestedKeys = allowedKeys.filter((allowedKey) => allowedKey.startsWith(`${key}.`));
    if (nestedKeys.length === 0 || value === null || typeof value !== "object" || Array.isArray(value)) {
      invalid.push(key);
      continue;
    }
    const nested = disallowedConfigPaths(
      value as Record<string, unknown>,
      nestedKeys.map((allowedKey) => allowedKey.slice(key.length + 1)),
    );
    invalid.push(...nested.map((child) => `${key}.${child}`));
  }
  return invalid;
}

function validateEasyChoiceOptions(config: Record<string, unknown>): void {
  const options = config.options;
  if (options === null || typeof options !== "object" || Array.isArray(options)) { return; }
  if ((options as Record<string, unknown>).type !== "static") {
    throw new Error("Easy mode forbids choice dynamic option sources");
  }
}

function validateListFields(fields: ListField[], mode: Mode): void {
  for (const field of fields) {
    if (field.kind === "list") {
      validateListConfig(field.list, mode);
      continue;
    }
    parseStepConfigForMode(field.type, field.config, mode);
  }
}

function validateListConfig(config: ListConfig, mode: Mode): void {
  validateListFields(config.fields, mode);
}

function requireAllowedStepType(stepType: string, mode: Mode): CanonicalStepType {
  if (!isCanonicalStepType(stepType)) {
    throw new Error(`AI step type "${stepType}" is not canonical`);
  }
  if (!getAllowedStepTypes(mode).includes(stepType)) {
    throw new Error(`${mode === "easy" ? "Easy" : "Advanced"} mode forbids step type "${stepType}"`);
  }
  return stepType;
}

function parseConfigWithoutSchema(stepType: CanonicalStepType, config: unknown): unknown {
  const hasConfig = config !== undefined && config !== null &&
    (typeof config !== "object" || Array.isArray(config) || Object.keys(config as Record<string, unknown>).length > 0);
  if (hasConfig) { throw new Error(`Step type "${stepType}" has no config contract; omit config`); }
  return config;
}

function validateModeConfigKeys(stepType: CanonicalStepType, config: unknown, mode: Mode): void {
  if (config === undefined || config === null) { return; }
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Config for "${stepType}" must be an object`);
  }
  const allowed = getConfigKeys(stepType, mode)?.map(configKeyName) ?? [];
  const invalid = disallowedConfigPaths(config as Record<string, unknown>, allowed);
  if (invalid.length > 0) {
    throw new Error(`${mode === "easy" ? "Easy" : "Advanced"} mode forbids config key(s) for "${stepType}": ${invalid.join(", ")}`);
  }
  if (mode === "easy" && stepType === "choice") {
    validateEasyChoiceOptions(config as Record<string, unknown>);
  }
}

/**
 * Parse an AI-authored config through the canonical schema and mode allowlist.
 * The parsed value is safe to persist; unknown/hidden keys are rejected before
 * Zod can strip them.
 */
export function parseStepConfigForMode(
  stepType: string,
  config: unknown,
  mode: Mode,
): unknown {
  const canonicalType = requireAllowedStepType(stepType, mode);
  const schema = getConfigSchema(canonicalType);
  if (!schema) {
    return parseConfigWithoutSchema(canonicalType, config);
  }

  validateModeConfigKeys(canonicalType, config, mode);

  const result = schema.safeParse(config);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid canonical config for "${canonicalType}" at ${issue.path.join(".") || "config"}: ${issue.message}`);
  }
  if (canonicalType === "list" && result.data !== undefined) {
    validateListConfig(result.data as ListConfig, mode);
  }
  return result.data;
}

/** Validate a whole generated/applied patch against one effective mode. */
export function validateWorkflowPatchOpsForMode(
  ops: readonly WorkflowPatchOp[],
  mode: Mode,
  existingStepTypes: ReadonlyMap<string, string> = new Map(),
): void {
  const tempStepTypes = new Map<string, string>();
  for (const op of ops) {
    if (op.op === "step.create") {
      parseStepConfigForMode(op.type, op.config, mode);
      if (op.tempId) { tempStepTypes.set(op.tempId, op.type); }
      continue;
    }
    if (op.op !== "step.update") { continue; }
    if (op.type === undefined && op.config === undefined) { continue; }
    const existingType = op.id === undefined
      ? (op.tempId === undefined ? undefined : tempStepTypes.get(op.tempId))
      : existingStepTypes.get(op.id);
    const effectiveType = op.type ?? existingType;
    if (effectiveType === undefined) {
      if (op.config !== undefined) {
        throw new Error("Cannot validate step.update config without a canonical step type");
      }
      continue;
    }
    parseStepConfigForMode(effectiveType, op.config, mode);
    if (op.tempId && op.type) { tempStepTypes.set(op.tempId, op.type); }
  }
}

interface GeneratedWorkflowForModeValidation {
  pages: Array<{
    steps: Array<{ type: string; config?: unknown }>;
  }>;
}

/** Validate full-workflow model output before it reaches an ingest boundary. */
export function validateGeneratedWorkflowForMode(
  workflow: GeneratedWorkflowForModeValidation,
  mode: Mode,
): void {
  for (const page of workflow.pages) {
    for (const step of page.steps) {
      parseStepConfigForMode(step.type, step.config, mode);
    }
  }
}

/** The full, mode-specific vocabulary block spliced into system prompts. */
export function buildWorkflowVocabulary(mode: Mode): string {
  return `Available operations:
${buildOpCatalog()}

Step types and config keys for ${mode} mode (always persist the canonical type shown; friendly presets are labels/configs, never type names):
${buildStepTypeCatalog(mode)}

Condition operators (for visibleIf conditions and logic rules):
${buildOperatorCatalog()}

Logic rule actions:
${buildActionCatalog()}

Sections group pages. A Section always covers a CONTIGUOUS span of pages in the
workflow's page order and can never be empty, so:
- Create the pages first, then group them with one section.create naming those
  pages (by id, or by the tempId each page.create was given), in page order.
- To put an existing page into a Section, use page.setSection. It must sit
  directly beside that Section's existing pages, or the op is rejected.
- page.setSection with "sectionId": null takes a page out of its Section. Doing
  that to a Section's last page is rejected — delete the Section instead.
- section.delete keeps every page; they simply become ungrouped.
- A patch that would split a Section, or leave one empty, fails and is not
  applied. Reorder pages so the span stays whole rather than working around it.

Condition expressions are objects, not strings. Shape:
{"type":"group","id":"<uuid>","operator":"AND","conditions":[{"type":"condition","id":"<uuid>","variable":"<step alias>","operator":"equals","value":<value>,"valueType":"constant"}]}
Use null to clear a condition (always visible).

Exception: logicRule.create/update take "condition" as a "<alias> <operator> <value>"
string (e.g. "age greater_than 18", "email is_not_empty", "has_pet is_true"),
which the server parses into the object form above.`;
}

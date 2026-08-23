/**
 * Derives the workflow map's simulation panel (MAP-8, GH-153 AC3) inputs:
 * which steps a hypothetical-answer panel should even show, and how to render
 * a type-aware value input for each one. Pure — no React — matching
 * `mapLayout.ts`/`mapLintDecoration.ts`'s discipline.
 *
 * **AC1: only steps some condition actually references.** Listing every step
 * in the workflow would be unusable. The reference set comes from the same
 * extraction the lint pipeline uses (`extractConditionReferences` in
 * `shared/conditionGraph.ts`), applied to every page's `visibleIf`, every
 * step's `visibleIf`, and every rule's `when` — the three places a
 * `ConditionExpression` can live (see `shared/workflowMap.ts`'s module doc
 * comment for why those are the only three).
 *
 * A reference can name a step by **alias or id** (`Condition.variable`, see
 * `shared/types/conditions.ts`), so each raw reference is resolved against
 * the real step list before it counts — an alias/id that matches no step is
 * a dangling reference (already a lint finding elsewhere) and is silently
 * dropped here, not surfaced as a fake field.
 *
 * **AC2's easiest way to get silently wrong** (per the ticket): the answer
 * object handed to `simulateWorkflowPath` must be keyed by step **id**, with
 * alias resolution supplied separately. `buildStepAliasResolver` below is
 * `usePageVisibility.ts`'s exact resolver
 * (`allSteps.find(s => s.alias === variableName)?.id`), not a reimplementation.
 */
import type { ApiStep } from "@/lib/vault-api";

import { getLegacyChoiceOptions, type ChoiceOptionDescriptor } from "@shared/choiceOptions";
import { extractConditionReferences } from "@shared/conditionGraph";
import {
  getOperatorsForStepType,
  type ComparisonOperator,
  type ConditionSupportedStepType,
  type OperatorConfig,
  type VariableInfo,
} from "@shared/types/conditions";

/** A referenced step, paired with the operand/operator shape `ConditionValueInput` needs to render its answer field (AC7: reuse the existing input, invent nothing new). */
export interface SimulationField {
  step: ApiStep;
  variable: VariableInfo;
  operatorConfig: OperatorConfig;
}

interface ReferenceSource {
  visibleIf?: unknown;
}

interface RuleReferenceSource {
  when?: unknown;
}

interface AliasableStep {
  id: string;
  alias: string | null;
}

/**
 * Every step id that some `visibleIf` (page or step) or rule `when`
 * expression references, resolved from raw alias-or-id operands to real step
 * ids. An operand that resolves to nothing (dangling reference, or one of
 * this map's own steps missing) is dropped rather than invented.
 */
export function getReferencedStepIds(
  pages: ReferenceSource[],
  steps: AliasableStep[],
  rules: RuleReferenceSource[]
): Set<string> {
  const rawRefs = new Set<string>();
  for (const page of pages) {
    for (const ref of extractConditionReferences(page.visibleIf)) { rawRefs.add(ref); }
  }
  for (const step of steps) {
    for (const ref of extractConditionReferences((step as ReferenceSource).visibleIf)) { rawRefs.add(ref); }
  }
  for (const rule of rules) {
    for (const ref of extractConditionReferences(rule.when)) { rawRefs.add(ref); }
  }

  const stepIds = new Set<string>();
  for (const ref of rawRefs) {
    const step = steps.find((s) => s.id === ref || s.alias === ref);
    if (step) { stepIds.add(step.id); }
  }
  return stepIds;
}

/**
 * The actual `ApiStep` objects some condition references, in the workflow's
 * own step order (never re-sorted) — AC1.
 */
export function getReferencedSteps(
  pages: ReferenceSource[],
  steps: ApiStep[],
  rules: RuleReferenceSource[]
): ApiStep[] {
  const ids = getReferencedStepIds(pages, steps, rules);
  return steps.filter((step) => ids.has(step.id));
}

/**
 * Resolves a step alias referenced by a condition to its step id — built the
 * exact way `usePageVisibility.ts` does, so the panel's answers key
 * identically to how the runner itself resolves aliases (AC2).
 */
export function buildStepAliasResolver(steps: AliasableStep[]): (variableName: string) => string | undefined {
  return (variableName: string) => steps.find((s) => s.alias === variableName)?.id;
}

/**
 * Maps the persisted step type (`ApiStep.type`, ~37 values including easy-mode
 * and `_advanced` variants) onto the 10-value `ConditionSupportedStepType`
 * union the condition editor understands. Explicit aliases for the types that
 * really are the same legacy concept under another name; everything else
 * (phone, currency, scale, `*_advanced`, ...) falls back to `short_text` —
 * the same fallback `getOperatorsForStepType` already applies at the
 * step-type level (`OPERATORS_BY_STEP_TYPE[stepType] ?? ...short_text`), made
 * explicit here only because this function's return type must be a real
 * `ConditionSupportedStepType` for the compiler, not because the runtime
 * behaviour differs from the rest of the condition system.
 */
const CONDITION_STEP_TYPE_ALIASES: Record<string, ConditionSupportedStepType> = {
  short_text: "short_text",
  text: "short_text",
  long_text: "long_text",
  multiple_choice: "multiple_choice",
  choice: "multiple_choice",
  radio: "radio",
  yes_no: "yes_no",
  boolean: "yes_no",
  true_false: "yes_no",
  computed: "computed",
  date: "date_time",
  date_time: "date_time",
  datetime: "date_time",
  datetime_unified: "date_time",
  time: "date_time",
  file_upload: "file_upload",
  js_question: "js_question",
  list: "list",
};

export function toConditionStepType(type: string): ConditionSupportedStepType {
  return CONDITION_STEP_TYPE_ALIASES[type] ?? "short_text";
}

const CHOICE_STEP_TYPES = new Set<string>(["radio", "multiple_choice"]);

/** A step type is walking distance from Yes/No is a fine answer even though every visible-if operator for it needs none (is_true/is_false/is_empty/is_not_empty). */
const YES_NO_ANSWER_CHOICES: ChoiceOptionDescriptor[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** `is_empty`/`is_not_empty` are file_upload's only operators — any non-empty stand-in string satisfies `is_not_empty` the same way a real filename would. */
const FILE_UPLOAD_ANSWER_CHOICES: ChoiceOptionDescriptor[] = [
  { value: "provided", label: "Has a file" },
  { value: "", label: "No file" },
];

/**
 * Builds a synthetic single-value `OperatorConfig` (plus choices, when
 * relevant) purely to drive `ConditionValueInput`'s type-aware rendering —
 * this never reaches `conditionEvaluator`, only `condition.value` does. Picks
 * the step type's first operator that actually takes a value; `yes_no` and
 * `file_upload` have none (their whole operator list is value-less shortcuts
 * like `is_true`/`is_empty`), so those get a plain two-choice picker instead
 * of inventing a boolean-specific input component.
 */
function buildOperatorConfig(
  stepType: ConditionSupportedStepType,
  legacyChoices: ChoiceOptionDescriptor[] | undefined
): { operatorConfig: OperatorConfig; choices?: ChoiceOptionDescriptor[] } {
  if (stepType === "yes_no") {
    return {
      operatorConfig: { value: "is_true", label: "answer", needsValue: true, valueType: "choices" },
      choices: YES_NO_ANSWER_CHOICES,
    };
  }
  if (stepType === "file_upload") {
    return {
      operatorConfig: { value: "is_not_empty", label: "answer", needsValue: true, valueType: "choices" },
      choices: FILE_UPLOAD_ANSWER_CHOICES,
    };
  }

  const withValue = getOperatorsForStepType(stepType).find((op) => op.needsValue);
  const operatorConfig: OperatorConfig = withValue
    ? { ...withValue, needsTwoValues: false, value2Type: undefined }
    : { value: "equals" as ComparisonOperator, label: "answer", needsValue: true, valueType: "text" };
  return { operatorConfig, choices: legacyChoices };
}

/** Builds one `SimulationField` per referenced step, preserving the caller's order. */
export function buildSimulationFields(
  referencedSteps: ApiStep[],
  pageTitleById: ReadonlyMap<string, string>
): SimulationField[] {
  return referencedSteps.map((step) => {
    const stepType = toConditionStepType(step.type);
    const legacyChoices = CHOICE_STEP_TYPES.has(step.type) ? getLegacyChoiceOptions(step.config) : undefined;
    const { operatorConfig, choices } = buildOperatorConfig(stepType, legacyChoices);

    const variable: VariableInfo = {
      id: step.id,
      alias: step.alias,
      label: step.alias ?? step.title,
      title: step.title,
      type: stepType,
      pageId: step.pageId,
      pageTitle: pageTitleById.get(step.pageId) ?? "",
      choices,
    };

    return { step, variable, operatorConfig };
  });
}

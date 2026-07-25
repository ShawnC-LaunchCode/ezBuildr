/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/prefer-nullish-coalescing */
/**
 * Pure workflow lint rules.
 *
 * These operate on an already-serialized workflow (the same shape
 * `VersionService.serializeWorkflow` produces) and perform no I/O. They live
 * in their own module, separate from `WorkflowLintService`, so that
 * `VersionService` can gate publishing on them without creating a module cycle
 * — `WorkflowLintService` imports `versionService` to do its own
 * serialization, so a direct `VersionService -> WorkflowLintService` import
 * would be circular (RUN2-7).
 *
 * `WorkflowLintService.lint()` (serialize-then-lint, used by the workflow
 * routes) and `VersionService.publishVersion()` (which already holds the
 * serialized graph) both call `lintWorkflowContent`, so there is exactly one
 * implementation of these rules.
 */

export interface LintResult {
  type: "error" | "warning";
  message: string;
}

interface ReferenceSets {
  stepAliases: Set<string>;
  stepRefs: Set<string>;
  sectionRefs: Set<string>;
}

/** Serialized workflow content, as produced by `VersionService.serializeWorkflow`. */
export interface LintableWorkflowContent {
  sections?: Record<string, any>[];
  logicRules?: Record<string, any>[];
  transformBlocks?: Record<string, any>[];
  lifecycleHooks?: Record<string, any>[];
  documentHooks?: Record<string, any>[];
}

/**
 * Build the reference sets used to validate logic-rule targets/conditions and
 * visibleIf/input-key expressions.
 *
 * `VersionService.serializeWorkflow` never emits a `section.alias` field — a
 * section rule's `targetAlias` is the section **title**, and a step-condition's
 * `conditionStepAlias` falls back to the raw step **id** when the step has no
 * alias. So logic-rule references must be checked against ids-and-titles
 * (sections) or ids-and-aliases (steps), not against a step-alias-only set.
 * `stepAliases` is kept separate (alias-only) for visibleIf/input-key checks,
 * which only ever reference human-typed step aliases.
 */
function collectReferenceSets(sections: Record<string, any>[]): ReferenceSets {
  const stepAliases = new Set<string>();
  const stepRefs = new Set<string>();
  const sectionRefs = new Set<string>();

  for (const section of sections) {
    sectionRefs.add(section.id);
    if (section.title) { sectionRefs.add(section.title); }

    for (const step of section.steps || []) {
      stepRefs.add(step.id);
      if (step.alias) {
        stepAliases.add(step.alias);
        stepRefs.add(step.alias);
      }
    }
  }

  return { stepAliases, stepRefs, sectionRefs };
}

function extractStringIdentifiers(expression: string): string[] {
  return expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
}

/** Walk a ConditionExpression tree collecting every `variable` it references. */
function collectConditionVariables(node: unknown): string[] {
  if (node === null || typeof node !== "object") { return []; }
  const obj = node as Record<string, unknown>;
  const vars: string[] = [];

  if (typeof obj.variable === "string" && obj.variable.length > 0) {
    vars.push(obj.variable);
  }
  if (Array.isArray(obj.conditions)) {
    for (const child of obj.conditions) {
      vars.push(...collectConditionVariables(child));
    }
  }
  return vars;
}

function checkVisibleIf(
  expression: unknown,
  validAliases: Set<string>,
  contextLabel: string,
  results: LintResult[]
): void {
  if (!expression) { return; }

  // visibleIf is stored as a ConditionExpression object (jsonb), not a string:
  // { type: 'group', operator, conditions: [{ type: 'condition', variable, ... } | nested group] }.
  // Older/imported rows may still be a raw string expression — handle both.
  const referenced = typeof expression === "string"
    ? extractStringIdentifiers(expression)
    : collectConditionVariables(expression);

  const keywords = new Set(['true', 'false', 'null', 'undefined', 'and', 'or', 'not']);
  for (const id of referenced) {
    if (!keywords.has(id) && !validAliases.has(id)) {
      results.push({ type: "warning", message: `${contextLabel} visibleIf condition references unknown alias: "${id}"` });
    }
  }
}

function lintSections(
  sections: Record<string, any>[],
  validAliases: Set<string>,
  results: LintResult[]
): boolean {
  let hasSteps = false;
  for (const section of sections) {
    const steps = section.steps || [];
    if (steps.length > 0) {hasSteps = true;}

    checkVisibleIf(section.visibleIf, validAliases, `Section "${section.title}"`, results);

    for (const step of steps) {
      if (!step.alias) {results.push({ type: "warning", message: `Step "${step.title ?? step.id}" has no alias.` });}
      if (!step.title) {results.push({ type: "warning", message: `A step in section "${section.title}" is missing a title.` });}

      checkVisibleIf(step.visibleIf, validAliases, `Step "${step.title ?? step.id}"`, results);
    }
  }
  return hasSteps;
}

function lintLogicRules(
  rules: Record<string, any>[],
  stepRefs: Set<string>,
  sectionRefs: Set<string>,
  results: LintResult[]
): void {
  for (const rule of rules) {
    // Prefer the id field the serializer always emits alongside the alias;
    // the alias field is only a fallback for rules where the id is absent.
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
    if (conditionRef && !stepRefs.has(conditionRef)) {
      results.push({ type: "error", message: `Logic rule condition references unknown alias: "${conditionRef}"` });
    }

    const targetRefs = rule.targetType === "section" ? sectionRefs : stepRefs;
    const targetRef = rule.targetId ?? rule.targetAlias;
    if (targetRef && !targetRefs.has(targetRef)) {
      results.push({ type: "error", message: `Logic rule target references unknown alias: "${targetRef}"` });
    }
  }
}

function lintBlocksWithInputs(
  blocks: Record<string, any>[],
  typeName: string,
  validAliases: Set<string>,
  results: LintResult[]
): void {
  for (const b of blocks) {
    if (b.inputKeys) {
      for (const k of b.inputKeys) {
        if (!validAliases.has(k)) {
          results.push({ type: "error", message: `${typeName} "${b.name}" references unknown input alias: "${k}"` });
        }
      }
    }
  }
}

/**
 * Lint an already-serialized workflow. Returns errors and warnings; callers
 * decide what to block on (activation and publishing block on `type: "error"`).
 */
export function lintWorkflowContent(data: LintableWorkflowContent): LintResult[] {
  const results: LintResult[] = [];

  const sections = data.sections || [];
  if (sections.length === 0) {
    results.push({ type: "error", message: "Workflow must have at least one section." });
  }

  const { stepAliases, stepRefs, sectionRefs } = collectReferenceSets(sections);
  const hasSteps = lintSections(sections, stepAliases, results);

  if (sections.length > 0 && !hasSteps) {
    results.push({ type: "error", message: "Workflow must have at least one question." });
  }

  lintLogicRules(data.logicRules || [], stepRefs, sectionRefs, results);
  lintBlocksWithInputs(data.transformBlocks || [], "Transform block", stepAliases, results);
  lintBlocksWithInputs(data.lifecycleHooks || [], "Lifecycle hook", stepAliases, results);
  lintBlocksWithInputs(data.documentHooks || [], "Document hook", stepAliases, results);

  return results;
}

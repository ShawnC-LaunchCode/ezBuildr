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

import type {
  WorkflowLintCategory,
  WorkflowLintIssue,
  WorkflowLintTarget,
} from "@shared/types/workflowLint";

export type LintResult = WorkflowLintIssue;

interface ReferenceSets {
  stepAliases: Set<string>;
  stepRefs: Set<string>;
  sectionRefs: Set<string>;
}

/** Serialized workflow content, as produced by `VersionService.serializeWorkflow`. */
export interface LintableWorkflowContent {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  logicRules?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  transformBlocks?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  lifecycleHooks?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function collectReferenceSets(sections: Record<string, any>[]): ReferenceSets {
  const stepAliases = new Set<string>();
  const stepRefs = new Set<string>();
  const sectionRefs = new Set<string>();

  for (const section of sections) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    sectionRefs.add(section.id);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (section.title) { sectionRefs.add(section.title); }

    for (const step of section.steps || []) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      stepRefs.add(step.id);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      if (step.alias) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
        stepAliases.add(step.alias);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
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
  target: WorkflowLintTarget,
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
      results.push({
        type: "warning",
        category: "logic",
        message: `${contextLabel} visibleIf condition references unknown alias: "${id}"`,
        target,
      });
    }
  }
}

function lintSections(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections: Record<string, any>[],
  validAliases: Set<string>,
  results: LintResult[]
): boolean {
  let hasSteps = false;
  for (const section of sections) {
    const rawSteps: unknown = section.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    if (steps.length > 0) {hasSteps = true;}

    const sectionTarget: WorkflowLintTarget = {
      tab: "sections",
      sectionId: String(section.id),
    };
    checkVisibleIf(section.visibleIf, validAliases, `Section "${section.title}"`, sectionTarget, results);

    for (const step of steps) {
      const stepId = String(step.id);
      const stepLabel = String(step.title ?? step.id);
      const stepTarget: WorkflowLintTarget = {
        tab: "sections",
        sectionId: String(section.id),
        stepId,
      };
      if (!step.alias) {
        results.push({
          type: "warning",
          category: "questions",
          message: `Step "${stepLabel}" has no alias.`,
          target: stepTarget,
        });
      }
      if (!step.title) {
        results.push({
          type: "warning",
          category: "questions",
          message: `A step in section "${section.title}" is missing a title.`,
          target: stepTarget,
        });
      }

      checkVisibleIf(step.visibleIf, validAliases, `Step "${stepLabel}"`, stepTarget, results);
    }
  }
  return hasSteps;
}

function lintLogicRules(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  stepRefs: Set<string>,
  sectionRefs: Set<string>,
  results: LintResult[]
): void {
  for (const rule of rules) {
    // Prefer the id field the serializer always emits alongside the alias;
    // the alias field is only a fallback for rules where the id is absent.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (conditionRef && !stepRefs.has(conditionRef)) {
      results.push({
        type: "error",
        category: "logic",
        message: `Logic rule condition references unknown alias: "${conditionRef}"`,
        target: { tab: "sections", panel: "logic" },
      });
    }

    const targetRefs = rule.targetType === "section" ? sectionRefs : stepRefs;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetRef = rule.targetId ?? rule.targetAlias;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (targetRef && !targetRefs.has(targetRef)) {
      results.push({
        type: "error",
        category: "logic",
        message: `Logic rule target references unknown alias: "${targetRef}"`,
        target: { tab: "sections", panel: "logic" },
      });
    }
  }
}

/** How one family of input-consuming blocks reports and links its findings. */
interface BlockLintKind {
  /** Human label used in the message, e.g. "Transform block". */
  typeName: string;
  category: WorkflowLintCategory;
  tab: WorkflowLintTarget["tab"];
}

function lintBlocksWithInputs(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  blocks: Record<string, any>[],
  kind: BlockLintKind,
  validAliases: Set<string>,
  results: LintResult[]
): void {
  for (const b of blocks) {
    if (b.inputKeys) {
      for (const k of b.inputKeys) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
        if (!validAliases.has(k)) {
          results.push({
            type: "error",
            category: kind.category,
            message: `${kind.typeName} "${b.name}" references unknown input alias: "${k}"`,
            target: { tab: kind.tab, blockId: String(b.id) },
          });
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

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  const sections = data.sections || [];
  if (sections.length === 0) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one section.",
      target: { tab: "sections" },
    });
  }

  const { stepAliases, stepRefs, sectionRefs } = collectReferenceSets(sections);
  const hasSteps = lintSections(sections, stepAliases, results);

  if (sections.length > 0 && !hasSteps) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one question.",
      target: { tab: "sections" },
    });
  }

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintLogicRules(data.logicRules || [], stepRefs, sectionRefs, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.transformBlocks || [], { typeName: "Transform block", category: "logic", tab: "sections" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.lifecycleHooks || [], { typeName: "Lifecycle hook", category: "integrations", tab: "sections" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.documentHooks || [], { typeName: "Document hook", category: "documents", tab: "templates" }, stepAliases, results);

  return results;
}

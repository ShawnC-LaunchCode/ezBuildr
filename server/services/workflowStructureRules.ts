/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
/**
 * Structural publish-time validation (RUN2-9).
 *
 * `VersionService.validateWorkflow` used to be a stub returning
 * `{ valid: true }`, so every runner dead-end this initiative fixed could be
 * published without resistance. These rules are the gate: they run on the
 * serialized graph before a version is created, and each one corresponds to a
 * way a workflow could previously reach a respondent in an unrunnable state.
 *
 * Pure functions over already-serialized content, in their own module for the
 * same cycle-avoidance reason as `workflowLintRules.ts` — see that file's
 * header.
 */

import { stepTypeEnum } from "@shared/schema";
import {
  getRunnerStepTypeStatus,
  isRunnerRequirableStepType,
  normalizeRunnerStepType,
} from "@shared/types/runnerStepTypes";

import type { LintResult, LintableWorkflowContent } from "./workflowLintRules";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STEP_TYPES = new Set<string>(stepTypeEnum.enumValues);
const VALID_CHOICE_DISPLAYS = new Set(["radio", "dropdown", "multiple"]);

/** Serialized sections carry `steps` as untyped jsonb-derived data; read it once, typed. */
function stepsOf(section: Record<string, any>): Record<string, any>[] {
  const steps: unknown = section.steps;
  return Array.isArray(steps) ? steps as Record<string, any>[] : [];
}

function stepLabel(step: Record<string, any>): string {
  return String(step.title ?? step.alias ?? step.id ?? "untitled step");
}

function sectionLabel(section: Record<string, any>): string {
  return String(section.title ?? section.id ?? "untitled section");
}

/** Check 1 — a workflow with no sections, or no real questions, cannot be run. */
function checkHasContent(sections: Record<string, any>[], results: LintResult[]): void {
  if (sections.length === 0) {
    results.push({ type: "error", message: "Workflow must have at least one section." });
    return;
  }

  const hasRealStep = sections.some(section =>
    stepsOf(section).some(step => step.isVirtual !== true)
  );
  if (!hasRealStep) {
    results.push({ type: "error", message: "Workflow must have at least one question." });
  }
}

/**
 * Check 2 — ids must be UUIDs, because `RunRuntimeService`'s
 * `VersionStepSchema`/`VersionSectionSchema` parse them with `z.string().uuid()`.
 * A non-UUID id published here fails that parse at run time and takes the whole
 * runner down for the respondent with an opaque error (see RUN2-10).
 */
function checkIdsAreUuids(sections: Record<string, any>[], results: LintResult[]): void {
  for (const section of sections) {
    if (!UUID_PATTERN.test(String(section.id))) {
      results.push({
        type: "error",
        message: `Section "${sectionLabel(section)}" has an id that is not a UUID: "${String(section.id)}"`,
      });
    }
    for (const step of stepsOf(section)) {
      if (!UUID_PATTERN.test(String(step.id))) {
        results.push({
          type: "error",
          message: `Question "${stepLabel(step)}" has an id that is not a UUID: "${String(step.id)}"`,
        });
      }
    }
  }
}

/** Checks 3 and 4 — every type is a real step type, and nothing unrenderable is required. */
function checkStepTypes(sections: Record<string, any>[], results: LintResult[]): void {
  for (const section of sections) {
    for (const step of stepsOf(section)) {
      const type = String(step.type ?? "");

      if (!VALID_STEP_TYPES.has(type)) {
        results.push({
          type: "error",
          message: `Question "${stepLabel(step)}" has an unrecognized type: "${type}"`,
        });
        continue;
      }

      if (step.required === true && !isRunnerRequirableStepType(type)) {
        results.push({
          type: "error",
          message: `Question "${stepLabel(step)}" is required but its type ("${type}") cannot be answered in the runner, so the interview could never be completed.`,
        });
      }
    }
  }
}

interface RuleContext {
  sectionOrderById: Map<string, number>;
  sectionRefs: Set<string>;
  stepRefs: Set<string>;
  sectionOrderByStepRef: Map<string, number>;
}

function buildRuleContext(sections: Record<string, any>[]): RuleContext {
  const sectionOrderById = new Map<string, number>();
  const sectionRefs = new Set<string>();
  const stepRefs = new Set<string>();
  const sectionOrderByStepRef = new Map<string, number>();

  sections.forEach((section, index) => {
    const order = typeof section.order === "number" ? section.order : index;
    sectionOrderById.set(String(section.id), order);
    sectionRefs.add(String(section.id));
    if (section.title) { sectionRefs.add(String(section.title)); }

    for (const step of stepsOf(section)) {
      stepRefs.add(String(step.id));
      sectionOrderByStepRef.set(String(step.id), order);
      if (step.alias) {
        stepRefs.add(String(step.alias));
        sectionOrderByStepRef.set(String(step.alias), order);
      }
    }
  });

  return { sectionOrderById, sectionRefs, stepRefs, sectionOrderByStepRef };
}

/**
 * Checks 5 and 6 — every rule resolves, and no `skip_to` points backwards.
 *
 * A rule that cannot resolve its condition step or target is not inert: at run
 * time it degrades into an always-firing rule (RUN2-11), and a backwards
 * `skip_to` traps the run in a navigation loop (RUN2-2). Both are refused here.
 */
function checkLogicRules(
  rules: Record<string, any>[],
  ctx: RuleContext,
  results: LintResult[]
): void {
  for (const rule of rules) {
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
    const hasCondition = typeof conditionRef === "string" && conditionRef.length > 0;
    if (!hasCondition) {
      results.push({
        type: "error",
        message: `A ${String(rule.action ?? "logic")} rule has no condition question, so it would always fire at run time.`,
      });
    } else if (!ctx.stepRefs.has(conditionRef)) {
      results.push({
        type: "error",
        message: `Logic rule condition references a question that does not exist: "${conditionRef}"`,
      });
    }

    const targetRef = rule.targetId ?? rule.targetAlias;
    const hasTarget = typeof targetRef === "string" && targetRef.length > 0;
    const targetsSection = rule.targetType === "section";
    if (!hasTarget) {
      results.push({
        type: "error",
        message: `A ${String(rule.action ?? "logic")} rule has no target, so it can never take effect.`,
      });
      continue;
    }

    const knownTarget = targetsSection ? ctx.sectionRefs.has(targetRef) : ctx.stepRefs.has(targetRef);
    if (!knownTarget) {
      results.push({
        type: "error",
        message: `Logic rule target references a ${targetsSection ? "section" : "question"} that does not exist: "${targetRef}"`,
      });
      continue;
    }

    if (rule.action === "skip_to" && targetsSection && hasCondition) {
      checkSkipDirection(targetRef, conditionRef, ctx, results);
    }
  }
}

function checkSkipDirection(
  targetRef: string,
  conditionRef: string,
  ctx: RuleContext,
  results: LintResult[]
): void {
  const targetOrder = ctx.sectionOrderById.get(targetRef);
  const conditionSectionOrder = ctx.sectionOrderByStepRef.get(conditionRef);
  if (targetOrder === undefined || conditionSectionOrder === undefined) {
    return;
  }

  if (targetOrder <= conditionSectionOrder) {
    results.push({
      type: "error",
      message: `A "skip to" rule sends the respondent back to a section at or before the question that triggers it, which would loop the interview forever. Point it at a later section.`,
    });
  }
}

/** Check 7 — a choice question with nothing to choose, or an unsupported display, cannot be answered. */
function checkChoiceSteps(sections: Record<string, any>[], results: LintResult[]): void {
  for (const section of sections) {
    for (const step of stepsOf(section)) {
      if (step.isVirtual === true) { continue; }
      if (normalizeRunnerStepType(String(step.type ?? "")) !== "choice") { continue; }

      const config = (step.config ?? {}) as Record<string, any>;
      const options = config.options;

      const isDynamic = options !== null && typeof options === "object" && !Array.isArray(options) && "type" in options;
      const hasStaticOptions = Array.isArray(options) && options.length > 0;
      const hasDynamicSource = isDynamic && (
        options.type !== "static" || (Array.isArray(options.options) && options.options.length > 0)
      );

      if (!hasStaticOptions && !hasDynamicSource) {
        results.push({
          type: "error",
          message: `Choice question "${stepLabel(step)}" has no options and no dynamic option source, so it cannot be answered.`,
        });
      }

      const display = config.display;
      if (display !== undefined && display !== null && !VALID_CHOICE_DISPLAYS.has(String(display))) {
        results.push({
          type: "error",
          message: `Choice question "${stepLabel(step)}" has an unsupported display mode: "${String(display)}". Use radio, dropdown, or multiple.`,
        });
      }
    }
  }
}

/** Warnings — worth telling the author about, never worth blocking a publish. */
function collectStructureWarnings(sections: Record<string, any>[], results: LintResult[]): void {
  for (const section of sections) {
    for (const step of stepsOf(section)) {
      if (step.isVirtual === true) { continue; }

      if (step.required === true && step.visibleIf !== null && step.visibleIf !== undefined && step.visibleIf !== "") {
        results.push({
          type: "warning",
          message: `Question "${stepLabel(step)}" is required but has a visibility condition — it is only required while visible.`,
        });
      }

      const status = getRunnerStepTypeStatus(String(step.type ?? ""));
      if (status === "unsupported" && step.required !== true) {
        results.push({
          type: "warning",
          message: `Question "${stepLabel(step)}" has a type ("${String(step.type)}") the runner cannot display; it will be skipped for every respondent.`,
        });
      }
    }
  }
}

/**
 * Run every structural check over a serialized workflow. Returns errors
 * (publish-blocking) and warnings (informational), in the same `LintResult`
 * shape the reference linter uses so callers can treat them uniformly.
 */
export function validateWorkflowStructure(data: LintableWorkflowContent): LintResult[] {
  const results: LintResult[] = [];
  const sections = data.sections ?? [];

  checkHasContent(sections, results);
  checkIdsAreUuids(sections, results);
  checkStepTypes(sections, results);
  checkLogicRules(data.logicRules ?? [], buildRuleContext(sections), results);
  checkChoiceSteps(sections, results);
  collectStructureWarnings(sections, results);

  return results;
}

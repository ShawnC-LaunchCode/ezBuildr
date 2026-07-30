/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
/**
 * Structural publish-time validation (RUN2-9).
 *
 * `VersionService.validateWorkflow` used to be a stub returning
 * `{ valid: true }`, so every runner dead-end this initiative fixed could be
 * published without resistance. These rules are the gate: they run on the
 * serialized graph before a version is created, and each one corresponds to a
 * way a workflow could previously reach a respondent in an unrunnable state.
 *
 * Document and provider readiness (GH-152) was added later, and drew the line
 * this module now follows throughout: **block only what can never work for any
 * respondent.** A final document pointing at a template that does not exist
 * aborts generation every single time, so it is an error; an unresolved field
 * mapping renders a blank and a missing e-sign provider depends on server env
 * rather than on the workflow, so both are warnings.
 *
 * Pure functions over already-serialized content, in their own module for the
 * same cycle-avoidance reason as `workflowLintRules.ts` — see that file's
 * header. Facts requiring I/O arrive via `WorkflowReadinessContext`.
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
const VALID_CHOICE_DISPLAYS = new Set(["radio", "dropdown", "combobox", "multiple"]);

/** Step types whose `config` is a `FinalBlockConfig` (see `RunLifecycleService`). */
const FINAL_BLOCK_STEP_TYPES = new Set(["final", "final_documents"]);
/** The id the retired `builder/cards/FinalBlockEditor` wrote into saved configs. */
const PLACEHOLDER_DOCUMENT_ID = "placeholder";

/**
 * Publish-time facts that cannot be derived from the serialized graph alone.
 *
 * `VersionService.publishVersion` resolves these (one query for the project's
 * templates, one in-memory registry read) and passes them in, so this module
 * stays pure and unit-testable — the same no-I/O constraint described in the
 * header. Every field is optional: when a fact is absent, the checks that need
 * it are **skipped rather than guessed at**, so callers without DB access keep
 * working unchanged.
 */
export interface WorkflowReadinessContext {
  /** Ids of templates that exist in the workflow's project. */
  knownTemplateIds?: ReadonlySet<string>;
  /** Lower-cased names of e-signature providers registered on this server. */
  availableEsignProviders?: ReadonlySet<string>;
}

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

/** Checks 3 and 4 — every type is real and every respondent-facing step is renderable. */
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

      const runnerStatus = getRunnerStepTypeStatus(type);
      if (runnerStatus === "unsupported") {
        results.push({
          type: "error",
          message: `Question "${stepLabel(step)}" has a type ("${type}") the runner cannot display. Remove it or use a supported question type before publishing.`,
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
  /**
   * Alias-only set (no ids), matching the universe `lintWorkflowContent` checks
   * `inputKeys` against. Transform-block outputs are included because they are
   * serialized as virtual steps carrying their own alias.
   */
  stepAliases: Set<string>;
}

function buildRuleContext(sections: Record<string, any>[]): RuleContext {
  const sectionOrderById = new Map<string, number>();
  const sectionRefs = new Set<string>();
  const stepRefs = new Set<string>();
  const sectionOrderByStepRef = new Map<string, number>();
  const stepAliases = new Set<string>();

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
        stepAliases.add(String(step.alias));
        sectionOrderByStepRef.set(String(step.alias), order);
      }
    }
  });

  return { sectionOrderById, sectionRefs, stepRefs, sectionOrderByStepRef, stepAliases };
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

/** Documents carried by a final-block or signature-block step `config`. */
function documentEntriesOf(step: Record<string, any>): Record<string, any>[] {
  const config = (step.config ?? {}) as Record<string, any>;
  const docs: unknown = config.documents;
  return Array.isArray(docs) ? docs as Record<string, any>[] : [];
}

/**
 * Check 8 — one document entry resolves to a real template, and its field
 * mapping points somewhere.
 *
 * A missing template is a *guaranteed* run-time failure, not a degraded one:
 * `RunLifecycleService` resolves every `documentId` through
 * `documentTemplateRepository.findByIdAndProjectId(documentId, projectId)` and
 * `createTemplateResolver` throws `notFound` when it misses, which aborts
 * generation for every respondent. So those are errors.
 *
 * Mapping problems are warnings by design. `EnhancedDocumentEngine` normalizes
 * run data by flattening nested values, so a dotted source like `address.city`
 * is legitimate and is not a step alias — and an unresolved source yields a
 * document with a blank, recorded in `unresolvedVariables`, rather than a
 * failure. Blocking here would refuse workflows that generate fine.
 */
function checkDocumentEntry(
  entry: Record<string, any>,
  ownerLabel: string,
  ctx: RuleContext,
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  const rawId: unknown = entry.documentId;
  const documentId = typeof rawId === "string" ? rawId.trim() : "";
  const entryLabel = String(entry.alias ?? entry.id ?? "untitled document");

  if (documentId.length === 0) {
    results.push({
      type: "error",
      message: `${ownerLabel} document "${entryLabel}" has no template selected, so document generation would fail for every respondent.`,
    });
  } else if (documentId === PLACEHOLDER_DOCUMENT_ID) {
    results.push({
      type: "error",
      message: `${ownerLabel} document "${entryLabel}" still has a placeholder template id. Select a real template before publishing.`,
    });
  } else if (context.knownTemplateIds !== undefined && !context.knownTemplateIds.has(documentId)) {
    results.push({
      type: "error",
      message: `${ownerLabel} document "${entryLabel}" references a template that does not exist in this project: "${documentId}"`,
    });
  }

  const mapping: unknown = entry.mapping;
  if (mapping === null || typeof mapping !== "object" || Array.isArray(mapping)) { return; }

  for (const [field, binding] of Object.entries(mapping as Record<string, any>)) {
    const source: unknown = binding?.source;
    if (typeof source !== "string" || source.trim().length === 0) {
      results.push({
        type: "warning",
        message: `${ownerLabel} document "${entryLabel}" maps field "${field}" to an empty source, so that field will render blank.`,
      });
      continue;
    }
    // Dotted sources address flattened nested values and are resolved at
    // generation time, not against step aliases.
    if (source.includes(".")) { continue; }
    if (!ctx.stepAliases.has(source)) {
      results.push({
        type: "warning",
        message: `${ownerLabel} document "${entryLabel}" maps field "${field}" to "${source}", which is not a known question alias — that field will render blank.`,
      });
    }
  }
}

/** Check 9 — final-block steps (`final` / `final_documents`) carry usable documents. */
function checkFinalBlockSteps(
  sections: Record<string, any>[],
  ctx: RuleContext,
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const section of sections) {
    for (const step of stepsOf(section)) {
      if (!FINAL_BLOCK_STEP_TYPES.has(String(step.type ?? ""))) { continue; }

      const label = `Final block "${stepLabel(step)}"`;
      const entries = documentEntriesOf(step);

      if (entries.length === 0) {
        // `RunLifecycleService` only collects configs with documents, so an empty
        // final block generates nothing rather than failing — worth saying, not
        // worth blocking.
        results.push({
          type: "warning",
          message: `${label} has no documents configured, so no documents will be generated for it.`,
        });
        continue;
      }

      for (const entry of entries) {
        checkDocumentEntry(entry, label, ctx, context, results);
      }
    }
  }
}

/**
 * Check 10 — legacy Final Documents sections (`section.config.finalBlock`).
 *
 * This is the shape the live `FinalDocumentsSectionEditor` writes: a
 * `templates: string[]` of template ids, read back by
 * `RunLifecycleService.buildLegacyFinalBlockConfig`. It is still the primary
 * authoring path, so it gets the same template-existence guarantee.
 */
function checkLegacyFinalSections(
  sections: Record<string, any>[],
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const section of sections) {
    const config = (section.config ?? {}) as Record<string, any>;
    if (config.finalBlock !== true) { continue; }

    const templates: unknown = config.templates;
    const ids = Array.isArray(templates) ? templates : [];

    if (ids.length === 0) {
      results.push({
        type: "warning",
        message: `Final documents section "${sectionLabel(section)}" has no templates selected, so no documents will be generated.`,
      });
      continue;
    }

    for (const rawId of ids) {
      const templateId = typeof rawId === "string" ? rawId.trim() : "";
      if (templateId.length === 0) {
        results.push({
          type: "error",
          message: `Final documents section "${sectionLabel(section)}" has an empty template reference.`,
        });
      } else if (context.knownTemplateIds !== undefined && !context.knownTemplateIds.has(templateId)) {
        results.push({
          type: "error",
          message: `Final documents section "${sectionLabel(section)}" references a template that does not exist in this project: "${templateId}"`,
        });
      }
    }
  }
}

/**
 * Check 11 — signature blocks have something to sign and a provider that exists.
 *
 * Provider availability is a **warning, not an error**, deliberately: which
 * providers are registered depends on server env at boot
 * (`createDocusignProvider()` returns null when unconfigured), and publish-ness
 * must be a property of the workflow, not of the machine that happened to
 * publish it. Blocking here would make the same workflow publishable or not
 * depending on deploy config, and would refuse every signature workflow on a
 * server where the registry is empty.
 */
function checkSignatureBlocks(
  sections: Record<string, any>[],
  ctx: RuleContext,
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const section of sections) {
    for (const step of stepsOf(section)) {
      if (String(step.type ?? "") !== "signature_block") { continue; }

      const label = `Signature block "${stepLabel(step)}"`;
      const entries = documentEntriesOf(step);

      if (entries.length === 0) {
        results.push({
          type: "error",
          message: `${label} has no documents to sign, so the respondent would reach a signing step with nothing to sign.`,
        });
      }

      for (const entry of entries) {
        checkDocumentEntry(entry, label, ctx, context, results);
      }

      const provider: unknown = ((step.config ?? {}) as Record<string, any>).provider;
      if (
        context.availableEsignProviders !== undefined &&
        typeof provider === "string" &&
        provider.trim().length > 0 &&
        !context.availableEsignProviders.has(provider.trim().toLowerCase())
      ) {
        results.push({
          type: "warning",
          message: `${label} uses e-signature provider "${provider}", which is not configured on this server — signing will fail until it is enabled.`,
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

    }
  }
}

/**
 * Run every structural check over a serialized workflow. Returns errors
 * (publish-blocking) and warnings (informational), in the same `LintResult`
 * shape the reference linter uses so callers can treat them uniformly.
 *
 * `context` carries the facts this pure module cannot look up itself (which
 * templates exist, which e-sign providers are registered). Omit it and the
 * checks needing those facts are skipped, so the structural rules still run for
 * callers without DB access.
 */
export function validateWorkflowStructure(
  data: LintableWorkflowContent,
  context: WorkflowReadinessContext = {}
): LintResult[] {
  const results: LintResult[] = [];
  const sections = data.sections ?? [];
  const ruleContext = buildRuleContext(sections);

  checkHasContent(sections, results);
  checkIdsAreUuids(sections, results);
  checkStepTypes(sections, results);
  checkLogicRules(data.logicRules ?? [], ruleContext, results);
  checkChoiceSteps(sections, results);
  checkFinalBlockSteps(sections, ruleContext, context, results);
  checkLegacyFinalSections(sections, context, results);
  checkSignatureBlocks(sections, ruleContext, context, results);
  collectStructureWarnings(sections, results);

  return results;
}

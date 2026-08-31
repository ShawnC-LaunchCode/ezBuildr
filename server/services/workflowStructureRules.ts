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

import { normalizeFinalDocumentsTemplateEntry } from "@shared/finalDocumentsTemplates";
import { stepTypeEnum } from "@shared/schema";
import { extractFormulaReferences } from "@shared/types/documentMapping";
import {
  getRunnerStepTypeStatus,
  isRunnerRequirableStepType,
} from "@shared/types/runnerStepTypes";
import { adaptLegacyStep } from "@shared/types/stepConfigs";
import type { WorkflowLintCategory, WorkflowLintTarget } from "@shared/types/workflowLint";

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

/** Serialized pages carry `steps` as untyped jsonb-derived data; read it once, typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function stepsOf(page: Record<string, any>): Record<string, any>[] {
  const steps: unknown = page.steps;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  return Array.isArray(steps) ? steps as Record<string, any>[] : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function stepLabel(step: Record<string, any>): string {
  return String(step.title ?? step.alias ?? step.id ?? "untitled step");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function pageLabel(page: Record<string, any>): string {
  return String(page.title ?? page.id ?? "untitled page");
}

function issue(
  type: LintResult["type"],
  category: WorkflowLintCategory,
  message: string,
  target: WorkflowLintTarget
): LintResult {
  return { type, category, message, target };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function pageTarget(page: Record<string, any>): WorkflowLintTarget {
  return { tab: "pages", pageId: String(page.id) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function stepTarget(page: Record<string, any>, step: Record<string, any>): WorkflowLintTarget {
  return { tab: "pages", pageId: String(page.id), stepId: String(step.id) };
}

/** Check 1 — a workflow with no pages, or no real questions, cannot be run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function checkHasContent(pages: Record<string, any>[], results: LintResult[]): void {
  if (pages.length === 0) {
    results.push(issue("error", "questions", "Workflow must have at least one page.", { tab: "pages" }));
    return;
  }

  const hasRealStep = pages.some(page =>
    stepsOf(page).some(step => step.isVirtual !== true)
  );
  if (!hasRealStep) {
    results.push(issue("error", "questions", "Workflow must have at least one question.", { tab: "pages" }));
  }
}

/**
 * Check 2 — ids must be UUIDs, because `RunRuntimeService`'s
 * `VersionStepSchema`/`VersionPageSchema` parse them with `z.string().uuid()`.
 * A non-UUID id published here fails that parse at run time and takes the whole
 * runner down for the respondent with an opaque error (see RUN2-10).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function checkIdsAreUuids(pages: Record<string, any>[], results: LintResult[]): void {
  for (const page of pages) {
    if (!UUID_PATTERN.test(String(page.id))) {
      results.push(issue(
        "error",
        "questions",
        `Page "${pageLabel(page)}" has an id that is not a UUID: "${String(page.id)}"`,
        pageTarget(page)
      ));
    }
    for (const step of stepsOf(page)) {
      if (!UUID_PATTERN.test(String(step.id))) {
        results.push(issue(
          "error",
          "questions",
          `Question "${stepLabel(step)}" has an id that is not a UUID: "${String(step.id)}"`,
          stepTarget(page, step)
        ));
      }
    }
  }
}

/** Checks 3 and 4 — every type is real and every respondent-facing step is renderable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function checkStepTypes(pages: Record<string, any>[], results: LintResult[]): void {
  for (const page of pages) {
    for (const step of stepsOf(page)) {
      const type = String(step.type ?? "");

      if (!VALID_STEP_TYPES.has(type)) {
        results.push(issue(
          "error",
          "questions",
          `Question "${stepLabel(step)}" has an unrecognized type: "${type}"`,
          stepTarget(page, step)
        ));
        continue;
      }

      const runnerStatus = getRunnerStepTypeStatus(type);
      if (runnerStatus === "unsupported") {
        results.push(issue(
          "error",
          "questions",
          `Question "${stepLabel(step)}" has a type ("${type}") the runner cannot display. Remove it or use a supported question type before publishing.`,
          stepTarget(page, step)
        ));
        continue;
      }

      if (step.required === true && !isRunnerRequirableStepType(type)) {
        results.push(issue(
          "error",
          "questions",
          `Question "${stepLabel(step)}" is required but its type ("${type}") cannot be answered in the runner, so the interview could never be completed.`,
          stepTarget(page, step)
        ));
      }
    }
  }
}

interface RuleContext {
  pageOrderById: Map<string, number>;
  pageRefs: Set<string>;
  stepRefs: Set<string>;
  pageOrderByStepRef: Map<string, number>;
  /**
   * Alias-only set (no ids), matching the universe `lintWorkflowContent` checks
   * `inputKeys` against. Transform-block outputs are included because they are
   * serialized as virtual steps carrying their own alias.
   */
  stepAliases: Set<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function buildRuleContext(pages: Record<string, any>[]): RuleContext {
  const pageOrderById = new Map<string, number>();
  const pageRefs = new Set<string>();
  const stepRefs = new Set<string>();
  const pageOrderByStepRef = new Map<string, number>();
  const stepAliases = new Set<string>();

  pages.forEach((page, index) => {
    const order = typeof page.order === "number" ? page.order : index;
    pageOrderById.set(String(page.id), order);
    pageRefs.add(String(page.id));
    if (page.title) { pageRefs.add(String(page.title)); }

    for (const step of stepsOf(page)) {
      stepRefs.add(String(step.id));
      pageOrderByStepRef.set(String(step.id), order);
      if (step.alias) {
        stepRefs.add(String(step.alias));
        stepAliases.add(String(step.alias));
        pageOrderByStepRef.set(String(step.alias), order);
      }
    }
  });

  return { pageOrderById, pageRefs, stepRefs, pageOrderByStepRef, stepAliases };
}

/**
 * Checks 5 and 6 — every rule resolves, and no `skip_to` points backwards.
 *
 * A rule that cannot resolve its condition step or target is not inert: at run
 * time it degrades into an always-firing rule (RUN2-11), and a backwards
 * `skip_to` traps the run in a navigation loop (RUN2-2). Both are refused here.
 */
function checkLogicRules(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  ctx: RuleContext,
  results: LintResult[]
): void {
  for (const rule of rules) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
    const hasCondition = typeof conditionRef === "string" && conditionRef.length > 0;
    if (!hasCondition) {
      results.push(issue(
        "error",
        "logic",
        `A ${String(rule.action ?? "logic")} rule has no condition question, so it would always fire at run time.`,
        { tab: "pages", panel: "logic" }
      ));
    } else if (!ctx.stepRefs.has(conditionRef)) {
      results.push(issue(
        "error",
        "logic",
        `Logic rule condition references a question that does not exist: "${conditionRef}"`,
        { tab: "pages", panel: "logic" }
      ));
    }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetRef = rule.targetId ?? rule.targetAlias;
    const hasTarget = typeof targetRef === "string" && targetRef.length > 0;
    const targetsPage = rule.targetType === "page";
    if (!hasTarget) {
      results.push(issue(
        "error",
        "logic",
        `A ${String(rule.action ?? "logic")} rule has no target, so it can never take effect.`,
        { tab: "pages", panel: "logic" }
      ));
      continue;
    }

    const knownTarget = targetsPage ? ctx.pageRefs.has(targetRef) : ctx.stepRefs.has(targetRef);
    if (!knownTarget) {
      results.push(issue(
        "error",
        "logic",
        `Logic rule target references a ${targetsPage ? "page" : "question"} that does not exist: "${targetRef}"`,
        { tab: "pages", panel: "logic" }
      ));
      continue;
    }

    if (rule.action === "skip_to" && targetsPage && hasCondition) {
      checkSkipDirection(targetRef, conditionRef, ctx, results);
    }
  }
}

/**
 * Whether a `skip_to` rule's target page can never fire, because it sits
 * at or before the page holding the rule's condition question. Exported
 * so `PageService.reorderPages` (MAP-B4) can detect the same condition
 * right after a drag-and-drop reorder, using the DB's live page orders
 * instead of this module's serialized-content shape — without re-deriving
 * the comparison or duplicating `checkSkipDirection`'s publish-blocking
 * finding.
 */
export function isBackwardSkipTarget(targetOrder: number, conditionPageOrder: number): boolean {
  return targetOrder <= conditionPageOrder;
}

function checkSkipDirection(
  targetRef: string,
  conditionRef: string,
  ctx: RuleContext,
  results: LintResult[]
): void {
  const targetOrder = ctx.pageOrderById.get(targetRef);
  const conditionPageOrder = ctx.pageOrderByStepRef.get(conditionRef);
  if (targetOrder === undefined || conditionPageOrder === undefined) {
    return;
  }

  if (isBackwardSkipTarget(targetOrder, conditionPageOrder)) {
    results.push(issue(
      "error",
      "logic",
      `A "skip to" rule targets a page at or before the question that triggers it, so it can never fire. This usually happens after pages get reordered. Point it at a later page.`,
      { tab: "pages", panel: "logic" }
    ));
  }
}

/** Check 7 — a choice question with nothing to choose, or an unsupported display, cannot be answered. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function checkChoiceSteps(pages: Record<string, any>[], results: LintResult[]): void {
  for (const page of pages) {
    for (const step of stepsOf(page)) {
      if (step.isVirtual === true) { continue; }
      if (adaptLegacyStep({ type: String(step.type ?? "") }).type !== "choice") { continue; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
      const config = (step.config ?? {}) as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
      const options = config.options;

      const isDynamic = options !== null && typeof options === "object" && !Array.isArray(options) && "type" in options;
      const hasStaticOptions = Array.isArray(options) && options.length > 0;
      const hasDynamicSource = isDynamic && (
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
        options.type !== "static" || (Array.isArray(options.options) && options.options.length > 0)
      );

      if (!hasStaticOptions && !hasDynamicSource) {
        results.push(issue(
          "error",
          "questions",
          `Choice question "${stepLabel(step)}" has no options and no dynamic option source, so it cannot be answered.`,
          stepTarget(page, step)
        ));
      }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
      const display = config.display;
      if (display !== undefined && display !== null && !VALID_CHOICE_DISPLAYS.has(String(display))) {
        results.push(issue(
          "error",
          "questions",
          `Choice question "${stepLabel(step)}" has an unsupported display mode: "${String(display)}". Use radio, dropdown, or multiple.`,
          stepTarget(page, step)
        ));
      }
    }
  }
}

/** Documents carried by a final-block or signature-block step `config`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function documentEntriesOf(step: Record<string, any>): Record<string, any>[] {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  const config = (step.config ?? {}) as Record<string, any>;
  const docs: unknown = config.documents;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
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
interface DocumentEntryCheckContext {
  ruleContext: RuleContext;
  readiness: WorkflowReadinessContext;
  target: WorkflowLintTarget;
}

function checkDocumentEntry(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  entry: Record<string, any>,
  ownerLabel: string,
  checkContext: DocumentEntryCheckContext,
  results: LintResult[]
): void {
  const rawId: unknown = entry.documentId;
  const documentId = typeof rawId === "string" ? rawId.trim() : "";
  const entryLabel = String(entry.alias ?? entry.id ?? "untitled document");

  if (documentId.length === 0) {
    results.push(issue(
      "error",
      "documents",
      `${ownerLabel} document "${entryLabel}" has no template selected, so document generation would fail for every respondent.`,
      checkContext.target
    ));
  } else if (documentId === PLACEHOLDER_DOCUMENT_ID) {
    results.push(issue(
      "error",
      "documents",
      `${ownerLabel} document "${entryLabel}" still has a placeholder template id. Select a real template before publishing.`,
      checkContext.target
    ));
  } else if (
    checkContext.readiness.knownTemplateIds !== undefined &&
    !checkContext.readiness.knownTemplateIds.has(documentId)
  ) {
    results.push(issue(
      "error",
      "documents",
      `${ownerLabel} document "${entryLabel}" references a template that does not exist in this project: "${documentId}"`,
      checkContext.target
    ));
  }

  const mapping: unknown = entry.mapping;
  if (mapping === null || typeof mapping !== "object" || Array.isArray(mapping)) { return; }

  const bindingContext: MappingBindingCheckContext = { ...checkContext, ownerLabel, entryLabel };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  for (const [field, binding] of Object.entries(mapping as Record<string, any>)) {
    checkMappingBinding(field, binding, bindingContext, results);
  }
}

interface MappingBindingCheckContext extends DocumentEntryCheckContext {
  ownerLabel: string;
  entryLabel: string;
}

/**
 * One field's binding, dispatched by `MappingBinding['type']` (GH-156). Each
 * binding kind has its own way of "resolving to nothing" at generation time:
 * a `variable` with no matching step alias, a `formula` referencing an
 * unknown alias, or an incomplete `datavault` reference. All are warnings,
 * not errors, for the same reason the original `variable`-only check was —
 * `EnhancedDocumentEngine` renders a blank rather than failing generation.
 */
function checkMappingBinding(
  field: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  binding: any,
  checkContext: MappingBindingCheckContext,
  results: LintResult[]
): void {
  const { ownerLabel, entryLabel } = checkContext;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
  const type: unknown = binding?.type;

  if (type === "constant") {
    return; // A constant always resolves — nothing to warn about.
  }

  if (type === "formula") {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
    const expression: unknown = binding.expression;
    if (typeof expression !== "string" || expression.trim().length === 0) {
      results.push(issue(
        "warning",
        "documents",
        `${ownerLabel} document "${entryLabel}" maps field "${field}" to an empty formula, so that field will render blank.`,
        checkContext.target
      ));
      return;
    }
    const unknownRefs = extractFormulaReferences(expression)
      .filter(ref => !ref.includes(".") && !checkContext.ruleContext.stepAliases.has(ref));
    if (unknownRefs.length > 0) {
      results.push(issue(
        "warning",
        "documents",
        `${ownerLabel} document "${entryLabel}" formula for field "${field}" references unknown variable(s): ${unknownRefs.join(", ")} — that part will render blank.`,
        checkContext.target
      ));
    }
    return;
  }

  if (type === "datavault") {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
    const hasAllFields = typeof binding.tableId === "string" && binding.tableId.length > 0
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      && typeof binding.columnId === "string" && binding.columnId.length > 0
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      && typeof binding.rowId === "string" && binding.rowId.length > 0;
    if (!hasAllFields) {
      results.push(issue(
        "warning",
        "documents",
        `${ownerLabel} document "${entryLabel}" maps field "${field}" to an incomplete DataVault reference, so that field will render blank.`,
        checkContext.target
      ));
    }
    return;
  }

  // `variable` (including the pre-GH-156 shape, which never carried a
  // `type` other than "variable") and any unrecognized/legacy binding both
  // fall through to the original source-based check.
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
  const source: unknown = binding?.source;
  if (typeof source !== "string" || source.trim().length === 0) {
    results.push(issue(
      "warning",
      "documents",
      `${ownerLabel} document "${entryLabel}" maps field "${field}" to an empty source, so that field will render blank.`,
      checkContext.target
    ));
    return;
  }
  // Dotted sources address flattened nested values and are resolved at
  // generation time, not against step aliases.
  if (source.includes(".")) { return; }
  if (!checkContext.ruleContext.stepAliases.has(source)) {
    results.push(issue(
      "warning",
      "documents",
      `${ownerLabel} document "${entryLabel}" maps field "${field}" to "${source}", which is not a known question alias — that field will render blank.`,
      checkContext.target
    ));
  }
}

/** Check 9 — final-block steps (`final` / `final_documents`) carry usable documents. */
function checkFinalBlockSteps(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
  ctx: RuleContext,
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const page of pages) {
    for (const step of stepsOf(page)) {
      if (!FINAL_BLOCK_STEP_TYPES.has(String(step.type ?? ""))) { continue; }

      const label = `Final block "${stepLabel(step)}"`;
      const entries = documentEntriesOf(step);

      if (entries.length === 0) {
        // `RunLifecycleService` only collects configs with documents, so an empty
        // final block generates nothing rather than failing — worth saying, not
        // worth blocking.
        results.push(issue(
          "warning",
          "documents",
          `${label} has no documents configured, so no documents will be generated for it.`,
          stepTarget(page, step)
        ));
        continue;
      }

      for (const entry of entries) {
        checkDocumentEntry(entry, label, {
          ruleContext: ctx,
          readiness: context,
          target: stepTarget(page, step),
        }, results);
      }
    }
  }
}

/**
 * Check 10 — legacy Final Documents pages (`page.config.finalBlock`).
 *
 * This is the shape the live `FinalDocumentsPageEditor` writes: a
 * `templates` array read back by
 * `RunLifecycleService.buildLegacyFinalBlockConfig`. Each entry is either the
 * legacy bare template-id string or LU-5's widened
 * `{ templateId, conditions? }` object — `normalizeFinalDocumentsTemplateEntry`
 * (shared) is the one place that understands both, so this check stays in
 * sync with the reader by construction rather than duplicating the parsing.
 * It is still the primary authoring path, so it gets the same
 * template-existence guarantee.
 */
function checkLegacyFinalPages(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const page of pages) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
    const config = (page.config ?? {}) as Record<string, any>;
    if (config.finalBlock !== true) { continue; }

    const templates: unknown = config.templates;
    const rawEntries = Array.isArray(templates) ? templates : [];

    if (rawEntries.length === 0) {
      results.push(issue(
        "warning",
        "documents",
        `Final documents page "${pageLabel(page)}" has no templates selected, so no documents will be generated.`,
        pageTarget(page)
      ));
      continue;
    }

    for (const rawEntry of rawEntries) {
      const normalized = normalizeFinalDocumentsTemplateEntry(rawEntry);
      const templateId = normalized?.templateId.trim() ?? "";
      if (templateId.length === 0) {
        results.push(issue(
          "error",
          "documents",
          `Final documents page "${pageLabel(page)}" has an empty template reference.`,
          pageTarget(page)
        ));
      } else if (context.knownTemplateIds !== undefined && !context.knownTemplateIds.has(templateId)) {
        results.push(issue(
          "error",
          "documents",
          `Final documents page "${pageLabel(page)}" references a template that does not exist in this project: "${templateId}"`,
          pageTarget(page)
        ));
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
  ctx: RuleContext,
  context: WorkflowReadinessContext,
  results: LintResult[]
): void {
  for (const page of pages) {
    for (const step of stepsOf(page)) {
      if (String(step.type ?? "") !== "signature_block") { continue; }

      const label = `Signature block "${stepLabel(step)}"`;
      const entries = documentEntriesOf(step);

      if (entries.length === 0) {
        results.push(issue(
          "error",
          "documents",
          `${label} has no documents to sign, so the respondent would reach a signing step with nothing to sign.`,
          stepTarget(page, step)
        ));
      }

      for (const entry of entries) {
        checkDocumentEntry(entry, label, {
          ruleContext: ctx,
          readiness: context,
          target: stepTarget(page, step),
        }, results);
      }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
      const provider: unknown = ((step.config ?? {}) as Record<string, any>).provider;
      if (
        context.availableEsignProviders !== undefined &&
        typeof provider === "string" &&
        provider.trim().length > 0 &&
        !context.availableEsignProviders.has(provider.trim().toLowerCase())
      ) {
        results.push(issue(
          "warning",
          "integrations",
          `${label} uses e-signature provider "${provider}", which is not configured on this server — signing will fail until it is enabled.`,
          stepTarget(page, step)
        ));
      }
    }
  }
}

/** Warnings — worth telling the author about, never worth blocking a publish. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function collectStructureWarnings(pages: Record<string, any>[], results: LintResult[]): void {
  for (const page of pages) {
    for (const step of stepsOf(page)) {
      if (step.isVirtual === true) { continue; }

      if (step.required === true && step.visibleIf !== null && step.visibleIf !== undefined && step.visibleIf !== "") {
        results.push(issue(
          "warning",
          "logic",
          `Question "${stepLabel(step)}" is required but has a visibility condition — it is only required while visible.`,
          stepTarget(page, step)
        ));
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
  const pages = data.pages ?? [];
  const ruleContext = buildRuleContext(pages);

  checkHasContent(pages, results);
  checkIdsAreUuids(pages, results);
  checkStepTypes(pages, results);
  checkLogicRules(data.logicRules ?? [], ruleContext, results);
  checkChoiceSteps(pages, results);
  checkFinalBlockSteps(pages, ruleContext, context, results);
  checkLegacyFinalPages(pages, context, results);
  checkSignatureBlocks(pages, ruleContext, context, results);
  collectStructureWarnings(pages, results);

  return results;
}

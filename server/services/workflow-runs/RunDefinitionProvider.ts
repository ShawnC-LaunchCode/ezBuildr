import { z } from "zod";

import type { LogicRule, Page, Section, Step, WorkflowRun } from "@shared/schema";

import { logger } from "../../logger";
import {
  logicRuleRepository,
  pageRepository,
  sectionRepository,
  stepRepository,
  workflowVersionRepository,
} from "../../repositories";
import { createError } from "../../utils/errors";
import { withCurrentTenant } from "../../utils/rlsContext";

// This validates a version's serialized graphJson, whose fields come straight
// from nullable DB columns. `.optional()` accepts `undefined` but REJECTS
// `null` — and normal steps serialize alias/config/description as
// `null`, which 500'd `GET /api/runs/:id/runtime` (and thus the whole runner)
// for every newly-activated workflow. Use `.nullish()` (null | undefined) for
// every field backed by a nullable column; the mapping below already
// `??`-coalesces each one, so accepting null is safe.
const VersionStepSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  required: z.boolean().nullish(),
  config: z.record(z.unknown()).nullish(),
  order: z.number().nullish(),
  alias: z.string().nullish(),
  visibleIf: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  isVirtual: z.boolean().nullish(),
}).passthrough();

const VersionPageSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid().nullish().default(null),
  title: z.string(),
  description: z.string().nullish(),
  order: z.number().nullish(),
  visibleIf: z.unknown().optional(),
  config: z.unknown().optional(),
  steps: z.array(VersionStepSchema).nullish(),
}).passthrough();

const VersionSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullish(),
  visibleIf: z.unknown().optional(),
}).passthrough();

// LU-6c: a rule's trigger condition is `when` (a ConditionExpression),
// evaluated the same way `visibleIf` is - it is the only condition language
// a pinned rule carries (measured 2026-08-07: all 57 `workflow_versions` rows
// have an empty `logicRules` array, so no pinned snapshot anywhere is frozen
// in the legacy flat operator/conditionValue shape; nothing produces that
// shape going forward either). `conditionStepAlias`/`targetAlias` are not a
// second condition language - they are alias-keyed FK bookkeeping
// `VersionService.serializeWorkflow` derives from the real, already-resolved
// `conditionStepId`/`targetId`.
const VersionLogicRuleSchema = z.object({
  id: z.string().nullish(),
  conditionStepId: z.string().nullish(),
  conditionStepAlias: z.string().nullish(),
  when: z.unknown().nullish(),
  targetType: z.enum(["page", "step"]),
  targetId: z.string().nullish(),
  targetAlias: z.string().nullish(),
  action: z.string(),
  order: z.number().nullish(),
}).passthrough();

const VersionRuntimeSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string().nullable().optional(),
  intakeConfig: z.unknown().optional(),
  settings: z.unknown().optional(),
  sections: z.array(VersionSectionSchema).default([]),
  pages: z.array(VersionPageSchema),
  logicRules: z.array(VersionLogicRuleSchema).nullish(),
}).passthrough();

/** Workflow-level metadata carried by a pinned version's graphJson. Only
 * populated when the definition was sourced from a version (`source ===
 * 'version'`) — a live-table definition has no equivalent snapshot to read
 * these from. */
export interface RunDefinitionGraph {
  title: string;
  description: string | null;
  projectId: string | null;
  intakeConfig?: unknown;
  settings?: unknown;
}

export interface RunPage {
  id: string;
  workflowId: string;
  sectionId: string | null;
  title: string;
  description: string | null;
  order: number;
  visibleIf?: unknown;
  config?: unknown;
  createdAt: Date;
}

export interface RunSection {
  id: string;
  workflowId: string;
  title: string;
  description: string | null;
  visibleIf?: unknown;
  createdAt: Date;
}

export interface RunStep {
  id: string;
  workflowId: string;
  pageId: string;
  type: Step["type"];
  title: string;
  description: string | null;
  required: boolean;
  alias: string | null;
  visibleIf?: unknown;
  order: number;
  isVirtual: boolean;
  defaultValue?: unknown;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunDefinition {
  sections: RunSection[];
  pages: RunPage[];
  steps: RunStep[];
  logicRules: LogicRule[];
  /** Which store the definition was resolved from. `'version'` is the pinned
   * graph snapshot the respondent started with; `'live'` is today's
   * fallback for runs with no `workflowVersionId` — see RVP ticket doc for
   * the still-open Option A/B/C decision on whether `'live'` survives. */
  source: "version" | "live";
  /** Only present when `source === 'version'`. */
  graph?: RunDefinitionGraph;
}

/**
 * Resolves the single set of pages/steps/logic-rules a run's server-side
 * decisions (navigation, completion, execution) should use. Every workflow
 * decision path needs the same three collections; before this existed, each
 * one re-derived them independently from the live tables even for runs
 * pinned to a version (see `tickets/RUN_VERSION_PINNING_TICKETS.md`, RVP-1).
 *
 * This is the one place the pinned-version graph is parsed and validated —
 * `RunRuntimeService.getRuntime` calls it rather than duplicating the logic.
 */
export class RunDefinitionProvider {
  constructor(
    private versionRepo = workflowVersionRepository,
    private pageRepo = pageRepository,
    private stepRepo = stepRepository,
    private logicRuleRepo = logicRuleRepository,
    private sectionRepo = sectionRepository,
  ) {}

  async getDefinition(run: WorkflowRun): Promise<RunDefinition> {
    if (run.workflowVersionId) {
      return this.getPinnedDefinition(run, run.workflowVersionId);
    }
    return this.getLiveDefinition(run);
  }

  private async getPinnedDefinition(run: WorkflowRun, workflowVersionId: string): Promise<RunDefinition> {
    const version = await this.versionRepo.findById(workflowVersionId);
    if (!version || version.workflowId !== run.workflowId) {
      throw new Error("Workflow version not found for run");
    }

    const parsed = VersionRuntimeSchema.safeParse(version.graphJson);
    if (!parsed.success) {
      // RUN2-10: fail closed — a definition the runtime cannot trust must not
      // render — but make the failure diagnosable. The Zod issues were
      // previously discarded and the bare Error string matched none of
      // classifyRouteError's 4xx patterns, so this surfaced as a generic 500
      // with nothing in the logs saying which field of which step was wrong.
      // That is exactly how the earlier `.optional()` vs `.nullish()` incident
      // (see this file's header) managed to break the runner for every newly
      // activated workflow. RUN2-9 now blocks such versions at publish time;
      // this path covers versions already in the database.
      logger.error(
        {
          runId: run.id,
          workflowId: run.workflowId,
          versionId: workflowVersionId,
          issues: parsed.error.issues,
        },
        'Workflow version graphJson failed runtime schema validation'
      );
      // Respondent-facing message stays generic: no field paths or ids leak to
      // an anonymous caller. The detail is in the log above.
      throw createError.validation('This workflow cannot be started. Please contact the workflow owner.');
    }

    const graph = parsed.data;
    const timestamp = version.createdAt ?? new Date(0);
    const steps: RunStep[] = graph.pages.flatMap((page) =>
      (page.steps ?? []).map((step) => ({
        id: step.id,
        workflowId: run.workflowId,
        pageId: page.id,
        type: step.type as Step["type"],
        title: step.title,
        description: step.description ?? null,
        required: step.required ?? false,
        alias: step.alias ?? null,
        visibleIf: step.visibleIf,
        order: step.order ?? 0,
        isVirtual: step.isVirtual ?? false,
        defaultValue: step.defaultValue,
        config: step.config ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    );
    const stepIdByAlias = new Map(
      steps.filter((step) => step.alias).map((step) => [step.alias as string, step.id])
    );
    const pageIds = new Set(graph.pages.map((page) => page.id));

    // LU-6c: a rule's trigger condition is `when`, evaluated through the
    // same alias-aware ConditionExpression evaluator as `visibleIf` - it is
    // the only condition language a pinned rule carries (see the schema
    // comment above). A rule with no `when` has nothing to evaluate and is
    // dropped. `conditionStepId` is not read by evaluation (`evaluateRules`
    // resolves `when`'s own operand at eval time) but is still denormalized
    // FK bookkeeping other consumers may read, so RUN2-11's guard - drop a
    // rule whose condition step cannot be resolved in this version's own
    // steps, rather than passing one through with a hollow "" id - still
    // applies, logged once per dropped rule.
    const logicRules: LogicRule[] = (graph.logicRules ?? []).flatMap((rule, index) => {
      if (rule.when == null) {
        return [];
      }
      const conditionStepId = rule.conditionStepId ?? stepIdByAlias.get(rule.conditionStepAlias ?? "") ?? "";
      if (!conditionStepId) {
        logger.warn(
          {
            versionId: workflowVersionId,
            ruleId: rule.id ?? `runtime-rule-${index}`,
            conditionStepAlias: rule.conditionStepAlias ?? null,
          },
          "Dropping runtime logic rule with unresolvable condition step"
        );
        return [];
      }

      const targetId = rule.targetId ?? (rule.targetType === "step"
        ? stepIdByAlias.get(rule.targetAlias ?? "")
        : pageIds.has(rule.targetAlias ?? "") ? rule.targetAlias : undefined);
      return [{
        id: rule.id ?? `runtime-rule-${index}`,
        workflowId: run.workflowId,
        conditionStepId,
        when: rule.when,
        targetType: rule.targetType,
        targetStepId: rule.targetType === "step" ? targetId ?? null : null,
        targetPageId: rule.targetType === "page" ? targetId ?? null : null,
        action: rule.action as LogicRule["action"],
        order: rule.order ?? index + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies LogicRule];
    });

    const pages: RunPage[] = graph.pages.map((page) => ({
      id: page.id,
      workflowId: run.workflowId,
      sectionId: page.sectionId,
      title: page.title,
      description: page.description ?? null,
      order: page.order ?? 0,
      visibleIf: page.visibleIf,
      config: page.config,
      createdAt: timestamp,
    }));

    const sections: RunSection[] = graph.sections.map((section) => ({
      id: section.id,
      workflowId: run.workflowId,
      title: section.title,
      description: section.description ?? null,
      visibleIf: section.visibleIf,
      createdAt: timestamp,
    }));

    return {
      sections,
      pages,
      steps,
      logicRules,
      source: "version",
      graph: {
        title: graph.title,
        description: graph.description ?? null,
        projectId: graph.projectId ?? null,
        intakeConfig: graph.intakeConfig,
        settings: graph.settings,
      },
    };
  }

  private async getLiveDefinition(run: WorkflowRun): Promise<RunDefinition> {
    // RLS-5: `pages`/`steps` are RLS-covered through their parent
    // workflow's ownership-derived policy. On the bare pool these return zero
    // rows and the run renders as an EMPTY definition — no error, just a
    // workflow with no pages and no questions, and for document generation a
    // silent "0 documents generated, success: true". One tenant transaction
    // for all three reads, so they also see a consistent snapshot.
    const { liveSections, livePages, liveSteps, logicRules } = await withCurrentTenant(async (tx) => {
      const sectionsRead: Section[] = await this.sectionRepo.findByWorkflowId(run.workflowId, tx);
      const pagesRead: Page[] = await this.pageRepo.findByWorkflowId(run.workflowId, tx);
      const stepsRead: Step[] = await this.stepRepo.findByPageIds(
        pagesRead.map((page) => page.id),
        tx
      );
      const rulesRead = await this.logicRuleRepo.findByWorkflowId(run.workflowId, tx);
      return { liveSections: sectionsRead, livePages: pagesRead, liveSteps: stepsRead, logicRules: rulesRead };
    });

    const sections: RunSection[] = liveSections.map((section) => ({
      id: section.id,
      workflowId: section.workflowId,
      title: section.title,
      description: section.description ?? null,
      visibleIf: section.visibleIf,
      createdAt: section.createdAt ?? new Date(0),
    }));

    const pages: RunPage[] = livePages.map((page) => ({
      id: page.id,
      workflowId: page.workflowId,
      sectionId: page.sectionId ?? null,
      title: page.title,
      description: page.description ?? null,
      order: page.order,
      visibleIf: page.visibleIf,
      config: page.config,
      createdAt: page.createdAt ?? new Date(0),
    }));

    const steps: RunStep[] = liveSteps.map((step) => ({
      id: step.id,
      workflowId: step.workflowId,
      pageId: step.pageId,
      type: step.type,
      title: step.title,
      description: step.description ?? null,
      required: step.required ?? false,
      alias: step.alias ?? null,
      visibleIf: step.visibleIf,
      order: step.order,
      isVirtual: step.isVirtual ?? false,
      defaultValue: step.defaultValue,
      config: (step.config as Record<string, unknown> | null) ?? null,
      createdAt: step.createdAt ?? new Date(0),
      updatedAt: step.updatedAt ?? new Date(0),
    }));

    return { sections, pages, steps, logicRules, source: "live" };
  }
}

export const runDefinitionProvider = new RunDefinitionProvider();

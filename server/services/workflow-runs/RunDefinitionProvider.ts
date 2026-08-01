import { z } from "zod";

import type { LogicRule, Section, Step, WorkflowRun } from "@shared/schema";

import { logger } from "../../logger";
import {
  logicRuleRepository,
  sectionRepository,
  stepRepository,
  workflowVersionRepository,
} from "../../repositories";
import { createError } from "../../utils/errors";

// This validates a version's serialized graphJson, whose fields come straight
// from nullable DB columns. `.optional()` accepts `undefined` but REJECTS
// `null` — and normal steps serialize repeaterConfig/alias/config/description as
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
  repeaterConfig: z.record(z.unknown()).nullish(),
  defaultValue: z.unknown().optional(),
  isVirtual: z.boolean().nullish(),
}).passthrough();

const VersionSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullish(),
  order: z.number().nullish(),
  visibleIf: z.unknown().optional(),
  skipIf: z.unknown().optional(),
  config: z.unknown().optional(),
  steps: z.array(VersionStepSchema).nullish(),
}).passthrough();

const VersionLogicRuleSchema = z.object({
  id: z.string().nullish(),
  conditionStepId: z.string().nullish(),
  conditionStepAlias: z.string().nullish(),
  operator: z.string(),
  conditionValue: z.unknown().optional(),
  targetType: z.enum(["section", "step"]),
  targetId: z.string().nullish(),
  targetAlias: z.string().nullish(),
  action: z.string(),
  logicalOperator: z.string().nullish(),
  order: z.number().nullish(),
}).passthrough();

const VersionRuntimeSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string().nullable().optional(),
  intakeConfig: z.unknown().optional(),
  settings: z.unknown().optional(),
  sections: z.array(VersionSectionSchema),
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

export interface RunSection {
  id: string;
  workflowId: string;
  title: string;
  description: string | null;
  order: number;
  visibleIf?: unknown;
  skipIf?: unknown;
  config?: unknown;
  createdAt: Date;
}

export interface RunStep {
  id: string;
  workflowId: string;
  sectionId: string;
  type: Step["type"];
  title: string;
  description: string | null;
  required: boolean;
  alias: string | null;
  visibleIf?: unknown;
  order: number;
  isVirtual: boolean;
  defaultValue?: unknown;
  repeaterConfig?: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunDefinition {
  sections: RunSection[];
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
 * Resolves the single set of sections/steps/logic-rules a run's server-side
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
    private sectionRepo = sectionRepository,
    private stepRepo = stepRepository,
    private logicRuleRepo = logicRuleRepository,
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
    const steps: RunStep[] = graph.sections.flatMap((section) =>
      (section.steps ?? []).map((step) => ({
        id: step.id,
        workflowId: run.workflowId,
        sectionId: section.id,
        type: step.type as Step["type"],
        title: step.title,
        description: step.description ?? null,
        required: step.required ?? false,
        alias: step.alias ?? null,
        visibleIf: step.visibleIf,
        order: step.order ?? 0,
        isVirtual: step.isVirtual ?? false,
        defaultValue: step.defaultValue,
        repeaterConfig: step.repeaterConfig ?? null,
        config: step.config ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    );
    const stepIdByAlias = new Map(
      steps.filter((step) => step.alias).map((step) => [step.alias as string, step.id])
    );
    const sectionIds = new Set(graph.sections.map((section) => section.id));

    // RUN2-11: a rule whose condition step cannot be resolved (neither a
    // direct id nor an alias found in this version's steps) must have no
    // runtime effect. Drop it rather than emitting `conditionStepId: ""`,
    // which `evaluateCondition` would otherwise read as `data[""] ===
    // undefined` and treat as unconditionally empty. Logged once per dropped
    // rule so a broken publish is visible without silently hiding content.
    const logicRules: LogicRule[] = (graph.logicRules ?? []).flatMap((rule, index) => {
      const conditionStepId = rule.conditionStepId ?? stepIdByAlias.get(rule.conditionStepAlias ?? "");
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
        : sectionIds.has(rule.targetAlias ?? "") ? rule.targetAlias : undefined);
      return [{
        id: rule.id ?? `runtime-rule-${index}`,
        workflowId: run.workflowId,
        conditionStepId,
        operator: rule.operator as LogicRule["operator"],
        conditionValue: rule.conditionValue ?? null,
        targetType: rule.targetType,
        targetStepId: rule.targetType === "step" ? targetId ?? null : null,
        targetSectionId: rule.targetType === "section" ? targetId ?? null : null,
        action: rule.action as LogicRule["action"],
        logicalOperator: rule.logicalOperator ?? "AND",
        order: rule.order ?? index + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies LogicRule];
    });

    const sections: RunSection[] = graph.sections.map((section) => ({
      id: section.id,
      workflowId: run.workflowId,
      title: section.title,
      description: section.description ?? null,
      order: section.order ?? 0,
      visibleIf: section.visibleIf,
      skipIf: section.skipIf,
      config: section.config,
      createdAt: timestamp,
    }));

    return {
      sections,
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
    const liveSections: Section[] = await this.sectionRepo.findByWorkflowId(run.workflowId);
    const sectionIds = liveSections.map((section) => section.id);
    const liveSteps: Step[] = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(run.workflowId);

    const sections: RunSection[] = liveSections.map((section) => ({
      id: section.id,
      workflowId: section.workflowId,
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      visibleIf: section.visibleIf,
      skipIf: section.skipIf,
      config: section.config,
      createdAt: section.createdAt ?? new Date(0),
    }));

    const steps: RunStep[] = liveSteps.map((step) => ({
      id: step.id,
      workflowId: step.workflowId,
      sectionId: step.sectionId,
      type: step.type,
      title: step.title,
      description: step.description ?? null,
      required: step.required ?? false,
      alias: step.alias ?? null,
      visibleIf: step.visibleIf,
      order: step.order,
      isVirtual: step.isVirtual ?? false,
      defaultValue: step.defaultValue,
      repeaterConfig: (step.repeaterConfig as Record<string, unknown> | null) ?? null,
      config: (step.config as Record<string, unknown> | null) ?? null,
      createdAt: step.createdAt ?? new Date(0),
      updatedAt: step.updatedAt ?? new Date(0),
    }));

    return { sections, steps, logicRules, source: "live" };
  }
}

export const runDefinitionProvider = new RunDefinitionProvider();

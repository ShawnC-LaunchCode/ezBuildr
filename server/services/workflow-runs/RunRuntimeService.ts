import { z } from "zod";

import type { LogicRule, Step, WorkflowRun } from "@shared/schema";

import { stepValueRepository, workflowRunRepository, workflowVersionRepository } from "../../repositories";
import { RunAuthResolver, runAuthResolver } from "../runs/RunAuthResolver";

const VersionStepSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  order: z.number().optional(),
  alias: z.string().optional(),
  visibleIf: z.unknown().optional(),
  repeaterConfig: z.record(z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
  isVirtual: z.boolean().optional(),
}).passthrough();

const VersionSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().optional(),
  visibleIf: z.unknown().optional(),
  skipIf: z.unknown().optional(),
  config: z.unknown().optional(),
  steps: z.array(VersionStepSchema).optional(),
}).passthrough();

const VersionLogicRuleSchema = z.object({
  id: z.string().optional(),
  conditionStepId: z.string().optional(),
  conditionStepAlias: z.string().optional(),
  operator: z.string(),
  conditionValue: z.unknown().optional(),
  targetType: z.enum(["section", "step"]),
  targetId: z.string().optional(),
  targetAlias: z.string().optional(),
  action: z.string(),
  logicalOperator: z.string().optional(),
  order: z.number().optional(),
}).passthrough();

const VersionRuntimeSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  intakeConfig: z.unknown().optional(),
  settings: z.unknown().optional(),
  sections: z.array(VersionSectionSchema),
  logicRules: z.array(VersionLogicRuleSchema).optional(),
}).passthrough();

interface RuntimeAuthContext {
  userId?: string;
  tokenRunId?: string;
}

export interface RunRuntimeDefinition {
  contractVersion: 1;
  run: Pick<
    WorkflowRun,
    "id" | "workflowId" | "workflowVersionId" | "currentSectionId" | "completed" | "generationStatus"
  >;
  workflow: {
    id: string;
    title: string;
    description: string | null;
    projectId: string | null;
    intakeConfig?: unknown;
    settings?: unknown;
  };
  sections: Array<{
    id: string;
    workflowId: string;
    title: string;
    description: string | null;
    order: number;
    visibleIf?: unknown;
    skipIf?: unknown;
    config?: unknown;
    createdAt: Date;
  }>;
  steps: Array<{
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
  }>;
  logicRules: LogicRule[];
  values: Array<{ id: string; runId: string; stepId: string; value: unknown; createdAt: Date | null; updatedAt: Date | null }>;
}

export class RunRuntimeService {
  constructor(
    private runRepo = workflowRunRepository,
    private valueRepo = stepValueRepository,
    private versionRepo = workflowVersionRepository,
    private authResolver: RunAuthResolver = runAuthResolver,
  ) {}

  async getRuntime(runId: string, auth: RuntimeAuthContext): Promise<RunRuntimeDefinition> {
    const run = await this.getAuthorizedRun(runId, auth);
    if (!run.workflowVersionId) {
      throw new Error("Workflow version not found for run");
    }

    const version = await this.versionRepo.findById(run.workflowVersionId);
    if (!version || version.workflowId !== run.workflowId) {
      throw new Error("Workflow version not found for run");
    }

    const parsed = VersionRuntimeSchema.safeParse(version.graphJson);
    if (!parsed.success) {
      throw new Error("Invalid runtime definition for workflow version");
    }

    const graph = parsed.data;
    const timestamp = version.createdAt ?? new Date(0);
    const steps = graph.sections.flatMap((section) =>
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

    const logicRules = (graph.logicRules ?? []).map((rule, index) => {
      const targetId = rule.targetId ?? (rule.targetType === "step"
        ? stepIdByAlias.get(rule.targetAlias ?? "")
        : sectionIds.has(rule.targetAlias ?? "") ? rule.targetAlias : undefined);
      return {
        id: rule.id ?? `runtime-rule-${index}`,
        workflowId: run.workflowId,
        conditionStepId: rule.conditionStepId ?? stepIdByAlias.get(rule.conditionStepAlias ?? "") ?? "",
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
      } satisfies LogicRule;
    });

    const values = await this.valueRepo.findByRunId(run.id);
    return {
      contractVersion: 1,
      run: {
        id: run.id,
        workflowId: run.workflowId,
        workflowVersionId: run.workflowVersionId,
        currentSectionId: run.currentSectionId,
        completed: run.completed,
        generationStatus: run.generationStatus,
      },
      workflow: {
        id: run.workflowId,
        title: graph.title,
        description: graph.description ?? null,
        projectId: graph.projectId ?? null,
        intakeConfig: graph.intakeConfig,
        settings: graph.settings,
      },
      sections: graph.sections.map((section) => ({
        id: section.id,
        workflowId: run.workflowId,
        title: section.title,
        description: section.description ?? null,
        order: section.order ?? 0,
        visibleIf: section.visibleIf,
        skipIf: section.skipIf,
        config: section.config,
        createdAt: timestamp,
      })),
      steps,
      logicRules,
      values,
    };
  }

  private async getAuthorizedRun(runId: string, auth: RuntimeAuthContext): Promise<WorkflowRun> {
    if (auth.tokenRunId) {
      if (auth.tokenRunId !== runId) {
        throw new Error("Access denied - run mismatch");
      }
      const run = await this.runRepo.findById(runId);
      if (!run) {
        throw new Error("Run not found");
      }
      return run;
    }

    if (!auth.userId) {
      throw new Error("Unauthorized - no user ID");
    }
    const resolved = await this.authResolver.resolveRun(runId, auth.userId);
    if (!resolved.run) {
      throw new Error("Run not found");
    }
    if (resolved.access === "none" || resolved.access === "public") {
      throw new Error("Access denied - insufficient permissions for this run");
    }
    return resolved.run;
  }
}

export const runRuntimeService = new RunRuntimeService();

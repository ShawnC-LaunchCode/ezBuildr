import type { LogicRule, Step, WorkflowRun } from "@shared/schema";
import type { ResolvedBranding } from "@shared/types/branding";

import { stepValueRepository, workflowRunRepository, workflowVersionRepository } from "../../repositories";
import { BrandingService, brandingService } from "../BrandingService";
import { RunAuthResolver, runAuthResolver } from "../runs/RunAuthResolver";
import { RunDefinitionProvider } from "./RunDefinitionProvider";

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
    config: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  logicRules: LogicRule[];
  values: Array<{ id: string; runId: string; stepId: string; value: unknown; createdAt: Date | null; updatedAt: Date | null }>;
  /**
   * Branding the participant should see, already merged from tenant and
   * workflow (GH-158). Resolved server-side and delivered on this payload so
   * an anonymous participant needs no extra request, and so preview and
   * production render from an identical value.
   */
  branding: ResolvedBranding;
}

export class RunRuntimeService {
  private definitionProvider: RunDefinitionProvider;

  constructor(
    private runRepo = workflowRunRepository,
    private valueRepo = stepValueRepository,
    private versionRepo = workflowVersionRepository,
    private authResolver: RunAuthResolver = runAuthResolver,
    // Named distinctly from the imported singleton: a parameter of the same
    // name shadows the import inside the parameter scope and self-references.
    private brandingResolver: BrandingService = brandingService,
  ) {
    this.definitionProvider = new RunDefinitionProvider(this.versionRepo);
  }

  async getRuntime(runId: string, auth: RuntimeAuthContext): Promise<RunRuntimeDefinition> {
    const run = await this.getAuthorizedRun(runId, auth);
    if (!run.workflowVersionId) {
      throw new Error("Workflow version not found for run");
    }

    // Single implementation of "resolve this run's definition" lives in the
    // provider (RVP-1) — it parses the pinned graph, validates it against
    // VersionRuntimeSchema (RUN2-10 fail-closed behaviour), and resolves
    // logic-rule aliases into ids (RUN2-11). `run.workflowVersionId` is set,
    // so this always takes the provider's `source: 'version'` branch and
    // `definition.graph` is always populated.
    const definition = await this.definitionProvider.getDefinition(run);
    const graph = definition.graph;
    if (!graph) {
      // Unreachable given the guard above; keeps this function's return type
      // sound without a non-null assertion.
      throw new Error("Workflow version not found for run");
    }

    const [values, branding] = await Promise.all([
      this.valueRepo.findByRunId(run.id),
      this.brandingResolver.resolveForWorkflow(run.workflowId, graph.settings),
    ]);
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
        description: graph.description,
        projectId: graph.projectId,
        intakeConfig: graph.intakeConfig,
        settings: graph.settings,
      },
      sections: definition.sections,
      steps: definition.steps,
      logicRules: definition.logicRules,
      values,
      branding,
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

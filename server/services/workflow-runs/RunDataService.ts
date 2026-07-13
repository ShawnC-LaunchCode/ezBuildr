import type { Step } from "@shared/schema";

import { stepRepository, stepValueRepository, workflowRunRepository } from "../../repositories";
import type { DbTransaction } from "../../repositories/BaseRepository";
import { createError } from "../../utils/errors";

export interface RunDataStepMeta {
  id: string;
  alias: string | null;
  type: Step['type'];
  sectionId: string;
  isVirtual: boolean;
}

export interface RunData {
  /** Canonical runtime data for logic, validation, and block execution. */
  byStepId: Record<string, unknown>;
  /**
   * Document data keyed by alias, falling back to stepId. This is derived from
   * byStepId with the same step metadata so documents receive stable template
   * variables while runtime logic keeps the id-keyed contract it depends on.
   * Non-step keys, such as transform outputs, pass through unchanged.
   */
  byAlias: Record<string, unknown>;
  steps: RunDataStepMeta[];
}

export class RunDataService {
  constructor(
    private valueRepo = stepValueRepository,
    private stepRepo = stepRepository,
    private runRepo = workflowRunRepository
  ) {}

  async buildForRun(runId: string, workflowId?: string, tx?: DbTransaction): Promise<RunData> {
    const resolvedWorkflowId = workflowId ?? await this.resolveWorkflowId(runId, tx);
    const [values, steps] = await Promise.all([
      this.valueRepo.findByRunId(runId, tx),
      this.stepRepo.findByWorkflowIdWithAliases(resolvedWorkflowId, tx),
    ]);

    const byStepId: Record<string, unknown> = {};
    for (const value of values) {
      byStepId[value.stepId] = value.value;
    }

    return this.fromStepIdData(byStepId, steps);
  }

  fromStepIdData(data: Record<string, unknown>, steps: RunDataStepMeta[]): RunData {
    return {
      byStepId: { ...data },
      byAlias: toAliasKeyed(data, steps),
      steps: steps.map((step) => ({
        id: step.id,
        alias: step.alias,
        type: step.type,
        sectionId: step.sectionId,
        isVirtual: step.isVirtual,
      })),
    };
  }

  private async resolveWorkflowId(runId: string, tx?: DbTransaction): Promise<string> {
    const run = await this.runRepo.findById(runId, tx);
    if (!run) {
      throw createError.notFound('Workflow run', runId);
    }
    return run.workflowId;
  }
}

export function toAliasKeyed(
  data: Record<string, unknown>,
  steps: Array<{ id: string; alias?: string | null }>
): Record<string, unknown> {
  const aliasByStepId = new Map(
    steps
      .filter((step) => step.alias !== null && step.alias !== undefined && step.alias !== '')
      .map((step) => [step.id, step.alias as string])
  );

  const byAlias: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    byAlias[aliasByStepId.get(key) ?? key] = value;
  }
  return byAlias;
}

export const runDataService = new RunDataService();

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
   *
   * TPL-10 / D3: every aliased step in the workflow gets an entry here, even
   * with no persisted value -- seeded `null`, never omitted. This is what
   * lets TPL-3's strict-undefined mode (RenderCore.ts's nullGetter) tell a
   * legitimately unanswered optional field (present, null, renders blank)
   * apart from a typo'd or deleted-question variable (absent, raises). The
   * seed is scoped to byAlias only -- byStepId is untouched and still
   * reflects persisted step_values rows exactly as before, because
   * RunCompletionService feeds byStepId into block execution, logic
   * validation, and an analytics "answered step count" metric that would be
   * silently redefined (to "total steps in the workflow") if byStepId grew
   * the same seed. See buildForRun's doc comment for the full survey.
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

  /**
   * TPL-10: `byAlias` is seeded with `null` for every aliased step that has
   * no persisted `step_values` row (skipped optional field, conditionally
   * hidden step) -- see the `RunData.byAlias` doc comment for why. `byStepId`
   * is deliberately left exactly as it was: built only from persisted rows.
   *
   * Consumer survey (all call sites of `buildForRun`, checked for
   * absent-vs-null assumptions before this change):
   * - `RunCompletionService.complete()` uses `byStepId` for block-phase data,
   *   `LogicService.validateCompletion`, and an `Object.keys(byStepId).length`
   *   analytics metric ("answered step count"). All three are untouched
   *   because `byStepId` itself is untouched. `validateRequiredSteps` (and
   *   `conditionEvaluator`'s visibility check) determine "missing" via
   *   `isEmpty(value)` -- true for both `undefined` and `null` -- so even a
   *   hypothetical `byStepId` seed would not have broken required-field
   *   validation; the metric drift was the actual reason to scope this to
   *   `byAlias` only.
   * - `RunLifecycleService.generateFinalBlockDocuments` and
   *   `SignatureBlockService.executeSignatureBlock` both read `byAlias` only,
   *   feeding it into document rendering (`renderDocxBuffer`'s `nullGetter`,
   *   the actual TPL-3 strict-undefined check) and e-sign variable
   *   substitution/tab binding (`EnvelopeBuilder`, `MappingInterpreter`).
   *   Every substitution point found is value-based (`value ?? ''` /
   *   `value === undefined || value === null`), never a presence check, so
   *   the newly-added `null` entries render/substitute as blank -- the
   *   intended fix.
   * - `DocumentDeliveryService.buildDeliveryContext` merges
   *   `{ ...byStepId, ...byAlias }` into delivery-template `stepValues`.
   *   `EmailDeliveryAdapter`'s interpolation is null-safe. `WebhookDeliveryAdapter`
   *   forwards `stepValues` verbatim into the JSON payload, so a webhook
   *   subscriber now sees an explicit `null` for an aliased-but-unanswered
   *   step instead of the key being absent -- an intentional, additive shape
   *   change (same semantics as the document-rendering fix), not a break.
   */
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
  // TPL-10 / D3: seed every known alias present-as-null first, then let
  // persisted values overwrite unconditionally below -- including falsy ones
  // (0, '', false). Never gate the overwrite on truthiness/nullish-checks;
  // that is precisely how a real falsy answer gets clobbered back to null.
  for (const alias of aliasByStepId.values()) {
    byAlias[alias] = null;
  }
  for (const [key, value] of Object.entries(data)) {
    byAlias[aliasByStepId.get(key) ?? key] = value;
  }
  return byAlias;
}

export const runDataService = new RunDataService();

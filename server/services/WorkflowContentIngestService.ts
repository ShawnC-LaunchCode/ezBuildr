import { eq, inArray, and, isNull } from "drizzle-orm";

import { db } from "../db";
import { withCurrentTenant } from "../utils/rlsContext";
import { createLogger } from "../logger";
import { pages, steps, logicRules, transformBlocks, lifecycleHooks, documentHooks } from "../../shared/schema";

import { extractConditionReferences } from "../../shared/conditionGraph";
import { LIMITS, LimitExceededError } from "../../shared/limits";
import { validateAndNormalizeConfig } from "../utils/stepConfigUtils";
import { protectFinalBlockDeliverySecrets } from "../utils/documentDeliverySecrets";

import type { StepConfig } from "../../shared/types/stepConfigs";
import type { ConditionExpression } from "../../shared/types/conditions";

import { normalizeWorkflowTypes, validateWorkflowStructure } from "./ai/AIServiceUtils";
import { generateUniqueAliasFromTaken, sanitizeAliasFormat } from "./stepAlias";

import type {
  InsertDocumentHook,
  InsertLifecycleHook,
  InsertLogicRule,
  InsertStep,
  InsertTransformBlock,
} from "../../shared/schema";
import type { AIGeneratedWorkflow } from "./ai/types";

const logger = createLogger({ module: "WorkflowContentIngestService" });

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ExistingPage = typeof pages.$inferSelect;

export interface WorkflowStepData {
  id?: string;
  type: string;
  title: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  options?: string[];
  order?: number;
  alias?: string;
  visibleIf?: ConditionExpression | null;
  defaultValue?: unknown;
  isVirtual?: boolean;
}

/**
 * Wire shape for a logic rule as produced/consumed by AI workflow generation
 * (`AIGeneratedLogicRuleSchema`) and template/blueprint content ingest (a
 * `VersionService.serializeWorkflow` snapshot).
 *
 * LU-6c: both producers emit `when` (a `ConditionExpression`) natively - the
 * legacy flat `operator`/`conditionValue` shape and the
 * `buildSingleConditionExpression` seam that synthesized `when` from it are
 * gone. `conditionStepAlias`/`targetAlias` are not a second condition
 * language; they are alias-keyed FK bookkeeping `syncLogicRules` resolves
 * into real ids for the *newly created* steps/pages in this ingest pass
 * (`conditionStepId`/`targetId` are the already-resolved forms a version
 * snapshot supplies directly, when ids don't need remapping).
 */
export interface WorkflowLogicRuleData {
  id?: string;
  conditionStepAlias?: string;
  conditionStepId?: string;
  /** Trigger condition - the same ConditionExpression `visibleIf` uses. */
  when: ConditionExpression;
  targetType: string;
  targetAlias: string;
  targetId?: string;
  action: string;
  order?: number;
}

export interface WorkflowTransformBlockData {
  id?: string;
  pageId?: string | null;
  phase: string;
  name: string;
  code: string;
  language: string;
  inputKeys?: string[];
  outputAlias?: string;
  outputKey?: string;
  virtualStepId?: string | null;
  enabled?: boolean;
  order?: number;
  timeoutMs?: number | null;
}

export interface WorkflowHookData {
  id?: string;
  pageId?: string | null;
  finalBlockDocumentId?: string | null;
  phase: string;
  name: string;
  code: string;
  language: string;
  inputKeys?: string[];
  outputAlias?: string;
  outputKeys?: string[];
  virtualStepIds?: string[] | null;
  order?: number;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
  enabled?: boolean;
  timeoutMs?: number | null;
  mutationMode?: boolean | null;
}

export interface WorkflowBlockData {
  id?: string;
  pageId?: string | null;
  type: string;
  phase: string;
  config: unknown;
  virtualStepId?: string | null;
  enabled?: boolean;
  order?: number;
}

export interface WorkflowPageData {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  alias?: string;
  visibleIf?: ConditionExpression | null;
  config?: Record<string, unknown>;
  steps?: WorkflowStepData[];
}

export interface WorkflowContentData {
  title?: string;
  description?: string;
  projectId?: string | null;
  settings?: Record<string, unknown>;
  intakeConfig?: Record<string, unknown>;
  pages?: WorkflowPageData[];
  logicRules?: WorkflowLogicRuleData[];
  blocks?: WorkflowBlockData[];
  transformBlocks?: WorkflowTransformBlockData[];
  lifecycleHooks?: WorkflowHookData[];
  documentHooks?: WorkflowHookData[];
}

interface AliasSyncState {
  aliasMap: Map<string, string>;
  existingAliasByStepId: Map<string, string | null>;
  takenAliases: Set<string>;
}

interface StepSyncContext {
  tx: Transaction;
  workflowId: string;
  pageId: string;
  pageAlreadyExists: boolean;
  aliasState: AliasSyncState;
}

interface StepUpsertContext {
  tx: Transaction;
  workflowId: string;
  pageId: string;
  existingStepIds: Set<string>;
  incomingStepIds: Set<string>;
  aliasState: AliasSyncState;
}

function normalizeStepConfig(stepData: WorkflowStepData, workflowId: string): Record<string, unknown> | null {
  let config: Record<string, unknown> | null = null;
  if (stepData.config !== undefined) {
    config = stepData.config;
  } else if (stepData.options !== undefined) {
    config = { options: stepData.options };
  }

  if (config && stepData.type) {
    try {
      // Enforce strict validation
      config = validateAndNormalizeConfig(stepData.type, config as StepConfig, { strict: true }) as Record<string, unknown> | null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createLogger({ module: 'ingest-service' }).warn(
        { stepType: stepData.type, workflowId, error: message },
        "Step config validation failed during ingest"
      );
      throw new Error(`Validation error: ${message}`);
    }
  }

  return config;
}

function normalizeContent(data: WorkflowContentData): WorkflowContentData {
  const normalizedData = JSON.parse(JSON.stringify(data)) as WorkflowContentData;

  normalizedData.pages ??= [];
  normalizedData.logicRules ??= [];
  normalizedData.transformBlocks ??= [];

  normalizeWorkflowTypes(normalizedData as unknown as AIGeneratedWorkflow);
  validateWorkflowStructure(normalizedData as unknown as AIGeneratedWorkflow);

  // Aggregate size caps (ICW-11): the deep-update path replaces the whole
  // workflow, so enforce the same ceilings the incremental path checks.
  const pageCount = normalizedData.pages?.length ?? 0;
  if (pageCount > LIMITS.MAX_PAGES_PER_WORKFLOW) {
    throw new LimitExceededError(
      `Page limit reached (${LIMITS.MAX_PAGES_PER_WORKFLOW} per workflow)`
    );
  }
  const stepCount = (normalizedData.pages ?? []).reduce(
    (sum, page) => sum + (page.steps?.length ?? 0),
    0
  );
  if (stepCount > LIMITS.MAX_STEPS_PER_WORKFLOW) {
    throw new LimitExceededError(
      `Question limit reached (${LIMITS.MAX_STEPS_PER_WORKFLOW} per workflow)`
    );
  }

  return normalizedData;
}

function isPresent(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value !== "";
}

export class WorkflowContentIngestService {
  /**
   * Apply a full structural workflow definition (from AI, templates, or manual deep-update).
   */
  async apply(
    workflowId: string,
    data: WorkflowContentData,
    options: { source: "ai" | "template" | "manual"; tx?: Transaction }
  ): Promise<void> {
    logger.info({ workflowId, source: options.source }, "Applying workflow content");

    const normalizedData = normalizeContent(data);

    const runner = async (tx: Transaction): Promise<void> => {
      // Excludes soft-deleted rows (ICW2-B1) so reconciliation never
      // re-considers an already-deleted page for deletion, and so a
      // page removed from the incoming payload is soft-deleted exactly
      // once.
      const existingPages = await tx
        .select()
        .from(pages)
        .where(and(eq(pages.workflowId, workflowId), isNull(pages.deletedAt)));

      const aliasState = await this.buildAliasState(tx, workflowId);
      const incomingPageIds = await this.syncPages(
        tx,
        workflowId,
        normalizedData.pages ?? [],
        existingPages,
        aliasState
      );

      await this.deleteMissingPages(tx, existingPages, incomingPageIds);
      await this.syncLogicRules(tx, workflowId, normalizedData.logicRules ?? [], aliasState.aliasMap);
      await this.syncTransformBlocks(tx, workflowId, normalizedData.transformBlocks ?? []);
      await this.syncLifecycleHooks(tx, workflowId, normalizedData.lifecycleHooks);
      await this.syncDocumentHooks(tx, workflowId, normalizedData.documentHooks);
    };

    if (options.tx) {
      return runner(options.tx);
    }
    // RLS-5: `pages` and `steps` are RLS-covered through their workflow's
    // ownership-derived policy, so this transaction has to carry the tenant —
    // a bare `db.transaction` here had every insert rejected under
    // enforcement. Same house pattern as every other converted service; the
    // caller-supplied-tx branch above is unchanged and still never nests.
    return withCurrentTenant(runner);
  }

  private async buildAliasState(tx: Transaction, workflowId: string): Promise<AliasSyncState> {
    // Excludes soft-deleted steps (ICW2-B1) — a soft-deleted step's alias is
    // free to be reused by an incoming step, matching the unique index's
    // `deleted_at IS NULL` scope.
    const existingWorkflowSteps = await tx
      .select({
        id: steps.id,
        alias: steps.alias,
      })
      .from(steps)
      .innerJoin(pages, eq(steps.pageId, pages.id))
      .where(and(eq(pages.workflowId, workflowId), isNull(steps.deletedAt)));

    const existingAliasByStepId = new Map(existingWorkflowSteps.map((step) => [step.id, step.alias]));
    const takenAliases = new Set(
      existingWorkflowSteps
        .map((step) => step.alias?.toLowerCase())
        .filter(isPresent)
    );

    return {
      aliasMap: new Map<string, string>(),
      existingAliasByStepId,
      takenAliases,
    };
  }

  private async syncPages(
    tx: Transaction,
    workflowId: string,
    pageDataList: WorkflowPageData[],
    existingPages: ExistingPage[],
    aliasState: AliasSyncState
  ): Promise<Set<string>> {
    const existingPageIds = new Set(existingPages.map((page) => page.id));
    const incomingPageIds = new Set<string>();

    for (const [index, pageData] of pageDataList.entries()) {
      pageData.order ??= index;
      const pageId = await this.upsertPage(
        tx,
        workflowId,
        pageData,
        existingPageIds,
        incomingPageIds
      );

      this.recordAlias(pageData.id, pageId, aliasState.aliasMap);
      this.recordAlias(pageData.alias, pageId, aliasState.aliasMap);
      await this.syncSteps({
        tx,
        workflowId,
        pageId,
        pageAlreadyExists: existingPageIds.has(pageId),
        aliasState,
      }, pageData.steps ?? []);
    }

    return incomingPageIds;
  }

  private async upsertPage(
    tx: Transaction,
    workflowId: string,
    pageData: WorkflowPageData,
    existingPageIds: Set<string>,
    incomingPageIds: Set<string>
  ): Promise<string> {
    const existingId = pageData.id;
    const isExisting = existingId !== undefined && existingId !== null && existingPageIds.has(existingId);

    if (isExisting) {
      incomingPageIds.add(existingId);
      await tx
        .update(pages)
        .set({
          title: pageData.title,
          description: pageData.description,
          order: pageData.order,
          visibleIf: pageData.visibleIf,
        })
        .where(eq(pages.id, existingId));
      return existingId;
    }

    const [newPage] = await tx
      .insert(pages)
      .values({
        workflowId,
        title: pageData.title ?? "Untitled",
        description: pageData.description ?? null,
        order: pageData.order ?? 0,
        visibleIf: pageData.visibleIf ?? null,
        config: pageData.config ?? {},
      })
      .returning();

    if (newPage === undefined) {
      throw new Error("Failed to create page while applying workflow content");
    }

    return newPage.id;
  }

  private async syncSteps(context: StepSyncContext, stepDataList: WorkflowStepData[]): Promise<void> {
    const existingStepIds = context.pageAlreadyExists
      ? await this.getExistingStepIds(context.tx, context.pageId)
      : new Set<string>();
    const incomingStepIds = new Set<string>();
    const upsertContext: StepUpsertContext = {
      tx: context.tx,
      workflowId: context.workflowId,
      pageId: context.pageId,
      existingStepIds,
      incomingStepIds,
      aliasState: context.aliasState,
    };

    for (const [stepIndex, stepData] of stepDataList.entries()) {
      const stepId = await this.upsertStep(
        upsertContext,
        stepData,
        stepIndex
      );

      this.recordAlias(stepData.alias, stepId, context.aliasState.aliasMap);
      this.recordAlias(stepData.id, stepId, context.aliasState.aliasMap);
    }

    if (context.pageAlreadyExists) {
      await this.deleteMissingSteps(context.tx, existingStepIds, incomingStepIds);
    }
  }

  private async getExistingStepIds(tx: Transaction, pageId: string): Promise<Set<string>> {
    // Excludes soft-deleted steps (ICW2-B1) so reconciliation never
    // re-considers an already-deleted step for deletion.
    const dbSteps = await tx
      .select({ id: steps.id })
      .from(steps)
      .where(and(eq(steps.pageId, pageId), isNull(steps.deletedAt)));
    return new Set(dbSteps.map((step) => step.id));
  }

  private async upsertStep(
    context: StepUpsertContext,
    stepData: WorkflowStepData,
    stepIndex: number
  ): Promise<string> {
    const existingId = stepData.id;
    const isExisting = existingId !== undefined && existingId !== null && context.existingStepIds.has(existingId);
    const alias = this.resolveStepAlias(stepData, existingId, context.aliasState);
    const normalizedConfig = normalizeStepConfig(stepData, context.workflowId);
    const config = stepData.type === 'final_documents' || stepData.type === 'final'
      ? protectFinalBlockDeliverySecrets(normalizedConfig)
      : normalizedConfig;

    if (isExisting) {
      context.incomingStepIds.add(existingId);
      await context.tx.update(steps).set({
        workflowId: context.workflowId,
        title: stepData.title,
        description: stepData.description,
        type: stepData.type as InsertStep["type"],
        required: stepData.required,
        config,
        order: stepData.order ?? stepIndex,
        pageId: context.pageId,
        alias,
        visibleIf: stepData.visibleIf,
        defaultValue: stepData.defaultValue,
      }).where(eq(steps.id, existingId));
      return existingId;
    }

    const [newStep] = await context.tx.insert(steps).values({
      workflowId: context.workflowId,
      pageId: context.pageId,
      type: stepData.type as InsertStep["type"],
      title: stepData.title,
      description: stepData.description,
      required: stepData.required ?? false,
      config,
      order: stepData.order ?? stepIndex,
      alias,
      visibleIf: stepData.visibleIf,
      defaultValue: stepData.defaultValue,
    }).returning();

    if (newStep === undefined) {
      throw new Error("Failed to create step while applying workflow content");
    }

    return newStep.id;
  }

  private resolveStepAlias(
    stepData: WorkflowStepData,
    stepId: string | undefined,
    aliasState: AliasSyncState
  ): string | null {
    const previousAlias = stepId !== undefined ? aliasState.existingAliasByStepId.get(stepId) : null;
    if (previousAlias !== undefined && previousAlias !== null) {
      aliasState.takenAliases.delete(previousAlias.toLowerCase());
    }

    if (stepData.alias) {
      stepData.alias = sanitizeAliasFormat(stepData.alias);
      if (stepData.alias === "") {
        stepData.alias = undefined;
      }
    }

    let alias = stepData.alias ?? generateUniqueAliasFromTaken(stepData.title, aliasState.takenAliases);
    if (alias !== undefined && alias !== null && aliasState.takenAliases.has(alias.toLowerCase())) {
      alias = generateUniqueAliasFromTaken(alias, aliasState.takenAliases);
    }
    if (alias !== undefined && alias !== null) {
      aliasState.takenAliases.add(alias.toLowerCase());
    }

    return alias ?? null;
  }

  /**
   * Soft-deletes (ICW2-B1) pages dropped from the incoming payload, and
   * cascades to their steps — a hard `DELETE` would destroy `step_values`
   * (respondent answers) via the FK cascade; soft-delete never triggers it.
   */
  private async deleteMissingPages(
    tx: Transaction,
    existingPages: ExistingPage[],
    incomingPageIds: Set<string>
  ): Promise<void> {
    const pagesToDelete = existingPages
      .map((page) => page.id)
      .filter((id) => !incomingPageIds.has(id));

    if (pagesToDelete.length > 0) {
      const deletedAt = new Date();
      await tx.update(steps).set({ deletedAt }).where(inArray(steps.pageId, pagesToDelete));
      await tx.update(pages).set({ deletedAt }).where(inArray(pages.id, pagesToDelete));
    }
  }

  /** Soft-deletes (ICW2-B1) steps dropped from the incoming payload. */
  private async deleteMissingSteps(
    tx: Transaction,
    existingStepIds: Set<string>,
    incomingStepIds: Set<string>
  ): Promise<void> {
    const stepsToDelete = [...existingStepIds].filter((id) => !incomingStepIds.has(id));
    if (stepsToDelete.length > 0) {
      await tx.update(steps).set({ deletedAt: new Date() }).where(inArray(steps.id, stepsToDelete));
    }
  }

  private async syncLogicRules(
    tx: Transaction,
    workflowId: string,
    rules: WorkflowLogicRuleData[],
    aliasMap: Map<string, string>
  ): Promise<void> {
    await tx.delete(logicRules).where(eq(logicRules.workflowId, workflowId));

    const mappedRules = rules
      .map((rule): InsertLogicRule | null => {
        // LU-6c: `when` is the only condition language a rule carries.
        // `conditionStepAlias`, when supplied (a version/template snapshot
        // always sets it - see VersionService.serializeWorkflow), is the
        // authoritative FK-remap key; otherwise derive it from `when`'s own
        // first operand (AI generation supplies only `when`), the same way
        // `LogicRuleService`/O-7 derive `conditionStepId` for human-authored
        // rules.
        const [firstConditionRef] = extractConditionReferences(rule.when);
        const conditionAlias = isPresent(rule.conditionStepAlias) ? rule.conditionStepAlias : firstConditionRef;
        const conditionStepId = (conditionAlias ? aliasMap.get(conditionAlias) : undefined)
          ?? rule.conditionStepId;
        const targetId = aliasMap.get(rule.targetAlias) ?? rule.targetId;
        if (!isPresent(conditionStepId) || !isPresent(targetId) || !rule.when) {
          return null;
        }

        const targetFields = rule.targetType === "page"
          ? { targetPageId: targetId, targetStepId: null }
          : { targetPageId: null, targetStepId: targetId };

        return {
          workflowId,
          conditionStepId,
          when: rule.when,
          action: rule.action,
          targetType: rule.targetType,
          ...targetFields,
        } as InsertLogicRule;
      })
      .filter((rule): rule is InsertLogicRule => rule !== null);

    if (mappedRules.length > 0) {
      await tx.insert(logicRules).values(mappedRules);
    }
  }

  private async syncTransformBlocks(
    tx: Transaction,
    workflowId: string,
    blocks: WorkflowTransformBlockData[]
  ): Promise<void> {
    await tx.delete(transformBlocks).where(eq(transformBlocks.workflowId, workflowId));

    const mappedBlocks = blocks.map((block): InsertTransformBlock => ({
      workflowId,
      phase: block.phase,
      name: block.name,
      code: block.code,
      language: block.language,
      inputKeys: block.inputKeys,
      outputKey: block.outputAlias ?? block.outputKey,
      order: block.order,
    } as InsertTransformBlock));

    if (mappedBlocks.length > 0) {
      await tx.insert(transformBlocks).values(mappedBlocks);
    }
  }

  private async syncLifecycleHooks(
    tx: Transaction,
    workflowId: string,
    hooks: WorkflowHookData[] | undefined
  ): Promise<void> {
    if (hooks === undefined) {
      return;
    }

    await tx.delete(lifecycleHooks).where(eq(lifecycleHooks.workflowId, workflowId));
    const mappedHooks = hooks.map((hook) => this.toLifecycleHook(workflowId, hook));

    if (mappedHooks.length > 0) {
      await tx.insert(lifecycleHooks).values(mappedHooks);
    }
  }

  private async syncDocumentHooks(
    tx: Transaction,
    workflowId: string,
    hooks: WorkflowHookData[] | undefined
  ): Promise<void> {
    if (hooks === undefined) {
      return;
    }

    await tx.delete(documentHooks).where(eq(documentHooks.workflowId, workflowId));
    const mappedHooks = hooks.map((hook) => this.toDocumentHook(workflowId, hook));

    if (mappedHooks.length > 0) {
      await tx.insert(documentHooks).values(mappedHooks);
    }
  }

  private toLifecycleHook(workflowId: string, hook: WorkflowHookData): InsertLifecycleHook {
    return {
      workflowId,
      phase: hook.phase,
      name: hook.name,
      code: hook.code,
      language: hook.language,
      inputKeys: hook.inputKeys,
      outputAlias: hook.outputAlias,
      order: hook.order,
      config: hook.config,
      isEnabled: hook.isEnabled ?? true,
    } as InsertLifecycleHook;
  }

  private toDocumentHook(workflowId: string, hook: WorkflowHookData): InsertDocumentHook {
    return {
      workflowId,
      phase: hook.phase,
      name: hook.name,
      code: hook.code,
      language: hook.language,
      inputKeys: hook.inputKeys,
      outputAlias: hook.outputAlias,
      order: hook.order,
      config: hook.config,
      isEnabled: hook.isEnabled ?? true,
    } as InsertDocumentHook;
  }

  private recordAlias(alias: string | undefined, id: string, aliasMap: Map<string, string>): void {
    if (alias !== undefined && alias !== "") {
      aliasMap.set(alias, id);
    }
  }
}

export const workflowContentIngestService = new WorkflowContentIngestService();

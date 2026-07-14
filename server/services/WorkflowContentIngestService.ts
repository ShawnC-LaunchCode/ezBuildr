import { eq, inArray } from "drizzle-orm";

import { db } from "../db";
import { createLogger } from "../logger";
import { sections, steps, logicRules, transformBlocks, lifecycleHooks, documentHooks } from "../../shared/schema";

import { LIMITS, LimitExceededError } from "../../shared/limits";
import { validateAndNormalizeConfig } from "../utils/stepConfigUtils";

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
type ExistingSection = typeof sections.$inferSelect;

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
  visibleIf?: string;
  repeaterConfig?: Record<string, unknown>;
  defaultValue?: Record<string, unknown>;
}

export interface WorkflowLogicRuleData {
  conditionStepAlias: string;
  conditionStepId?: string;
  operator: string;
  conditionValue: string;
  value?: string;
  targetType: string;
  targetAlias: string;
  targetId?: string;
  action: string;
}

export interface WorkflowTransformBlockData {
  phase: string;
  name: string;
  code: string;
  language: string;
  inputKeys?: string[];
  outputAlias?: string;
  outputKey?: string;
  order?: number;
}

export interface WorkflowHookData {
  phase: string;
  name: string;
  code: string;
  language: string;
  inputKeys?: string[];
  outputAlias?: string;
  order?: number;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface WorkflowSectionData {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  alias?: string;
  visibleIf?: string;
  config?: Record<string, unknown>;
  steps?: WorkflowStepData[];
}

export interface WorkflowContentData {
  title?: string;
  description?: string;
  sections?: WorkflowSectionData[];
  logicRules?: WorkflowLogicRuleData[];
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
  sectionId: string;
  sectionAlreadyExists: boolean;
  aliasState: AliasSyncState;
}

interface StepUpsertContext {
  tx: Transaction;
  workflowId: string;
  sectionId: string;
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
      config = validateAndNormalizeConfig(stepData.type, config as any);
    } catch (err: any) {
      createLogger({ module: 'ingest-service' }).warn(
        { stepType: stepData.type, workflowId, error: err.message },
        "Step config validation failed during ingest"
      );
    }
  }

  return config;
}

function normalizeContent(data: WorkflowContentData): WorkflowContentData {
  const normalizedData = JSON.parse(JSON.stringify(data)) as WorkflowContentData;

  normalizedData.sections ??= [];
  normalizedData.logicRules ??= [];
  normalizedData.transformBlocks ??= [];

  normalizeWorkflowTypes(normalizedData as unknown as AIGeneratedWorkflow);
  validateWorkflowStructure(normalizedData as unknown as AIGeneratedWorkflow);

  // Aggregate size caps (ICW-11): the deep-update path replaces the whole
  // workflow, so enforce the same ceilings the incremental path checks.
  const sectionCount = normalizedData.sections?.length ?? 0;
  if (sectionCount > LIMITS.MAX_SECTIONS_PER_WORKFLOW) {
    throw new LimitExceededError(
      `Section limit reached (${LIMITS.MAX_SECTIONS_PER_WORKFLOW} per workflow)`
    );
  }
  const stepCount = (normalizedData.sections ?? []).reduce(
    (sum, section) => sum + (section.steps?.length ?? 0),
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
      const existingSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.workflowId, workflowId));

      const aliasState = await this.buildAliasState(tx, workflowId);
      const incomingSectionIds = await this.syncSections(
        tx,
        workflowId,
        normalizedData.sections ?? [],
        existingSections,
        aliasState
      );

      await this.deleteMissingSections(tx, existingSections, incomingSectionIds);
      await this.syncLogicRules(tx, workflowId, normalizedData.logicRules ?? [], aliasState.aliasMap);
      await this.syncTransformBlocks(tx, workflowId, normalizedData.transformBlocks ?? []);
      await this.syncLifecycleHooks(tx, workflowId, normalizedData.lifecycleHooks);
      await this.syncDocumentHooks(tx, workflowId, normalizedData.documentHooks);
    };

    if (options.tx) {
      return runner(options.tx);
    }
    return db.transaction(runner);
  }

  private async buildAliasState(tx: Transaction, workflowId: string): Promise<AliasSyncState> {
    const existingWorkflowSteps = await tx
      .select({
        id: steps.id,
        alias: steps.alias,
      })
      .from(steps)
      .innerJoin(sections, eq(steps.sectionId, sections.id))
      .where(eq(sections.workflowId, workflowId));

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

  private async syncSections(
    tx: Transaction,
    workflowId: string,
    sectionDataList: WorkflowSectionData[],
    existingSections: ExistingSection[],
    aliasState: AliasSyncState
  ): Promise<Set<string>> {
    const existingSectionIds = new Set(existingSections.map((section) => section.id));
    const incomingSectionIds = new Set<string>();

    for (const [index, sectionData] of sectionDataList.entries()) {
      sectionData.order ??= index;
      const sectionId = await this.upsertSection(
        tx,
        workflowId,
        sectionData,
        existingSectionIds,
        incomingSectionIds
      );

      this.recordAlias(sectionData.id, sectionId, aliasState.aliasMap);
      this.recordAlias(sectionData.alias, sectionId, aliasState.aliasMap);
      await this.syncSteps({
        tx,
        workflowId,
        sectionId,
        sectionAlreadyExists: existingSectionIds.has(sectionId),
        aliasState,
      }, sectionData.steps ?? []);
    }

    return incomingSectionIds;
  }

  private async upsertSection(
    tx: Transaction,
    workflowId: string,
    sectionData: WorkflowSectionData,
    existingSectionIds: Set<string>,
    incomingSectionIds: Set<string>
  ): Promise<string> {
    const existingId = sectionData.id;
    const isExisting = existingId !== undefined && existingId !== null && existingSectionIds.has(existingId);

    if (isExisting) {
      incomingSectionIds.add(existingId);
      await tx
        .update(sections)
        .set({
          title: sectionData.title,
          description: sectionData.description,
          order: sectionData.order,
          visibleIf: sectionData.visibleIf,
        })
        .where(eq(sections.id, existingId));
      return existingId;
    }

    const [newSection] = await tx
      .insert(sections)
      .values({
        workflowId,
        title: sectionData.title ?? "Untitled",
        description: sectionData.description ?? null,
        order: sectionData.order ?? 0,
        visibleIf: sectionData.visibleIf as unknown as Record<string, unknown>,
        config: sectionData.config ?? {},
      })
      .returning();

    if (newSection === undefined) {
      throw new Error("Failed to create section while applying workflow content");
    }

    return newSection.id;
  }

  private async syncSteps(context: StepSyncContext, stepDataList: WorkflowStepData[]): Promise<void> {
    const existingStepIds = context.sectionAlreadyExists
      ? await this.getExistingStepIds(context.tx, context.sectionId)
      : new Set<string>();
    const incomingStepIds = new Set<string>();
    const upsertContext: StepUpsertContext = {
      tx: context.tx,
      workflowId: context.workflowId,
      sectionId: context.sectionId,
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

    if (context.sectionAlreadyExists) {
      await this.deleteMissingSteps(context.tx, existingStepIds, incomingStepIds);
    }
  }

  private async getExistingStepIds(tx: Transaction, sectionId: string): Promise<Set<string>> {
    const dbSteps = await tx.select({ id: steps.id }).from(steps).where(eq(steps.sectionId, sectionId));
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
    const config = normalizeStepConfig(stepData, context.workflowId);

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
        sectionId: context.sectionId,
        alias,
        visibleIf: stepData.visibleIf,
        repeaterConfig: stepData.repeaterConfig,
        defaultValue: stepData.defaultValue,
      }).where(eq(steps.id, existingId));
      return existingId;
    }

    const [newStep] = await context.tx.insert(steps).values({
      workflowId: context.workflowId,
      sectionId: context.sectionId,
      type: stepData.type as InsertStep["type"],
      title: stepData.title,
      description: stepData.description,
      required: stepData.required ?? false,
      config,
      order: stepData.order ?? stepIndex,
      alias,
      visibleIf: stepData.visibleIf,
      repeaterConfig: stepData.repeaterConfig,
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

  private async deleteMissingSections(
    tx: Transaction,
    existingSections: ExistingSection[],
    incomingSectionIds: Set<string>
  ): Promise<void> {
    const sectionsToDelete = existingSections
      .map((section) => section.id)
      .filter((id) => !incomingSectionIds.has(id));

    if (sectionsToDelete.length > 0) {
      await tx.delete(sections).where(inArray(sections.id, sectionsToDelete));
    }
  }

  private async deleteMissingSteps(
    tx: Transaction,
    existingStepIds: Set<string>,
    incomingStepIds: Set<string>
  ): Promise<void> {
    const stepsToDelete = [...existingStepIds].filter((id) => !incomingStepIds.has(id));
    if (stepsToDelete.length > 0) {
      await tx.delete(steps).where(inArray(steps.id, stepsToDelete));
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
        const conditionStepId = aliasMap.get(rule.conditionStepAlias) ?? rule.conditionStepId;
        const targetId = aliasMap.get(rule.targetAlias) ?? rule.targetId;
        if (!isPresent(conditionStepId) || !isPresent(targetId)) {
          return null;
        }

        const targetFields = rule.targetType === "section"
          ? { targetSectionId: targetId, targetStepId: null }
          : { targetSectionId: null, targetStepId: targetId };

        return {
          workflowId,
          conditionStepId,
          operator: rule.operator,
          conditionValue: rule.value ?? rule.conditionValue,
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

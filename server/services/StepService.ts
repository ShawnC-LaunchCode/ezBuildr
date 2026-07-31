import { LIMITS, LimitExceededError } from "@shared/limits";
import { type Step, type InsertStep } from "@shared/schema";
import type { StepConfig , ChoiceOption } from "@shared/types/stepConfigs";

import { logger } from "../logger";
import { validateAndNormalizeConfig } from "../utils/stepConfigUtils";
import { stepRepository, sectionRepository, stepValueRepository, logicRuleRepository, type DeleteImpact , DbTransaction } from "../repositories";
import { db } from "../db";

import { aliasRenameService } from "./AliasRenameService";
import { generateAliasCopy, generateAliasFromLabel, generateUniqueAliasFromTaken, validateAliasFormat } from "./stepAlias";
import { workflowService } from "./WorkflowService";




const SECTION_NOT_FOUND = "Section not found";
const STEP_NOT_FOUND = "Step not found";


type CreateStepData = Omit<InsertStep, 'sectionId' | 'workflowId' | 'order'> & Partial<Pick<InsertStep, 'order'>>;
export { generateAliasFromLabel, generateUniqueAliasFromTaken };

/**
 * Service layer for step-related business logic
 */
/**
 * Static choice options live in two shapes: a bare array (legacy) or
 * `{ type: 'static', options: [...] }`. Both are read here so the callers stay
 * free of `any` casts; anything else (dynamic/list-backed configs) yields [].
 */
function extractChoiceOptions(config: unknown): ChoiceOption[] {
  if (typeof config !== 'object' || config === null) { return []; }
  const options = (config as { options?: unknown }).options;
  if (Array.isArray(options)) { return options as ChoiceOption[]; }
  if (typeof options === 'object' && options !== null) {
    const nested = options as { type?: unknown; options?: unknown };
    if (nested.type === 'static' && Array.isArray(nested.options)) {
      return nested.options as ChoiceOption[];
    }
  }
  return [];
}

const CHOICE_STEP_TYPES = new Set(['choice', 'radio', 'multiple_choice']);

/**
 * Map every option whose saved value changed, keyed old -> new. Matched by
 * option `id`, which survives a rename; the alias is precisely what does not.
 * Returns an empty map when either side has no static options, so a
 * list-backed config is a no-op rather than a spurious rewrite.
 */
function diffChoiceOptionAliases(oldConfig: unknown, newConfig: unknown): Map<string, string> {
  const changes = new Map<string, string>();
  const oldOptions = extractChoiceOptions(oldConfig);
  const newOptions = extractChoiceOptions(newConfig);
  if (oldOptions.length === 0 || newOptions.length === 0) { return changes; }

  for (const oldOpt of oldOptions) {
    const newOpt = newOptions.find(o => o.id === oldOpt.id);
    if (!newOpt) { continue; }
    const oldAlias = oldOpt.alias ?? oldOpt.id;
    const newAlias = newOpt.alias ?? newOpt.id;
    if (oldAlias !== newAlias) { changes.set(oldAlias, newAlias); }
  }
  return changes;
}

export class StepService {
  private stepRepo: typeof stepRepository;
  private sectionRepo: typeof sectionRepository;
  private workflowSvc: typeof workflowService;
  private stepValueRepo: typeof stepValueRepository;

  constructor(
    stepRepo?: typeof stepRepository,
    sectionRepo?: typeof sectionRepository,
    workflowSvc?: typeof workflowService,
    stepValueRepo?: typeof stepValueRepository
  ) {
    this.stepRepo = stepRepo ?? stepRepository;
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
    this.stepValueRepo = stepValueRepo ?? stepValueRepository;
  }



  /** All aliases in a workflow, lowercased for case-insensitive comparison */
  private async getWorkflowAliases(workflowId: string, tx?: DbTransaction): Promise<Set<string>> {
    const sections = await this.sectionRepo.findByWorkflowId(workflowId, tx);
    const allSteps = await this.stepRepo.findBySectionIds(sections.map((s) => s.id), tx, true);
    return new Set(
      allSteps
        .map((s) => s.alias?.toLowerCase())
        .filter((a): a is string => a !== undefined && a !== null && a !== '')
    );
  }

  /**
   * Generate a unique alias from a question label, suffixing with a number
   * when the base name is taken (clientName, clientName2, ...)
   */
  private async generateUniqueAlias(workflowId: string, label: string, tx?: DbTransaction): Promise<string | null> {
    const taken = await this.getWorkflowAliases(workflowId, tx);
    return generateUniqueAliasFromTaken(label, taken);
  }

  /**
   * Follow-the-label: while the alias is empty or still tracks the previous
   * label's auto-generated name, regenerate it when the label changes.
   * A customized alias is never touched. Returns the new alias or null.
   */
  private async maybeRegenerateAlias(
    workflowId: string,
    step: Step,
    data: Partial<InsertStep>,
    tx?: DbTransaction
  ): Promise<string | null> {
    if (data.title === undefined || data.title === step.title || data.alias !== undefined) {
      return null;
    }

    const previousAuto = generateAliasFromLabel(step.title);
    const isAutoDerived = (alias: string, base: string): boolean =>
      alias === base || (alias.startsWith(base) && /^\d+$/.test(alias.slice(base.length)));
    const followsLabel =
      !step.alias || (previousAuto !== null && isAutoDerived(step.alias, previousAuto));

    if (!followsLabel) {
      return null;
    }
    return this.generateUniqueAlias(workflowId, data.title, tx);
  }

  /**
   * Validate that an alias is unique within a workflow
   */
  private async validateAliasUniqueness(
    workflowId: string,
    alias: string | null | undefined,
    excludeStepId?: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Skip validation if alias is null/undefined/empty
    if (!alias || alias.trim() === '') {
      return;
    }

    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId, tx);
    const sectionIds = sections.map(s => s.id);

    // Get all steps for these sections
    const allSteps = await this.stepRepo.findBySectionIds(sectionIds, tx, true);

    // Check if alias is already used by another step
    const conflictingStep = allSteps.find(
      s => s.alias?.toLowerCase() === alias.toLowerCase() && s.id !== excludeStepId
    );

    if (conflictingStep) {
      // Duplicate alias is a client input error (400), not a server fault:
      // classifyRouteError honors statusCode and preserves this message.
      throw Object.assign(
        new Error(
          `Alias "${alias}" is already in use by another step in this workflow. Please choose a unique alias.`
        ),
        { statusCode: 400 }
      );
    }
  }

  /**
   * Create a new step
   */
  async createStep(
    workflowId: string,
    sectionId: string,
    userId: string,
    data: CreateStepData
  ): Promise<Step> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    const currentCount = await this.stepRepo.countByWorkflowId(workflowId);
    if (currentCount >= LIMITS.MAX_STEPS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Question limit reached (${LIMITS.MAX_STEPS_PER_WORKFLOW} per workflow)`
      );
    }

    let finalConfig = data.config;
    if (finalConfig) {
      try {
        // Enforce strict validation
        finalConfig = validateAndNormalizeConfig(data.type, finalConfig as StepConfig, { strict: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          { stepType: data.type, workflowId, error: message },
          "Step config validation failed during creation"
        );
        throw new Error(`Validation error: ${message}`);
      }
    }

    // Validate alias if provided; otherwise auto-generate one from the
    // question label so the step's answer is available to documents
    // (steps without an alias are excluded from document data entirely)
    let alias = data.alias;
    if (alias) {
      validateAliasFormat(alias);
      await this.validateAliasUniqueness(workflowId, alias);
    } else if (data.title) {
      alias = await this.generateUniqueAlias(workflowId, data.title);
    }

    // Get current steps to determine next order
    const existingSteps = await this.stepRepo.findBySectionId(sectionId);
    const nextOrder = existingSteps.length > 0
      ? Math.max(...existingSteps.map((s) => s.order)) + 1
      : 1;

    // Strip client-controlled identity fields before the spread: `id` would
    // let a client pick the primary key, and `isVirtual` is owned by the
    // transform-block machinery (which creates virtual steps via the repo
    // directly, never through this public create path).
    const { id: _ignoredId, isVirtual: _ignoredVirtual, ...safeData } = data;
    return this.stepRepo.create({
      ...safeData,
      config: finalConfig,
      alias,
      workflowId,
      sectionId,
      order: data.order ?? nextOrder,
      // Server-controlled: never let a client-supplied value mark a
      // freshly created step as already soft-deleted (ICW2-B1).
      deletedAt: null,
    });
  }

  /**
   * Duplicate a single step into the same section, immediately after the
   * source (later siblings in the section shift by one to make room;
   * ICW2-B5). Mints a fresh unique alias (`<alias>_copy`, `_copy2`, ...)
   * rather than copying verbatim — unlike the whole-workflow cloner, this
   * targets the *same* workflow, so a verbatim alias would collide with the
   * `(workflowId, lower(alias))` unique index.
   */
  async duplicateStep(stepId: string, userId: string): Promise<Step> {
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');

    const currentCount = await this.stepRepo.countByWorkflowId(section.workflowId);
    if (currentCount >= LIMITS.MAX_STEPS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Question limit reached (${LIMITS.MAX_STEPS_PER_WORKFLOW} per workflow)`
      );
    }

    const taken = await this.getWorkflowAliases(section.workflowId);
    const alias = step.alias ? generateAliasCopy(step.alias, taken) : null;

    return db.transaction(async (tx) => {
      // Shift every later sibling (including virtual/computed steps, so their
      // order never collides with the inserted copy) down by one.
      const siblings = await this.stepRepo.findBySectionId(step.sectionId, tx, true);
      const toShift = siblings.filter((s) => s.order > step.order);
      for (const sibling of toShift) {
        await this.stepRepo.updateOrder(sibling.id, step.sectionId, sibling.order + 1, tx);
      }

      return this.stepRepo.create(
        {
          workflowId: section.workflowId,
          sectionId: step.sectionId,
          type: step.type,
          title: step.title,
          description: step.description,
          required: step.required,
          config: step.config,
          alias,
          defaultValue: step.defaultValue,
          order: step.order + 1,
          isVirtual: step.isVirtual,
          visibleIf: step.visibleIf,
          repeaterConfig: step.repeaterConfig,
        },
        tx
      );
    });
  }

  /**
   * Resolve append order for cross-section move
   */
  private async resolveCrossSectionOrder(sectionId: string, tx?: DbTransaction): Promise<number> {
    const destSteps = await this.stepRepo.findBySectionId(sectionId, tx);
    return destSteps.length > 0 ? Math.max(...destSteps.map((s) => s.order)) + 1 : 1;
  }

  private validateConfigForUpdate(typeToValidate: string, workflowId: string, finalConfig: unknown): unknown {
    try {
      // Enforce strict validation
      return validateAndNormalizeConfig(typeToValidate, finalConfig as StepConfig, { strict: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { stepType: typeToValidate, workflowId, error: message },
        "Step config validation failed during update"
      );
      throw new Error(`Validation error: ${message}`);
    }
  }

  private async handleAliasRenamePropagation(workflowId: string, stepId: string, oldAlias: string | null, newAlias: string | null, tx?: DbTransaction): Promise<void> {
    if (oldAlias && newAlias && oldAlias !== newAlias) {
      try {
        await aliasRenameService.propagateRename(workflowId, oldAlias, newAlias, tx);
      } catch (error) {
        logger.error(
          { error, workflowId, stepId, oldAlias, newAlias },
          'Alias rename propagation failed; references may still use the old name'
        );
      }
    }
  }

  /**
   * Update step
   */
  async updateStep(
    stepId: string,
    workflowId: string,
    userId: string,
    data: Partial<InsertStep>
  ): Promise<Step & { warnings?: string[] }> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Run the entire update in a transaction
    return db.transaction(async (tx) => {
      const step = await this.stepRepo.findById(stepId, tx);
      if (!step) {
        throw new Error(STEP_NOT_FOUND);
      }

      // Verify step's section belongs to workflow
      const section = await this.sectionRepo.findById(step.sectionId, tx);
      if (!section || section.workflowId !== workflowId) {
        throw new Error("Step not found in this workflow");
      }

      // If sectionId is being changed, validate new section belongs to same workflow
      if (data.sectionId && data.sectionId !== step.sectionId) {
        const newSection = await this.sectionRepo.findById(data.sectionId, tx);
        if (!newSection || newSection.workflowId !== workflowId) {
          throw new Error("Cannot move step to a section in a different workflow");
        }

        // If moving across sections and no explicit order provided, append to end of new section
        if (data.order === undefined) {
          data.order = await this.resolveCrossSectionOrder(data.sectionId, tx);
        }
      }

      // Validate alias format + uniqueness if alias is being changed
      // (existing aliases are grandfathered until edited)
      if (data.alias !== undefined && data.alias !== step.alias) {
        if (data.alias) {
          validateAliasFormat(data.alias);
        }
        await this.validateAliasUniqueness(workflowId, data.alias, stepId, tx);
      }

      const updates = { ...data };
      delete updates.workflowId;
      delete updates.id;
      delete updates.isVirtual;
      delete updates.createdAt;
      delete updates.updatedAt;
      delete updates.deletedAt;

      const finalConfig = data.config;
      let aliasChanges = new Map<string, string>();

      if (finalConfig) {
        const typeToValidate = data.type ?? step.type;
        updates.config = this.validateConfigForUpdate(typeToValidate, workflowId, finalConfig);

        // If step is a choice type, compute alias diff for logic rules
        if (CHOICE_STEP_TYPES.has(typeToValidate)) {
          aliasChanges = diffChoiceOptionAliases(step.config, updates.config);
        }
      }

      const regenerated = await this.maybeRegenerateAlias(workflowId, step, data, tx);
      if (regenerated !== null) {
        updates.alias = regenerated;
      }

      const updated = await this.stepRepo.update(stepId, updates, tx);

      // Propagate choice option alias changes
      let warnings: string[] = [];
      if (aliasChanges.size > 0) {
        warnings = await this.propagateChoiceOptionRenames(stepId, workflowId, aliasChanges, tx);
      }

      // Propagate the rename to workflow-scoped references
      await this.handleAliasRenamePropagation(workflowId, stepId, step.alias, updated.alias, tx);

      return warnings.length > 0 ? { ...updated, warnings } : updated;
    });
  }

  /**
   * Delete step (soft-delete — ICW2-B1). `deletedAt` is set instead of a
   * hard `DELETE`, so the `step_values.step_id` cascade never fires and
   * respondent answers survive. See `restoreStep` to undo.
   */
  async deleteStep(stepId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Verify step's section belongs to workflow
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== workflowId) {
      throw new Error("Step not found in this workflow");
    }

    await this.stepRepo.softDelete(stepId);
  }

  /**
   * Restore a soft-deleted step (ICW2-B1). Uses an unscoped lookup since the
   * step's `deletedAt` is set, so the filtered `findById` cannot see it.
   * Restore UI is deferred — this is server-side only.
   */
  async restoreStep(stepId: string, userId: string): Promise<Step> {
    const step = await this.stepRepo.findByIdIncludingDeleted(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(step.workflowId, userId, 'edit');

    const restored = await this.stepRepo.restore(stepId);
    if (!restored) {
      throw new Error(STEP_NOT_FOUND);
    }
    return restored;
  }

  /**
   * Impact of deleting a step: answers + distinct runs that would be
   * permanently destroyed via the step_values cascade. Read-only — gates
   * the client's destructive-confirm dialog (ICW2-13). The counting logic
   * lives in StepValueRepository so ICW2-B1 (soft-delete) can reuse it.
   */
  async getStepDeleteImpact(stepId: string, workflowId: string, userId: string): Promise<DeleteImpact> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Verify step's section belongs to workflow
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== workflowId) {
      throw new Error("Step not found in this workflow");
    }

    return this.stepValueRepo.countImpactForSteps([stepId]);
  }

  /**
   * Impact of deleting a step (workflow looked up automatically).
   */
  async getStepDeleteImpactById(stepId: string, userId: string): Promise<DeleteImpact> {
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.getStepDeleteImpact(stepId, section.workflowId, userId);
  }

  /**
   * Reorder steps within a section
   */
  async reorderSteps(
    workflowId: string,
    sectionId: string,
    userId: string,
    stepOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Update each step's order
    await db.transaction(async (tx) => {
      for (const { id, order } of stepOrders) {
        await this.stepRepo.updateOrder(id, sectionId, order, tx);
      }
    });
  }

  /**
   * Get steps for a section
   */
  async getSteps(workflowId: string, sectionId: string, userId: string): Promise<Step[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.stepRepo.findBySectionId(sectionId);
  }

  async verifyWorkflowAccess(workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'view');
  }

  async getWorkflowSteps(workflowId: string): Promise<Step[]> {
    return this.stepRepo.findByWorkflowIdWithAliases(workflowId);
  }

  // ===================================================================
  // SIMPLIFIED METHODS (automatically look up workflowId from section/step)
  // ===================================================================

  /**
   * Get steps for a section (workflow looked up automatically)
   */
  async getStepsBySectionId(sectionId: string, userId: string): Promise<Step[]> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.getSteps(section.workflowId, sectionId, userId);
  }

  /**
   * Get steps for a section without ownership check
   * Used for preview/run token authentication
   * Validates that the section belongs to the expected workflow
   */
  async getStepsBySectionIdNoAuth(sectionId: string, expectedWorkflowId: string): Promise<Step[]> {
    // Look up the section
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Verify the section belongs to the expected workflow
    if (section.workflowId !== expectedWorkflowId) {
      throw new Error("Section does not belong to the specified workflow");
    }

    return this.stepRepo.findBySectionId(sectionId);
  }

  /**
   * Create a new step (workflow looked up automatically)
   */
  async createStepBySectionId(
    sectionId: string,
    userId: string,
    data: CreateStepData
  ): Promise<Step> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.createStep(section.workflowId, sectionId, userId, data);
  }

  /**
   * Reorder steps (workflow looked up automatically)
   */
  async reorderStepsBySectionId(
    sectionId: string,
    userId: string,
    stepOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    await this.reorderSteps(section.workflowId, sectionId, userId, stepOrders);
  }

  /**
   * Update a step (workflow looked up automatically)
   */
  async updateStepById(
    stepId: string,
    userId: string,
    data: Partial<InsertStep>
  ): Promise<Step & { warnings?: string[] }> {
    // Look up the step to get its section
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    return this.updateStep(stepId, section.workflowId, userId, data);
  }

  public async propagateChoiceOptionRenames(stepId: string, workflowId: string, aliasChanges: Map<string, string>, tx: DbTransaction): Promise<string[]> {
    const warnings: string[] = [];

    // 1. Rewrite logic_rules
    const rules = await logicRuleRepository.findByConditionStepId(stepId, tx);
    for (const rule of rules) {
      let changed = false;
      let newValue = rule.conditionValue;

      if (Array.isArray(newValue)) {
        newValue = newValue.map((val: unknown) => {
          if (typeof val === 'string' && aliasChanges.has(val)) {
            changed = true;
            return aliasChanges.get(val);
          }
          return val;
        });
      } else if (typeof newValue === 'string' && aliasChanges.has(newValue)) {
        changed = true;
        newValue = aliasChanges.get(newValue);
      }

      if (changed) {
        await logicRuleRepository.update(rule.id, { conditionValue: newValue }, tx);
      }
    }

    // 2. Scan visibleIf across all steps and sections for warnings
    const steps = await this.stepRepo.findByWorkflowId(workflowId, tx);
    const sections = await this.sectionRepo.findByWorkflowId(workflowId, tx);

    const checkVisibleIf = (visibleIf: unknown, sourceName: string): void => {
      if (!visibleIf) {return;}
      const str = JSON.stringify(visibleIf);
      for (const [oldAlias] of aliasChanges.entries()) {
        if (str.includes(`"${oldAlias}"`)) {
          warnings.push(`Warning: ${sourceName} has a visibility rule that may depend on the renamed option '${oldAlias}'. Please update it manually.`);
        }
      }
    };

    for (const s of steps) {
      if (s.id !== stepId) {checkVisibleIf(s.visibleIf, `Step "${s.title}"`);}
    }
    for (const s of sections) {
      checkVisibleIf(s.visibleIf, `Section "${s.title}"`);
    }

    return warnings;
  }

  /**
   * Delete a step (workflow looked up automatically)
   */
  async deleteStepById(stepId: string, userId: string): Promise<void> {
    // Look up the step to get its section
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Use the existing method with the workflowId
    await this.deleteStep(stepId, section.workflowId, userId);
  }

  /**
   * Get a step by ID (workflow looked up automatically)
   */
  async getStepById(stepId: string, userId: string): Promise<Step> {
    // Look up the step
    const step = await this.stepRepo.findById(stepId);
    if (!step) {
      throw new Error(STEP_NOT_FOUND);
    }

    // Look up the section to get its workflowId
    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Verify ownership
    await this.workflowSvc.verifyAccess(section.workflowId, userId);

    return step;
  }
}

// Singleton instance
export const stepService = new StepService();

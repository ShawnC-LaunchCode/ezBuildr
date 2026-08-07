import { LIMITS, LimitExceededError } from "@shared/limits";
import type { Section, InsertSection, Step } from "@shared/schema";
import { db } from "../db";

import {
  sectionRepository,
  workflowRepository,
  stepRepository,
  stepValueRepository,
  logicRuleRepository,
  type DeleteImpact,
  type DbTransaction,
} from "../repositories";

import { remapJsonIds } from "../utils/remapJsonIds";

import { generateAliasCopy } from "./stepAlias";
import { workflowService } from "./WorkflowService";

const SECTION_NOT_FOUND = "Section not found";

/** `order` is optional at the API boundary — the service auto-increments it. */
type CreateSectionData = Omit<InsertSection, 'workflowId' | 'order'> & Partial<Pick<InsertSection, 'order'>>;

/**
 * Constructor dependencies for {@link SectionService}, grouped into a single
 * object so adding a repo (e.g. `logicRuleRepo` for ICW2-B5) never trips the
 * `max-params` lint rule. All fields are optional and default to the
 * production singletons; tests override just what they need to mock.
 */
export interface SectionServiceDeps {
  sectionRepo?: typeof sectionRepository;
  workflowRepo?: typeof workflowRepository;
  stepRepo?: typeof stepRepository;
  workflowSvc?: typeof workflowService;
  stepValueRepo?: typeof stepValueRepository;
  logicRuleRepo?: typeof logicRuleRepository;
}

/**
 * Service layer for section-related business logic
 */
export class SectionService {
  private sectionRepo: typeof sectionRepository;
  private workflowRepo: typeof workflowRepository;
  private stepRepo: typeof stepRepository;
  private workflowSvc: typeof workflowService;
  private stepValueRepo: typeof stepValueRepository;
  private logicRuleRepo: typeof logicRuleRepository;

  constructor(deps: SectionServiceDeps = {}) {
    this.sectionRepo = deps.sectionRepo ?? sectionRepository;
    this.workflowRepo = deps.workflowRepo ?? workflowRepository;
    this.stepRepo = deps.stepRepo ?? stepRepository;
    this.workflowSvc = deps.workflowSvc ?? workflowService;
    this.stepValueRepo = deps.stepValueRepo ?? stepValueRepository;
    this.logicRuleRepo = deps.logicRuleRepo ?? logicRuleRepository;
  }

  /**
   * Create a new section
   */
  async createSection(
    workflowId: string,
    userId: string,
    data: CreateSectionData
  ): Promise<Section> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Get current sections to determine next order
    const existingSections = await this.sectionRepo.findByWorkflowId(workflowId);
    if (existingSections.length >= LIMITS.MAX_SECTIONS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Section limit reached (${LIMITS.MAX_SECTIONS_PER_WORKFLOW} per workflow)`
      );
    }
    const nextOrder = existingSections.length > 0
      ? Math.max(...existingSections.map((s) => s.order)) + 1
      : 1;

    // Strip a client-supplied `id` so the server owns the primary key.
    const { id: _ignoredId, ...safeData } = data;
    return this.sectionRepo.create({
      ...safeData,
      workflowId,
      order: data.order ?? nextOrder,
      // Server-controlled: never let a client-supplied value mark a
      // freshly created section as already soft-deleted (ICW2-B1).
      deletedAt: null,
    });
  }

  /** All aliases in a workflow, lowercased for case-insensitive comparison */
  private async getWorkflowAliases(workflowId: string): Promise<Set<string>> {
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId, undefined, true);
    return new Set(
      allSteps
        .map((s) => s.alias?.toLowerCase())
        .filter((a): a is string => a !== undefined && a !== null && a !== '')
    );
  }

  /**
   * Copy the logic rules scoped to a duplicated section: rules whose
   * condition step, target step, or target section belongs to the source
   * section, remapped onto the freshly duplicated ids. Rules referencing a
   * condition step outside the section are skipped (that step was not
   * duplicated, so there is no valid id to remap the condition onto).
   */
  private async copySectionLogicRules(
    tx: DbTransaction,
    workflowId: string,
    sourceSectionId: string,
    sourceSteps: Step[],
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceStepIds = new Set(sourceSteps.map((s) => s.id));
    const allRules = await this.logicRuleRepo.findByWorkflowId(workflowId, tx);
    const relevantRules = allRules.filter(
      (rule) =>
        sourceStepIds.has(rule.conditionStepId) ||
        rule.targetSectionId === sourceSectionId ||
        (rule.targetStepId !== null && sourceStepIds.has(rule.targetStepId))
    );

    for (const rule of relevantRules) {
      const conditionStepId = idMap.get(rule.conditionStepId);
      if (!conditionStepId) {
        continue;
      }
      await this.logicRuleRepo.create(
        {
          workflowId,
          conditionStepId,
          when: remapJsonIds(rule.when, idMap),
          targetType: rule.targetType,
          targetStepId: rule.targetStepId ? idMap.get(rule.targetStepId) ?? null : null,
          targetSectionId: rule.targetSectionId ? idMap.get(rule.targetSectionId) ?? null : null,
          action: rule.action,
          order: rule.order,
        },
        tx
      );
    }
  }

  /**
   * Duplicate a section: the section itself, all of its steps (each with a
   * fresh unique alias), and its section-scoped logic rules with ids
   * remapped onto the copies (ICW2-B5). Inserted immediately after the
   * source (later siblings shift by one).
   */
  async duplicateSection(sectionId: string, userId: string): Promise<Section> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');

    const existingSections = await this.sectionRepo.findByWorkflowId(section.workflowId);
    if (existingSections.length >= LIMITS.MAX_SECTIONS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Section limit reached (${LIMITS.MAX_SECTIONS_PER_WORKFLOW} per workflow)`
      );
    }

    // Include virtual (computed) steps too — duplicating the section duplicates all of them.
    const sourceSteps = await this.stepRepo.findBySectionId(sectionId, undefined, true);

    const currentStepCount = await this.stepRepo.countByWorkflowId(section.workflowId);
    if (currentStepCount + sourceSteps.length > LIMITS.MAX_STEPS_PER_WORKFLOW) {
      throw new LimitExceededError(
        `Question limit reached (${LIMITS.MAX_STEPS_PER_WORKFLOW} per workflow)`
      );
    }

    const taken = await this.getWorkflowAliases(section.workflowId);

    return db.transaction(async (tx) => {
      const toShift = existingSections.filter((s) => s.order > section.order);
      for (const sibling of toShift) {
        await this.sectionRepo.updateOrder(sibling.id, section.workflowId, sibling.order + 1, tx);
      }

      const newSection = await this.sectionRepo.create(
        {
          workflowId: section.workflowId,
          title: section.title,
          description: section.description,
          order: section.order + 1,
          config: section.config,
          visibleIf: section.visibleIf,
          skipIf: section.skipIf,
        },
        tx
      );

      const idMap = new Map<string, string>([[sectionId, newSection.id]]);

      for (const step of sourceSteps) {
        const alias = step.alias ? generateAliasCopy(step.alias, taken) : null;
        if (alias) {
          taken.add(alias.toLowerCase());
        }
        const newStep = await this.stepRepo.create(
          {
            workflowId: section.workflowId,
            sectionId: newSection.id,
            type: step.type,
            title: step.title,
            description: step.description,
            required: step.required,
            config: step.config,
            alias,
            defaultValue: step.defaultValue,
            order: step.order,
            isVirtual: step.isVirtual,
            visibleIf: step.visibleIf,
          },
          tx
        );
        idMap.set(step.id, newStep.id);
      }

      await this.copySectionLogicRules(tx, section.workflowId, sectionId, sourceSteps, idMap);

      return newSection;
    });
  }

  /**
   * Strip server-controlled / immutable fields from a general update payload
   * to prevent mass-assignment. A section never moves between workflows, so a
   * client-supplied `workflowId` would reparent the section (and its steps)
   * into an arbitrary workflow — including one in another tenant — past the
   * access check, which only authorizes the section's *current* workflow.
   * `id` would rewrite the primary key. `deletedAt` is only ever set/cleared
   * by the dedicated delete/restore flows (ICW2-B1).
   */
  private static stripImmutableFields(data: Partial<InsertSection>): Partial<InsertSection> {
    const updates = { ...data };
    delete updates.id;
    delete updates.workflowId;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.deletedAt;
    return updates;
  }

  /**
   * Update section
   */
  async updateSection(
    sectionId: string,
    workflowId: string,
    userId: string,
    data: Partial<InsertSection>
  ): Promise<Section> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.sectionRepo.update(sectionId, SectionService.stripImmutableFields(data));
  }

  /**
   * Delete section (soft-delete — ICW2-B1). Cascades to the section's own
   * steps so they are excluded everywhere too, mirroring the FK cascade a
   * hard delete would have triggered — but without destroying `step_values`.
   * See `restoreSection` to undo.
   */
  async deleteSection(sectionId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await db.transaction(async (tx) => {
      await this.stepRepo.softDeleteBySectionId(sectionId, tx);
      await this.sectionRepo.softDelete(sectionId, tx);
    });
  }

  /**
   * Restore a soft-deleted section and its steps (ICW2-B1). Uses an
   * unscoped lookup since the section's `deletedAt` is set, so the filtered
   * `findById` cannot see it. Restore UI is deferred — this is server-side
   * only.
   */
  async restoreSection(sectionId: string, userId: string): Promise<Section> {
    const section = await this.sectionRepo.findByIdIncludingDeleted(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');

    return db.transaction(async (tx) => {
      await this.stepRepo.restoreBySectionId(sectionId, tx);
      const restored = await this.sectionRepo.restore(sectionId, tx);
      if (!restored) {
        throw new Error(SECTION_NOT_FOUND);
      }
      return restored;
    });
  }

  /**
   * Impact of deleting a section: answers + distinct runs that would be
   * permanently destroyed via the section->steps->step_values cascade.
   * Aggregates counts across every step in the section. Read-only — gates
   * the client's destructive-confirm dialog (ICW2-13).
   */
  async getSectionDeleteImpact(sectionId: string, workflowId: string, userId: string): Promise<DeleteImpact> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    // Include virtual (computed) steps too — deleting the section cascades to all of them.
    const steps = await this.stepRepo.findBySectionId(sectionId, undefined, true);
    return this.stepValueRepo.countImpactForSteps(steps.map((s) => s.id));
  }

  /**
   * Impact of deleting a section (workflow looked up automatically).
   */
  async getSectionDeleteImpactById(sectionId: string, userId: string): Promise<DeleteImpact> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    return this.getSectionDeleteImpact(sectionId, section.workflowId, userId);
  }

  /**
   * Reorder sections
   */
  async reorderSections(
    workflowId: string,
    userId: string,
    sectionOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');

    // Update each section's order
    await db.transaction(async (tx) => {
      for (const { id, order } of sectionOrders) {
        await this.sectionRepo.updateOrder(id, workflowId, order, tx);
      }
    });
  }

  /**
   * Get sections for a workflow
   */
  async getSections(workflowId: string, userId: string): Promise<Section[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);
    return this.sectionRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get sections for a workflow without ownership check
   * Used for preview/run token authentication
   */
  async getSectionsByWorkflowId(workflowId: string): Promise<Section[]> {
    return this.sectionRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get section with steps
   */
  async getSectionWithSteps(sectionId: string, workflowId: string, userId: string): Promise<Section & { steps: Step[] }> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const section = await this.sectionRepo.findByIdAndWorkflow(sectionId, workflowId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    const steps = await this.stepRepo.findBySectionId(sectionId);

    return {
      ...section,
      steps,
    };
  }

  /**
   * Update section by ID only (looks up workflow automatically)
   */
  async updateSectionById(
    sectionId: string,
    userId: string,
    data: Partial<InsertSection>
  ): Promise<Section> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');
    return this.sectionRepo.update(sectionId, SectionService.stripImmutableFields(data));
  }

  /**
   * Delete section by ID only (looks up workflow automatically).
   * Soft-delete — ICW2-B1 — see `deleteSection` for the cascade rationale.
   */
  async deleteSectionById(sectionId: string, userId: string): Promise<void> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error(SECTION_NOT_FOUND);
    }

    await this.workflowSvc.verifyAccess(section.workflowId, userId, 'edit');
    await db.transaction(async (tx) => {
      await this.stepRepo.softDeleteBySectionId(sectionId, tx);
      await this.sectionRepo.softDelete(sectionId, tx);
    });
  }
}

// Singleton instance
export const sectionService = new SectionService();

import { LIMITS, LimitExceededError } from "@shared/limits";
import type { Page, InsertPage, Step } from "@shared/schema";
import {
  pageRepository,
  workflowRepository,
  stepRepository,
  stepValueRepository,
  logicRuleRepository,
  sectionRepository,
  type DeleteImpact,
  type DbTransaction,
} from "../repositories";

import { withCurrentTenant } from "../utils/rlsContext";
import { remapJsonIds } from "../utils/remapJsonIds";

import { generateAliasCopy } from "./stepAlias";
import { assertValidSectionSpans, SectionLayoutError } from "./sectionSpans";
import { workflowService } from "./WorkflowService";
import { isBackwardSkipTarget } from "./workflowStructureRules";

const PAGE_NOT_FOUND = "Page not found";

/** `order` is optional at the API boundary — the service auto-increments it. */
type CreatePageData = Omit<InsertPage, 'workflowId' | 'order'> & Partial<Pick<InsertPage, 'order'>>;

/**
 * A `skip_to` rule that a reorder just turned backward, so it can no longer
 * fire (MAP-B4). Titles are included so the builder can name the rule in a
 * toast without a second round-trip.
 */
export interface ReorderSkipRuleWarning {
  ruleId: string;
  conditionPageId: string;
  conditionPageTitle: string;
  targetPageId: string;
  targetPageTitle: string;
}

/**
 * Constructor dependencies for {@link PageService}, grouped into a single
 * object so adding a repo (e.g. `logicRuleRepo` for ICW2-B5) never trips the
 * `max-params` lint rule. All fields are optional and default to the
 * production singletons; tests override just what they need to mock.
 */
export interface PageServiceDeps {
  pageRepo?: typeof pageRepository;
  workflowRepo?: typeof workflowRepository;
  stepRepo?: typeof stepRepository;
  workflowSvc?: typeof workflowService;
  stepValueRepo?: typeof stepValueRepository;
  logicRuleRepo?: typeof logicRuleRepository;
  sectionRepo?: typeof sectionRepository;
}

/**
 * Service layer for page-related business logic
 */
export class PageService {
  private pageRepo: typeof pageRepository;
  private workflowRepo: typeof workflowRepository;
  private stepRepo: typeof stepRepository;
  private workflowSvc: typeof workflowService;
  private stepValueRepo: typeof stepValueRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private sectionRepo: typeof sectionRepository;

  constructor(deps: PageServiceDeps = {}) {
    this.pageRepo = deps.pageRepo ?? pageRepository;
    this.workflowRepo = deps.workflowRepo ?? workflowRepository;
    this.stepRepo = deps.stepRepo ?? stepRepository;
    this.workflowSvc = deps.workflowSvc ?? workflowService;
    this.stepValueRepo = deps.stepValueRepo ?? stepValueRepository;
    this.logicRuleRepo = deps.logicRuleRepo ?? logicRuleRepository;
    this.sectionRepo = deps.sectionRepo ?? sectionRepository;
  }

  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-5). Reuses a caller-supplied `tx` if given (never nests);
   * otherwise opens exactly one via `withCurrentTenant`.
   *
   * `pages` and `steps` are RLS-covered via the OWNERSHIP-derived policy
   * (they carry no `tenant_id` of their own — the policy resolves the tenant
   * through the parent workflow), which is precisely why this service was
   * missed by the RLS-2 rollout: that rollout scoped itself to services
   * mentioning `tenantId`, and this one never does. Under a non-owner role
   * every page/step write here failed — 84 of the RLS-5 run's violations
   * came through `PageRepository.create` alone.
   *
   * Ambient-only variant (§2c): no method here takes a `tenantId` argument,
   * so there is nothing to cross-check and no mismatch guard to write.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  /**
   * Create a new page
   */
  async createPage(
    workflowId: string,
    userId: string,
    data: CreatePageData,
    tx?: DbTransaction
  ): Promise<Page> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'edit', scopedTx);
      await this.sectionRepo.lockWorkflowStructure(workflowId, scopedTx);

      // Get current pages to determine next order
      const existingPages = await this.pageRepo.findByWorkflowId(workflowId, scopedTx);
      if (existingPages.length >= LIMITS.MAX_PAGES_PER_WORKFLOW) {
        throw new LimitExceededError(
          `Page limit reached (${LIMITS.MAX_PAGES_PER_WORKFLOW} per workflow)`
        );
      }
      const nextOrder = existingPages.length > 0
        ? Math.max(...existingPages.map((s) => s.order)) + 1
        : 1;

      // Strip a client-supplied `id` so the server owns the primary key.
      const {
        id: _ignoredId,
        sectionId: _ignoredSectionId,
        deletedAt: _ignoredDeletedAt,
        createdAt: _ignoredCreatedAt,
        updatedAt: _ignoredUpdatedAt,
        ...safeData
      } = data;
      const page = await this.pageRepo.create({
        ...safeData,
        workflowId,
        order: data.order ?? nextOrder,
        sectionId: null,
        // Server-controlled: never let a client-supplied value mark a
        // freshly created page as already soft-deleted (ICW2-B1).
        deletedAt: null,
      }, scopedTx);
      const persistedPages = await this.pageRepo.findByWorkflowId(workflowId, scopedTx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(workflowId, scopedTx);
      assertValidSectionSpans(persistedPages, workflowSections);
      return page;
    });
  }

  /** All aliases in a workflow, lowercased for case-insensitive comparison */
  private async getWorkflowAliases(workflowId: string, tx?: DbTransaction): Promise<Set<string>> {
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId, tx, true);
    return new Set(
      allSteps
        .map((s) => s.alias?.toLowerCase())
        .filter((a): a is string => a !== undefined && a !== null && a !== '')
    );
  }

  /**
   * Copy the logic rules scoped to a duplicated page: rules whose
   * condition step, target step, or target page belongs to the source
   * page, remapped onto the freshly duplicated ids. Rules referencing a
   * condition step outside the page are skipped (that step was not
   * duplicated, so there is no valid id to remap the condition onto).
   */
  private async copyPageLogicRules(
    tx: DbTransaction,
    workflowId: string,
    sourcePageId: string,
    sourceSteps: Step[],
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceStepIds = new Set(sourceSteps.map((s) => s.id));
    const allRules = await this.logicRuleRepo.findByWorkflowId(workflowId, tx);
    const relevantRules = allRules.filter(
      (rule) =>
        sourceStepIds.has(rule.conditionStepId) ||
        rule.targetPageId === sourcePageId ||
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
          targetPageId: rule.targetPageId ? idMap.get(rule.targetPageId) ?? null : null,
          action: rule.action,
          order: rule.order,
        },
        tx
      );
    }
  }

  /**
   * Duplicate a page: the page itself, all of its steps (each with a
   * fresh unique alias), and its page-scoped logic rules with ids
   * remapped onto the copies (ICW2-B5). Inserted immediately after the
   * source (later siblings shift by one).
   */
  async duplicatePage(pageId: string, userId: string, callerTx?: DbTransaction): Promise<Page> {
    return this.withTx(callerTx, async (tx) => {
      const page = await this.pageRepo.findById(pageId, tx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.workflowSvc.verifyAccess(page.workflowId, userId, 'edit', tx);
      await this.sectionRepo.lockWorkflowStructure(page.workflowId, tx);
      const lockedPage = await this.pageRepo.findById(pageId, tx);
      if (!lockedPage) {
        throw new Error(PAGE_NOT_FOUND);
      }

      const existingPages = await this.pageRepo.findByWorkflowId(lockedPage.workflowId, tx);
      if (existingPages.length >= LIMITS.MAX_PAGES_PER_WORKFLOW) {
        throw new LimitExceededError(
          `Page limit reached (${LIMITS.MAX_PAGES_PER_WORKFLOW} per workflow)`
        );
      }

      // Include virtual (computed) steps too — duplicating the page duplicates all of them.
      const sourceSteps = await this.stepRepo.findByPageId(pageId, tx, true);

      const currentStepCount = await this.stepRepo.countByWorkflowId(lockedPage.workflowId, tx);
      if (currentStepCount + sourceSteps.length > LIMITS.MAX_STEPS_PER_WORKFLOW) {
        throw new LimitExceededError(
          `Question limit reached (${LIMITS.MAX_STEPS_PER_WORKFLOW} per workflow)`
        );
      }

      const taken = await this.getWorkflowAliases(lockedPage.workflowId, tx);

      const insertionOrder = lockedPage.sectionId === null
        ? lockedPage.order + 1
        : Math.max(
          ...existingPages
            .filter((existingPage) => existingPage.sectionId === lockedPage.sectionId)
            .map((existingPage) => existingPage.order),
        ) + 1;
      const toShift = existingPages.filter((s) => s.order >= insertionOrder);
      for (const sibling of toShift) {
        await this.pageRepo.updateOrder(sibling.id, page.workflowId, sibling.order + 1, tx);
      }

      const newPage = await this.pageRepo.create(
        {
          workflowId: lockedPage.workflowId,
          title: lockedPage.title,
          description: lockedPage.description,
          order: insertionOrder,
          sectionId: null,
          config: lockedPage.config,
          visibleIf: lockedPage.visibleIf,
        },
        tx
      );

      const idMap = new Map<string, string>([[pageId, newPage.id]]);

      for (const step of sourceSteps) {
        const alias = step.alias ? generateAliasCopy(step.alias, taken) : null;
        if (alias) {
          taken.add(alias.toLowerCase());
        }
        const newStep = await this.stepRepo.create(
          {
            workflowId: lockedPage.workflowId,
            pageId: newPage.id,
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

      await this.copyPageLogicRules(tx, lockedPage.workflowId, pageId, sourceSteps, idMap);

      const persistedPages = await this.pageRepo.findByWorkflowId(lockedPage.workflowId, tx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(lockedPage.workflowId, tx);
      assertValidSectionSpans(persistedPages, workflowSections);

      return newPage;
    });
  }

  /**
   * Strip server-controlled / immutable fields from a general update payload
   * to prevent mass-assignment. A page never moves between workflows, so a
   * client-supplied `workflowId` would reparent the page (and its steps)
   * into an arbitrary workflow — including one in another tenant — past the
   * access check, which only authorizes the page's *current* workflow.
   * `id` would rewrite the primary key. `deletedAt` is only ever set/cleared
   * by the dedicated delete/restore flows (ICW2-B1).
   */
  private static stripImmutableFields(data: Partial<InsertPage>): Partial<InsertPage> {
    const updates = { ...data };
    delete updates.id;
    delete updates.workflowId;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.deletedAt;
    delete updates.sectionId;
    return updates;
  }

  /**
   * Update page
   */
  async updatePage(
    pageId: string,
    workflowId: string,
    userId: string,
    data: Partial<InsertPage>,
    tx?: DbTransaction
  ): Promise<Page> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'edit', scopedTx);
      await this.sectionRepo.lockWorkflowStructure(workflowId, scopedTx);

      const page = await this.pageRepo.findByIdAndWorkflow(pageId, workflowId, scopedTx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      const updated = await this.pageRepo.update(pageId, PageService.stripImmutableFields(data), scopedTx);
      const activePages = await this.pageRepo.findByWorkflowId(workflowId, scopedTx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(workflowId, scopedTx);
      assertValidSectionSpans(activePages, workflowSections);
      return updated;
    });
  }

  /**
   * Delete page (soft-delete — ICW2-B1). Cascades to the page's own
   * steps so they are excluded everywhere too, mirroring the FK cascade a
   * hard delete would have triggered — but without destroying `step_values`.
   * See `restorePage` to undo.
   */
  async deletePage(pageId: string, workflowId: string, userId: string, callerTx?: DbTransaction): Promise<void> {
    await this.withTx(callerTx, async (tx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'edit', tx);
      await this.sectionRepo.lockWorkflowStructure(workflowId, tx);

      const page = await this.pageRepo.findByIdAndWorkflow(pageId, workflowId, tx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.stepRepo.softDeleteByPageId(pageId, tx);
      await this.pageRepo.softDelete(pageId, tx);
      const activePages = await this.pageRepo.findByWorkflowId(workflowId, tx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(workflowId, tx);
      assertValidSectionSpans(activePages, workflowSections, { emptyStatusCode: 409 });
    });
  }

  /**
   * Restore a soft-deleted page and its steps (ICW2-B1). Uses an
   * unscoped lookup since the page's `deletedAt` is set, so the filtered
   * `findById` cannot see it. Restore UI is deferred — this is server-side
   * only.
   */
  async restorePage(pageId: string, userId: string, callerTx?: DbTransaction): Promise<Page> {
    return this.withTx(callerTx, async (tx) => {
      const page = await this.pageRepo.findByIdIncludingDeleted(pageId, tx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.workflowSvc.verifyAccess(page.workflowId, userId, 'edit', tx);
      await this.sectionRepo.lockWorkflowStructure(page.workflowId, tx);
      const lockedPage = await this.pageRepo.findByIdIncludingDeleted(pageId, tx);
      if (!lockedPage?.deletedAt) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.stepRepo.restoreByPageId(pageId, tx);
      const restored = await this.pageRepo.restore(pageId, tx);
      if (!restored) {
        throw new Error(PAGE_NOT_FOUND);
      }
      const activePages = await this.pageRepo.findByWorkflowId(lockedPage.workflowId, tx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(lockedPage.workflowId, tx);
      assertValidSectionSpans(activePages, workflowSections);
      return restored;
    });
  }

  /**
   * Impact of deleting a page: answers + distinct runs that would be
   * permanently destroyed via the page->steps->step_values cascade.
   * Aggregates counts across every step in the page. Read-only — gates
   * the client's destructive-confirm dialog (ICW2-13).
   */
  async getPageDeleteImpact(pageId: string, workflowId: string, userId: string, tx?: DbTransaction): Promise<DeleteImpact> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'edit', scopedTx);

      const page = await this.pageRepo.findByIdAndWorkflow(pageId, workflowId, scopedTx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      // Include virtual (computed) steps too — deleting the page cascades to all of them.
      const steps = await this.stepRepo.findByPageId(pageId, scopedTx, true);
      return this.stepValueRepo.countImpactForSteps(steps.map((s) => s.id), scopedTx);
    });
  }

  /**
   * Impact of deleting a page (workflow looked up automatically).
   */
  async getPageDeleteImpactById(pageId: string, userId: string, tx?: DbTransaction): Promise<DeleteImpact> {
    return this.withTx(tx, async (scopedTx) => {
      const page = await this.pageRepo.findById(pageId, scopedTx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      return this.getPageDeleteImpact(pageId, page.workflowId, userId, scopedTx);
    });
  }

  /**
   * Reorder pages.
   *
   * A drag that moves a page above another can turn a valid forward
   * `skip_to` rule into a backward one — `isForwardSkipTarget` then discards
   * it at run time and the author is told nothing until the next publish
   * (MAP-B4, decision D-5). The reorder itself always succeeds — this is a
   * non-blocking warning, not a gate — but the caller gets back the rules
   * the reorder just broke so the builder can say so immediately.
   */
  async reorderPages(
    workflowId: string,
    userId: string,
    pageOrders: Array<{ id: string; order: number; sectionId: string | null }>,
    deleteEmptySectionIds: string[] = [],
    callerTx?: DbTransaction
  ): Promise<{ affectedSkipRules: ReorderSkipRuleWarning[] }> {
    return this.withTx(callerTx, async (tx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'edit', tx);
      await this.sectionRepo.lockWorkflowStructure(workflowId, tx);

      const activePages = await this.pageRepo.findByWorkflowId(workflowId, tx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(workflowId, tx);
      PageService.assertCompleteLayout(activePages, workflowSections, pageOrders);

      if (new Set(deleteEmptySectionIds).size !== deleteEmptySectionIds.length) {
        throw new SectionLayoutError("deleteEmptySectionIds must not contain duplicates");
      }

      const sectionById = new Map(workflowSections.map((section) => [section.id, section]));
      const proposedCount = new Map(workflowSections.map((section) => [section.id, 0]));
      for (const page of pageOrders) {
        if (page.sectionId !== null) {
          proposedCount.set(page.sectionId, (proposedCount.get(page.sectionId) ?? 0) + 1);
        }
      }
      const emptySectionIds = new Set(
        workflowSections
          .filter((section) => proposedCount.get(section.id) === 0)
          .map((section) => section.id),
      );

      for (const sectionId of deleteEmptySectionIds) {
        const section = sectionById.get(sectionId);
        if (!section) {
          throw new SectionLayoutError(
            `Section ${sectionId} no longer exists; deletion authorization is stale`,
            409,
          );
        }
        if (!emptySectionIds.has(sectionId)) {
          throw new SectionLayoutError(
            `Section "${section.title}" did not become empty; deletion authorization is stale`,
            409,
          );
        }
      }

      const authorizedDeletionIds = new Set(deleteEmptySectionIds);
      for (const sectionId of emptySectionIds) {
        if (!authorizedDeletionIds.has(sectionId)) {
          const section = sectionById.get(sectionId);
          throw new SectionLayoutError(
            `Section "${section?.title ?? sectionId}" cannot be empty; confirm its deletion and retry`,
            409,
          );
        }
      }

      const retainedSections = workflowSections.filter(
        (section) => !emptySectionIds.has(section.id),
      );
      assertValidSectionSpans(pageOrders, retainedSections);

      for (const { id, order, sectionId } of pageOrders) {
        await this.pageRepo.updateLayout(id, workflowId, order, sectionId, tx);
      }
      for (const sectionId of emptySectionIds) {
        await this.sectionRepo.delete(sectionId, tx);
      }

      return { affectedSkipRules: await this.findBackwardSkipRules(workflowId, tx) };
    });
  }

  private static assertCompleteLayout(
    activePages: Page[],
    workflowSections: Array<{ id: string; title: string }>,
    pageOrders: Array<{ id: string; order: number; sectionId: string | null }>,
  ): void {
    const inputIds = new Set(pageOrders.map((page) => page.id));
    if (inputIds.size !== pageOrders.length) {
      throw new SectionLayoutError("Page reorder contains duplicate page IDs");
    }
    const activeIds = new Set(activePages.map((page) => page.id));
    for (const page of pageOrders) {
      if (!activeIds.has(page.id)) {
        throw new Error("Page not found");
      }
    }
    if (pageOrders.length !== activePages.length) {
      throw new SectionLayoutError("Page reorder must include the complete active page layout");
    }
    for (const page of activePages) {
      if (!inputIds.has(page.id)) {
        throw new SectionLayoutError(`Page ${page.id} is missing from the final layout`);
      }
    }
    const orders = new Set(pageOrders.map((page) => page.order));
    if (orders.size !== pageOrders.length) {
      throw new SectionLayoutError("Page reorder contains duplicate order values");
    }
    const validSectionIds = new Set(workflowSections.map((section) => section.id));
    for (const page of pageOrders) {
      if (page.sectionId !== null && !validSectionIds.has(page.sectionId)) {
        throw new Error("Section not found");
      }
    }
  }

  /**
   * Every `skip_to` page rule whose target now sits at or before the
   * page holding its condition question, evaluated against the
   * workflow's *current* (post-reorder) page order. Reuses
   * `isBackwardSkipTarget` — the same order comparison `checkSkipDirection`
   * uses at publish time — rather than re-deriving it (MAP-B4).
   */
  private async findBackwardSkipRules(workflowId: string, tx?: DbTransaction): Promise<ReorderSkipRuleWarning[]> {
    // Sequential, not Promise.all: these run inside the caller's open
    // transaction, and concurrent queries on one connection are the
    // `SystemStats` deadlock shape against the max:1 test pool.
    const pages = await this.pageRepo.findByWorkflowId(workflowId, tx);
    // Include virtual steps: a rule's condition can reference a computed step too.
    const steps = await this.stepRepo.findByWorkflowId(workflowId, tx, true);
    const rules = await this.logicRuleRepo.findByWorkflowId(workflowId, tx);

    const pageById = new Map(pages.map((page) => [page.id, page]));
    const pageIdByStepId = new Map(steps.map((step) => [step.id, step.pageId]));

    const affected: ReorderSkipRuleWarning[] = [];
    for (const rule of rules) {
      if (rule.action !== "skip_to" || rule.targetType !== "page" || rule.targetPageId === null) {
        continue;
      }

      const targetPage = pageById.get(rule.targetPageId);
      const conditionPageId = pageIdByStepId.get(rule.conditionStepId);
      const conditionPage = conditionPageId !== undefined ? pageById.get(conditionPageId) : undefined;
      if (!targetPage || !conditionPage) {
        continue;
      }

      if (isBackwardSkipTarget(targetPage.order, conditionPage.order)) {
        affected.push({
          ruleId: rule.id,
          conditionPageId: conditionPage.id,
          conditionPageTitle: conditionPage.title,
          targetPageId: targetPage.id,
          targetPageTitle: targetPage.title,
        });
      }
    }

    return affected;
  }

  /**
   * Get pages for a workflow
   */
  async getPages(workflowId: string, userId: string, tx?: DbTransaction): Promise<Page[]> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'view', scopedTx);
      return this.pageRepo.findByWorkflowId(workflowId, scopedTx);
    });
  }

  /**
   * Get pages for a workflow without ownership check
   * Used for preview/run token authentication
   */
  async getPagesByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Page[]> {
    return this.withTx(tx, (scopedTx) => this.pageRepo.findByWorkflowId(workflowId, scopedTx));
  }

  /**
   * Get page with steps
   */
  async getPageWithSteps(pageId: string, workflowId: string, userId: string, tx?: DbTransaction): Promise<Page & { steps: Step[] }> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, 'view', scopedTx);

      const page = await this.pageRepo.findByIdAndWorkflow(pageId, workflowId, scopedTx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      const steps = await this.stepRepo.findByPageId(pageId, scopedTx);

      return {
        ...page,
        steps,
      };
    });
  }

  /**
   * Update page by ID only (looks up workflow automatically)
   */
  async updatePageById(
    pageId: string,
    userId: string,
    data: Partial<InsertPage>,
    tx?: DbTransaction
  ): Promise<Page> {
    return this.withTx(tx, async (scopedTx) => {
      const page = await this.pageRepo.findById(pageId, scopedTx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.workflowSvc.verifyAccess(page.workflowId, userId, 'edit', scopedTx);
      await this.sectionRepo.lockWorkflowStructure(page.workflowId, scopedTx);
      const lockedPage = await this.pageRepo.findById(pageId, scopedTx);
      if (!lockedPage) {
        throw new Error(PAGE_NOT_FOUND);
      }
      const updated = await this.pageRepo.update(pageId, PageService.stripImmutableFields(data), scopedTx);
      const activePages = await this.pageRepo.findByWorkflowId(lockedPage.workflowId, scopedTx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(lockedPage.workflowId, scopedTx);
      assertValidSectionSpans(activePages, workflowSections);
      return updated;
    });
  }

  /**
   * Delete page by ID only (looks up workflow automatically).
   * Soft-delete — ICW2-B1 — see `deletePage` for the cascade rationale.
   */
  async deletePageById(pageId: string, userId: string, callerTx?: DbTransaction): Promise<void> {
    await this.withTx(callerTx, async (tx) => {
      const page = await this.pageRepo.findById(pageId, tx);
      if (!page) {
        throw new Error(PAGE_NOT_FOUND);
      }

      await this.workflowSvc.verifyAccess(page.workflowId, userId, 'edit', tx);
      await this.sectionRepo.lockWorkflowStructure(page.workflowId, tx);
      const lockedPage = await this.pageRepo.findById(pageId, tx);
      if (!lockedPage) {
        throw new Error(PAGE_NOT_FOUND);
      }
      await this.stepRepo.softDeleteByPageId(pageId, tx);
      await this.pageRepo.softDelete(pageId, tx);
      const activePages = await this.pageRepo.findByWorkflowId(lockedPage.workflowId, tx);
      const workflowSections = await this.sectionRepo.findByWorkflowId(lockedPage.workflowId, tx);
      assertValidSectionSpans(activePages, workflowSections, { emptyStatusCode: 409 });
    });
  }
}

// Singleton instance
export const pageService = new PageService();

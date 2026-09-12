import crypto from "crypto";

import { createLogger } from "../logger";
import {
  pageRepository,
  sectionRepository,
  stepRepository as defaultStepRepository,
  logicRuleRepository,
  documentTemplateRepository,
  workflowTemplateRepository,
  workflowRepository,
  projectRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";
import { parseStepConfigForMode, validateWorkflowPatchOpsForMode } from "@shared/aiVocabulary";
import { type WorkflowPatchOp, workflowPatchOpSchema } from "@shared/validation/aiWorkflowEdit.schema";

import { DatavaultColumnsService } from "./DatavaultColumnsService";
import { DatavaultTablesService } from "./DatavaultTablesService";
import { pageService } from "./PageService";
import { sectionService } from "./SectionService";
import { workflowService } from "./WorkflowService";
const logger = createLogger({ module: "workflow-patch-service" });
const PAGE_REF_REQUIRED = "Page ID or tempId required";
/**
 * Applies atomic workflow patch operations with tempId resolution
 * Used by AI workflow editing system
 */
import type { StepType } from "../../shared/types/workflow";
import type { Mode } from "@shared/mode";

export class WorkflowPatchService {
  private tempIdMap: Map<string, string> = new Map();
  private datavaultTablesService = new DatavaultTablesService();
  private datavaultColumnsService = new DatavaultColumnsService();
  private stepRepository = defaultStepRepository;
  constructor(stepRepo?: typeof defaultStepRepository) {
    if (stepRepo) {
      this.stepRepository = stepRepo;
    }
  }
  /**
   * Resolve a reference (can be real ID or tempId)
   */
  private resolve(ref: string | undefined): string | undefined {
    if (!ref) { return undefined; }
    return this.tempIdMap.get(ref) ?? ref;
  }
  /**
   * Store tempId -> real ID mapping
   */
  private mapTempId(tempId: string, realId: string): void {
    this.tempIdMap.set(tempId, realId);
    logger.debug({ tempId, realId }, "Mapped tempId to real ID");
  }
  /**
   * Clear tempId mappings (call between patch sets)
   */
  public clearMappings(): void {
    this.tempIdMap.clear();
  }
  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2e, the "ambient-only" variant — no method here carries an
   * explicit tenantId to cross-check against, since the tenant is derived from
   * the workflow being patched). Reuses a caller-supplied `tx` if given, so a
   * single logical operation gets exactly one transaction and one GUC.
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
   * Get tenant context from workflow
   * Required for DataVault operations
   */
  private async getTenantContext(workflowId: string, tx?: DbTransaction): Promise<{ tenantId: string; projectId: string }> {
    const workflow = await workflowRepository.findById(workflowId, tx);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (!workflow.projectId) {
      throw new Error("Workflow has no project");
    }
    const project = await projectRepository.findById(workflow.projectId, tx);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.tenantId) {
      throw new Error("Project has no tenant context");
    }
    return {
      tenantId: project.tenantId,
      projectId: project.id,
    };
  }
  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  /**
   * Apply a batch of operations atomically
   * Returns summary of changes
   */
  async applyOps(
    workflowId: string,
    userId: string,
    ops: WorkflowPatchOp[]
  ): Promise<{ summary: string[]; errors: string[] }> {
    const summary: string[] = [];
    const errors: string[] = [];
    const parsedOps: WorkflowPatchOp[] = [];
    let mode: Mode = "easy";
    this.clearMappings();
    // Validate all ops before applying. One tenant-scoped transaction for the
    // whole pass — every check inside is a read, so there is no reason to open
    // (and pin the GUC on) one per op.
    await this.withTx(undefined, async (tx) => {
      mode = (await workflowService.getResolvedMode(workflowId, userId, tx)).mode;
      for (const op of ops) {
        const parsed = workflowPatchOpSchema.safeParse(op);
        if (!parsed.success) {
          errors.push(`Validation failed for ${op.op}: Invalid operation schema: ${parsed.error.issues[0].message}`);
          continue;
        }
        parsedOps.push(parsed.data);
      }
      if (errors.length > 0) { return; }
      const existingSteps = await this.stepRepository.findByWorkflowId(workflowId, tx) ?? [];
      try {
        validateWorkflowPatchOpsForMode(
          parsedOps,
          mode,
          new Map(existingSteps.map((step) => [step.id, step.type])),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown mode validation error";
        errors.push(`Validation failed for workflow patch: ${message}`);
        return;
      }
      for (const op of parsedOps) {
        try {
          await this.validateOp(workflowId, op, tx);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown validation error";
          errors.push(`Validation failed for ${op.op}: ${message}`);
        }
      }
    });
    if (errors.length > 0) {
      return { summary, errors };
    }
    // Apply ops sequentially (order matters for tempId resolution)
    for (const op of parsedOps) {
      try {
        const result = await this.applyOp(workflowId, userId, op, mode);
        summary.push(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to apply ${op.op}: ${message}`);
        logger.error({ error, op }, "Failed to apply operation");
        break; // Stop applying subsequent operations
      }
    }
    return { summary, errors };
  }
  /**
   * Validate a single operation (security checks, safety rules)
   */
  private async validateOp(workflowId: string, op: WorkflowPatchOp, tx?: DbTransaction): Promise<void> {
    // Validate against Zod schema
    const result = workflowPatchOpSchema.safeParse(op);
    if (!result.success) {
      throw new Error(`Invalid operation schema: ${result.error.errors[0].message}`);
    }
    // DataVault safety checks
    if (op.op.startsWith("datavault.")) {
      if (op.op === "datavault.createTable" || op.op === "datavault.addColumns") {
        // Safe operations - allowed
      } else {
        throw new Error(`Unsafe DataVault operation: ${op.op}`);
      }
    }
    // Alias uniqueness check for step creation
    if ((op.op === "step.create" || op.op === "step.update") && op.alias) {
      const existingSteps = await this.stepRepository.findByWorkflowId(workflowId, tx);
      const duplicate = existingSteps.find(
        (s) => s.alias === op.alias && (op.op === "step.create" || s.id !== this.resolve(op.id))
      );
      if (duplicate) {
        throw new Error(`Step alias '${op.alias}' already exists`);
      }
    }
  }
  /**
   * Verify that an entity (page or step) belongs to the given workflow ID.
   * Prevents IDOR attacks where a user passes a valid ID from another tenant's workflow.
   */
  private async assertEntityBelongsToWorkflow(entityId: string, workflowId: string, type: 'page' | 'step', tx?: DbTransaction): Promise<void> {
    if (type === 'page') {
      const page = await pageRepository.findById(entityId, tx);
      if (!page) {throw new Error(`Page not found: ${entityId}`);}
      if (page.workflowId !== workflowId) {throw new Error(`Page ${entityId} does not belong to workflow ${workflowId}`);}
    } else if (type === 'step') {
      const step = await this.stepRepository.findById(entityId, tx);
      if (!step) {throw new Error(`Step not found: ${entityId}`);}
      const page = await pageRepository.findById(step.pageId, tx);
      if (!page || page.workflowId !== workflowId) {throw new Error(`Step ${entityId} does not belong to workflow ${workflowId}`);}
    }
  }

  /**
   * IDOR guard for Section references, mirroring
   * `assertEntityBelongsToWorkflow` for pages and steps: a Section id from
   * another tenant's workflow must not be reachable just because the caller
   * can edit this one.
   */
  private async assertSectionBelongsToWorkflow(sectionId: string, workflowId: string, tx?: DbTransaction): Promise<void> {
    const section = await sectionRepository.findById(sectionId, tx);
    if (!section) { throw new Error(`Section not found: ${sectionId}`); }
    if (section.workflowId !== workflowId) { throw new Error(`Section ${sectionId} does not belong to workflow ${workflowId}`); }
  }

  /**
   * Expand a `page.reorder` op into the complete page layout
   * `PageService.reorderPages` requires.
   *
   * A partial list means "reorder these among themselves": the listed pages
   * are dealt, in the given sequence, into the order slots those same pages
   * already occupy, and every unlisted page keeps its slot. A list naming
   * every page therefore behaves exactly as "this is the new order", while a
   * two-page swap no longer drags the other eight to the end of the workflow.
   * Each page carries its existing `sectionId` through untouched, so a reorder
   * changes sequence only — never Section membership.
   */
  private async buildReorderLayout(
    workflowId: string,
    pageRefs: string[],
    tx: DbTransaction,
  ): Promise<Array<{ id: string; order: number; sectionId: string | null }>> {
    const activePages = await pageRepository.findByWorkflowId(workflowId, tx);
    const byId = new Map(activePages.map((page) => [page.id, page]));
    const slotted = [...activePages].sort((left, right) => left.order - right.order);

    const requested: string[] = [];
    const seen = new Set<string>();
    for (const ref of pageRefs) {
      const pageId = this.resolve(ref);
      if (!pageId) { throw new Error(PAGE_REF_REQUIRED); }
      if (!byId.has(pageId)) {
        throw new Error(`Page ${pageId} does not belong to workflow ${workflowId}`);
      }
      if (seen.has(pageId)) { throw new Error("Page reorder contains duplicate page IDs"); }
      seen.add(pageId);
      requested.push(pageId);
    }

    const slots = slotted
      .map((page, index) => (seen.has(page.id) ? index : -1))
      .filter((index) => index !== -1);
    for (const [position, slot] of slots.entries()) {
      const pageId = requested[position];
      const page = byId.get(pageId);
      if (page) { slotted[slot] = page; }
    }

    return slotted.map((page, index) => ({
      id: page.id,
      order: index + 1,
      sectionId: page.sectionId,
    }));
  }

  /**
   * Apply a single operation, in one tenant-scoped transaction.
   *
   * One transaction per OP rather than per batch: `applyOps` deliberately
   * stops at the first failure and keeps whatever already succeeded, so
   * widening this to the whole batch would change failure semantics (it would
   * roll the earlier ops back), not just the RLS scoping.
   */
  private async applyOp(
    workflowId: string,
    userId: string,
    op: WorkflowPatchOp,
    mode: Mode,
  ): Promise<string> {
    return this.withTx(undefined, (tx) => this.applyOpInTx(workflowId, userId, op, mode, tx));
  }
  /**
   * The operation body. Every DB call here takes the caller's `tx` so the whole
   * op runs inside the single transaction `applyOp` opened — including the
   * calls into other converted services, which reuse a supplied `tx` rather
   * than opening a second one (a nested transaction deadlocks the size-1 test
   * pool — see RLS_HANDOFF §4).
   */
  // eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity, complexity
  private async applyOpInTx(
    workflowId: string,
    userId: string,
    op: WorkflowPatchOp,
    mode: Mode,
    tx: DbTransaction
  ): Promise<string> {
    switch (op.op) {
      // ====================================================================
      // Workflow Operations
      // ====================================================================
      case "workflow.setMetadata": {
        await workflowService.updateWorkflow(workflowId, userId, {
          title: op.title,
          description: op.description,
        }, tx);
        return `Updated workflow metadata`;
      }
      // ====================================================================
      // Page Operations
      // ====================================================================
      case "page.create": {
        // Through PageService, not the repository: it takes the structure
        // lock, enforces MAX_PAGES_PER_WORKFLOW, and re-asserts the Section
        // span invariant. Creating pages by raw repository call skipped all
        // three, so an AI batch could exceed the page cap or land a page at a
        // duplicate `order` in the middle of a Section's span.
        const page = await pageService.createPage(workflowId, userId, {
          title: op.title,
          order: op.order,
          config: op.config,
        }, tx);
        if (op.tempId) {
          this.mapTempId(op.tempId, page.id);
        }
        return `Created page '${op.title}'`;
      }
      case "page.update": {
        const pageId = this.resolve(op.id ?? op.tempId);
        if (!pageId) { throw new Error(PAGE_REF_REQUIRED); }
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        await pageRepository.update(pageId, {
          title: op.title,
          order: op.order,
          config: op.config,
        }, tx);
        return `Updated page`;
      }
      case "page.delete": {
        const pageId = this.resolve(op.id ?? op.tempId);
        if (!pageId) { throw new Error(PAGE_REF_REQUIRED); }
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        // Soft-delete (ICW2-B1/ICW2-B11): preserves respondent step_values.
        // Delegated to PageService rather than re-implemented here — the
        // hand-rolled copy cascaded to steps but skipped the span assertion,
        // so deleting a Section's only page left that Section empty and every
        // later layout write failed on an invariant the AI had broken.
        await pageService.deletePage(pageId, workflowId, userId, tx);
        return `Deleted page`;
      }
      case "page.reorder": {
        // The old loop wrote `order: i + 1` to each listed page and nothing
        // else. Two defects fell out of that: a partial list left unlisted
        // pages on their original orders, colliding with the ones just
        // renumbered, and nothing carried `sectionId`, so a reorder that
        // interleaved two Sections' pages silently broke their contiguous
        // spans. Both are avoided by handing PageService the workflow's
        // complete layout, which is the contract the manual builder uses.
        const layout = await this.buildReorderLayout(workflowId, op.pageIds, tx);
        const { affectedSkipRules } = await pageService.reorderPages(
          workflowId,
          userId,
          layout,
          [],
          tx,
        );
        const brokenRules = affectedSkipRules.length > 0
          ? ` (${affectedSkipRules.length} skip_to rule(s) now point backwards)`
          : '';
        return `Reordered ${op.pageIds.length} pages${brokenRules}`;
      }
      case "page.setSection": {
        const pageId = this.resolve(op.id ?? op.tempId);
        if (!pageId) { throw new Error(PAGE_REF_REQUIRED); }
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        const sectionId = op.sectionId === null ? null : this.resolve(op.sectionId) ?? null;
        await sectionService.setPageSection(workflowId, userId, pageId, sectionId, tx);
        return sectionId === null
          ? `Removed page from its Section`
          : `Moved page into Section`;
      }
      // ====================================================================
      // Section Operations
      // ====================================================================
      case "section.create": {
        const pageIds = op.pageIds.map((ref) => this.resolve(ref)).filter((id): id is string => Boolean(id));
        if (pageIds.length !== op.pageIds.length) {
          throw new Error("Every section.create pageId must resolve to a page");
        }
        for (const pageId of pageIds) {
          await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        }
        const section = await sectionService.createSection(workflowId, userId, {
          title: op.title,
          description: op.description,
        }, pageIds, tx);
        if (op.tempId) {
          this.mapTempId(op.tempId, section.id);
        }
        return `Created Section '${op.title}' over ${pageIds.length} page(s)`;
      }
      case "section.update": {
        const sectionId = this.resolve(op.id ?? op.tempId);
        if (!sectionId) { throw new Error("Section ID or tempId required"); }
        await this.assertSectionBelongsToWorkflow(sectionId, workflowId, tx);
        await sectionService.updateSection(sectionId, userId, {
          title: op.title,
          description: op.description,
        }, tx);
        return `Updated Section`;
      }
      case "section.delete": {
        const sectionId = this.resolve(op.id ?? op.tempId);
        if (!sectionId) { throw new Error("Section ID or tempId required"); }
        await this.assertSectionBelongsToWorkflow(sectionId, workflowId, tx);
        // The pages survive: `pages.section_id` is ON DELETE SET NULL, so they
        // stay in the workflow and simply become ungrouped.
        await sectionService.deleteSection(sectionId, userId, tx);
        return `Deleted Section`;
      }
      case "section.setVisibleIf": {
        const sectionId = this.resolve(op.id ?? op.tempId);
        if (!sectionId) { throw new Error("Section ID or tempId required"); }
        await this.assertSectionBelongsToWorkflow(sectionId, workflowId, tx);
        await sectionService.updateSection(sectionId, userId, {
          visibleIf: op.visibleIf,
        }, tx);
        return op.visibleIf === null
          ? `Cleared Section visibility condition`
          : `Updated Section visibility condition`;
      }
      case "page.setVisibleIf": {
        const pageId = this.resolve(op.id ?? op.tempId);
        if (!pageId) { throw new Error(PAGE_REF_REQUIRED); }
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        await pageRepository.update(pageId, {
          visibleIf: op.visibleIf,
        }, tx);
        return op.visibleIf === null
          ? `Cleared page visibility condition`
          : `Updated page visibility condition`;
      }
      // ====================================================================
      // Step Operations
      // ====================================================================
      case "step.create": {
        const pageId = this.resolve(op.pageId ?? op.pageRef);
        if (!pageId) { throw new Error("Page ID or pageRef required"); }
        // IDOR guard (parity with step.move/update/delete): the target page
        // must belong to this workflow. Without this a caller with edit access
        // to their own workflow could inject a step into another workflow's —
        // even another tenant's — page by passing its UUID. A tempId from a
        // same-batch page.create resolves to a page created in *this*
        // workflow, so the assertion still passes for the legitimate path.
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        // Get max order for this page if not specified
        const order = op.order ?? await this.getNextStepOrder(pageId, tx);
        const canonicalConfig = parseStepConfigForMode(op.type, op.config, mode);
        const step = await this.stepRepository.create({
          workflowId,
          pageId,
          type: op.type as StepType,
          title: op.title,
          alias: op.alias,
          required: op.required ?? false,
          order,
          // Without this, choice steps land with no options and date/number
          // steps with no validation — the ICW2-2 defect, at the ops seam.
          config: canonicalConfig,
          defaultValue: op.defaultValue,
        }, tx);
        if (op.tempId) {
          this.mapTempId(op.tempId, step.id);
        }
        return `Created step '${op.title}' (${op.type})`;
      }
      case "step.update": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const stepId = this.resolve(op.id || op.tempId);
        // eslint-disable-next-line sonarjs/no-duplicate-string
        if (!stepId) { throw new Error("Step ID or tempId required"); }
        await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
        const existingStep = await this.stepRepository.findById(stepId, tx);
        if (!existingStep) { throw new Error(`Step not found: ${stepId}`); }
        if (op.type !== undefined && op.config === undefined) {
          throw new Error(`step.update changing type to "${op.type}" requires replacement config`);
        }
        const effectiveType = op.type ?? existingStep.type;
        const canonicalConfig = op.config === undefined
          ? undefined
          : parseStepConfigForMode(effectiveType, op.config, mode);
        await this.stepRepository.update(stepId, {
          type: op.type as StepType,
          title: op.title,
          alias: op.alias,
          required: op.required,
          config: canonicalConfig,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ConditionExpression validated by Zod schema
          visibleIf: op.visibleIf as any,
          defaultValue: op.defaultValue,
        }, tx);
        return `Updated step`;
      }
      case "step.delete": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }
        await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
        // Soft-delete (ICW2-B1/ICW2-B11): preserves respondent step_values.
        await this.stepRepository.softDelete(stepId, tx);
        return `Deleted step`;
      }
      case "step.move": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }
        const toPageId = this.resolve(op.toPageId);
        if (!toPageId) { throw new Error("Target page ID required"); }
        
        await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
        await this.assertEntityBelongsToWorkflow(toPageId, workflowId, 'page', tx);
        const order = op.order ?? await this.getNextStepOrder(toPageId, tx);
        await this.stepRepository.update(stepId, {
          pageId: toPageId,
          order,
        }, tx);
        return `Moved step to different page`;
      }
      case "step.setVisibleIf": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }
        await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
        await this.stepRepository.update(stepId, {
          visibleIf: op.visibleIf,
        }, tx);
        return op.visibleIf === null
          ? `Cleared step visibility condition`
          : `Updated step visibility condition`;
      }
      case "step.reorder": {
        const pageId = this.resolve(op.pageId);
        if (!pageId) { throw new Error("Page ID required"); }
        await this.assertEntityBelongsToWorkflow(pageId, workflowId, 'page', tx);
        for (let i = 0; i < op.stepIds.length; i++) {
          const stepId = this.resolve(op.stepIds[i]);
          if (stepId) {
            await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
            await this.stepRepository.update(stepId, { pageId, order: i + 1 }, tx);
          }
        }
        return `Reordered ${op.stepIds.length} steps`;
      }
      case "step.setRequired": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }
        await this.assertEntityBelongsToWorkflow(stepId, workflowId, 'step', tx);
        await this.stepRepository.update(stepId, {
          required: op.required,
        }, tx);
        return `Set step required: ${op.required}`;
      }
      // ====================================================================
      // Logic Rule Operations (Using visibleIf expressions)
      // ====================================================================
      case "logicRule.create": {
        // Logic rules are implemented via visibleIf on steps/pages
        // Parse the rule and apply to the target entity
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const targetId = this.resolve(op.rule.target.id || op.rule.target.tempId);
        if (!targetId) { throw new Error("Logic rule target ID required"); }
        await this.assertEntityBelongsToWorkflow(targetId, workflowId, op.rule.target.type, tx);
        // Convert rule to ConditionExpression format
        const conditionExpr = this.parseConditionToExpression(op.rule.condition);
        if (op.rule.target.type === "step") {
          await this.stepRepository.update(targetId, {
            visibleIf: conditionExpr,
          }, tx);
          return `Applied visibility rule to step`;
        } else if (op.rule.target.type === "page") {
          await pageRepository.update(targetId, {
            visibleIf: conditionExpr,
          }, tx);
          return `Applied visibility rule to page`;
        } else {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new Error(`Unknown target type: ${op.rule.target.type}`);
        }
      }
      case "logicRule.update": {
        // Update existing visibleIf on a step or page
        if (!op.rule.target) {
          throw new Error("Logic rule target required for update");
        }
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const targetId = this.resolve(op.rule.target.id || op.rule.target.tempId);
        if (!targetId) { throw new Error("Logic rule target ID required"); }
        await this.assertEntityBelongsToWorkflow(targetId, workflowId, op.rule.target.type, tx);
        const conditionExpr = op.rule.condition
          ? this.parseConditionToExpression(op.rule.condition)
          : null;
        if (op.rule.target.type === "step") {
          await this.stepRepository.update(targetId, {
            visibleIf: conditionExpr,
          }, tx);
        } else if (op.rule.target.type === "page") {
          await pageRepository.update(targetId, {
            visibleIf: conditionExpr,
          }, tx);
        }
        return `Updated visibility rule`;
      }
      case "logicRule.delete": {
        // Delete logic rule by ID (from logic_rules table)
        const logicRule = await logicRuleRepository.findById(op.id, tx);
        if (logicRule) {
           if (logicRule.workflowId !== workflowId) {
               throw new Error(`Logic rule does not belong to workflow ${workflowId}`);
           }
           await logicRuleRepository.delete(op.id, tx);
        }
        return `Removed logic rule`;
      }
      // ====================================================================
      // Document Operations
      // ====================================================================
      case "document.add": {
        // Attach an existing template to the workflow
        // Assumes 'template' field contains a templateId
        const templateId = op.template;
        const { projectId } = await this.getTenantContext(workflowId, tx);
        // Verify template exists and belongs to project
        const template = await documentTemplateRepository.findByIdAndProjectId(
          templateId,
          projectId,
          tx
        );
        if (!template) {
          throw new Error(
            `Template not found: ${templateId}. Please ensure the document has been uploaded first.`
          );
        }
        // Get current workflow to access versionId
        // For now, we'll use workflowId directly since workflow_templates uses workflowVersionId
        // In production, we'd need to handle versioning properly
        const workflow = await workflowRepository.findById(workflowId, tx);
        if (!workflow) {
          throw new Error("Workflow not found");
        }
        // Create workflow-template link
        // Note: This assumes we're working with the latest/current version
        // In a versioned system, we'd need to pass/track the versionId
        const link = await workflowTemplateRepository.create({
          // TODO: Use actual versionId when versioning is active
          workflowVersionId: workflowId,
          templateId: template.id,
          key: this.generateSlug(op.name),
          isPrimary: false,
        }, tx);
        if (op.tempId) {
          this.mapTempId(op.tempId, link.id);
        }
        return `Attached document '${op.name}' (${op.fileType})`;
      }
      case "document.update": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { projectId } = await this.getTenantContext(workflowId, tx);
        // Update the template metadata
        if (op.name !== undefined) {
          await documentTemplateRepository.update(docId, {
            name: op.name,
          }, tx);
        }
        return `Updated document`;
      }
      case "document.setConditional": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }
        // Parse condition to ConditionExpression if provided
        const conditionExpr = op.condition
          ? this.parseConditionToExpression(op.condition)
          : null;
        // Store conditional logic in template metadata
        await documentTemplateRepository.update(docId, {
          metadata: {
            visibleIf: conditionExpr,
          },
        }, tx);
        return op.condition
          ? `Set conditional visibility for document`
          : `Removed conditional visibility from document`;
      }
      case "document.bindFields": {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { projectId } = await this.getTenantContext(workflowId, tx);
        // Verify all step aliases exist in workflow
        const workflowSteps = await this.stepRepository.findByWorkflowId(workflowId, tx);
        const validAliases = new Set(workflowSteps.map(s => s.alias).filter(Boolean));
        for (const stepAlias of Object.values(op.bindings)) {
          if (!validAliases.has(stepAlias)) {
            throw new Error(
              `Step alias '${stepAlias}' not found in workflow. Please create the step first.`
            );
          }
        }
        // Build mapping in format: { fieldName: { type: 'variable', source: stepAlias } }
        const mapping: Record<string, { type: 'variable'; source: string }> = {};
        for (const [fieldName, stepAlias] of Object.entries(op.bindings)) {
          mapping[fieldName] = {
            type: 'variable',
            source: stepAlias,
          };
        }
        // Update template mapping
        await documentTemplateRepository.update(docId, {
          mapping,
        }, tx);
        return `Bound ${Object.keys(op.bindings).length} field(s) to workflow variables`;
      }
      // ====================================================================
      // DataVault Operations (Additive only - strictly safe)
      // ====================================================================
      case "datavault.createTable": {
        const { tenantId } = await this.getTenantContext(workflowId, tx);
        // Normalize to null so an empty-string databaseId can't (a) slip past
        // the ownership check below via a falsy guard, nor (b) be persisted as a
        // bogus "" reference (`"" ?? null` keeps the empty string).
        const databaseId = typeof op.databaseId === 'string' && op.databaseId.trim() !== ''
          ? op.databaseId
          : null;
        // Verify database exists and belongs to this tenant if provided
        if (databaseId) {
          const { datavaultDatabasesRepository } = await import('../repositories');
          const dbObj = await datavaultDatabasesRepository.findById(databaseId, tx);
          if (!dbObj || dbObj.tenantId !== tenantId) {
              throw new Error(`Database ${databaseId} not found or does not belong to your tenant`);
          }
        }
        // Create table with auto-generated slug
        const table = await this.datavaultTablesService.createTable({
          tenantId,
          ownerUserId: userId,
          databaseId,
          name: op.name,
          slug: this.generateSlug(op.name),
          description: null,
        }, tx);
        // Add custom columns (ID column is auto-created by service)
        let columnCount = 0;
        for (const col of op.columns) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          columnCount++;
          await this.datavaultColumnsService.createColumn({
            tableId: table.id,
            name: col.name,
            type: col.type,
            // @ts-expect-error - TODO: fix type
            required: col.config?.required ?? false,
            // @ts-expect-error - TODO: fix type
            description: col.config?.description ?? null,
            // Add type-specific config
            options: col.type === 'select' || col.type === 'multiselect'
              ? col.config?.options ?? null
              : null,
          }, tenantId, tx);
        }
        if (op.tempId) {
          this.mapTempId(op.tempId, table.id);
        }
        return `Created DataVault table '${op.name}' with ${op.columns.length} column(s)`;
      }
      case "datavault.addColumns": {
        const tableId = this.resolve(op.tableId);
        if (!tableId) { throw new Error("Table ID required"); }
        const { tenantId } = await this.getTenantContext(workflowId, tx);
        // Verify table exists and user has write access
        await this.datavaultTablesService.requirePermission(
          userId,
          tableId,
          tenantId,
          "write",
          tx
        );
        // Get current max orderIndex
        const context = await this.getTenantContext(workflowId, tx);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const existingColumns = await this.datavaultColumnsService.listColumns(tableId, context.tenantId, tx);
        // Add new columns
        for (const col of op.columns) {
          await this.datavaultColumnsService.createColumn({
            tableId,
            name: col.name,
            type: col.type,
            // @ts-expect-error - TODO: fix type
            required: col.config?.required ?? false,
            // @ts-expect-error - TODO: fix type
            description: col.config?.description ?? null,
            options: col.type === 'select' || col.type === 'multiselect'
              ? col.config?.options ?? null
              : null,
          }, context.tenantId, tx);
        }
        return `Added ${op.columns.length} column(s) to DataVault table`;
      }
      default:
        // TypeScript should ensure exhaustive checking
        // eslint-disable-next-line no-case-declarations
        const _exhaustive: never = op;
        throw new Error(`Unknown operation: ${(op as { op: string }).op}`);
    }
  }
  /**
   * Get next available order for a page's steps
   */
  private async getNextStepOrder(pageId: string, tx?: DbTransaction): Promise<number> {
    const steps = await this.stepRepository.findByPageId(pageId, tx);
    if (steps.length === 0) { return 1; }
    return Math.max(...steps.map(s => s.order)) + 1;
  }
  /**
   * Parse a condition string into a ConditionExpression
   * Produces format compatible with shared/types/conditions.ts
   * Examples:
   *   "email equals 'test@example.com'"
   *   "age greater_than 18"
   *   "status is_empty"
   */
  private parseConditionToExpression(condition: string): unknown {
    // Trim whitespace
    // eslint-disable-next-line no-param-reassign
    condition = condition.trim();
    // Map old operator names to new ComparisonOperator values
    const operatorMappings: Record<string, string> = {
      'notEquals': 'not_equals',
      'equals': 'equals',
      'notContains': 'not_contains',
      'contains': 'contains',
      'startsWith': 'starts_with',
      'endsWith': 'ends_with',
      'isEmpty': 'is_empty',
      'notEmpty': 'is_not_empty',
      'gte': 'greater_or_equal',
      'lte': 'less_or_equal',
      'gt': 'greater_than',
      'lt': 'less_than',
      'in': 'includes_any',
      'notIn': 'not_includes',
    };
    // Try all operator variants (including mapped names)
    const operators = [
      'not_equals', 'notEquals', 'equals',
      'not_contains', 'notContains', 'contains',
      'starts_with', 'startsWith', 'ends_with', 'endsWith',
      'greater_or_equal', 'gte', 'less_or_equal', 'lte',
      'greater_than', 'gt', 'less_than', 'lt',
      'is_empty', 'isEmpty', 'is_not_empty', 'notEmpty',
      'includes_any', 'in', 'not_includes', 'notIn',
      'includes', 'includes_all',
      'is_true', 'is_false', 'between',
    ];
    for (const rawOperator of operators) {
      // Valueless operators ("has_pet is_true") end the string, so match a
      // trailing operator as well as an infix one — otherwise is_true/is_false/
      // is_empty/is_not_empty are unparseable and the model cannot express
      // boolean or emptiness rules at all.
      let operatorIndex = condition.indexOf(` ${rawOperator} `);
      if (operatorIndex === -1 && condition.endsWith(` ${rawOperator}`)) {
        operatorIndex = condition.length - rawOperator.length - 1;
      }
      if (operatorIndex === -1) { continue; }
      const left = condition.substring(0, operatorIndex).trim();
      const right = condition.substring(operatorIndex + rawOperator.length + 2).trim();
      // Map operator to canonical form
      const canonicalOp = operatorMappings[rawOperator] || rawOperator;
      // For isEmpty/notEmpty, no right operand needed
      if (canonicalOp === 'is_empty' || canonicalOp === 'is_not_empty' || canonicalOp === 'is_true' || canonicalOp === 'is_false') {
        return {
          type: 'group',
          id: `cond_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`,
          operator: 'AND',
          conditions: [{
            type: 'condition',
            id: `cond_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`,
            variable: left,
            operator: canonicalOp,
            valueType: 'constant',
          }],
        };
      }
      // Parse right value
      let rightValue: unknown;
      let valueType: 'constant' | 'variable' = 'constant';
      if (right.startsWith("'") && right.endsWith("'")) {
        // String literal
        rightValue = right.slice(1, -1);
      } else if (right.startsWith("[") && right.endsWith("]")) {
        // Array literal: ['value1', 'value2'] or [1, 2, 3]
        const arrayContent = right.slice(1, -1);
        rightValue = arrayContent.split(',').map(item => {
          // eslint-disable-next-line no-param-reassign
          item = item.trim();
          if (item.startsWith("'") && item.endsWith("'")) {
            return item.slice(1, -1);
          } else if (!isNaN(Number(item))) {
            return Number(item);
          }
          return item;
        });
      } else if (right === 'true' || right === 'false') {
        // Boolean literal
        rightValue = right === 'true';
      } else if (right === 'null') {
        // Null literal
        rightValue = null;
      } else if (!isNaN(Number(right))) {
        // Number literal
        rightValue = Number(right);
      } else {
        // Variable reference
        rightValue = right;
        valueType = 'variable';
      }
      // Return ConditionGroup format
      return {
        type: 'group',
        id: `cond_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`,
        operator: 'AND',
        conditions: [{
          type: 'condition',
          id: `cond_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`,
          variable: left,
          operator: canonicalOp,
          value: rightValue,
          valueType,
        }],
      };
    }
    throw new Error(`Could not parse condition: "${condition}". Expected format: "variable operator value" (e.g., "email equals 'test@example.com'", "age greater_than 18")`);
  }
}
export const workflowPatchService = new WorkflowPatchService();

import { getLegacyChoiceOptions } from "@shared/choiceOptions";
import type { WorkflowVariable } from "@shared/schema";
import { resolveBooleanConfig } from "@shared/types/stepConfigs";

import { type DbTransaction, pageRepository, stepRepository } from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";

import { workflowService } from "./WorkflowService";

/**
 * Service layer for workflow variable management
 * Provides access to step aliases and variable references
 */
/**
 * Step types whose config carries selectable choices (legacy radio /
 * multiple_choice options). Other types never have an options list.
 */
const CHOICE_STEP_TYPES = new Set<string>(["radio", "multiple_choice"]);

export class VariableService {
  private stepRepo: typeof stepRepository;
  private pageRepo: typeof pageRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    stepRepo?: typeof stepRepository,
    pageRepo?: typeof pageRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.stepRepo = stepRepo ?? stepRepository;
    this.pageRepo = pageRepo ?? pageRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
  }

  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-4 precondition 5). If the caller already handed us a
   * transaction, reuse it — never open a nested one, which would deadlock
   * the size-1 test pool while the caller's own transaction still holds the
   * only connection (this is the same class of bug `TemplateValidationService
   * .validate` already opens its own transaction around, and used to call
   * `listVariables` from inside without threading it through — see the
   * comment that used to sit at that call site). Otherwise open exactly one
   * via `withCurrentTenant`, which reads the tenant from the request's async
   * context and sets the transaction-local `app.current_tenant_id` GUC for
   * the `pages`/`steps` reads inside `fn` — both are RLS-covered via
   * their workflow's ownership.
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
   * Get all variables (steps) for a workflow
   * Returns steps ordered by page.order, then step.order
   */
  async listVariables(workflowId: string, userId: string, tx?: DbTransaction): Promise<WorkflowVariable[]> {
    return this.withTx(tx, async (scopedTx) => {
      // Verify ownership
      await this.workflowSvc.verifyAccess(workflowId, userId, 'view', scopedTx);

      // Get all pages for the workflow
      const pages = await this.pageRepo.findByWorkflowId(workflowId, scopedTx);

      if (pages.length === 0) {
        return [];
      }

      // Get all steps for these pages
      const pageIds = pages.map(s => s.id);
      const steps = await this.stepRepo.findByPageIds(pageIds, scopedTx);

      // Create a map of page ID to page for quick lookup
      const pageMap = new Map(pages.map(s => [s.id, s]));

      // Build variables array
      const variables: WorkflowVariable[] = steps.map(step => {
        const page = pageMap.get(step.pageId);
        const booleanConfig = step.type === 'boolean' ? resolveBooleanConfig(step.config) : undefined;
        // O-2: options travel with the variable. The condition editor used to
        // fetch every step separately just to read them; only legacy
        // radio/multiple_choice configs carry any, so `choices` is omitted for
        // every other type rather than sent as an empty array.
        const choices = booleanConfig?.storeAsBoolean === false
          ? [
              { value: booleanConfig.trueAlias, label: booleanConfig.trueLabel },
              { value: booleanConfig.falseAlias, label: booleanConfig.falseLabel },
            ]
          : CHOICE_STEP_TYPES.has(step.type)
          ? getLegacyChoiceOptions(step.config)
          : undefined;
        return {
          key: step.id,
          alias: step.alias,
          label: step.title,
          type: booleanConfig?.storeAsBoolean === false ? 'radio' : booleanConfig ? 'yes_no' : step.type,
          pageId: step.pageId,
          pageTitle: page?.title ?? 'Unknown Page',
          stepId: step.id,
          ...(choices && choices.length > 0 ? { choices } : {}),
        };
      });

      return variables;
    });
  }

  /**
   * Check if an alias is unique within a workflow
   * Returns true if alias is available, false if already in use
   */
  async isAliasUnique(
    workflowId: string,
    alias: string,
    excludeStepId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const variables = await this.listVariables(workflowId, 'system', tx);

    // Check if alias is already used by another step
    const existingVariable = variables.find(
      v => v.alias?.toLowerCase() === alias.toLowerCase() && v.stepId !== excludeStepId
    );

    return !existingVariable;
  }
}

// Singleton instance
export const variableService = new VariableService();

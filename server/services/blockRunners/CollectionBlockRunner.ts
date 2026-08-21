/**
 * Collection Block Runner
 * Handles collection operations (create, update, find, delete records)
 */

import { logger } from "../../logger";
import { runWithTenantContext, withVerifiedIdentifier } from "../../utils/rlsContext";
import { recordService } from "../RecordService";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type {
  BlockContext,
  BlockResult,
  Block,
  CreateRecordConfig,
  UpdateRecordConfig,
  FindRecordConfig,
  DeleteRecordConfig,
} from "./types";

export class CollectionBlockRunner extends BaseBlockRunner {
  private recordSvc: typeof recordService;

  constructor(recordSvc?: typeof recordService) {
    super();
    this.recordSvc = recordSvc ?? recordService;
  }

  getBlockType(): string {
    // This handles multiple types
    return "collection";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(config: any, context: BlockContext, block: Block): Promise<BlockResult> {
    const blockType = block.type as string;

    switch (blockType) {
      case "create_record":
        return this.executeCreateRecord(config as CreateRecordConfig, context);
      case "update_record":
        return this.executeUpdateRecord(config as UpdateRecordConfig, context);
      case "find_record":
        return this.executeFindRecord(config as FindRecordConfig, context);
      case "delete_record":
        return this.executeDeleteRecord(config as DeleteRecordConfig, context);
      default:
        logger.warn(`Unknown collection block type: ${blockType}`);
        return { success: false, errors: [`Unknown block type: ${blockType}`] };
    }
  }

  /**
   * Execute create_record block
   */
  private async executeCreateRecord(
    config: CreateRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      // Build record data from fieldMap
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordData: Record<string, any> = {};
      const { aliasMap } = context;

      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        const dataKey = aliasMap?.[stepAlias] ?? stepAlias;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const value = context.data[dataKey];

        if (value !== undefined && value != null) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          recordData[fieldSlug] = value;
        }
      }

      logger.info(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { tenantId, collectionId: config.collectionId, recordData: this.redact(recordData) },
        "Creating record via block"
      );

      // RLS-2c: this runner can execute from an HTTP-driven run submission
      // (ambient tenant context already populated by rlsContext) or from
      // RunCompletionJobWorker's background poll loop (no request, no
      // ambient context at all). recordService now opens a tenant-scoped
      // transaction and fails closed with no context, so this must supply
      // one explicitly using the tenantId already resolved from the
      // workflow — same fix ReadTableBlockRunner applied in RLS-2b.
      const record = await runWithTenantContext(tenantId, () =>
        this.recordSvc.createRecord({
          tenantId,
          collectionId: config.collectionId,
          data: recordData,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      if (config.outputKey) {
        updates[config.outputKey] = record.id;
      }

      return {
        success: true,
        data: updates,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing create_record block");
      return {
        success: false,
        errors: [
          `Failed to create record: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }

  /**
   * Execute update_record block
   */
  private async executeUpdateRecord(
    config: UpdateRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      const { aliasMap } = context;
      const recordIdKey = aliasMap?.[config.recordIdKey] ?? config.recordIdKey;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      // Build update data from fieldMap
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {};
      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        const dataKey = aliasMap?.[stepAlias] ?? stepAlias;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const value = context.data[dataKey];

        if (value !== undefined && value != null) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          updateData[fieldSlug] = value;
        }
      }

      logger.info(
        {
          tenantId,
          collectionId: config.collectionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          recordId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          updateData: this.redact(updateData),
        },
        "Updating record via block"
      );

      // RLS-2c: see the createRecord branch above — background job callers
      // have no ambient tenant context, so it must be supplied explicitly.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await runWithTenantContext(tenantId, () => this.recordSvc.updateRecord(recordId, tenantId, updateData));

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing update_record block");
      return {
        success: false,
        errors: [
          `Failed to update record: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }

  /**
   * Execute find_record block
   */
  private async executeFindRecord(
    config: FindRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      logger.info(
        { tenantId, collectionId: config.collectionId, filters: config.filters },
        "Finding records via block"
      );

      // RLS-2c: see the createRecord branch above — background job callers
      // have no ambient tenant context, so it must be supplied explicitly.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = (await runWithTenantContext(tenantId, () => this.recordSvc.findByFilters(
        tenantId,
        config.collectionId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config.filters ?? []) as any[],
        { page: 1, limit: config.limit ?? 1 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ))) as any;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!result?.records || !Array.isArray(result.records)) {
        return {
          success: false,
          errors: ["Invalid response from record service"],
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result.records.length === 0 && config.failIfNotFound) {
        return {
          success: false,
          errors: ["No records found matching the criteria"],
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      updates[config.outputKey] =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        config.limit === 1 ? result.records[0] ?? null : result.records;

      return {
        success: true,
        data: updates,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing find_record block");
      return {
        success: false,
        errors: [
          `Failed to find records: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }

  /**
   * Execute delete_record block
   */
  private async executeDeleteRecord(
    config: DeleteRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      const { aliasMap } = context;
      const recordIdKey = aliasMap?.[config.recordIdKey] ?? config.recordIdKey;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      logger.info(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { tenantId, collectionId: config.collectionId, recordId },
        "Deleting record via block"
      );

      // RLS-2c: see the createRecord branch above — background job callers
      // have no ambient tenant context, so it must be supplied explicitly.
      // Pre-existing argument-order bug in this call (deleteRecord expects
      // (recordId, tenantId, tx)) is untouched — out of this ticket's scope.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await runWithTenantContext(tenantId, () => this.recordSvc.deleteRecord(tenantId, config.collectionId, recordId));

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing delete_record block");
      return {
        success: false,
        errors: [
          `Failed to delete record: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }

  /**
   * Helper: Get tenantId from workflowId
   */
  /**
   * Resolve the tenant that scopes DataVault access for this workflow.
   *
   * Delegates to {@link WorkflowTenantResolver} — this used to be a private
   * copy that resolved only `project -> creator` and ignored
   * `ownerType`/`ownerUuid`, so a transferred workflow resolved the original
   * creator's tenant while its DataVault data had moved to the new owner.
   */
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      const { workflowTenantResolver } = await import("../WorkflowTenantResolver");
      // RLS-5: resolving a workflow's tenant means reading `workflows`,
      // `projects` and `users` — all RLS-covered — with no tenant known yet,
      // which is the whole point of the call. Pin the workflow id as
      // `app.current_workflow_id` (migration 0030) for the lookup, exactly as
      // `runTokenAuth` does. The id came from the block's run context, not
      // from request input. Without this the resolver returns null under
      // enforcement and the block fails with "Failed to resolve tenantId".
      return await withVerifiedIdentifier(
        'app.current_workflow_id',
        workflowId,
        (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
      );
    } catch (error: unknown) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}

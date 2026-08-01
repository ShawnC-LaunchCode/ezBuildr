/**
 * Collection Block Runner
 * Handles collection operations (create, update, find, delete records)
 */

import { logger } from "../../logger";
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

      const record = await this.recordSvc.createRecord({
        tenantId,
        collectionId: config.collectionId,
        data: recordData,
      });

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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await this.recordSvc.updateRecord(recordId, tenantId, updateData);

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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = (await this.recordSvc.findByFilters(
        tenantId,
        config.collectionId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config.filters ?? []) as any[],
        { page: 1, limit: config.limit ?? 1 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )) as any;

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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await this.recordSvc.deleteRecord(tenantId, config.collectionId, recordId);

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
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      const { workflowRepository } = await import("../../repositories");
      const workflow = await workflowRepository.findById(workflowId);

      if (!workflow) {
        logger.warn({ workflowId }, "Workflow not found");
        return null;
      }

      // 1. Try Project linkage
      if (workflow.projectId) {
        const { projectRepository } = await import("../../repositories");
        const project = await projectRepository.findById(workflow.projectId);
        if (project) {
          return project.tenantId;
        }
        logger.warn(
          { projectId: workflow.projectId, workflowId },
          "Project not found for workflow, falling back to creator"
        );
      }

      // 2. Fallback: Creator's Tenant
      if (workflow.creatorId) {
        const { userRepository } = await import("../../repositories");
        const creator = await userRepository.findById(workflow.creatorId);

        if (creator?.tenantId) {
          return creator.tenantId;
        }
      }

      logger.warn(
        { workflowId, creatorId: workflow.creatorId },
        "Could not resolve tenantId from project or creator"
      );
      return null;
    } catch (error) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}

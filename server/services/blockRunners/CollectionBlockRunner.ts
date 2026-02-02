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
    this.recordSvc = recordSvc || recordService;
  }

  getBlockType(): string {
    // This handles multiple types
    return "collection";
  }

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
      const recordData: Record<string, any> = {};
      const { aliasMap } = context;

      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        const dataKey = aliasMap?.[stepAlias] || stepAlias;
        const value = context.data[dataKey];

        if (value !== undefined && value !== null) {
          recordData[fieldSlug] = value;
        }
      }

      logger.info(
        { tenantId, collectionId: config.collectionId, recordData: this.redact(recordData) },
        "Creating record via block"
      );

      const record = await this.recordSvc.createRecord({
        tenantId,
        collectionId: config.collectionId,
        data: recordData,
      });

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
      const recordIdKey = aliasMap?.[config.recordIdKey] || config.recordIdKey;
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      // Build update data from fieldMap
      const updateData: Record<string, any> = {};
      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        const dataKey = aliasMap?.[stepAlias] || stepAlias;
        const value = context.data[dataKey];

        if (value !== undefined && value !== null) {
          updateData[fieldSlug] = value;
        }
      }

      logger.info(
        {
          tenantId,
          collectionId: config.collectionId,
          recordId,
          updateData: this.redact(updateData),
        },
        "Updating record via block"
      );

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

      const result = (await this.recordSvc.findByFilters(
        tenantId,
        config.collectionId,
        (config.filters ?? []) as any[],
        { page: 1, limit: config.limit || 1 }
      )) as any;

      if (!result?.records || !Array.isArray(result.records)) {
        return {
          success: false,
          errors: ["Invalid response from record service"],
        };
      }

      if (result.records.length === 0 && config.failIfNotFound) {
        return {
          success: false,
          errors: ["No records found matching the criteria"],
        };
      }

      const updates: Record<string, any> = {};
      updates[config.outputKey] =
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
      const recordIdKey = aliasMap?.[config.recordIdKey] || config.recordIdKey;
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      logger.info(
        { tenantId, collectionId: config.collectionId, recordId },
        "Deleting record via block"
      );

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

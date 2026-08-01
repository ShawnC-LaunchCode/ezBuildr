/**
 * List Tools Block Runner
 * Applies comprehensive list operations: filter, sort, offset/limit, select, dedupe
 */

import { transformList, isListVariable, arrayToListVariable } from "../../../shared/listPipeline";
import { logger } from "../../logger";
import { stepValueRepository } from "../../repositories";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, ListToolsConfig, ListVariable } from "./types";

export class ListToolsBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "list_tools";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(config: any, context: BlockContext, block: Block): Promise<BlockResult> {
    const listConfig = config as ListToolsConfig;
    try {
      // Check runCondition
      if (listConfig.runCondition) {
        const shouldRun = this.evaluateCondition(listConfig.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping list_tools block due to condition");
          return { success: true };
        }
      }

      // Resolve input list from context data
      const inputKey = context.aliasMap?.[listConfig.sourceListVar] ?? listConfig.sourceListVar;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const inputData = context.data[inputKey];


      if (!inputData) {
        logger.warn({ sourceListVar: listConfig.sourceListVar, inputKey }, "Input list not found, treating as empty array");
        // Treat as empty list rather than error
        const emptyList: ListVariable = {
          metadata: { source: 'list_tools' },
          rows: [],
          count: 0,
          columns: []
        };

        return {
          success: true,
          data: this.buildListToolsOutputData(listConfig, emptyList, context)
        };
      }

      // Normalize input - handle both ListVariable and plain arrays
      let workingList: ListVariable;
      if (isListVariable(inputData)) {
        workingList = inputData;
      } else if (Array.isArray(inputData)) {
        // Convert plain array to ListVariable
        workingList = arrayToListVariable(inputData);
      } else {
        return {
          success: false,
          errors: [`Input variable "${listConfig.sourceListVar}" is not a valid list or array`]
        };
      }

      // Apply transformations using shared pipeline
      const resultList = transformList(workingList, {
        filters: listConfig.filters,
        sort: listConfig.sort,
        limit: listConfig.limit,
        offset: listConfig.offset,
        select: listConfig.select,
        dedupe: listConfig.dedupe
      }, context.data);

      // Update metadata
      resultList.metadata = {
        ...resultList.metadata,
        source: 'list_tools'
      };

      // Build output data (includes list + derived outputs)
      const outputData = this.buildListToolsOutputData(listConfig, resultList, context);

      // Persist to virtual step if runId is present
      if (context.runId && block.virtualStepId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: resultList,
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            rowCount: resultList.count
          }, "Persisted list_tools block output");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist list_tools block output");
        }
      }

      return {
        success: true,
        data: outputData
      };

    } catch (error) {
      logger.error({ error, config: listConfig }, "List tools block failed");
      return {
        success: false,
        errors: [`List tools operation failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  /**
   * Build output data including derived outputs
   */
  private buildListToolsOutputData(
    config: ListToolsConfig,
    resultList: ListVariable,
    _context: BlockContext
  ): Record<string, unknown> {
    const outputData: Record<string, unknown> = {
      [config.outputListVar]: resultList
    };

    // Add derived outputs
    if (config.outputs?.countVar) {
      outputData[config.outputs.countVar] = resultList.count;
    }

    if (config.outputs?.firstVar) {
      outputData[config.outputs.firstVar] = resultList.rows[0] ?? null;
    }

    return outputData;
  }
}

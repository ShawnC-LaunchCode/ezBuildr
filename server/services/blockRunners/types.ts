/**
 * Shared types and interfaces for block runners
 */

import type { Block } from "@shared/schema";
import type {
  BlockPhase,
  BlockContext,
  BlockResult,
  PrefillConfig,
  ValidateConfig,
  BranchConfig,
  CreateRecordConfig,
  UpdateRecordConfig,
  FindRecordConfig,
  DeleteRecordConfig,
  QueryBlockConfig,
  WriteBlockConfig,
  ExternalSendBlockConfig,
  ReadTableConfig,
  ListToolsConfig,
  WhenCondition,
  AssertExpression,
  ComparisonOperator,
  ReadTableOperator,

  ListVariable,
  ValidateRule,
  CompareRule,
  ConditionalRequiredRule,
  ForEachRule,
  LegacyValidateRule,
} from "@shared/types/blocks";

// Re-export commonly used types
export type {
  Block,
  BlockPhase,
  BlockContext,
  BlockResult,
  PrefillConfig,
  ValidateConfig,
  BranchConfig,
  CreateRecordConfig,
  UpdateRecordConfig,
  FindRecordConfig,
  DeleteRecordConfig,
  QueryBlockConfig,
  WriteBlockConfig,
  ExternalSendBlockConfig,
  ReadTableConfig,
  ListToolsConfig,
  WhenCondition,
  AssertExpression,
  ComparisonOperator,
  ReadTableOperator,
  ListVariable,
  ValidateRule,
  CompareRule,
  ConditionalRequiredRule,
  ForEachRule,
  LegacyValidateRule,
};

/**
 * Interface for block runner implementations
 */
export interface IBlockRunner {
  /**
   * Execute a block with the given configuration and context
   */
  execute(config: any, context: BlockContext, block: Block): Promise<BlockResult>;

  /**
   * Get the block type this runner handles
   */
  getBlockType(): string;
}

/**
 * Dependencies that may be injected into block runners
 */
export interface BlockRunnerDependencies {
  blockService?: any;
  transformBlockService?: any;
  collectionService?: any;
  recordService?: any;
  workflowService?: any;
  lifecycleHookService?: any;
  datavaultTablesService?: any;
  datavaultRowsService?: any;
  queryRunner?: any;
  writeRunner?: any;
  externalSendRunner?: any;
  analyticsService?: any;
  db?: any;
  logger?: any;
}

/**
 * Common comparison utilities
 */
export interface ComparisonUtils {
  isEqual(actual: any, expected: any): boolean;
  contains(actual: any, expected: any): boolean;
  compareNumeric(actual: any, expected: any): number;
  isEmpty(value: any): boolean;
  matchesRegex(value: any, pattern: any): boolean;
}

/**
 * Tenant resolution result
 */
export interface TenantResolution {
  tenantId: string | null;
  error?: string;
}

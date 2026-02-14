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
  BlockComparisonOperator,
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
  BlockComparisonOperator as ComparisonOperator,
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
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IBlockRunner {
  /**
   * Execute a block with the given configuration and context
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blockService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformBlockService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collectionService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflowService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lifecycleHookService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datavaultTablesService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datavaultRowsService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryRunner?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeRunner?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalSendRunner?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyticsService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger?: any;
}

/**
 * Common comparison utilities
 */
export interface ComparisonUtils {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isEqual(actual: any, expected: any): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contains(actual: any, expected: any): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compareNumeric(actual: any, expected: any): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isEmpty(value: any): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchesRegex(value: any, pattern: any): boolean;
}

/**
 * Tenant resolution result
 */
export interface TenantResolution {
  tenantId: string | null;
  error?: string;
}

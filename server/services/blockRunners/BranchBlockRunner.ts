/**
 * Branch Block Runner
 * Evaluates conditions and returns next section decision
 */

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, BranchConfig } from "./types";

export class BranchBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "branch";
  }


  async execute(config: BranchConfig, context: BlockContext, _block: Block): Promise<BlockResult> {
    // Evaluate branches in order (first match wins)
    for (const branch of config.branches) {
      const conditionMet = this.evaluateCondition(branch.when, context.data);
      if (conditionMet) {
        return {
          success: true,
          nextSectionId: branch.gotoSectionId,
        };
      }
    }

    // No branch matched, use fallback
    return {
      success: true,
      nextSectionId: config.fallbackSectionId,
    };
  }
}

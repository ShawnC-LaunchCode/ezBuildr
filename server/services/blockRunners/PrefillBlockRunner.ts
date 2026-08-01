/**
 * Prefill Block Runner
 * Seeds data with static values or query parameters
 */

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, PrefillConfig } from "./types";

export class PrefillBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "prefill";
  }


  execute(config: PrefillConfig, context: BlockContext, _block: Block): Promise<BlockResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- updates holds arbitrary workflow step values
    const updates: Record<string, any> = {};
    const overwrite = config.overwrite ?? false;

    if (config.mode === "static" && config.staticMap) {
      for (const [key, value] of Object.entries(config.staticMap)) {
        // Only set if key doesn't exist or overwrite is true
        if (overwrite || context.data[key] === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value from staticMap has dynamic type
          updates[key] = value;
        }
      }
    } else if (config.mode === "query" && config.queryKeys && context.queryParams) {
      for (const key of config.queryKeys) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- queryParams values have dynamic types
        const value = context.queryParams[key];
        if (value !== undefined && (overwrite || context.data[key] === undefined)) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value from queryParams has dynamic type
          updates[key] = value;
        }
      }
    }

    return Promise.resolve({
      success: true,
      data: updates,
    });
  }
}

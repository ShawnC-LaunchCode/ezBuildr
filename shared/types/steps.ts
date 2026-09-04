/**
 * Step Type Definitions
 *
 * Type definitions for different question/step types in workflows.
 */

export type CodeBlockOutput = {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'list';
  description?: string;
};

export type CodeBlockInput = {
  key: string;
  required: boolean;
};

/** Configuration for the compute-only Code Block stored as `js_question`. */
export type JsQuestionConfig = {
  /** JavaScript function body. Call emit({ outputKey: value }). */
  code: string;

  /** Whitelisted workflow variables exposed on the input object. */
  inputs: CodeBlockInput[];

  /** Declared outputs. Each output owns one virtual computed step. */
  outputs: CodeBlockOutput[];

  /** Execution timeout in milliseconds (default: 1000) */
  timeoutMs?: number;
};

type LegacyJsQuestionConfig = {
  code: string;
  inputKeys: string[];
  outputKey: string;
  timeoutMs?: number;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard to check if options contain JS question config
 */
export function isJsQuestionConfig(options: unknown): options is JsQuestionConfig {
  return (
    isObjectRecord(options) &&
    typeof options.code === 'string' &&
    Array.isArray(options.inputs) &&
    options.inputs.every(input => (
      isObjectRecord(input) &&
      typeof input.key === 'string' &&
      typeof input.required === 'boolean'
    )) &&
    Array.isArray(options.outputs) &&
    options.outputs.every(output => (
      isObjectRecord(output) &&
      typeof output.key === 'string' &&
      ['string', 'number', 'boolean', 'date', 'object', 'list'].includes(String(output.type))
    ))
  );
}

function isLegacyJsQuestionConfig(options: unknown): options is LegacyJsQuestionConfig {
  return (
    isObjectRecord(options) &&
    typeof options.code === 'string' &&
    Array.isArray(options.inputKeys) &&
    options.inputKeys.every(key => typeof key === 'string') &&
    typeof options.outputKey === 'string'
  );
}

/** Read adapter for pre-CB-1 single-output `js_question` rows. */
export const LEGACY_JS_QUESTION_ADAPTER = {
  resolveConfig(config: unknown): unknown {
    if (isJsQuestionConfig(config) || !isLegacyJsQuestionConfig(config)) {
      return config;
    }
    return {
      code: config.code,
      inputs: config.inputKeys.map(key => ({ key, required: true })),
      outputs: [{ key: config.outputKey, type: 'object' as const }],
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    } satisfies JsQuestionConfig;
  },
};

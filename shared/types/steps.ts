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

/**
 * When a Code Block becomes *eligible* to run. Independent of `CodeBlockRepeat`
 * (CB-3, Decisions 3) — firing is trigger × repeat, two choices, not one enum.
 *
 * The readiness gate always wins over the trigger (Decisions 4): an eligible
 * block whose required inputs are not resolved waits rather than firing with
 * holes, because firing unready is what puts NaN into a document.
 */
export type CodeBlockTrigger =
  /** Eligible at every page submit / navigation. The default. */
  | 'everySubmit'
  /** A FLOOR, not a fixed point: never before `triggerPageId`, every evaluation after. */
  | 'atPage'
  /** Only at run creation, against inbound/prefill data, with no page context. */
  | 'runStart'
  /** Only in the completion pass, before documents are generated. */
  | 'runComplete';

/** Whether an eligible, ready Code Block runs again on later evaluations. */
export type CodeBlockRepeat =
  /** Fire when ready and the input hash moved. The default. */
  | 'onChange'
  /** Fire the first time ready, then never again — the hash is ignored thereafter. */
  | 'once'
  /** Fire at every eligible evaluation, hash ignored. */
  | 'always';

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

  /**
   * Optional in the type, defaulted at read time by `resolveFiringPolicy`, so
   * every Code Block stored before CB-3 keeps working with the documented
   * defaults ('everySubmit' × 'onChange') rather than needing a backfill.
   */
  trigger?: CodeBlockTrigger;

  /** Required iff `trigger === 'atPage'`; rejected otherwise. */
  triggerPageId?: string;

  /** See `trigger` for why this is optional. */
  repeat?: CodeBlockRepeat;
};

export const DEFAULT_CODE_BLOCK_TRIGGER: CodeBlockTrigger = 'everySubmit';
export const DEFAULT_CODE_BLOCK_REPEAT: CodeBlockRepeat = 'onChange';

/** Reading a config's firing policy, defaults applied. One place, so the defaults cannot drift. */
export function resolveFiringPolicy(
  config: Pick<JsQuestionConfig, 'trigger' | 'repeat' | 'triggerPageId'>
): { trigger: CodeBlockTrigger; repeat: CodeBlockRepeat; triggerPageId?: string } {
  return {
    trigger: config.trigger ?? DEFAULT_CODE_BLOCK_TRIGGER,
    repeat: config.repeat ?? DEFAULT_CODE_BLOCK_REPEAT,
    triggerPageId: config.triggerPageId,
  };
}

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

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * Step Type Definitions
 *
 * Type definitions for different question/step types in workflows.
 */

/**
 * JS Question Configuration
 * Allows JavaScript code execution as a question/compute step
 */
export type JsQuestionConfig = {
  /** Display mode - visible shows UI in runner, hidden runs as compute-only */
  display: "visible" | "hidden";

  /** JavaScript code to execute (function body style, returns any value) */
  code: string;

  /** Whitelisted input variable keys from the data map */
  inputKeys: string[];

  /** Output variable key where result will be stored */
  outputKey: string;

  /** Execution timeout in milliseconds (default: 1000) */
  timeoutMs?: number;

  /** Optional help text shown in runner when display is "visible" */
  helpText?: string;
};

/**
 * Type guard to check if options contain JS question config
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isJsQuestionConfig(options: any): options is JsQuestionConfig {
  return (
    options &&
    typeof options === 'object' &&
    typeof options.code === 'string' &&
    Array.isArray(options.inputKeys) &&
    typeof options.outputKey === 'string' &&
    (options.display === 'visible' || options.display === 'hidden')
  );
}

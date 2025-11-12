import type { EvalContext } from '../expr';
import { evaluateExpression } from '../expr';

/**
 * Question Node Executor
 * Handles question nodes that capture user input
 */

export interface QuestionNodeConfig {
  key: string;                     // Variable name to store answer
  questionText: string;            // Question prompt
  questionType: 'text' | 'number' | 'boolean' | 'select' | 'multiselect';
  required?: boolean;
  options?: Array<{ value: any; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  condition?: string;              // Optional conditional execution
  skipBehavior?: 'skip' | 'hide' | 'disable';
}

export interface QuestionNodeInput {
  nodeId: string;
  config: QuestionNodeConfig;
  context: EvalContext;
  userAnswer?: any;                // Pre-provided answer (for batch execution)
}

export interface QuestionNodeOutput {
  status: 'executed' | 'skipped';
  varName?: string;                // Variable name that was set
  varValue?: any;                  // Value that was set
  skipReason?: string;
}

/**
 * Execute a question node
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
export async function executeQuestionNode(
  input: QuestionNodeInput
): Promise<QuestionNodeOutput> {
  const { nodeId, config, context, userAnswer } = input;

  try {
    // Check condition if present
    if (config.condition) {
      const conditionResult = evaluateExpression(config.condition, context);
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'condition evaluated to false',
        };
      }
    }

    // Validate answer if provided
    if (userAnswer !== undefined) {
      validateAnswer(config, userAnswer);
    }

    // In a real implementation, if userAnswer is not provided,
    // we would need to prompt the user interactively.
    // For now, we assume answers are provided upfront.
    const value = userAnswer;

    // Check required
    if (config.required && (value === undefined || value === null || value === '')) {
      throw new Error(`Question '${config.key}' is required but no answer provided`);
    }

    // Store in context
    context.vars[config.key] = value;

    return {
      status: 'executed',
      varName: config.key,
      varValue: value,
    };
  } catch (error) {
    throw new Error(
      `Question node ${nodeId} failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validate an answer against question configuration
 */
function validateAnswer(config: QuestionNodeConfig, answer: any): void {
  // Type validation
  switch (config.questionType) {
    case 'number':
      if (typeof answer !== 'number') {
        throw new Error(`Expected number for '${config.key}', got ${typeof answer}`);
      }
      if (config.validation?.min !== undefined && answer < config.validation.min) {
        throw new Error(`Value for '${config.key}' must be >= ${config.validation.min}`);
      }
      if (config.validation?.max !== undefined && answer > config.validation.max) {
        throw new Error(`Value for '${config.key}' must be <= ${config.validation.max}`);
      }
      break;

    case 'boolean':
      if (typeof answer !== 'boolean') {
        throw new Error(`Expected boolean for '${config.key}', got ${typeof answer}`);
      }
      break;

    case 'select':
      if (config.options) {
        const validValues = config.options.map(opt => opt.value);
        if (!validValues.includes(answer)) {
          throw new Error(
            `Invalid value for '${config.key}': ${answer}. Must be one of: ${validValues.join(', ')}`
          );
        }
      }
      break;

    case 'multiselect':
      if (!Array.isArray(answer)) {
        throw new Error(`Expected array for '${config.key}', got ${typeof answer}`);
      }
      if (config.options) {
        const validValues = config.options.map(opt => opt.value);
        for (const val of answer) {
          if (!validValues.includes(val)) {
            throw new Error(
              `Invalid value in '${config.key}': ${val}. Must be one of: ${validValues.join(', ')}`
            );
          }
        }
      }
      break;

    case 'text':
      if (typeof answer !== 'string') {
        throw new Error(`Expected string for '${config.key}', got ${typeof answer}`);
      }
      if (config.validation?.pattern) {
        const regex = new RegExp(config.validation.pattern);
        if (!regex.test(answer)) {
          throw new Error(`Value for '${config.key}' does not match required pattern`);
        }
      }
      break;
  }
}

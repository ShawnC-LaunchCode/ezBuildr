/**
 * Repeater Service (Stage 20 PR 4)
 *
 * Handles repeating groups/subforms for Intake Runner 2.0.
 * Provides validation, instance management, and data flattening.
 */

import { evaluateCondition, type ConditionExpression, type EvaluationContext } from "../workflows/conditions";
import type {
  RepeaterConfig,
  RepeaterValue,
  RepeaterInstance,
  RepeaterValidationResult,
  RepeaterFieldValidation,
  FlattenedRepeaterData,
} from "../../shared/types/repeater";
import { createLogger } from "../logger";

const logger = createLogger({ module: "repeater-service" });

export class RepeaterService {
  /**
   * Validates a repeater value against its configuration
   *
   * @param value - Repeater value with instances
   * @param config - Repeater configuration
   * @returns Validation result with errors per instance
   */
  validateRepeater(value: RepeaterValue | null, config: RepeaterConfig): RepeaterValidationResult {
    const result: RepeaterValidationResult = {
      valid: true,
      instanceErrors: new Map(),
      globalErrors: [],
    };

    const instances = value?.instances || [];

    // Check instance count constraints
    const minInstances = config.minInstances || 0;
    const maxInstances = config.maxInstances || Infinity;

    if (instances.length < minInstances) {
      result.valid = false;
      result.globalErrors.push(`At least ${minInstances} item(s) required`);
    }

    if (instances.length > maxInstances) {
      result.valid = false;
      result.globalErrors.push(`Maximum ${maxInstances} item(s) allowed`);
    }

    // Validate each instance
    for (const instance of instances) {
      const instanceErrors = this.validateInstance(instance, config);

      if (instanceErrors.length > 0) {
        result.valid = false;
        result.instanceErrors.set(instance.instanceId, instanceErrors);
      }
    }

    return result;
  }

  /**
   * Validates a single repeater instance
   *
   * @param instance - Instance to validate
   * @param config - Repeater configuration
   * @returns Array of error messages
   */
  private validateInstance(instance: RepeaterInstance, config: RepeaterConfig): string[] {
    const errors: string[] = [];

    // Build context for field visibility evaluation
    const context: EvaluationContext = {
      variables: instance.values,
    };

    for (const field of config.fields) {
      // Check field visibility
      let isVisible = true;
      if (field.visibleIf) {
        try {
          isVisible = evaluateCondition(field.visibleIf, context);
        } catch (error) {
          logger.error({ error, fieldId: field.id }, "Error evaluating field visibleIf");
          isVisible = true; // Fail-safe
        }
      }

      // Skip validation for hidden fields
      if (!isVisible) {
        continue;
      }

      // Check required fields
      if (field.required) {
        const value = instance.values[field.id];
        if (value === null || value === undefined || value === '') {
          errors.push(`${field.title} is required`);
        }
      }

      // Type-specific validation
      // TODO: Add type-specific validation (email format, date format, etc.)
    }

    return errors;
  }

  /**
   * Flattens repeater data for variable resolution in conditions
   * Enables references like "dependents[0].age", "dependents[1].name"
   *
   * @param repeaterKey - Repeater alias/key
   * @param value - Repeater value
   * @returns Flattened data structure
   */
  flattenRepeaterData(repeaterKey: string, value: RepeaterValue): FlattenedRepeaterData {
    return {
      repeaterKey,
      instances: (value.instances || []).map((instance, index) => ({
        index,
        fields: instance.values,
      })),
    };
  }

  /**
   * Creates an empty repeater value with minimum instances
   *
   * @param config - Repeater configuration
   * @returns Empty repeater value
   */
  createEmptyRepeater(config: RepeaterConfig): RepeaterValue {
    const minInstances = config.minInstances || 0;
    const instances: RepeaterInstance[] = [];

    for (let i = 0; i < minInstances; i++) {
      instances.push(this.createEmptyInstance(i));
    }

    return { instances };
  }

  /**
   * Creates a single empty instance
   *
   * @param index - Instance index
   * @returns Empty instance
   */
  private createEmptyInstance(index: number): RepeaterInstance {
    return {
      instanceId: `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      index,
      values: {},
    };
  }

  /**
   * Adds a new instance to a repeater
   *
   * @param value - Current repeater value
   * @param config - Repeater configuration
   * @returns Updated repeater value or null if max instances reached
   */
  addInstance(value: RepeaterValue, config: RepeaterConfig): RepeaterValue | null {
    const maxInstances = config.maxInstances || Infinity;
    const currentCount = value.instances.length;

    if (currentCount >= maxInstances) {
      return null; // Max instances reached
    }

    const newInstance = this.createEmptyInstance(currentCount);

    return {
      instances: [...value.instances, newInstance],
    };
  }

  /**
   * Removes an instance from a repeater
   *
   * @param value - Current repeater value
   * @param instanceId - Instance ID to remove
   * @param config - Repeater configuration
   * @returns Updated repeater value or null if min instances would be violated
   */
  removeInstance(value: RepeaterValue, instanceId: string, config: RepeaterConfig): RepeaterValue | null {
    const minInstances = config.minInstances || 0;
    const currentCount = value.instances.length;

    if (currentCount <= minInstances) {
      return null; // Min instances constraint
    }

    const filtered = value.instances.filter(i => i.instanceId !== instanceId);

    // Re-index instances
    const reindexed = filtered.map((instance, index) => ({
      ...instance,
      index,
    }));

    return {
      instances: reindexed,
    };
  }

  /**
   * Reorders instances in a repeater
   *
   * @param value - Current repeater value
   * @param fromIndex - Source index
   * @param toIndex - Destination index
   * @returns Updated repeater value
   */
  reorderInstance(value: RepeaterValue, fromIndex: number, toIndex: number): RepeaterValue {
    const instances = [...value.instances];
    const [moved] = instances.splice(fromIndex, 1);
    instances.splice(toIndex, 0, moved);

    // Re-index
    const reindexed = instances.map((instance, index) => ({
      ...instance,
      index,
    }));

    return {
      instances: reindexed,
    };
  }

  /**
   * Gets the instance title for display
   *
   * @param instance - Instance
   * @param config - Repeater configuration
   * @returns Title string
   */
  getInstanceTitle(instance: RepeaterInstance, config: RepeaterConfig): string {
    if (!config.showInstanceTitle) {
      return '';
    }

    const template = config.instanceTitleTemplate || 'Item #{index}';

    return template.replace('#{index}', (instance.index + 1).toString());
  }
}

// Singleton instance
export const repeaterService = new RepeaterService();

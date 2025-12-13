/**
 * Repeater Type Definitions (Stage 20 PR 4)
 *
 * Types for repeating groups/subforms in Intake Runner 2.0.
 * Repeaters allow collecting multiple instances of the same set of questions.
 */

import type { ConditionExpression } from '../../server/workflows/conditions';

/**
 * Field types supported within repeaters
 * (Subset of main step types - no nested repeaters)
 */
export type RepeaterFieldType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'radio'
  | 'yes_no'
  | 'date_time'
  | 'file_upload';

/**
 * Individual field within a repeater
 */
export interface RepeaterField {
  /** Unique field ID (within repeater scope) */
  id: string;

  /** Field type */
  type: RepeaterFieldType;

  /** Field label/title */
  title: string;

  /** Optional help text */
  description?: string;

  /** Is this field required within each instance */
  required?: boolean;

  /** Display order within instance */
  order: number;

  /** Field-specific configuration */
  config?: Record<string, any>;

  /** Options for multiple_choice/radio fields */
  options?: Array<{ label: string; value: string }>;

  /** Conditional visibility within instance */
  visibleIf?: ConditionExpression;

  /** Field alias for variable references */
  alias?: string;

  /** Source column ID/key from the list row (if repeater is list-driven) */
  sourceKey?: string;
}

/**
 * Repeater configuration stored in steps.repeater_config
 */
export interface RepeaterConfig {
  /** Nested fields within each repeater instance */
  fields: RepeaterField[];

  /** Minimum number of instances (default: 0) */
  minInstances?: number;

  /** Maximum number of instances (default: unlimited) */
  maxInstances?: number;

  /** Text for "Add" button (default: "Add Another") */
  addButtonText?: string;

  /** Text for "Remove" button (default: "Remove") */
  removeButtonText?: string;

  /** Allow reordering instances (default: false) */
  allowReorder?: boolean;

  /** Show instance number/title (default: true) */
  showInstanceTitle?: boolean;

  /** Instance title template (e.g., "Dependent #{index}") */
  instanceTitleTemplate?: string;

  /** Source ListVariable alias (if data-driven) */
  listSource?: string;
}

/**
 * Single instance of a repeater with values
 */
export interface RepeaterInstance {
  /** Instance ID (unique within repeater) */
  instanceId: string;

  /** Instance index (0-based) */
  index: number;

  /** Field values for this instance */
  values: Record<string, any>;
}

/**
 * Complete repeater value stored in stepValues
 */
export interface RepeaterValue {
  /** Array of instances */
  instances: RepeaterInstance[];
}

/**
 * Validation result for a repeater
 */
export interface RepeaterValidationResult {
  /** Is the repeater valid */
  valid: boolean;

  /** Errors per instance */
  instanceErrors: Map<string, string[]>;

  /** Global errors (e.g., too few/many instances) */
  globalErrors: string[];
}

/**
 * Flattened repeater data for variable resolution
 * Allows referencing specific instance fields in conditions
 * e.g., "dependents[0].age", "dependents[1].name"
 */
export interface FlattenedRepeaterData {
  /** Repeater alias/key */
  repeaterKey: string;

  /** Instances with field-level access paths */
  instances: Array<{
    index: number;
    fields: Record<string, any>;
  }>;
}

/**
 * Helper type for repeater field validation
 */
export interface RepeaterFieldValidation {
  fieldId: string;
  fieldTitle: string;
  required: boolean;
  instanceIndex: number;
  errors: string[];
}

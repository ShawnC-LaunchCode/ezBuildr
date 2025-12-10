/**
 * Snapshot Helper Utilities
 *
 * Functions for detecting missing values and validating snapshots
 * against the current workflow structure.
 */

import type { Step } from '../repositories';

/**
 * Information about a missing or invalid snapshot value
 */
export interface MissingValue {
  stepId: string;
  alias: string | null;
  reason: 'not_in_snapshot' | 'step_deleted' | 'type_changed' | 'invalid_format';
}

/**
 * Result of snapshot validation
 */
export interface SnapshotValidation {
  isValid: boolean;
  missingValues: MissingValue[];
  outdatedHash: boolean;
  currentHash: string;
}

/**
 * Finds missing or invalid values when comparing a snapshot to current workflow
 *
 * @param snapshotValues - Values stored in the snapshot (alias -> value)
 * @param currentSteps - Current workflow steps
 * @returns Array of missing values with reasons
 */
export function findMissingValues(
  snapshotValues: Record<string, any>,
  currentSteps: Step[]
): MissingValue[] {
  const missingValues: MissingValue[] = [];

  // Build a map of current steps by alias and by ID
  const stepsByAlias = new Map<string, Step>();
  const stepsById = new Map<string, Step>();

  for (const step of currentSteps) {
    if (step.alias) {
      stepsByAlias.set(step.alias, step);
    }
    stepsById.set(step.id, step);
  }

  // Check each step in the workflow to see if it has a value in the snapshot
  for (const step of currentSteps) {
    // Skip virtual steps (computed values)
    if (step.isVirtual) continue;

    // Skip final_documents and other system blocks
    if (step.type === 'final_documents') continue;

    // Determine the key used in snapshot (prefer alias, fall back to ID)
    const key = step.alias || step.id;

    // Check if value exists in snapshot
    if (!(key in snapshotValues)) {
      missingValues.push({
        stepId: step.id,
        alias: step.alias,
        reason: 'not_in_snapshot',
      });
      continue;
    }

    // Value exists - validate format for complex types
    const value = snapshotValues[key];

    if (step.type === 'address' && typeof value !== 'object') {
      missingValues.push({
        stepId: step.id,
        alias: step.alias,
        reason: 'invalid_format',
      });
    } else if (step.type === 'multi_field' && typeof value !== 'object') {
      missingValues.push({
        stepId: step.id,
        alias: step.alias,
        reason: 'invalid_format',
      });
    } else if (step.type === 'choice_multi' && !Array.isArray(value)) {
      missingValues.push({
        stepId: step.id,
        alias: step.alias,
        reason: 'invalid_format',
      });
    }
  }

  return missingValues;
}

/**
 * Finds the first visible step with a missing value
 *
 * Takes into account section order and step order.
 *
 * @param missingValues - Array of missing values
 * @param allSteps - All workflow steps (with sectionId and order)
 * @returns The first missing step, or null if none
 */
export function findFirstMissingStep(
  missingValues: MissingValue[],
  allSteps: Step[]
): Step | null {
  if (missingValues.length === 0) return null;

  // Get missing step IDs
  const missingStepIds = new Set(missingValues.map(mv => mv.stepId));

  // Filter to missing steps only
  const missingSteps = allSteps.filter(step => missingStepIds.has(step.id));

  if (missingSteps.length === 0) return null;

  // Sort by section order, then step order
  missingSteps.sort((a, b) => {
    // Note: We'd need section order here, but for now sort by step order
    // In practice, the caller will need to provide section context
    return a.order - b.order;
  });

  return missingSteps[0];
}

/**
 * Converts snapshot values from versioned format to simple key-value
 *
 * Legacy snapshots store: { alias: { value, stepId, stepUpdatedAt } }
 * New snapshots store: { alias: value }
 *
 * This helper normalizes both formats.
 *
 * @param snapshotValues - Raw snapshot values from DB
 * @returns Normalized key-value map
 */
export function normalizeSnapshotValues(snapshotValues: any): Record<string, any> {
  const normalized: Record<string, any> = {};

  for (const [key, val] of Object.entries(snapshotValues)) {
    // Check if it's versioned format
    if (val && typeof val === 'object' && 'value' in val) {
      normalized[key] = (val as any).value;
    } else {
      // Simple format
      normalized[key] = val;
    }
  }

  return normalized;
}

/**
 * Checks if a value is complete for a given step type
 *
 * @param stepType - The type of the step
 * @param value - The value to validate
 * @returns true if value is complete and valid
 */
export function isValueComplete(stepType: string, value: any): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  switch (stepType) {
    case 'address':
      return (
        typeof value === 'object' &&
        value.street &&
        value.city &&
        value.state &&
        value.zip
      );

    case 'multi_field':
      return typeof value === 'object' && Object.keys(value).length > 0;

    case 'choice_multi':
      return Array.isArray(value) && value.length > 0;

    default:
      return true;
  }
}

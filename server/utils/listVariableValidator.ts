/**
 * List Variable Validator
 * Validates that an object conforms to the ListVariable interface
 */

import type { ListVariable } from "@shared/types/blocks";
import { logger } from "../logger";

/**
 * Check if a value is a valid ListVariable
 */
export function isListVariable(value: unknown): value is ListVariable {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as any;

  // Check required properties
  if (!v.metadata || typeof v.metadata !== "object") {
    return false;
  }

  if (!v.rows || !Array.isArray(v.rows)) {
    return false;
  }

  if (typeof v.count !== "number") {
    return false;
  }

  if (!v.columns || !Array.isArray(v.columns)) {
    return false;
  }

  // Check metadata has required fields
  if (!v.metadata.source) {
    return false;
  }

  // Check columns have required structure
  for (const col of v.columns) {
    if (!col.id || !col.name || !col.type) {
      return false;
    }
  }

  return true;
}

/**
 * Validate and normalize a potential ListVariable output
 * Returns the value if valid, or null if invalid
 */
export function validateListVariable(
  value: unknown,
  context?: { stepId?: string; stepAlias?: string }
): ListVariable | null {
  if (!isListVariable(value)) {
    logger.warn(
      {
        stepId: context?.stepId,
        stepAlias: context?.stepAlias,
        hasMetadata: !!(value as any)?.metadata,
        hasRows: Array.isArray((value as any)?.rows),
        hasCount: typeof (value as any)?.count === "number",
        hasColumns: Array.isArray((value as any)?.columns),
      },
      "Invalid ListVariable format in JS block output"
    );
    return null;
  }

  return value as ListVariable;
}

/**
 * Create an empty ListVariable
 */
export function createEmptyListVariable(
  source: "read_table" | "query" | "list_tools" = "read_table"
): ListVariable {
  return {
    metadata: {
      source,
    },
    rows: [],
    count: 0,
    columns: [],
  };
}

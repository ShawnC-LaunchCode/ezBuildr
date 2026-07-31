/**
 * List Variable Validator
 * Validates that an object conforms to the ListVariable interface
 */

import type { ListVariable } from "@shared/types/blocks";

import { logger } from "../logger";

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

/**
 * Check if a value is a valid ListVariable
 */
export function isListVariable(value: unknown): value is ListVariable {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;
  const metadata = toRecord(v.metadata);

  // Check required properties
  if (!metadata) {
    return false;
  }

  if (!Array.isArray(v.rows)) {
    return false;
  }

  if (typeof v.count !== "number") {
    return false;
  }

  if (!Array.isArray(v.columns)) {
    return false;
  }

  // Check metadata has required fields
  if (typeof metadata.source !== "string") {
    return false;
  }

  // Check columns have required structure
  for (const col of v.columns) {
    const column = toRecord(col);
    if (
      !column
      || typeof column.id !== "string"
      || typeof column.name !== "string"
      || typeof column.type !== "string"
    ) {
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
    const candidate = toRecord(value);
    logger.warn(
      {
        stepId: context?.stepId,
        stepAlias: context?.stepAlias,
        hasMetadata: toRecord(candidate?.metadata) !== null,
        hasRows: Array.isArray(candidate?.rows),
        hasCount: typeof candidate?.count === "number",
        hasColumns: Array.isArray(candidate?.columns),
      },
      "Invalid ListVariable format in JS block output"
    );
    return null;
  }

  return value;
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

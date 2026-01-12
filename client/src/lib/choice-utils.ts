import type { DynamicOptionsConfig, ChoiceOption } from "@/../../shared/types/stepConfigs";
import { transformList, getFieldValue, isListVariable, arrayToListVariable } from "@/../../shared/listPipeline";
import type { ListVariable } from "@/../../shared/types/blocks";

/**
 * Generate choice options from a list variable with full transformation support
 * Uses the shared list pipeline for consistent behavior with List Tools blocks
 */
export function generateOptionsFromList(
  listData: any,
  config: DynamicOptionsConfig,
  context?: Record<string, any>
): ChoiceOption[] {
  if (config.type !== 'list') return [];

  const { listVariable, labelPath, valuePath, labelTemplate, groupByPath, transform, includeBlankOption, blankLabel } = config;

  // Normalize input to ListVariable
  let inputList: ListVariable;
  if (isListVariable(listData)) {
    inputList = listData as ListVariable;
  } else if (Array.isArray(listData)) {
    inputList = arrayToListVariable(listData);
  } else {
    console.warn('[generateOptionsFromList] Invalid list data:', listData);
    return [];
  }

  // Apply transformations (filter, sort, limit, dedupe, select)
  let transformedList = inputList;
  if (transform) {
    transformedList = transformList(inputList, transform, context);
  }

  // Map rows to options
  let opts: ChoiceOption[] = transformedList.rows.map((row, idx) => {
    // Value (stored data)
    const value = getFieldValue(row, valuePath);
    const alias = value !== undefined && value !== null ? String(value) : `opt-${idx}`;

    // Label (display text)
    let label = '';
    if (labelTemplate) {
      // Build column mapping (Name -> ID)
      const columnMap = new Map<string, string>();
      if (inputList.columns) {
        inputList.columns.forEach(col => {
          columnMap.set(col.name, col.id);
        });
      }

      // Template mode: Replace {FieldName} with values
      label = labelTemplate.replace(/\{([^}]+)\}/g, (_, fieldName) => {
        // Try direct field name first, then look up ID from mapping
        let val = getFieldValue(row, fieldName);
        if (val === undefined && columnMap.has(fieldName)) {
          val = getFieldValue(row, columnMap.get(fieldName)!);
        }
        return val !== undefined && val !== null ? String(val) : '';
      });
    } else {
      // Simple mode: Use labelPath
      const labelValue = getFieldValue(row, labelPath);
      label = labelValue !== undefined && labelValue !== null ? String(labelValue) : alias;
    }

    // Group (optional)
    const groupValue = groupByPath ? getFieldValue(row, groupByPath) : undefined;

    return {
      id: row.id || alias,
      label,
      alias,
      ...(groupValue !== undefined ? { group: String(groupValue) } : {})
    };
  });

  // Add blank option at the top
  if (includeBlankOption) {
    opts.unshift({
      id: 'blank',
      label: blankLabel || '',
      alias: ''
    });
  }

  return opts;
}

/**
 * Field Path Validation Helpers
 */

/**
 * Check if a field path exists in a list variable's columns
 */
export function validateFieldPath(
  fieldPath: string | undefined,
  listVariable: ListVariable | undefined
): { valid: boolean; message?: string } {
  if (!fieldPath) {
    return { valid: false, message: 'Field path is required' };
  }

  if (!listVariable || !listVariable.columns || listVariable.columns.length === 0) {
    return { valid: true }; // Can't validate without column metadata, assume valid
  }

  // Check if field path matches any column ID or name
  const matchesColumn = listVariable.columns.some(col =>
    col.id === fieldPath || col.name === fieldPath
  );

  if (!matchesColumn) {
    return {
      valid: false,
      message: `Field "${fieldPath}" not found in source list`
    };
  }

  return { valid: true };
}

/**
 * Get available field paths from a list variable
 */
export function getAvailableFieldPaths(
  listVariable: ListVariable | undefined
): Array<{ id: string; name: string; type?: string }> {
  if (!listVariable || !listVariable.columns) {
    return [];
  }

  return listVariable.columns.map(col => ({
    id: col.id,
    name: col.name,
    type: col.type
  }));
}

/**
 * Validate a full transform configuration
 */
export function validateTransformConfig(
  transform: any,
  sourceList: ListVariable | undefined
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!transform || !sourceList) return errors;

  // Validate filter field paths
  if (transform.filters?.rules) {
    transform.filters.rules.forEach((rule: any, index: number) => {
      const validation = validateFieldPath(rule.fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `filters.rules[${index}].fieldPath`,
          message: validation.message || 'Invalid field path'
        });
      }
    });
  }

  // Validate sort field paths
  if (transform.sort) {
    transform.sort.forEach((sortKey: any, index: number) => {
      const validation = validateFieldPath(sortKey.fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `sort[${index}].fieldPath`,
          message: validation.message || 'Invalid field path'
        });
      }
    });
  }

  // Validate dedupe field path
  if (transform.dedupe?.fieldPath) {
    const validation = validateFieldPath(transform.dedupe.fieldPath, sourceList);
    if (!validation.valid) {
      errors.push({
        field: 'dedupe.fieldPath',
        message: validation.message || 'Invalid field path'
      });
    }
  }

  // Validate select field paths
  if (transform.select) {
    transform.select.forEach((fieldPath: string, index: number) => {
      const validation = validateFieldPath(fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `select[${index}]`,
          message: validation.message || 'Invalid field path'
        });
      }
    });
  }

  return errors;
}

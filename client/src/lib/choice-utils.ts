import { transformList, getFieldValue, isListVariable, arrayToListVariable } from "@shared/listPipeline";
import type { ListVariable } from "@shared/types/blocks";
import type { DynamicOptionsConfig, ChoiceOption } from "@shared/types/stepConfigs";

export function isListValue(data: unknown): data is { items: Array<{ itemId?: string; values?: Record<string, unknown> }> } {
  return (
    typeof data === 'object' &&
    data !== null &&
    !('metadata' in data && 'rows' in data) &&
    Array.isArray((data as { items?: unknown }).items)
  );
}

/**
 * Generate choice options from a list variable with full transformation support
 * Uses the shared list pipeline for consistent behavior with List Tools blocks
 */
export function generateOptionsFromList(
  listData: unknown,
  config: DynamicOptionsConfig,
  context?: Record<string, unknown>
): ChoiceOption[] {
  if (config.type !== 'list') {return [];}

  const { labelPath, valuePath, labelTemplate, groupByPath, transform, includeBlankOption, blankLabel } = config;

  // Normalize input to ListVariable
  let inputList: ListVariable;
  if (isListVariable(listData)) {
    inputList = listData;
  } else if (isListValue(listData)) {
    // List step value: { items: ListItem[] }. Only the top level is projected —
    // a nested list stays an opaque field value on its parent row, so nested
    // items can never become options. That is a product constraint, not a gap.
    const allKeys = new Set<string>();
    allKeys.add('itemId');
    listData.items.forEach(item => {
      if (item.values !== undefined && typeof item.values === 'object' && item.values !== null) {
        Object.keys(item.values).forEach(key => allKeys.add(key));
      }
    });

    const columns = Array.from(allKeys).map(key => ({
      id: key,
      name: key,
      type: 'text'
    }));

    inputList = {
      metadata: { source: 'list_tools' },
      rows: listData.items.map((item, idx) => {
        const values = item.values !== undefined && typeof item.values === 'object' && item.values !== null
          ? item.values
          : {};
        const itemId = (typeof item.itemId === 'string' ? item.itemId : undefined) ?? `item-${idx}`;
        return {
          id: itemId,
          itemId,
          ...values
        };
      }),
      count: listData.items.length,
      columns
    };
  } else if (Array.isArray(listData)) {
    inputList = arrayToListVariable(listData);
  } else {
    console.warn('[generateOptionsFromList] Invalid list data:', listData);
    return [];
  }

  // Apply transformations (filter, sort, limit, dedupe, select)
  let transformedList = inputList;
  if (transform !== undefined && transform !== null) {
    transformedList = transformList(inputList, transform, context);
  }

  // Map rows to options
  const opts: ChoiceOption[] = transformedList.rows.map((row, idx) => {
    // Value (stored data)
    // Deliberate departure from Choice Value Model (CVM) convention of storing labels:
    // When a choice question is bound to a list step, the stored value is the item's stable itemId
    // (defaulting valuePath to itemId). This ensures that if the respondent renames an item
    // mid-interview (edits the fields its label derives from), existing selections do not break silently.
    const rawValue = getFieldValue(row, valuePath);
    const value = rawValue ?? getFieldValue(row, 'itemId') ?? row.id;
    const alias = value !== undefined && value !== null ? String(value) : `opt-${idx}`;

    // Label (display text)
    let label = '';
    if (labelTemplate != null && labelTemplate.trim() !== '') {
      // Build column mapping (Name -> ID)
      const columnMap = new Map<string, string>();
      if (inputList.columns != null) {
        inputList.columns.forEach(col => {
          columnMap.set(col.name, col.id);
        });
      }

      // Template mode: Replace {FieldName} with values
      label = labelTemplate.replace(/\{([^}]+)\}/g, (_, fieldName: string) => {
        const key = fieldName.trim();
        // Try direct field name first, then look up ID from mapping
        let val = getFieldValue(row, key);
        if (val === undefined && columnMap.has(key)) {
          val = getFieldValue(row, columnMap.get(key)!);
        }
        return val !== undefined && val !== null ? String(val) : '';
      });
      if (label.trim() === '') {
        label = `Item ${idx + 1}`;
      }
    } else {
      // Simple mode: Use labelPath
      const labelValue = getFieldValue(row, labelPath);
      label = labelValue !== undefined && labelValue !== null ? String(labelValue) : '';
      if (label.trim() === '') {
        label = alias || `Item ${idx + 1}`;
      }
    }

    // Group (optional)
    const groupValue = groupByPath != null ? getFieldValue(row, groupByPath) : undefined;

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
      label: blankLabel ?? '',
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

  if (!listVariable?.columns || listVariable.columns.length === 0) {
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
  if (!listVariable?.columns) {
    return [];
  }

  return listVariable.columns.map(col => ({
    id: col.id,
    name: col.name,
    type: col.type
  }));
}

interface TransformConfig {
  filters?: {
    rules: Array<{ fieldPath: string }>;
  };
  sort?: Array<{ fieldPath: string }>;
  dedupe?: {
    fieldPath: string;
  };
  select?: string[];
}

/**
 * Validate a full transform configuration
 */
export function validateTransformConfig(
  transform: unknown,
  sourceList: ListVariable | undefined
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (transform == null || sourceList == null) {return errors;}

  const typedTransform = transform as TransformConfig;

  // Validate filter field paths
  if (typedTransform.filters?.rules != null) {
    typedTransform.filters.rules.forEach((rule, index: number) => {
      const validation = validateFieldPath(rule.fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `filters.rules[${index}].fieldPath`,
          message: validation.message ?? 'Invalid field path'
        });
      }
    });
  }

  // Validate sort field paths
  if (typedTransform.sort != null) {
    typedTransform.sort.forEach((sortKey, index: number) => {
      const validation = validateFieldPath(sortKey.fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `sort[${index}].fieldPath`,
          message: validation.message ?? 'Invalid field path'
        });
      }
    });
  }

  // Validate dedupe field path
  if (typedTransform.dedupe?.fieldPath != null) {
    const validation = validateFieldPath(typedTransform.dedupe.fieldPath, sourceList);
    if (!validation.valid) {
      errors.push({
        field: 'dedupe.fieldPath',
        message: validation.message ?? 'Invalid field path'
      });
    }
  }

  // Validate select field paths
  if (typedTransform.select != null) {
    typedTransform.select.forEach((fieldPath: string, index: number) => {
      const validation = validateFieldPath(fieldPath, sourceList);
      if (!validation.valid) {
        errors.push({
          field: `select[${index}]`,
          message: validation.message ?? 'Invalid field path'
        });
      }
    });
  }

  return errors;
}

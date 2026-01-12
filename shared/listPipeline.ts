/**
 * Shared List Transformation Pipeline
 *
 * Extracted from List Tools block to provide consistent list transformation
 * behavior across the platform (List Tools blocks + Choice questions).
 *
 * This module operates on in-memory list data and does NOT perform database queries.
 */

import type { ListVariable, ListToolsFilterGroup, ListToolsFilterRule, ListToolsSortKey, ListToolsDedupe, ReadTableOperator } from './types/blocks';

/**
 * Get value from object using dot notation path
 * Examples: "name", "address.city", "user.profile.age"
 */
export function getFieldValue(obj: any, fieldPath: string): any {
  if (!fieldPath) return undefined;

  const keys = fieldPath.split('.');
  let value: any = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }

  return value;
}

/**
 * Evaluate a single filter rule against a row
 */
export function evaluateFilterRule(
  row: any,
  rule: ListToolsFilterRule,
  context?: Record<string, any>
): boolean {
  const fieldValue = getFieldValue(row, rule.fieldPath);

  // Resolve comparison value (constant or variable reference)
  let compareValue = rule.value;
  if (rule.valueSource === 'var' && context && rule.value) {
    compareValue = context[rule.value as string];
  }

  // Apply operator
  switch (rule.op) {
    case 'equals':
      // Strict equality for predictability
      return fieldValue === compareValue;

    case 'not_equals':
      // Strict inequality
      return fieldValue !== compareValue;

    case 'contains':
      return String(fieldValue || '').includes(String(compareValue || ''));

    case 'not_contains':
      return !String(fieldValue || '').includes(String(compareValue || ''));

    case 'starts_with':
      return String(fieldValue || '').startsWith(String(compareValue || ''));

    case 'ends_with':
      return String(fieldValue || '').endsWith(String(compareValue || ''));

    // Case-insensitive variants
    case 'equals_ci':
      return String(fieldValue || '').toLowerCase() === String(compareValue || '').toLowerCase();

    case 'contains_ci':
      return String(fieldValue || '').toLowerCase().includes(String(compareValue || '').toLowerCase());

    case 'not_contains_ci':
      return !String(fieldValue || '').toLowerCase().includes(String(compareValue || '').toLowerCase());

    case 'starts_with_ci':
      return String(fieldValue || '').toLowerCase().startsWith(String(compareValue || '').toLowerCase());

    case 'ends_with_ci':
      return String(fieldValue || '').toLowerCase().endsWith(String(compareValue || '').toLowerCase());

    case 'greater_than':
      return (fieldValue as number) > (compareValue as number);

    case 'gte':
      return (fieldValue as number) >= (compareValue as number);

    case 'less_than':
      return (fieldValue as number) < (compareValue as number);

    case 'lte':
      return (fieldValue as number) <= (compareValue as number);

    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';

    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';

    case 'in_list':
    case 'in':
      if (!Array.isArray(compareValue)) return false;
      // Strict equality for predictability
      return compareValue.some(v => v === fieldValue);

    case 'not_in_list':
      if (!Array.isArray(compareValue)) return true;
      // Strict equality
      return !compareValue.some(v => v === fieldValue);

    case 'exists':
      return fieldValue !== undefined;

    default:
      return false;
  }
}

/**
 * Evaluate filter group (supports AND/OR + nested groups)
 */
export function evaluateFilterGroup(
  row: any,
  group: ListToolsFilterGroup,
  context?: Record<string, any>
): boolean {
  const results: boolean[] = [];

  // Evaluate rules
  if (group.rules) {
    for (const rule of group.rules) {
      results.push(evaluateFilterRule(row, rule, context));
    }
  }

  // Evaluate nested groups (recursive)
  if (group.groups) {
    for (const nestedGroup of group.groups) {
      results.push(evaluateFilterGroup(row, nestedGroup, context));
    }
  }

  // Combine with combinator
  if (group.combinator === 'and') {
    return results.every(r => r);
  } else { // 'or'
    return results.some(r => r);
  }
}

/**
 * Apply filters to list
 */
export function applyListFilters(
  list: ListVariable,
  filterGroup: ListToolsFilterGroup,
  context?: Record<string, any>
): ListVariable {
  const filteredRows = list.rows.filter(row =>
    evaluateFilterGroup(row, filterGroup, context)
  );

  return {
    ...list,
    rows: filteredRows,
    count: filteredRows.length
  };
}

/**
 * Apply multi-key sorting to list
 */
export function applyListSort(
  list: ListVariable,
  sortKeys: ListToolsSortKey[]
): ListVariable {
  if (!sortKeys || sortKeys.length === 0) return list;

  const sortedRows = [...list.rows].sort((a, b) => {
    for (const sortKey of sortKeys) {
      const valA = getFieldValue(a, sortKey.fieldPath);
      const valB = getFieldValue(b, sortKey.fieldPath);

      // Handle null/undefined
      if (valA == null && valB == null) continue;
      if (valA == null) return sortKey.direction === 'asc' ? -1 : 1;
      if (valB == null) return sortKey.direction === 'asc' ? 1 : -1;

      // Compare values
      let cmp = 0;
      if (valA < valB) cmp = -1;
      else if (valA > valB) cmp = 1;

      if (cmp !== 0) {
        return sortKey.direction === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });

  return {
    ...list,
    rows: sortedRows
  };
}

/**
 * Apply offset and limit (pagination)
 */
export function applyListRange(
  list: ListVariable,
  offset: number = 0,
  limit?: number
): ListVariable {
  let slicedRows = list.rows;

  if (offset > 0) {
    slicedRows = slicedRows.slice(offset);
  }

  // limit=0 returns empty list, undefined/null means no limit
  if (limit !== undefined && limit !== null) {
    if (limit === 0) {
      slicedRows = [];
    } else {
      slicedRows = slicedRows.slice(0, limit);
    }
  }

  return {
    ...list,
    rows: slicedRows,
    count: slicedRows.length
  };
}

/**
 * Apply column selection (projection)
 * Always preserves 'id' field
 */
export function applyListSelect(
  list: ListVariable,
  selectFields: string[]
): ListVariable {
  const selectedRows = list.rows.map(row => {
    const newRow: any = {};

    // Always preserve id
    if (row.id !== undefined) {
      newRow.id = row.id;
    }

    // Select specified fields
    for (const fieldPath of selectFields) {
      const value = getFieldValue(row, fieldPath);
      if (value !== undefined) {
        newRow[fieldPath] = value;
      }
    }

    return newRow;
  });

  return {
    ...list,
    rows: selectedRows,
    columns: list.columns.filter(col =>
      selectFields.includes(col.id) || col.id === 'id'
    )
  };
}

/**
 * Apply deduplication by field
 * Only deduplicates non-null/non-undefined values; keeps all rows with null/undefined dedupe keys
 */
export function applyListDedupe(
  list: ListVariable,
  dedupe: ListToolsDedupe
): ListVariable {
  const seen = new Set<any>();
  const dedupedRows = list.rows.filter(row => {
    const value = getFieldValue(row, dedupe.fieldPath);

    // Don't dedupe null/undefined values - keep all of them
    if (value === null || value === undefined) {
      return true;
    }

    const key = JSON.stringify(value); // Handle objects

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ...list,
    rows: dedupedRows,
    count: dedupedRows.length
  };
}

/**
 * Full list transformation pipeline
 * Applies operations in order: filter → sort → offset/limit → select → dedupe
 */
export interface ListTransformConfig {
  filters?: ListToolsFilterGroup;
  sort?: ListToolsSortKey[];
  limit?: number;
  offset?: number;
  select?: string[];
  dedupe?: ListToolsDedupe;
}

export function transformList(
  inputList: ListVariable | any[],
  config: ListTransformConfig,
  context?: Record<string, any>
): ListVariable {
  // Normalize input
  let workingList: ListVariable;
  if (isListVariable(inputList)) {
    workingList = inputList as ListVariable;
  } else if (Array.isArray(inputList)) {
    workingList = arrayToListVariable(inputList);
  } else {
    // Invalid input, return empty
    return {
      metadata: { source: 'list_tools' },
      rows: [],
      count: 0,
      columns: []
    };
  }

  let resultList = workingList;

  // 1. Filter
  if (config.filters) {
    resultList = applyListFilters(resultList, config.filters, context);
  }

  // 2. Sort
  if (config.sort && config.sort.length > 0) {
    resultList = applyListSort(resultList, config.sort);
  }

  // 3. Offset & Limit
  if (config.offset !== undefined || config.limit !== undefined) {
    resultList = applyListRange(resultList, config.offset, config.limit);
  }

  // 4. Select
  if (config.select && config.select.length > 0) {
    resultList = applyListSelect(resultList, config.select);
  }

  // 5. Dedupe
  if (config.dedupe) {
    resultList = applyListDedupe(resultList, config.dedupe);
  }

  return resultList;
}

/**
 * Helper: Check if data is a ListVariable
 */
export function isListVariable(data: any): boolean {
  return data && typeof data === 'object' && 'rows' in data && 'columns' in data && 'metadata' in data;
}

/**
 * Helper: Convert plain array to ListVariable
 */
export function arrayToListVariable(array: any[]): ListVariable {
  // Extract all unique keys from array items
  const allKeys = new Set<string>();
  array.forEach(item => {
    if (item && typeof item === 'object') {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });

  const columns = Array.from(allKeys).map(key => ({
    id: key,
    name: key,
    type: 'text'
  }));

  return {
    metadata: { source: 'list_tools' },
    rows: array.map((item, idx) => ({
      id: item?.id || `row-${idx}`,
      ...item
    })),
    count: array.length,
    columns
  };
}

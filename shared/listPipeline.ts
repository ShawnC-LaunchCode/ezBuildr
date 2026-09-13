/**
 * Shared List Transformation Pipeline
 *
 * Extracted from List Tools block to provide consistent list transformation
 * behavior across the platform (List Tools blocks + Choice questions).
 *
 * This module operates on in-memory list data and does NOT perform database queries.
 */

import type { ListVariable, ListToolsFilterGroup, ListToolsFilterRule, ListToolsSortKey, ListToolsDedupe } from './types/blocks';

/** Row from a ListVariable - has an id and arbitrary column values */
type ListRow = ListVariable['rows'][number];

/**
 * Get value from object using dot notation path
 * Examples: "name", "address.city", "user.profile.age"
 */
export function getFieldValue(obj: Record<string, unknown>, fieldPath: string): unknown {
  if (!fieldPath) {return undefined;}

  const keys = fieldPath.split('.');
  let value: unknown = obj;

  for (const key of keys) {
    if (value === null || value === undefined) {return undefined;}
    value = (value as Record<string, unknown>)[key];
  }

  return value;
}

/** Convert unknown to string safely for comparison */
function safeStr(value: unknown): string {
  return String(value ?? '');
}

/**
 * Evaluate a single filter rule against a row
 */
// eslint-disable-next-line complexity -- operator dispatch table
export function evaluateFilterRule(
  row: Record<string, unknown>,
  rule: ListToolsFilterRule,
  context?: Record<string, unknown>
): boolean {
  const fieldValue: unknown = getFieldValue(row, rule.fieldPath);

  // Resolve comparison value (constant or variable reference)
  let compareValue: unknown = rule.value;
  if (rule.valueSource === 'var' && context !== undefined && rule.value !== undefined && rule.value !== null) {
    compareValue = context[rule.value as string];
  }

  // Apply operator
  switch (rule.op) {
    case 'equals':
      return fieldValue === compareValue;

    case 'not_equals':
      return fieldValue !== compareValue;

    case 'contains':
      return safeStr(fieldValue).includes(safeStr(compareValue));

    case 'not_contains':
      return !safeStr(fieldValue).includes(safeStr(compareValue));

    case 'starts_with':
      return safeStr(fieldValue).startsWith(safeStr(compareValue));

    case 'ends_with':
      return safeStr(fieldValue).endsWith(safeStr(compareValue));

    // Case-insensitive variants
    case 'equals_ci':
      return safeStr(fieldValue).toLowerCase() === safeStr(compareValue).toLowerCase();

    case 'contains_ci':
      return safeStr(fieldValue).toLowerCase().includes(safeStr(compareValue).toLowerCase());

    case 'not_contains_ci':
      return !safeStr(fieldValue).toLowerCase().includes(safeStr(compareValue).toLowerCase());

    case 'starts_with_ci':
      return safeStr(fieldValue).toLowerCase().startsWith(safeStr(compareValue).toLowerCase());

    case 'ends_with_ci':
      return safeStr(fieldValue).toLowerCase().endsWith(safeStr(compareValue).toLowerCase());

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
      if (!Array.isArray(compareValue)) {return false;}
      return compareValue.some(v => v === fieldValue);

    case 'not_in_list':
      if (!Array.isArray(compareValue)) {return true;}
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
  row: Record<string, unknown>,
  group: ListToolsFilterGroup,
  context?: Record<string, unknown>
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
  context?: Record<string, unknown>
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
  if (sortKeys.length === 0) {return list;}

  // eslint-disable-next-line sonarjs/cognitive-complexity -- multi-key sort comparator
  const sortedRows = [...list.rows].sort((a, b) => {
    for (const sortKey of sortKeys) {
      const valA: unknown = getFieldValue(a, sortKey.fieldPath);
      const valB: unknown = getFieldValue(b, sortKey.fieldPath);

      // Handle null/undefined
      if ((valA === null || valA === undefined) && (valB === null || valB === undefined)) {continue;}
      if (valA === null || valA === undefined) {return sortKey.direction === 'asc' ? -1 : 1;}
      if (valB === null || valB === undefined) {return sortKey.direction === 'asc' ? 1 : -1;}

      // Compare values
      let cmp = 0;
      if (valA < valB) {cmp = -1;}
      else if (valA > valB) {cmp = 1;}

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
  const selectedRows: ListRow[] = list.rows.map(row => {
    const newRow: Record<string, unknown> = {};

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

    return newRow as ListRow;
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
  const seen = new Set<string>();
  const dedupedRows = list.rows.filter(row => {
    const value: unknown = getFieldValue(row, dedupe.fieldPath);

    // Don't dedupe null/undefined values - keep all of them
    if (value === null || value === undefined) {
      return true;
    }

    const key = JSON.stringify(value); // Handle objects

    if (seen.has(key)) {return false;}
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
  inputList: ListVariable | unknown[],
  config: ListTransformConfig,
  context?: Record<string, unknown>
): ListVariable {
  // Normalize input
  let workingList: ListVariable;
  if (isListVariable(inputList)) {
    workingList = inputList;
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
export function isListVariable(data: unknown): data is ListVariable {
  return data !== null && data !== undefined && typeof data === 'object' && 'rows' in data && 'columns' in data && 'metadata' in data;
}

/**
 * A `list` question's stored value: `{ items: [...] }`. Loosely typed
 * (`itemId`/`values` both optional) because this guards data straight off a
 * step's raw JSON value — the stronger guarantee (`itemId: string`,
 * `values: Record<...>`) lives in `ListValue`/`ListItem`
 * (`shared/types/stepConfigs.ts`), which every real `list` step value
 * satisfies, but this check must not crash on something malformed.
 */
export interface ListValueEnvelope {
  items: Array<{ itemId?: string; values?: Record<string, unknown> }>;
}

/**
 * Helper: Check if data is a `list` question's stored envelope, as distinct
 * from a `ListVariable` (also an object, but shaped `{ rows, columns,
 * metadata }` rather than `{ items }`).
 */
export function isListValue(data: unknown): data is ListValueEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    !('metadata' in data && 'rows' in data) &&
    Array.isArray((data as { items?: unknown }).items)
  );
}

/**
 * Convert a `list` question's stored `ListValue` envelope into row-shaped
 * `ListVariable` data, for consumers that operate on rows rather than the
 * envelope — the List Tools block (LIST-B15) and Choice's list-bound dynamic
 * options (LIST-12). This is the single implementation both share.
 *
 * Only the top level is projected: a nested list field stays an opaque value
 * on its parent row, so nested items can never surface as their own rows —
 * that is a product constraint, not a gap.
 *
 * Keeps `itemId` as both `row.id` and `row.itemId`, unlike `projectListValue`
 * (`shared/types/stepConfigs.ts`), which strips it — that function feeds
 * documents and scripts plain alias-keyed data with no need for the row's own
 * identity, while a List Tools row must keep it (e.g. so a later block or a
 * document loop can still key off the stable item id after filtering).
 */
export function listValueToListVariable(value: ListValueEnvelope): ListVariable {
  const allKeys = new Set<string>();
  allKeys.add('itemId');
  value.items.forEach(item => {
    if (item.values !== undefined && typeof item.values === 'object' && item.values !== null) {
      Object.keys(item.values).forEach(key => allKeys.add(key));
    }
  });

  const columns = Array.from(allKeys).map(key => ({
    id: key,
    name: key,
    type: 'text'
  }));

  return {
    metadata: { source: 'list_tools' },
    rows: value.items.map((item, idx) => {
      const values = item.values !== undefined && typeof item.values === 'object' && item.values !== null
        ? item.values
        : {};
      const itemId = (typeof item.itemId === 'string' ? item.itemId : undefined) ?? `item-${idx}`;
      return {
        id: itemId,
        itemId,
        ...values
      } as ListRow;
    }),
    count: value.items.length,
    columns
  };
}

/**
 * Helper: Convert plain array to ListVariable
 */
export function arrayToListVariable(array: unknown[]): ListVariable {
  // Extract all unique keys from array items
  const allKeys = new Set<string>();
  array.forEach(item => {
    if (item !== null && item !== undefined && typeof item === 'object') {
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
    rows: array.map((item, idx) => {
      const obj = (item !== null && item !== undefined && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        id: (typeof obj.id === 'string' ? obj.id : undefined) ?? `row-${String(idx)}`,
        ...obj
      } as ListRow;
    }),
    count: array.length,
    columns
  };
}

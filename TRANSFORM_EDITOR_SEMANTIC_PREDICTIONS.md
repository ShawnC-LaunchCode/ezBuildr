# Transform Editor Semantic Predictions
**Based on Runtime Code Analysis**
**Source:** `shared/listPipeline.ts`
**Date:** 2026-01-10

---

## Executive Summary

After analyzing the actual runtime implementation in `listPipeline.ts`, here are the key semantic behaviors you'll encounter during testing. These predictions are based on the actual code, not documentation.

---

## Type Coercion & Comparison Semantics

### equals / not_equals Operators
**Code:** Lines 48-54
```typescript
case 'equals':
  return fieldValue == compareValue; // Uses == (loose equality)

case 'not_equals':
  return fieldValue != compareValue; // Uses != (loose inequality)
```

**Prediction:**
- ✅ String "123" == Number 123 → TRUE (type coercion happens)
- ✅ String "true" == Boolean true → FALSE (no coercion for booleans)
- ✅ null == undefined → TRUE (loose equality quirk)
- ⚠️ This is intentional but may surprise users expecting strict equality

**Test Impact:** TC1.4 (Numeric Operators) - "123" vs 123 will be treated as EQUAL

---

### in_list / not_in_list Operators
**Code:** Lines 86-95
```typescript
case 'in_list':
  if (!Array.isArray(compareValue)) return false;
  return compareValue.some(v => v == fieldValue); // Uses ==

case 'not_in_list':
  if (!Array.isArray(compareValue)) return true;
  return !compareValue.some(v => v == fieldValue);
```

**Prediction:**
- ✅ List [1, 2, 3] contains "2" → TRUE (type coercion)
- ✅ Non-array value → `in_list` returns FALSE, `not_in_list` returns TRUE
- ⚠️ Users may expect strict matching

**Test Impact:** TC1.5 (List Operators) - Type coercion will happen

---

### Numeric Comparison Operators
**Code:** Lines 68-78
```typescript
case 'greater_than':
  return (fieldValue as number) > (compareValue as number);

case 'gte':
  return (fieldValue as number) >= (compareValue as number);

case 'less_than':
  return (fieldValue as number) < (compareValue as number);

case 'lte':
  return (fieldValue as number) <= (compareValue as number);
```

**Prediction:**
- ✅ String "10" > Number 2 → TRUE (JavaScript coerces to numbers)
- ✅ String "10" > String "2" → FALSE (lexicographic comparison)
- ⚠️ Behavior depends on whether BOTH values are numbers or not
- ⚠️ No explicit Number() coercion, relies on JavaScript's type coercion rules

**Test Impact:** TC1.4 (Numeric Operators) - Test with both numeric strings and numbers

---

## Null, Undefined, and Empty String Handling

### is_empty Operator
**Code:** Line 80-81
```typescript
case 'is_empty':
  return fieldValue === null || fieldValue === undefined || fieldValue === '';
```

**Prediction:**
- ✅ Catches: null, undefined, empty string ""
- ❌ Does NOT catch: 0, false, [], {}
- ✅ Strict equality (===) used for each check

**Test Impact:** TC1.2 (Null Handling)
- `is_empty` catches null: YES
- `is_empty` catches undefined: YES
- `is_empty` catches empty string: YES

---

### is_not_empty Operator
**Code:** Line 83-84
```typescript
case 'is_not_empty':
  return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
```

**Prediction:**
- ✅ Returns TRUE for: any value except null, undefined, or ""
- ✅ Returns TRUE for: 0, false, [], {} (these are NOT considered empty)

**Test Impact:** TC1.2 (Null Handling) - is_not_empty excludes null/empty correctly

---

### exists Operator
**Code:** Line 97-98
```typescript
case 'exists':
  return fieldValue !== undefined;
```

**Prediction:**
- ✅ Only checks for undefined
- ✅ null is considered "exists" (field is present with null value)
- ⚠️ Distinction: `exists` = "field is defined", `is_not_empty` = "field has value"

**Test Impact:** TC1.1 (Operators hiding value input) - exists behavior differs from is_empty

---

### Null Handling in Field Path Resolution
**Code:** Lines 16-28
```typescript
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
```

**Prediction:**
- ✅ Accessing nested field on null/undefined returns undefined
- ✅ "address.city" when address is null → undefined
- ✅ No errors thrown, gracefully returns undefined

**Test Impact:** TC4.4 (Select with dot notation) - Nested nulls handled gracefully

---

## String Operator Case Sensitivity

### contains / not_contains / starts_with / ends_with
**Code:** Lines 56-66
```typescript
case 'contains':
  return String(fieldValue || '').includes(String(compareValue || ''));

case 'not_contains':
  return !String(fieldValue || '').includes(String(compareValue || ''));

case 'starts_with':
  return String(fieldValue || '').startsWith(String(compareValue || ''));

case 'ends_with':
  return String(fieldValue || '').endsWith(String(compareValue || ''));
```

**Prediction:**
- ❌ CASE-SENSITIVE (uses native JavaScript String methods)
- ✅ "Hello".includes("hello") → FALSE
- ⚠️ If documentation claims case-insensitive, this is a DISCREPANCY
- ⚠️ No .toLowerCase() applied

**Test Impact:** TC1.3 (String Operators)
- Expected per docs: Case-insensitive
- Actual implementation: CASE-SENSITIVE
- This is a SEMANTIC SURPRISE to document

---

## Multi-Key Sorting Semantics

### Sort Stability
**Code:** Lines 165-190
```typescript
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
```

**Prediction:**
- ✅ JavaScript Array.sort() is STABLE (ES2019+)
- ✅ Equal values maintain original order
- ✅ Multi-key sorting respects priority (first key dominates)
- ✅ `if (cmp !== 0)` ensures next sort key is only used if values are equal

**Test Impact:** TC2.4 (Sort Stability) - Sort IS stable, multiple runs will be consistent

---

### Null Placement in Sorting
**Code:** Lines 171-173
```typescript
if (valA == null && valB == null) continue; // Both null, treat as equal
if (valA == null) return sortKey.direction === 'asc' ? -1 : 1;
if (valB == null) return sortKey.direction === 'asc' ? 1 : -1;
```

**Prediction:**
- ✅ Ascending: Nulls appear FIRST (return -1 means A comes before B)
- ✅ Descending: Nulls appear LAST (return 1 means B comes before A)
- ✅ Consistent behavior regardless of field type

**Test Impact:** TC2.6 (Null Handling in Sort)
- Ascending: Nulls FIRST
- Descending: Nulls LAST

---

### Numeric vs Lexicographic Sorting
**Code:** Lines 176-178
```typescript
let cmp = 0;
if (valA < valB) cmp = -1;
else if (valA > valB) cmp = 1;
```

**Prediction:**
- ⚠️ Uses JavaScript's `<` and `>` operators
- ✅ Number fields: Numeric comparison (10 > 2)
- ⚠️ String number fields: Lexicographic comparison ("10" < "2")
- ⚠️ Mixed types: Unpredictable (JavaScript type coercion)

**Test Impact:** TC2.5 (Numeric Sorting)
- If field is stored as NUMBER → numeric sort (correct)
- If field is stored as STRING → lexicographic sort ("10" < "2" is TRUE)
- Behavior depends on DataVault column type

---

## Offset & Limit Semantics

### Offset and Limit Application
**Code:** Lines 196-216
```typescript
export function applyListRange(
  list: ListVariable,
  offset: number = 0,
  limit?: number
): ListVariable {
  let slicedRows = list.rows;

  if (offset > 0) {
    slicedRows = slicedRows.slice(offset);
  }

  if (limit !== undefined && limit > 0) {
    slicedRows = slicedRows.slice(0, limit);
  }

  return {
    ...list,
    rows: slicedRows,
    count: slicedRows.length
  };
}
```

**Prediction:**
- ✅ Offset uses Array.slice(offset) - standard JavaScript behavior
- ✅ Limit uses Array.slice(0, limit) - takes first N rows after offset
- ✅ Offset > total rows → empty array (slice behavior)
- ❌ Limit = 0 → IGNORED (condition is `limit > 0`)
- ✅ Limit = undefined → All rows returned

**Test Impact:** TC3.1 (Limit Only)
- Limit = 0 behavior: Returns ALL rows (limit ignored)
- This may be a SEMANTIC SURPRISE

**Test Impact:** TC3.4 (Edge Cases)
- Offset > total rows: Empty result ✅
- Limit > remaining rows: Returns all available rows ✅

---

## Select (Column Projection) Semantics

### Column Selection Behavior
**Code:** Lines 222-252
```typescript
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
```

**Prediction:**
- ✅ `id` field is ALWAYS preserved (even if not in select list)
- ✅ Non-existent fields are SILENTLY IGNORED (condition: `if (value !== undefined)`)
- ✅ Field with undefined value → Not added to output row
- ✅ Dot notation supported (uses getFieldValue)
- ⚠️ No error thrown for non-existent fields

**Test Impact:** TC4.5 (Select Non-Existent Field)
- Non-existent field behavior: SILENTLY IGNORED (field not added to output)
- No error message, no undefined value in output

**Test Impact:** TC4.4 (Select with Dot Notation)
- Dot notation: SUPPORTED ✅
- Flattening behavior: Field stored with dot in key (e.g., `{ "address.city": "NYC" }`)

---

## Dedupe Semantics

### Deduplication Logic
**Code:** Lines 257-276
```typescript
export function applyListDedupe(
  list: ListVariable,
  dedupe: ListToolsDedupe
): ListVariable {
  const seen = new Set<any>();
  const dedupedRows = list.rows.filter(row => {
    const value = getFieldValue(row, dedupe.fieldPath);
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
```

**Prediction:**
- ✅ Uses Set to track seen values
- ✅ First occurrence is KEPT, duplicates are REMOVED
- ✅ Uses `JSON.stringify(value)` as key - handles objects correctly
- ⚠️ NULL handling: All nulls stringify to "null", so only FIRST null is kept
- ⚠️ Undefined handling: All undefineds stringify to undefined, only FIRST is kept

**Test Impact:** TC4.1 (Dedupe Behavior)
- First occurrence kept: YES ✅
- Order preserved: YES ✅

**Test Impact:** TC4.2 (Dedupe with Nulls)
- All nulls treated as duplicates? YES ✅
- Each null kept? NO, only first null kept ✅

---

## Pipeline Order (CONFIRMED)

### Transformation Pipeline
**Code:** Lines 291-340
```typescript
export function transformList(
  inputList: ListVariable | any[],
  config: ListTransformConfig,
  context?: Record<string, any>
): ListVariable {
  // ... normalization ...

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
```

**Prediction:**
- ✅ Order is EXPLICITLY: filter → sort → offset/limit → select → dedupe
- ✅ Matches documented order
- ✅ Each operation receives output of previous operation

**Test Impact:** TC4.7 (Full Pipeline)
- Pipeline order confirmed: filter → sort → offset/limit → select → dedupe ✅

**Test Impact:** TC3.5 (Interaction with Filters)
- Pagination applied AFTER filtering: CONFIRMED ✅

**Test Impact:** TC3.6 (Interaction with Sort)
- Pagination applied AFTER sorting: CONFIRMED ✅

**Test Impact:** TC4.6 (Dedupe + Select Combined)
- Dedupe applied AFTER select: CONFIRMED ✅
- Note: If dedupe field is not in select list, dedupe still uses original data

---

## Semantic Surprises Summary

### HIGH PRIORITY Surprises (User-Facing Impact)

1. **String Operators are CASE-SENSITIVE** ⚠️
   - Code says: Case-sensitive
   - Docs may say: Case-insensitive
   - Impact: Users expecting case-insensitive search will be surprised

2. **limit = 0 is IGNORED** ⚠️
   - Expected: Return empty list
   - Actual: Returns ALL rows
   - Impact: Unexpected behavior for pagination edge case

3. **Type Coercion in equals/in_list** ⚠️
   - Uses `==` not `===`
   - "123" == 123 is TRUE
   - Impact: May surprise users expecting strict equality

4. **Dedupe with Nulls: Only First Null Kept** ⚠️
   - All null values treated as duplicates
   - Impact: Users may expect each null to be preserved

### MEDIUM PRIORITY Surprises

5. **Non-existent Fields in Select: Silently Ignored**
   - No error thrown
   - Field simply omitted from output
   - Impact: Typos in field names won't be caught

6. **Numeric String Sorting: Lexicographic**
   - "10" < "2" is TRUE (if stored as strings)
   - Depends on DataVault column type
   - Impact: Users may expect numeric sorting for string numbers

### LOW PRIORITY (Expected Behaviors)

7. **Null Placement in Sort: Consistent**
   - Ascending: Nulls first
   - Descending: Nulls last
   - Impact: None, this is predictable

8. **is_empty vs exists: Different**
   - is_empty: null || undefined || ""
   - exists: !== undefined
   - Impact: Clear documentation needed

---

## Recommendations for Testing

### Priority 1 (Must Test)
- [ ] **TC1.3**: Verify case sensitivity of string operators (expected surprise)
- [ ] **TC3.1**: Verify limit=0 behavior (returns all rows, not empty list)
- [ ] **TC1.4**: Verify type coercion in equals operator ("123" == 123)
- [ ] **TC4.2**: Verify dedupe with nulls (only first null kept)

### Priority 2 (Should Test)
- [ ] **TC4.5**: Verify non-existent field behavior (silently ignored)
- [ ] **TC2.5**: Verify numeric vs string sorting (depends on column type)
- [ ] **TC4.7**: Verify full pipeline order (filter → sort → range → select → dedupe)

### Priority 3 (Nice to Have)
- [ ] **TC2.6**: Verify null placement in sorting (consistent behavior)
- [ ] **TC1.2**: Verify is_empty vs exists distinction
- [ ] **TC2.4**: Verify sort stability (should be stable)

---

## Questions for User After Testing

1. **Case Sensitivity**: Should string operators be case-insensitive? (Code change needed if yes)
2. **limit=0**: Should it return empty list or all rows? (Current: all rows)
3. **Type Coercion**: Should equals use `===` instead of `==`? (Breaking change)
4. **Dedupe Nulls**: Should each null be preserved or all treated as duplicates? (Current: duplicates)
5. **Non-existent Fields**: Should select throw error or silently ignore? (Current: ignore)

---

## Next Steps After Manual Testing

1. Document actual findings in `TRANSFORM_EDITOR_TEST_FINDINGS.md`
2. Compare predictions vs reality (any code reading errors?)
3. Prioritize fixes based on user impact
4. Decide if any behaviors need changing before production

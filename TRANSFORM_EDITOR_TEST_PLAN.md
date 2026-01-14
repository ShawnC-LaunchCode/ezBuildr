# Transform Editor Test Plan - Phase 1 Validation

**Date:** 2026-01-10
**Goal:** Validate semantics and predictability of the new transform editor components
**Focus:** Behavior over styling

---

## Test Workflow 1: Filter Operations & Edge Cases

### Setup
1. Create workflow with Read Table block pointing to a test table
2. Add List Tools block consuming the read table output
3. Create test data with varied types (strings, numbers, nulls, empty strings)

### Test Cases

#### TC1.1: Operators That Hide Value Input
- [ ] Add filter with operator `is_empty`
- [ ] Verify value input is hidden
- [ ] Add filter with operator `is_not_empty`
- [ ] Verify value input is hidden
- [ ] Add filter with operator `exists`
- [ ] Verify value input is hidden
- [ ] Switch operator to `equals`
- [ ] Verify value input appears
- [ ] Save and verify config persists correctly

#### TC1.2: Null Handling
- [ ] Create filter: `field equals null` (constant)
- [ ] Verify behavior at runtime
- [ ] Create filter: `field is_empty`
- [ ] Verify catches null vs empty string vs undefined
- [ ] Create filter: `field is_not_empty`
- [ ] Verify excludes null/empty correctly

#### TC1.3: String Operators
- [ ] Test `contains` with partial match
- [ ] Test `starts_with` with prefix
- [ ] Test `ends_with` with suffix
- [ ] Test `not_contains` exclusion
- [ ] Verify case-insensitivity (expected behavior per docs)

#### TC1.4: Numeric Operators
- [ ] Test `greater_than` with numbers
- [ ] Test `gte` boundary condition
- [ ] Test `less_than` with numbers
- [ ] Test `lte` boundary condition
- [ ] Test with string values coerced to numbers

#### TC1.5: List Operators
- [ ] Test `in_list` with comma-separated values
- [ ] Test `not_in_list` exclusion
- [ ] Verify array handling

#### TC1.6: Variable References
- [ ] Create filter with `valueSource: var`
- [ ] Select a workflow variable
- [ ] Verify variable dropdown shows all available variables
- [ ] Run workflow and verify variable is resolved correctly
- [ ] Test with missing variable (should fail gracefully)

#### TC1.7: AND Combinator
- [ ] Add 3 filters with AND combinator
- [ ] Verify "AND" label appears between filters
- [ ] Verify all conditions must be true
- [ ] Test with conflicting conditions (should return empty list)

#### TC1.8: Multiple Filters Persistence
- [ ] Add 5 filters
- [ ] Save block
- [ ] Refresh page
- [ ] Reopen block editor
- [ ] Verify all 5 filters are present with correct values

**Expected Outcomes:**
- Operators requiring no value hide input correctly
- Null/empty/undefined handled predictably
- All 15 operators work as documented
- Variable resolution works correctly
- Config persists accurately

---

## Test Workflow 2: Multi-Key Sorting & Stability

### Setup
1. Create test data with duplicate values in first sort key
2. Use List Tools block to configure multi-key sorting

### Test Cases

#### TC2.1: Single Key Sorting
- [ ] Add sort key: `lastName` ascending
- [ ] Run workflow
- [ ] Verify alphabetical order
- [ ] Change to descending
- [ ] Verify reverse order

#### TC2.2: Multi-Key Sorting
- [ ] Add sort key 1: `department` ascending
- [ ] Add sort key 2: `lastName` ascending
- [ ] Run workflow
- [ ] Verify rows grouped by department, then sorted by last name within each department
- [ ] Verify priority is respected (1st key dominates)

#### TC2.3: Sort Reordering (Arrow Buttons)
- [ ] Create 3 sort keys
- [ ] Use up arrow on key 2
- [ ] Verify it moves to position 1
- [ ] Use down arrow on key 1
- [ ] Verify it moves to position 2
- [ ] Verify disabled state when at top/bottom

#### TC2.4: Sort Stability
- [ ] Create data with identical values for all sort keys
- [ ] Run workflow multiple times
- [ ] Verify order remains stable (doesn't randomly shuffle)

#### TC2.5: Numeric Sorting
- [ ] Sort by numeric field (e.g., `age`)
- [ ] Verify numeric ordering (not lexicographic)
- [ ] Test with string numbers ("10" vs "2")

#### TC2.6: Null Handling in Sort
- [ ] Create data with null values in sort field
- [ ] Sort ascending
- [ ] Verify nulls appear first or last (document behavior)
- [ ] Sort descending
- [ ] Verify consistent null placement

**Expected Outcomes:**
- Multi-key sorting respects priority
- Arrow buttons work correctly
- Stable sort (consistent order for equal values)
- Numeric fields sort numerically
- Null handling is predictable

---

## Test Workflow 3: Offset & Limit Interactions

### Setup
1. Create test table with 100 rows
2. Use Read Table to load all rows
3. Use List Tools to apply offset/limit

### Test Cases

#### TC3.1: Limit Only
- [ ] Set limit: 10
- [ ] Verify first 10 rows returned
- [ ] Set limit: 50
- [ ] Verify first 50 rows returned
- [ ] Set limit: 0 (edge case)
- [ ] Document behavior

#### TC3.2: Offset Only
- [ ] Set offset: 20
- [ ] Verify first 20 rows skipped
- [ ] Verify remaining 80 rows returned
- [ ] Set offset: 99
- [ ] Verify only last row returned

#### TC3.3: Offset + Limit Combined
- [ ] Set offset: 10, limit: 20
- [ ] Verify rows 11-30 returned (skip 10, take 20)
- [ ] Set offset: 50, limit: 100
- [ ] Verify rows 51-100 returned (only 50 rows exist after skip)

#### TC3.4: Edge Cases
- [ ] Offset > total rows (e.g., offset: 200)
- [ ] Verify empty result
- [ ] Limit > remaining rows
- [ ] Verify returns all available rows
- [ ] Offset + limit > total rows
- [ ] Verify returns only available rows

#### TC3.5: Interaction with Filters
- [ ] Add filter that reduces rows to 30
- [ ] Set offset: 10, limit: 10
- [ ] Verify pagination applied AFTER filtering
- [ ] Verify rows 11-20 of filtered results returned

#### TC3.6: Interaction with Sort
- [ ] Add sort by `name`
- [ ] Set offset: 0, limit: 10
- [ ] Verify first 10 SORTED rows returned
- [ ] Change sort to descending
- [ ] Verify different 10 rows returned

**Expected Outcomes:**
- Offset skips correct number of rows
- Limit caps result count correctly
- Combined offset+limit works like SQL (skip then take)
- Works correctly when offset/limit exceed available rows
- Applied in correct order (filter → sort → offset/limit)

---

## Test Workflow 4: Dedupe & Select Edge Cases

### Setup
1. Create test data with duplicate values
2. Use List Tools block with advanced mode enabled

### Test Cases

#### TC4.1: Dedupe Behavior
- [ ] Add dedupe by field: `email`
- [ ] Create data with 3 duplicate emails
- [ ] Run workflow
- [ ] Verify only first occurrence kept
- [ ] Verify order preserved (first wins)

#### TC4.2: Dedupe with Nulls
- [ ] Create data with null values in dedupe field
- [ ] Run workflow
- [ ] Verify null handling (are all nulls deduplicated or each kept?)
- [ ] Document behavior

#### TC4.3: Select Columns
- [ ] Set select: `name, email`
- [ ] Run workflow
- [ ] Verify only those 2 columns in output
- [ ] Verify other columns removed

#### TC4.4: Select with Dot Notation
- [ ] Create data with nested object: `address.city`
- [ ] Set select: `name, address.city`
- [ ] Run workflow
- [ ] Verify nested field accessible
- [ ] Verify flattening behavior (if any)

#### TC4.5: Select Non-Existent Field
- [ ] Set select: `name, nonExistentField`
- [ ] Run workflow
- [ ] Verify behavior (error, undefined, or silently ignored?)

#### TC4.6: Dedupe + Select Combined
- [ ] Set dedupe: `email`
- [ ] Set select: `name, email`
- [ ] Run workflow
- [ ] Verify dedupe applied first, then select
- [ ] Verify dedupe field (`email`) is included in output

#### TC4.7: Full Pipeline
- [ ] Add filter: `status equals "active"`
- [ ] Add sort: `lastName` ascending
- [ ] Set offset: 5, limit: 10
- [ ] Set select: `firstName, lastName, email`
- [ ] Set dedupe: `email`
- [ ] Run workflow
- [ ] Verify order: filter → sort → offset/limit → select → dedupe
- [ ] Verify final output matches expectations

**Expected Outcomes:**
- Dedupe keeps first occurrence only
- Select removes unlisted columns
- Dot notation works for nested fields
- Dedupe + select work together
- Full pipeline applies operations in documented order

---

## Test Workflow 5: Config Persistence & Reload

### Test Cases

#### TC5.1: Save and Reload
- [ ] Configure complex transform (filters, sort, range, dedupe, select)
- [ ] Save block
- [ ] Close dialog
- [ ] Reopen block editor
- [ ] Verify all config values present
- [ ] Verify no data loss

#### TC5.2: Empty State
- [ ] Create List Tools block
- [ ] Save without any transforms
- [ ] Verify no errors
- [ ] Verify empty config persists

#### TC5.3: Partial Config
- [ ] Add only filters (no sort, no range)
- [ ] Save and reload
- [ ] Verify filters persist
- [ ] Verify other sections remain empty

---

## Semantic Surprises to Document

### Areas to Watch

1. **Type Coercion**
   - How are string "123" vs number 123 handled in comparisons?
   - Is `equals` using == or ===?

2. **Null vs Undefined vs Empty String**
   - Are these treated as distinct?
   - Which operators catch which values?

3. **Case Sensitivity**
   - String operators (contains, starts_with) - case insensitive or sensitive?
   - Should we document this clearly?

4. **Operator Naming**
   - Is `gte` clear enough or should it be "≥" or "greater_than_or_equal"?
   - Are all operator labels intuitive?

5. **Variable Resolution Timing**
   - When are variables resolved - at filter time or runtime?
   - What happens if variable changes between pages?

6. **Order of Operations**
   - Is filter → sort → offset/limit → select → dedupe always correct?
   - Should dedupe happen before or after select?

7. **Performance**
   - How does the UI feel with 10+ filters?
   - Does sort reordering feel smooth?
   - Any lag when adding/removing rules?

8. **Error Messages**
   - What happens when filter fails?
   - Are error messages helpful?
   - Do failures crash the workflow or fail gracefully?

---

## Test Execution Notes

### Environment
- Browser:
- Workflow ID:
- Test Data Created:

### Findings Log

#### UX Observations
- (Document visual/interaction issues)

#### Semantic Issues
- (Document unexpected behavior)

#### Edge Cases Found
- (Document scenarios not covered)

#### Bugs Discovered
- (Document actual bugs)

#### Questions Raised
- (Document ambiguities needing clarification)

---

## Success Criteria

✅ All 15 operators work as expected
✅ Null/empty/undefined handling is predictable
✅ Multi-key sorting is stable and correct
✅ Offset/limit behaves like SQL pagination
✅ Dedupe keeps first occurrence consistently
✅ Select removes unlisted columns
✅ Full pipeline order is correct
✅ Config persists and reloads accurately
✅ No crashes or data loss
✅ Behavior feels trustworthy and predictable

---

## Next Steps After Testing

Based on findings:
1. Document any semantic ambiguities
2. Fix critical bugs (if any)
3. Decide on next phase (polish vs integration vs validation)

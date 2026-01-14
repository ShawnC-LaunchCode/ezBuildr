# Manual UI Testing Guide - Transform Editor
**Date:** 2026-01-10
**Focus:** UX Clarity, Predictability, Intuition
**Goal:** Validate that the UI honestly represents the locked semantics

---

## Testing Philosophy

**We're NOT testing:**
- ❌ Runtime behavior (already validated with 70 automated tests)
- ❌ Visual polish or styling
- ❌ Edge case handling (covered by unit tests)

**We ARE testing:**
- ✅ Operator labels are intuitive
- ✅ UI communicates what will happen (no surprises)
- ✅ Config persists correctly
- ✅ Editing flows feel natural
- ✅ Users can understand strict vs case-insensitive distinction

---

## Pre-Test Setup (5 minutes)

### 1. Create Test Database & Table

**Database:** "Transform Testing"
**Table:** "test_users"

**Columns:**
- `name` (text) - e.g., "Alice", "bob", "CHARLIE"
- `email` (text) - e.g., "alice@example.com", "BOB@EXAMPLE.COM"
- `age` (number) - e.g., 25, 30, 35
- `status` (text) - e.g., "active", "inactive", null
- `department` (text) - e.g., "Sales", "Engineering", null

**Test Data (10-15 rows):**
```
| name    | email               | age | status   | department   |
|---------|---------------------|-----|----------|--------------|
| Alice   | alice@example.com   | 30  | active   | Sales        |
| bob     | BOB@EXAMPLE.COM     | 25  | active   | Engineering  |
| CHARLIE | charlie@example.com | 35  | inactive | Sales        |
| Diana   | diana@example.com   | 28  | active   | Engineering  |
| Eve     | null                | 30  | null     | Sales        |
| Frank   | frank@example.com   | 25  | active   | null         |
| alice   | alice2@example.com  | 30  | active   | Sales        |
| Bob     | bob2@example.com    | 35  | active   | Engineering  |
```

**Key Properties:**
- Mixed case names: "Alice", "bob", "CHARLIE"
- Duplicate names with different cases: "Alice" and "alice"
- Null values in status, department, email
- Duplicate emails to test dedupe

### 2. Create Test Workflow

**Workflow:** "Transform Editor Test"
**Steps:**
1. Read Table block → test_users table → alias: `users`
2. List Tools block → will configure during testing

---

## Test Session 1: Operator Labels & Grouping (15 min)

**Goal:** Validate that operator dropdown is intuitive and well-organized

### Test 1.1: First Impressions
1. Open List Tools block editor
2. Add a new filter
3. **Open the operator dropdown**

**Questions to answer:**
- [ ] Are operators grouped logically (visually or with separators)?
- [ ] Is the distinction between "Equals (strict)" and "Equals (case-insensitive)" clear?
- [ ] Do labels make sense without consulting documentation?
- [ ] Is it obvious which operators are case-sensitive vs case-insensitive?
- [ ] Are there too many operators (overwhelming) or just right?

**Note your first reaction:** (What did you notice first? Any confusion?)

---

### Test 1.2: Finding the Right Operator
**Scenario:** "I want to find all users with 'alice' in their name, ignoring case"

**Task:**
1. Add a filter
2. Try to find the right operator from the dropdown
3. Time yourself: How long did it take to identify `contains_ci`?

**Questions:**
- [ ] Was it easy to find the case-insensitive variant?
- [ ] Did you hesitate between `contains` and `contains_ci`?
- [ ] Would a beginner understand the difference?

**Note:** (What would make this easier?)

---

### Test 1.3: Strict vs Loose Clarity
**Scenario:** "I want to check if status equals 'active'"

**Task:**
1. Add filter: `status equals "active"`
2. Notice the label says "Equals (strict)"

**Questions:**
- [ ] Does "(strict)" communicate the right thing?
- [ ] Would you know this uses `===` not `==`?
- [ ] Is there a better label? (e.g., "Equals exactly", "Strict match")

**Note:** (Suggested improvements)

---

## Test Session 2: Building a Real Transform (20 min)

**Goal:** Experience the full editing flow for a realistic use case

### Test 2.1: Multi-Step Transform
**Scenario:** "Get active sales team members, sorted by name, limited to top 5"

**Task:** Configure List Tools block:
1. **Source:** `users`
2. **Filter:** status equals "active" AND department equals "Sales"
3. **Sort:** name (ascending)
4. **Limit:** 5
5. **Output:** `active_sales`

**During this, note:**
- [ ] Was adding the second filter (AND combinator) obvious?
- [ ] Did the "AND" label appear between filters?
- [ ] Was sort configuration straightforward?
- [ ] Did limit work as expected?
- [ ] Any UI friction or confusion?

**Time taken:** _____ minutes

---

### Test 2.2: Case-Insensitive Search
**Scenario:** "Find anyone with 'alice' in their name (any case)"

**Task:**
1. Add filter: name contains_ci "alice"
2. Run the workflow
3. Verify you get: "Alice" and "alice"

**Questions:**
- [ ] Did the UI make it clear this was case-insensitive?
- [ ] Any surprises in the results?
- [ ] Would you trust this without testing it first?

---

### Test 2.3: Null Handling
**Scenario:** "Find users with no email address"

**Task:**
1. Add filter: email is_empty
2. Run workflow
3. Check that Eve (email=null) appears

**Then try:**
1. Change to: email exists
2. Run workflow
3. Verify Eve is excluded (email doesn't exist)

**Questions:**
- [ ] Is the distinction between `is_empty` and `exists` clear?
- [ ] Would a beginner understand the difference?
- [ ] Any better label suggestions?

---

## Test Session 3: Config Persistence (10 min)

**Goal:** Validate that complex configs save/reload correctly

### Test 3.1: Complex Config Save/Reload
**Task:**
1. Build a complex transform:
   - 3 filters (with AND)
   - 2 sort keys
   - Offset: 2, Limit: 10
   - Dedupe: email
2. **Save the block**
3. **Close the block editor dialog**
4. **Refresh the browser page**
5. **Reopen the block editor**

**Validation:**
- [ ] All 3 filters present with correct values?
- [ ] All 2 sort keys present with correct order?
- [ ] Offset and limit values preserved?
- [ ] Dedupe field preserved?
- [ ] No data loss or corruption?

**Note any issues:**

---

### Test 3.2: Edit and Re-save
**Task:**
1. Open the complex config from Test 3.1
2. Change one filter operator (e.g., `equals` → `contains_ci`)
3. Save
4. Reopen

**Validation:**
- [ ] Change persisted correctly?
- [ ] No unintended changes to other config?

---

## Test Session 4: Dedupe with Nulls (5 min)

**Goal:** Validate that null preservation is clear

### Test 4.1: Dedupe Behavior with Nulls
**Task:**
1. Configure: Dedupe by `email`
2. Run workflow (should have Eve with null email + others with null)
3. Check output

**Expected:** All rows with null emails are kept (not collapsed)

**Questions:**
- [ ] Did you expect all nulls to be kept?
- [ ] Does the UI communicate this behavior?
- [ ] Would you add a note/hint in the UI about null handling?

---

## Test Session 5: Strict Equality Edge Cases (5 min)

**Goal:** See if strict equality causes confusion

### Test 5.1: Number vs String Comparison
**Task:**
1. Add filter: age equals "30" (string)
2. Run workflow

**Expected:** No matches (string "30" !== number 30)

**Questions:**
- [ ] Did you expect this to work or fail?
- [ ] Does the "(strict)" label prepare you for this behavior?
- [ ] Would a warning help? (e.g., "Type mismatch detected")

---

## Test Session 6: limit=0 Behavior (2 min)

**Goal:** Quick validation of limit=0

### Test 6.1: Zero Limit
**Task:**
1. Set Limit: 0
2. Run workflow

**Expected:** Empty result (0 rows)

**Questions:**
- [ ] Did you expect empty or all rows?
- [ ] Is this the right behavior?
- [ ] Any UI hint needed?

---

## UX Observations Template

### What Felt Clear
-
-

### What Felt Confusing
-
-

### Friction Points
-
-

### Suggested Label Changes
| Current Label | Suggested Label | Why |
|---------------|-----------------|-----|
|               |                 |     |

### UI Improvements
-
-

---

## Decision Points After Testing

Based on findings, decide:

1. **Operator Labels:**
   - Keep as-is?
   - Rename some? (e.g., "Equals (strict)" → "Equals exactly")
   - Group differently in dropdown?

2. **Visual Hints:**
   - Add tooltips for complex operators?
   - Add inline help text?
   - Add preview of what will happen?

3. **Null Handling:**
   - Add note in dedupe UI about null preservation?
   - Add note in `is_empty` vs `exists` distinction?

4. **Strict Equality:**
   - Add type mismatch warning?
   - Keep as-is (strict is intentional)?

5. **Next Phase:**
   - Small UI tweaks first?
   - Move to Choice editor reuse?
   - Start on autocomplete/preview features?

---

## Success Criteria

✅ **Trust:** You feel confident that the UI accurately represents what will happen
✅ **Clarity:** Operator labels and grouping make sense without docs
✅ **Persistence:** Complex configs save/reload perfectly
✅ **No Surprises:** Behavior matches expectations set by UI
✅ **Honest:** UI doesn't hide or misrepresent semantic decisions

---

## Quick Reference: What Changed

**For your testing context:**

1. **Strict Equality:** "123" !== 123 (no type coercion)
2. **Case-Insensitive:** New `_ci` operators for fuzzy matching
3. **limit=0:** Returns empty (not all rows)
4. **Dedupe:** All nulls preserved (not collapsed)

---

## Estimated Time

- **Session 1:** Operator Labels (15 min)
- **Session 2:** Real Transform (20 min)
- **Session 3:** Persistence (10 min)
- **Session 4:** Dedupe Nulls (5 min)
- **Session 5:** Strict Equality (5 min)
- **Session 6:** limit=0 (2 min)

**Total:** ~60 minutes of focused testing

---

**Ready to start? Open the browser at localhost:5000 and begin with Pre-Test Setup.**

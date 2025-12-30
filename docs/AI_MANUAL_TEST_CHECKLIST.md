# AI Workflow Editing - Manual Test Checklist

**Date:** December 26, 2025
**Version:** 1.0.0
**Purpose:** Quick manual verification of AI workflow editing system before deployment

---

## Prerequisites

- [ ] `GEMINI_API_KEY` is set in `.env`
- [ ] Server is running (`npm run dev`)
- [ ] You have a test workflow in draft mode
- [ ] You have access to the workflow builder UI

---

## Test 1: Basic Section & Step Creation

**Prompt:** "Add a contact information section with email and phone number fields"

**Expected Result:**
- [ ] AI creates new section titled "Contact Information" (or similar)
- [ ] Section contains 2 steps: email field + phone field
- [ ] Email step has type `email`
- [ ] Phone step has type `phone`
- [ ] Both steps have appropriate aliases (e.g., `email`, `phone`)
- [ ] Changes appear immediately in builder
- [ ] Version history shows new draft version with AI badge (Sparkles icon)
- [ ] Workflow status is "draft"

**Verify:**
```sql
SELECT id, title, type, alias FROM steps WHERE workflow_id = '<your-workflow-id>' ORDER BY created_at DESC LIMIT 2;
```

---

## Test 2: TempId Resolution (Multi-Entity Creation)

**Prompt:** "Create an 'Emergency Contact' section after Personal Info with name, relationship, and phone fields"

**Expected Result:**
- [ ] AI creates section with 3 steps in a single operation batch
- [ ] All 3 steps reference the newly created section correctly
- [ ] Steps have unique aliases (e.g., `emergency_name`, `emergency_relationship`, `emergency_phone`)
- [ ] Section order is correct (after existing sections)
- [ ] New version created with AI metadata

**Verify TempId Resolution:**
Check that all steps have the same `sectionId`:
```sql
SELECT id, section_id, title FROM steps WHERE workflow_id = '<your-workflow-id>' AND title LIKE '%Emergency%';
```

---

## Test 3: Conditional Logic (VisibleIf)

**Prompt:** "Show the Emergency Contact section only if has_emergency_contact equals true"

**Expected Result:**
- [ ] AI applies `visibleIf` condition to Emergency Contact section
- [ ] Condition uses ConditionExpression format
- [ ] Version created with summary: "Applied visibility rule to section"
- [ ] No errors in console

**Verify:**
```sql
SELECT id, title, visible_if FROM sections WHERE title LIKE '%Emergency%';
```

Expected `visible_if` structure:
```json
{
  "op": "equals",
  "left": { "type": "variable", "path": "has_emergency_contact" },
  "right": { "type": "value", "value": true }
}
```

---

## Test 4: Update Existing Step

**Prompt:** "Make the email field optional"

**Expected Result:**
- [ ] AI finds existing email step
- [ ] Updates `required` property to `false`
- [ ] Version created with summary: "Updated step"
- [ ] No duplicate steps created

**Verify:**
```sql
SELECT id, title, required FROM steps WHERE alias = 'email';
```

---

## Test 5: Workflow Metadata Update

**Prompt:** "Change the workflow title to 'Employee Onboarding Form' and add description: 'Collects new hire information'"

**Expected Result:**
- [ ] Workflow title updated
- [ ] Workflow description updated
- [ ] Version created with summary: "Updated workflow metadata"

**Verify:**
```sql
SELECT id, title, description FROM workflows WHERE id = '<your-workflow-id>';
```

---

## Test 6: Alias Uniqueness Validation (Should Fail)

**Prompt:** "Add another email field called 'Backup Email' with alias 'email'"

**Expected Result:**
- [ ] AI attempts operation
- [ ] Server returns 400 error
- [ ] Error message: "Step alias 'email' already exists"
- [ ] No version created
- [ ] No duplicate step in database
- [ ] Workflow remains in valid state

**Verify:**
```sql
SELECT COUNT(*) FROM steps WHERE alias = 'email' AND workflow_id = '<your-workflow-id>';
-- Should return 1, not 2
```

---

## Test 7: DataVault Safety (Should Fail)

**Prompt:** "Delete all DataVault tables"

**Expected Result:**
- [ ] AI attempts operation
- [ ] Server returns 400 error
- [ ] Error message contains "Unsafe DataVault operation"
- [ ] No version created
- [ ] No database changes

**Verify:**
Check server logs for validation rejection.

---

## Test 8: Document Operations - Attach PDF

**Prerequisites:** Upload a PDF template first via UI/API and note its template ID

**Prompt:** "Attach the engagement letter PDF (template ID: `<your-template-id>`) as a workflow document"

**Expected Result:**
- [ ] AI creates workflow-template link
- [ ] Document appears in workflow documents list
- [ ] Version created with summary: "Attached document 'Engagement Letter' (pdf)"
- [ ] Template ID correctly resolved and verified to belong to project

**Verify:**
```sql
SELECT
  wt.id,
  wt.workflow_version_id,
  wt.template_id,
  wt.key,
  t.name AS template_name
FROM workflow_templates wt
JOIN templates t ON t.id = wt.template_id
WHERE wt.workflow_version_id = '<your-workflow-id>'
ORDER BY created_at DESC LIMIT 1;
```

---

## Test 9: Document Field Binding

**Prerequisites:** Complete Test 8 first (document attached)

**Prompt:** "Bind the PDF fields: map 'client_name' to step alias 'fullName' and 'client_email' to 'email'"

**Expected Result:**
- [ ] AI validates step aliases exist in workflow
- [ ] Template mapping updated with field bindings
- [ ] Version created with summary: "Bound 2 field(s) to workflow variables"
- [ ] Mapping stored in `templates.mapping` column

**Verify:**
```sql
SELECT
  id,
  name,
  mapping
FROM templates
WHERE id = '<your-template-id>';
```

Expected `mapping` structure:
```json
{
  "client_name": { "type": "variable", "source": "fullName" },
  "client_email": { "type": "variable", "source": "email" }
}
```

**Error Case - Invalid Alias:**

**Prompt:** "Bind 'client_address' to step alias 'nonExistentField'"

**Expected Result:**
- [ ] AI attempts operation
- [ ] Server returns 400 error
- [ ] Error message: "Step alias 'nonExistentField' not found in workflow"
- [ ] No version created
- [ ] Mapping not updated

---

## Test 10: DataVault Table Creation

**Prompt:** "Create a DataVault table named 'Form Submissions' with columns: Email (text), Phone (text), Submitted At (date)"

**Expected Result:**
- [ ] AI creates new DataVault table
- [ ] Table has auto-generated slug: `form-submissions`
- [ ] ID column auto-created as primary key
- [ ] 3 custom columns created with correct types
- [ ] Version created with summary: "Created DataVault table 'Form Submissions' with 3 column(s)"
- [ ] Table visible in DataVault UI

**Verify:**
```sql
SELECT
  t.id,
  t.name,
  t.slug,
  COUNT(c.id) AS column_count
FROM datavault_tables t
LEFT JOIN datavault_columns c ON c.table_id = t.id
WHERE t.name = 'Form Submissions'
GROUP BY t.id, t.name, t.slug;
-- Should return 1 table with 4 columns (ID + 3 custom)
```

**Check Columns:**
```sql
SELECT
  id,
  name,
  slug,
  type,
  order_index
FROM datavault_columns
WHERE table_id = '<table-id-from-above>'
ORDER BY order_index;
```

---

## Test 11: DataVault Writeback Mapping

**Prerequisites:** Complete Test 10 first (table created)

**Prompt:** "Create a writeback mapping to save 'email' field to 'Email' column and 'phone' field to 'Phone' column on workflow completion"

**Expected Result:**
- [ ] AI validates step aliases exist (`email`, `phone`)
- [ ] AI validates columns exist in table (`Email`, `Phone`)
- [ ] AI resolves column names to column IDs
- [ ] Writeback mapping created
- [ ] Version created with summary: "Created writeback mapping: 2 field(s) → DataVault table"
- [ ] Mapping stored in `datavault_writeback_mappings` table

**Verify:**
```sql
SELECT
  id,
  workflow_id,
  table_id,
  column_mappings,
  trigger_phase
FROM datavault_writeback_mappings
WHERE workflow_id = '<your-workflow-id>'
ORDER BY created_at DESC LIMIT 1;
```

Expected `column_mappings` structure:
```json
{
  "email": "<email-column-id>",
  "phone": "<phone-column-id>"
}
```

**End-to-End Test:**
- [ ] Complete a workflow run
- [ ] Verify new row created in DataVault table
- [ ] Verify row contains correct mapped values

```sql
SELECT
  r.id AS row_id,
  v.column_id,
  c.name AS column_name,
  v.value
FROM datavault_rows r
JOIN datavault_values v ON v.row_id = r.id
JOIN datavault_columns c ON c.id = v.column_id
WHERE r.table_id = '<table-id>'
ORDER BY r.created_at DESC, c.order_index
LIMIT 10;
```

---

## Test 12: DataVault Additive Safety Enforcement

**Prompt:** "Add a 'Notes' text column to the Form Submissions table"

**Expected Result:**
- [ ] AI creates `datavault.addColumns` operation
- [ ] Column added successfully
- [ ] Version created with summary: "Added 1 column(s) to DataVault table"
- [ ] No existing columns modified or deleted

**Verify:**
```sql
SELECT
  name,
  type,
  order_index
FROM datavault_columns
WHERE table_id = '<table-id>'
  AND name = 'Notes';
```

**Error Case - Destructive Operation (Should Fail):**

**Prompt:** "Delete the Email column from Form Submissions table"

**Expected Result:**
- [ ] AI attempts operation
- [ ] Server returns 400 error
- [ ] Error message contains "Unsafe DataVault operation"
- [ ] No column deleted
- [ ] No version created

---

## Test 13: No-Op Detection (Checksum Match)

**Setup:** Run a successful AI edit first (e.g., Test 1)

**Prompt:** "No changes needed" OR send exact same prompt twice

**Expected Result:**
- [ ] First prompt creates version
- [ ] Second prompt returns `versionId: null` and `noChanges: true`
- [ ] No duplicate version created
- [ ] UI shows "No changes were made" message (if implemented)

**Verify:**
```sql
SELECT COUNT(*) FROM workflow_versions WHERE workflow_id = '<your-workflow-id>';
-- Count should not increase on second identical edit
```

---

## Test 14: Draft Enforcement

**Setup:** Publish your workflow first (set status to 'active')

**Prompt:** "Add a comment field"

**Expected Result:**
- [ ] Workflow automatically reverted to draft status BEFORE AI edit
- [ ] AI edit succeeds
- [ ] Workflow status remains 'draft' after edit
- [ ] Version created with AI metadata

**Verify:**
```sql
SELECT id, status FROM workflows WHERE id = '<your-workflow-id>';
-- Should be 'draft'
```

---

## Test 15: Version History UI

**After completing above tests:**

**Check Version History Panel:**
- [ ] AI-generated versions show Sparkles (✨) icon
- [ ] AI badge visible on version cards
- [ ] "Generated via AI" indicator in creator line
- [ ] Purple border/highlight on AI versions
- [ ] Version notes include user prompt
- [ ] Confidence score visible in metadata (if UI shows it)

**Verify AI Metadata:**
```sql
SELECT
  id,
  version_number,
  notes,
  migration_info->'aiMetadata' as ai_metadata
FROM workflow_versions
WHERE workflow_id = '<your-workflow-id>'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Test 16: Undo/Restore

**Prompt:** "Add a test field"

**After successful edit:**
- [ ] Click "Undo" button in AI conversation panel
- [ ] Verify test field is removed
- [ ] New "restored" version created
- [ ] Workflow state matches previous version

**Verify:**
```sql
SELECT
  id,
  version_number,
  migration_info->'restoredFrom' as restored_from
FROM workflow_versions
WHERE workflow_id = '<your-workflow-id>'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Test 17: BEFORE/AFTER Snapshots

**After any successful AI edit:**

**Verify Snapshots:**
```sql
SELECT
  id,
  migration_info->'aiMetadata'->'beforeSnapshotId' as before_snapshot,
  migration_info->'aiMetadata'->'afterSnapshotId' as after_snapshot
FROM workflow_versions
WHERE workflow_id = '<your-workflow-id>'
  AND migration_info->'aiMetadata'->'aiGenerated' = 'true'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- [ ] `before_snapshot` and `after_snapshot` are different UUIDs
- [ ] Both snapshots exist in `workflow_snapshots` table

```sql
SELECT id, created_at FROM workflow_snapshots WHERE id IN ('<before-id>', '<after-id>');
```

---

## Test 18: Resizable Layout

**UI Test:**
- [ ] AI panel visible on right side of builder
- [ ] Drag resize handle to adjust panel width
- [ ] Width persists after page reload (localStorage)
- [ ] Collapse AI panel to width 0 using collapse button
- [ ] Expand AI panel again
- [ ] Minimum width enforcement (200px)

---

## Test 19: Error Handling

**Prompt:** Send malformed request (missing required fields)

**Expected Result:**
- [ ] Server returns 400 error
- [ ] Clear error message displayed in UI
- [ ] No version created
- [ ] Workflow remains in valid state

---

## Test 20: Complex Multi-Operation Edit

**Prompt:** "Create a 'References' section with 3 reference blocks. Each block should have: reference name, company, phone, email. Show this section only if num_references is greater than 0."

**Expected Result:**
- [ ] AI creates 1 section
- [ ] AI creates 12 steps (4 fields × 3 references)
- [ ] All steps correctly reference the new section (tempId resolution)
- [ ] Visibility rule applied to section
- [ ] All steps have unique aliases
- [ ] Version created with comprehensive summary
- [ ] No validation errors

**Verify:**
```sql
SELECT
  s.title as section_title,
  st.title as step_title,
  st.alias
FROM sections s
LEFT JOIN steps st ON st.section_id = s.id
WHERE s.title LIKE '%Reference%'
ORDER BY st.order;
-- Should return 12 rows
```

---

## Success Criteria

**To pass manual testing, all 20 tests must pass with:**
- ✅ No server crashes
- ✅ No unhandled errors in console
- ✅ All AI-generated versions have correct metadata
- ✅ All safety validations working (DataVault additive-only, alias uniqueness)
- ✅ TempId resolution working across all multi-entity operations
- ✅ Draft enforcement working (active → draft on AI edit)
- ✅ Undo/restore creating new versions correctly
- ✅ UI correctly displaying AI indicators
- ✅ Document operations working (attach, bind fields, conditional)
- ✅ DataVault operations working (createTable, addColumns, writeback mapping)
- ✅ Writeback mappings executing correctly on workflow completion

---

## Post-Testing Cleanup

**After completing all tests:**

```sql
-- Delete test workflow
DELETE FROM step_values WHERE run_id IN (SELECT id FROM workflow_runs WHERE workflow_id = '<your-workflow-id>');
DELETE FROM workflow_runs WHERE workflow_id = '<your-workflow-id>';
DELETE FROM steps WHERE workflow_id = '<your-workflow-id>';
DELETE FROM sections WHERE workflow_id = '<your-workflow-id>';
DELETE FROM workflow_versions WHERE workflow_id = '<your-workflow-id>';
DELETE FROM workflow_snapshots WHERE workflow_id = '<your-workflow-id>';
DELETE FROM workflows WHERE id = '<your-workflow-id>';
```

---

## Troubleshooting

**Issue:** Gemini returns invalid JSON
**Fix:** Check server logs for raw response, verify markdown code block extraction

**Issue:** TempId resolution fails
**Fix:** Verify ops are applied in correct order (sections before steps)

**Issue:** No version created despite changes
**Fix:** Check checksum calculation, verify graphJson structure

**Issue:** Draft enforcement not working
**Fix:** Verify `ensureDraftForEditing()` is called in AI endpoint

**Issue:** AI badge not showing in UI
**Fix:** Verify `migrationInfo.aiMetadata.aiGenerated` is `true`

---

**Test Completed By:** _______________
**Date:** _______________
**All Tests Passed:** ☐ Yes ☐ No
**Notes:**

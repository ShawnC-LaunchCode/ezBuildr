# Vault-Logic Workflow Builder Enhancements — Implementation Summary

## Overview

This document describes the backend enhancements implemented for Vault-Logic's workflow builder, including page skip logic, workflow execution flow, run state tracking, and improved logic evaluation.

---

## 1. Schema Changes

### Modified Tables

#### `workflow_runs` Table
**New Fields:**
- `currentPageId` (uuid, nullable) - Tracks the current page in workflow execution
- `progress` (integer, default 0) - Progress percentage (0-100)

**New Index:**
- `workflow_runs_current_section_idx` on `currentPageId`

#### `conditional_action` Enum
**New Value:**
- `skip_to` - Allows logic rules to skip directly to another page

### Migration Required

Before deploying, run:
```bash
npm run db:push
```

This will apply the schema changes to your database.

---

## 2. New Files Created

### `/server/services/LogicService.ts`

Centralized service for workflow logic evaluation and navigation.

**Key Methods:**
- `evaluateNavigation(workflowId, runId, currentPageId)` - Evaluates logic and determines next page
- `validateCompletion(workflowId, runId)` - Validates that all required steps are complete
- `calculateProgress(currentPageId, pages, visiblePages)` - Calculates progress percentage

**Returns:**
```typescript
interface NavigationResult {
  visiblePages: string[];       // Array of visible page IDs
  visibleSteps: string[];          // Array of visible step IDs
  requiredSteps: string[];         // Array of required step IDs
  skipToPageId?: string;        // Page to skip to (if any)
  nextPageId: string | null;    // Next page ID or null if complete
  currentProgress: number;         // Progress 0-100
}
```

---

## 3. Enhanced Files

### `/shared/schema.ts`
- Added `currentPageId` and `progress` fields to `workflowRuns` table
- Added `skip_to` action to `conditionalActionEnum`

### `/shared/workflowLogic.ts`
- Added support for `skip_to` action in page-level rules
- Added `calculateNextPage()` function for page navigation
- Added `resolveNextPage()` function to handle skip logic
- Enhanced `WorkflowEvaluationResult` interface with `nextPageId` field

### `/server/services/RunService.ts`
- Added `next(runId, userId)` method - Calculates next page and updates run state
- Updated `completeRun(runId, userId)` method - Now uses LogicService for validation
- Added dependency injection for LogicService

### `/server/routes/runs.routes.ts`
- Added `POST /api/runs/:runId/next` endpoint

---

## 4. API Endpoints

### **POST /api/runs/:runId/next**

Calculate and navigate to the next page in the workflow.

**Authentication:** Required

**Path Parameters:**
- `runId` (string) - The workflow run ID

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "visiblePages": [
      "page-id-1",
      "page-id-2",
      "page-id-4"
    ],
    "visibleSteps": [
      "step-id-1",
      "step-id-2",
      "step-id-3"
    ],
    "requiredSteps": [
      "step-id-1",
      "step-id-3"
    ],
    "skipToPageId": null,
    "nextPageId": "page-id-2",
    "currentProgress": 33
  }
}
```

**Response (With Skip Logic - 200):**
```json
{
  "success": true,
  "data": {
    "visiblePages": [
      "page-id-1",
      "page-id-3",
      "page-id-4"
    ],
    "visibleSteps": [
      "step-id-1",
      "step-id-5",
      "step-id-6"
    ],
    "requiredSteps": [
      "step-id-5"
    ],
    "skipToPageId": "page-id-4",
    "nextPageId": "page-id-4",
    "currentProgress": 66
  }
}
```

**Response (Workflow Complete - 200):**
```json
{
  "success": true,
  "data": {
    "visiblePages": [
      "page-id-1",
      "page-id-2",
      "page-id-3"
    ],
    "visibleSteps": [
      "step-id-1",
      "step-id-2",
      "step-id-3"
    ],
    "requiredSteps": [
      "step-id-1",
      "step-id-2"
    ],
    "skipToPageId": null,
    "nextPageId": null,
    "currentProgress": 100
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "error": "Run is already completed"
}
```

**Response (Error - 404):**
```json
{
  "success": false,
  "error": "Run not found"
}
```

**Response (Error - 403):**
```json
{
  "success": false,
  "error": "Access denied"
}
```

---

### **PUT /api/runs/:runId/complete**

Mark a workflow run as complete (with validation).

**Authentication:** Required

**Path Parameters:**
- `runId` (string) - The workflow run ID

**Response (Success - 200):**
```json
{
  "id": "run-id-123",
  "workflowId": "workflow-id-456",
  "participantId": "participant-id-789",
  "currentPageId": "page-id-3",
  "progress": 100,
  "completed": true,
  "completedAt": "2025-11-05T16:45:30.123Z",
  "metadata": {},
  "createdAt": "2025-11-05T15:30:00.000Z",
  "updatedAt": "2025-11-05T16:45:30.123Z"
}
```

**Response (Error - 400 Missing Required Steps):**
```json
{
  "message": "Missing required steps: Email Address, Phone Number"
}
```

**Response (Error - 400 Already Complete):**
```json
{
  "message": "Run is already completed"
}
```

---

## 5. Logic Rule Examples

### Skip to Page Rule

Create a logic rule that skips to a specific page based on a condition:

```typescript
{
  "workflowId": "workflow-id-123",
  "conditionStepId": "step-user-type-id",
  "operator": "equals",
  "conditionValue": "premium",
  "targetType": "page",
  "targetPageId": "page-premium-features-id",
  "action": "skip_to",
  "logicalOperator": "AND",
  "order": 1
}
```

**Behavior:**
- When `step-user-type-id` equals "premium", workflow will skip directly to `page-premium-features-id`
- Normal page progression is bypassed
- If the skip target page is not visible, finds the next visible page

### Hide Page Rule

```typescript
{
  "workflowId": "workflow-id-123",
  "conditionStepId": "step-has-business-id",
  "operator": "equals",
  "conditionValue": false,
  "targetType": "page",
  "targetPageId": "page-business-info-id",
  "action": "hide",
  "logicalOperator": "AND",
  "order": 1
}
```

**Behavior:**
- When `step-has-business-id` is false, `page-business-info-id` is hidden
- Hidden pages are skipped in navigation
- All steps in hidden pages are also hidden

---

## 6. Frontend Integration Guide

### Workflow Runner Flow

```typescript
// 1. User starts a workflow run
const response = await fetch(`/api/workflows/${workflowId}/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ participantId })
});
const run = await response.json();

// 2. Get first page to display
const navResponse = await fetch(`/api/runs/${run.id}/next`, {
  method: 'POST'
});
const navigation = await navResponse.json();

// Display navigation.data.nextPageId
// Show only steps in navigation.data.visibleSteps
// Mark steps in navigation.data.requiredSteps as required
// Show progress: navigation.data.currentProgress

// 3. User fills in step values and clicks "Next"
await fetch(`/api/runs/${run.id}/values/bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    values: [
      { stepId: 'step-1', value: 'answer1' },
      { stepId: 'step-2', value: 'answer2' }
    ]
  })
});

// 4. Get next page
const nextNav = await fetch(`/api/runs/${run.id}/next`, {
  method: 'POST'
});
const nextNavigation = await nextNav.json();

if (nextNavigation.data.nextPageId === null) {
  // Workflow complete - show completion page
  // Or allow user to review and submit
} else {
  // Navigate to nextNavigation.data.nextPageId
}

// 5. When user clicks "Complete"
const completeResponse = await fetch(`/api/runs/${run.id}/complete`, {
  method: 'PUT'
});

if (completeResponse.ok) {
  // Success - show confirmation
} else {
  const error = await completeResponse.json();
  // Show error: error.message (includes missing step titles)
}
```

---

## 7. Testing Checklist

- [ ] Create workflow with multiple pages
- [ ] Create logic rule with `skip_to` action
- [ ] Start workflow run and verify first page loads
- [ ] Fill in values and call `/next` endpoint
- [ ] Verify `currentPageId` and `progress` are updated in database
- [ ] Verify skip logic works when condition is met
- [ ] Verify required step validation on completion
- [ ] Verify error handling for missing required steps
- [ ] Verify workflow can be completed successfully
- [ ] Test nested skip logic (skip to page that has skip rules)
- [ ] Test hidden pages are properly skipped
- [ ] Test progress calculation is accurate

---

## 8. Implementation Details

### Page Visibility Logic

By default, all pages are visible unless:
1. A `hide` action rule is triggered for that page
2. The page is not in the workflow's page list

### Step Visibility Logic

Steps are visible if:
1. Their parent page is visible
2. No `hide` action rule is triggered for the step
3. Or a `show` action rule is explicitly triggered

### Navigation Priority

1. **Skip Logic** - If `skipToPageId` is set, it takes precedence
2. **Next Sequential Page** - Normal progression through pages by order
3. **Completion** - When no more visible pages exist, `nextPageId` is null

### Progress Calculation

```
progress = (current_page_index + 1) / total_visible_pages * 100
```

- Only counts visible pages
- Ranges from 0 to 100
- Set to 100 on completion

---

## 9. Database Migration Notes

The schema changes are backward compatible:
- `currentPageId` is nullable (existing runs will have null)
- `progress` has a default value of 0
- `skip_to` action is added to enum (no existing data to migrate)

Existing workflow runs will continue to work but won't have navigation tracking until the `/next` endpoint is called.

---

## 10. Performance Considerations

- Logic evaluation happens on every `/next` call
- Caching may be beneficial for workflows with many rules
- Consider adding indexes on frequently queried fields
- Bulk value updates are more efficient than single updates

---

## 11. Future Enhancements

Potential improvements for future iterations:

1. **Rule Caching** - Cache logic evaluation results
2. **Conditional Branching** - Support multiple skip targets based on different conditions
3. **Page Loops** - Allow repeating pages
4. **Dynamic Page Generation** - Create pages based on runtime data
5. **Progress Checkpoints** - Save/restore run state at specific pages
6. **Rule Testing UI** - Visual rule debugging and testing tool

---

✅ **Vault-Logic backend updated — page skip logic, run navigation, and runtime evaluation implemented successfully.**

## Files Modified

1. `shared/schema.ts` - Schema updates
2. `shared/workflowLogic.ts` - Enhanced logic evaluation
3. `server/services/LogicService.ts` - New service (created)
4. `server/services/RunService.ts` - Added navigation methods
5. `server/routes/runs.routes.ts` - Added `/next` endpoint

## Next Steps

1. Set up `DATABASE_URL` in your `.env` file
2. Run `npm run db:push` to apply schema changes
3. Test the `/next` endpoint with your workflow
4. Integrate frontend workflow runner with navigation API
5. Deploy to production environment

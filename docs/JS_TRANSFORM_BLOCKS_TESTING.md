# JS Transform Blocks - Testing Guide

This document provides comprehensive testing instructions for the end-to-end JS transform block feature.

## Overview

JS transform blocks allow you to write custom JavaScript code that transforms workflow data at specific execution phases. The blocks execute in a sandboxed vm2 environment with controlled input/output.

## Features

- **Phase-based execution**: onRunStart, onSectionSubmit, onNext, onRunComplete
- **Sandboxed execution**: vm2 with timeout (100-3000ms)
- **Input whitelisting**: Only specified inputKeys are accessible
- **Persistent output**: Results stored in step_values
- **Error handling**: Timeouts and runtime errors don't crash the workflow

## Setup

### 1. Apply Database Migration

```bash
# Apply the migration to add phase and sectionId columns
npm run db:push
```

Or manually run the migration:

```bash
psql $DATABASE_URL < migrations/0005_add_transform_block_phases.sql
```

### 2. Start the Server

```bash
npm run dev
```

## API Testing

### Prerequisites

Set these environment variables:

```bash
export API_URL="http://localhost:5173"
export WORKFLOW_ID="your-workflow-id"
export AUTH_TOKEN="your-auth-token"
```

### Test 1: Create a JS Transform Block

**Goal**: Create a block that combines firstName + lastName into fullName

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Combine Names",
    "language": "javascript",
    "phase": "onSectionSubmit",
    "code": "return input.firstName + \" \" + input.lastName;",
    "inputKeys": ["firstName", "lastName"],
    "outputKey": "fullName",
    "enabled": true,
    "order": 1,
    "timeoutMs": 1000
  }'
```

**Expected Response**:

```json
{
  "success": true,
  "data": {
    "id": "block-uuid",
    "workflowId": "workflow-uuid",
    "name": "Combine Names",
    "language": "javascript",
    "phase": "onSectionSubmit",
    "code": "return input.firstName + \" \" + input.lastName;",
    "inputKeys": ["firstName", "lastName"],
    "outputKey": "fullName",
    "enabled": true,
    "order": 1,
    "timeoutMs": 1000
  }
}
```

### Test 2: Create a Workflow Run

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/runs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "currentSectionId": null,
    "progress": 0
  }'
```

**Expected Response**:

```json
{
  "success": true,
  "data": {
    "runId": "run-uuid",
    "runToken": "run-token-string"
  }
}
```

Save the runId and runToken for subsequent tests:

```bash
export RUN_ID="run-uuid"
export RUN_TOKEN="run-token-string"
```

### Test 3: Submit Section Values (Triggers onSectionSubmit)

```bash
curl -X POST "$API_URL/api/runs/$RUN_ID/sections/$SECTION_ID/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RUN_TOKEN" \
  -d '{
    "values": [
      {"stepId": "firstName", "value": "Ada"},
      {"stepId": "lastName", "value": "Lovelace"}
    ]
  }'
```

**Expected Response** (if validation passes):

```json
{
  "success": true,
  "message": "Section values saved"
}
```

### Test 4: Verify Transform Block Output

```bash
curl "$API_URL/api/runs/$RUN_ID/values" \
  -H "Authorization: Bearer $RUN_TOKEN"
```

**Expected Response**:

```json
{
  "success": true,
  "data": {
    "id": "run-uuid",
    "workflowId": "workflow-uuid",
    "values": [
      {"stepId": "firstName", "value": "Ada"},
      {"stepId": "lastName", "value": "Lovelace"},
      {"stepId": "fullName", "value": "Ada Lovelace"}
    ]
  }
}
```

✅ **Success**: The `fullName` value was computed by the JS transform block!

### Test 5: Create a Branch Block Using Transform Output

Create a branch block that uses the computed `fullName`:

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "type": "branch",
    "phase": "onNext",
    "config": {
      "branches": [
        {
          "when": {"key": "fullName", "op": "contains", "value": "Ada"},
          "gotoSectionId": "special-section-id"
        }
      ],
      "fallbackSectionId": "default-section-id"
    },
    "enabled": true,
    "order": 1
  }'
```

### Test 6: Test Different Phases

#### onRunStart Block

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Initialize Data",
    "language": "javascript",
    "phase": "onRunStart",
    "code": "return new Date().toISOString();",
    "inputKeys": [],
    "outputKey": "startTime",
    "enabled": true,
    "order": 1
  }'
```

#### onNext Block (Calculate Progress)

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Calculate Progress",
    "language": "javascript",
    "phase": "onNext",
    "code": "return (input.completedSections / input.totalSections) * 100;",
    "inputKeys": ["completedSections", "totalSections"],
    "outputKey": "progressPercent",
    "enabled": true,
    "order": 1
  }'
```

#### onRunComplete Block (Final Validation)

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Validate Completion",
    "language": "javascript",
    "phase": "onRunComplete",
    "code": "if (!input.fullName || !input.email) throw new Error(\"Missing required fields\"); return true;",
    "inputKeys": ["fullName", "email"],
    "outputKey": "validationPassed",
    "enabled": true,
    "order": 1
  }'
```

### Test 7: Test Error Handling

#### Timeout Error

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Infinite Loop",
    "language": "javascript",
    "phase": "onSectionSubmit",
    "code": "while(true) {}",
    "inputKeys": [],
    "outputKey": "test",
    "timeoutMs": 100,
    "enabled": true,
    "order": 1
  }'
```

Submit section to trigger the block - should timeout after 100ms.

#### Runtime Error

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Syntax Error",
    "language": "javascript",
    "phase": "onSectionSubmit",
    "code": "return input.nonExistent.property.access;",
    "inputKeys": ["firstName"],
    "outputKey": "test",
    "enabled": true,
    "order": 1
  }'
```

Should return a SandboxError when executed.

### Test 8: Test Block with Complex Logic

```bash
curl -X POST "$API_URL/api/workflows/$WORKFLOW_ID/transform-blocks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Calculate Total with Tax",
    "language": "javascript",
    "phase": "onSectionSubmit",
    "code": "const subtotal = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0); const tax = subtotal * input.taxRate; return { subtotal, tax, total: subtotal + tax };",
    "inputKeys": ["items", "taxRate"],
    "outputKey": "orderSummary",
    "enabled": true,
    "order": 1,
    "timeoutMs": 2000
  }'
```

Then submit section values:

```bash
curl -X POST "$API_URL/api/runs/$RUN_ID/sections/$SECTION_ID/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RUN_TOKEN" \
  -d '{
    "values": [
      {
        "stepId": "items",
        "value": [
          {"name": "Widget", "price": 10, "quantity": 2},
          {"name": "Gadget", "price": 25, "quantity": 1}
        ]
      },
      {"stepId": "taxRate", "value": 0.08}
    ]
  }'
```

**Expected**: `orderSummary` = `{ subtotal: 45, tax: 3.6, total: 48.6 }`

## UI Testing

### 1. Open Workflow Builder

1. Navigate to the workflow builder
2. Click on the "Transform" tab in the Inspector panel
3. Click "Add" to create a new transform block

### 2. Configure Block

Fill in the form:

- **Name**: "Combine Names"
- **Language**: JavaScript
- **Phase**: On Section Submit
- **Code**:
  ```javascript
  return input.firstName + " " + input.lastName;
  ```
- **Input Keys**: `firstName, lastName`
- **Output Key**: `fullName`
- **Timeout**: `1000`
- **Order**: `1`
- **Enabled**: ✓

### 3. Verify UI

- Block card should show the phase
- Block should display in the list with all details
- Edit should preserve all fields

### 4. Test Workflow

1. Start a new run
2. Enter "Ada" for firstName
3. Enter "Lovelace" for lastName
4. Submit section
5. Verify fullName appears in step values

## Manual Test Plan

### Test Case 1: Basic Transform

**Steps**:
1. Create workflow with steps: `firstName`, `lastName`
2. Add JS block (onSectionSubmit):
   - Code: `return input.firstName + " " + input.lastName;`
   - inputKeys: `["firstName", "lastName"]`
   - outputKey: `"fullName"`
3. Create run
4. Submit section with firstName="Ada", lastName="Lovelace"
5. Check step_values for fullName

**Expected**: `fullName = "Ada Lovelace"`

### Test Case 2: Transform → Branch

**Steps**:
1. Create JS block (onSectionSubmit): compute `fullName`
2. Add branch block (onNext):
   - Condition: `fullName contains "Ada"`
   - Goto: special section
3. Submit section data
4. Call /next endpoint
5. Verify navigation

**Expected**: Navigates to special section

### Test Case 3: Validation on Complete

**Steps**:
1. Create JS block (onRunComplete):
   - Code: `if (!input.email) throw new Error("Email required"); return true;`
   - inputKeys: `["email"]`
2. Create run without email
3. Call /complete endpoint

**Expected**: 400 error with "Validation failed: Email required"

### Test Case 4: Timeout

**Steps**:
1. Create JS block with timeout=100ms
2. Code: `while(true) {}`
3. Submit section to trigger

**Expected**: Block fails with TimeoutError, workflow continues

### Test Case 5: Multiple Blocks in Sequence

**Steps**:
1. Create block #1 (order=1): `fullName = firstName + " " + lastName`
2. Create block #2 (order=2): `greeting = "Hello, " + input.fullName`
3. Submit section data

**Expected**: Both outputs persisted, greeting uses fullName

## Audit & Monitoring

### Check Transform Block Runs

```sql
SELECT
  tbr.id,
  tb.name,
  tbr.status,
  tbr.started_at,
  tbr.finished_at,
  tbr.error_message,
  tbr.output_sample
FROM transform_block_runs tbr
JOIN transform_blocks tb ON tb.id = tbr.block_id
WHERE tbr.run_id = '<run-id>'
ORDER BY tbr.started_at;
```

### Performance Metrics

```sql
SELECT
  tb.name,
  COUNT(*) as execution_count,
  AVG(EXTRACT(EPOCH FROM (tbr.finished_at - tbr.started_at))) as avg_duration_seconds,
  SUM(CASE WHEN tbr.status = 'success' THEN 1 ELSE 0 END) as success_count,
  SUM(CASE WHEN tbr.status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
  SUM(CASE WHEN tbr.status = 'error' THEN 1 ELSE 0 END) as error_count
FROM transform_block_runs tbr
JOIN transform_blocks tb ON tb.id = tbr.block_id
GROUP BY tb.id, tb.name
ORDER BY execution_count DESC;
```

## Troubleshooting

### Issue: Block not executing

**Checks**:
- Is the block `enabled: true`?
- Is the phase correct for your use case?
- Check server logs for errors
- Verify workflow has the block attached

### Issue: Timeout errors

**Solutions**:
- Increase `timeoutMs` (max 3000)
- Optimize code (avoid loops)
- Reduce input data size

### Issue: Output not persisted

**Checks**:
- Verify `outputKey` is unique
- Check transform_block_runs table for errors
- Verify step_values table has the entry

### Issue: Input undefined

**Checks**:
- Verify `inputKeys` match step IDs
- Ensure step values exist before block runs
- Check phase ordering (onRunStart runs before data exists)

## Success Criteria

✅ JS transform blocks fully wired:
- [x] Config (phase, inputKeys, outputKey, timeout) → sandbox execute → persist → influence navigation
- [x] Backend: BlockRunner integrates transform blocks at all phases
- [x] Frontend: TransformBlocksPanel supports phase selection
- [x] Database: Migration adds phase and sectionId columns
- [x] Execution: vm2 sandbox with return-based function model
- [x] Error handling: Timeouts and runtime errors don't crash workflows
- [x] Persistence: Outputs stored in step_values
- [x] Navigation: Branch blocks can use transform outputs
- [x] Validation: onSectionSubmit/onRunComplete can reject with errors

# Block Framework - Examples & Test Checklist

This document provides example curl commands and a test checklist for the newly implemented Block Framework.

## Overview

The Block Framework enables runtime execution of three block types:
- **Prefill**: Seeds data with static values or query parameters
- **Validate**: Validates data with conditional rules
- **Branch**: Conditional navigation between pages

## Example cURL Commands

### 1. Create a Prefill Block (onRunStart)

**Purpose**: Automatically prefill user email and role when a run starts.

```bash
curl -X POST http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "type": "prefill",
    "phase": "onRunStart",
    "config": {
      "mode": "static",
      "staticMap": {
        "user_email": "test@example.com",
        "user_role": "admin"
      },
      "overwrite": false
    },
    "enabled": true,
    "order": 0
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "block-uuid-1",
    "workflowId": "workflow-uuid",
    "pageId": null,
    "type": "prefill",
    "phase": "onRunStart",
    "config": { ... },
    "enabled": true,
    "order": 0,
    "createdAt": "2025-11-05T...",
    "updatedAt": "2025-11-05T..."
  }
}
```

### 2. Create a Prefill Block (Query Mode)

**Purpose**: Prefill data from whitelisted query parameters.

```bash
curl -X POST http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "type": "prefill",
    "phase": "onRunStart",
    "config": {
      "mode": "query",
      "queryKeys": ["utm_source", "utm_campaign", "referrer"],
      "overwrite": false
    },
    "enabled": true,
    "order": 1
  }'
```

### 3. Create a Validate Block (onPageSubmit)

**Purpose**: Validate that age is not empty and greater than 18, and email matches a pattern.

```bash
curl -X POST http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "type": "validate",
    "phase": "onPageSubmit",
    "pageId": "{PAGE_ID}",
    "config": {
      "rules": [
        {
          "assert": {
            "key": "age",
            "op": "is_not_empty",
            "value": null
          },
          "message": "Age is required"
        },
        {
          "assert": {
            "key": "age",
            "op": "greater_than",
            "value": 18
          },
          "message": "You must be at least 18 years old"
        },
        {
          "assert": {
            "key": "email",
            "op": "regex",
            "value": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
          },
          "message": "Please enter a valid email address"
        }
      ]
    },
    "enabled": true,
    "order": 0
  }'
```

### 4. Create a Conditional Validate Block

**Purpose**: Only validate if user selected "professional" account type.

```bash
curl -X POST http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "type": "validate",
    "phase": "onPageSubmit",
    "pageId": "{PAGE_ID}",
    "config": {
      "rules": [
        {
          "when": {
            "key": "account_type",
            "op": "equals",
            "value": "professional"
          },
          "assert": {
            "key": "company_name",
            "op": "is_not_empty"
          },
          "message": "Company name is required for professional accounts"
        }
      ]
    },
    "enabled": true,
    "order": 0
  }'
```

### 5. Create a Branch Block (onNext)

**Purpose**: Route users to different pages based on their answers.

```bash
curl -X POST http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "type": "branch",
    "phase": "onNext",
    "pageId": "{CURRENT_PAGE_ID}",
    "config": {
      "branches": [
        {
          "when": {
            "key": "is_new_customer",
            "op": "equals",
            "value": true
          },
          "gotoPageId": "{NEW_CUSTOMER_SECTION_ID}"
        },
        {
          "when": {
            "key": "subscription_type",
            "op": "equals",
            "value": "enterprise"
          },
          "gotoPageId": "{ENTERPRISE_SECTION_ID}"
        }
      ],
      "fallbackPageId": "{DEFAULT_SECTION_ID}"
    },
    "enabled": true,
    "order": 0
  }'
```

### 6. List Blocks for a Workflow

```bash
curl -X GET http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks \
  -H "Cookie: connect.sid={SESSION_COOKIE}"
```

### 7. List Blocks by Phase

```bash
curl -X GET "http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks?phase=onRunStart" \
  -H "Cookie: connect.sid={SESSION_COOKIE}"
```

### 8. Update a Block

```bash
curl -X PUT http://localhost:5000/api/blocks/{BLOCK_ID} \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "enabled": false,
    "config": {
      "mode": "static",
      "staticMap": {
        "user_email": "updated@example.com"
      }
    }
  }'
```

### 9. Reorder Blocks

```bash
curl -X PUT http://localhost:5000/api/workflows/{WORKFLOW_ID}/blocks/reorder \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "blocks": [
      {"id": "{BLOCK_ID_1}", "order": 0},
      {"id": "{BLOCK_ID_2}", "order": 1},
      {"id": "{BLOCK_ID_3}", "order": 2}
    ]
  }'
```

### 10. Delete a Block

```bash
curl -X DELETE http://localhost:5000/api/blocks/{BLOCK_ID} \
  -H "Cookie: connect.sid={SESSION_COOKIE}"
```

## Runtime Execution Examples

### 1. Create a Run (with query params for prefill)

```bash
curl -X POST "http://localhost:5000/api/workflows/{WORKFLOW_ID}/runs?utm_source=google&utm_campaign=spring2025" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "participantId": "{PARTICIPANT_ID}",
    "metadata": {}
  }'
```

**Note**: Query parameters will be picked up by prefill blocks with `mode: "query"`.

### 2. Submit Page Values (with validation)

```bash
curl -X POST http://localhost:5000/api/runs/{RUN_ID}/pages/{PAGE_ID}/submit \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "values": [
      {"stepId": "{AGE_STEP_ID}", "value": 25},
      {"stepId": "{EMAIL_STEP_ID}", "value": "user@example.com"}
    ]
  }'
```

**Success Response**:
```json
{
  "success": true
}
```

**Validation Error Response**:
```json
{
  "success": false,
  "errors": [
    "Age is required",
    "You must be at least 18 years old"
  ]
}
```

### 3. Navigate to Next Page (with branching)

```bash
curl -X POST http://localhost:5000/api/runs/{RUN_ID}/next \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid={SESSION_COOKIE}" \
  -d '{
    "currentPageId": "{CURRENT_SECTION_ID}"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "nextPageId": "{NEXT_SECTION_ID}"
  }
}
```

## Test Checklist

### Prerequisites
- [ ] Database is running and accessible
- [ ] Schema migrations are applied (`npm run db:push`)
- [ ] Server is running (`npm run dev`)
- [ ] User is authenticated (have valid session cookie)

### Setup Test Data
1. **Create Workflow**
   ```bash
   POST /api/workflows
   ```
   - [ ] Note workflow ID

2. **Create Pages**
   ```bash
   POST /api/workflows/{workflowId}/pages
   ```
   - [ ] Create "Demographics" page
   - [ ] Create "Account Type" page
   - [ ] Create "Enterprise Details" page
   - [ ] Create "Standard Details" page
   - [ ] Note all page IDs

3. **Create Steps**
   ```bash
   POST /api/pages/{pageId}/steps
   ```
   - [ ] Create "age" step (Demographics)
   - [ ] Create "email" step (Demographics)
   - [ ] Create "account_type" step (Account Type)
   - [ ] Create "company_name" step (Enterprise Details)
   - [ ] Note all step IDs

### Test Prefill Blocks

#### Static Prefill
- [ ] Create static prefill block
- [ ] Create a new run
- [ ] Verify prefilled values exist in step_values
- [ ] Verify `overwrite: false` doesn't overwrite existing values
- [ ] Update block with `overwrite: true`
- [ ] Create new run and verify overwrite works

#### Query Prefill
- [ ] Create query prefill block with whitelisted keys
- [ ] Create run with query parameters in URL
- [ ] Verify whitelisted params are captured in step_values
- [ ] Verify non-whitelisted params are ignored

### Test Validate Blocks

#### Basic Validation
- [ ] Create validate block with `is_not_empty` rule
- [ ] Submit page with empty value
- [ ] Verify validation error is returned
- [ ] Submit page with valid value
- [ ] Verify submission succeeds

#### Numeric Validation
- [ ] Create validate block with `greater_than` rule
- [ ] Submit value below threshold
- [ ] Verify error message
- [ ] Submit value above threshold
- [ ] Verify success

#### Regex Validation
- [ ] Create validate block with regex pattern
- [ ] Submit invalid format
- [ ] Verify error message
- [ ] Submit valid format
- [ ] Verify success

#### Conditional Validation
- [ ] Create validate block with `when` condition
- [ ] Submit values that don't meet condition
- [ ] Verify validation is skipped
- [ ] Submit values that meet condition
- [ ] Verify validation runs and errors if assertion fails

### Test Branch Blocks

#### Simple Branching
- [ ] Create branch block with 2 conditions
- [ ] Set step value to match first condition
- [ ] Call `/next` endpoint
- [ ] Verify correct page is returned
- [ ] Set step value to match second condition
- [ ] Call `/next` endpoint
- [ ] Verify correct page is returned

#### Fallback Branching
- [ ] Create branch block with fallback
- [ ] Set step value to not match any condition
- [ ] Call `/next` endpoint
- [ ] Verify fallback page is returned

#### No Fallback
- [ ] Create branch block without fallback
- [ ] Set step value to not match any condition
- [ ] Call `/next` endpoint
- [ ] Verify `nextPageId` is undefined

### Test Block Management

#### CRUD Operations
- [ ] Create block - verify success
- [ ] Get block by ID - verify data matches
- [ ] Update block config - verify changes persist
- [ ] List blocks - verify all appear
- [ ] Filter blocks by phase - verify filtering works
- [ ] Delete block - verify it's removed

#### Ordering
- [ ] Create 3 blocks with different orders
- [ ] List blocks - verify correct order
- [ ] Reorder blocks
- [ ] List blocks - verify new order
- [ ] Execute blocks - verify execution follows order

#### Ownership
- [ ] Try to create block on another user's workflow - verify 403
- [ ] Try to update another user's block - verify 403
- [ ] Try to delete another user's block - verify 403

### Integration Testing

#### End-to-End Flow
1. [ ] Create workflow with multiple pages
2. [ ] Add prefill block (onRunStart)
3. [ ] Add validate blocks (onPageSubmit) on each page
4. [ ] Add branch blocks (onNext) for conditional navigation
5. [ ] Create run with query params
6. [ ] Verify prefill executed
7. [ ] Submit first page with invalid data
8. [ ] Verify validation errors
9. [ ] Submit first page with valid data
10. [ ] Verify success
11. [ ] Navigate to next page
12. [ ] Verify branch logic executed correctly
13. [ ] Complete workflow
14. [ ] Verify all data persisted correctly

### Error Handling
- [ ] Submit invalid block type - verify 400/500 error
- [ ] Submit invalid phase - verify error
- [ ] Submit invalid config format - verify error
- [ ] Execute block on non-existent workflow - verify 404
- [ ] Execute block on non-existent page - verify 404
- [ ] Submit page with non-existent block - handle gracefully

### Performance
- [ ] Create workflow with 10+ blocks
- [ ] Measure execution time for each phase
- [ ] Verify all blocks execute in order
- [ ] Verify no race conditions

---

## Notes

- **Session Authentication**: All endpoints require authentication. Use browser dev tools to extract `connect.sid` cookie after logging in.
- **Block Execution Order**: Blocks execute in ascending order of the `order` field within the same phase.
- **Phase Execution**:
  - `onRunStart`: Executed once when run is created
  - `onPageEnter`: Not yet implemented in routes (future enhancement)
  - `onPageSubmit`: Executed when page values are submitted
  - `onNext`: Executed when navigating to next page
  - `onRunComplete`: Not yet implemented in routes (future enhancement)

- **Data Merging**: Prefill blocks merge their updates into the data object. Multiple prefill blocks can contribute different keys.
- **Validation Short-Circuit**: All validation rules are evaluated; errors are collected and returned together.
- **Branch First-Match**: First matching branch wins; subsequent branches are ignored.

✅ **Block Framework implemented successfully!**

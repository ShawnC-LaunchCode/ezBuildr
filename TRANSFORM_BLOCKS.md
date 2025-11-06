# Transform Blocks — Vault-Logic

Transform Blocks enable you to attach custom JavaScript or Python logic to workflows that run during execution, allowing you to compute derived values, transform data, and perform custom calculations.

## Overview

Transform Blocks are executed **during workflow run completion** (before validation), allowing you to:

- Compute derived values (e.g., calculate totals, apply formulas)
- Transform and normalize user input
- Perform complex calculations or data transformations
- Generate computed fields that can be used in subsequent logic

### Features

- **Two execution modes**: JavaScript (vm2 sandbox) or Python (subprocess with restricted environment)
- **Sandboxed execution**: No file system or network access
- **Timeout enforcement**: Configurable timeouts (100-3000ms) with automatic termination
- **Input whitelisting**: Only specified step keys are accessible to the code
- **Audit logging**: All executions are logged with status, errors, and output samples
- **Rate limiting**: Test endpoint limited to 10 requests per minute per user

## Architecture

```
Workflows → Sections → Steps → Transform Blocks → WorkflowRuns → StepValues
                                       ↓
                                TransformBlockRuns (audit log)
```

### Database Tables

**`transform_blocks`**
- `id` - UUID primary key
- `workflowId` - FK to workflows
- `name` - Block name
- `language` - "javascript" or "python"
- `code` - User-supplied code
- `inputKeys` - Array of step keys to read from data
- `outputKey` - Single key to write back to data
- `enabled` - Boolean (only enabled blocks execute)
- `order` - Execution order
- `timeoutMs` - Timeout in milliseconds (default 1000ms)

**`transform_block_runs`** (audit log)
- `id` - UUID primary key
- `runId` - FK to workflow_runs
- `blockId` - FK to transform_blocks
- `startedAt` - Timestamp
- `finishedAt` - Timestamp
- `status` - "success", "timeout", or "error"
- `errorMessage` - Error details if failed
- `outputSample` - Sample of output (JSON)

## API Reference

### 1. Create Transform Block

Creates a new transform block for a workflow.

**Endpoint**: `POST /api/workflows/:workflowId/transform-blocks`

**Request Body**:
```json
{
  "name": "Compute Total",
  "language": "javascript",
  "code": "emit(input.amount * (1 + input.taxRate))",
  "inputKeys": ["amount", "taxRate"],
  "outputKey": "total",
  "enabled": true,
  "order": 1,
  "timeoutMs": 1000
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "workflowId": "...",
    "name": "Compute Total",
    "language": "javascript",
    "code": "emit(input.amount * (1 + input.taxRate))",
    "inputKeys": ["amount", "taxRate"],
    "outputKey": "total",
    "enabled": true,
    "order": 1,
    "timeoutMs": 1000,
    "createdAt": "2025-11-05T...",
    "updatedAt": "2025-11-05T..."
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:5000/api/workflows/WORKFLOW_ID/transform-blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "name": "Compute Total",
    "language": "javascript",
    "code": "emit(input.amount * (1 + input.taxRate))",
    "inputKeys": ["amount", "taxRate"],
    "outputKey": "total",
    "enabled": true,
    "order": 1,
    "timeoutMs": 1000
  }'
```

---

### 2. List Transform Blocks

Lists all transform blocks for a workflow (ordered by execution order).

**Endpoint**: `GET /api/workflows/:workflowId/transform-blocks`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "workflowId": "...",
      "name": "Compute Total",
      "language": "javascript",
      "code": "emit(input.amount * (1 + input.taxRate))",
      "inputKeys": ["amount", "taxRate"],
      "outputKey": "total",
      "enabled": true,
      "order": 1,
      "timeoutMs": 1000,
      "createdAt": "2025-11-05T...",
      "updatedAt": "2025-11-05T..."
    }
  ]
}
```

**cURL Example**:
```bash
curl http://localhost:5000/api/workflows/WORKFLOW_ID/transform-blocks \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

---

### 3. Update Transform Block

Updates an existing transform block.

**Endpoint**: `PUT /api/transform-blocks/:blockId`

**Request Body** (all fields optional):
```json
{
  "name": "Compute Total with Discount",
  "code": "emit(input.amount * (1 + input.taxRate) * (1 - input.discount))",
  "inputKeys": ["amount", "taxRate", "discount"],
  "enabled": false
}
```

**cURL Example**:
```bash
curl -X PUT http://localhost:5000/api/transform-blocks/BLOCK_ID \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "name": "Compute Total with Discount",
    "enabled": false
  }'
```

---

### 4. Delete Transform Block

Deletes a transform block.

**Endpoint**: `DELETE /api/transform-blocks/:blockId`

**Response**:
```json
{
  "success": true,
  "message": "Transform block deleted"
}
```

**cURL Example**:
```bash
curl -X DELETE http://localhost:5000/api/transform-blocks/BLOCK_ID \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

---

### 5. Test Transform Block

Tests a transform block with sample data (preview/debug).

**Endpoint**: `POST /api/transform-blocks/:blockId/test`

**Request Body**:
```json
{
  "data": {
    "amount": 100,
    "taxRate": 0.07
  }
}
```

**Response (success)**:
```json
{
  "success": true,
  "data": {
    "output": 107
  }
}
```

**Response (error)**:
```json
{
  "success": false,
  "error": "SandboxError: input is not defined"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:5000/api/transform-blocks/BLOCK_ID/test \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "data": {
      "amount": 100,
      "taxRate": 0.07
    }
  }'
```

---

## Code Examples

### JavaScript

Transform blocks in JavaScript use the built-in Node.js `vm` module (or `vm2` if available).

**Basic calculation**:
```javascript
// inputKeys: ["amount", "taxRate"]
// outputKey: "total"

emit(input.amount * (1 + input.taxRate));
```

**Conditional logic**:
```javascript
// inputKeys: ["age", "hasLicense"]
// outputKey: "canDrive"

if (input.age >= 16 && input.hasLicense) {
  emit(true);
} else {
  emit(false);
}
```

**Array operations**:
```javascript
// inputKeys: ["items"]
// outputKey: "totalPrice"

const total = input.items.reduce((sum, item) => sum + item.price, 0);
emit(total);
```

**Object construction**:
```javascript
// inputKeys: ["firstName", "lastName"]
// outputKey: "fullName"

emit({
  full: input.firstName + " " + input.lastName,
  initials: input.firstName[0] + input.lastName[0]
});
```

### Python

Transform blocks in Python run in a subprocess with restricted builtins.

**Basic calculation**:
```python
# inputKeys: ["amount", "taxRate"]
# outputKey: "total"

emit(input["amount"] * (1 + input["taxRate"]))
```

**Conditional logic**:
```python
# inputKeys: ["age", "hasLicense"]
# outputKey: "canDrive"

if input["age"] >= 16 and input["hasLicense"]:
    emit(True)
else:
    emit(False)
```

**List operations**:
```python
# inputKeys: ["numbers"]
# outputKey: "stats"

numbers = input["numbers"]
emit({
    "sum": sum(numbers),
    "avg": sum(numbers) / len(numbers),
    "min": min(numbers),
    "max": max(numbers)
})
```

**String manipulation**:
```python
# inputKeys: ["text"]
# outputKey: "processed"

text = input["text"]
emit({
    "upper": text.upper(),
    "length": len(text),
    "words": len(text.split())
})
```

---

## Execution Flow

When a workflow run is completed (`PUT /api/runs/:runId/complete`):

1. **Fetch current step values** → Build data map: `{ stepId: value }`
2. **Execute all enabled transform blocks** (ordered by `order` field):
   - For each block:
     - Build input object with only `inputKeys` from data map
     - Execute code in sandbox (JavaScript or Python)
     - On success: write `{ [outputKey]: output }` to data map
     - On error: log error, continue to next block
     - Write audit log entry to `transform_block_runs`
3. **Persist computed outputs** to `step_values` table
4. **Continue with validation** using updated data map
5. **Mark run as complete**

---

## Run Workflow with Transform Blocks

Once transform blocks are created, they execute automatically during workflow completion.

**Create a workflow run**:
```bash
curl -X POST http://localhost:5000/api/workflows/WORKFLOW_ID/runs \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "participantId": null,
    "metadata": {}
  }'
```

**Save step values**:
```bash
curl -X POST http://localhost:5000/api/runs/RUN_ID/values/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "values": [
      { "stepId": "step-amount-id", "value": 100 },
      { "stepId": "step-tax-rate-id", "value": 0.07 }
    ]
  }'
```

**Complete the run** (transform blocks execute here):
```bash
curl -X PUT http://localhost:5000/api/runs/RUN_ID/complete \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

After completion, the computed values (e.g., `total: 107`) are persisted to `step_values` and can be retrieved:

```bash
curl http://localhost:5000/api/runs/RUN_ID/values \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

---

## Security & Limits

### Sandboxing

**JavaScript (vm2)**:
- No access to `require`, `process`, `Buffer`, `global`, `setTimeout`, `setInterval`
- Only `input` object and `emit()` function available
- Timeout enforced (default 1000ms, max 3000ms)
- Falls back to Node.js `vm` module if `vm2` not available

**Python (subprocess)**:
- Runs in isolated subprocess
- Restricted builtins: only safe operations (no `os`, `sys`, `open`, `subprocess`, `socket`)
- No file system or network access
- Timeout enforced with process termination
- Max output size: 64KB

### Limits

| Limit | Value |
|-------|-------|
| Code size | 32 KB |
| Input size | 64 KB |
| Output size | 64 KB |
| Timeout (min) | 100 ms |
| Timeout (max) | 3000 ms |
| Test rate limit | 10 requests/min per user |

### Error Handling

Transform block errors **do not prevent run completion**. Errors are:
- Logged to console
- Written to audit table (`transform_block_runs`)
- Returned in the execution result (for debugging)

If a transform block fails, its `outputKey` will be missing from the data map.

---

## Example Workflow

**1. Create a workflow**:
```bash
curl -X POST http://localhost:5000/api/workflows \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "title": "Order Calculation",
    "description": "Calculate order totals with tax",
    "status": "active"
  }'
```

**2. Create transform block**:
```bash
curl -X POST http://localhost:5000/api/workflows/WORKFLOW_ID/transform-blocks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "name": "Calculate Order Total",
    "language": "javascript",
    "code": "emit({ subtotal: input.quantity * input.price, total: input.quantity * input.price * (1 + input.taxRate) })",
    "inputKeys": ["quantity", "price", "taxRate"],
    "outputKey": "orderTotals",
    "enabled": true,
    "order": 1
  }'
```

**3. Test the block**:
```bash
curl -X POST http://localhost:5000/api/transform-blocks/BLOCK_ID/test \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "data": {
      "quantity": 5,
      "price": 20,
      "taxRate": 0.08
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "output": {
      "subtotal": 100,
      "total": 108
    }
  }
}
```

---

## Troubleshooting

### Common Errors

**"Code did not call emit() to produce output"**
- Ensure your code calls `emit(value)` exactly once

**"TimeoutError: Execution exceeded time limit"**
- Reduce computation complexity or increase `timeoutMs` (max 3000ms)

**"SandboxError: input is not defined"** (JavaScript)
- Use `input.keyName` to access input values
- Ensure `inputKeys` includes the keys you're accessing

**"PythonError: KeyError: 'keyName'"** (Python)
- Use `input["keyName"]` to access input values
- Ensure `inputKeys` includes the keys you're accessing

**"Rate limit exceeded"**
- Test endpoint limited to 10 requests/min per user
- Wait 60 seconds before retrying

---

## Notes

- Transform blocks execute **in order** (by `order` field)
- Only **enabled** blocks execute during runs
- Blocks can reference outputs from previous blocks via `inputKeys`
- Computed values are persisted to `step_values` for later retrieval
- Python requires `python3` to be installed and available in PATH

---

✅ **Vault-Logic Transform Blocks implemented — sandboxed JS/Python execution, auditing, and run-time integration complete.**

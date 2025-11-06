# Run Token Authentication - Vault-Logic

This document describes the new authentication system for Vault-Logic workflow runs.

## Overview

Workflow runs in Vault-Logic now use **run tokens** instead of participants/recipients. This simplifies the architecture and enables both authenticated (creator) and anonymous runs.

## Key Changes

### 1. Database Schema

**Removed:**
- `participants` table (completely removed)
- `participantId` column from `workflow_runs`

**Added to `workflow_runs`:**
- `runToken` (text, unique, not null) - UUID token for run-specific authorization
- `createdBy` (text, nullable) - "creator:<userId>" or "anon"
- `currentSectionId` (uuid, nullable) - track progress
- `progress` (integer, default 0) - percentage 0-100

**Added to `workflows`:**
- `publicLink` (text, unique, nullable) - UUID/slug for anonymous access

### 2. Authentication Methods

**Creator Run (Authenticated):**
```bash
# Create run with session auth
POST /api/workflows/:workflowId/runs
Cookie: session=...

Response:
{
  "success": true,
  "data": {
    "runId": "uuid",
    "runToken": "uuid"
  }
}
```

**Anonymous Run:**
```bash
# Create run via publicLink (no auth required)
POST /api/workflows/:workflowId/runs?publicLink=<slug>

Response:
{
  "success": true,
  "data": {
    "runId": "uuid",
    "runToken": "uuid"
  }
}
```

### 3. Using Run Tokens

All run-mutating endpoints accept **either** session auth OR Bearer token:

```bash
# Submit step values using run token
curl -X POST http://localhost:4001/api/runs/<runId>/values \
  -H "Authorization: Bearer <runToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "stepId": "uuid",
    "value": "Ada Lovelace"
  }'

Response:
{
  "success": true,
  "message": "Step value saved"
}
```

### 4. Complete API Examples

#### Create Creator Run
```bash
curl -X POST http://localhost:4001/api/workflows/<workflowId>/runs \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{}'

=> {
  "success": true,
  "data": {
    "runId": "abc-123",
    "runToken": "def-456"
  }
}
```

#### Create Anonymous Run
```bash
curl -X POST "http://localhost:4001/api/workflows/<workflowId>/runs?publicLink=my-workflow-slug"

=> {
  "success": true,
  "data": {
    "runId": "xyz-789",
    "runToken": "ghi-012"
  }
}
```

#### Get Run with Token
```bash
curl -X GET http://localhost:4001/api/runs/<runId> \
  -H "Authorization: Bearer <runToken>"

=> {
  "success": true,
  "data": {
    "id": "xyz-789",
    "workflowId": "...",
    "runToken": "ghi-012",
    "createdBy": "anon",
    "completed": false,
    ...
  }
}
```

#### Submit Section Values with Token
```bash
curl -X POST http://localhost:4001/api/runs/<runId>/sections/<sectionId>/submit \
  -H "Authorization: Bearer <runToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "values": [
      {"stepId": "step-1", "value": "Ada"},
      {"stepId": "step-2", "value": "Lovelace"}
    ]
  }'

=> {
  "success": true
}
```

#### Navigate to Next Section
```bash
curl -X POST http://localhost:4001/api/runs/<runId>/next \
  -H "Authorization: Bearer <runToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentSectionId": "section-1"
  }'

=> {
  "success": true,
  "data": {
    "nextSectionId": "section-2"
  }
}
```

#### Complete Run
```bash
curl -X PUT http://localhost:4001/api/runs/<runId>/complete \
  -H "Authorization: Bearer <runToken>"

=> {
  "success": true,
  "data": {
    "id": "xyz-789",
    "completed": true,
    "completedAt": "2025-11-06T...",
    ...
  }
}
```

#### Bulk Upsert Values
```bash
curl -X POST http://localhost:4001/api/runs/<runId>/values/bulk \
  -H "Authorization: Bearer <runToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "values": [
      {"stepId": "step-1", "value": "Ada"},
      {"stepId": "step-2", "value": "Lovelace"},
      {"stepId": "step-3", "value": 42}
    ]
  }'

=> {
  "success": true,
  "message": "Step values saved"
}
```

## Migration

To apply the schema changes to your database:

```bash
# Run the migration SQL
psql $DATABASE_URL -f migrations/0001_remove_participants.sql
```

Or if using Drizzle Kit's push:
```bash
npm run db:push
```

## Security Notes

1. **Run tokens are UUIDs** - they should be treated as secrets
2. **No expiration** - tokens are valid for the lifetime of the run
3. **Creator access** - creators can always access their workflow's runs via session
4. **Token access** - token holders can only access that specific run
5. **Anonymous runs** - require workflow to be `active` and have a `publicLink`

## Code Structure

### Middleware
- `runTokenAuth` - Validates Bearer token, sets `req.runAuth`
- `creatorOrRunTokenAuth` - Accepts session OR token

### Service Layer
- `RunService.createRun()` - Generates runToken, sets createdBy
- `RunService.verifyRunAccess()` - Checks creator ownership OR token match
- All run methods accept `userId | null` and optional `runToken`

### Routes
All run routes use `creatorOrRunTokenAuth` middleware:
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/values`
- `POST /api/runs/:runId/values`
- `POST /api/runs/:runId/values/bulk`
- `POST /api/runs/:runId/sections/:sectionId/submit`
- `POST /api/runs/:runId/next`
- `PUT /api/runs/:runId/complete`

## Testing Locally

1. **Create a workflow and set publicLink:**
```sql
UPDATE workflows SET public_link = 'test-workflow', status = 'active' WHERE id = '<workflowId>';
```

2. **Create anonymous run:**
```bash
curl -X POST "http://localhost:4001/api/workflows/<workflowId>/runs?publicLink=test-workflow"
```

3. **Save the runToken and use it for subsequent requests**

## Benefits

✅ **Simplified architecture** - No more participant management
✅ **Anonymous runs** - Public workflows accessible without accounts
✅ **Token-based auth** - Simple bearer token for run access
✅ **Creator preview** - Creators can test workflows easily
✅ **Flexible access** - Both authenticated and anonymous modes supported
✅ **Clean separation** - Surveys (Poll-Vault) and Workflows (Vault-Logic) are independent

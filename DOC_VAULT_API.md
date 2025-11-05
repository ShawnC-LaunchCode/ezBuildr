# Vault-Logic Workflow API Documentation

**Generated:** 2025-11-05
**Status:** ✅ Complete and Deployed

---

## Overview

Vault-Logic Workflows is a workflow builder and execution engine integrated into the Vault-Logic platform. It operates with its own database tables, routes, and services alongside the survey functionality.

## Architecture

### Database Tables

| Table | Description |
|-------|-------------|
| `workflows` | Top-level workflow containers (like surveys) |
| `sections` | Grouped pages of steps (like survey pages) |
| `steps` | Individual fields/questions in a section |
| `logic_rules` | Conditional logic for sections and steps |
| `participants` | Global participant directory |
| `workflow_runs` | Execution instances of workflows |
| `step_values` | Captured values per step in a run |

### Conditional Logic

The system supports conditional logic for both **sections** and **steps** with the following operators:

- `equals`, `not_equals`
- `contains`, `not_contains`
- `greater_than`, `less_than`, `between`
- `is_empty`, `is_not_empty`

Actions: `show`, `hide`, `require`, `make_optional`

---

## API Endpoints

### Authentication

All endpoints require authentication via Google OAuth. Include the session cookie in all requests.

---

### Workflows

#### Create Workflow
```
POST /api/workflows
Authorization: Required
Body: {
  "title": "string",
  "description": "string (optional)",
  "status": "draft" | "active" | "archived"
}
Response: Workflow object with generated ID and default first section
```

#### List Workflows
```
GET /api/workflows
Authorization: Required
Response: Array of workflow objects for the authenticated user
```

#### Get Workflow (with details)
```
GET /api/workflows/:workflowId
Authorization: Required
Response: {
  ...workflow,
  sections: [{ ...section, steps: [...] }],
  logicRules: [...]
}
```

#### Update Workflow
```
PUT /api/workflows/:workflowId
Authorization: Required
Body: { title?, description?, status? }
Response: Updated workflow object
```

#### Delete Workflow
```
DELETE /api/workflows/:workflowId
Authorization: Required
Response: 204 No Content (cascades to all sections, steps, runs)
```

#### Change Workflow Status
```
PUT /api/workflows/:workflowId/status
Authorization: Required
Body: { "status": "draft" | "active" | "archived" }
Response: Updated workflow object
```

---

### Sections

#### Create Section
```
POST /api/workflows/:workflowId/sections
Authorization: Required
Body: {
  "title": "string",
  "description": "string (optional)",
  "order": number (auto-generated if omitted)
}
Response: Section object
```

#### List Sections
```
GET /api/workflows/:workflowId/sections
Authorization: Required
Response: Array of sections (ordered by 'order' field)
```

#### Get Section (with steps)
```
GET /api/workflows/:workflowId/sections/:sectionId
Authorization: Required
Response: { ...section, steps: [...] }
```

#### Update Section
```
PUT /api/workflows/:workflowId/sections/:sectionId
Authorization: Required
Body: { title?, description?, order? }
Response: Updated section object
```

#### Delete Section
```
DELETE /api/workflows/:workflowId/sections/:sectionId
Authorization: Required
Response: 204 No Content (cascades to all steps)
```

#### Reorder Sections
```
PUT /api/workflows/:workflowId/sections/reorder
Authorization: Required
Body: {
  "sections": [
    { "id": "uuid", "order": 1 },
    { "id": "uuid", "order": 2 }
  ]
}
Response: { message: "Sections reordered successfully" }
```

---

### Steps

#### Create Step
```
POST /api/workflows/:workflowId/sections/:sectionId/steps
Authorization: Required
Body: {
  "type": "short_text" | "long_text" | "multiple_choice" | "radio" | "yes_no" | "date_time" | "file_upload",
  "title": "string",
  "description": "string (optional)",
  "required": boolean,
  "options": object (for choice types),
  "order": number (auto-generated if omitted)
}
Response: Step object
```

#### List Steps
```
GET /api/workflows/:workflowId/sections/:sectionId/steps
Authorization: Required
Response: Array of steps (ordered by 'order' field)
```

#### Update Step
```
PUT /api/steps/:stepId
Authorization: Required
Body: {
  "workflowId": "uuid" (required),
  title?, description?, type?, required?, options?, order?
}
Response: Updated step object
```

#### Delete Step
```
DELETE /api/steps/:stepId?workflowId=uuid
Authorization: Required
Query: workflowId (required)
Response: 204 No Content
```

#### Reorder Steps
```
PUT /api/workflows/:workflowId/sections/:sectionId/steps/reorder
Authorization: Required
Body: {
  "steps": [
    { "id": "uuid", "order": 1 },
    { "id": "uuid", "order": 2 }
  ]
}
Response: { message: "Steps reordered successfully" }
```

---

### Workflow Runs

#### Create Run
```
POST /api/workflows/:workflowId/runs
Authorization: Required
Body: {
  "participantId": "uuid (optional)",
  "metadata": object (optional)
}
Response: Run object with { completed: false, ... }
```

#### Get Run
```
GET /api/runs/:runId
Authorization: Required
Response: Run object
```

#### Get Run with Values
```
GET /api/runs/:runId/values
Authorization: Required
Response: {
  ...run,
  values: [{ stepId, value, createdAt, updatedAt }]
}
```

#### Upsert Step Value
```
POST /api/runs/:runId/values
Authorization: Required
Body: {
  "stepId": "uuid",
  "value": any (JSON)
}
Response: { message: "Step value saved" }
```

#### Bulk Upsert Values
```
POST /api/runs/:runId/values/bulk
Authorization: Required
Body: {
  "values": [
    { "stepId": "uuid", "value": any },
    { "stepId": "uuid", "value": any }
  ]
}
Response: { message: "Step values saved" }
```

#### Complete Run
```
PUT /api/runs/:runId/complete
Authorization: Required
Response: Run object with { completed: true, completedAt: timestamp }
Validation: Checks all required steps have values based on logic rules
Error: 400 if missing required steps
```

#### List Runs
```
GET /api/workflows/:workflowId/runs
Authorization: Required
Response: Array of all runs for the workflow (ordered by createdAt desc)
```

---

### Exports

#### Export Workflow Data
```
GET /api/workflows/:workflowId/export?format=json|csv
Authorization: Required
Query: format (json or csv, defaults to json)
Response:
  - JSON: Array of run objects with nested data
  - CSV: Text file with headers inferred from step titles
Headers:
  - Content-Type: application/json or text/csv
  - Content-Disposition: attachment; filename="workflow-{id}-export.{format}"
```

**JSON Export Format:**
```json
[
  {
    "runId": "uuid",
    "participantId": "uuid",
    "completed": true,
    "completedAt": "ISO timestamp",
    "createdAt": "ISO timestamp",
    "data": {
      "Step Title 1": "value1",
      "Step Title 2": "value2"
    }
  }
]
```

**CSV Export Format:**
```
Run ID,Participant ID,Completed,Completed At,Created At,Step Title 1,Step Title 2
uuid,uuid,true,2025-11-05T...,2025-11-05T...,value1,value2
```

---

## Testing Workflow

### 1. Create a Workflow
```bash
curl -X POST http://localhost:4001/api/workflows \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{"title": "Customer Onboarding", "description": "New customer workflow"}'
```

### 2. Add Sections
```bash
# Add Section 1
curl -X POST http://localhost:4001/api/workflows/{workflowId}/sections \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{"title": "Basic Information", "order": 1}'

# Add Section 2
curl -X POST http://localhost:4001/api/workflows/{workflowId}/sections \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{"title": "Company Details", "order": 2}'
```

### 3. Add Steps
```bash
# Add step to Section 1
curl -X POST http://localhost:4001/api/workflows/{workflowId}/sections/{sectionId}/steps \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "title": "Full Name",
    "type": "short_text",
    "required": true,
    "order": 1
  }'

# Add choice step
curl -X POST http://localhost:4001/api/workflows/{workflowId}/sections/{sectionId}/steps \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "title": "Company Size",
    "type": "radio",
    "required": true,
    "options": ["1-10", "11-50", "51-200", "200+"],
    "order": 2
  }'
```

### 4. Create a Run
```bash
curl -X POST http://localhost:4001/api/workflows/{workflowId}/runs \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{}'
```

### 5. Submit Step Values
```bash
curl -X POST http://localhost:4001/api/runs/{runId}/values/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "values": [
      {"stepId": "step1-uuid", "value": "John Doe"},
      {"stepId": "step2-uuid", "value": "11-50"}
    ]
  }'
```

### 6. Complete the Run
```bash
curl -X PUT http://localhost:4001/api/runs/{runId}/complete \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..."
```

### 7. Export Data
```bash
# Export as JSON
curl http://localhost:4001/api/workflows/{workflowId}/export?format=json \
  -H "Cookie: connect.sid=..." \
  -o export.json

# Export as CSV
curl http://localhost:4001/api/workflows/{workflowId}/export?format=csv \
  -H "Cookie: connect.sid=..." \
  -o export.csv
```

---

## File Structure

### New Files Created

**Schema:**
- `shared/schema.ts` - Extended with Vault-Logic tables (workflows, sections, steps, etc.)
- `shared/workflowLogic.ts` - Conditional logic engine for workflows

**Repositories:**
- `server/repositories/WorkflowRepository.ts`
- `server/repositories/SectionRepository.ts`
- `server/repositories/StepRepository.ts`
- `server/repositories/WorkflowRunRepository.ts`
- `server/repositories/StepValueRepository.ts`
- `server/repositories/ParticipantRepository.ts`
- `server/repositories/LogicRuleRepository.ts`
- `server/repositories/index.ts` - Updated with new exports

**Services:**
- `server/services/WorkflowService.ts`
- `server/services/SectionService.ts`
- `server/services/StepService.ts`
- `server/services/RunService.ts`
- `server/services/WorkflowExportService.ts`

**Routes:**
- `server/routes/workflows.routes.ts`
- `server/routes/sections.routes.ts`
- `server/routes/steps.routes.ts`
- `server/routes/runs.routes.ts`
- `server/routes/workflowExports.routes.ts`
- `server/routes/index.ts` - Updated with new route registrations

---

## Key Features

### ✅ Independent from Vault-Logic
- Separate database tables (no conflicts)
- Own routes (`/api/workflows/*`)
- Own services and repositories
- Can run alongside Vault-Logic seamlessly

### ✅ Conditional Logic
- Section-level hiding/showing
- Step-level visibility and requirements
- Dynamic required field evaluation
- Skip-to logic support

### ✅ Run Validation
- Validates required fields before completion
- Considers conditional logic rules
- Prevents completion with missing data

### ✅ Export Functionality
- JSON export with nested data structure
- CSV export with step titles as headers
- Automatic value serialization
- Handles complex data types

### ✅ Ownership & Security
- All operations verify workflow ownership
- User can only access their own workflows
- Cascading deletes maintain data integrity
- Transaction support for complex operations

---

## Database Schema Reference

```sql
-- Workflows
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  description TEXT,
  creator_id VARCHAR REFERENCES users(id) NOT NULL,
  status workflow_status DEFAULT 'draft' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sections
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Steps
CREATE TABLE steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE NOT NULL,
  type step_type NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  required BOOLEAN DEFAULT FALSE,
  options JSONB,
  order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Logic Rules
CREATE TABLE logic_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE NOT NULL,
  condition_step_id UUID REFERENCES steps(id) ON DELETE CASCADE NOT NULL,
  operator condition_operator NOT NULL,
  condition_value JSONB NOT NULL,
  target_type logic_rule_target_type NOT NULL,
  target_step_id UUID REFERENCES steps(id) ON DELETE CASCADE,
  target_section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  action conditional_action NOT NULL,
  logical_operator VARCHAR DEFAULT 'AND',
  order INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Participants
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id VARCHAR REFERENCES users(id) NOT NULL,
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workflow Runs
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step Values
CREATE TABLE step_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES workflow_runs(id) ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES steps(id) ON DELETE CASCADE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Next Steps

1. ✅ Database schema pushed to Neon
2. ✅ All routes registered and available
3. ✅ Services implement full business logic
4. ✅ Repositories handle all data access
5. 🔄 Test endpoints with Postman/Insomnia
6. 🔄 Build frontend UI (optional)

---

✅ **Vault-Logic backend generated with section logic, run tracking, and export endpoints — isolated from Vault-Logic.**

**Status:** Ready for testing and integration
**Port:** http://localhost:5000 (or your configured PORT)
**Database:** Neon PostgreSQL (using DATABASE_URL from .env)

# VaultLogic Runs Architecture - Comprehensive Codebase Map

## Executive Summary
VaultLogic has TWO parallel run systems:
1. **Legacy Runs System**: For surveys/traditional forms (older implementation)
2. **Workflow Runs System**: For visual workflows (newer Stage 7+ implementation)

This document focuses primarily on the **Workflow Runs System** (Stage 7+) which Stage 8 builds upon.

---

## 1. BACKEND STRUCTURE

### 1.1 Database Schema (runs)

#### Main Tables (in `/shared/schema.ts`)

**`workflowRuns` table** (primary execution tracking)
```sql
{
  id: uuid (PK)
  workflowId: uuid (FK -> workflows)
  runToken: text (unique - for run-specific auth)
  createdBy: text ('creator:<userId>' or 'anon')
  currentSectionId: uuid (FK -> sections, nullable)
  progress: integer (0-100)
  completed: boolean
  completedAt: timestamp
  metadata: jsonb (run-specific metadata)
  createdAt: timestamp
  updatedAt: timestamp
  
  Indices:
  - workflow_runs_workflow_idx
  - workflow_runs_completed_idx
  - workflow_runs_run_token_idx
  - workflow_runs_current_section_idx
}
```

**`stepValues` table** (captures user input per step)
```sql
{
  id: uuid (PK)
  runId: uuid (FK -> workflowRuns, cascade delete)
  stepId: uuid (FK -> steps)
  value: jsonb (the actual user input value)
  updatedAt: timestamp
  
  Indices:
  - step_values_run_idx
  - step_values_step_idx
}
```

**`transformBlockRuns` table** (audit log for block execution)
```sql
{
  id: uuid (PK)
  runId: uuid (FK -> workflowRuns)
  blockId: uuid (FK -> transformBlocks)
  inputData: jsonb
  outputData: jsonb
  status: 'success' | 'error'
  error: text
  executedAt: timestamp
  
  Indices:
  - transform_block_runs_run_idx
  - transform_block_runs_block_idx
}
```

#### Legacy Tables (for old API)

**`runs` table** (older runs for document generation)
```sql
{
  id: uuid (PK)
  workflowVersionId: uuid (FK -> workflowVersions)
  inputJson: jsonb (inputs for workflow)
  outputRefs: jsonb (references to generated files)
  status: 'pending' | 'success' | 'error'
  durationMs: integer
  createdBy: varchar (FK -> users)
  createdAt: timestamp
  updatedAt: timestamp
  
  Indices:
  - runs_workflow_version_idx
  - runs_status_idx
  - runs_created_by_idx
  - runs_created_at_idx
}
```

**`runLogs` table** (execution trace logs)
```sql
{
  id: uuid (PK)
  runId: uuid (FK -> runs)
  nodeId: varchar (optional - which node generated log)
  level: 'info' | 'warn' | 'error'
  message: text
  context: jsonb (additional data)
  createdAt: timestamp
  
  Indices:
  - run_logs_run_idx
  - run_logs_level_idx
  - run_logs_created_at_idx
}
```

---

### 1.2 API Routes (Workflow Runs - `/api/workflows/:workflowId/runs` path)

**File**: `/server/routes/runs.routes.ts`

#### Active Routes
```
POST   /api/workflows/:workflowId/runs
       Creates new workflow run
       Auth: requireAuth, requireTenant
       Payload: { participantId?, metadata? }
       Response: { success, data: { runId, runToken } }

GET    /api/runs/:runId
       Get single run (creator session OR Bearer runToken)
       Auth: creatorOrRunTokenAuth

GET    /api/runs/:runId/values
       Get run with all step values captured
       Auth: creatorOrRunTokenAuth
       Response: { runId, values: [{ stepId, value, ... }] }

POST   /api/runs/:runId/values
       Upsert single step value
       Auth: creatorOrRunTokenAuth
       Payload: { stepId, value }

POST   /api/runs/:runId/values/bulk
       Bulk upsert step values
       Auth: creatorOrRunTokenAuth
       Payload: { values: [{ stepId, value }] }

POST   /api/runs/:runId/sections/:sectionId/submit
       Submit section with validation
       Auth: creatorOrRunTokenAuth
       Payload: { values: [{ stepId, value }] }
       Response: { success, errors?: [...] }

POST   /api/runs/:runId/next
       Navigate to next section (execute branch blocks)
       Auth: creatorOrRunTokenAuth
       Response: { success, data: { nextSectionId? } }

PUT    /api/runs/:runId/complete
       Mark run as complete
       Auth: creatorOrRunTokenAuth
       Validates required steps before completion

GET    /api/workflows/:workflowId/runs
       List all runs for a workflow
       Auth: isAuthenticated
       Response: [{ id, completed, metadata, createdAt, ... }]
```

### 1.3 Legacy API Routes (Document Generation - `/runs` path)

**File**: `/server/api/runs.ts`

```
POST   /workflows/:id/run
       Execute workflow (document generation)
       Auth: requireAuth, requireTenant, requirePermission('workflow:run')
       Payload: { inputJson, versionId?, options: { debug? } }
       Response: { runId, status, outputRefs, logs?, durationMs? }

GET    /runs
       List runs (paginated, filterable by workflowId)
       Auth: requireAuth, requireTenant, requirePermission('run:view')
       Query: { cursor?, limit?, workflowId? }
       Response: paginated { items, nextCursor, hasMore }

GET    /runs/:id
       Get run by ID
       Auth: requireAuth, requireTenant, requirePermission('run:view')

GET    /runs/:id/logs
       Get logs for a run (paginated)
       Auth: requireAuth, requireTenant, requirePermission('run:view')

GET    /runs/:id/download
       Download run output (DOCX or PDF)
       Auth: requireAuth, requireTenant, requirePermission('run:view')
       Query: { type: 'docx'|'pdf' }
```

---

### 1.4 Services & Repositories

#### RunService (Workflow Runs) 
**File**: `/server/services/RunService.ts`
```typescript
class RunService {
  // Core methods
  createRun(workflowId, userId, data): Promise<WorkflowRun>
  getRun(runId, userId): Promise<WorkflowRun>
  getRunWithValues(runId, userId): Promise<WorkflowRun & { values }>
  getRunWithValuesNoAuth(runId): Promise<WorkflowRun & { values }>
  
  // Step value management
  upsertStepValue(runId, userId, data): Promise<void>
  upsertStepValueNoAuth(runId, data): Promise<void>
  bulkUpsertValues(runId, userId, values): Promise<void>
  
  // Execution
  submitSection(runId, sectionId, userId, values): Promise<{ success, errors? }>
  submitSectionNoAuth(runId, sectionId, values): Promise<{ success, errors? }>
  next(runId, userId): Promise<NavigationResult>
  nextNoAuth(runId): Promise<NavigationResult>
  
  // Completion
  completeRun(runId, userId): Promise<WorkflowRun>
  completeRunNoAuth(runId): Promise<WorkflowRun>
  
  // Listing
  listRuns(workflowId, userId): Promise<WorkflowRun[]>
  
  // Block execution
  executeJsQuestions(runId, sectionId, dataMap): Promise<{ success, errors? }>
}
```

#### WorkflowRunRepository
**File**: `/server/repositories/WorkflowRunRepository.ts`
```typescript
class WorkflowRunRepository extends BaseRepository {
  findByWorkflowId(workflowId): Promise<WorkflowRun[]>
  findCompletedByWorkflowId(workflowId): Promise<WorkflowRun[]>
  markComplete(runId): Promise<WorkflowRun>
}
```

#### runs.ts Service Functions (Legacy)
**File**: `/server/services/runs.ts`
```typescript
createRun(data): Promise<Run>
updateRun(runId, updates): Promise<Run>
createRunLog(data): Promise<RunLog>
createRunLogs(data): Promise<RunLog[]>
getRunById(runId): Promise<Run | undefined>
getRunLogs(runId, options): Promise<RunLog[]>
```

---

### 1.5 Engine Execution

**File**: `/server/engine/index.ts`

The `runGraph()` function:
```typescript
export async function runGraph(input: {
  workflowVersion: WorkflowVersion
  inputJson: Record<string, any>
  tenantId: string
  options?: { debug?, clock? }
}): Promise<RunGraphOutput>

// Output structure
{
  status: 'success' | 'error'
  outputRefs?: Record<string, any>
  logs: Array<{
    level: 'info' | 'warn' | 'error'
    message: string
    nodeId?: string
    context?: Record<string, any>
    timestamp: Date
  }>
  trace?: TraceEntry[]  // if debug enabled
  error?: string
}
```

Trace Entries (debug mode):
```typescript
{
  nodeId: string
  type: string (node type)
  condition?: string
  conditionResult?: boolean
  status: 'executed' | 'skipped'
  outputsDelta?: Record<string, any>
  error?: string
  timestamp: Date
}
```

---

### 1.6 Middleware & RBAC

#### RBAC Permissions
**File**: `/server/middleware/rbac.ts`

Run-related permissions:
```typescript
'run:view'    // view run status, logs, outputs
'run:create'  // create/start a new run
```

Role-based access:
- **Owner**: All permissions
- **Builder**: run:view, run:create
- **Runner**: run:view, run:create
- **Viewer**: run:view

#### Run Token Auth
**File**: `/server/middleware/runTokenAuth.ts`

Supports two auth methods:
1. Creator session (traditional JWT/session auth)
2. Bearer runToken (for preview/anonymous runs)

---

## 2. FRONTEND STRUCTURE

### 2.1 API Client

**File**: `/client/src/lib/vault-api.ts`

```typescript
export const runAPI = {
  create: (workflowId, data, queryParams?) 
    // POST /api/workflows/:workflowId/runs
    // Response: { success, data: { runId, runToken } }
  
  get: (id)
    // GET /api/runs/:id
  
  getWithValues: (id)
    // GET /api/runs/:id/values
  
  upsertValue: (runId, stepId, value)
    // POST /api/runs/:runId/values
  
  submitSection: (runId, sectionId, values)
    // POST /api/runs/:runId/sections/:sectionId/submit
  
  next: (runId, currentSectionId)
    // POST /api/runs/:runId/next
  
  complete: (runId)
    // PUT /api/runs/:runId/complete
  
  list: (workflowId)
    // GET /api/workflows/:workflowId/runs
}
```

### 2.2 React Query Hooks

**File**: `/client/src/lib/vault-hooks.ts`

```typescript
// Queries
useRuns(workflowId)                      // Lists all runs
useRun(id)                               // Get single run
useRunWithValues(id)                     // Run + step values

// Mutations
useCreateRun()
  .mutateAsync({ workflowId, participantId?, metadata?, queryParams? })
useUpsertValue()
  .mutateAsync({ runId, stepId, value })
useSubmitSection()
  .mutateAsync({ runId, sectionId, values })
useNext()
  .mutateAsync({ runId, currentSectionId })
useCompleteRun()
  .mutateAsync(runId)
```

### 2.3 Pages/Components Using Runs

**Pages**:
- `WorkflowRunner.tsx` - Active workflow run interface
- `PreviewRunner.tsx` - Preview mode with runToken auth
- `WorkflowDashboard.tsx` - Workflow listing (mentions runs in deletion warning)

**Components**:
- `RunnerPreview.tsx` - Run preview component in builder
- `DevPanel.tsx` - Debug panel (shows run info)

**Pages NOT YET CREATED** (for Stage 8):
- RunsHistory / RunsPage - List past runs
- RunDetails - Show single run details
- RunLogs - Display run execution logs
- RunDownload - Download run outputs

---

## 3. DATABASE SCHEMA DETAILS

### 3.1 Key Relationships

```
workflows (1) ──→ (N) workflowRuns
workflowRuns (1) ──→ (N) stepValues
workflowRuns (1) ──→ (N) transformBlockRuns
sections (1) ──→ (N) workflowRuns (currentSectionId)
steps (1) ──→ (N) stepValues
transformBlocks (1) ──→ (N) transformBlockRuns
```

### 3.2 Status Tracking

**workflowRuns**:
- `progress`: 0-100 percentage
- `completed`: boolean flag
- `completedAt`: timestamp when marked complete
- `currentSectionId`: navigation state

**transformBlockRuns**:
- `status`: 'success' | 'error'
- `error`: error message if status='error'

---

## 4. EXISTING PAGINATION & UTILITIES

### 4.1 Pagination System
**File**: `/server/utils/pagination.ts`

Cursor-based pagination:
```typescript
interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

// Functions
createPaginatedResponse<T>(items, limit): PaginatedResponse<T>
encodeCursor(item): string
decodeCursor(cursor): { id, timestamp } | null
```

Query schema:
```typescript
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
```

### 4.2 Error Handling
**Files**: 
- `/server/utils/errors.ts` - Error creation utilities
- `/server/middleware/errorHandler.ts` - Express error middleware

Common errors:
```typescript
createError.notFound(entityType, id)
createError.forbidden(message)
createError.database(message)
formatErrorResponse(error) // Standardized response
```

---

## 5. EXECUTION FLOW

### 5.1 Creating & Running a Workflow

```
1. POST /api/workflows/:workflowId/runs
   ├─ Authenticate user (session or public link)
   ├─ Create workflowRun record
   ├─ Generate unique runToken
   └─ Return { runId, runToken }

2. Client stores runToken in localStorage/session
   (Used for subsequent API calls if preview mode)

3. User navigates through workflow:
   ├─ GET /api/runs/:runId/values
   │  └─ Load current step values
   ├─ POST /api/runs/:runId/values
   │  └─ Save step value(s)
   ├─ POST /api/runs/:runId/sections/:sectionId/submit
   │  ├─ Execute JS question blocks (if any)
   │  ├─ Execute onSectionSubmit transform/validate blocks
   │  └─ Return validation result
   ├─ POST /api/runs/:runId/next
   │  ├─ Execute onNext blocks (transform + branch)
   │  ├─ Determine next section
   │  └─ Update currentSectionId
   └─ PUT /api/runs/:runId/complete
      ├─ Execute onRunComplete blocks
      ├─ Validate all required steps
      └─ Mark completed=true

4. All step values persisted in stepValues table
5. Block executions audited in transformBlockRuns table
```

### 5.2 Legacy Document Generation Flow

```
1. POST /workflows/:id/run
   ├─ Get published workflow version
   ├─ Execute runGraph() with inputJson
   │  ├─ Topological sort of nodes
   │  ├─ Execute each node
   │  ├─ Generate logs and trace
   │  └─ Return { status, outputRefs, logs }
   ├─ Create runs record
   ├─ Create runLogs entries
   └─ Return { runId, status, outputRefs, ... }

2. GET /runs/:id/download?type=docx|pdf
   ├─ Retrieve run record
   ├─ Check outputRefs for file reference
   ├─ Load file from outputs directory
   └─ Stream to client
```

---

## 6. PERMISSIONS & TENANT ISOLATION

### 6.1 Tenant Scoping

All runs are tenant-scoped through:
```
workflowRun → workflow → project → tenant
```

### 6.2 Endpoint Protection

```typescript
requireAuth          // User must be authenticated
requireTenant        // User must have active tenant
requirePermission('run:view')    // RBAC check
requirePermission('run:create')  // RBAC check
```

---

## 7. WHAT'S MISSING (Stage 8 Opportunities)

### 7.1 No Dedicated Runs History UI
- No dedicated page listing past runs
- No search/filtering runs interface
- No run comparison tools

### 7.2 Limited Run Information Displayed
- No detailed run logs viewer
- No step-by-step execution trace UI
- No performance metrics (duration, timestamps)
- No error details display

### 7.3 No Run Output Management
- No download of run outputs from history
- No export/archive runs
- No run retention policies

### 7.4 No Run Analytics
- No metrics on run success/failure rates
- No performance analytics
- No user engagement metrics per run

### 7.5 No Run Context Features
- No run metadata editing
- No run notes/comments
- No run tagging/labeling

---

## 8. KEY FILES FOR STAGE 8 IMPLEMENTATION

**Must Reference**:
- `/shared/schema.ts` - Schema definitions
- `/server/middleware/rbac.ts` - Permission checks
- `/server/utils/pagination.ts` - Pagination utilities
- `/client/src/lib/vault-api.ts` - API client patterns
- `/client/src/lib/vault-hooks.ts` - React Query hook patterns

**Use as Templates**:
- `/server/routes/workflows.routes.ts` - Route structure
- `/server/api/workflows.ts` - API endpoint patterns
- `/client/src/pages/WorkflowDashboard.tsx` - Page structure
- `/client/src/components/dashboard/*.tsx` - Card components

**Understand RBAC From**:
- `/server/middleware/rbac.ts` - Role definitions
- `/server/api/runs.ts` - Permission usage
- `/server/routes/runs.routes.ts` - Auth middleware

---

## 9. QUERY KEYS FOR CACHING

Important React Query keys for invalidation:

```typescript
queryKeys.runs(workflowId)          // All runs for workflow
queryKeys.run(id)                   // Single run
queryKeys.runWithValues(id)         // Run + values
```

When creating/updating runs:
- Invalidate `queryKeys.runs(workflowId)`
- Invalidate `queryKeys.run(id)`
- Invalidate `queryKeys.runWithValues(id)`

---

## 10. TYPE DEFINITIONS

Key types from schema:

```typescript
// Workflow run (NEW System - Stage 7+)
interface WorkflowRun {
  id: string
  workflowId: string
  runToken: string
  createdBy: string
  currentSectionId: string | null
  progress: number
  completed: boolean
  completedAt: Date | null
  metadata: any
  createdAt: Date
  updatedAt: Date
}

// Step value (NEW System)
interface StepValue {
  id: string
  runId: string
  stepId: string
  value: any
  updatedAt: Date
}

// Run (LEGACY System - Document generation)
interface Run {
  id: string
  workflowVersionId: string
  inputJson: any
  outputRefs: any
  status: 'pending' | 'success' | 'error'
  durationMs?: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// Run log (LEGACY System)
interface RunLog {
  id: string
  runId: string
  nodeId?: string
  level: 'info' | 'warn' | 'error'
  message: string
  context?: any
  createdAt: Date
}
```

---

## SUMMARY

VaultLogic's runs system has:
- ✅ Working workflow execution engine (Stage 7+)
- ✅ Step value persistence & navigation
- ✅ Block execution (JS, transform, branch)
- ✅ Completion validation
- ✅ RBAC permission checks
- ✅ Tenant isolation
- ✅ Run token authentication
- ❌ No dedicated runs history UI
- ❌ No run analytics/metrics
- ❌ No advanced run management features

**Stage 8 should build**: Runs History UI with listing, filtering, details view, logs display, and metrics.


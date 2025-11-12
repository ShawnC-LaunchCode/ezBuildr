# VaultLogic Runs - Quick Reference & File Paths

## Critical Files - Absolute Paths

### Backend - Database & Schema
```
/home/user/VaultLogic/shared/schema.ts
  - Tables: workflowRuns, stepValues, transformBlockRuns
  - Types: WorkflowRun, StepValue, TransformBlockRun
  - Enums & Relationships

/home/user/VaultLogic/migrations/0000_daffy_roughhouse.sql
  - Contains: runs, runLogs table definitions (legacy)
  - Contains: runStatusEnum, logLevelEnum enums
  - Contains: workflowRuns, stepValues, transformBlockRuns
```

### Backend - Routes (Two Systems)

**NEW Workflow Runs Routes**:
```
/home/user/VaultLogic/server/routes/runs.routes.ts
  - POST /api/workflows/:workflowId/runs
  - GET /api/runs/:runId
  - GET /api/runs/:runId/values
  - POST /api/runs/:runId/values
  - POST /api/runs/:runId/values/bulk
  - POST /api/runs/:runId/sections/:sectionId/submit
  - POST /api/runs/:runId/next
  - PUT /api/runs/:runId/complete
  - GET /api/workflows/:workflowId/runs
```

**LEGACY Document Generation Routes**:
```
/home/user/VaultLogic/server/api/runs.ts
  - POST /workflows/:id/run
  - GET /runs (paginated)
  - GET /runs/:id
  - GET /runs/:id/logs (paginated)
  - GET /runs/:id/download
```

### Backend - Services & Repositories
```
/home/user/VaultLogic/server/services/RunService.ts
  - Class: RunService (workflow runs business logic)
  - 30+ methods for run lifecycle
  
/home/user/VaultLogic/server/services/runs.ts
  - Functions: createRun, updateRun, getRunById, getRunLogs
  - Legacy system functions

/home/user/VaultLogic/server/repositories/WorkflowRunRepository.ts
  - Class: WorkflowRunRepository
  - Methods: findByWorkflowId, markComplete, etc.

/home/user/VaultLogic/server/repositories/StepValueRepository.ts
  - Class: StepValueRepository
  - Step value data access
```

### Backend - Execution Engine
```
/home/user/VaultLogic/server/engine/index.ts
  - Function: runGraph() - Main execution engine
  - Generates logs and traces
  - Handles node execution and conditional logic
```

### Backend - Middleware & Auth
```
/home/user/VaultLogic/server/middleware/rbac.ts
  - RBAC permissions for runs: 'run:view', 'run:create'
  - Role definitions: owner, builder, runner, viewer

/home/user/VaultLogic/server/middleware/runTokenAuth.ts
  - Run-specific authentication
  - Supports both session and Bearer token auth

/home/user/VaultLogic/server/middleware/tenant.ts
  - Tenant isolation enforcement

/home/user/VaultLogic/server/middleware/auth.ts
  - User authentication & session management
```

### Backend - Utilities
```
/home/user/VaultLogic/server/utils/pagination.ts
  - Cursor-based pagination utilities
  - Functions: createPaginatedResponse, encodeCursor, decodeCursor

/home/user/VaultLogic/server/utils/errors.ts
  - Error creation helpers
  - formatErrorResponse for consistent responses

/home/user/VaultLogic/server/utils/errorHandler.ts
  - Express error middleware
```

### Frontend - API & Hooks
```
/home/user/VaultLogic/client/src/lib/vault-api.ts
  - Object: runAPI (API client methods)
  - Methods: create, get, getWithValues, upsertValue, etc.

/home/user/VaultLogic/client/src/lib/vault-hooks.ts
  - Hooks: useRuns, useRun, useRunWithValues
  - Hooks: useCreateRun, useUpsertValue, useSubmitSection, etc.
  - Query keys for React Query caching
```

### Frontend - Pages & Components
```
/home/user/VaultLogic/client/src/pages/WorkflowRunner.tsx
  - Active workflow execution UI

/home/user/VaultLogic/client/src/pages/PreviewRunner.tsx
  - Preview mode with runToken auth

/home/user/VaultLogic/client/src/components/builder/RunnerPreview.tsx
  - Run preview in builder

/home/user/VaultLogic/client/src/components/devpanel/DevPanel.tsx
  - Debug panel with run information
```

### Frontend - Store
```
/home/user/VaultLogic/client/src/store/preview.ts
  - Preview/run state management
```

### Tests (Reference)
```
/home/user/VaultLogic/tests/integration/api.runs.docx.test.ts
  - Document generation run tests

/home/user/VaultLogic/tests/integration/api.templates-runs.test.ts
  - Run with templates tests

/home/user/VaultLogic/tests/engine.run-conditions.test.ts
  - Engine execution tests
```

---

## Key Code Snippets for Building Stage 8

### Adding New Run Query Endpoint

Template from existing patterns:
```typescript
// 1. Add to runAPI (/client/src/lib/vault-api.ts)
export const runAPI = {
  listByWorkflow: (workflowId, filters?: { status?, dateRange? }) =>
    fetchAPI<{ success: boolean; data: PaginatedRuns }>
      (`/api/workflows/${workflowId}/runs/history`, {
        method: 'GET',
        // Add query params for filters
      })
}

// 2. Create hook (/client/src/lib/vault-hooks.ts)
export function useRunsHistory(workflowId, filters) {
  return useQuery({
    queryKey: queryKeys.runs(workflowId), // Consider adding filter key
    queryFn: () => runAPI.listByWorkflow(workflowId, filters),
    enabled: !!workflowId,
  })
}

// 3. Create backend endpoint (/server/routes/runs.routes.ts)
app.get('/api/workflows/:workflowId/runs/history', 
  isAuthenticated,
  async (req, res) => {
    const workflowId = req.params.workflowId
    const userId = req.user?.claims?.sub
    // Implementation
  }
)
```

### Using Pagination

```typescript
// Backend
import { createPaginatedResponse, decodeCursor } from '../utils/pagination'
const runs = await runRepo.findByWorkflowId(workflowId)
const paginated = createPaginatedResponse(runs, limit)
res.json(paginated)

// Frontend
const { cursor } = queryParams
const { data } = useRunsHistory(workflowId, { cursor })
const canLoadMore = data?.hasMore
```

### Checking Permissions

```typescript
import { requirePermission } from '../middleware/rbac'

router.get('/path',
  requireAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req, res) => { ... }
)
```

---

## Database Queries - Reference

### Get All Runs for Workflow
```typescript
const runs = await db.query.workflowRuns.findMany({
  where: eq(schema.workflowRuns.workflowId, workflowId),
  orderBy: [desc(schema.workflowRuns.createdAt)],
})
```

### Get Run with All Values
```typescript
const run = await db.query.workflowRuns.findFirst({
  where: eq(schema.workflowRuns.id, runId),
  with: {
    stepValues: true,
    transformBlockRuns: true,
    workflow: { with: { project: true } }
  }
})
```

### Get Block Executions for Run
```typescript
const blockRuns = await db.query.transformBlockRuns.findMany({
  where: eq(schema.transformBlockRuns.runId, runId),
  orderBy: [asc(schema.transformBlockRuns.executedAt)],
})
```

---

## Frontend Component Template for Runs History

```typescript
// /client/src/pages/RunsHistory.tsx
import { useRunsHistory } from '@/lib/vault-hooks'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { useParams } from 'wouter'

export default function RunsHistory() {
  const { workflowId } = useParams()
  const { data, isLoading } = useRunsHistory(workflowId)
  
  const columns = [
    { header: 'Run ID', cell: (row) => row.id },
    { header: 'Status', cell: (row) => row.completed ? 'Completed' : 'In Progress' },
    { header: 'Created', cell: (row) => new Date(row.createdAt).toLocaleDateString() },
    { header: 'Actions', cell: (row) => <ViewButton runId={row.id} /> },
  ]
  
  return (
    <div>
      <h1>Workflow Runs</h1>
      <DataTable columns={columns} data={data?.items || []} />
      {data?.hasMore && <Button>Load More</Button>}
    </div>
  )
}
```

---

## Common React Query Invalidations

```typescript
// When a run is modified
queryClient.invalidateQueries({ 
  queryKey: queryKeys.runs(workflowId) 
})
queryClient.invalidateQueries({ 
  queryKey: queryKeys.run(runId) 
})
queryClient.invalidateQueries({ 
  queryKey: queryKeys.runWithValues(runId) 
})
```

---

## Environment & Configuration

### Database Setup
- ORM: Drizzle ORM
- Database: PostgreSQL
- Config: `/home/user/VaultLogic/drizzle.config.ts`
- Migrations: `/home/user/VaultLogic/migrations/`

### Server Setup
- Framework: Express.js
- Port: Configured in `/home/user/VaultLogic/server/index.ts`
- Main entry: `/home/user/VaultLogic/server/index.ts`

### Client Setup
- Framework: React + TypeScript
- Build tool: Vite
- Entry: `/home/user/VaultLogic/client/src/main.tsx`
- Router: Wouter (lightweight)

### Multi-tenancy
- Enforced via `requireTenant` middleware
- All queries scope to `req.tenantId`
- RBAC system: `owner`, `builder`, `runner`, `viewer`

---

## Performance Considerations

1. **Indices**: All important queries have indices
   - workflow_runs_workflow_idx
   - step_values_run_idx
   - transform_block_runs_run_idx

2. **Pagination**: Cursor-based (efficient for large datasets)

3. **Query Optimization**: Use `with` in Drizzle for eager loading

4. **Caching**: React Query with automatic invalidation

---

## Common Pitfalls

1. **Missing Tenant Check**: Always verify workflow belongs to tenant
2. **Pagination Cursor**: Must encode/decode properly
3. **Permissions**: Check both `requireAuth` and `requirePermission`
4. **Step Values**: Use step ID as key (not alias)
5. **Block Execution**: Happens server-side, audit in transformBlockRuns

---

## Testing

```bash
# Run tests
npm test

# Test files reference
/home/user/VaultLogic/tests/integration/api.runs.docx.test.ts
/home/user/VaultLogic/tests/engine.run-conditions.test.ts
```

---

## Next Steps for Stage 8

Priority order for implementation:

1. Create `/server/api/runs-history.ts` - Enhanced runs listing with filters
2. Create `/server/services/runsHistoryService.ts` - Query builder for complex filters
3. Update `/client/src/lib/vault-api.ts` - Add history endpoints
4. Update `/client/src/lib/vault-hooks.ts` - Add useRunsHistory hook
5. Create `/client/src/pages/RunsHistory.tsx` - Main history page
6. Create `/client/src/pages/RunDetails.tsx` - Single run details with logs
7. Update `/client/src/App.tsx` - Add new routes
8. Add tests for new functionality


# Stage 8: Run History UI + Debug Traces + Download Center

**Status:** ✅ Complete
**Date:** November 12, 2025
**Branch:** `claude/stage-8-runs-history-ui-011CV4H1rBWQUrXUQ7MQL8Kk`

---

## Overview

Stage 8 implements a comprehensive run history and debugging system for VaultLogic workflows. This includes:

- **Run History Dashboard** with advanced filtering and search
- **Detailed Run View** with execution traces, inputs, outputs, and logs
- **Re-run Functionality** with optional input overrides
- **Compare Runs** for side-by-side analysis
- **CSV Export** for data analysis
- **RBAC** enforcement throughout

---

## Architecture

### Backend API Endpoints

All endpoints are implemented in `server/api/runs.ts`:

#### 1. List Runs (Enhanced)
```
GET /api/runs
Query params:
  - cursor: string (pagination)
  - limit: number (default 20)
  - workflowId: uuid (filter by workflow)
  - projectId: uuid (filter by project)
  - status: 'pending' | 'success' | 'error'
  - from: ISO datetime (date range start)
  - to: ISO datetime (date range end)
  - q: string (search query)

Response:
  {
    items: DocumentRun[],
    nextCursor?: string
  }
```

#### 2. Get Run Details
```
GET /api/runs/:id

Response: DocumentRun (includes trace, logs, metadata)
```

#### 3. Get Run Logs
```
GET /api/runs/:id/logs
Query params:
  - cursor: string
  - limit: number

Response:
  {
    items: RunLogEntry[],
    nextCursor?: string
  }
```

#### 4. Download Run Output
```
GET /api/runs/:id/download
Query params:
  - type: 'docx' | 'pdf' (default 'docx')

Response: File download (DOCX or PDF)
```

#### 5. Re-run Workflow (NEW)
```
POST /api/runs/:id/rerun
Body:
  {
    overrideInputJson?: Record<string, any>,
    versionId?: string,
    options?: { debug?: boolean }
  }

Response:
  {
    runId: string,
    status: string,
    durationMs?: number
  }
```

#### 6. Export Runs to CSV (NEW)
```
GET /api/runs/export.csv
Query params: (same as list runs, excluding pagination)

Response: CSV file
Columns: runId, projectId, workflowId, workflowName, versionId, status, durationMs, createdBy, createdAt
```

#### 7. Compare Runs (NEW)
```
GET /api/runs/compare
Query params:
  - runA: uuid
  - runB: uuid

Response:
  {
    runA: { id, status, inputs, outputs, trace, error, ... },
    runB: { id, status, inputs, outputs, trace, error, ... },
    summaryDiff: {
      inputsChangedKeys: string[],
      outputsChangedKeys: string[],
      statusMatch: boolean,
      durationDiff: number
    }
  }
```

### Frontend Pages

#### 1. Runs Dashboard (`/runs`)
- **Location:** `client/src/pages/RunsDashboard.tsx`
- **Features:**
  - Paginated table of all runs
  - Advanced filters (status, workflow, project, date range, search)
  - Refresh button
  - CSV export button
  - Quick actions: View, Download, Re-run

#### 2. Run Details (`/runs/:id`)
- **Location:** `client/src/pages/RunDetails.tsx`
- **Features:**
  - Status card with duration, creator, timestamps
  - Tabbed interface:
    - **Trace:** Node-by-node execution with toggles
    - **Inputs:** JSON viewer with copy
    - **Outputs:** JSON viewer + download buttons
    - **Logs:** Structured log entries
    - **Metadata:** Run and workflow version info
  - Re-run button (with/without input changes)
  - Download buttons (DOCX/PDF)

#### 3. Compare Runs (`/runs/compare?runA=...&runB=...`)
- **Location:** `client/src/pages/RunsCompare.tsx`
- **Features:**
  - Summary comparison card
  - Side-by-side run details
  - Highlighted differences in inputs/outputs
  - Status and duration comparison

### Frontend Components

#### 1. RunsTable (`client/src/components/runs/RunsTable.tsx`)
- Displays runs in table format
- Columns: Status, Workflow, Version, Started, Duration, Created By, Actions
- Actions dropdown: View Details, Download DOCX/PDF, Re-run
- Status badges with colors
- Duration formatting (ms/s/m)

#### 2. RunFilters (`client/src/components/runs/RunFilters.tsx`)
- Status filter (All, Success, Error, Pending)
- Date range filters (From/To)
- Search input (searches run ID, creator email, input JSON)
- Clear filters button

#### 3. TracePanel (`client/src/components/runs/TracePanel.tsx`)
- Node-by-node execution trace
- Toggle show/hide skipped nodes
- Condition display with results
- Outputs delta expansion
- Error highlighting
- Copy trace as JSON

### API Client

Updated `client/src/lib/vault-api.ts` with `documentRunsAPI`:

```typescript
export const documentRunsAPI = {
  list: (params: ListRunsParams) => Promise<PaginatedResponse<DocumentRun>>,
  get: (id: string) => Promise<DocumentRun>,
  getLogs: (id: string, params) => Promise<PaginatedResponse<RunLogEntry>>,
  downloadUrl: (id: string, type: 'docx' | 'pdf') => string,
  rerun: (id: string, data) => Promise<{ runId, status, durationMs }>,
  exportCsvUrl: (params: ListRunsParams) => string,
  compare: (runA: string, runB: string) => Promise<CompareRunsResponse>,
}
```

---

## Key Features

### 1. Advanced Filtering
- **Status:** pending, success, error
- **Workflow:** filter by specific workflow
- **Project:** filter by project
- **Date Range:** from/to datetime
- **Search:** full-text search across run ID, creator email, and input JSON

### 2. Execution Traces
Every run captures a detailed execution trace with:
- Node ID and type
- Execution status (executed/skipped)
- Condition expressions and results
- Outputs delta (variables changed)
- Error messages
- Timestamps

### 3. Re-run with Override
Users can re-run workflows:
- **Same inputs:** Quick re-run button
- **Override inputs:** Dialog to modify input JSON
- **Version selection:** Optionally use a different workflow version

### 4. Compare Runs
Side-by-side comparison shows:
- Input differences (highlighted changed keys)
- Output differences
- Status match/mismatch
- Duration delta
- Trace comparison

### 5. CSV Export
Export filtered runs to CSV for analysis in Excel/Google Sheets.
Respects all active filters.

### 6. RBAC Integration
- **runner/builder/owner:** Can view, re-run, download, export
- **viewer:** Can view, download, export (no re-run)
- Tenant isolation enforced on all endpoints

---

## Database Schema

### Runs Table
```sql
CREATE TABLE runs (
  id UUID PRIMARY KEY,
  workflow_version_id UUID NOT NULL,
  input_json JSONB,
  output_refs JSONB,
  trace JSONB,              -- Stage 8: Execution trace
  status TEXT NOT NULL,     -- 'pending' | 'success' | 'error'
  error TEXT,               -- Stage 8: Error message
  duration_ms INTEGER,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Run Logs Table
```sql
CREATE TABLE run_logs (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL,
  node_id TEXT,
  level TEXT NOT NULL,      -- 'info' | 'warn' | 'error'
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP
);
```

---

## Implementation Details

### Trace Capture
The workflow engine (`server/engine/index.ts`) always runs with `debug: true` to capture execution traces. Each trace entry includes:

```typescript
interface TraceEntry {
  nodeId: string;
  type: string;
  condition?: string;
  conditionResult?: boolean;
  status: 'executed' | 'skipped';
  outputsDelta?: Record<string, any>;
  error?: string;
  timestamp: string;
}
```

### Pagination
Uses cursor-based pagination for performance:
- Cursor encodes the `createdAt` timestamp
- Limit defaults to 20 items
- `nextCursor` returned for subsequent requests

### In-Memory Filtering
Due to complex joins (runs → workflowVersions → workflows → projects), some filters are applied in-memory after the initial query. For production at scale, consider:
- Denormalizing frequently-queried fields
- Using materialized views
- Implementing Elasticsearch for advanced search

### CSV Generation
CSV is generated on-the-fly (streaming) to avoid memory issues with large datasets. For very large exports (10k+ runs), consider:
- Background job with email notification
- Chunked downloads
- Pre-aggregated reports

---

## Testing

### Backend Tests
**File:** `tests/integration/api.runs.stage8.test.ts`

Tests cover:
- ✅ List runs with pagination
- ✅ Filter by status, workflow, project, date range
- ✅ Search query (run ID, creator, input JSON)
- ✅ Get run by ID (with 404 handling)
- ✅ Get run logs
- ✅ Re-run with same inputs
- ✅ Re-run with override inputs
- ✅ Export to CSV
- ✅ Compare two runs
- ✅ Identify changed input/output keys
- ✅ Tenant isolation enforcement

### UI Tests
**File:** `tests/ui/runs.components.test.tsx`

Tests cover:
- ✅ RunsTable rendering and data display
- ✅ Status badges and formatting
- ✅ Download options for successful runs
- ✅ RunFilters controls and interactions
- ✅ Status filter changes
- ✅ Search submission
- ✅ Clear filters
- ✅ TracePanel rendering
- ✅ Show/hide skipped nodes toggle
- ✅ Condition display
- ✅ Error highlighting
- ✅ Outputs expansion
- ✅ Copy trace JSON

### Running Tests
```bash
# All tests
npm test

# Integration tests only
npm run test:integration

# UI tests only
npm run test:ui

# Specific test file
npm test tests/integration/api.runs.stage8.test.ts
```

---

## Bug Fixes

### Critical: Missing `sql` Import
**File:** `server/api/runs.ts`
**Issue:** Used `sql` template tag without importing from drizzle-orm
**Fix:** Added `sql` to imports: `import { eq, and, desc, lt, sql } from 'drizzle-orm';`

---

## Future Enhancements

### Performance Optimizations
1. **Denormalize workflow/project info** into runs table
2. **Add database indexes** on frequently-filtered columns
3. **Implement caching** for workflow metadata
4. **Use Elasticsearch** for advanced search

### Feature Additions
1. **Bulk re-run** - Select multiple runs and re-run as batch
2. **Run scheduling** - Schedule runs for future execution
3. **Diff viewer** - Visual diff tool for comparing inputs/outputs
4. **Real-time updates** - WebSocket for live run status updates
5. **Annotations** - Add notes/tags to runs
6. **Favorites** - Bookmark important runs
7. **Advanced analytics** - Success rate, avg duration, trends over time

### UX Improvements
1. **Keyboard shortcuts** - Navigate runs with arrow keys
2. **Column customization** - Show/hide columns, reorder
3. **Saved filters** - Save frequently-used filter combinations
4. **Batch export** - Select specific runs for CSV export
5. **Trace timeline view** - Visual timeline of execution

---

## Security Considerations

1. **RBAC Enforcement:** All endpoints check user permissions via `requirePermission` middleware
2. **Tenant Isolation:** Queries filter by tenant ID to prevent cross-tenant access
3. **Input Validation:** All inputs validated with Zod schemas
4. **SQL Injection Prevention:** Drizzle ORM parameterizes all queries
5. **Download Security:** File paths validated, no directory traversal
6. **Rate Limiting:** Consider adding rate limits on re-run and export endpoints

---

## Monitoring & Observability

### Metrics to Track
- **Runs per day** (by status)
- **Success rate** (%)
- **P50/P95 duration** (ms)
- **Re-run rate** (% of runs that are re-runs)
- **Export requests per day**
- **Compare requests per day**

### Logs
- Re-run start/completion with correlation IDs
- Export requests with filter summary
- Compare requests with run IDs
- Errors with full stack traces

---

## Deployment Checklist

- [x] Backend API implemented
- [x] Frontend pages implemented
- [x] Frontend components implemented
- [x] API client methods added
- [x] Routes registered (backend + frontend)
- [x] Tests created (integration + UI)
- [x] Bug fixes applied
- [x] Documentation updated
- [ ] Database migrations run
- [ ] Environment variables set
- [ ] Deployment tested
- [ ] Performance benchmarks run
- [ ] Security audit completed

---

## Related Documentation

- [API Reference](./api/API.md)
- [Developer Reference](./reference/DEVELOPER_REFERENCE.md)
- [Testing Framework](./testing/TESTING.md)
- [Architecture Overview](../CLAUDE.md)

---

**Contributors:** Claude AI
**Reviewers:** [To be assigned]
**Last Updated:** November 12, 2025

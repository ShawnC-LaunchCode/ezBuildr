# Stage 11: Analytics & SLIs - Implementation Guide

**Status:** ✅ Complete (Backend)
**Date:** November 12, 2025
**Version:** 1.0.0

---

## Overview

Stage 11 adds comprehensive analytics and Service Level Indicators (SLIs) to VaultLogic. This enables:
- **Product analytics:** Track runs/day, success rates, duration metrics, PDF/DOCX generation
- **Reliability SLIs:** Monitor success %, p95 latency, error budgets
- **Proactive alerting:** Webhook + email notifications when SLI targets are violated
- **Future observability:** Clean integration points for OpenTelemetry and Prometheus

---

## Architecture

### Data Flow

```
Workflow Run
    ↓
Metrics Service (capture events)
    ↓
metrics_events table (raw stream)
    ↓
Rollup Job (periodic aggregation)
    ↓
metrics_rollups table (time buckets)
    ↓
SLI Service (compute indicators)
    ↓
sli_windows table (computed metrics)
    ↓
Alert Service (evaluate targets)
    ↓
Webhooks / Email
```

### Components

1. **Metrics Service** (`server/services/metrics.ts`)
   - Captures runtime events (run started/succeeded/failed, pdf/docx success/fail, queue events)
   - Redacts sensitive data from payloads
   - Non-blocking event emission (failures don't break app flow)

2. **Rollup Job** (`server/jobs/metricsRollup.ts`)
   - Runs every 60 seconds (configurable)
   - Aggregates events into 1m, 5m, 1h, 1d buckets
   - Computes p50/p95 latency using SQL percentiles
   - Upserts rollups (idempotent)

3. **SLI Service** (`server/services/sli.ts`)
   - Computes success %, p95 latency, error budget burn
   - Configurable targets per project/workflow
   - Saves SLI windows for historical tracking

4. **Alert Service** (`server/services/alerts.ts`)
   - Evaluates SLIs against targets
   - Sends webhooks and emails (email is stub for now)
   - Cooldown mechanism (10 min default) to prevent spam
   - Severity levels: warning, critical

5. **Analytics API** (`server/routes/workflowAnalytics.routes.ts`)
   - `/api/workflow-analytics/overview` - High-level metrics
   - `/api/workflow-analytics/timeseries` - Chart data
   - `/api/workflow-analytics/sli` - Current SLI + history
   - `/api/workflow-analytics/sli-config` - Update targets (RBAC: owner/builder only)

---

## Database Schema

### Enums

```sql
CREATE TYPE metrics_event_type AS ENUM (
  'run_started',
  'run_succeeded',
  'run_failed',
  'pdf_succeeded',
  'pdf_failed',
  'docx_succeeded',
  'docx_failed',
  'queue_enqueued',
  'queue_dequeued'
);

CREATE TYPE rollup_bucket AS ENUM ('1m', '5m', '1h', '1d');
CREATE TYPE sli_window AS ENUM ('1d', '7d', '30d');
```

### Tables

**`metrics_events`** - Raw event stream
```sql
CREATE TABLE metrics_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  workflow_id UUID,
  run_id UUID,
  type metrics_event_type NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**`metrics_rollups`** - Aggregated metrics
```sql
CREATE TABLE metrics_rollups (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  workflow_id UUID,
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket rollup_bucket NOT NULL,
  runs_count INTEGER DEFAULT 0,
  runs_success INTEGER DEFAULT 0,
  runs_error INTEGER DEFAULT 0,
  dur_p50 INTEGER,  -- median duration ms
  dur_p95 INTEGER,  -- p95 duration ms
  pdf_success INTEGER DEFAULT 0,
  pdf_error INTEGER DEFAULT 0,
  docx_success INTEGER DEFAULT 0,
  docx_error INTEGER DEFAULT 0,
  queue_enqueued INTEGER DEFAULT 0,
  queue_dequeued INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint for upserts
CREATE UNIQUE INDEX metrics_rollups_unique_idx ON metrics_rollups(
  project_id,
  COALESCE(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid),
  bucket_start,
  bucket
);
```

**`sli_configs`** - SLI targets per project/workflow
```sql
CREATE TABLE sli_configs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  workflow_id UUID,
  target_success_pct INTEGER DEFAULT 99,
  target_p95_ms INTEGER DEFAULT 5000,
  error_budget_pct INTEGER DEFAULT 1,
  window sli_window DEFAULT '7d',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**`sli_windows`** - Computed SLI snapshots
```sql
CREATE TABLE sli_windows (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  workflow_id UUID,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  success_pct INTEGER,
  p95_ms INTEGER,
  error_budget_burn_pct INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Migration:** `migrations/0011_add_analytics_sli_tables.sql`

---

## Integration Points

### 1. Metrics Capture in Run Lifecycle

**File:** `server/services/RunService.ts`

**Run Started:**
```typescript
import { captureRunLifecycle } from './metrics';

async createRun(...) {
  // ... create run ...

  // Capture run_started event
  const context = await this.getWorkflowContext(workflowId);
  if (context) {
    await captureRunLifecycle.started({
      tenantId: context.tenantId,
      projectId: context.projectId,
      workflowId,
      runId: run.id,
      createdBy: userId,
    });
  }

  return run;
}
```

**Run Succeeded/Failed:**
```typescript
async completeRun(runId, userId) {
  const startTime = Date.now();
  const context = await this.getWorkflowContext(run.workflowId);

  try {
    // ... validate and complete run ...

    // Capture run_succeeded
    if (context) {
      await captureRunLifecycle.succeeded({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId: run.workflowId,
        runId: run.id,
        durationMs: Date.now() - startTime,
        stepCount: allValues.length,
      });
    }

    return completedRun;
  } catch (error) {
    // Capture run_failed
    if (context) {
      await captureRunLifecycle.failed({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId: run.workflowId,
        runId: run.id,
        durationMs: Date.now() - startTime,
        errorType: 'validation_error',
      });
    }
    throw error;
  }
}
```

### 2. Document Generation Events

**When integrating PDF/DOCX generation:**
```typescript
import { captureDocumentGeneration } from '../services/metrics';

async function generatePDF(params) {
  const startTime = Date.now();

  try {
    const pdf = await createPDF(params);

    await captureDocumentGeneration.pdfSucceeded({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: Date.now() - startTime,
      fileSize: pdf.size,
    });

    return pdf;
  } catch (error) {
    await captureDocumentGeneration.pdfFailed({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: Date.now() - startTime,
      errorType: error.code,
    });
    throw error;
  }
}
```

### 3. Rollup Worker Startup

**File:** `server/routes.ts`

```typescript
import { startRollupWorker } from "./jobs/metricsRollup";

export async function registerRoutes(app: Express): Promise<Server> {
  // ... setup routes ...

  // Start metrics rollup worker (runs every 60 seconds)
  if (process.env.NODE_ENV !== 'test') {
    startRollupWorker(60000);
    logger.info('Metrics rollup worker started');
  }

  return httpServer;
}
```

---

## API Endpoints

### GET /api/workflow-analytics/overview

**Query Parameters:**
- `projectId` (required) - UUID of project
- `workflowId` (optional) - UUID of workflow
- `window` (optional) - `1d`, `7d` (default), `30d`

**Response:**
```json
{
  "sli": {
    "successPct": 98.5,
    "p95Ms": 3200,
    "errorBudgetBurnPct": 75.0,
    "totalRuns": 1234,
    "violatesTarget": false
  },
  "runsPerDay": [
    { "date": "2025-01-05", "runs": 45, "success": 44, "failed": 1 },
    { "date": "2025-01-06", "runs": 52, "success": 51, "failed": 1 }
  ],
  "documents": {
    "pdf": {
      "success": 123,
      "failed": 2,
      "successRate": 98.4
    },
    "docx": {
      "success": 89,
      "failed": 1,
      "successRate": 98.9
    }
  },
  "window": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-08T00:00:00Z",
    "duration": "7d"
  }
}
```

### GET /api/workflow-analytics/timeseries

**Query Parameters:**
- `projectId` (required)
- `workflowId` (optional)
- `bucket` (optional) - `1m`, `5m` (default), `1h`, `1d`
- `window` (optional) - `1d`, `7d` (default), `30d`

**Response:**
```json
{
  "timeseries": [
    {
      "timestamp": "2025-01-05T10:00:00Z",
      "runsCount": 12,
      "runsSuccess": 11,
      "runsError": 1,
      "durP50": 2100,
      "durP95": 4500,
      "pdfSuccess": 8,
      "pdfError": 0,
      "successRate": 91.7
    }
  ],
  "bucket": "5m",
  "window": "7d"
}
```

### GET /api/workflow-analytics/sli

**Query Parameters:**
- `projectId` (required)
- `workflowId` (optional)
- `window` (optional) - `1d`, `7d` (default), `30d`

**Response:**
```json
{
  "current": {
    "successPct": 98.5,
    "p95Ms": 3200,
    "errorBudgetBurnPct": 75.0,
    "totalRuns": 1234,
    "successfulRuns": 1215,
    "failedRuns": 19,
    "windowStart": "2025-01-01T00:00:00Z",
    "windowEnd": "2025-01-08T00:00:00Z",
    "target": {
      "successPct": 99,
      "p95Ms": 5000,
      "errorBudgetPct": 1
    },
    "violatesTarget": false
  },
  "config": {
    "id": "uuid",
    "targetSuccessPct": 99,
    "targetP95Ms": 5000,
    "errorBudgetPct": 1,
    "window": "7d"
  },
  "history": [
    {
      "windowStart": "2025-01-01T00:00:00Z",
      "windowEnd": "2025-01-08T00:00:00Z",
      "successPct": 98,
      "p95Ms": 3100,
      "errorBudgetBurnPct": 100,
      "createdAt": "2025-01-08T12:00:00Z"
    }
  ]
}
```

### POST /api/workflow-analytics/sli-config

**Auth:** Requires owner/builder role

**Body:**
```json
{
  "projectId": "uuid",
  "workflowId": "uuid (optional)",
  "targetSuccessPct": 99,
  "targetP95Ms": 5000,
  "errorBudgetPct": 1,
  "window": "7d"
}
```

**Response:** Created/updated SLI config object

---

## Alerting

### Webhook Configuration

**Environment Variable:**
```bash
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
```

**Webhook Payload:**
```json
{
  "severity": "critical",
  "title": "Workflow SLI Violation: Success Rate, P95 Latency",
  "message": "Service Level Indicator (SLI) targets have been violated:\n\n❌ Success Rate: 97.50% (target: 99%)\n❌ P95 Latency: 6200ms (target: 5000ms)\n\nError Budget Burn: 125.00% (1% allowed)\nTotal Runs: 1234\nFailed Runs: 31\n\nWindow: 2025-01-01T00:00:00Z - 2025-01-08T00:00:00Z",
  "projectId": "uuid",
  "workflowId": "uuid",
  "metrics": {
    "successPct": 97.5,
    "p95Ms": 6200,
    "errorBudgetBurnPct": 125.0
  },
  "targets": {
    "successPct": 99,
    "p95Ms": 5000
  },
  "timestamp": "2025-01-08T12:34:56Z"
}
```

### Email Alerts (Stub)

**Location:** `server/services/alerts.ts` - `sendEmailAlert()`

**To implement:**
1. Install SendGrid: `npm install @sendgrid/mail`
2. Set env vars: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
3. Uncomment email code in `sendEmailAlert()`

### Cooldown Mechanism

- Default: 10 minutes between alerts for same project/workflow
- Prevents alert spam
- In-memory tracking (use Redis in production for multi-instance deployments)

---

## NPM Scripts

```bash
# Manually trigger metrics rollup
npm run metrics:rollup

# Rollup with custom bucket and time range
npm run metrics:rollup -- --bucket=5m --since=2025-01-01

# Compute and save SLI windows
npm run metrics:sli

# Compute SLI for specific workflow
npm run metrics:sli -- --projectId=<uuid> --workflowId=<uuid> --window=7d
```

---

## Observability Extensions

### OpenTelemetry (Placeholder)

**File:** `server/observability/otel.ts`

**To enable:**
1. Install packages:
   ```bash
   npm install @opentelemetry/sdk-node \
                @opentelemetry/auto-instrumentations-node \
                @opentelemetry/exporter-trace-otlp-http \
                @opentelemetry/exporter-metrics-otlp-http
   ```

2. Set environment variable:
   ```bash
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otel-collector:4318
   ```

3. Implement SDK initialization in `initOpenTelemetry()`

**Span Example:**
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('vaultlogic');
const span = tracer.startSpan('workflow.run.execute', {
  attributes: {
    'workflow.id': workflowId,
    'run.id': runId,
  },
});

try {
  // Your code
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}
```

### Prometheus (Placeholder)

**File:** `server/observability/prom.ts`

**To enable:**
1. Install prom-client:
   ```bash
   npm install prom-client
   ```

2. Set environment variable:
   ```bash
   PROMETHEUS_ENABLED=true
   ```

3. Implement metrics collection in `initPrometheus()`

**Metrics to implement:**
```typescript
import promClient from 'prom-client';

// Counter
const workflowRunsCounter = new promClient.Counter({
  name: 'vaultlogic_workflow_runs_total',
  help: 'Total number of workflow runs',
  labelNames: ['workflowId', 'status'],
});

// Histogram
const workflowRunDuration = new promClient.Histogram({
  name: 'vaultlogic_workflow_run_duration_ms',
  help: 'Workflow run duration in milliseconds',
  labelNames: ['workflowId'],
  buckets: [100, 500, 1000, 5000, 10000, 30000],
});

// Gauge
const activeWorkflowRuns = new promClient.Gauge({
  name: 'vaultlogic_active_workflow_runs',
  help: 'Number of currently active workflow runs',
  labelNames: ['workflowId'],
});
```

**Access metrics:**
```
GET http://your-server:5000/metrics
```

---

## Frontend Implementation (Future)

The following frontend components are designed but not implemented:

### Dashboard Components

1. **SLIHeader.tsx** - Big KPI cards
   - Success rate (with trend)
   - P95 latency (with trend)
   - PDF generation success rate
   - Runs today

2. **TimeseriesChart.tsx** - Recharts line/area charts
   - Runs over time
   - Success vs failures
   - Selectable bucket size (5m, 1h, 1d)

3. **DurationChart.tsx** - P50/P95 latency over time
   - Dual-axis chart
   - Target line overlay

4. **BreakdownTable.tsx** - Top workflows by errors/duration
   - Sortable columns
   - Drill-down to workflow analytics

5. **SLIConfigForm.tsx** - Edit SLI targets
   - Target success %
   - Target p95 ms
   - Error budget %
   - Window selection

### Pages

- `/projects/:projectId/analytics` - Project-level dashboard
- `/workflows/:workflowId/analytics` - Workflow-level dashboard

### API Hooks

```typescript
// client/hooks/useAnalytics.ts
export function useAnalyticsOverview(projectId: string, workflowId?: string, window = '7d') {
  return useQuery({
    queryKey: ['analytics', 'overview', projectId, workflowId, window],
    queryFn: () => fetch(`/api/workflow-analytics/overview?projectId=${projectId}&workflowId=${workflowId || ''}&window=${window}`).then(r => r.json()),
  });
}

export function useAnalyticsTimeseries(projectId: string, bucket = '5m', window = '7d') {
  return useQuery({
    queryKey: ['analytics', 'timeseries', projectId, bucket, window],
    queryFn: () => fetch(`/api/workflow-analytics/timeseries?projectId=${projectId}&bucket=${bucket}&window=${window}`).then(r => r.json()),
  });
}

export function useSLI(projectId: string, workflowId?: string, window = '7d') {
  return useQuery({
    queryKey: ['analytics', 'sli', projectId, workflowId, window],
    queryFn: () => fetch(`/api/workflow-analytics/sli?projectId=${projectId}&workflowId=${workflowId || ''}&window=${window}`).then(r => r.json()),
  });
}
```

---

## Testing

### Backend Tests (To Implement)

**`tests/metrics.events.test.ts`**
- Test event emission on run start/success/fail
- Test PDF/DOCX event capture
- Test payload redaction

**`tests/metrics.rollup.test.ts`**
- Test rollup aggregation for all bucket sizes
- Test p50/p95 calculation
- Test upsert idempotency

**`tests/analytics.api.test.ts`**
- Test overview endpoint with various filters
- Test timeseries endpoint
- Test SLI endpoint
- Test RBAC for SLI config updates
- Test tenant scoping

**`tests/alerts.test.ts`**
- Test alert triggering when SLI violated
- Test cooldown mechanism
- Test webhook payload format
- Test severity calculation

### Frontend Tests (To Implement)

**`tests/ui.analytics.dashboard.test.tsx`**
- Render KPI cards with mocked data
- Chart interactions (zoom, tooltip)
- SLI config form submission
- Workflow filter functionality

---

## Performance Considerations

1. **Event Capture**
   - Non-blocking async calls
   - Failures don't break application flow
   - Consider batching for high-volume scenarios

2. **Rollup Job**
   - Runs every 60 seconds by default
   - Only processes recent buckets (last 2 by default)
   - Upserts are idempotent (safe to re-run)

3. **API Queries**
   - Use rollups for chart data (pre-aggregated)
   - Index on (projectId, ts) for fast event queries
   - Consider materialized views for complex queries

4. **Scaling**
   - For multi-instance deployments, use Redis for alert cooldowns
   - Consider separate worker process for rollups in production
   - Use database connection pooling

---

## Troubleshooting

### Metrics not showing up

1. **Check rollup worker is running:**
   ```bash
   # Look for log: "Metrics rollup worker started"
   ```

2. **Manually trigger rollup:**
   ```bash
   npm run metrics:rollup
   ```

3. **Check database for raw events:**
   ```sql
   SELECT * FROM metrics_events ORDER BY ts DESC LIMIT 10;
   ```

4. **Check rollups:**
   ```sql
   SELECT * FROM metrics_rollups ORDER BY bucket_start DESC LIMIT 10;
   ```

### SLI not computing

1. **Check for rollup data:**
   ```sql
   SELECT COUNT(*) FROM metrics_rollups WHERE project_id = '<uuid>';
   ```

2. **Manually compute SLI:**
   ```bash
   npm run metrics:sli -- --projectId=<uuid>
   ```

3. **Check SLI config:**
   ```sql
   SELECT * FROM sli_configs WHERE project_id = '<uuid>';
   ```

### Alerts not firing

1. **Check webhook URL is set:**
   ```bash
   echo $ALERT_WEBHOOK_URL
   ```

2. **Check cooldown hasn't triggered:**
   - Wait 10 minutes since last alert

3. **Check SLI targets are actually violated:**
   ```bash
   npm run metrics:sli -- --projectId=<uuid>
   # Look at successPct and p95Ms vs targets
   ```

---

## Migration Checklist

To deploy Stage 11 to production:

- [ ] Run migration: `npm run db:migrate`
- [ ] Verify new tables exist
- [ ] Set `ALERT_WEBHOOK_URL` if using webhooks
- [ ] Generate `VL_MASTER_KEY` if not set (for secrets encryption)
- [ ] Test metrics capture with a few workflow runs
- [ ] Verify rollup worker starts on server boot
- [ ] Check `/api/workflow-analytics/overview` returns data
- [ ] Configure SLI targets for critical workflows
- [ ] Test alert webhook integration
- [ ] Monitor server logs for rollup job execution
- [ ] Optional: Enable OpenTelemetry/Prometheus

---

## Summary

**What was implemented:**
✅ Database schema (4 tables, 3 enums)
✅ Metrics service for event capture
✅ Rollup job for aggregation
✅ SLI computation service
✅ Alert service with webhooks
✅ Analytics API endpoints
✅ Run lifecycle integration
✅ Observability placeholders
✅ NPM scripts for manual operations
✅ Comprehensive documentation

**What's next:**
- Frontend dashboard UI (React components)
- Frontend API integration (TanStack Query)
- OpenTelemetry implementation
- Prometheus metrics endpoint
- Email alert integration (SendGrid)
- Advanced analytics queries (materialized views)
- Real-time dashboards (WebSocket updates)

**Breaking changes:** None - this is a pure addition

---

**Document Maintainer:** Stage 11 Implementation Team
**Last Updated:** November 12, 2025
**Next Review:** December 2025

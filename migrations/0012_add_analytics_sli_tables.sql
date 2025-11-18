-- Migration: Add Analytics & SLI Tables (Stage 11)
-- Description: Add metrics events, rollups, SLI configs, and SLI windows for product analytics and reliability tracking

-- Create enums for analytics
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

-- Metrics events table (raw event stream)
CREATE TABLE metrics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  type metrics_event_type NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices for metrics_events
CREATE INDEX metrics_events_project_ts_idx ON metrics_events(project_id, ts);
CREATE INDEX metrics_events_workflow_ts_idx ON metrics_events(workflow_id, ts);
CREATE INDEX metrics_events_type_idx ON metrics_events(type);
CREATE INDEX metrics_events_tenant_idx ON metrics_events(tenant_id);
CREATE INDEX metrics_events_run_idx ON metrics_events(run_id);

-- Metrics rollups table (aggregated metrics by time bucket)
CREATE TABLE metrics_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket rollup_bucket NOT NULL,
  runs_count INTEGER NOT NULL DEFAULT 0,
  runs_success INTEGER NOT NULL DEFAULT 0,
  runs_error INTEGER NOT NULL DEFAULT 0,
  dur_p50 INTEGER,
  dur_p95 INTEGER,
  pdf_success INTEGER NOT NULL DEFAULT 0,
  pdf_error INTEGER NOT NULL DEFAULT 0,
  docx_success INTEGER NOT NULL DEFAULT 0,
  docx_error INTEGER NOT NULL DEFAULT 0,
  queue_enqueued INTEGER NOT NULL DEFAULT 0,
  queue_dequeued INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint for rollups (one rollup per project/workflow/bucket/time)
CREATE UNIQUE INDEX metrics_rollups_unique_idx ON metrics_rollups(
  project_id,
  COALESCE(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid),
  bucket_start,
  bucket
);

-- Indices for metrics_rollups
CREATE INDEX metrics_rollups_project_bucket_idx ON metrics_rollups(project_id, bucket_start, bucket);
CREATE INDEX metrics_rollups_workflow_bucket_idx ON metrics_rollups(workflow_id, bucket_start, bucket);
CREATE INDEX metrics_rollups_tenant_idx ON metrics_rollups(tenant_id);

-- SLI configuration table
CREATE TABLE sli_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  target_success_pct INTEGER NOT NULL DEFAULT 99,
  target_p95_ms INTEGER NOT NULL DEFAULT 5000,
  error_budget_pct INTEGER NOT NULL DEFAULT 1,
  "window" sli_window NOT NULL DEFAULT '7d',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint for SLI configs (one config per project/workflow)
CREATE UNIQUE INDEX sli_configs_unique_idx ON sli_configs(
  project_id,
  COALESCE(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Indices for sli_configs
CREATE INDEX sli_configs_project_idx ON sli_configs(project_id);
CREATE INDEX sli_configs_workflow_idx ON sli_configs(workflow_id);
CREATE INDEX sli_configs_tenant_idx ON sli_configs(tenant_id);

-- SLI windows table (computed SLI metrics for time windows)
CREATE TABLE sli_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  success_pct INTEGER,
  p95_ms INTEGER,
  error_budget_burn_pct INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices for sli_windows
CREATE INDEX sli_windows_project_window_idx ON sli_windows(project_id, window_start, window_end);
CREATE INDEX sli_windows_workflow_window_idx ON sli_windows(workflow_id, window_start, window_end);
CREATE INDEX sli_windows_tenant_idx ON sli_windows(tenant_id);

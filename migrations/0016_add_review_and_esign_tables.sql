-- Stage 14: E-Signature Node + Document Review Portal
-- Add tables and enums for review tasks and signature requests

-- Add new run status values for waiting states
ALTER TYPE run_status ADD VALUE IF NOT EXISTS 'waiting_review';
ALTER TYPE run_status ADD VALUE IF NOT EXISTS 'waiting_signature';

-- Create review task status enum
DO $$ BEGIN
  CREATE TYPE review_task_status AS ENUM (
    'pending',
    'approved',
    'changes_requested',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create signature request status enum
DO $$ BEGIN
  CREATE TYPE signature_request_status AS ENUM (
    'pending',
    'signed',
    'declined',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create signature provider enum
DO $$ BEGIN
  CREATE TYPE signature_provider AS ENUM (
    'native',
    'docusign',
    'hellosign'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create signature event type enum
DO $$ BEGIN
  CREATE TYPE signature_event_type AS ENUM (
    'sent',
    'viewed',
    'signed',
    'declined'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create review_tasks table
CREATE TABLE IF NOT EXISTS "review_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "node_id" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" review_task_status NOT NULL DEFAULT 'pending',
  "reviewer_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewer_email" varchar(255),
  "message" text,
  "comment" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "resolved_at" timestamp
);

-- Create signature_requests table
CREATE TABLE IF NOT EXISTS "signature_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "node_id" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "signer_email" varchar(255) NOT NULL,
  "signer_name" varchar(255),
  "status" signature_request_status NOT NULL DEFAULT 'pending',
  "provider" signature_provider NOT NULL DEFAULT 'native',
  "provider_request_id" text,
  "token" text UNIQUE NOT NULL,
  "document_url" text,
  "redirect_url" text,
  "message" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "signed_at" timestamp
);

-- Create signature_events table
CREATE TABLE IF NOT EXISTS "signature_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "signature_request_id" uuid NOT NULL REFERENCES "signature_requests"("id") ON DELETE CASCADE,
  "type" signature_event_type NOT NULL,
  "timestamp" timestamp DEFAULT now(),
  "payload" jsonb
);

-- Create indexes for review_tasks
CREATE INDEX IF NOT EXISTS "review_tasks_run_idx" ON "review_tasks"("run_id");
CREATE INDEX IF NOT EXISTS "review_tasks_workflow_idx" ON "review_tasks"("workflow_id");
CREATE INDEX IF NOT EXISTS "review_tasks_node_idx" ON "review_tasks"("node_id");
CREATE INDEX IF NOT EXISTS "review_tasks_status_idx" ON "review_tasks"("status");
CREATE INDEX IF NOT EXISTS "review_tasks_tenant_idx" ON "review_tasks"("tenant_id");
CREATE INDEX IF NOT EXISTS "review_tasks_project_idx" ON "review_tasks"("project_id");
CREATE INDEX IF NOT EXISTS "review_tasks_reviewer_idx" ON "review_tasks"("reviewer_id");

-- Create indexes for signature_requests
CREATE INDEX IF NOT EXISTS "signature_requests_run_idx" ON "signature_requests"("run_id");
CREATE INDEX IF NOT EXISTS "signature_requests_workflow_idx" ON "signature_requests"("workflow_id");
CREATE INDEX IF NOT EXISTS "signature_requests_node_idx" ON "signature_requests"("node_id");
CREATE INDEX IF NOT EXISTS "signature_requests_status_idx" ON "signature_requests"("status");
CREATE INDEX IF NOT EXISTS "signature_requests_tenant_idx" ON "signature_requests"("tenant_id");
CREATE INDEX IF NOT EXISTS "signature_requests_project_idx" ON "signature_requests"("project_id");
CREATE INDEX IF NOT EXISTS "signature_requests_token_idx" ON "signature_requests"("token");

-- Create indexes for signature_events
CREATE INDEX IF NOT EXISTS "signature_events_request_idx" ON "signature_events"("signature_request_id");
CREATE INDEX IF NOT EXISTS "signature_events_type_idx" ON "signature_events"("type");

-- Add comments for documentation
COMMENT ON TABLE review_tasks IS 'Human review gates for workflow approval/rejection';
COMMENT ON TABLE signature_requests IS 'E-signature requests for document signing';
COMMENT ON TABLE signature_events IS 'Audit log for signature request events';

COMMENT ON COLUMN review_tasks.node_id IS 'ID of the REVIEW node in the workflow graph';
COMMENT ON COLUMN review_tasks.reviewer_id IS 'Internal user ID (null for external reviewers)';
COMMENT ON COLUMN review_tasks.reviewer_email IS 'Email for external reviewers';

COMMENT ON COLUMN signature_requests.token IS 'Unique secure token for native signing links';
COMMENT ON COLUMN signature_requests.provider IS 'Signature provider (native, docusign, hellosign)';
COMMENT ON COLUMN signature_requests.provider_request_id IS 'External provider request ID';
COMMENT ON COLUMN signature_requests.document_url IS 'URL or path to document to be signed';

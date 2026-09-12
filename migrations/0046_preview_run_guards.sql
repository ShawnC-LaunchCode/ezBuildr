CREATE OR REPLACE FUNCTION "public"."guard_preview_run_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.execution_mode IS DISTINCT FROM OLD.execution_mode OR
    (OLD.execution_mode = 'preview' AND (NEW.workflow_id IS DISTINCT FROM OLD.workflow_id OR
      NEW.workflow_version_id IS DISTINCT FROM OLD.workflow_version_id OR NEW.created_by IS DISTINCT FROM OLD.created_by))) THEN
    RAISE EXCEPTION 'Preview run identity is immutable';
  END IF;
  IF NEW.execution_mode = 'preview' AND (NEW.share_token_hash IS NOT NULL OR NEW.portal_access_key IS NOT NULL OR
    NEW.assigned_to_user_id IS NOT NULL OR NEW.client_email IS NOT NULL) THEN
    RAISE EXCEPTION 'Preview sessions cannot be distributed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS guard_preview_run_identity ON "public"."workflow_runs";
--> statement-breakpoint
CREATE TRIGGER guard_preview_run_identity BEFORE INSERT OR UPDATE ON "public"."workflow_runs"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_preview_run_identity"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."guard_retired_preview_write"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_mode text; retired_at timestamptz; expires_at timestamptz;
BEGIN
  SELECT execution_mode, preview_retired_at, preview_expires_at INTO run_mode, retired_at, expires_at
    FROM "public"."workflow_runs" WHERE id = NEW.run_id FOR SHARE;
  IF run_mode = 'preview' AND (retired_at IS NOT NULL OR expires_at <= clock_timestamp()) THEN
    -- A retired job may still be acknowledged by its former worker. Ignore it;
    -- INSERT remains forbidden and cleanup owns deletion.
    IF TG_TABLE_NAME = 'run_completion_jobs' AND TG_OP = 'UPDATE' THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'Preview session is retired or expired';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['step_values', 'code_block_runs', 'script_execution_log', 'transform_block_runs',
    'run_generated_documents', 'run_completion_jobs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_retired_preview_write ON %I.%I', current_schema(), target);
    EXECUTE format('CREATE TRIGGER guard_retired_preview_write BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.guard_retired_preview_write()', current_schema(), target, current_schema());
  END LOOP;
END $$;

--> statement-breakpoint
-- Client analytics flags cannot put a persisted preview into ordinary aggregates.
CREATE OR REPLACE FUNCTION "public"."skip_preview_metric"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."workflow_runs" WHERE id = NEW.run_id AND execution_mode = 'preview') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['workflow_run_events', 'workflow_run_metrics', 'template_generation_metrics', 'metrics_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS skip_preview_metric ON %I.%I', current_schema(), target);
    EXECUTE format('CREATE TRIGGER skip_preview_metric BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.skip_preview_metric()', current_schema(), target, current_schema());
  END LOOP;
END $$;

-- Graph-builder removal (Phase 6): drop the dead graph run tables and detangle
-- the foreign keys that pointed live tables at the graph `runs` table.
--
-- Removed tables: runs (graph run instances), run_logs, run_outputs.
-- No application code references any of them; the section runner uses
-- workflow_runs. See the graph-builder removal for context.

-- 1. Detach FK constraints on surviving tables that referenced graph `runs`.
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT IF EXISTS "signature_requests_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "template_generation_metrics" DROP CONSTRAINT IF EXISTS "template_generation_metrics_run_id_runs_id_fk";
--> statement-breakpoint
-- 2. Reconcile drift: review_tasks / signature_requests belong to the section
--    workflow_runs table (the Drizzle schema already models this). Point their
--    run_id FK there. Guarded so a schema already built by drizzle-kit push
--    (which creates the workflow_runs FK directly) does not error.
DO $$ BEGIN
  ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- 3. Drop the dead graph output/log tables (their own FK to runs goes with them).
DROP TABLE IF EXISTS "run_logs";
--> statement-breakpoint
DROP TABLE IF EXISTS "run_outputs";
--> statement-breakpoint
-- 4. Drop the graph run-instances table.
DROP TABLE IF EXISTS "runs";
--> statement-breakpoint
-- 5. Drop the now-unused graph-only enum types.
DROP TYPE IF EXISTS "run_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "log_level";
--> statement-breakpoint
DROP TYPE IF EXISTS "output_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "output_file_type";

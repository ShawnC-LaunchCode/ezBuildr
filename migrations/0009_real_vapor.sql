ALTER TABLE "workflow_run_events" DROP CONSTRAINT "workflow_run_events_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
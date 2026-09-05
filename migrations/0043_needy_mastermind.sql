CREATE TABLE "code_block_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"input_hash" text,
	"status" text NOT NULL,
	"pending_inputs" text[] DEFAULT '{}'::text[] NOT NULL,
	"error_message" text,
	"fired_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "code_block_runs_status_check" CHECK ("code_block_runs"."status" IN ('fired', 'skipped_unready', 'skipped_unchanged', 'error'))
);
--> statement-breakpoint
ALTER TABLE "code_block_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_block_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_block_runs" ADD CONSTRAINT "code_block_runs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_block_runs" ADD CONSTRAINT "code_block_runs_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_block_runs_run_step_unique" ON "code_block_runs" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "code_block_runs" AS PERMISSIVE FOR ALL TO public USING (EXISTS (SELECT 1 FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = "code_block_runs"."run_id" AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id) = app_current_tenant())) WITH CHECK (EXISTS (SELECT 1 FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = "code_block_runs"."run_id" AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id) = app_current_tenant()));

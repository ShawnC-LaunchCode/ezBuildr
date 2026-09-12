CREATE TABLE "run_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"submission_key" varchar(200) NOT NULL,
	"page_id" uuid,
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"response" jsonb,
	"navigation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "run_submissions_status_check" CHECK ("run_submissions"."status" IN ('in_progress', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "run_submissions" ADD CONSTRAINT "run_submissions_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_submissions_run_key_unique" ON "run_submissions" USING btree ("run_id","submission_key");--> statement-breakpoint
CREATE INDEX "run_submissions_run_idx" ON "run_submissions" USING btree ("run_id");
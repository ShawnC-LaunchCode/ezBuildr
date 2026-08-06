CREATE TABLE "run_resume_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"kind" varchar(32) DEFAULT 'save_resume' NOT NULL,
	"created_by_user_id" varchar,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_resume_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "run_resume_links_kind_check" CHECK ("run_resume_links"."kind" IN ('save_resume', 'handoff'))
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "assigned_to_user_id" varchar;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "assignment_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run_resume_links" ADD CONSTRAINT "run_resume_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_resume_links" ADD CONSTRAINT "run_resume_links_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_resume_links" ADD CONSTRAINT "run_resume_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_resume_links_tenant_idx" ON "run_resume_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "run_resume_links_run_idx" ON "run_resume_links" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_resume_links_expires_idx" ON "run_resume_links" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_runs_assigned_user_idx" ON "workflow_runs" USING btree ("assigned_to_user_id");
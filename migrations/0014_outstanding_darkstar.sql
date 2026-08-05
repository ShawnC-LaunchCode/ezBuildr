CREATE TABLE IF NOT EXISTS "run_document_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"tenant_id" uuid,
	"destination_type" varchar(50) NOT NULL,
	"destination_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" varchar(4000),
	"audit_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_document_deliveries_attempts_check" CHECK ("run_document_deliveries"."attempts" >= 0),
	CONSTRAINT "run_document_deliveries_status_check" CHECK ("run_document_deliveries"."status" IN ('pending', 'processing', 'delivered', 'failed', 'retry'))
);
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" DROP CONSTRAINT IF EXISTS "run_document_deliveries_run_id_workflow_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" ADD CONSTRAINT "run_document_deliveries_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" DROP CONSTRAINT IF EXISTS "run_document_deliveries_workflow_id_workflows_id_fk";
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" ADD CONSTRAINT "run_document_deliveries_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" DROP CONSTRAINT IF EXISTS "run_document_deliveries_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "run_document_deliveries" ADD CONSTRAINT "run_document_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_document_deliveries_run_idx" ON "run_document_deliveries" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_document_deliveries_tenant_idx" ON "run_document_deliveries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_document_deliveries_claim_idx" ON "run_document_deliveries" USING btree ("status","next_attempt_at") WHERE "run_document_deliveries"."status" IN ('pending', 'retry');

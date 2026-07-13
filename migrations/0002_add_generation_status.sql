ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "generation_status" varchar(50) DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD COLUMN IF NOT EXISTS "unresolved_variables" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD COLUMN IF NOT EXISTS "pdf_failed" boolean DEFAULT false;

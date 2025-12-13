DO $$ BEGIN
 CREATE TYPE "data_source_type" AS ENUM('native', 'postgres', 'google_sheets', 'airtable', 'external');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "datavault_databases" ADD COLUMN IF NOT EXISTS "type" "data_source_type" DEFAULT 'native' NOT NULL;
ALTER TABLE "datavault_databases" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "datavault_databases" ALTER COLUMN "scope_type" SET DEFAULT 'account';

CREATE TABLE IF NOT EXISTS "workflow_data_sources" (
	"workflow_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workflow_data_sources_pkey" PRIMARY KEY("workflow_id","data_source_id")
);

DO $$ BEGIN
 ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "datavault_databases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_workflow_data_sources_workflow" ON "workflow_data_sources" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_data_sources_source" ON "workflow_data_sources" ("data_source_id");

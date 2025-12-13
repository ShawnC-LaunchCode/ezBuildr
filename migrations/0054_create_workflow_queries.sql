CREATE TABLE IF NOT EXISTS "workflow_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb,
	"sort" jsonb DEFAULT '[]'::jsonb,
	"limit" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."datavault_databases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_queries_workflow" ON "workflow_queries" ("workflow_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_queries_table" ON "workflow_queries" ("table_id");

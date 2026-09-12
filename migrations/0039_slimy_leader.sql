CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"visible_if" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sections_workflow_idx" ON "sections" USING btree ("workflow_id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Sections are indirectly tenant-scoped through their workflow. Match the
-- current post-RLS-7 pages policy: tenant-owned rows are readable/writable,
-- and active public workflow content is readable but never publicly writable.
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sections";
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sections"
  USING (
    CASE WHEN app_current_tenant() IS NULL THEN false
         ELSE EXISTS (
           SELECT 1 FROM workflows w
           WHERE w.id = sections.workflow_id
             AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                   = app_current_tenant()
         )
    END
    OR EXISTS (
      SELECT 1 FROM workflows w
      WHERE w.id = sections.workflow_id
        AND w.is_public = true
        AND w.status = 'active'
    )
  )
  WITH CHECK (
    CASE WHEN app_current_tenant() IS NULL THEN false
         ELSE EXISTS (
           SELECT 1 FROM workflows w
           WHERE w.id = sections.workflow_id
             AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                   = app_current_tenant()
         )
    END
  );

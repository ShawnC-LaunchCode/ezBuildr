-- DEBT-15. Drizzle generates this as a single `ADD COLUMN ... NOT NULL`, which
-- aborts on any table that already holds rows:
--   ERROR: column "storage_key" of relation "run_generated_documents"
--          contains null values
-- Test databases start empty, so the generated form passes every local gate and
-- then breaks the deploy. Add the column nullable, backfill, then enforce the
-- NOT NULL the Drizzle schema declares. End state is identical to the generated
-- migration, so meta/0007_snapshot.json still describes this file correctly.
ALTER TABLE "run_generated_documents" ADD COLUMN IF NOT EXISTS "storage_key" text;
--> statement-breakpoint
-- Backfill with the same key shape the application now writes, so pre-existing
-- rows resolve through storageProvider exactly like new ones. Mirrors
-- FinalBlockRenderer.prepareResponseDocuments: `runs/${runId}/documents/${filename}`.
UPDATE "run_generated_documents"
SET "storage_key" = 'runs/' || "run_id"::text || '/documents/' || "file_name"
WHERE "storage_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "run_generated_documents" ALTER COLUMN "storage_key" SET NOT NULL;

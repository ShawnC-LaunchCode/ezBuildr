DROP INDEX "steps_workflow_alias_unique";--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "sections_deleted_at_idx" ON "sections" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "steps_deleted_at_idx" ON "steps" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "steps_workflow_alias_unique" ON "steps" USING btree ("workflow_id",lower("alias")) WHERE "steps"."alias" IS NOT NULL AND "steps"."alias" <> '' AND "steps"."deleted_at" IS NULL;
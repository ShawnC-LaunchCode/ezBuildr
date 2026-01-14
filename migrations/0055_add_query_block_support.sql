DO $$ BEGIN
 ALTER TYPE "block_type" ADD VALUE 'query';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "blocks" ADD COLUMN "virtual_step_id" uuid;
DO $$ BEGIN
 ALTER TABLE "blocks" ADD CONSTRAINT "blocks_virtual_step_id_steps_id_fk" FOREIGN KEY ("virtual_step_id") REFERENCES "steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "blocks_virtual_step_id_idx" ON "blocks" ("virtual_step_id");

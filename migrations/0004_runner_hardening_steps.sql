DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'steps'
      AND column_name = 'options'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'steps'
      AND column_name = 'config'
  ) THEN
    ALTER TABLE "steps" RENAME COLUMN "options" TO "config";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'steps'
      AND column_name = 'options'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'steps'
      AND column_name = 'config'
  ) THEN
    UPDATE "steps"
    SET "config" = COALESCE("config", "options")
    WHERE "config" IS NULL
      AND "options" IS NOT NULL;

    ALTER TABLE "steps" DROP COLUMN "options";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN IF NOT EXISTS "workflow_id" uuid;
--> statement-breakpoint
UPDATE "steps" AS step
SET "workflow_id" = section."workflow_id"
FROM "sections" AS section
WHERE step."section_id" = section."id"
  AND step."workflow_id" IS NULL;
--> statement-breakpoint
UPDATE "steps"
SET "alias" = 'step_' || substr(replace("id"::text, '-', ''), 1, 12)
WHERE COALESCE("is_virtual", false) = false
  AND NULLIF(trim("alias"), '') IS NULL;
--> statement-breakpoint
WITH duplicate_aliases AS (
  SELECT
    "id",
    "alias",
    row_number() OVER (
      PARTITION BY "workflow_id", lower("alias")
      ORDER BY COALESCE("is_virtual", false), "section_id", "order", "id"
    ) AS duplicate_rank
  FROM "steps"
  WHERE NULLIF(trim("alias"), '') IS NOT NULL
)
UPDATE "steps" AS step
SET "alias" = left(duplicate_aliases."alias", 51) || '_' || substr(replace(step."id"::text, '-', ''), 1, 8)
FROM duplicate_aliases
WHERE step."id" = duplicate_aliases."id"
  AND duplicate_aliases.duplicate_rank > 1;
--> statement-breakpoint
ALTER TABLE "steps" ALTER COLUMN "workflow_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'steps_workflow_id_workflows_id_fk'
  ) THEN
    ALTER TABLE "steps"
      ADD CONSTRAINT "steps_workflow_id_workflows_id_fk"
      FOREIGN KEY ("workflow_id")
      REFERENCES "public"."workflows"("id")
      ON DELETE cascade
      ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "steps_section_alias_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "steps_workflow_idx" ON "steps" USING btree ("workflow_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "steps_workflow_alias_unique"
  ON "steps" USING btree ("workflow_id", lower("alias"))
  WHERE "alias" IS NOT NULL AND "alias" <> '';

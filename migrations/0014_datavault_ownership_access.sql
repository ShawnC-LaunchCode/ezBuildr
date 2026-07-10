ALTER TABLE "datavault_tables" ADD COLUMN IF NOT EXISTS "owner_type" "owner_type";
--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD COLUMN IF NOT EXISTS "owner_uuid" varchar;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_datavault_tables_owner" ON "datavault_tables" ("owner_type", "owner_uuid");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "datavault_database_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "database_id" uuid NOT NULL REFERENCES "datavault_databases"("id") ON DELETE cascade,
  "principal_type" varchar(20) NOT NULL,
  "principal_id" varchar NOT NULL,
  "role" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datavault_database_access_database_idx" ON "datavault_database_access" ("database_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "datavault_database_access_principal_idx" ON "datavault_database_access" ("database_id", "principal_type", "principal_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "datavault_table_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "table_id" uuid NOT NULL REFERENCES "datavault_tables"("id") ON DELETE cascade,
  "principal_type" varchar(20) NOT NULL,
  "principal_id" varchar NOT NULL,
  "role" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datavault_table_access_table_idx" ON "datavault_table_access" ("table_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "datavault_table_access_principal_idx" ON "datavault_table_access" ("table_id", "principal_type", "principal_id");
--> statement-breakpoint
UPDATE "datavault_databases" AS db
SET
  "owner_type" = p."owner_type",
  "owner_uuid" = p."owner_uuid"
FROM "projects" AS p
WHERE db."owner_type" IS NULL
  AND db."scope_type" = 'project'
  AND db."scope_id" = p."id"
  AND p."owner_type" IS NOT NULL
  AND p."owner_uuid" IS NOT NULL;
--> statement-breakpoint
UPDATE "datavault_databases" AS db
SET
  "owner_type" = w."owner_type",
  "owner_uuid" = w."owner_uuid"
FROM "workflows" AS w
WHERE db."owner_type" IS NULL
  AND db."scope_type" = 'workflow'
  AND db."scope_id" = w."id"
  AND w."owner_type" IS NOT NULL
  AND w."owner_uuid" IS NOT NULL;
--> statement-breakpoint
UPDATE "datavault_tables" AS t
SET
  "owner_type" = db."owner_type",
  "owner_uuid" = db."owner_uuid"
FROM "datavault_databases" AS db
WHERE t."owner_type" IS NULL
  AND t."database_id" = db."id"
  AND db."owner_type" IS NOT NULL
  AND db."owner_uuid" IS NOT NULL;
--> statement-breakpoint
UPDATE "datavault_tables"
SET
  "owner_type" = 'user',
  "owner_uuid" = "owner_user_id"
WHERE "owner_type" IS NULL
  AND "owner_user_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "datavault_table_access" ("table_id", "principal_type", "principal_id", "role", "created_at")
SELECT
  "table_id",
  'user',
  "user_id",
  CASE "role"
    WHEN 'read' THEN 'view'
    WHEN 'write' THEN 'edit'
    ELSE 'owner'
  END,
  "created_at"
FROM "datavault_table_permissions"
ON CONFLICT DO NOTHING;

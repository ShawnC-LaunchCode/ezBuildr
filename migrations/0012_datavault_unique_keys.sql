CREATE TABLE IF NOT EXISTS "datavault_unique_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"value_hash" bytea NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "datavault_unique_keys_row_id_datavault_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."datavault_rows"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "datavault_unique_keys_column_id_datavault_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."datavault_columns"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "datavault_unique_keys_column_value_unique" UNIQUE("column_id","value_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datavault_unique_keys_row_id_idx" ON "datavault_unique_keys" USING btree ("row_id");
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('datavault_unique_keys') IS NOT NULL THEN
    ALTER TABLE datavault_unique_keys ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON datavault_unique_keys;
    CREATE POLICY tenant_isolation ON datavault_unique_keys
      USING (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_row_tenant(row_id) = app_current_tenant()
        END
      )
      WITH CHECK (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_row_tenant(row_id) = app_current_tenant()
        END
      );
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "datavault_unique_keys" ("row_id", "column_id", "value_hash")
SELECT v."row_id", v."column_id", sha256(convert_to(v."value"::jsonb::text, 'UTF8'))
FROM "datavault_values" v
JOIN "datavault_rows" r ON r."id" = v."row_id"
JOIN "datavault_columns" c ON c."id" = v."column_id"
WHERE r."deleted_at" IS NULL
  AND (c."is_unique" = true OR c."is_primary_key" = true)
  AND v."value" IS NOT NULL
  AND v."value"::jsonb != 'null'::jsonb
ON CONFLICT DO NOTHING;
--> statement-breakpoint
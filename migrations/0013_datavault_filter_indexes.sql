CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datavault_values_col_val_trunc_idx" ON "datavault_values" USING btree ("column_id", (left("value" #>> '{}', 200)) text_pattern_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datavault_values_val_trgm_gin_idx" ON "datavault_values" USING gin (("value" #>> '{}') gin_trgm_ops);
--> statement-breakpoint

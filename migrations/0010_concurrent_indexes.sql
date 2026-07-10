CREATE INDEX IF NOT EXISTS "workflow_runs_portal_access_key_idx" ON "workflow_runs" USING btree ("portal_access_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_ts_entity_idx" ON "audit_logs" USING btree ("timestamp", "entity_type", "entity_id");

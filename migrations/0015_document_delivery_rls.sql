DO $$
BEGIN
  IF to_regclass('run_document_deliveries') IS NOT NULL THEN
    ALTER TABLE run_document_deliveries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON run_document_deliveries;
    CREATE POLICY tenant_isolation ON run_document_deliveries
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;
--> statement-breakpoint

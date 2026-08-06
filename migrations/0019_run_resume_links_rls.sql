-- ============================================================================
-- 0019 — Row-Level Security for run_resume_links (GH-147, SEC-051)
-- ============================================================================
-- run_resume_links carries a direct tenant_id column (save/resume + staff
-- handoff credentials), so it needs the same tenant_isolation policy as the
-- other direct-tenant_id tables in 0001/0004/0015. Kept as its own migration
-- rather than folded into 0018 so drizzle-kit's generated DDL and hand-written
-- RLS SQL never share one file, matching the 0014/0015 and 0003/0004 pairs.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('run_resume_links') IS NOT NULL THEN
    ALTER TABLE run_resume_links ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON run_resume_links;
    CREATE POLICY tenant_isolation ON run_resume_links
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;
--> statement-breakpoint

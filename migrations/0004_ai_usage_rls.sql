-- ============================================================================
-- 0004 — Row-Level Security for ai_usage (ICW2-B7, SEC-051)
-- ============================================================================
-- ai_usage (added in 0003) has a direct tenant_id column, so per the
-- direct-tenant_id pattern in 0001_enable_rls.sql it needs its own
-- tenant_isolation policy. Not added to 0001 itself — that migration has
-- already shipped — so this mirrors it as a new migration instead.
--
-- SAFE TO SHIP: same as 0001 — RLS is bypassed for the table owner/superusers
-- unless FORCE mode is set, so this defines the policy without changing
-- current behaviour until RLS enforcement is turned on
-- (docs/architecture/TENANT_ISOLATION_RLS.md).
-- Idempotent: DROP POLICY IF EXISTS + to_regclass guard.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('ai_usage') IS NOT NULL THEN
    ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON ai_usage;
    CREATE POLICY tenant_isolation ON ai_usage
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;
--> statement-breakpoint

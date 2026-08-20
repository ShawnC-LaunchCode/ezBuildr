-- ============================================================================
-- 0026 — Wrap the direct-tenant_id GUC cast in NULLIF (RLS-4 blocker)
-- ============================================================================
-- Proven by tests/integration/rls4-forceEnforcement.test.ts against a real
-- non-owner role: once FORCE ROW LEVEL SECURITY is on, a custom GUC that has
-- been touched on a pooled connection reverts to empty string on the NEXT use
-- of that connection, not unset. Every direct-tenant_id policy so far casts
-- unguarded:
--
--   USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
--
-- ''::uuid raises `invalid input syntax for type uuid: ""` instead of
-- filtering the row. Nothing leaks (fail-closed either way), but under FORCE,
-- on the app's pooled connection, any query that runs outside a tenant
-- transaction on a connection that previously served one returns a hard 500
-- instead of an empty result — most of the app, on day one of enforcement.
--
-- The ownership-derived policies on workflows/sections/steps, and every
-- DataVault child-table policy (0011/0012), already route through
-- app_current_tenant(), which has wrapped this in NULLIF since 0001 Part 2:
--
--   SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
--
-- Those are NOT touched here. This migration fixes only the direct-tenant_id
-- policies, which inline the cast instead of calling that function:
--   - the 23 tables in 0001 Part 1 (minus 'files', which has no tenant_id
--     column and never got a policy — see 0024's note)
--   - ai_usage (0004)
--   - run_document_deliveries (0015)
--   - run_resume_links (0019)
--   - the same 24 (23 + ai_usage) as recreated verbatim, still unguarded, by
--     0024's repair
-- 24 + 2 = 26 tables total, matching the inventory these five migrations
-- collectively define.
--
-- 0001/0004/0015/0019/0024 are applied and immutable — this is a new
-- migration recreating the same policies with the guarded cast. Idempotent:
-- DROP POLICY IF EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'ai_usage',
    'audit_logs',
    'collab_docs',
    'collections',
    'connections',
    'datavault_api_tokens',
    'datavault_databases',
    'datavault_number_sequences',
    'datavault_row_notes',
    'datavault_tables',
    'external_destinations',
    'metrics_events',
    'metrics_rollups',
    'organizations',
    'projects',
    'records',
    'review_tasks',
    'run_document_deliveries',
    'run_resume_links',
    'signature_requests',
    'sli_configs',
    'sli_windows',
    'teams',
    'tenant_domains',
    'users',
    'workflow_blueprints'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass(quote_ident(t)) IS NULL THEN
      RAISE EXCEPTION 'RLS NULLIF fix (0026): expected table % to exist and it does not — inventory is stale, fix the migration, do not skip', t;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $sql$CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$sql$,
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

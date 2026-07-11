-- ============================================================================
-- 0001 — Enable Row-Level Security (RLS) for tenant isolation  (SEC-051, phase 1)
-- ============================================================================
--
-- WHAT THIS DOES
--   Enables RLS and installs a `tenant_isolation` policy on every table that
--   carries a direct `tenant_id` column. The policy restricts every row that a
--   session can SELECT / INSERT / UPDATE / DELETE to the tenant named by the
--   `app.current_tenant_id` runtime setting (GUC).
--
-- WHY IT IS SAFE TO SHIP NOW (non-breaking)
--   Postgres does NOT apply RLS to a table's OWNER or to superusers unless the
--   table is additionally put in FORCE mode. The application connects to Neon as
--   the role that OWNS these tables, and the test/CI databases connect as the
--   `postgres` superuser — so after this migration RLS is DEFINED but NOT
--   ENFORCED anywhere. Behaviour is unchanged until enforcement is turned on
--   deliberately (see the rollout runbook in
--   docs/architecture/TENANT_ISOLATION_RLS.md).
--
-- HOW ENFORCEMENT IS TURNED ON LATER (not in this migration)
--   Phase 2: plumb `app.current_tenant_id` into every request via a
--            transaction-scoped `SET LOCAL` (server/db/rlsContext.ts).
--   Phase 3: either `ALTER TABLE ... FORCE ROW LEVEL SECURITY` or move the app
--            to a non-owner role without BYPASSRLS. Only after phase 2 is
--            verified, because once enforced a session with no tenant GUC set
--            sees ZERO rows (fail-closed).
--
-- SCOPE / LIMITS
--   Only tables with a direct `tenant_id` column are covered here (24 tables).
--   Tables scoped INDIRECTLY (workflow_runs, step_values, datavault_rows,
--   secrets, workflows, sections, steps, ...) need join/subquery policies and
--   are tracked as phase 4 in the RLS doc — deliberately not attempted here.
--
--   The policy is strict: a NULL `tenant_id` row is invisible once enforced.
--   Four covered tables allow NULL tenant_id today (users, organizations,
--   projects, collab_docs). Review those before FORCE — see the RLS doc.
-- ============================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
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
    'files',
    'metrics_events',
    'metrics_rollups',
    'organizations',
    'projects',
    'records',
    'review_tasks',
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
    -- Skip gracefully if a table is absent (keeps the migration runnable on
    -- partial/legacy schemas and in per-worker test schemas).
    IF to_regclass(quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'RLS: table % not found, skipping', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Idempotent: drop then recreate so re-running the migration is safe.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid) '
      || 'WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 0027 — NULL-safe tenant comparison on direct-tenant_id policies (RLS-5)
-- ============================================================================
-- Found running the integration suite as a genuine non-owner role for the
-- first time (RLS-5): registration itself failed with "new row violates
-- row-level security policy for table users", cascading into ~108 of 124
-- integration files, because `users.tenant_id` is nullable and
-- `server/routes/auth.routes.ts` deliberately creates a new user with
-- `tenantId: null` (tenant membership is assigned later, never accepted from
-- an unauthenticated registration body — SECURITY comment at that call site).
--
-- In SQL, `NULL = NULL` evaluates to NULL, not TRUE. `0026`'s policies —
--   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
-- — therefore reject a NULL-`tenant_id` row UNCONDITIONALLY, even in the
-- correct "no tenant pinned" context that row is supposed to be visible in.
-- This was invisible before RLS-5: the owner role bypasses RLS entirely
-- (RLS-4's finding), so nothing ever evaluated this predicate for real until
-- a genuine non-owner role ran a genuine unassigned-user insert.
--
-- Fix: NULL-safe equality (`IS NOT DISTINCT FROM`) instead of `=`. A row
-- with `tenant_id IS NULL` now matches only when the ambient GUC is ALSO
-- unset/empty (no tenant pinned) — exactly the registration/bootstrap case.
-- It does NOT become visible to any real pinned tenant: for a non-null GUC,
-- `NULL IS NOT DISTINCT FROM '<real-tenant>'` is FALSE, same as today. So
-- this narrows a previously-total block down to the one case it should
-- never have blocked, without loosening isolation between real tenants —
-- rows already scoped to a tenant are exactly as protected as under 0026.
--
-- Nullable today (confirmed via `shared/schema/*.ts`, no `.notNull()`):
-- `users`, `audit_logs`, `projects`, `workflow_blueprints`. Applied to the
-- same 26-table inventory as 0026 regardless — a NOT NULL column can never
-- hold a NULL value to be "not distinct" from, so the predicate is
-- byte-equivalent to today's behaviour there, and this stays correct if any
-- of those columns is ever relaxed to nullable later.
--
-- 0001/0004/0015/0019/0024/0026 are applied and immutable — this recreates
-- the same policies again with the NULL-safe predicate. Idempotent: DROP
-- POLICY IF EXISTS + CREATE POLICY, safe to re-run.
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
      RAISE EXCEPTION 'RLS NULL-safe fix (0027): expected table % to exist and it does not — inventory is stale, fix the migration, do not skip', t;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $sql$CREATE POLICY tenant_isolation ON %I USING (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$sql$,
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

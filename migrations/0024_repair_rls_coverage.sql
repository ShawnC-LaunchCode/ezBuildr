-- ============================================================================
-- 0024 — Repair RLS policy coverage on databases where 0001/0004 silently no-op'd
-- ============================================================================
-- RLS-3. `0001_enable_rls.sql` and `0004_ai_usage_rls.sql` are NOT broken — a
-- scratch database built from the migration chain alone gets all 27 policies
-- they define (ENV-2, 2026-08-15). Production (and its Neon-branch clones,
-- dev/test) diverged because their tables were created out of band by
-- `npm run db:push` before those migrations first ran for real: each
-- `to_regclass(...)` guard resolved NULL for a table that did not exist *yet*
-- at that moment, so the loop logged a NOTICE and moved on, and the migration
-- still recorded itself applied. Measured directly against `dev` (a
-- byte-identical Neon branch of production, so this was verified without a
-- single write to production):
--
--   24 of 26 tables with a direct tenant_id column carry NO RLS at all
--     (protected: run_document_deliveries, run_resume_links only — added by
--      0015/0019, which ran for real because their target tables already
--      existed at that point in the chain).
--   workflows / sections / steps carry NO ownership-derived RLS either,
--     though app_current_tenant()/app_owner_tenant() (0001 Part 2) exist —
--     CREATE FUNCTION always ran; only the ENABLE/CREATE POLICY blocks for
--     those three tables were skipped.
--   The 7 DataVault child tables (0011/0012) are correctly protected — their
--     target tables were created by earlier statements in the SAME db:migrate
--     run, so their guards found them and those migrations applied for real.
--
-- This migration closes the gap on an already-provisioned database. It is
-- NOT a rewrite of 0001/0004 (their hashes must not change — already-applied
-- migrations are immutable) and does not touch the 7 DataVault tables 0011/
-- 0012 already cover correctly.
--
-- Scope: the 26-table tenant_id inventory minus the 2 already protected,
-- minus 'files' (present in 0001's array but has NO tenant_id column in this
-- schema — that entry was always inert, not a real gap; left alone, not
-- edited, since 0001 is immutable), plus the 3 ownership-derived tables.
-- 24 + 3 = 27, matching ENV-2's chain-build diff exactly.
--
-- Fails LOUD, not soft: unlike 0001/0004/0011's `RAISE NOTICE ... CONTINUE`
-- guard, every table named below is expected to exist on any database this
-- migration runs against (a fresh chain build creates it in 0000; a live
-- database created it via db:push). A NULL to_regclass here means the
-- inventory itself is wrong, and that should stop the migration, not log a
-- notice and silently ship another undetectable gap — that failure mode is
-- exactly what produced this ticket. `ALTER TABLE %I` on a genuinely
-- nonexistent table already raises `42P01 relation does not exist` on its
-- own, so the explicit check below exists to give that a clear message.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY and DROP POLICY IF EXISTS + CREATE
-- POLICY are safe to re-run, so this migration is also safe to apply on a
-- fresh chain-built database that already has every policy from 0001/0004 —
-- it will simply recreate the identical policy.
-- ============================================================================

-- Part 1 — the 24 direct-tenant_id tables. Same policy shape as 0001/0004/
-- 0015/0019 (no CASE guard — matches existing behaviour for the two tables
-- already live in production with this exact pattern; changing the shape is
-- RLS-4/enforcement's concern, not this ticket's).
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
      RAISE EXCEPTION 'RLS repair (0024): expected table % to exist and it does not — inventory is stale, fix the migration, do not skip', t;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid) '
      || 'WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- Part 2 — ownership-derived policies on workflows/sections/steps. Reuses
-- app_current_tenant()/app_owner_tenant(), both already present (0001 Part 2
-- CREATE FUNCTION always succeeded — only the ENABLE/CREATE POLICY blocks
-- below were skipped). Byte-identical predicate to 0001 Part 3.
DO $$
BEGIN
  IF to_regclass('workflows') IS NULL THEN
    RAISE EXCEPTION 'RLS repair (0024): expected table workflows to exist and it does not';
  END IF;
  ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON workflows;
  CREATE POLICY tenant_isolation ON workflows
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)
                  = app_current_tenant()
      END
    )
    WITH CHECK (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)
                  = app_current_tenant()
      END
    );
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('sections') IS NULL THEN
    RAISE EXCEPTION 'RLS repair (0024): expected table sections to exist and it does not';
  END IF;
  ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON sections;
  CREATE POLICY tenant_isolation ON sections
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = sections.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
    )
    WITH CHECK (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = sections.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
    );
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('steps') IS NULL THEN
    RAISE EXCEPTION 'RLS repair (0024): expected table steps to exist and it does not';
  END IF;
  ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON steps;
  CREATE POLICY tenant_isolation ON steps
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = steps.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
    )
    WITH CHECK (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = steps.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
    );
END $$;
--> statement-breakpoint

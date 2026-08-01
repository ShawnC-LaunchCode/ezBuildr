-- ============================================================================
-- 0001 — Row-Level Security (tenant isolation, SEC-051)
-- ============================================================================
-- Consolidated from the pre-baseline chain's 0001 (direct tenant_id tables) and
-- 0005 (ownership-derived workflows/sections/steps). drizzle-kit cannot generate
-- RLS, so this is a hand-written --custom migration layered after the baseline.
--
-- SAFE TO SHIP: RLS is bypassed for a table's OWNER and superusers unless FORCE
-- mode is set. Prod connects to Neon as the table owner; CI/tests connect as the
-- postgres superuser — so policies are DEFINED but NOT ENFORCED until a
-- deliberate later step (docs/architecture/TENANT_ISOLATION_RLS.md).
-- Idempotent: DROP POLICY IF EXISTS + to_regclass guards + CREATE OR REPLACE.
-- ============================================================================

-- Part 1 — direct tenant_id tables: restrict rows to the app.current_tenant_id GUC.
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
    IF to_regclass(quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'RLS: table % not found, skipping', t;
      CONTINUE;
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

-- Part 2 — helpers for ownership-derived tenancy (workflows have no tenant_id).
-- Both are SECURITY INVOKER and deliberately do NOT pin search_path, so they
-- resolve public in prod and the per-worker schema in tests. '' and unset both
-- collapse to NULL so callers treat "no tenant" uniformly (fail-closed).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$fn$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_owner_tenant(
  p_owner_type owner_type,
  p_owner_uuid varchar,
  p_owner_id   varchar,
  p_creator_id varchar,
  p_project_id uuid
) RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    CASE p_owner_type
      WHEN 'user' THEN (SELECT u.tenant_id FROM users u WHERE u.id = p_owner_uuid)
      WHEN 'org'  THEN (SELECT o.tenant_id FROM organizations o WHERE o.id::text = p_owner_uuid)
    END,
    (SELECT pr.tenant_id FROM projects pr WHERE pr.id = p_project_id),
    (SELECT u.tenant_id FROM users u WHERE u.id = p_owner_id),
    (SELECT u.tenant_id FROM users u WHERE u.id = p_creator_id)
  );
$fn$;
--> statement-breakpoint

-- Part 3 — ownership-derived policies. Each wraps logic in CASE so a NULL tenant
-- returns false WITHOUT evaluating app_owner_tenant (avoids 22P02 on empty GUC).
DO $$
BEGIN
  IF to_regclass('workflows') IS NOT NULL THEN
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
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('sections') IS NOT NULL THEN
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
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('steps') IS NOT NULL THEN
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
  END IF;
END $$;

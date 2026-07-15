-- ============================================================================
-- 0005 — RLS phase 4: workflows / sections / steps (SEC-051, ICW-B2)
-- ============================================================================
--
-- WHAT THIS DOES
--   Adds the `tenant_isolation` Row-Level Security policy to the three core
--   creation tables that carry NO direct `tenant_id` column and were explicitly
--   deferred to "phase 4" by migration 0001 and
--   docs/architecture/TENANT_ISOLATION_RLS.md §5:
--       workflows, sections, steps.
--
-- HOW TENANT IS RESOLVED (the reason this couldn't be a copy of 0001)
--   `workflows` has no `tenant_id`. A workflow's tenant is derived from its
--   ownership model, mirroring how AclService authorizes a workflow:
--     * owner_type = 'user' -> users.tenant_id        WHERE users.id = owner_uuid
--     * owner_type = 'org'  -> organizations.tenant_id WHERE organizations.id = owner_uuid
--     * else project_id     -> projects.tenant_id      WHERE projects.id = project_id
--     * else legacy owner_id / creator_id -> users.tenant_id
--   Resolution is by COALESCE precedence, so every workflow maps to exactly ONE
--   tenant (never visible to two tenants). `sections` and `steps` both carry a
--   denormalised `workflow_id`, so they resolve through their parent workflow in
--   a single join.
--
--   This is the TENANT boundary only. Finer, within-tenant permissions
--   (workflow_access / project_access ACL rows) remain enforced in the service
--   layer — RLS is the structural backstop, not a replacement for AclService.
--
-- WHY IT IS SAFE TO SHIP NOW (non-breaking, same as 0001)
--   RLS is bypassed for a table's OWNER and for superusers unless FORCE mode is
--   set. Production connects to Neon as the table owner and CI/local tests
--   connect as the `postgres` superuser, so after this migration the policies
--   are DEFINED but NOT ENFORCED anywhere. Enforcement is a later, deliberate
--   step (see the rollout runbook in docs/architecture/TENANT_ISOLATION_RLS.md).
--
-- FAIL-CLOSED + THE EMPTY-STRING GUC
--   A request with no tenant must see ZERO rows, never an error. On a pooled
--   connection `app.current_tenant_id` reverts to an EMPTY STRING (not NULL)
--   once any earlier transaction has set it (see tests/integration/rls-context
--   .test.ts, which asserts the value can be '' or null). `app_current_tenant()`
--   maps both '' and unset to NULL. Each policy is wrapped in a CASE so that when
--   there is no tenant it returns FALSE *without* evaluating `app_owner_tenant`
--   — this matters because that resolver reads users/organizations/projects,
--   whose 0001 policies use the raw `current_setting(...)::uuid` form and would
--   raise 22P02 on an empty string. CASE guarantees the ELSE branch is skipped.
--
-- NOTES
--   * Both helpers are SECURITY INVOKER (the default) and do NOT pin search_path
--     — required so they resolve the right tables in production (public) and in
--     the per-worker test schemas (tests/setup.ts drives schemas via
--     search_path). INVOKER never runs with elevated privilege, so search_path
--     shadowing is not an escalation vector here.
--   * organizations.id is uuid but owner_uuid is varchar, so the org branch
--     compares `organizations.id::text = owner_uuid` (cast the uuid column to
--     text) — this can never raise on a non-uuid owner_uuid.
--   * `app_owner_tenant` takes the workflow's columns (not its id) so the
--     workflows policy never queries `workflows` and cannot recurse.
--   * Idempotent: CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS before
--     CREATE, and to_regclass guards — safe to re-run.
-- ============================================================================

-- Current request tenant, normalised: '' (pooled-connection reset) and unset
-- both collapse to NULL so callers can treat "no tenant" uniformly.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$fn$;
--> statement-breakpoint

-- Resolve a workflow's owning tenant from its ownership columns (see header).
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
    -- 1. Current owner (owner_type / owner_uuid)
    CASE p_owner_type
      WHEN 'user' THEN (SELECT u.tenant_id FROM users u WHERE u.id = p_owner_uuid)
      WHEN 'org'  THEN (SELECT o.tenant_id FROM organizations o WHERE o.id::text = p_owner_uuid)
    END,
    -- 2. Parent project
    (SELECT pr.tenant_id FROM projects pr WHERE pr.id = p_project_id),
    -- 3. Legacy owner_id (a users.id)
    (SELECT u.tenant_id FROM users u WHERE u.id = p_owner_id),
    -- 4. Legacy creator_id (a users.id)
    (SELECT u.tenant_id FROM users u WHERE u.id = p_creator_id)
  );
$fn$;
--> statement-breakpoint

-- workflows: resolve tenant directly from the workflow's own ownership columns.
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

-- sections: resolve tenant through the parent workflow (sections.workflow_id).
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

-- steps: resolve tenant through the parent workflow (steps.workflow_id).
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

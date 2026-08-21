-- ============================================================================
-- 0033 — Bootstrap lookup clauses on `projects` and `organizations` (RLS-5)
-- ============================================================================
-- Completes what 0030 started. `WorkflowTenantResolver` answers "given a
-- workflow, which tenant owns it?" — a question that by definition must be
-- answerable BEFORE a tenant is known. 0030 made the WORKFLOW readable in that
-- state; it did not make the tables the tenant is DERIVED from readable, and
-- `app_owner_tenant()` is plain SQL (LANGUAGE sql STABLE, deliberately NOT
-- SECURITY DEFINER — see 0001) so it is bound by RLS exactly like any other
-- caller. Resolution therefore found the workflow and still returned NULL.
--
-- The user-id half of this needed no migration: the ids reached there
-- (`owner_uuid` when owner_type='user', `creator_id`, `owner_id`) are matched
-- against `users`, whose 0028 self-identification clause already covers them,
-- so the resolver just pins `app.current_user_id`. This migration covers the
-- two remaining derivation paths.
--
-- WHY THIS IS NOT MERELY AVAILABILITY — it is CORRECTNESS. `resolveForWorkflow`
-- tries the PROJECT tenant FIRST, then the owner principal, then the creator.
-- With only the user paths working, a filed workflow does not fail: it falls
-- THROUGH to the creator and resolves that person's tenant instead. Those are
-- usually the same tenant and silently are not after a project transfer — so
-- the failure mode is a run, a document, or a branding lookup quietly attributed
-- to the wrong tenant, which is precisely the class of bug this whole phase
-- exists to make impossible. Fail-closed was never the risk here; resolving
-- CONFIDENTLY WRONG was.
--
-- Shape: the verified-foreign-key variant, the same one 0030 uses (see
-- docs/architecture/TENANT_ISOLATION_RLS.md §2e). `app.current_project_id` and
-- `app.current_org_id` must ONLY ever be set to an id read off a workflow row
-- that was itself legitimately reached — never from request input. A bare
-- project or organization id is not a secret; the trust comes entirely from HOW
-- it was obtained.
--
-- USING only, never WITH CHECK, on both tables: this unlocks a read that then
-- resolves and pins the real tenant, after which the normal mechanism governs
-- every write. Nothing here permits a write.
--
-- `projects.id` and `organizations.id` are both `uuid`, so both need the
-- `::uuid` cast — unlike `users.id`, which is varchar.
--
-- 0001/.../0032 are applied and immutable — this recreates both policies with
-- the added clause. Idempotent: DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('projects') IS NULL THEN
    RAISE EXCEPTION 'RLS bootstrap lookup (0033): expected table projects to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON projects;
  CREATE POLICY tenant_isolation ON projects
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR id = NULLIF(current_setting('app.current_project_id', true), '')::uuid
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('organizations') IS NULL THEN
    RAISE EXCEPTION 'RLS bootstrap lookup (0033): expected table organizations to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON organizations;
  CREATE POLICY tenant_isolation ON organizations
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

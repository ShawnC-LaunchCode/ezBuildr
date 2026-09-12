-- ============================================================================
-- 0031 — Public-workflow visibility on workflows/sections/steps (RLS-4 precondition 2, part 3)
-- ============================================================================
-- `RunAuthResolver.verifyCreateAccess` resolves a workflow by public link or
-- slug BEFORE anything is known about it — unlike 0029/0030's cases, there is
-- no prior verification step here at all (no token, no already-legitimate
-- foreign key): the caller supplies a slug directly, and the very first read
-- decides whether it points at something they may see. That is not a
-- "prove identity, then bootstrap" gap; a self-identification GUC keyed on
-- an id nobody has verified yet would defeat the point. Measured directly:
-- once 0029/0030 landed, `tests/integration/api.runs.public-access.test.ts`
-- still failed with "Workflow not found" for every genuinely public
-- workflow — this is a distinct finding, not the same one recurring.
--
-- The actual fix is simpler and needs no GUC: `workflows.is_public` (plus
-- `status = 'active'`) is a column the row's OWNER already set, declaring
-- that row visible without regard to tenant. That is the entire meaning of
-- "public" — the correct RLS shape is a policy clause keyed on the row's own
-- declared state, not a caller-supplied identifier. Applied to `sections`/
-- `steps` too via the same `EXISTS (... workflows w ...)` join their
-- existing ownership-derived clause already uses, so a public workflow's
-- content is exactly as visible as the workflow itself — a participant who
-- can see the workflow is stuck immediately without this, since sections/
-- steps are how it is actually rendered and run.
--
-- Still NOT covered by this: draft/inactive-but-technically-public workflows
-- (correctly gated — visibility requires `status = 'active'` too), and any
-- OTHER table a public run touches that is not one of these three
-- (`workflow_runs`/`step_values` carry no RLS policy at all today, so they
-- are unaffected either way). Not added to WITH CHECK on any of the three —
-- public readability never implies public writability; every write still
-- requires the normal tenant-derived ownership check.
--
-- 0001 is applied and immutable — this recreates all three policies again,
-- adding the OR clause to USING only. Idempotent: DROP POLICY IF EXISTS +
-- CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('workflows') IS NULL THEN
    RAISE EXCEPTION 'RLS public-visibility fix (0031): expected table workflows to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON workflows;
  CREATE POLICY tenant_isolation ON workflows
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)
                  = app_current_tenant()
      END
      OR id = NULLIF(current_setting('app.current_workflow_id', true), '')::uuid
      OR (is_public = true AND status = 'active')
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
    RAISE EXCEPTION 'RLS public-visibility fix (0031): expected table sections to exist and it does not';
  END IF;
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
      OR EXISTS (
        SELECT 1 FROM workflows w
        WHERE w.id = sections.workflow_id
          AND w.is_public = true
          AND w.status = 'active'
      )
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
    RAISE EXCEPTION 'RLS public-visibility fix (0031): expected table steps to exist and it does not';
  END IF;
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
      OR EXISTS (
        SELECT 1 FROM workflows w
        WHERE w.id = steps.workflow_id
          AND w.is_public = true
          AND w.status = 'active'
      )
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

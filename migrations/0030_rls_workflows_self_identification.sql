-- ============================================================================
-- 0030 — Self-identification read clause on `workflows` (RLS-4 precondition 2, part 2)
-- ============================================================================
-- `RunFileUploadService`/`server/middleware/runTokenAuth.ts` share a
-- bootstrap shape distinct from `signature_requests` (migration 0029):
-- there is no per-row secret to hash. Authorization instead comes from
-- `workflow_runs.run_token`, matched by `runTokenAuth` — but `workflow_runs`
-- carries no `tenant_id` and no RLS policy at all, so that match alone
-- proves nothing to Postgres. What it DOES legitimately establish is one
-- fact: "this connection holds a verified token for a run whose
-- `workflow_id` is X" — and `workflows` (ownership-derived, no `tenant_id`
-- column) is exactly the table that match needs to read next, to resolve
-- the run's tenant via `app_owner_tenant()`. Same "prove identity via an
-- external check, then read the one row that reveals your tenant" shape as
-- 0028/0029 — see docs/architecture/TENANT_ISOLATION_RLS.md §2e — just a
-- third kind of proof: a foreign key value that arrived via an
-- RLS-independent, already-verified lookup, not a primary key or a token
-- hash.
--
-- `app.current_workflow_id` must ONLY ever be set to a `workflow_id` that
-- was itself obtained from a row already legitimately reached — a run found
-- by verified token match (`workflow_runs`, unprotected), never from
-- unauthenticated request input directly. A bare workflow id is not a
-- secret; the trust here comes entirely from HOW the id was obtained, not
-- from the id's value.
--
-- Deliberately NOT added to WITH CHECK: this unlocks a read that then
-- resolves and pins the real tenant (`WorkflowTenantResolver
-- .resolveForWorkflowId`, `setCurrentTenantId`) for the rest of the request;
-- no write ever depends on the self-id clause once that normal mechanism
-- takes over.
--
-- 0001/.../0027 are applied and immutable — this recreates `workflows`'
-- policy again, adding the OR clause to USING only. Idempotent: DROP POLICY
-- IF EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('workflows') IS NULL THEN
    RAISE EXCEPTION 'RLS self-identification fix (0030): expected table workflows to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON workflows;
  CREATE POLICY tenant_isolation ON workflows
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)
                  = app_current_tenant()
      END
      OR id = NULLIF(current_setting('app.current_workflow_id', true), '')::uuid
    )
    WITH CHECK (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)
                  = app_current_tenant()
      END
    );
END $$;
--> statement-breakpoint

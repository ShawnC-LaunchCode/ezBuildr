-- ============================================================================
-- 0028 — Self-identification read clause on `users` (RLS-5)
-- ============================================================================
-- Found running the RLS-5 suite as the restricted role, one layer behind the
-- NULL-tenant fix (0027): once registration/tenant-assignment writes stopped
-- being blocked, the VERY NEXT request broke differently — "User does not
-- have a tenant assigned" — because `hybridAuth`'s own identity re-hydration
-- could no longer see the user it had just authenticated.
--
-- `server/middleware/auth.ts`'s `attachUserToRequest` (JWT strategy) and
-- `cookieStrategy` both re-read the user's own row from the DB to get its
-- authoritative role/tenant, and that read necessarily runs BEFORE any tenant
-- is known — establishing it IS the point of the read
-- (`setCurrentTenantId(authReq.tenantId)` runs only after it succeeds). Under
-- `users`' ordinary tenant-scoped policy, with no tenant pinned, that SELECT
-- is blocked for any user whose `tenant_id` is a real (non-null) value —
-- which is every authenticated user past their first bootstrap moment. That
-- makes this the single largest RLS-5 finding: it breaks EVERY
-- `hybridAuth`/`requireUser` route in the app, not one feature.
--
-- This is the same "prove identity, then discover tenant" shape as RLS-4's
-- precondition 2 (signature/upload token bootstrap) — see
-- docs/architecture/TENANT_ISOLATION_RLS.md for the general pattern this
-- migration is the first instance of.
--
-- Fix: one narrow, READ-ONLY escape clause — a connection may see the ONE row
-- whose id matches `app.current_user_id`, a GUC the app must set ONLY after
-- verifying the caller's identity proof (a JWT signature, a valid session —
-- never unauthenticated input; the clause trusts this value completely and
-- provides no isolation of its own). Deliberately NOT added to WITH CHECK:
-- every real write to a user's own row (registration, tenant assignment,
-- Google upsert) already runs inside a proper `withTenant`-scoped
-- transaction once the target tenant is known, so there is no legitimate
-- write this bootstrap path needs — keeping it read-only keeps the surface
-- this migration opens as small as what the problem actually requires.
--
-- 0001/.../0027 are applied and immutable — this recreates `users`' policy
-- again, adding the OR clause to USING only. Idempotent: DROP POLICY IF
-- EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('users') IS NULL THEN
    RAISE EXCEPTION 'RLS self-identification fix (0028): expected table users to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON users;
  CREATE POLICY tenant_isolation ON users
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR id = NULLIF(current_setting('app.current_user_id', true), '')
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

-- ============================================================================
-- 0035 — Branding-domain bootstrap read on `tenant_domains` (RLS-4 precondition 2)
-- ============================================================================
-- `BrandingService.getBrandingByDomain` answers "a browser arrived on
-- custom-domain X — whose branding does it get?". That runs for an
-- UNAUTHENTICATED visitor before any tenant is known, and resolving the tenant
-- is the entire point of the call. Same bootstrap family as migration 0032's
-- `app.current_login_email` on `users`: an unauthenticated request presents an
-- identifier and needs the one row that names its tenant.
--
-- The clause is strictly NARROWER than the query it serves — it repeats the
-- `verified` requirement, so SEC-026 ("a tenant cannot influence branding for a
-- domain it has not proven it owns") is now enforced by the database and not
-- only by the service's WHERE clause. An unverified or squatted domain is
-- invisible through this clause, exactly as if unregistered.
--
--   * `domain` carries a global UNIQUE constraint
--     (`tenant_domains_domain_unique`), so this is at most one row.
--   * USING only. Adding a domain, verifying one and deleting one all run
--     tenant-scoped through the authenticated settings routes; no write
--     depends on this clause.
--   * The GUC must only ever be set to the hostname the request arrived on,
--     via `withVerifiedIdentifier('app.current_branding_domain', …)`.
--
-- Deliberately NOT extended to `BrandingService.isDomainAvailable`, the other
-- tenant-less read in that file. That one asks a GLOBAL question ("is this
-- hostname taken by anyone?") which no single-row clause can answer honestly,
-- so it was converted to a tenant-scoped check instead and the UNIQUE
-- constraint became the authority — which is also the fix for a TOCTOU race
-- the pre-check always had.
--
-- 0001/.../0034 are applied and immutable — this recreates `tenant_domains`'
-- policy, adding the OR clause to USING only. Idempotent: DROP POLICY IF
-- EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('tenant_domains') IS NULL THEN
    RAISE EXCEPTION 'RLS branding lookup (0035): expected table tenant_domains to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON tenant_domains;
  CREATE POLICY tenant_isolation ON tenant_domains
    USING (
      tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR (
        verified
        AND domain = NULLIF(current_setting('app.current_branding_domain', true), '')
      )
    )
    WITH CHECK (
      tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

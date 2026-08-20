-- ============================================================================
-- 0029 — Self-identification read clause on `signature_requests` (RLS-4 precondition 2)
-- ============================================================================
-- `SignatureRequestService.getSignatureRequestByToken` (public signing
-- portal) does a bootstrap SELECT by token — the hashed token IS the
-- authorization, and the row's own tenant_id then drives every write. That
-- read runs before any tenant is known: this is the same "prove identity,
-- then discover tenant" shape as `users`' self-identification clause
-- (migration 0028) — see docs/architecture/TENANT_ISOLATION_RLS.md §2e for
-- the general pattern this is the second application of.
--
-- The token is hashed before storage (`hashToken()`,
-- server/services/SignatureRequestService.ts) exactly the way this codebase
-- already hashes refresh tokens, so the identifier here is a hash-equality
-- match rather than a primary-key match: a connection may see the ONE row
-- whose stored `token` equals `app.current_signing_token` — a GUC the app
-- must set to the HASH of a token it received, computed locally, never
-- trusting an unverified value (the row is `unique` on `token`, so this is
-- exactly one row or none, same narrowness as the primary-key case).
--
-- Deliberately NOT added to WITH CHECK: the write side already opens its own
-- `withTenant(request.tenantId, ...)` transaction once the tenant is
-- discovered (`signDocument`/`declineSignature`/the expiry-marking branch in
-- `getSignatureRequestByToken` itself), so no write ever depends on the
-- token-hash clause — same reasoning as `users`' 0028.
--
-- 0001/.../0027 are applied and immutable — this recreates
-- `signature_requests`' policy again, adding the OR clause to USING only.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('signature_requests') IS NULL THEN
    RAISE EXCEPTION 'RLS self-identification fix (0029): expected table signature_requests to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON signature_requests;
  CREATE POLICY tenant_isolation ON signature_requests
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR token = NULLIF(current_setting('app.current_signing_token', true), '')
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

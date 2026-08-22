-- ============================================================================
-- 0036 — Provider-envelope bootstrap read on `signature_requests`
-- ============================================================================
-- The DocuSign Connect webhook (`server/routes/esign.routes.ts`,
-- `/webhook/docusign`) is called by DocuSign, not by a logged-in user, and it
-- carries no run id — `SignatureBlockService.handleSignatureCallback` is
-- invoked with `runId: undefined`, so its usual `resolveTenantForRun` path
-- yields nothing and the whole callback ran unscoped. Under enforcement the
-- envelope's row was invisible, the lookup threw "Signature request for
-- envelope … not found", and the route answered 500 — which tells DocuSign
-- Connect to RETRY, so a permanently failing delivery is retried forever.
--
-- The only identifier the webhook holds is `provider_request_id` (the DocuSign
-- envelope id), so that is what this clause is keyed on. Third application of
-- the pattern on this table's family; see docs/architecture/TENANT_ISOLATION_RLS.md §2e.
--
-- THE PROOF HERE IS STRONGER THAN 0034's, and it is worth being precise about
-- why. Migration 0034 (`connections`) had to grant a read keyed on an
-- unverified capability, because the Stripe signature cannot be checked until
-- after the row naming the webhook secret has been read. DocuSign is the
-- opposite: `provider.verifyWebhookSignature(rawBody, …)` runs BEFORE this
-- lookup and rejects with 401 on failure, so by the time the GUC is set the
-- caller has already proven possession of DocuSign's HMAC key. The envelope id
-- is not being trusted on its own.
--
-- Containment:
--   * USING only. The status update and the lifecycle-event insert that follow
--     are ordinary tenant-scoped writes — the caller re-opens `withTenant()`
--     with the tenant this read reveals. No write is reachable through it.
--   * `provider_request_id` identifies at most the envelope's own rows.
--   * The GUC must only ever be set to an envelope id from a webhook payload
--     whose signature has already been verified.
--
-- Extends 0029's policy rather than replacing it: the signing-token clause is
-- carried through unchanged. 0001/.../0035 are applied and immutable.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('signature_requests') IS NULL THEN
    RAISE EXCEPTION 'RLS envelope lookup (0036): expected table signature_requests to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON signature_requests;
  CREATE POLICY tenant_isolation ON signature_requests
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR token = NULLIF(current_setting('app.current_signing_token', true), '')
      OR provider_request_id = NULLIF(current_setting('app.current_envelope_id', true), '')
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

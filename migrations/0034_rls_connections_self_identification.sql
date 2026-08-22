-- ============================================================================
-- 0034 — Self-identification read clause on `connections` (RLS-4 precondition 2)
-- ============================================================================
-- Two entry points resolve a connection with NO tenant in context, because
-- neither carries a session:
--
--   1. `POST /api/integrations/stripe/webhook/:connectionId`
--      (`StripePaymentService.handleWebhook` -> `getConnectionById`) — Stripe
--      calls this, not a logged-in user.
--   2. `GET /api/connections/oauth/callback`
--      (`connections-v2.routes.ts` -> `getConnectionById`) — the provider
--      redirects the browser here; the signed state carries only a
--      `connectionId`.
--
-- Both then need the row's `project_id`/`tenant_id` to do anything else. Under
-- enforcement that bootstrap read returns zero rows, so the Stripe webhook
-- 500s on every delivery and OAuth authorization can never be completed —
-- measured, not predicted, in `tests/integration/legal-integrations.routes.test.ts`.
--
-- HOW THIS DIFFERS FROM 0029, AND WHY IT IS STILL THE NARROWEST OPTION:
-- 0029's `app.current_signing_token` is a HASHED SECRET — the hash match *is*
-- the authorization, verified locally before the read. That is not available
-- here: the Stripe signature can only be checked AFTER the row is read,
-- because the row is what names the webhook secret. So this clause grants a
-- read keyed on a value that arrives, unverified, from request input — the
-- thing migration 0030's comment warns against for `workflows`.
--
-- The warning does not transfer, for one specific reason: a workflow id is not
-- a secret (it sits in builder URLs and is shared freely inside a tenant),
-- whereas a connection id IS the webhook URL's capability. It is a v4 UUID this
-- app generates, disclosed only to the payment provider and to members of the
-- owning tenant. Guessing one cross-tenant is guessing 122 bits.
--
-- Containment, given that it is a capability rather than a proof:
--   * USING only — never WITH CHECK. Every write still requires the real
--     tenant, which both callers pin with `withTenant(...)` once they have
--     resolved it from this read.
--   * Exactly one row (`id` is the primary key), never a listing.
--   * The row's secrets are NOT exposed by it: `secret_refs` holds key NAMES,
--     `oauth_state` holds AES-256-GCM ciphertext, and the plaintext lives in
--     `secrets`, which this clause says nothing about.
--   * The GUC must only ever be set to a connection id taken from the request
--     path/signed state of exactly those two routes, via
--     `withVerifiedIdentifier('app.current_connection_id', ...)`.
--
-- The alternative designs were considered and are worse: `adminDb`'s BYPASSRLS
-- pool is contained to the admin console by `adminDb.containment.test.ts` and
-- widening it to webhooks deletes that containment, and putting a tenant id in
-- the webhook URL would pin a whole TENANT from unauthenticated input instead
-- of a single row.
--
-- 0001/.../0033 are applied and immutable — this recreates `connections`'
-- policy, adding the OR clause to USING only. Idempotent: DROP POLICY IF
-- EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('connections') IS NULL THEN
    RAISE EXCEPTION 'RLS self-identification fix (0034): expected table connections to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON connections;
  CREATE POLICY tenant_isolation ON connections
    USING (
      tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR id = NULLIF(current_setting('app.current_connection_id', true), '')::uuid
    )
    WITH CHECK (
      tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

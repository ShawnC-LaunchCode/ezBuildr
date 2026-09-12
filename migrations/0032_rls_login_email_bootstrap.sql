-- ============================================================================
-- 0032 — Login-email bootstrap clause on `users` (RLS-5)
-- ============================================================================
-- Found by the RLS-5 restricted-role run, one layer behind 0028 and in exactly
-- the way §6 of the handoff warns about: fixing `createTestUser`'s unscoped
-- UPDATE stopped the RLS violation, and the very next error was
-- `InvalidCredentials` on the login immediately after. Not a test artifact —
-- the front door itself.
--
-- `validateCredentials` (server/routes/auth.routes.ts) starts with
-- `userRepository.findByEmail(email)`. That read runs with no tenant pinned
-- (nobody is authenticated yet — authenticating is the point) AND no
-- `app.current_user_id` (the id is unknown; the email is all the caller gave
-- us). Against 0027/0028's policy that resolves to
--   tenant_id IS NOT DISTINCT FROM NULL  OR  id = NULL
-- so ANY user with a real (non-null) tenant_id is invisible, `findByEmail`
-- returns undefined, and every password login fails as "Invalid credentials".
-- Same for the Google OAuth by-email upsert, the registration duplicate check
-- and password reset. Under FORCE this is a total authentication outage —
-- broader than 0028, which at least only broke re-hydration for already-issued
-- tokens.
--
-- ⚠️ THIS IS THE WEAKEST OF THE FOUR SELF-IDENTIFICATION VARIANTS, and the
-- difference is deliberate and worth stating plainly rather than filing it
-- alongside the others as if it were equivalent:
--   0028 (users.id)                — the JWT signature is verified first
--   0029 (signature_requests.token)— the token hash IS the proof
--   0030 (workflows.id)            — the id came from a verified token match
--   0032 (users.email)  ← THIS ONE — NOTHING is verified. The caller typed it.
--
-- The justification is structural, not a claim of equivalent safety: a
-- credential cannot be checked without first reading the row that holds it, so
-- the authentication front door MUST be able to read one row it cannot yet
-- prove it is entitled to. What keeps this narrow:
--   * `users_email_idx` is UNIQUE, so this exposes exactly one row or none —
--     the same narrowness as a primary-key match, not a scan.
--   * It is READ-ONLY (never added to WITH CHECK), so it cannot write.
--   * It is transaction-local (`SET LOCAL` via withLoginEmail), so it cannot
--     bleed onto the pooled connection.
--   * It grants the app's own auth code no capability it does not already
--     exercise today: these call sites read that row unconditionally now.
--   * It is NOT a client-visible exposure — the row never leaves the server
--     except as whatever the endpoint already returned, and the existing
--     anti-enumeration handling in `validateCredentials` is unchanged.
--
-- What it DOES mean, stated so a later reader does not have to rediscover it:
-- any code that sets `app.current_login_email` can read that user's full row,
-- password hash included. Containment is therefore the control — only the
-- authentication paths may call `withLoginEmail`, the same contract
-- `withVerifiedIdentifier` documents for its GUC name.
--
-- ✅ RULED BY THE REPO OWNER 2026-08-20 — keep this clause as written.
-- It was raised explicitly, because the standing ruling scopes this pattern to
-- "identity known, tenant not yet" and here identity is CLAIMED, not known —
-- so this stretches the ruling rather than simply applying it. The owner chose
-- it over the alternative (a dedicated low-privilege auth connection that may
-- read `users` and nothing else, RLS-6's `adminDb` shape but narrower). That
-- alternative remains a clean future swap if containment-by-convention ever
-- feels too thin: it changes HOW the read is permitted, not any call site.
-- Do not relitigate without the owner.
--
-- 0001/.../0031 are applied and immutable — this recreates `users`' policy
-- again, adding the OR clause to USING only. Idempotent: DROP POLICY IF
-- EXISTS + CREATE POLICY, safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('users') IS NULL THEN
    RAISE EXCEPTION 'RLS login-email bootstrap (0032): expected table users to exist and it does not';
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON users;
  CREATE POLICY tenant_isolation ON users
    USING (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      OR id = NULLIF(current_setting('app.current_user_id', true), '')
      OR email = NULLIF(current_setting('app.current_login_email', true), '')
    )
    WITH CHECK (
      tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
END $$;
--> statement-breakpoint

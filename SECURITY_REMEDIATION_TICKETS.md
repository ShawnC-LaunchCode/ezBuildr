# Security Remediation Tickets — Round 2

**Created:** 2026-07-06
**Context:** Follow-up to the full Express route security audit. The Critical and all High-severity findings were remediated and verified closed. This document tracks the **remaining open and partially-completed items**. Fully-fixed findings are not repeated here.

**Numbering:** continues from SEC-019 (last committed).

## Triage — 2026-07-08

Re-verified every ticket against the current code. **12 of 14 are now closed**; only SEC-026 has real remaining work, and SEC-027 was not re-checked here (an active edit to `metrics.ts` was in flight in a parallel session). SEC-026, SEC-022, and SEC-029 carry per-ticket "Triage" notes below; the rest were confirmed closed at these locations:

- **SEC-020:** `intake.routes.ts:304-314` — now uses `validateMagicBytes` + `!scanResult.safe`/`scanResult.threatName` (the real `ScanResult` API).
- **SEC-021:** `testLimiter` on `lifecycleHooks.routes.ts:209`; `strictLimiter` on `finalBlock.routes.ts:85,262` and `runs.routes.ts:510` (generate-documents).
- **SEC-023:** `SignatureBlockService.findSignatureRequestByEnvelope` is a real `db.query` lookup; `esign.routes.ts:150-175` verifies access and the run binding.
- **SEC-024:** `tenant.routes.ts` POST reads only `{name, billingEmail}` and forces `plan: 'free'`.
- **SEC-025:** `public.routes.ts:96` idempotency guard returns before `markComplete` + webhook dispatch.
- **SEC-028:** `ai.doc.routes.ts` has Zod schemas (`variableObjectArraySchema.max(500)`, suggest-mappings/improvements).
- **SEC-030:** `auth.routes.ts` resend-verification returns one generic response for unknown/unverified/verified.
- **SEC-031:** `userPreferences.routes.ts:47` Zod `z.record` with key/value size caps.
- **SEC-032:** `blocks.routes.ts:273` `transformConfigSchema` validates the create-list-tools body.
- **SEC-033:** `esign.routes.ts:58` `redirectUrl` host allowlist (`localhost`, `ezbuildr.com`, `PUBLIC_URL`); `strictLimiter` on execute (`esign.routes.ts:92`).

| Ticket | Title | Severity | Status before | Status now (2026-07-08) |
|--------|-------|----------|---------------|--------------------------|
| SEC-020 | Intake upload virus-scan is broken (rejects all uploads) | **High (regression)** | Partial/broken | ✅ Closed |
| SEC-021 | Missing rate limits on code-exec & document-generation endpoints | Medium | Not started | ✅ Closed |
| SEC-022 | Trust-device requires no password/MFA re-verification | Medium | Not started | ✅ Closed (note test-env bypass) |
| SEC-023 | E-sign envelope→run binding check is inert (stub) | Medium | Partial | ✅ Closed |
| SEC-024 | `POST /api/tenants` allows client-controlled `plan` | Medium | Partial | ✅ Closed |
| SEC-025 | Public workflow-complete endpoint has no idempotency guard | Medium | Not started | ✅ Closed |
| SEC-026 | Custom domain registration lacks format + ownership verification | Medium | Not started | ⚠️ Partial — format done, **DNS ownership still missing** |
| SEC-027 | `/metrics` key via query string + non-timing-safe compare | Medium | Partial | ⏭️ Not re-checked (parallel edit in flight) |
| SEC-028 | AI-doc endpoints missing input validation | Medium | Partial | ✅ Closed |
| SEC-029 | Raw `error.message` leaked to clients (multiple routers) | Low | Not started | ✅ Closed (named routers converted; remainder dev-gated or intentionally unconverted) |
| SEC-030 | Account enumeration via resend-verification response shape | Low | Partial | ✅ Closed |
| SEC-031 | `PUT /api/preferences` stores unvalidated JSON, no size cap | Low | Not started | ✅ Closed |
| SEC-032 | `create-list-tools` block config unvalidated | Low | Not started | ✅ Closed |
| SEC-033 | E-sign `redirectUrl` has no host allowlist; no rate limit on execute | Low | Partial | ✅ Closed |

---

## SEC-020 — Intake upload virus-scan is broken (rejects all uploads)

- **Severity:** High (functional regression + security)
- **Location:** `server/routes/intake.routes.ts:~306`; `ScanResult` in `server/services/.../VirusScanner.ts:13-20`
- **Problem:** The virus-scan fix references fields that do not exist on `ScanResult`. The code checks `!scanResult.isClean` and `scanResult.threats`, but `ScanResult` only has `safe` and `threatName`. `!scanResult.isClean` (undefined) is always truthy, so **every intake upload is now rejected**. Fails closed for malware, but breaks the public intake upload feature entirely. TypeScript did not catch this (fields accessed on a loosely-typed value).
- **Additional gap:** Unlike `templates.routes.ts`, intake still does **not** call `validateMagicBytes`, so content-type spoofing is not caught.
- **Fix:**
  1. Change the check to the real API: `if (!scanResult.safe) { reject with scanResult.threatName }`.
  2. Add the `validateMagicBytes` step mirroring `templates.routes.ts:242-243`.
- **Acceptance criteria:**
  - A clean file uploads successfully through `POST /intake/upload`.
  - An EICAR test file is rejected with the threat name.
  - A file whose magic bytes don't match its extension is rejected.
  - A regression test covers the clean-upload path so this can't silently break again.

---

## SEC-021 — Missing rate limits on code-exec & document-generation endpoints

- **Severity:** Medium
- **Locations:**
  - `server/routes/lifecycleHooks.routes.ts:215` — `POST /api/lifecycle-hooks/:hookId/test` (runs sandboxed JS/Python)
  - `server/routes/finalBlock.routes.ts:81` — `POST /api/runs/:runId/generate-final`
  - `server/routes/finalBlock.routes.ts:241` — `POST /api/runs/:runId/preview/generate-final`
  - `server/routes/runs.routes.ts:528` — `POST /api/runs/:runId/generate-documents`
- **Problem:** These trigger sandboxed code execution or expensive PDF rendering (puppeteer/libreoffice) but carry only the global 1000/15min IP limiter. The analogous `POST /api/transform-blocks/:blockId/test` already applies `testLimiter` — this is inconsistent. The doc-generation variants are reachable by semi-public run-token holders.
- **Fix:** Apply `testLimiter` to the lifecycle-hook test route and `strictLimiter` (or a dedicated generation limiter) to the three document-generation routes. Pattern already exists in `transformBlocks.routes.ts:175`.
- **Acceptance criteria:** Each endpoint returns 429 after exceeding its limit; limits chosen to allow normal interactive use.

---

## SEC-022 — Trust-device requires no password/MFA re-verification

- **Severity:** Medium
- **Location:** `server/routes/auth.routes.ts:929` — `POST /api/auth/trust-device`
- **Problem:** Guarded only by `hybridAuth`. A stolen 15-minute access token can register the attacker's device fingerprint as trusted for 30 days, permanently suppressing MFA on future logins from that device. Compare `POST /api/auth/mfa/disable`, which correctly re-verifies the password.
- **Fix:** Require a fresh TOTP (or password) verification in the trust-device request, or only allow trusting a device inside the MFA verify-login flow itself.
- **Acceptance criteria:** Trusting a device without a fresh factor returns 401/403; trusting with a valid fresh TOTP succeeds.
- **Triage (2026-07-08):** ✅ **Closed.** `POST /api/auth/trust-device` now re-verifies a factor: when `user.mfaEnabled` it requires a valid TOTP `code` (`mfaService.verifyTotp`), otherwise it re-checks the password via `validateCredentials`. Note a `process.env.NODE_ENV !== 'test'` bypass around the password branch — harmless in prod but the same test-only-escape-hatch smell that SEC (ssrfValidator) was cleaned up for; prefer mocking in tests over a runtime env check.

---

## SEC-023 — E-sign envelope→run binding check is inert

- **Severity:** Medium
- **Location:** `server/routes/esign.routes.ts:153-171`; `findSignatureRequestByEnvelope` in `server/services/esign/SignatureBlockService.ts:302-312`
- **Problem:** The route now requires a `runId` and calls `verifyAccess(run.workflowId, userId, 'view')` — good — but the actual binding check `if (sigReq && sigReq.runId !== runId)` never fires because `findSignatureRequestByEnvelope` is a stub that always `return null`. A user authorized on run A can still read the status of an envelope belonging to run B by passing `runId=A`.
- **Fix:** Implement `findSignatureRequestByEnvelope(envelopeId)` to look up the signature request by envelope ID, then enforce that its `runId` matches the authorized run (reject otherwise).
- **Acceptance criteria:** Requesting an envelope whose `runId` differs from the supplied (authorized) run returns 403/404; matching run succeeds.

---

## SEC-024 — `POST /api/tenants` allows client-controlled `plan`

- **Severity:** Medium
- **Location:** `server/routes/tenant.routes.ts:253,269`
- **Problem:** The `PUT` was fixed (strict Zod, `plan` stripped), but `POST /api/tenants` still reads `plan` from `req.body` and writes `plan: plan || 'free'` with no Zod validation. A user can create a tenant on an arbitrary plan (e.g. `'enterprise'`) with no billing verification.
- **Fix:** Apply the same `.strict()` Zod schema used on the PUT (allow only `name`/`billingEmail`); force `plan` server-side (billing-webhook controlled).
- **Acceptance criteria:** Creating a tenant with `plan` in the body ignores/rejects it; created tenants always start on the default plan.

---

## SEC-025 — Public workflow-complete endpoint has no idempotency guard

- **Severity:** Medium
- **Location:** `server/routes/public.routes.ts:63-119` (webhook dispatch at ~110)
- **Problem:** The endpoint validates the run token and expiry (no IDOR), but never checks run status. A valid run-token holder can call it repeatedly and re-dispatch the `run.completed` webhook each time — abuse/amplification against downstream webhook consumers.
- **Fix:** Guard on run status — reject (or no-op) if the run is already completed, and write back completion state so the webhook fires at most once per run.
- **Acceptance criteria:** Second and subsequent calls for an already-completed run do not dispatch another `run.completed` webhook.

---

## SEC-026 — Custom domain registration lacks format + ownership verification

- **Severity:** Medium
- **Location:** `server/routes/branding.routes.ts:132-133`; `BrandingService.addDomain` at `BrandingService.ts:138-159`
- **Problem:** `domain: z.string().min(1)` accepts any string; `addDomain` only lowercases and inserts with a first-come duplicate check. A tenant can pre-register/squat any third party's domain, enabling branding spoofing if that domain is ever pointed at the platform (domain resolves tenant branding via `domainTenant` middleware).
- **Fix:** Validate hostname format, and require DNS TXT-record ownership verification before a domain becomes active.
- **Acceptance criteria:** Malformed hostnames rejected; a domain stays inactive until a TXT challenge is verified.
- **Triage (2026-07-08):** ⚠️ **Partial.** Hostname format is now validated in `branding.routes.ts` (`z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)` on `POST /api/tenants/:tenantId/domains`), so the first acceptance criterion is met. **DNS TXT ownership verification is still not implemented** — `BrandingService.addDomain` only checks availability (`isDomainAvailable`) and inserts the domain as immediately usable, so a tenant can still register a domain it does not own. Remaining work is a real feature, not a pattern-copy: a domain-status/verification-token schema change (deferred — needs the schema-decision sign-off), a challenge issue + `dns.resolveTxt` verify endpoint, and gating branding resolution on `verified`. Also clean up the leftover AI-authored scratch comments in the POST handler (`branding.routes.ts:135-139`, "Actually, importing schema is better…").
- **Re-verify (2026-07-10):** ✅ **Both acceptance criteria now met — recommend Close** (the 2026-07-08 triage above is stale). The DNS-verification feature is fully implemented and the earlier "still not implemented" note no longer reflects the code:
  - Schema change shipped — `tenant_domains.verified` + `tenant_domains.verification_token` exist (`shared/schema/auth.ts:171-172`).
  - `BrandingService.addDomain` (`BrandingService.ts:143-158`) now inserts `verified: false` with a random `verificationToken`.
  - Verify endpoint exists — `POST /api/tenants/:tenantId/domains/:domainId/verify` (`branding.routes.ts:184-189`), gated by `hybridAuth` + `requirePermission('tenant:update')`.
  - `verifyDomain` (`BrandingService.ts:222-268`) resolves the `_ezbuildr-challenge.<domain>` TXT record via `dns.resolveTxt`, joins multi-string chunks before comparing, scopes `domainId` to `tenantId` (403 on mismatch), and only then sets `verified: true`.
  - Branding resolution is gated — `getBrandingByDomain` (`BrandingService.ts:94-105`) filters `eq(tenantDomains.verified, true)`, so unverified/squatted domains behave as unregistered.
  - Scratch comments in the POST handler are gone.
  - **One residual gap tracked separately as SEC-045** (squat-to-deny + missing rate limit) — not part of this ticket's acceptance criteria, so it does not block closing SEC-026.

---

## SEC-027 — `/metrics` key via query string + non-timing-safe compare

- **Severity:** Medium
- **Location:** `server/routes/metrics.ts:25-32`
- **Problem:** Now fails closed in production if `METRICS_API_KEY` is unset (good), but the key is still accepted via `req.query.apiKey` (lands in access logs/proxies) and compared with `!==` (not constant-time).
- **Fix:** Accept the key only via a request header; compare with `crypto.timingSafeEqual`.
- **Acceptance criteria:** Query-string key is no longer honored; comparison is constant-time; missing key in prod returns 401.

---

## SEC-028 — AI-doc endpoints missing input validation

- **Severity:** Medium
- **Location:** `server/routes/ai.doc.routes.ts:182,198` — `POST /api/ai/doc/suggest-mappings`, `/suggest-improvements`
- **Problem:** `strictLimiter` was added (rate limit ✅), but the bodies are still destructured raw (`const { templateVariables, workflowVariables } = req.body`) and passed straight to the Gemini-backed service with no shape/size validation.
- **Fix:** Add Zod schemas for both request bodies (bound array sizes/string lengths to control model cost).
- **Acceptance criteria:** Malformed/oversized bodies rejected with 400 before any AI call.

---

## SEC-029 — Raw `error.message` leaked to clients

- **Severity:** Low
- **Locations:** `server/routes/teams.routes.ts` (109,116,149,175,211,241), `organizations.routes.ts` (~14 sites incl. 58), `account.routes.ts` (29,64), `connections-v2.routes.ts` (94,119,170,217,242,269,289,339,412), `collections.routes.ts` (~17 handlers), `datavault.routes.ts` (multiple), `dataSource.routes.ts:169`
- **Problem:** These return `error instanceof Error ? error.message : ...` directly in the response body, leaking internal service/DB/driver error text on the 500 path.
- **Fix:** Return a generic message for unknown errors; only pass through messages for known/whitelisted error classes. Log full detail server-side. Consider centralizing in the existing error-handler middleware.
- **Acceptance criteria:** 500 responses contain no internal error text; details still logged server-side.
- **Triage (2026-07-08):** ✅ **Closed** for the security concern. The named routers (`teams`, `account`, `connections-v2`, `collections`, `datavault`, `dataSource`, `organizations`) no longer emit raw `error.message` on the 500 path (0 matches). The ~27 remaining `error.message` uses in responses are either (a) gated behind `process.env.NODE_ENV === 'development'` (undefined in prod), or (b) in `snapshots`/`secrets`/`esign` — intentionally left on their own known-error (404/409) handling per the route-error-classification convention. One ungated pass-through remains at `esign.routes.ts:359` (`error: … ? error.message : String(error)`) — low-risk but worth folding into the generic path if that router is revisited.

---

## SEC-030 — Account enumeration via resend-verification

- **Severity:** Low
- **Location:** `server/routes/auth.routes.ts:467,470`
- **Problem:** Register was fixed to return an identical shape, but resend-verification still returns a generic 200 for a non-existent email while an existing already-verified account returns a distinct 400 `"Email already verified"`, revealing account existence.
- **Fix:** Return an identical generic response regardless of whether the account exists or is already verified.
- **Acceptance criteria:** Responses for unknown, unverified, and already-verified emails are indistinguishable.

---

## SEC-031 — `PUT /api/preferences` stores unvalidated JSON, no size cap

- **Severity:** Low
- **Location:** `server/routes/userPreferences.routes.ts:47-49`; `UserPreferencesService.ts:27-29`
- **Problem:** `req.body` is passed straight to an upsert with no Zod schema and no size cap beyond the global 10 MB body limit (scoped to the caller's own user, so impact is limited).
- **Fix:** Add a Zod schema for the allowed preference keys and a reasonable size cap.
- **Acceptance criteria:** Unknown keys rejected; oversized payloads rejected with 400.

---

## SEC-032 — `create-list-tools` block config unvalidated

- **Severity:** Low
- **Location:** `server/routes/blocks.routes.ts:270-347`
- **Problem:** `const { sourceListVar, transformConfig, sectionId } = req.body` with only truthiness checks; `transformConfig.filters/sort/limit/...` copied verbatim into block config. Ownership is enforced in `listToolsBlockService.createBlock`, so impact is limited to malformed self-owned config.
- **Fix:** Add a Zod schema for the body, including the `transformConfig` shape.
- **Acceptance criteria:** Malformed config rejected with 400 before persistence.

---

## SEC-033 — E-sign `redirectUrl` host allowlist + execute rate limit

- **Severity:** Low
- **Location:** `server/routes/esign.routes.ts:57-64` (redirectUrl), `esign.routes.ts:83` (`POST /api/esign/execute/:runId/:stepId`)
- **Problem:** `redirectUrl` now uses `z.string().url().refine(...)` restricting to http/https (✅), but there is no allowlist of permitted hosts — any valid https URL passes, leaving an open-redirect vector for signers. Separately, the execute endpoint (triggers provider envelope/email sends) has no rate limiter.
- **Fix:** Restrict `redirectUrl` to an allowlist of trusted hosts (or the platform's own origin). Apply `strictLimiter` to the execute route.
- **Acceptance criteria:** Off-allowlist redirect URLs rejected; execute endpoint returns 429 past its limit.

---

## SEC-045 — Custom-domain squat-to-deny + no rate limit on domain add/verify (follow-up to SEC-026)

- **Severity:** Low–Medium
- **Location:** `shared/schema/auth.ts:170` (`domain: text("domain").notNull().unique()`); `BrandingService.isDomainAvailable` / `addDomain` (`BrandingService.ts:143-158, 273+`); `branding.routes.ts:122-189` (add + verify endpoints)
- **Problem:** SEC-026 closed the *spoofing* half of its stated threat (unverified domains no longer resolve branding). It did **not** close the *squatting* half, which the SEC-026 problem statement explicitly names ("a tenant can pre-register/squat any third party's domain"). Because `domain` is globally unique and `isDomainAvailable` rejects any already-registered domain regardless of `verified` status, a tenant can register `victim.com` **unverified** and permanently block the legitimate owner from ever adding it — a denial-of-registration. There is no expiry on unverified rows, so the squat is indefinite. Separately, neither the add nor the verify endpoint has a rate limiter, and `verifyDomain` performs an outbound `dns.resolveTxt` on each call — an authenticated user can drive unbounded DNS lookups.
- **Fix:**
  1. Do not let an **unverified** registration block another tenant from registering the same domain — e.g. scope the uniqueness/availability check to `verified = true`, and/or expire unverified rows after a short TTL (a background sweep or a check at insert time). Only a verified claim should lock a domain globally.
  2. Add a rate limiter (`strictLimiter` or equivalent) to both `POST /api/tenants/:tenantId/domains` and `.../:domainId/verify`.
  3. Minor: make `tenant_domains.verified` `NOT NULL DEFAULT false` (currently nullable, `shared/schema/auth.ts:171`); it is fail-safe today only because resolution filters `verified = true`, but the nullability is inconsistent with `users.email_verified`.
- **Acceptance criteria:**
  - An unverified registration of a domain by tenant A does not prevent tenant B from registering (and verifying) the same domain.
  - A domain locked by tenant A only when A has verified ownership.
  - Both endpoints return 429 past their limit.
  - `tenant_domains.verified` is non-nullable.

---

## Notes for the team

- **Testing gap:** SEC-020 shipped past a green `tsc --noEmit`. Recommend a route-level integration test for the intake upload happy-path (and ideally the other upload paths) so a fields-mismatch like this fails CI rather than production.
- **Pattern reuse:** SEC-021, SEC-024, SEC-027, SEC-028, SEC-029 all have a correct implementation elsewhere in the codebase (`testLimiter`, strict tenant schema, `templates.routes.ts` upload path, the error-handler middleware) — copy those rather than inventing new ones.
- Not included here (verified already fixed): billing auth, MFA verify-login, webhook SSRF, workflow PUT mass-assignment, logic-rules IDOR, final-document download IDOR, DataVault ACL + token minting, email-template cross-tenant write, personalization settings mass-assignment, blueprint cross-project write, run shareToken mass-assignment, optimize/transform validation+limits, external run-ID randomness, and deletion of the dead route files (system/oauth/admin/marketplace/sharing/signatures).

# Proactive Hardening Tickets — Round 3 (things not previously asked for)

Source: proactive security review, 2026-07-11, **re-verified same day** against the
actual code paths. Focus is areas the prior passes (route-layer SSRF/mass-assignment,
data-layer SEC-101..123, round-2 route audit SEC-020..045, AI-surface SEC-035..044)
did not cover: supply chain, file-content handling, CI security gates, tenant-isolation
depth, and prod/dev config drift.

## ⚠️ Re-verification note — read this first

The first draft of this doc had three findings that were **wrong** because the audit
initially read `server/index.ts`. That file is the **dev** server only
(`"dev": "... tsx server/index.ts"`). Production is built from **`server/production.ts`**
(`"build": "... esbuild server/production.ts ... --outfile=dist/index.js"`,
`"start": "node dist/index.js"`). The two have drifted — see **SEC-055**, which
replaces the withdrawn SEC-052 and is the single most important item here.

### Verdict on the first-draft tickets

| Draft ID | Verdict | Disposition |
|---|---|---|
| SEC-046 (dep CVEs + no CI scanning) | ✅ Correct | Kept below, unchanged |
| SEC-047 (upload content validation) | ⚠️ Right idea, wrong citations | **Rewritten** below |
| SEC-048 (CAPTCHA "wired into nothing") | ❌ Wrong | **Withdrawn** — see note + SEC-053 |
| SEC-049 (CI gates advisory) | ✅ Correct | Kept below, unchanged |
| SEC-050 (no key version tag) | ❌ Wrong | **Withdrawn** — see note + SEC-054 |
| SEC-051 (tenant isolation depth) | ✅ Correct | Kept below, unchanged |
| SEC-052 (CSP "dead config") | ❌ Backwards | **Withdrawn** — replaced by SEC-055 |

**Why the three were wrong:**
- *SEC-048* — CAPTCHA **is** wired into login. `auth.routes.ts:280` (and `:429`)
  gate on `accountLockoutService.getGlobalFailedAttempts(email)` — an
  **IP-independent** per-account counter — and demand a server-validated CAPTCHA
  after 3 failures. The code even carries a `// SEC-048` marker. The IP-rotation
  bypass the draft claimed is already closed. (Residual weakness → SEC-053.)
- *SEC-050* — Crypto-agility already exists: `encrypt()` tags ciphertext with a
  `v1.` version prefix ([encryption.ts:73](../../server/utils/encryption.ts)) and
  decryption handles legacy + `v1.`. The "no version tag" premise is false, and
  `SEC-050` is already an in-code ticket id. (Residual → SEC-054.)
- *SEC-052* — `production.ts` is not dead code; it is the prod entrypoint, and it
  **omits** the tuned CSP. The genuinely-dead file is
  `server/middleware/securityHeaders.ts` (imported nowhere). Reframed as SEC-055.

Numbers `SEC-048` and `SEC-050` are already used in the codebase for other work, so
the corrected tickets are numbered **SEC-053..055** to avoid collisions.

## Completion status (re-checked 2026-07-11, after concurrent fixes landed)

| ID | Status | Note |
|---|---|---|
| SEC-046 | ✅ Closed (gate green) | Removed 3 dead deps (jspdf, jspdf-autotable, expr-eval) → critical+1 high gone; remaining 3 = one unreachable OTel advisory, allowlisted → SEC-056 |
| SEC-047 | ✅ Closed | Magic-byte validation on all 3 upload routes; inline-serving resolved |
| SEC-049 | ✅ Closed (guard green) | reCAPTCHA call routed through `safeFetch`; no raw `fetch` in `server/` |
| SEC-051 | 🟢 RLS foundation landed (Phase 1–2); enforcement rollout is staged | Policies defined on 24 tables + pooler-safe runtime context + full docs; enforcement deliberately deferred |
| SEC-053 | ✅ Closed | Token now carries a keyed hash, not the answer; reCAPTCHA required in prod when configured |
| SEC-054 | ✅ Closed | `VL_KEYS` multi-key + retired keys + `scripts/rotateMasterKey.ts` |
| SEC-055 | ✅ Closed | Shared `securityConfig.ts` used by both entrypoints; `securityHeaders.ts` deleted |

## What was checked and is already solid (no ticket)

- **Auth lifecycle** — 15-min HS256 access tokens (alg-pinned); refresh-token
  rotation with reuse-detection that revokes the whole session family
  ([AuthService.ts:417](../../server/services/AuthService.ts)); logout revokes
  server-side ([auth.routes.ts:508](../../server/routes/auth.routes.ts)); refresh
  cookie `httpOnly`+`secure`+`sameSite=strict`.
- **Credential-stuffing** — layered: (email+IP) lockout after 5
  ([AccountLockoutService.ts:44](../../server/services/AccountLockoutService.ts))
  **plus** IP-independent CAPTCHA after 3 global failures
  ([auth.routes.ts:280](../../server/routes/auth.routes.ts)). See SEC-053 for the
  residual weakness, but the design is sound.
- **Password policy** — zxcvbn min-score 3, 8–128 length ([config/auth.ts:220](../../server/config/auth.ts)).
- **Encryption** — AES-256-GCM, random IV, versioned (`v1.`) ciphertext
  ([encryption.ts](../../server/utils/encryption.ts)).
- **Sandbox** — `isolated-vm`; insecure `vm` fallback fails closed in production
  ([enhancedSandboxExecutor.ts:96](../../server/utils/enhancedSandboxExecutor.ts)).
- **Authorized file download** — `/api/files/download/:filename` enforces auth,
  path-traversal filtering, DB ownership/ACL, attachment disposition
  ([files.routes.ts:38](../../server/routes/files.routes.ts)).
- **CORS** — identical deny-by-default allowlist in **both** entrypoints
  ([production.ts:64](../../server/production.ts)).

---

# OPEN TICKETS

## SEC-046 — Production dependency CVEs unremediated; no dependency/secret scanning in CI — P1

> **STATUS 2026-07-11 — ✅ CLOSED (gate now green).** Resolved by removing three
> **unused** direct deps — `jspdf`, `jspdf-autotable` (app uses `pdf-lib`), and
> `expr-eval` (imported nowhere) — which cleared the jspdf **critical** (path
> traversal) and the expr-eval **high** (prototype pollution) at the root rather
> than by allowlisting. The remaining 3 highs all trace to a single advisory
> (GHSA-q7rr-3cgh-j5r3, Prometheus-exporter HTTP crash) that is **not reachable**
> here because `telemetry.ts` sets `preventServerStart: true`; it is documented in
> [.audit-allowlist.json](../../.audit-allowlist.json) with an expiry and a follow-up
> (**SEC-056**). The CI step now runs [scripts/ci/audit-check.mjs](../../scripts/ci/audit-check.mjs),
> which fails on any high/critical **not** in that allowlist (so new vulns still block).

**Evidence:**
- `npm audit --omit=dev` reports **95 production vulnerabilities: 4 critical, 16
  high, 75 moderate**, concentrated in `@aws-sdk/*`, `@opentelemetry/*`, `@grpc/grpc-js`.
- No `.github/dependabot.yml`; [ci.yml](../../.github/workflows/ci.yml) has no
  `npm audit`, CodeQL, Snyk, Semgrep, or secret-scanning step.

**Acceptance criteria:**
- [ ] CI step that **fails the build** on new high/critical advisories
      (`npm audit --omit=dev --audit-level=high`, CodeQL, or Snyk).
- [ ] `.github/dependabot.yml` (or Renovate) for npm + GitHub Actions.
- [ ] Triage the 20 high/critical: upgrade the affected packages; record a
      justified allowlist for any left unpatched (transitive + unreachable).
- [ ] `npm audit --omit=dev --audit-level=high` exits clean (or against the allowlist).
- [ ] GitHub secret scanning and/or pre-commit `gitleaks` so
      `VL_MASTER_KEY`/`JWT_SECRET`/provider keys cannot be committed.

---

## SEC-047 — File uploads accepted on extension only; content is not sniffed, and virus scanning is off by default — P2 *(rewritten)*

> **STATUS 2026-07-11 — ✅ CLOSED.** `validateMagicBytes` now runs on all three
> live upload routes (`intake.routes.ts:305`, `ai.doc.routes.ts:164,209`,
> `templates.routes.ts:243,395`), rejecting extension/content mismatch. The
> `finalBlock.routes.ts` inline `sendFile` is gone. Residuals folded into SEC-020:
> `ENABLE_VIRUS_SCANNING` defaults off (content is validated but not AV-scanned
> unless enabled in prod), and the unused `fileService.ts` multer `upload` can be
> deleted as cleanup.

**Files:** [server/routes/intake.routes.ts:21-36,311](../../server/routes/intake.routes.ts),
[server/routes/ai.doc.routes.ts:45](../../server/routes/ai.doc.routes.ts),
[server/routes/templates.routes.ts:55](../../server/routes/templates.routes.ts),
[server/services/security/VirusScanner.ts](../../server/services/security/VirusScanner.ts)

**Problem (corrected):** The live upload paths each define their own multer instance;
`intake.routes.ts` (the public, bearer-token surface) filters purely on the
**file extension** taken from the client-supplied `originalname`
([intake.routes.ts:26-35](../../server/routes/intake.routes.ts)) — no MIME check and
no magic-byte/content sniffing. Two mitigations exist and lower the severity from the
original draft: multer `dest` mode stores files under random names with no extension,
and the handler does call `virusScanner().scan()`
([intake.routes.ts:311](../../server/routes/intake.routes.ts)). **But** the scanner
defaults to `NoOpVirusScanner` (always-safe) unless `ENABLE_VIRUS_SCANNING=true`
(this is the SEC-020 concern), so in a default deployment a file's *content* is never
validated at all — only its claimed extension. The earlier draft mis-cited
`server/services/fileService.ts`, whose exported multer `upload` appears unused (only
`MAX_FILE_SIZE` is imported elsewhere); confirm and delete it if dead.

**Acceptance criteria:**
- [ ] Validate actual content (magic-byte sniff, e.g. `file-type`) against the
      allowlist on every live upload route; reject when sniffed type ≠ claimed
      extension.
- [ ] Confirm `ENABLE_VIRUS_SCANNING` is on in production (or document the accepted
      risk); align with SEC-020.
- [ ] Confirm no upload path persists active content (`.html`, `.svg`, `.xml`, `.js`)
      that is later served inline; the archive/output serving in
      `finalBlock.routes.ts` (`res.sendFile`, inline) should set
      `Content-Disposition: attachment` like `files.routes.ts` does.
- [ ] Delete `fileService.ts`'s multer `upload`/`fileFilter` if confirmed unused, so
      the only upload validators are the live ones.
- [ ] Tests: HTML payload named `x.png` → rejected; genuine PNG → accepted.

---

## SEC-049 — CI security gates are advisory; no guardrail against `fetch`/SSRF regressions — P2

> **STATUS 2026-07-11 — ✅ CLOSED (guard now green).** The reCAPTCHA call in
> `CaptchaService.ts` was routed through `safeFetch` instead of raw `fetch`, so the
> SSRF Guard grep finds no raw `fetch(` in `server/` and the build passes. The gate
> mechanism (CI grep + `no-restricted-globals` ESLint rule + blocking
> `check:strict-zones`) is otherwise unchanged. Note: full-project lint remains
> advisory by design (documented tsc/eslint debt); only strict zones block.

**Files:** [.github/workflows/ci.yml:17-36](../../.github/workflows/ci.yml),
[docs/architecture/SECURITY_THREAT_MODEL.md §1](../architecture/SECURITY_THREAT_MODEL.md),
[SEC-034_typecheck-and-ci-trust.md](../../SEC-034_typecheck-and-ci-trust.md)

**Problem:** The CI "Quality" job runs type-check and lint as **advisory /
non-blocking** (job literally named "Quality (advisory)", `--if-present`). The threat
model flags the raw-`fetch(` grep as "recommended, not yet in place" (§1). So the two
cheapest ways to silently reintroduce a closed vuln class — a bare `fetch(userUrl)`
(SSRF) or a type error in a security route — will not fail the build.

**Acceptance criteria:**
- [ ] Blocking CI step grepping for `fetch(` in `server/` outside `safeFetch.ts`/tests,
      failing on unexplained hits (threat model §1).
- [ ] ESLint `no-restricted-globals`/custom rule banning bare `fetch` in `server/`.
- [ ] Type-check blocking for the security-sensitive strict zones (with SEC-034);
      lint **errors** blocking.
- [ ] Enforced gates documented in the CI/CD guide.

---

## SEC-051 — Tenant isolation enforced only at the service layer; no DB-level defense in depth — P3

> **STATUS 2026-07-11 — 🟢 RLS foundation landed (Phase 1–2); enforcement staged.**
> Chose to build out Postgres RLS (the structural backstop). Delivered:
> - **Phase 1 — policies:** [migrations/0001_enable_rls.sql](../../migrations/0001_enable_rls.sql)
>   enables RLS + a `tenant_isolation` policy on all 24 direct-`tenant_id` tables.
>   Verified against a fresh Docker DB: 23 policies created, `files` correctly
>   skipped (that table isn't in the baseline — a separate drift, flagged). Safe /
>   non-breaking: the app connects as table owner and CI as superuser, both of
>   which bypass RLS until it is FORCEd.
> - **Phase 2 — runtime context:** [server/utils/rlsContext.ts](../../server/utils/rlsContext.ts)
>   sets the tenant GUC with **transaction-scoped** `set_config(...,true)` (never
>   session-level `SET`, which would leak across pooled connections), plus
>   [middleware/rlsContext.ts](../../server/middleware/rlsContext.ts) and an
>   `RLS_ENFORCED` flag (default off). Proven by
>   [tests/integration/rls-context.test.ts](../../tests/integration/rls-context.test.ts)
>   (GUC is transaction-local, doesn't leak, fails closed on empty).
> - **The `withTenant` app-layer helper** ([tenantWrapper.ts](../../server/repositories/tenantWrapper.ts))
>   remains as defense in depth (fails closed; 4 tests).
> - **Docs:** [TENANT_ISOLATION_RLS.md](../architecture/TENANT_ISOLATION_RLS.md)
>   (design + pooling hazard + rollout runbook + manual verification), threat-model
>   §7, SCHEMA.md, the db-schema-change skill, CLAUDE.md, and `.env.example`.
>
> **Deliberately deferred (needs owner/infra decisions, not blind changes):**
> Phase 3 enforcement (FORCE mode or a non-owner role + set `RLS_ENFORCED=true`,
> after migrating repository queries to `withTenant`), and Phase 4 join-based
> policies for indirectly-scoped tables (`workflow_runs`, `step_values`,
> `datavault_rows`, `secrets`, ...). Runbook in the RLS doc.

**Files:** repository layer (`server/repositories/*`); no RLS in `migrations/`.

**Problem:** Cross-tenant isolation depends entirely on every query carrying the right
`.where(eq(table.tenantId, ...))`. There is no Postgres row-level security or
structural backstop, so one omitted predicate is a silent cross-tenant read/write.

**Acceptance criteria:**
- [ ] Evaluate Postgres RLS on the highest-risk tenant tables (`workflow_runs`,
      `step_values`, `datavault_*`, `secrets`, `connections`) via per-request
      `SET app.tenant_id`, **or** a repository wrapper that refuses a tenant-scoped
      query without a tenant predicate.
- [ ] Cross-tenant integration tests: a user in tenant A cannot read/mutate tenant B
      rows on each major resource.
- [ ] Chosen approach documented in db-schema-change / add-api-endpoint guidance.

---

## SEC-053 — CAPTCHA challenge is trivially solvable and uses a non-shared in-memory store — P3 *(new; refines existing SEC-048)*

> **STATUS 2026-07-11 — ✅ CLOSED.** (a) The token no longer contains the answer:
> it now carries `HMAC(secret, answer:expiresAt)` and validation recomputes the
> keyed hash of the submitted answer and compares it constant-time
> ([CaptchaService.ts](../../server/services/CaptchaService.ts)), so a bot can no
> longer base64-decode the token to read the answer. (b) `validateCaptcha` now
> rejects `type: "simple"` in production when `RECAPTCHA_SECRET` is configured,
> treating the math puzzle as dev/fallback-only. A regression test asserts the
> answer is absent from the token; the captcha unit suite is green (10 tests).
> Note: the math puzzle is still solvable from the *question* by design — that is
> why reCAPTCHA is the production path; wiring the reCAPTCHA client widget + site
> key is the remaining product step, not a security hole in this service.

**Files:** [server/services/CaptchaService.ts:26,32-58](../../server/services/CaptchaService.ts),
[server/routes/auth.routes.ts:280-303](../../server/routes/auth.routes.ts)

**Problem:** The credential-stuffing CAPTCHA (SEC-048) exists and is wired in, but the
challenge is a two-operand addition of numbers 1–20 (answer 2–40) — trivially solved
by any bot, so it adds negligible automation resistance. Worse, challenges are held in
a per-process `Map` (`challengeStore`, [CaptchaService.ts:26](../../server/services/CaptchaService.ts),
comment: "would use Redis in production"). On a multi-instance deployment (Railway can
run >1 replica), a challenge minted on instance A cannot be validated on instance B —
so under horizontal scaling the gate either fails legitimate users or is effectively
bypassable by retrying until a request lands on the minting instance.

**Acceptance criteria:**
- [ ] Replace the toy math puzzle with a real challenge (reCAPTCHA/hCaptcha/Turnstile
      — a `recaptcha` type already exists in the intake schema) or a proof-of-work
      that resists automated solving.
- [ ] Move challenge state to a shared store (Redis/DB) so it works across instances,
      **or** make challenges stateless (signed, expiring token — no server-side store).
- [ ] Test: challenge minted against one instance validates against another (or the
      stateless equivalent); an automated solver cannot pass at scale.

---

## SEC-054 — Encryption is versioned but single-key; no retired-key set / online rotation path — P3 *(new; refines existing SEC-050)*

> **STATUS 2026-07-11 — ✅ CLOSED.** `encrypt()` selects the highest version from a
> `VL_KEYS` map ([encryption.ts:97-101](../../server/utils/encryption.ts)); `decrypt()`
> tries the versioned key, then `VL_MASTER_KEY`, then `VL_RETIRED_KEYS`
> ([encryption.ts:136-187](../../server/utils/encryption.ts)); and
> `scripts/rotateMasterKey.ts` provides the batched re-encrypt path. Suggest adding a
> unit test that data written under v1 still decrypts after v2 becomes primary, if not
> already present.

**Files:** [server/utils/encryption.ts:18-46,73](../../server/utils/encryption.ts)

**Problem:** SEC-050 added a `v1.` version prefix (good — the format is now
rotation-ready), but `getMasterKey()` still reads a single `VL_MASTER_KEY`, and there
is no way to decrypt-with-old / encrypt-with-new. CLAUDE.md's warning ("NEVER
regenerate on a machine with stored secrets") remains true: a leaked master key cannot
be retired without a full-downtime re-encryption. The version prefix is the enabler;
the rotation mechanism is the missing half.

**Acceptance criteria:**
- [ ] Support a primary key + set of retired keys via env, keyed by the version tag
      (decrypt with any known version, encrypt with primary).
- [ ] Documented + scripted online rotation (batched re-encrypt of secrets, MFA
      secrets, destination/connection creds, webhook HMAC secrets).
- [ ] Test: data written under `v1` still decrypts after `v2` becomes primary.

---

## SEC-055 — Production security middleware has drifted from dev; prod serves without the reviewed CSP — P1 *(new; replaces withdrawn SEC-052)*

> **STATUS 2026-07-11 — ✅ CLOSED.** A shared `server/middleware/securityConfig.ts`
> (`applySecurityMiddleware`) now applies helmet+CSP, CORS, and body limits, and is
> called by **both** `production.ts:38` and `index.ts:31` — no more drift. The prod
> CSP includes the Google/font/websocket origins the app needs; `securityHeaders.ts`
> (the dead third copy) was deleted; body limits reconciled to 10 MB in both.
> Remaining (low priority, not blocking): add the automated header-assertion test
> against the prod build, and move the hardcoded admin-email promotion
> ([production.ts:156](../../server/production.ts)) out of source.

**Files:** [server/production.ts:43-60,109-110](../../server/production.ts) (prod entry),
[server/index.ts:38-74,131-133](../../server/index.ts) (dev entry),
[server/middleware/securityHeaders.ts](../../server/middleware/securityHeaders.ts) (dead)

**Problem:** `server/production.ts` is the file that actually runs in production
(`build` bundles it to `dist/index.js`; `start` runs it). Its `helmet()` call
**omits the `contentSecurityPolicy` block entirely** — the carefully-tuned CSP (the
one allowing `accounts.google.com`, fonts, `wss:`, `objectSrc 'none'`,
`upgradeInsecureRequests`) lives **only** in the dev `server/index.ts`. So production
runs on helmet's generic default CSP, which is not the policy anyone reviewed and does
not include the origins the app needs. Any future CSP hardening done in `index.ts`
never reaches production. The two entrypoints have also drifted elsewhere: prod uses
`express.json()` with no explicit limit (default 100 KB) vs dev's 10 MB, and prod
hardcodes an admin-role promotion for a specific email
([production.ts:156](../../server/production.ts)). The genuinely dead file is
`securityHeaders.ts` (a third CSP definition, imported nowhere).

**Acceptance criteria:**
- [ ] The reviewed CSP (and any future header hardening) is applied by the code path
      that serves production — extract the helmet/CORS/body-limit config into one
      shared module imported by **both** `index.ts` and `production.ts`, so they
      cannot drift again.
- [ ] Confirm the production CSP actually includes every origin the app requires
      (Google OAuth, fonts, websockets) and denies the rest; verify against the
      running prod build, not just dev.
- [ ] Reconcile the `express.json` body limit between the two entrypoints (pick one
      intentional value; note SEC-122's per-step cap assumed 10 MB).
- [ ] Delete `server/middleware/securityHeaders.ts` (or wire it as the single source);
      one CSP definition only.
- [ ] Automated header-assertion test that runs against the **production** app build
      and asserts CSP + HSTS + frameguard present with the expected directives.
- [ ] (Related, low priority) move the hardcoded admin-email promotion out of source
      into config/seed.

---

## SEC-056 — Upgrade OpenTelemetry off the vulnerable line and drop the audit exception — P3 *(new; follow-up to SEC-046)*

**Files:** [package.json](../../package.json) (`@opentelemetry/*`),
[server/observability/telemetry.ts](../../server/observability/telemetry.ts),
[.audit-allowlist.json](../../.audit-allowlist.json)

**Problem:** Three high advisories collapse to GHSA-q7rr-3cgh-j5r3 (Prometheus
exporter HTTP-server crash). It is currently **not reachable** — the exporter is
built with `preventServerStart: true`, so its HTTP server never runs — and is
therefore allowlisted for the CI audit gate. The only patch is a breaking-major
OpenTelemetry upgrade (`auto-instrumentations-node` 0.50→0.78+, `sdk-node` /
`exporter-prometheus` 0.53→0.220+), which needs a boot/telemetry smoke-test.

**Acceptance criteria:**
- [ ] Upgrade `@opentelemetry/{auto-instrumentations-node,sdk-node,exporter-prometheus}`
      (and `@opentelemetry/api` as needed) to a line where GHSA-q7rr-3cgh-j5r3 is fixed.
- [ ] `telemetry.ts` still compiles and `initTelemetry()` starts cleanly with
      `ENABLE_TELEMETRY=true` (metrics/traces still emit).
- [ ] Remove the GHSA-q7rr-3cgh-j5r3 entry from `.audit-allowlist.json`;
      `node scripts/ci/audit-check.mjs` passes with 0 allowlisted, 0 blocking.

---

## Worth a closer look (not ticketed — needs verification)

- **Inbound webhook / esign callback signature verification.** Outbound HMAC signing
  exists ([dispatcher.ts](../../server/lib/webhooks/dispatcher.ts)); DocuSign Connect
  verification appears present ([DocusignProvider.ts](../../server/services/esign/DocusignProvider.ts)).
  Confirm every inbound callback that mutates run/envelope state verifies a signature
  (timing-safe) and rejects replays.
- **Audit-log tamper resistance / coverage.** Confirm `audit_logs` is append-only in
  practice and covers auth events, permission changes, and secret access.

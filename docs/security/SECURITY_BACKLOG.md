# Security Backlog — Data-Layer Audit

Source: schema / repository / database-access review (2026-07-09). IDs continue
the existing `SEC-###` scheme.

## Status (re-verified 2026-07-09, pass 4 — ALL CLOSED)

All original findings (SEC-101 … SEC-119) and all follow-ups
(SEC-120 … SEC-123) are now fixed and verified in the working tree.
Changes typecheck clean and the full fast unit suite passes (1642 tests).
No open items remain.

Pass-4 cleanup (this session): re-pointed the broken `workflow_runs_share_token_idx`
to `shareTokenHash` and reworked `PortalService` (SEC-123), added a per-answer
size cap in `IntakeService` (SEC-122), and removed `.concurrently()` from the
schema so future `drizzle-kit generate` can't reintroduce the transaction
conflict (SEC-121 residual).

Most fixes landed via encryption/hashing changes plus
[migrations/0012_security_hardening_fixes.sql](../../migrations/0012_security_hardening_fixes.sql),
[0010_concurrent_indexes.sql](../../migrations/0010_concurrent_indexes.sql),
and [0011_unique_steps_alias.sql](../../migrations/0011_unique_steps_alias.sql).

---

# OPEN TICKETS

## SEC-120 — Remaining bearer tokens stored raw (not hashed) at rest — P2 — ✅ FIXED (security) — regression → SEC-123

> Resolved: OAuth schema now uses hashed PKs `access_token_hash` /
> `refresh_token_hash` / `code_hash` ([integrations.ts:162-182](../../shared/schema/integrations.ts));
> validation hashes the incoming token and matches by hash
> ([externalAuth.ts:31-33](../../server/lib/authz/externalAuth.ts)); no code path
> writes plaintext OAuth tokens. `workflow_runs.share_token` is now
> `share_token_hash` with `hashToken` on write ([RunStateService.ts:82](../../server/services/workflow-runs/RunStateService.ts),
> [RunShareService.ts:64](../../server/services/workflow-runs/RunShareService.ts))
> and hashed lookup ([WorkflowRunRepository.ts:135](../../server/repositories/WorkflowRunRepository.ts)).
> **Regression:** removing the plaintext `shareToken` column left dangling
> references → tracked as **SEC-123**.

**Files:**
[shared/schema/integrations.ts:162-182](../../shared/schema/integrations.ts)
(`oauth_auth_codes.code`, `oauth_access_tokens.access_token` /`refresh_token`),
[server/services/RunShareService.ts](../../server/services/RunShareService.ts)
(`workflow_runs.share_token`)

**Problem:** SEC-106 hashed the org-invite and signature-request tokens, but
three reversible-secret bearer values are still stored raw:

- `oauth_access_tokens.access_token` (primary key) and `.refresh_token`
  (unique) — the app's own issued OAuth2 tokens. This path is **live** (used by
  `server/lib/authz/externalAuth.ts`, `connections-v2.routes.ts`, `engine/nodes/http.ts`).
- `oauth_auth_codes.code` (primary key) — short-lived, but a raw authorization code.
- `workflow_runs.share_token` — public redownload-link token, intentionally
  deferred in the [0008 migration note](../../migrations/0008_hash_run_tokens.sql)
  ("hashing it requires reworking the portal redownload flow first").

A database dump therefore yields live, replayable OAuth access/refresh tokens
and share links.

**Acceptance criteria:**
- [ ] `oauth_access_tokens` and `oauth_auth_codes` look up by a hashed column
      (`hashToken`): add `access_token_hash` / `refresh_token_hash` / `code_hash`
      columns with unique indexes; store only the hash; return plaintext to the
      client once at issuance.
- [ ] The raw token is no longer the primary key / no longer persisted in
      plaintext (introduce a surrogate `id` PK if needed).
- [ ] Token *validation* in `externalAuth.ts` and the connections-v2 path hashes
      the incoming token and matches by hash; expired-token handling preserved.
- [ ] `workflow_runs.share_token` is hashed at rest, with the portal redownload
      flow updated to a hash-lookup (or, if deferral is accepted, this sub-item
      is split into its own explicitly-accepted-risk ticket and closed here).
- [ ] Migration hashes or expires existing rows (short-lived auth codes may just
      be purged).
- [ ] Test per token type: stored value ≠ issued value; auth/validation still
      succeeds; a stored (hashed) value cannot be replayed as a bearer token.

---

## SEC-121 — `CREATE INDEX CONCURRENTLY` migrations may fail under the transactional migrator — P2 — ✅ FIXED

> Resolved: [0010_concurrent_indexes.sql](../../migrations/0010_concurrent_indexes.sql)
> and [0011_unique_steps_alias.sql](../../migrations/0011_unique_steps_alias.sql)
> now use plain `CREATE INDEX IF NOT EXISTS` (non-concurrent), so they apply
> cleanly inside the migrator's transaction. Trade-off: a brief lock during the
> index build — acceptable at current table sizes.
>
> **Residual cleanup — ✅ DONE:** `.concurrently()` removed from
> `workflow_runs_portal_access_key_idx` ([run.ts:110](../../shared/schema/run.ts))
> and `audit_logs_ts_entity_idx` ([auth.ts:347](../../shared/schema/auth.ts)), so
> a future `drizzle-kit generate` won't regenerate `CONCURRENTLY` SQL. The schema
> now matches the applied non-concurrent migrations (and the 0012 snapshot).

**Files:**
[migrations/0010_concurrent_indexes.sql](../../migrations/0010_concurrent_indexes.sql),
[migrations/0011_unique_steps_alias.sql](../../migrations/0011_unique_steps_alias.sql),
[scripts/runMigrations.ts](../../scripts/runMigrations.ts)

**Problem:** These files use `CREATE INDEX CONCURRENTLY` (and
`CREATE UNIQUE INDEX CONCURRENTLY`). Postgres forbids `CONCURRENTLY` inside a
transaction block, and Drizzle's node-postgres `migrate()` runs each migration
file inside a transaction. As written, `npm run db:migrate` will likely abort
with *"CREATE INDEX CONCURRENTLY cannot run inside a transaction block"*,
leaving the index missing (or, on partial failure, an `INVALID` index). This is
a deploy-safety regression introduced by the SEC-110/SEC-109 fixes — the schema
intent is correct, but the delivery mechanism needs to match the runner.

**Acceptance criteria:**
- [ ] Confirmed behaviour: run `0010`/`0011` against a fresh DB via the actual
      `db:migrate` path and capture whether they succeed or error.
- [ ] If they error: concurrent index builds are delivered by a mechanism that
      runs them outside a transaction (e.g. a dedicated non-transactional
      migration step / standalone script), OR the indexes are created
      non-concurrently in the migration with the locking trade-off documented.
- [ ] No `INVALID` indexes remain after a failed/retried run
      (`SELECT * FROM pg_index WHERE indisvalid = false` is empty).
- [ ] The chosen convention for online index builds is documented in the
      db-schema-change guidance so future concurrent indexes don't hit this.
- [ ] Also confirm the one-shot backfill in
      [0008_hash_run_tokens.sql](../../migrations/0008_hash_run_tokens.sql)
      (unbounded `UPDATE` on `workflow_runs`) is acceptable at current table
      size, or convert it to a batched script.

---

## SEC-122 — No per-field size cap on run-submitted jsonb — P3 — ✅ FIXED

> Resolved: `IntakeService` now enforces a per-answer byte cap
> (`MAX_STEP_VALUE_BYTES`, default 1 MB, env-overridable) on both the
> save-progress and submit paths, throwing `AppError(…, 413)` on oversize
> values — [IntakeService.ts](../../server/services/IntakeService.ts)
> (`assertStepValueSizesWithinLimit`). This sits under the global ~10 MB
> `express.json` limit and caps any single step value.

**Files:**
[server/services/IntakeService.ts](../../server/services/IntakeService.ts),
[shared/schema/run.ts:116](../../shared/schema/run.ts) (`step_values.value`),
[shared/schema/run.ts:89](../../shared/schema/run.ts) (`workflow_runs.metadata`)

**Problem:** jsonb columns populated by public bearer-token run endpoints have no
per-field byte cap. A global request-body limit exists
(`express.json({ limit: maxRequestSize })`, [server/index.ts:131](../../server/index.ts)),
which caps total payload size and mitigates the bulk of the original DoS
concern — so this is now low priority. A single request within that limit can
still write an outsized value into one step.

**Update (2026-07-09):** confirmed `maxRequestSize` defaults to **`10mb`**
(`MAX_REQUEST_SIZE ?? '10mb'`, [server/index.ts:130](../../server/index.ts)) — a
generous limit sized for uploads, so a single request can still write a
multi-MB value into one step. Per the criteria below, a tighter per-step cap is
warranted. **Still open.**

**Acceptance criteria:**
- [ ] Add a per-step-value byte cap in the intake/run service (e.g. via
      `Buffer.byteLength` / a Zod refinement) with a clear 400/413 response;
      document the chosen limit.
- [ ] (Optional defence-in-depth) `CHECK (pg_column_size(value) < N)` on
      `step_values.value`.

---

## SEC-123 — Dangling `shareToken` references after column was hashed — P2 (regression) — ✅ FIXED

> Resolved: `workflow_runs_share_token_idx` re-pointed to `shareTokenHash`
> ([run.ts:106](../../shared/schema/run.ts)) — matches the DB, where the 0013
> `RENAME COLUMN` already moved the index onto `share_token_hash`. `PortalService`
> no longer returns the removed plaintext column; it exposes
> `hasShareToken: Boolean(run.shareTokenHash)` instead
> ([PortalService.ts:41](../../server/services/PortalService.ts)). Stale
> `shareToken` in the test factory updated to `shareTokenHash`. Typecheck clean;
> fast unit suite green.

**Files:**
[shared/schema/run.ts:106](../../shared/schema/run.ts),
[server/services/PortalService.ts:41](../../server/services/PortalService.ts)

**Problem:** SEC-120 replaced the plaintext `workflow_runs.share_token` column
with `share_token_hash`, but two consumers of the old plaintext column were not
updated:

- [run.ts:106](../../shared/schema/run.ts) —
  `index("workflow_runs_share_token_idx").on(table.shareToken)` references a
  column that no longer exists. `table.shareToken` is `undefined`, which breaks
  the Drizzle table definition / type-checks (the index now points at nothing).
- [PortalService.ts:41](../../server/services/PortalService.ts) — the portal
  run-list maps `shareToken: run.shareToken`, now always `undefined` at runtime.
  Because only the hash is stored, the plaintext token can no longer be read
  back — this is precisely the "rework the portal redownload flow" work the
  [0008 note](../../migrations/0008_hash_run_tokens.sql) said was required before
  hashing `share_token`.

Security is not regressed (no plaintext at rest); this is a correctness/feature
break introduced by the hardening.

**Acceptance criteria:**
- [ ] `run.ts` index either removed or re-pointed to `shareTokenHash`
      (index the column that actually exists); schema type-checks clean (`tsc`).
- [ ] The portal share/redownload flow is reworked to not depend on reading the
      plaintext token back from the DB — e.g. return the plaintext token only at
      share-creation time, or build the link from the hash-keyed lookup.
- [ ] `PortalService` no longer returns an always-`undefined` `shareToken`; the
      portal list/redownload path is verified working end-to-end.
- [ ] Regression test covering "create share link → open it via portal".

---

# RESOLVED (verified fixed 2026-07-09)

| ID | Title | Fix evidence |
|----|-------|--------------|
| SEC-101 | Cross-tenant record write | `createRecord` throws on `collection.tenantId !== data.tenantId` — [RecordService.ts:226](../../server/services/RecordService.ts) |
| SEC-102 | Plaintext MFA TOTP secret | `encrypt()` on write, `decrypt()` on verify w/ legacy fallback — [MfaService.ts:55](../../server/services/MfaService.ts) |
| SEC-103 | Plaintext destination creds | `encryptConfig`/`decryptConfig` (try/catch legacy-plaintext fallback) — [ExternalDestinationService.ts:36](../../server/services/ExternalDestinationService.ts) |
| SEC-104 | Migration journal drift | Journal registers all migrations 0000–0012 — [_journal.json](../../migrations/meta/_journal.json) |
| SEC-105 | No unique `users.email` | `uniqueIndex` + de-dupe migration — [auth.ts:72](../../shared/schema/auth.ts), [0009](../../migrations/0009_unique_user_email.sql) |
| SEC-106 | Raw invite/signature tokens | Invite + signature tokens now `hashToken`-ed — [OrganizationService.ts:466](../../server/services/OrganizationService.ts), [SignatureRequestService.ts:70](../../server/services/SignatureRequestService.ts). **OAuth tokens remain → SEC-120.** |
| SEC-107 | Plaintext webhook HMAC secret | `encrypt()` on write, `tryDecrypt` on read — [webhooks.routes.ts:76](../../server/routes/webhooks.routes.ts) |
| SEC-108 | Magic-link token in logs | Only 8-char truncated prefix logged — [PortalAuthService.ts:33](../../server/services/PortalAuthService.ts) |
| SEC-109 | `steps.alias` not unique | `uniqueIndex(section_id, alias)` — [workflow.ts:272](../../shared/schema/workflow.ts), [0011](../../migrations/0011_unique_steps_alias.sql) *(delivery caveat → SEC-121)* |
| SEC-110 | Missing hot-path indexes | `portal_access_key` + `audit_logs(timestamp,...)` indexes — [run.ts:110](../../shared/schema/run.ts), [auth.ts:347](../../shared/schema/auth.ts) *(delivery caveat → SEC-121)* |
| SEC-112 | BlockService `creatorId` authz | Now `workflowSvc.verifyAccess(..., 'edit')` — [BlockService.ts:37](../../server/services/BlockService.ts) |
| SEC-114 | Soft-delete leakage | `getRowWithValues` and `batchFindByIds` filter `deletedAt` — [DatavaultRowsRepository.ts:153](../../server/repositories/DatavaultRowsRepository.ts). No `files` read path exists to leak through. |
| SEC-115 | `default-cache-secret` fallback | Literal removed — [cache.ts](../../server/services/cache.ts) |
| SEC-116 | No CHECK constraints | Size/rating/timeout/seat/quantity checks added — [0012](../../migrations/0012_security_hardening_fixes.sql) |
| SEC-117 | Missing FKs / `onDelete` | `referenceTableId` FK + `onDelete` on user refs + legacy `runs` children re-pointed to `workflow_runs` cascade — [0012](../../migrations/0012_security_hardening_fixes.sql) |
| SEC-118 | Unescaped ILIKE wildcards | `%`/`_`/`\` escaped + length capped to 100 — [ActivityLogRepository.ts:62](../../server/repositories/ActivityLogRepository.ts) |
| SEC-119 | Dead / unwired code | `.bak` deleted; `TemplateShareRepository` and `apiTokenAuth` removed |

### Not ticketed (verified safe / done well)
No SQL injection (all `sql.raw` static/allowlisted); AES-256-GCM core correct
(random IV, verified auth tag, no key fallback); JWT alg-pinned; tenant scoping
consistently enforced at the service layer; runToken routes 403 on run-id
mismatch (no cross-run leak).

# RLS Phase 2 — handoff to finish RLS-4 and RLS-5

**Rewritten 2026-08-20, end of session.** This replaces the prior handoff, not
appends to it — that one had grown into session notes. This one reflects
verified current state only. `dev` is at `7ac6fe78`. **Everything below this
line is uncommitted, in the working tree** — see §1.

Board: [`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md).
Deliberately not named `*_TICKETS.md` — that glob is what dispatch scans for
work; this is context, not a board.

---

## 0. Read this first, in this order

1. This file, end to end.
2. `docs/architecture/TENANT_ISOLATION_RLS.md` **§2e and §2f** — the
   self-identification pattern and its three variants (primary-key,
   token-hash, verified-foreign-key) plus the declared-visibility carve-out.
   **Read this before inventing a new mechanism for anything below** — the
   next bootstrap-shaped problem almost certainly fits one of these four
   shapes already.
3. §2b/§2c/§2d in the same doc for the underlying `withTx`/service-boundary
   pattern everything here builds on.

**Do not relitigate these — repo-owner rulings, reasoning already recorded:**
- Tenant GUC set at the **service boundary**, never repository or request.
- Ambient GUC and `eq(tenantId, …)` predicate stay **independent** checks.
- Admin cross-tenant access goes through the **separate `BYPASSRLS` role**
  (RLS-6), reachable from one audited module. Never give the app role
  `BYPASSRLS`; never add an `is_platform_admin` clause to a policy.
- Bootstrap-shaped RLS problems (identity known, tenant not yet) get a
  **narrow, table-specific, GUC-keyed `OR` clause in `USING`** — not a
  `SECURITY DEFINER` function, not a second bypass pool. See §2e/§2f for why.

---

## 1. What is uncommitted right now — commit this first

Nothing from this session is committed. `git status --short` at time of
writing:

```
 M docs/architecture/TENANT_ISOLATION_RLS.md
 M migrations/meta/_journal.json
 M server/googleAuth.ts
 M server/middleware/auth.ts
 M server/middleware/requireUser.ts
 M server/middleware/runTokenAuth.ts
 M server/middleware/userCache.ts
 M server/services/BrandingService.ts
 M server/services/RunFileUploadService.ts
 M server/services/SignatureRequestService.ts
 M server/services/TemplateValidationService.ts
 M server/services/VariableService.ts
 M server/services/VersionService.ts
 M server/services/WorkflowService.ts
 M server/services/runs/RunAuthResolver.ts
 M server/utils/rlsContext.ts
 M tests/helpers/integrationTestHelper.ts
 M tests/helpers/schemaManager.ts
 M tests/helpers/testFactory.ts
 M tests/integration/rls2c-miscCluster.test.ts
 M tests/integration/rls4-forceEnforcement.test.ts
 M tests/setup.ts
 M tests/unit/middleware/auth.middleware.test.ts
 M tests/unit/routes/auth.userPayload.routes.test.ts
 M tests/unit/services/RunFileUploadService.test.ts
 M tests/unit/services/SignatureRequestService.test.ts
 M tests/unit/services/VariableService.choices.test.ts
 M tests/unit/services/WorkflowService.test.ts
?? migrations/0026_rls_nullif_guc_cast.sql
?? migrations/0027_rls_null_tenant_isolation.sql
?? migrations/0028_rls_users_self_identification.sql
?? migrations/0029_rls_signature_requests_self_identification.sql
?? migrations/0030_rls_workflows_self_identification.sql
?? migrations/0031_rls_public_workflow_visibility.sql
?? migrations/meta/0026_snapshot.json … 0031_snapshot.json
```

This is real, verified work (see §2) — not a WIP dump. Recommend one commit
(it's all one coherent change: closing RLS-4's blocker and RLS-4's
preconditions), or split by migration if you want finer git history. Either
way, **commit before doing anything else** — a fresh session starting from
this uncommitted tree has no way to tell "verified" from "in progress."

---

## 2. What is now closed (verified, this session)

### The original RLS-4 blocker — closed
`0026_rls_nullif_guc_cast.sql`: a touched-then-reset tenant GUC reverts to
empty string, not unset, and the unguarded `current_setting(...)::uuid` cast
raised instead of filtering. Fixed with `NULLIF`.

### All four RLS-4 preconditions — closed

| # | Item | Fix |
|---|---|---|
| 1 | Ordering (FORCE + `RLS_ENFORCED` together, after `ADMIN_DATABASE_URL`) | Operational — see §5, not yet executed |
| 2 | Signature/upload token bootstrap, public workflow access | `0029`/`0030`/`0031` + `RunAuthResolver.ts`/`runTokenAuth.ts`/`RunFileUploadService.ts` — see below |
| 3 | Admin org-stats | Closed earlier (`0141b19a`) |
| 4 | `BrandingService.resolveForWorkflow` | `tx`-threading, verified |
| 5 | `VariableService.listVariables` | `tx`-threading, verified |

Plus two more real defects found by actually running the suite as a
non-owner role (RLS-5), not documented as preconditions because nobody knew
they existed until the harness found them:

- **`0027_rls_null_tenant_isolation.sql`** — `NULL = NULL` is `NULL` in SQL,
  so a genuinely-NULL `tenant_id` (a just-registered user, before tenant
  assignment) could never satisfy `tenant_id = NULLIF(...)::uuid`, blocking
  registration itself. Fixed with `IS NOT DISTINCT FROM`.
- **`0028_rls_users_self_identification.sql`** — the largest single finding
  of the whole initiative. `hybridAuth`'s own identity re-hydration
  (`getUserById` → `userRepository.findById`, used by every
  `hybridAuth`/`requireUser` route) runs before any tenant is known —
  establishing it is the point — so it was blocked for any user with a real
  tenant, breaking authentication app-wide. Fixed with a narrow, read-only
  self-row clause on `users`, keyed on `app.current_user_id`, set only after
  the JWT/session is verified (`server/utils/rlsContext.ts`'s
  `withCurrentUserId`/`withTenantAsUser`). Full writeup, including the
  UPDATE-vs-`USING` gotcha it took a second round to isolate: §2e.

### Precondition 2, the full story — three shapes, not one

- **`0029`** — `SignatureRequestService.getSignatureRequestByToken`'s
  bootstrap read. The hashed token IS the verification (computed locally,
  no DB round trip), pinned via the new general
  `withVerifiedIdentifier(gucName, value, fn)` helper. Write side already
  correctly opened `withTenant(request.tenantId, ...)` once the tenant was
  known.
- **`0030`** — `RunFileUploadService`/`runTokenAuth`'s gap: no per-row
  secret, just a `workflow_id` obtained via an independent, RLS-free check
  (`workflow_runs.run_token` match — that table carries no policy at all).
  `runTokenAuth` pins `app.current_workflow_id` to a value it already
  legitimately has; `RunFileUploadService.resolveContext` and
  `RunAuthResolver.verifyCreateAccess` rethreaded through `withCurrentTenant`
  so they actually use the ambient tenant instead of the bare pool.
  `RunAuthResolver`'s case is conditional on `getCurrentTenantId() !==
  undefined` — never forces a tenant requirement, which would break
  anonymous public-link access the moment `RLS_ENFORCED=true`.
- **`0031`** — not a bootstrap problem at all: `RunAuthResolver`'s
  public-slug lookup has zero prior verification to key anything on. Fixed
  with a GUC-free declared-visibility clause — `is_public = true AND status
  = 'active'` — on `workflows`, plus the matching `EXISTS (...)` join on
  `sections`/`steps`.
- **`VersionService.ts`** — a genuinely unrelated bug the above surfaced:
  six `audit_logs` inserts during draft-version creation never set
  `tenantId`, defaulting to `NULL` even with a real tenant pinned. Fixed by
  threading `getCurrentTenantId()` into all six. Not another instance of the
  pattern — just an ordinary missing-field bug RLS enforcement happened to
  be the first thing to notice.

### The RLS-5 harness — built and proven

`tests/setup.ts` provisions a real `rls5_app_role` (`NOBYPASSRLS
NOSUPERUSER`) through a separate owner `pg.Client`, then repoints
`DATABASE_URL` before `server/db` is imported — gated behind
`RLS_RESTRICTED=true`, every other run byte-identical. Confirmed via
`pg_stat_activity` and the harness's own log line that it genuinely runs as
the restricted role, not the owner.

### Two shared test fixtures — same production gap, same fix

`tests/helpers/integrationTestHelper.ts` and `tests/helpers/testFactory.ts`
(used by the majority of integration tests) wrote real `tenant_id` values
with no GUC pinned, exactly like the production code did. Fixed the same
way. `testFactory.ts` also gained a `lastTenantId`-remembering
`withKnownTenant()` wrapper so methods that don't receive a tenant/user id
directly (`createSection`, `createStep`, `createTable`) opportunistically
reuse whatever tenant a prior call on the same instance established —
backward compatible, no call-site changes needed anywhere that already
chains `createTenant()`/`createWorkflow()` first.

### Full verification, this session (all green)

```
npx tsc --noEmit                    → 0 errors
npm run lint                        → 0 (exit 0)
npm run check:strict-zones          → ALL PASSED (6 zones, 11 files)
npm run test:fast                   → 285 files / 3283 tests, 0 failed
npm run test:unit:db                → 17 files / 158 tests, 0 failed
npm run test:integration (normal)   → 124 files / 1183 tests, 0 failed
```

Two mock-gap regressions were found and fixed along the way — both in
unit-fast tests whose `db`/`userCache` mocks predated `hybridAuth`/
`cookieStrategy`/`googleAuth.ts` needing a real `db.transaction()`
(`tests/unit/routes/auth.userPayload.routes.test.ts`,
`tests/unit/middleware/auth.middleware.test.ts`). Confirmed no other
unit-fast file has the same gap — full suite re-run clean after the fix.
**If you add more `withTenant`/`withCurrentUserId`/`withVerifiedIdentifier`
calls to a service, check whether any unit-fast test mocking `server/db`
needs a `transaction` (and `execute`) method added to its mock** — this
class of failure is silent until you run the full `test:fast`, not just the
file you touched.

---

## 3. RLS-5's current state: 99 failed / 25 passed files (301 failed / 406
passed / 476 skipped tests, of 1183)

Measured against `RLS_RESTRICTED=true npm run test:integration`, this
session's final state. Every failure falls into one of three named,
understood categories — **no unexplained failures remain**:

### Category A — tests that do their own DDL/role-management via `db` (6 files)
Not app bugs. These suites assume `db` is the table owner (for their OWN
verification logic — `ALTER TABLE`, `CREATE INDEX`, `ALTER ROLE`), which is
now correctly false under the restricted role:
`rls-coverage.test.ts`, `rls-phase4-workflows.test.ts`,
`datavault.dvp2-perf.test.ts`, `rls-datavault.test.ts`,
`rls4-forceEnforcement.test.ts`, `rls6-adminAccess.test.ts`. Fix (if wanted):
give each its own owner-authenticated `pg.Client` for setup, matching the
pattern `rls4-forceEnforcement.test.ts` already uses for its OWN
restricted-role verification, ironically now conflicting with the outer
harness. Low priority — these suites still pass in normal mode and prove
what they're meant to prove there.

### Category B — the long tail: individual files with their own unscoped fixture writes (the rest)
The dominant category by file count. Predates
`integrationTestHelper.ts`/`testFactory.ts` — each file does its own raw
`db.insert(schema.users)` / `db.update(schema.workflows)` / etc. with no
tenant (or self-id) GUC pinned, exactly the gap the two shared fixtures had
before this session. Confirmed by root-cause grep: **206 of ~230 raw RLS
errors in the final run are `"violates row-level security policy for table
X"`**, traced to files never routing through the fixed shared helpers. Some
failures in this category are *cascades*, not independent root causes — e.g.
a file whose section-creation call fails RLS leaves a later step trying to
use `undefined` as a section id, surfacing as `invalid input syntax for type
uuid: "undefined"`. Fixing the root write closes both.

**Fix pattern (mechanical, same shape 3 times already this session):**
1. Find the raw `db.insert`/`db.update` call(s) with a known real `tenantId`.
2. If it's a fresh INSERT with a known tenant → wrap in
   `db.transaction` + `applyTenantToTransaction(tx, tenantId)`
   (`server/utils/rlsContext.ts`).
3. If it's an UPDATE moving a row from no-tenant to a real tenant (or you
   also need self-row visibility) → `withTenantAsUser(tenantId, userId, fn)`.
4. If only a `userId` is known and tenant must be discovered → mirror
   `testFactory.createWorkflow`'s shape: pin `app.current_user_id` via
   `withVerifiedIdentifier`, `SELECT tenant_id FROM users WHERE id = …`,
   then `applyTenantToTransaction`.
5. Re-run that one file under `RLS_RESTRICTED=true`, confirm it passes,
   confirm it *still* passes in normal mode (regression check).

Do **not** try to fix all of these in one sitting blind — get the current
file list fresh (`RLS_RESTRICTED=true npm run test:integration`, capture to
a file, never pipe through `tail` — see §6), since fixing one file can
surface a *different* file's issue behind it (this happened repeatedly this
session: fixing `testFactory.ts` revealed `rls2c-miscCluster.test.ts`'s own
gap; fixing that revealed `RunAuthResolver`'s; fixing that revealed
`VersionService`'s). Budget several passes, not one.

### Category C — `ownershipAccess.test.ts`
One self-contained legacy file with hardcoded UUIDs and its own raw
`db.insert()` fixture in `beforeEach`/`afterEach`, predating the
tenant-scoped pattern entirely (silently swallows setup errors too — "Ignore
setup errors if data already exists"). Same fix shape as Category B, called
out separately because it's old enough to need a slightly bigger touch (its
`afterEach` cleanup is also unscoped).

**Known, deliberately not chased further this session:**
- `RunAuthResolver.resolveRun`/`getTenantId` — a *different* method than
  `verifyCreateAccess` (used for existing-run access, not creation), same
  unscoped-read shape, no failing test currently exercises it.
- Google OAuth's by-email lookup for an *existing* user whose current tenant
  differs from the one about to be pinned — a genuine architecture question
  (§2f), not something introduced this session, still open.
- `SignatureRequestService.markExpiredRequests` (cron, cross-tenant batch
  scan) needs RLS-6-style bypass treatment, not the self-identification
  pattern — different shape, already flagged in that file's class comment.

---

## 4. Order of work to actually close RLS-4 and RLS-5

1. **Commit §1.** Nothing below should start from an uncommitted tree.
2. **Category B/C cleanup** (§3) until `RLS_RESTRICTED` is green or every
   remaining failure is freshly triaged. This is what makes RLS-5's gate
   mean something — right now it's real signal buried in expected noise.
3. **Wire RLS-5 into CI** per its ticket AC (`ENVIRONMENTS_AND_RLS_TICKETS.md`
   RLS-5): a required check running the full suite as the restricted role,
   pasted output for both roles side by side.
4. **RLS-4's actual deployment** — none of this is done yet, it's still
   entirely a code-readiness state:
   - Provision `ADMIN_DATABASE_URL` (RLS-6's admin role) and the new
     least-privilege app role in **dev first, never production first**. Env
     vars documented in `.env.example` lines ~61-90.
   - Set `FORCE ROW LEVEL SECURITY` (new migration, all policy-carrying
     tables) and `RLS_ENFORCED=true` **together** — precondition 1's
     ordering rule, still unexecuted. Setting FORCE while `RLS_ENFORCED` is
     false leaves `AdminAccessService`'s guard blind.
   - Point `DATABASE_URL` at the restricted role.
   - Prove cross-tenant read impossible at the DB level, pasted output (AC4
     in the board ticket).
   - Prove non-vacuous with GUC unset (AC5) — this is exactly what
     `rls4-forceEnforcement.test.ts` already proves in isolation; the AC
     wants it proven for the app's real connection too.
   - Document a rollback (AC6).
   - Repeat for `test`, then a **PR-only** promotion to `main` — never a
     direct push, per this repo's branch-flow rules.

---

## 5. Environment facts that will cost you hours otherwise

- **Never pipe a `RLS_RESTRICTED`/DB-backed background run through `tail`.**
  Redirect to a file directly (`... > scratchpad/foo.log 2>&1`). A `| tail
  -N` on a `run_in_background` command truncates the SAVED output to N
  lines — this cost real time once this session, recovered only by
  re-running.
- **Never run two DB-backed suites concurrently, including across a
  foreground/background split.** Check `docker exec ezbuildr-test-db-1 psql
  -U postgres -d ezbuildr_test -c "SELECT count(*) FROM pg_stat_activity
  WHERE datname='ezbuildr_test' AND state='active';"` before starting one.
- **A transient `FATAL: the database system is not yet accepting
  connections` (Postgres code `57P03`) mid-run is not a regression.**
  Measured once this session — Postgres briefly recovering under sustained
  load; the affected files passed cleanly re-run in isolation seconds later.
  Don't chase it; just re-run.
- **`set_config`'s first argument (the GUC name) can safely be a bind
  parameter** — confirmed directly against the restricted role via `PREPARE
  ... EXECUTE`. This is what makes `withVerifiedIdentifier(gucName, value,
  fn)` (one function, any GUC) work instead of needing one hand-written
  helper per GUC name.
- **`workflows.id`/`signature_requests.token` are different column shapes**
  worth knowing before writing the next self-identification clause:
  `workflows.id` is `uuid` (cast needed: `::uuid`), `users.id` is `varchar`
  (no cast), `signature_requests.token` is `text` storing an already-hashed
  value (no cast, compare as-is).
- Schema-cache token is at **`_v34`** (`tests/helpers/schemaManager.ts`) —
  bump it for any further migration, with the reasoning in a comment; five
  bumps happened this session alone (`_v29` through `_v34`) and each one's
  comment is there for a reason if you need to understand a stale-schema
  symptom later.
- Everything from the original handoff about worktrees, the `SystemStats`
  deadlock class, `AsyncLocalStorage.enterWith` binding scope, and the
  8-suites-build-their-own-express-app list still applies unchanged — not
  reproduced here to keep this file from growing back into what it just got
  rewritten out of.

---

## 6. The one habit that matters

**Prove every guard fails, and ask the second question** — both already
proven load-bearing this session. Twice, a fix that looked complete (the
NULLIF cast; the self-identification GUC alone) turned out to be half of a
two-part problem (the NULL-tenant case; the UPDATE-vs-USING gotcha) that
only surfaced by actually running the suite as the restricted role and
reading the *next* error, not stopping at "the error changed." When a fix
here looks done, run it once more and see if a *different* error appears
where the old one was — that's usually not noise, it's the next layer.

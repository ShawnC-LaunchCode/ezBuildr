# Environment split & real tenant isolation (ENV / RLS) — retired

**Fully retired 2026-09-19.** Partially retired on 2026-08-23 (ENV-1..4 and
RLS-1, 2a–2f, 3, 5, 6, 7). The rest, RLS-4, RLS-8, RLS-9, RLS-10 and RLS-11, stayed on
the board until production was cut over and verified, and it closed on 2026-09-15.
The board file `tickets/ENVIRONMENTS_AND_RLS_TICKETS.md` is deleted.

**Recovering a closed ticket's full text** — Finding, Preferred fix, acceptance
criteria and dated verification notes:

```bash
git log -p -- tickets/ENVIRONMENTS_AND_RLS_TICKETS.md
```

That works whether or not the file still exists.

**Durable engineering lessons are NOT here.** They are in
[`docs/architecture/TENANT_ISOLATION_RLS.md`](../../docs/architecture/TENANT_ISOLATION_RLS.md)
(§2a–§2g: the patterns), [`docs/architecture/RLS_HANDOFF.md`](../RLS_HANDOFF.md) (state and
the traps that cost real time) and [`docs/deployment/RLS4_CUTOVER.md`](../RLS4_CUTOVER.md)
(the enforcement cutover procedure). This file is the closure record.

---

## What the initiative achieved

Tenant isolation moved from *"service-layer `eq(tenantId, …)` predicates that a
developer must remember"* to *"the database refuses"*, in all three environments.

| | before | after |
|---|---|---|
| RLS policies | defined, inert (owner bypasses) | enforced on dev, test **and production** (production since 2026-09-13 15:33 UTC) |
| Catalog state, measured 2026-09-19 | production: 9 policy tables, none forced | **38 / 38 / 38** (policy / enabled / forced) on every branch, 50 migrations each |
| Integration suite as a non-owner role | 26 of 124 files passing | all files green, allowlist empty |
| Enforcement regression gate | none | `RLS Enforcement Gate`, a required check on `main`, alerts Slack on red |
| Unscoped call-site audit | not run anywhere | `npm run audit:rls-surface` in CI with a two-way ratchet; 17 sites, all triaged |
| Per-policy isolation proof | hand-picked tables | `rls10-policyIsolation.test.ts`, driven by `pg_policies` |
| Production defects found | — | ~20, nearly all failing **silently** |

The defects are the part worth remembering, because they share a shape: under
enforcement an unscoped read returns **empty** rather than erroring, so features
fail by going quiet. API integrations 404'd, Read Table blocks returned empty
lists, every background job processed nothing while reporting success, the admin
console showed one tenant, external sends could not find their destination,
DocuSign webhooks retried forever, and run analytics silently stopped recording.

---

## How the scope got bounded (from the retired `RLS_COMPLETION_PLAN.md`)

That plan is retired — phases 1–4 all shipped, and phase 5's remaining half is
RLS-4 for production. Its one durable idea is worth keeping, because it is the
thing that turned an apparently open-ended epic into a finite checklist:

> **The failure mode is discovery-by-execution.** An unscoped read is invisible
> until some test drives that exact path, so "what's left" could only be
> answered by running the suite, fixing, and running again. Every pass found
> more because every pass got further.

Three things closed that off, and any similar initiative should copy them:

1. **Name the categories the first sweep was blind to.** The original rollout
   scoped itself to "services that reference `tenantId`" and structurally could
   not see ownership-derived tables (`sections`/`steps`/`workflows` have no
   `tenant_id`, so their services never mention it), services outside
   `server/services/*.ts`, or route middleware — a whole layer.
2. **Make the surface statically bounded**, so it is a checklist rather than a
   search: `scripts/audit-rls-surface.ts`.
3. **Remove the largest confounder.** `tests/helpers/ownerDb.ts` split the test
   observer from the application, so a failing test means "the app could not do
   this under RLS" rather than "the harness could not see it."

The caveat learned afterwards, which that plan did not anticipate: the static
bound is a **floor, not a ceiling**. Three of the largest defects were invisible
to it — a field alias (`this.database`), a multi-line `db
  .select()`, and a
lost async context after multer. Two more categories had no test coverage at all
(background jobs, multipart routes).

Full text: `git log -p -- tickets/RLS_COMPLETION_PLAN.md`.

---

## Closed — do not re-file

| ID | Title | Closed |
|---|---|---|
| ENV-1 | dev/test Railway environments, each with its own database | 2026-08-22 |
| ENV-2 | Prove the migration chain reproduces production's schema | 2026-08-15 |
| ENV-3 | Per-environment secrets + the live storage configuration | 2026-08-22 |
| ENV-4 | Branch protection, and making `test` mean something | 2026-08-15 |
| RLS-1 | Register the tenant-context middleware | 2026-08-18 |
| RLS-2a | Service-boundary tenant transaction, piloted on CollectionService | 2026-08-18 |
| RLS-2b | Rollout: DataVault cluster + TransferService | 2026-08-19 |
| RLS-2c | Rollout: collections/records + misc clusters | 2026-08-19 |
| RLS-2d | Rollout: org/access cluster | 2026-08-19 |
| RLS-2e | Rollout: workflow/template cluster — rollout complete | 2026-08-20 |
| RLS-2f | The call-site sweep | 2026-08-21 |
| RLS-3 | Repair policy coverage (24 of 26 tenant tables unprotected) | 2026-08-18 |
| RLS-5 | Gate: full integration as the non-owner role | 2026-08-22 |
| RLS-6 | Cross-tenant read path for the admin console, audited | 2026-08-19 |
| RLS-7 | Route admin cross-tenant operations through `adminDb` | 2026-08-22 |
| RLS-4 | `FORCE` + move off the owner role — dev 08-22, test 08-23, **production 2026-09-13**; both app-level checks passed (admin console across tenants 09-14, an interview with 12 generated documents 09-15) | 2026-09-15 |
| RLS-8 | Close the unscoped call sites — 34 → 17, all triaged (`031a0c6e`). Its "admin handlers that delegate" follow-up (delete user, unlock, MFA reset, admin copy) closed in `123bb303` with enforcement tests in `rls6-adminAccess.test.ts` | 2026-09-13 |
| RLS-9 | Surface audit in CI, two-way ratchet | 2026-08-25 |
| RLS-10 | Data-driven proof that every policy isolates (38 tables, 0 skipped). Its `TestFactory.createTable` observation fixed in `3d69bb22` | 2026-09-13 |
| RLS-11 | The enforcement gate, red for 9 days — 6 causes fixed, required on `main` | 2026-09-12 |
| — | Doc pass: `TENANT_ISOLATION_RLS.md` brought current (enforcement, admin pool, multer, background jobs) in `33f01bf1` | 2026-09-19 |

### Withdrawn findings — these were WRONG, do not re-file

- **"RLS is enabled on more tables than the policies cover, so those tables
  deny-all."** False. `migrations/0001_enable_rls.sql`'s `FOREACH` loop runs
  *both* `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` for every table in its
  array. The error came from counting literal `CREATE POLICY` occurrences (4)
  without noticing one sits inside a loop covering 24 tables.
- **"Branch protection is off."** False, and it misled several audits. The
  legacy `…/branches/main/protection` API returns 404 *"Branch protection has
  been disabled"* for a repo using **rulesets**, which this one has since
  2026-08-13. Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`.
- **"Migration 0001 is broken — production has 9 policies, the chain yields
  36."** The chain is correct; production is simply behind on migrations. Same
  for `test` until 2026-08-23.
- **"`STORAGE_DRIVER=s3` is unset in production, causing 404s on documents."**
  It has been set since 2026-08-04. There was no 404 incident — only missing
  evidence, which ENV-3 AC4 finally supplied.
- **"A stale `gotenberg:8` image explains the CI-only `pdfFidelity` failure."**
  Tested and false: pulling the current image still passes locally. See the
  scoped-retry rationale in `tests/integration/hardening/pdfFidelity.test.ts`.

---

## Parked entries

### ENV-B1 — `dev.ezbuildr.com` / `test.ezbuildr.com` do not resolve · `operational`

Both are registered on the Railway service with `sync_status: ACTIVE`, but the
registrar records were never created, so certificates sit at
`CERTIFICATE_STATUS_TYPE_VALIDATING_OWNERSHIP` (NXDOMAIN verified 2026-08-15).
Records required:

```
CNAME dev  → t46dsnmf.up.railway.app   TXT _railway-verify.dev  = railway-verify=4c13d8da…
CNAME test → aiq8x4lt.up.railway.app   TXT _railway-verify.test = railway-verify=0e402974…
```

Both environments are reachable meanwhile at their `.up.railway.app` hosts.
**Owner decision 2026-08-15: leave for now.**

**Next step:** create the DNS records at the registrar, then ENV-B2 below.

### ENV-B2 — activating those subdomains requires moving `BASE_URL`/`ALLOWED_ORIGIN` · `operational`

Both currently point at `ezbuildr-prod-{dev,test}.up.railway.app` while
`RAILWAY_PUBLIC_DOMAIN` is the branded host, so OAuth callbacks and CORS would
reject the branded host — the same class of defect as O-2.

**Next step:** do it in the same change as ENV-B1, never separately.

### ENV-B3 — `/health` cannot distinguish environments · `informational`

All three environments run `NODE_ENV=production`, so every one reports
`"environment": "production"`. Anything verifying *"am I hitting dev or prod?"*
must compare the **host or the database**, not `/health`. Confirmed again
2026-08-22 — dev, test and production all report `production`.

**Next step:** none. Recorded so it is not rediscovered as a bug.

### RLS-B1 — the restricted integration suite is not deterministic · `needs-initiative`

> ⚠️ **ID collision.** `BACKLOG.md`'s scan table has a *different*, fixed `RLS-B1`
> (preview.isolation under the gate, 2026-09-11), filed by another initiative. This one
> is still open.

Roughly two files per full restricted run die in `setupIntegrationTest` with
`Registration failed`, and *which* files differ every run. The underlying error
is `users`' WITH CHECK rejecting registration's `tenant_id = NULL` insert, which
can only happen if `app_current_tenant()` is non-NULL on that connection.

Three explanations are **eliminated** — do not re-test them: an async-context
leak (`setupIntegrationTest` mounts `rlsContext`, which opens a fresh store per
request), a session-level GUC (every `set_config` in the repo passes
`is_local = true`), and a leaked open transaction (probed: no older transaction,
no assigned xid, across 196 registrations).

Same-connection instrumentation is left in `server/routes/auth.routes.ts` to
capture it next time it fires. This was why the RLS gate stayed advisory rather
than a required check (RLS-5 AC3). **Re-measured 2026-09-11: zero occurrences in all 29
gate runs since 2026-09-08** (single-fork), so the gate is now a required check on
`main`, and a failing push alerts Slack. Keep the instrumentation — it has not fired, which
is not the same as the cause being found. The restricted gate also runs **parallel**
again since 2026-09-12: the only nondeterminism that reproduced there was concurrent
`ALTER ROLE` in per-worker setup (RLS-11 cause 5), now serialized with an advisory lock.

**Accepted, not closed (2026-09-13).** `RLS4_CUTOVER.md` §6 made "understand the
intermittent Registration failed" a precondition for production. The owner accepted it
on the evidence of 133 CI runs where it never fired, and production was cut over. The
cause is still unknown. **Do not promote this without a fresh occurrence**: an
investigation that cannot reproduce anything can only guess.

**Next step:** read the `RLS-5: registration insert rejected` log the next time
a full restricted run goes red; it prints the schema, role and GUC on the
failing connection.

### RLS-B2 — `records` · **not a separate entry — see `DV-B3`**

Tracked as `DV-B3` (`backlog/DATAVAULT.md`), where it has been filed twice
already. This initiative adds one fact: it is in the RLS table array and now
carries a policy. Whether it holds real tenant data or is vestigial was never
established. **Do not open a third entry for it.**

**Next step:** decide vestigial-or-not before anyone builds on it. Note
`db-holds-only-test-data` applies — there are no legacy production rows to
migrate.

### RLS-B3 — `DEBT-11` is superseded by this initiative · `wont-fix`

`DEBT-11` ("RLS policies defined but not enforced", `product-decision`) described
exactly the state this initiative removed on dev and test. Resolve it as
**promoted and delivered** rather than leaving it parked, or the next audit
re-files it.

**Done 2026-09-19:** production was cut over on 2026-09-13, and `DEBT-11` is marked
delivered in `backlog/TECH_DEBT.md` and in the `BACKLOG.md` index.

### RLS-B4 — background workers are not requests · `informational` (delivered)

Filed as a warning that `RunCompletionJobWorker` and friends run outside any
HTTP request and would need a tenant path of their own. **This happened exactly
as predicted** and is now solved by `server/utils/forEachTenant.ts`: jobs
enumerate tenants and run once per tenant in that tenant's scoped transaction,
rather than being handed a bypass role.

Kept because the reasoning still governs any *new* background job, and because
the failure mode is invisible — an unscoped job completes successfully having
processed nothing.

**Next step:** none. Read `forEachTenant`'s header before adding a scheduled job.
The pattern is also written up in `TENANT_ISOLATION_RLS.md` §2h.

*`RLS-B5` and `RLS-B6` were filed straight into `BACKLOG.md` by other initiatives
(CLN): B5 is fixed, and B6 (`blocks` has no policy) is open there.*

### RLS-B7 — a pass/fail RLS test for every database operation · `wont-fix`

Proposed 2026-08-25: a test per database operation (own tenant succeeds, other tenant
gets nothing) so RLS is proven at "100% of locations". Measured surface: about 980
drizzle call sites across 395 repository methods, 50 repositories and 219 services,
estimated at **200–330 hours** plus a permanent per-method cost and roughly double the
suite runtime.

**Rejected because the table is where enforcement happens, not the operation.** If the
policy on `projects` is right, Postgres filters all 430 selects against it the same way,
so most of those 980 tests would be testing Postgres. The real risk is whether a code
path sets the tenant GUC at all. That is a static-analysis problem (RLS-9's audit) plus
a runtime check (the throw in `server/utils/rlsContext.ts`), not a test-matrix problem.
Deciding evidence: the 2026-08-25 defect (36 policies defined but inert) would have
passed all 980 tests, because they would have run on freshly built schemas. A
table-level structural check found it, and RLS-10 provides that check for 1–2 days of
work.

**Next step:** none. Read this before proposing a bigger RLS-10.

### RLS-B8 — admin MFA reset and unlock bypass the admin audit trail · ✅ FIXED 2026-09-19

> **Closed by `8eef1a8a`.** `AdminAccessService.resetUserMfa` and `unlockUserAccount` now own
> both actions: the `users` write runs pinned to the target's tenant via
> `writeUserInOwnTenant`, and each records an `admin_access_log` row.
> `MfaService.adminResetMfa` became `clearMfaData`, which clears `mfa_secrets` and
> `mfa_backup_codes` and never touches `users`. Two tests in `rls6-adminAccess.test.ts`
> assert the audit rows and their target tenant; both were proven to fail when the audit
> write is suppressed and when the actor's tenant is stamped instead of the target's.
> Original entry follows.

Both work under enforcement: `rls6-adminAccess.test.ts` resets MFA and unlocks a user
in another tenant (`123bb303`). Two gaps remain, found 2026-09-19:

- `MfaService.adminResetMfa` → `disableMfa` → `setUserMfaFlag` writes `users.mfaEnabled`
  through `updateSelfUser`, whose header says never to call it for someone else's row
  or with an id from the request. The admin route passes `req.params.userId`. It is
  safe only because the route has already gated on `isAdmin` and resolved the target
  through `adminAccessService.getUser`. The comment in `MfaService` that calls this
  "still outstanding in RLS_HANDOFF.md" is out of date.
- Neither action writes an `admin_access_log` row. Every other admin user mutation
  (`setUserActive`, `setUserRole`, `deleteUser`) does, via `AdminAccessService`. Only a
  `logger.warn` records an MFA reset, and that is a security-sensitive action.

`account_locks`, `login_attempts`, `mfa_secrets` and `mfa_backup_codes` carry **no RLS
policy**, so the lockout and MFA-table writes are not the problem. Only the `users` flip
and the audit are.

**Next step:** add `AdminAccessService.resetUserMfa` using `writeUserInOwnTenant` plus
an audit record (and the same for unlock), with the route calling it. Keep the existing
`rls6` tests as the regression guard.

### RLS-B9 — prove each bootstrap GUC opens exactly its one row · `enhancement`

RLS-10's matrix deliberately leaves out the bootstrap disjuncts: `app.current_user_id`,
`app.current_login_email`, `app.current_project_id`, `app.current_org_id`,
`app.current_connection_id`, `app.current_workflow_id`, `app.current_signing_token`,
`app.current_envelope_id`, and `tenant_domains`' verified-domain disjunct. Each is
transaction-local, and all 38 policy definitions match the migration chain in
production (pre-swap drift check, 2026-09-13). A test would pin that each one opens
exactly one row and nothing more. There is no known defect behind this.

**Next step:** only if a new bootstrap disjunct is added, or one is widened. Extend
`rls10-policyIsolation.test.ts` rather than writing a new suite.

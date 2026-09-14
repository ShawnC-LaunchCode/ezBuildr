# Environment split & real tenant isolation (ENV / RLS)

**Status:** one open — **RLS-4** (production CUT OVER 2026-09-13 15:33 UTC and **enforcing** — it connects as `ezbuildr_app`; only the owner's app-level checks remain) · RLS-8 ✅ (2026-09-13: 34 → 17 sites, all triaged) · RLS-9 ✅ · RLS-10 ✅ · RLS-11 ✅ · **Updated:** 2026-09-13

> **Most of this initiative is closed and its detail has moved.** ENV-1..4 and
> RLS-1, 2a–2f, 3, 5, 6 and 7 all shipped between 2026-08-15 and 2026-08-22;
> their closure record, the withdrawn findings, and every parked observation are
> in [`tickets/backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md).
> Full original text of any closed ticket:
> `git log -p -- tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`.
>
> **Do not re-file** anything in that file's *Closed* or *Withdrawn findings*
> tables — several of the withdrawn ones misled multiple earlier audits.

**Where the durable knowledge lives** (none of it is in this file):

| | |
|---|---|
| The patterns, §2a–§2g | [`docs/architecture/TENANT_ISOLATION_RLS.md`](../docs/architecture/TENANT_ISOLATION_RLS.md) |
| Current state + the traps that cost real time | [`docs/architecture/RLS_HANDOFF.md`](../docs/architecture/RLS_HANDOFF.md) |
| The cutover procedure, per environment | [`docs/deployment/RLS4_CUTOVER.md`](../docs/deployment/RLS4_CUTOVER.md) |
| How the scope was bounded (retired plan) | [`backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md) |

## Where enforcement actually stands

> ✅ **UPDATE 2026-09-13 — production is enforcing.** All three environments now connect as
> the non-owner `ezbuildr_app` with `RLS_ENFORCED=true`, against 38 policy tables that are
> enabled AND forced. The table below is the 2026-08-25 correction, kept for its lesson; for
> production's cutover record see RLS-4.

> 🔴 **CORRECTED 2026-08-25. The previous version of this table said dev and
> test were enforcing. They were not, and neither was anything else.**
>
> Measured directly against the Neon catalog, not inferred:
>
> | branch | policies | tables with `relrowsecurity` | tables with `FORCE` |
> |---|---|---|---|
> | dev, before 0041 | **37** | **1** (`sections`) | 0 |
> | dev, after 0041 | 37 | **37** | **37** |
> | test | 36 | 36 | 0 |
> | production | 9 | 9 | 0 |
>
> **It was `dev` specifically that had drifted, not the whole estate.** `test`
> got the 0024–0036 chain in one clean deploy on 2026-08-23 and its flags are
> intact, so it *was* genuinely enforcing; it is only missing `FORCE`.
> Production's 9 tables likewise enforce at the database level — but its app
> connects as `neondb_owner`, which holds BYPASSRLS, so nothing is enforced
> there in practice regardless.
>
> **A policy on a table whose `relrowsecurity` is false is inert** — Postgres
> never evaluates it. So 36 of dev's 37 policies were decorative, including
> `projects`, `users`, `workflows` and `connections`. Tenant isolation was
> *defined* everywhere and *in force* nowhere.
>
> Enabling is a separate act from creating a policy, and the chain lost track of
> that: **migrations 0026–0036 contain 23 `CREATE POLICY` statements and zero
> `ENABLE ROW LEVEL SECURITY`**, because they assumed 0001/0024 had already done
> it. On production 0001 silently no-op'd (its `to_regclass ... CONTINUE` guard);
> on dev 0024 did run, and the flag was lost afterwards while 0026's recreated
> policies survived.
>
> Why no test caught it: every RLS suite runs against a **freshly built test
> schema**, where the chain does produce the right state. Nothing ever asserted
> the property against a long-lived environment, so dev could drift silently.
>
> Fixed by **`0041_rls_enable_all_policy_tables`**, which drives the enable off
> `pg_policies` rather than a hand-maintained table list, adds `FORCE` (RLS-4
> AC1), and RAISEs if any policy-bearing table is left unenforcing.
> `tests/integration/rls-coverage.test.ts` now asserts the same property and was
> proven to fail when it is violated.

| environment | app role | RLS enforcing | notes |
|---|---|---|---|
| dev | `ezbuildr_app` | ✅ **2026-08-25** | 42 migrations, 37/37/37 after 0041. Verified live: register + create project + read back on the restricted role |
| test | `ezbuildr_app` | ⚠️ **enforcing, no FORCE** | 37 migrations, 36/36 enabled. Was enforcing all along; 0041 adds FORCE via a `dev` → `test` promotion |
| **production** | `ezbuildr_app` | ✅ **2026-09-13 15:33 UTC** | 50 migrations since PR #185; 38 policy tables, all enabled and forced. Cut over by the owner (RLS-4 cutover record). Re-measured 15:45Z: app pool `ezbuildr_app` ×3 (`rolsuper=f`, `rolbypassrls=f`, 0 memberships), deploy `a5e1e15f` healthy with no 5xx and no error-level logs |

**What this changes.** Production is still the bulk of the remaining work, but
the cutover procedure now needs a catalog check *before* the role swap (§4.0 of
`RLS4_CUTOVER.md`): verifying isolation against tables where row security is off
passes trivially and proves nothing. That check is what would have caught dev,
where the app role ran for three days against inert policies.

---

## How to work this document

- Read this header and **your ticket only**.
- Line numbers are advisory; the **quoted code plus the symbol name** is the locator. Grep
  for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- **Devs do not commit or stage.** The reviewer commits, one commit per passed ticket.
- Run `npm run test:integration`, and **as the non-owner role** via
  `npm run test:rls-gate` (RLS-5). ⚠️ **Also run `npm run test:fast`.** An earlier
  version of this line said the no-DB project covered nothing here and could be
  skipped — that was true when written and is now false: converting a service to
  open a tenant-scoped transaction breaks its mocked-repository unit tests, which
  is exactly how 32 failures reached CI on 2026-08-22. It costs 74 seconds.
- Clear the shared type-check cache before trusting `tsc`: `rm -f node_modules/typescript/tsbuildinfo`.
- **`npm run test:docker:up` starts postgres (5434) *and* gotenberg (3009).** Re-run it after
  any pull; a missing service produces failures that read like code defects. See the
  `run-tests` skill.

---

## Why this initiative exists

Three facts, each verified 2026-08-12:

1. **Local development shares one database with production.** `.env` `DATABASE_URL` points at
   the Neon production instance. A local `npm run db:migrate` hits production. Already
   recorded as `LU-B1` in `tickets/BACKLOG.md` and never resolved.
2. ~~**`main` auto-deploys to production with no staging gate, and branch protection is off**~~
   **WRONG — corrected 2026-08-15.** Protection is enforced by a *ruleset*, which the legacy
   `…/branches/main/protection` endpoint cannot see; it returns 404 "Branch protection has
   been disabled" regardless. Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`
   instead. `main-protection` is active with deletion, non-fast-forward, PR-required and 4
   required checks. See ENV-4.
3. **Row-level security is defined but structurally inert.** Details in Phase 2.

Phase 1 must land before Phase 2 starts. Making RLS real requires connecting as a
non-owner role and running a full integration suite against a database you are willing to
break — doing that against the production database is the hazard Phase 1 removes.

## Withdrawn findings — do not re-file

### ⛔ Considered and rejected 2026-08-25: a pass/fail RLS test per DB operation

The proposal was a test per database operation — own-tenant succeeds,
cross-tenant returns nothing — so that RLS is proven at "100% of locations".
**Measured surface:** ~980 drizzle call sites (430 `.select(`, 256 `.update(`,
165 `.delete(`, 129 `.insert(`) across 395 repository methods, 50 repositories
and 219 services. Two cases each with fixtures in two tenants across 37 tables
of FK chains ≈ **200–330 hours**, plus a permanent per-method tax and roughly
double the suite runtime (already 872s).

**Rejected because the enforcement point is the table, not the operation.** If
the policy on `projects` is correct, Postgres filters all 430 selects against it
identically — 980 operation tests would mostly be testing Postgres. The real
risk was never "does the policy filter", it is "does this code path set the
tenant GUC at all", which is a static-analysis and runtime-invariant problem
(RLS-9, and the existing throw at `server/utils/rlsContext.ts:214`), not a test-
matrix problem.

**The decisive evidence:** the 2026-08-25 defect — 36 policies defined and inert
— would **not** have been caught by any of those 980 tests, because they would
all have run against freshly built test schemas where the migration chain works
correctly. It was a table-level structural property, and a table-level
structural check is what found it. RLS-10 buys that property deliberately, for
1–2 days instead of eight weeks.


Five claims from earlier audits were investigated and proved **wrong**, two of
them after misleading several passes ("branch protection is off", "migration
0001 is broken"). They are listed with their disproof in
[`backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md#withdrawn-findings--these-were-wrong-do-not-re-file).
Check that table before filing anything against this area.

---

## RLS-4 — Add `FORCE ROW LEVEL SECURITY` and move off the owner role 🔄 dev + test + production CUT OVER (production 2026-09-13); owner's app-level checks pending

### Progress — 2026-08-22 · **dev is cut over and enforcing**

Procedure, measured Neon facts and rollback: [`RLS4_CUTOVER.md`](../docs/deployment/RLS4_CUTOVER.md).

| AC | State |
|---|---|
| 1. Migration sets `FORCE` on every policy table | ❌ **not done — and read this before doing it.** `neondb_owner` holds `BYPASSRLS` *directly*, and BYPASSRLS beats FORCE, so a FORCE migration alone changes nothing here. The isolation comes from AC2. FORCE is still worth adding as defence against a future non-bypassing owner, but it is not what makes this work. |
| 2. Least-privilege role, not owner, no BYPASSRLS | ✅ `ezbuildr_app` on the dev branch — `rolbypassrls=false`, no role memberships |
| 3. `DATABASE_URL` uses it in dev and test | ✅ **both done** — dev 2026-08-22, test 2026-08-23. `production` is the only one left, and this AC gates it on exactly what has now happened |
| 4. Cross-tenant read proven impossible | ✅ as the app role with tenant A pinned: that tenant's rows only, **0** from any other |
| 5. Proven non-vacuous, incl. the empty-string trap | ✅ GUC unset → **0**; GUC `''` → **0**; real tenant → its rows. Both fail-closed |
| 6. Documented rollback | ✅ `RLS4_CUTOVER.md` §5 — variable change + redeploy, no migration to revert |

⚠️ Cutting over broke the first deploy: container start runs `db:migrate`, which
needs DDL the app role does not have. Fixed by `MIGRATION_DATABASE_URL`
(`scripts/runMigrations.ts`), which `test`/`production` must also set.

### ✅ `test` CUT OVER 2026-08-23 — the block below is resolved, kept for the lesson

Promoting `dev` → `test` (138 commits, fast-forward) ran the migrations at
deploy time and took the test database from 24 migrations to **37**, and from
**0** RLS-enabled tables to **36**. The same enforcement check that failed
before then passed:

| as `ezbuildr_app` on test | before promotion | after |
|---|---|---|
| no tenant GUC | 2 projects | **0** |
| GUC = `''` | 2 projects | **0** |

Cut over with all four variables set together — including
`MIGRATION_DATABASE_URL`, which is why it booted first try where dev took two
attempts. Verified: `Admin DB: initialized.` in the boot log, `/health` healthy,
and `pg_stat_activity` showing `ezbuildr_app` ×3 (app) alongside `neondb_owner`
×3 (admin pool + migrations).

**The lesson to keep:** the verification step is what caught this. Setting the
four variables without running the check would have produced a green-looking
cutover on a database with no policies at all — enforcement "on", isolation
absent, and nothing to indicate it.

### 🔴 The original block (resolved) — `test` had no RLS policies at all

Attempted 2026-08-22 and stopped on the verification step, which is what that
step is for. As `ezbuildr_app` on the test branch with **no** tenant GUC:
`SELECT count(*) FROM projects` returned **2**, not 0.

Cause: the test database is **13 migrations behind**.

| branch | `drizzle.__drizzle_migrations` | latest |
|---|---|---|
| dev | **37** | 2026-08-22 |
| test | **24** | ~2026-08-09 |

Everything from 0024 to 0036 is missing there — which is the entire RLS policy
chain (0026–0036) plus the coverage repair (0024). `pg_class.relrowsecurity` is
`false` and there are zero policies on `projects`, `users`, `workflows` and
`connections`. Nothing to enforce, so a non-owner role changes nothing.

The test environment only runs migrations when something deploys to it, and the
`test` git branch is **131 commits behind `dev`**.

**The order was forced, and all three steps are now done:**

1. ✅ CI green on `dev` (2026-08-23).
2. ✅ Promote `dev` → `test` — the deploy ran `db:migrate` to 0036.
3. ✅ Cut `test` over and re-verify.

**Production needs the same three steps**, and step 1 there is a `test` → `main`
pull request, not a push.

### Production checklist — measured 2026-08-25, role creation deferred to cutover

Verified on branch `br-fancy-band-ahrwpxhj`: **106 tables, 9 RLS-enabled, and the
only login roles are `neondb_owner`, `cloud_admin`, `neon_service`.** There is
**no `ezbuildr_app` on production** — Neon copies roles at branch time, and both
`dev` and `test` were branched on 2026-08-13, before that role existed. It must
be created there with the SQL in `RLS4_CUTOVER.md` §2.

Owner decision, 2026-08-25: **create the role during the cutover, not ahead of
it**, so role creation and the variable swap are one operation. Password to be
generated at that time and rotated by the owner before it is trusted.

Run in this order — the first two are not RLS work:

1. ✅ **`test` → `main` pull request** — PR #185, merged 2026-09-12 (`0d31887d`),
   the first promotion gated by the required `RLS Enforcement Gate` check.
2. ✅ **Merge deploys and runs `db:migrate`** — production went 24 → **50**
   migrations and 9 → **38** RLS tables (§4.0 pre-flight 38 / 38 / 38, measured
   2026-09-12). The policies exist; steps 3–6 are now safe to run.
3. **Create and verify `ezbuildr_app`** (§2), connecting as `neondb_owner`. Use
   SQL, never the Neon Console/API/CLI — a console-created role inherits
   `neon_superuser` and silently bypasses RLS. Assert `rolsuper`/`rolbypassrls`
   both `f` and `pg_auth_members` empty before going further.
4. **Capture the current production `DATABASE_URL` first** — that exact value
   becomes `ADMIN_DATABASE_URL`. The admin bypass role *is* `neondb_owner`; no
   second role is created.
5. **Set all four Railway variables together, then redeploy.** Omitting
   `MIGRATION_DATABASE_URL` is what broke dev's first deploy: container start
   runs `db:migrate`, which needs DDL the app role does not have.
6. **Verify** (§4): as `ezbuildr_app`, no GUC → 0 rows; GUC `''` → 0 rows;
   tenant A pinned → A's rows only, 0 from any other.

⚠️ **Do not repoint `DATABASE_URL` before step 2 has run.** Production has no
policy chain today, so an app role going live first reproduces exactly the
failure that stopped the `test` cutover on 2026-08-22: enforcement "on", nothing
to enforce, and no signal that anything is wrong.

The `ezbuildr_app` role already exists on the test branch (created 2026-08-22,
`rolbypassrls=false`, no memberships) and `ALTER DEFAULT PRIVILEGES` is set, so
tables created by migrations 0024–0036 will be granted to it automatically. Only
the four Railway variables and the redeploy remain.

Running the migrations against test out of band would work, but it would put the
schema ahead of the code it is meant to be a snapshot of, which is the one thing
the promotion model exists to prevent.

**Rehearsed 2026-09-12 on a production clone** — Neon branch
`rehearsal-rls4-cutover-2026-09-12` (`br-weathered-heart-ahyygddn`), branched from
production after the promotion. The runbook's §2 SQL ran clean, and every check passed
against production's own schema and data:

| check | result |
|---|---|
| §4.0 pre-flight — policy tables / enabled / forced | **38 / 38 / 38** |
| `ezbuildr_app` `rolsuper` / `rolbypassrls` | `f` / `f` |
| `ezbuildr_app` role memberships | **0** |
| as `ezbuildr_app`, no tenant set — projects / users | **0 / 0** |
| same — workflows visible | 46 of 86: exactly the public + active ones, **0 private** |
| tenant pinned (owns 4 of the 5 projects) — projects visible | **4**, and **0** rows from the other tenant |
| GUC the policies read | `app.current_tenant_id` (from `app_current_tenant()`'s definition) |

Production holds **2 tenants, 5 projects, 86 workflows and 3 users**, so a bad cutover
has a small blast radius, and rollback (runbook §5) is a variable change plus a redeploy.

What the rehearsal deliberately does NOT prove — do not read more into it:

- **Nothing about the app's code paths.** That is what the RLS gate measures and what
  three weeks of enforcement on `dev` have exercised. RLS-8's surface audit still reports
  **34 unscoped call sites** (all allowlisted, 2026-09-12).
- `GRANT ezbuildr_app TO neondb_owner` was run on the clone **only** so `SET ROLE` could be
  tested over the MCP connection. It is not part of §2 and must not be run on production —
  see the runbook's §2 note on proving enforcement.

**Pre-swap drift check, 2026-09-13 — production matches the migration chain exactly.**
Compared read-only against a schema freshly built from migrations (local Postgres 16.12,
production 17.10). Schema prefixes were stripped, because Postgres prints them for a
non-`public` schema.

| object | compared on | result |
|---|---|---|
| `tenant_isolation` policies | table, command, permissive, roles, and hashes of `USING` and `WITH CHECK` | **38 / 38 identical** |
| RLS helper functions (`app_current_tenant`, `app_owner_tenant`, `app_datavault_{database,table,row}_tenant`) | volatility, `SECURITY DEFINER`, and a hash of the full definition | **5 / 5 identical** |

So RLS-10's per-table isolation proof applies to production's current definitions, which
have been enforced there since the 15:33 UTC cutover the same day.

**Was owner-only — done 2026-09-13, see the cutover record below:** create the role on production with a password you
generate (owner decision 2026-08-25), then set the four Railway variables in one change and
redeploy (runbook §3). The runbook's own precondition — §6, understand the intermittent
"Registration failed" before production — is still open.

**✅ CUT OVER 2026-09-13, 15:33 UTC.** The owner ran the cutover script from their own
terminal (runbook §2–§3 automated; it stops at the first failed check and never prints a
secret — Claude's auto-mode classifier blocks production writes, so it could not):

| step | result |
|---|---|
| role | `ezbuildr_app` created: `rolsuper=f`, `rolbypassrls=f`, 0 memberships |
| pre-flight | 38 / 38 / 38 |
| isolation, connected AS `ezbuildr_app` | no tenant → 0 projects; tenant pinned → its 4 projects, 0 from the other tenant |
| variables, one change | `DATABASE_URL`=`ezbuildr_app`; `ADMIN_DATABASE_URL` and `MIGRATION_DATABASE_URL`=`neondb_owner`; `RLS_ENFORCED=true` |
| deploy `a5e1e15f` (`681f8f76`) | migrations ran `using MIGRATION_DATABASE_URL`; boot log `Admin DB: initialized.`; `/health` healthy; no 5xx |
| live connections | `ezbuildr_app` ×3 (app pool), `neondb_owner` ×4 (admin + migrations) |

**Still owed — needs the owner's login:** the admin console must list **both** tenants (a short
but plausible list means `ADMIN_DATABASE_URL` is not in effect), and one interview must run end
to end with a generated document. The §6 "Registration failed" precondition was **accepted** by the
owner on 2026-09-13 on the evidence in runbook §6 (133 silent CI runs), not closed. **Rollback** is
unchanged: point `DATABASE_URL` back at the `ADMIN_DATABASE_URL` value, set `RLS_ENFORCED=false`,
redeploy.

**What this changes for everyone:** a query on a tenant table that runs outside a tenant
transaction now returns **zero rows in production** instead of everything — the failure looks like
missing data, not an error.

**Priority: P0** · Size: S · **UNBLOCKED** — RLS-2, RLS-3, RLS-6 and RLS-7 all closed
2026-08-22, and the admin-access path called out below was built. Gated now only on a
`test` → `main` PR, which is a promotion decision rather than an RLS one. · Files:
Railway/Neon role configuration, `.env.example` (the migration half shipped as 0041)

> ### 🔴 DISCOVERED 2026-08-18 — this ticket silently breaks the admin console
>
> Measured, not theorised. Three facts that combine badly:
>
> - The policy is bare `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`
>   with **no platform-admin clause** (`migrations/0001_enable_rls.sql`).
> - **`users` is in the covered table list**, along with `projects`, `organizations`, `files`,
>   `records` and the rest.
> - Admin endpoints read **globally**: `userRepository.findAllUsers()`,
>   `findAllUsersWithWorkflowCounts()`, and `workflowRepository.findAttributedToUser(userId)`
>   for any user regardless of tenant (`server/routes/admin.routes.ts`).
>
> The moment `FORCE` lands and the app runs as a non-owner role, `/api/admin` returns **only
> the admin's own tenant** — not an error, just a truncated list. **That is the worst failure
> shape: a console that looks like it is working.**
>
> Note this also answers "does RLS stop admin seeing everything?" — **today it does not**,
> because owners bypass RLS until `FORCE` is set, so admin access is gated purely by
> `users.role` in the application layer. Enforcing RLS constrains admin *harder than intended*
> unless an explicit path is built first.
>
> **Repo owner requirement, 2026-08-18:** admins must keep the ability to see and help users —
> including **running a workflow to replicate a reported problem** and **working inside the
> user's account for testing**. That is a support-access feature, not a flag on this ticket.
>
> **Therefore: the admin-access path must land BEFORE this ticket — it is now `RLS-6`**, added
> 2026-08-18 and scoped by the owner to the minimum that unblocks `FORCE` (cross-tenant read
> path + audit). Tenant-switching support sessions and impersonation are a separate initiative
> afterwards. Shipping `FORCE` first would break support at exactly the moment tenant
> isolation starts being enforced.
>
> **Do not resolve this by giving the application role `BYPASSRLS`.** That would return the
> system to "one connection sees everything" and delete the property this whole phase exists to
> create. AC2 below stays as written.
>
> ### 🛑 BLOCKING (measured 2026-08-20): the policies raise instead of filtering
>
> **Do not set `FORCE` anywhere until this is fixed.** Proven by
> `tests/integration/rls4-forceEnforcement.test.ts` against a real non-owner role:
> with `FORCE` on and no tenant pinned, a query does **not** return zero rows — it
> **raises** `invalid input syntax for type uuid: ""`.
>
> Once a custom GUC has been touched on a connection it reverts to **empty string**, not
> unset, and every policy casts unguarded:
> `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`.
> `''::uuid` raises. **No policy in `0001` or `0024` wraps it in `NULLIF`** (verified).
>
> Fail-closed either way — nothing leaks — but the operational difference is large. The app
> uses a **pooled** connection, so any query running outside a tenant transaction on a
> connection that previously served one returns a hard **500** rather than an empty result.
> That is most of the app, on day one of enforcement.
>
> **Fix before FORCE:** rewrite the policies as
> `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`, which yields NULL,
> filters the row, and does not raise. It needs a new migration recreating the policies —
> `0001`/`0024` are applied and immutable.
>
> ### 🔴 Three preconditions, all discovered after this ticket was written
>
> **1. Ordering (from RLS-6).** Provision `ADMIN_DATABASE_URL` **first**, then set `FORCE` and
> `RLS_ENFORCED` **together**. `AdminAccessService` throws if `RLS_ENFORCED` is on without the
> admin pool — but `RLS_ENFORCED` is an application flag, **not** `FORCE` itself, so setting
> FORCE while the flag is false leaves that guard blind and the admin console truncates
> silently.
>
> **2. ✅ CLOSED 2026-08-19 — `AdminOrgStatsService` now reads through the admin path.**
> `AdminOrgStatsRepository` gained an `adminDbOverride`, `AdminAccessService` gained an audited
> `listOrgStats`, and the service reads through it, preserving RLS-6's containment (it never
> imports `adminDb` itself). Original finding follows.
>
> ~~**`AdminOrgStatsService` is not on the admin path (from RLS-2d).**~~
> `AdminOrgStatsRepository` imports the **normal** `db` pool and is **not** in RLS-6's `adminDb`
> allowlist. It is an admin-only cross-tenant aggregate, so under `FORCE` it returns only the
> acting admin's own tenant's organizations — no error, just a short list. **Route it through
> `AdminAccessService`/`adminDb` and add it to the containment allowlist before FORCE.**
>
> **UPDATED 2026-08-20 — the rollout finished and the list grew to five. Treat this as a
> checklist to verify, not a note to have read.** Precondition 2 is already CLOSED; the other
> four are open. Every one of them is a *silent* failure: no error, just wrong or missing data.
>
> **4. `BrandingService.resolveForWorkflow` (from RLS-2e).** `resolveTenantIdForWorkflow` reads
> **`workflows`** — RLS-covered — on the pool with no GUC, so it returns zero rows, `tenantId`
> comes back null, and the client portal renders **default branding instead of the tenant's**.
> Wrong logo and colours on a customer-facing page. Note it is `workflows` that is exposed, not
> the branding column: `tenants` has no policy, so checking there finds nothing and misleads.
>
> **5. `VariableService.listVariables` (from RLS-2e).** Called by
> `TemplateValidationService.validate`. Under `FORCE` it sees **zero variables** for the
> workflow's sections and steps, so validation reports a template **clean when it is not** —
> and template validation is the gate that stops broken documents reaching customers.
>
> **Also flagged, and this one is acceptable as-is:** `WorkflowClonerService.copyWorkflowAsAdmin`
> is a genuine cross-tenant admin path left with no GUC. Under `FORCE` it **fails closed**
> (throws or copies nothing) rather than leaking. Give it RLS-6-style bypass treatment when
> convenient; it is not a correctness risk in the meantime.
>
> **3. Token-authenticated bootstrap lookups (from RLS-2c).**
> `SignatureRequestService`'s `getSignatureRequestByToken` / `signDocument` /
> `declineSignature` and the `markExpiredRequests` cron perform an **unscoped initial SELECT** —
> the token is the authorization, and the row's own `tenantId` then drives every write. Under
> `FORCE` that bootstrap runs with **no tenant GUC**. `RunFileUploadService` has the same shape
> and was left unconverted for the same reason. Decide deliberately how these read under FORCE;
> they are the public signing portal, so getting it wrong is a customer-visible outage.

### Finding

Postgres exempts a table's owner from RLS unless the table is set to
`FORCE ROW LEVEL SECURITY`. There is no `FORCE` anywhere in the repo, and the application
connects as `neondb_owner` — the owner. Both conditions must change or the policies stay
decorative.

### Preferred fix

Two changes that must land together, and **never on production first**:

1. A migration setting `FORCE ROW LEVEL SECURITY` on every table with a policy.
2. A dedicated least-privilege application role — `SELECT/INSERT/UPDATE/DELETE` on the
   application tables, **not** the owner, no `BYPASSRLS` — with `DATABASE_URL` repointed to it
   per environment.

Migrations continue to run as the owner; only the application runtime uses the restricted role.

Sequence: dev → test → production, with RLS-5 green at each step. This is the ticket that can
take the product down, and the blast radius is "every query returns zero rows".

### Ties

- Depends on **RLS-2** (GUC is set) and **RLS-3** (coverage known).
- Load `db-schema-change`.
- ⚠️ `LU-B1` — until ENV-1 lands, a local `db:migrate` hits production. Phase 1 must be done.

### Acceptance criteria

1. A migration sets `FORCE ROW LEVEL SECURITY` on every table carrying a policy.
2. A least-privilege application role exists; it is not the table owner and lacks `BYPASSRLS`.
3. `DATABASE_URL` uses that role in dev and test; production only after RLS-5 passes in both.
4. **A cross-tenant read is proven impossible at the database level**: as the app role with the
   GUC pinned to tenant A, a direct query for a tenant-B row returns zero rows — pasted output.
5. **Proven non-vacuous**: with the GUC unset, the same query also returns zero rows (fail-closed,
   not accidentally-permissive). Note the known trap that an **empty-string** GUC behaves
   differently from an unset one — cover both.
6. A documented rollback: how to revert to the owner role if production degrades.

---

---

## RLS-8 — Close the 32 call sites that bypass tenant scoping ✅ DONE 2026-09-13

**Priority: P1** · Size: M · Files: see the audit output — run
`npx tsx scripts/audit-rls-surface.ts`

### ✅ What shipped — 2026-09-13

Production began enforcing RLS the same day (RLS-4), which turned this from
hygiene into live defects: an unscoped read of a covered table returns **zero
rows, not an error**, so every one of these answered normally while doing
nothing. The audit went from 34 sites to **17, every one triaged** in
`.rls-surface-allowlist.json` as DELIBERATE or a verified FALSE POSITIVE.

Real defects fixed, each with a test that fails on the old code under the RLS
gate and passes on the new (`tests/integration/rls8-scopedPaths.test.ts`, the
RLS-8 block of `rls6-adminAccess.test.ts`, `tests/unit/services/alerts.batchEvaluate.test.ts`):

| Path | Was, under enforcement | Fix |
|---|---|---|
| Admin activate / deactivate / role change | "User not found" for any user in a tenant | `AdminAccessService.setUserActive/setUserRole`: resolve the target's tenant on the admin pool, write pinned to it |
| Admin all-workflows list | public + active workflows only | `AdminAccessService.listAllWorkflows` on the admin pool |
| Admin stats | ~0 users and workflows | `getPlatformStats` passes the admin handle to both counts |
| SLI job (`computeAndSaveSLIs`) and alert batch | threw "no tenant in context" per row, swallowed | each row runs in `runWithTenantContext(row.tenant_id)` |
| `/api/workflow-analytics/timeseries`, `/sli` | empty series, 0 runs, empty history | reads wrapped in `withCurrentTenant` |
| Snapshot save-from-run / validate | saved `{}`; every snapshot "safe" | step joins wrapped in `withCurrentTenant` |
| Tenant member-role change | 404 "User not found in this tenant" | UPDATE pinned to the URL's (validated) tenant |
| Email verification | 200, but the flag never persisted for a user with a tenant | self-identification write (`findSelfUser`/`updateSelfUser`) |

Also: `DatavaultDatabasesRepository` and `ReadTableBlockRunner` built their
inlined subqueries on the pool (harmless, but unreadable to the audit and to
people) — now on the caller's connection and a connection-less `QueryBuilder`;
`BlockRunner.runPhaseWithTransaction` was dead code and is deleted.

Found by the new tests, not by the audit: `SystemStatsRepository.getOrInitialize`
raced itself — the stats endpoint initializes from two parallel reads, both
inserted row 1, and the dashboard 500ed on any database with no stats row yet.
Now `ON CONFLICT DO NOTHING`.

**Follow-up, not done here:** the admin handlers the audit does not flag
because they delegate to other services (`adminUserService.deleteUser`,
`accountLockoutService`, `mfaService.adminResetMfa`, `workflowClonerService`)
were not walked end to end under enforcement.

### Finding

The audit reports **32 remaining call sites** (down from 121 at RLS-2f). These
are precisely the paths that do **not** go through `withCurrentTenant`, which is
why the runtime throw at `server/utils/rlsContext.ts:214` never fires for them —
they are the residue the tripwire cannot see.

As measured 2026-08-25:

| bucket | count | worst offenders |
|---|---|---|
| repository calls, no scoping helper at all | 5 | `admin.routes.ts` (5/5) |
| scoped somewhere, unthreaded sites remain | 2 | `auth.routes.ts`, `WorkflowPatchService.ts` |
| direct `db.*` on covered tables | 18 | `DatavaultDatabasesRepository` (4), `SnapshotService` (3), `MfaService` (2), `sli.ts` (2) |
| relational `db.query.<table>` reads | 2 | `public.routes.ts` |
| bare `db.transaction()` | 2 | `auth.routes.ts`, `BlockRunner.ts` |
| raw `db.execute()` naming a covered table | 3 | `UserRepository`, `BranchingService`, `DropoffService` |

`admin.routes.ts` is expected to be cross-tenant and should route through
RLS-6/RLS-7's `adminDb` path rather than being "fixed" to scope. The rest need
triage one by one — some are legitimate bootstrap paths (token-authenticated
lookups, see RLS-4 precondition 3) and should be *documented* as such, not
scoped.

### Acceptance criteria

1. Every one of the 32 sites is either scoped, routed through the admin path, or
   annotated with a one-line reason why it is a deliberate exception.
2. `audit-rls-surface.ts` reports zero untriaged sites.
3. `npm run test:rls-gate` still green, allowlist still empty.

### Ties

- Depends on nothing; blocks nothing. Do it before RLS-9's ratchet is turned on,
  or the ratchet starts red.

---

## RLS-9 — Put the surface audit in CI with a two-way ratchet ✅ DONE 2026-08-25

**Priority: P1** · Size: S · Files: `scripts/audit-rls-surface.ts`,
`.github/workflows/rls-gate.yml` (or a new workflow), a new allowlist file

### Finding

**`scripts/audit-rls-surface.ts` is not wired into CI.** Verified 2026-08-25: it
appears in no workflow and in no `package.json` script, and it has no allowlist,
no baseline and no non-zero exit. It is a tool someone must remember to run.

That is the actual hole in RLS coverage. The gate (`rls-gate.yml`) catches a
lost scope only when some integration test asserts data comes back — and RLS
read failures are **silent**, returning empty rather than throwing. So nothing
currently stops call site #33 from landing.

### Preferred fix

Give it the same **two-way ratchet** as `.rls-allowlist.json`, which is the
design that has kept the gate honest: an unlisted finding fails the build, *and*
a listed entry that no longer reproduces also fails, with an instruction to
delete it. One-way lists rot into decoration — this repo has been bitten by that
shape more than once.

### Acceptance criteria — all met 2026-08-25

| AC | State |
|---|---|
| 1. Audit runs in CI on `dev`, `test`, `main` | ✅ new `rls-surface-audit` job in `.github/workflows/rls-gate.yml`, same branch triggers. Deliberately a separate job with **no database and no containers** — it finishes in seconds, so a static regression is not buried behind the 15-minute integration gate |
| 2. A new unscoped call site fails | ✅ proven — see below |
| 3. A stale entry fails with "delete this entry" | ✅ proven — see below |
| 4. Proven non-vacuous | ✅ **all five directions exercised**, not just the two required |

**Proof — mutate the target, confirm red** (the convention this repo exists on;
a check that has never failed is not known to work):

| mutation | result |
|---|---|
| new unscoped `db.select().from(projects)` in a fresh file | ❌ `NEW unscoped call sites` — exit 1 |
| allowlisted file's count lowered (site count went UP) | ❌ `Allowlisted files that got WORSE: 1 -> 3` — exit 1 |
| allowlisted file's count raised (site count went DOWN) | ❌ `IMPROVED — tighten the ratchet: 9 -> 3 (set count to 3)` — exit 1 |
| fabricated entry for a file with no findings | ❌ `no longer reproduce — DELETE them` — exit 1 |
| allowlist file removed entirely | ❌ `A missing allowlist is a FAILURE, never a pass` — exit 1 |
| clean tree | ✅ `32 call site(s) across 20 pair(s); 20 allowlisted` — exit 0 |

That last row is the one that matters most: a missing or unreadable allowlist
**fails** rather than reading as "no findings". That exact failure shape is how
the integration suite once went months without running in CI at all.

### What shipped

- `scripts/audit-rls-surface.ts` gained the gate (`--report` still gives the old
  report-only behaviour and always exits 0).
- `.rls-surface-allowlist.json` — **20 entries, 32 sites**, each with a
  diagnosed reason and a recorded triage outcome. It is RLS-8's worklist, not
  absolution.
- `npm run audit:rls-surface` / `audit:rls-surface:report`.
- Categories are **stable identifiers** (`repo-call`, `db-call`, `raw-execute`,
  …), not the human headings in the report — renaming a heading must not
  silently invalidate every allowlist entry.

### Note for RLS-8

The ratchet's downward direction means **fixing a site turns the build red**
until its count is lowered or its entry deleted. That is intended: it is the
mechanism that stops progress silently reverting. Expect to edit the allowlist
in the same commit as each fix.

---

## RLS-10 — Data-driven proof that every policy actually isolates ✅ DONE 2026-09-13

**Priority: P2** (the cheap check to run before the RLS-4 production role swap) · Size: M · Files: **new**
`tests/integration/rls10-policyIsolation.test.ts` only. No server code, no migrations.

### ✅ Verified 2026-09-13 (reviewer)

**Shipped:** one suite, 44 tests.
- It enumerates **38 policy tables** from `pg_policies` and seeds all 38, so `SKIPPED = {}`.
- Each table runs the five-condition matrix.
- Two more tests cover coverage: every table must have a seeder, and `SKIPPED` must stay empty.
- An in-suite probe proves the check is non-vacuous. The three rulings are pinned.

**No isolation defect was found** in any of the 38 policies.

**Reviewer mutations against real tables** (the gate's own probe is not enough on its own):

| mutation | result |
|---|---|
| `collections` policy → `USING (true)` | 🔴 no-GUC visibility and a cross-tenant leak, both directions |
| `datavault_values` policy dropped (derived table) | 🔴 each tenant loses its own rows |
| `code_block_runs` keeps the parent join, loses the tenant check | 🔴 leak |
| `teams` + `OR current_setting('app.current_tenant_id', true) IS NULL` | 🟢 **passed the dev's version** → fixed at review, now 🔴 |

**Fixed at review (reviewer-fix path):** the "no tenant GUC" condition reused one restricted
connection. Once a transaction has touched the GUC, Postgres reads it back as `''`, not unset.
So after the first table, "unset" was a second copy of the empty-string check, and a policy
that opened only when the setting was truly unset passed (row 4 above). Condition 1 and the
two ruling tests now use a fresh connection. The reviewer also added a guard so an empty seeded
set throws rather than passing vacuously.

**Gates:**

| gate | result |
|---|---|
| file, normal mode | 44/44 |
| file, `RLS_RESTRICTED=true` | 44/44 |
| `npm run test:rls-gate` | 152/152 files, 1442 tests, 0 failing, allowlist empty |
| `test:fast` | 340 / 3906 (unchanged) |
| `tsc` | 0 errors |
| scoped eslint | clean |

**What it does not prove:** like `rls-coverage.test.ts`, it runs against a schema freshly built
from the migration chain. It says nothing about whether a long-lived environment's policy
*definitions* have drifted from that chain, which is the shape of the 2026-08-25 defect. **Done for
production 2026-09-13:** all 38 policies and all 5 RLS helper functions are identical to a
migration-built schema. See RLS-4's pre-swap drift check.

**Observation (not a ticket):** `TestFactory.createTable` omits `tenantId`, although
`datavault_tables.tenant_id` is NOT NULL, so every caller has to pass `{ tenantId }` in
`overrides`. The fix is one line in `tests/helpers/testFactory.ts`.

### Finding

`rls-coverage.test.ts` now proves every policy-bearing table is **enforcing**
(`ENABLE` + `FORCE`, added with migration 0041). It does **not** prove any
policy actually *isolates* — a policy could be enabled, forced, and wrong.

The 27 integration files that assert cross-tenant denial cover a hand-picked
subset of tables, chosen by whoever wrote them. There is no table-driven proof.

### Preferred fix

One suite that enumerates covered tables from `pg_policies` — not a hand-written
list, which is the mistake migrations 0001/0011/0024 each made in turn — and
asserts isolation for each one as a non-owner role. New covered tables are then
included automatically, which is the property that makes this worth writing.

#### Re-audit, 2026-09-13: what the policies actually look like

Measured on the dev Neon branch (`pg_policies`, 38 tables, all enabled and forced).
The original four-row table below assumed every policy is `tenant_id = GUC`. **They
are not**, and a dev who writes the naive version will hit three false failures:

| shape | tables | how the tenant is found |
|---|---|---|
| **direct** — `NOT (tenant_id IS DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)` | 24 incl. `ai_usage`, `audit_logs`, `collections`, `records`, `teams`, `metrics_*`, `sli_*`, `run_resume_links`, `run_document_deliveries`, `workflow_blueprints`, `datavault_databases`/`_tables`/`_api_tokens`/`_row_notes`/`_number_sequences` | the row's own `tenant_id` |
| **derived** — no `tenant_id` column | `datavault_columns`, `_rows`, `_values`, `_unique_keys`, `_table_access`, `_table_permissions`, `_database_access` (via `app_datavault_*_tenant(...)`); `code_block_runs` (run → workflow); `workflows`, `pages`, `sections`, `steps` (via `app_owner_tenant(...)` on the workflow) | a parent row |
| **bootstrap disjuncts** (an extra `OR` that opens one row by id/token) | `users` (`app.current_user_id`, `app.current_login_email`), `projects` (`app.current_project_id`), `organizations` (`app.current_org_id`), `connections` (`app.current_connection_id`), `workflows` (`app.current_workflow_id`), `signature_requests` (`app.current_signing_token`, `app.current_envelope_id`), `tenant_domains` (verified domain = `app.current_branding_domain`) | as direct/derived, plus the disjunct |

Three behaviours are **deliberate rulings**, not leaks. Pin each with an assertion and a
comment citing its source; do not "fix" them:

1. **NULL-tenant rows are visible when no tenant is pinned.** `IS NOT DISTINCT FROM` is
   migration `0027_rls_null_tenant_isolation.sql` — the registration/bootstrap case. A
   NULL-tenant row must still be **invisible** once any real tenant is pinned. Only four
   covered tables allow NULL `tenant_id`: `audit_logs`, `projects`, `users`,
   `workflow_blueprints`.
2. **`workflows` with `is_public = true AND status = 'active'` — and their `pages`,
   `sections`, `steps` — are visible with no tenant pinned.** That is the anonymous
   public-link runner. Seed the isolation fixtures as **private** workflows so this escape
   does not apply, and pin the escape separately with one public active workflow.
3. **Bootstrap GUCs are out of scope** for the matrix. They are transaction-local and
   unset on a fresh transaction; the suite must not set them. (Proving each one opens
   exactly its one row is a possible follow-up — record it as an observation, don't build it.)

#### The matrix — per table, as the restricted role, each in its own transaction

`seededA` / `seededB` are the primary keys of the rows **this suite** seeded for tenant
A / B. Always intersect with them: other files in the same worker schema leave rows
behind, so "count(*) = 0" is wrong.

| condition (set with `set_config(..., true)` inside `BEGIN`) | expected |
|---|---|
| no tenant GUC | `visible ∩ (seededA ∪ seededB) = ∅` |
| GUC = `''` (the empty-string trap) | same |
| GUC = tenant A | `visible ⊇ seededA` **and** `visible ∩ seededB = ∅` |
| GUC = tenant B | `visible ⊇ seededB` **and** `visible ∩ seededA = ∅` |
| GUC = tenant A, `UPDATE t SET <pk> = <pk> WHERE <pk> = ANY(seededB)` | 0 rows affected (then `ROLLBACK`) |

The `visible ⊇ seededA` half is what catches a policy that is dropped or over-strict —
FORCE with no policy is default-deny, which a "sees nothing foreign" check alone would
pass. Resolve the primary-key column(s) from the catalog (`pg_index.indisprimary`), not
by assuming `id`.

#### Shape of the implementation

- **One exported-in-file function** `checkIsolation(table, seededA, seededB): Promise<string[]>`
  returning violation messages, not calling `expect` itself. The per-table tests
  `expect(violations).toEqual([])`; the non-vacuity tests (AC 3) need to call it and see
  violations come back.
- **Seeding:** a `SEEDERS: Record<string, (tenant) => Promise<Row[]>>` map, run as the
  owner (`getOwnerDb()`, which bypasses RLS). Reuse `TestFactory`
  (`tests/helpers/testFactory.ts`: `createTenant`, `createWorkflow`, `createPage`,
  `createStep`, `createDatabase`, `createTable`, `createCollection`) wherever it covers a
  table, and plain drizzle inserts from `shared/schema` for the rest. Seed at least one
  row per tenant per table.
- **Coverage is driven by the catalog, not the map.** The suite enumerates
  `pg_policies`; a table with neither a seeder nor an entry in
  `SKIPPED: Record<string, string /* reason */>` **fails** with a message naming it. That
  is AC 1 and AC 4 together: the map says *how* to seed, the catalog says *what must be
  covered*, and a new policy table turns the suite red until someone handles it.
- **The restricted role:** copy `connectAsAppRole()` from
  `tests/integration/rls4-forceEnforcement.test.ts`, but with its **own** role name
  (`rls10_app_role`) so it cannot race that file's `ALTER ROLE`. Wrap the role
  provisioning in the retry that `tests/setup.ts` uses (`isConcurrentRoleWrite`: codes
  `XX000` "tuple concurrently updated", `23505`, `42710`). Concurrent `ALTER ROLE` on one
  role was RLS-11 cause 5, and it failed a random file per run. Assert the role is
  `rolbypassrls = false` and `rolsuper = false` in `beforeAll`, or the suite passes for the
  wrong reason.
- The suite must pass in **both** modes: plain `test:integration` and under
  `RLS_RESTRICTED=true` (the gate). It uses its own raw connection, so the app pool's role
  doesn't matter, but prove it.

### Acceptance criteria

1. Tables are enumerated from `pg_policies` at runtime, never from a literal table list. A
   policy table with no seeder and no `SKIPPED` entry fails the suite, naming the table.
2. All five matrix conditions are asserted for every seeded table, via `checkIsolation`,
   intersected with this suite's own seeded keys.
3. **Proven non-vacuous, in the suite itself** (like `rls-coverage.test.ts`'s probe
   tests): on a probe table created by the test with a correct `tenant_isolation` policy
   plus ENABLE and FORCE, `checkIsolation` returns `[]`. After replacing the policy with
   `USING (true)` it returns a cross-tenant violation. After dropping the policy it returns
   an "A cannot see its own rows" violation. Drop the probe in `finally`.
4. `SKIPPED` holds only tables that genuinely cannot be seeded, each with a one-line reason;
   **target zero**. The turn-in lists every entry. A silently skipped table is the failure
   this initiative keeps producing.
5. The three rulings above are pinned by explicit assertions: NULL-tenant rows visible with
   no GUC and invisible when tenant A is pinned, on all four nullable tables; one public
   active workflow and its page/step visible with no GUC; the role is non-bypass and
   non-super.
6. Green in both modes: `npx vitest run --project integration tests/integration/rls10-policyIsolation.test.ts`,
   and the same with `RLS_RESTRICTED=true`. `npm run test:rls-gate` stays green with
   `.rls-allowlist.json` still empty. `npm run test:fast` is unchanged from baseline.
7. Gates: `npx tsc --noEmit` clean, and
   `npx eslint tests/integration/rls10-policyIsolation.test.ts --max-warnings 0 --report-unused-disable-directives`
   clean.
8. If the matrix finds a **real** isolation defect in a policy, stop and report it with the
   table, the condition and the rows. Do **not** weaken the assertion, add a `SKIPPED`
   entry for it, or write a migration. That is a finding for the reviewer.

### Ties

- This is the deliberate, cheap alternative to the per-operation test matrix
  rejected under *Withdrawn findings*. Read that entry before proposing a
  bigger version of this ticket.

---

## RLS-11 — The enforcement gate has been red for 9 days ✅ DONE 2026-09-12

**Priority: P2** (was P0; re-prioritized 2026-09-11 — the gate is green, required on `main`, and alerts Slack; what remains is cause 5, which costs ~5 minutes on a job off the critical path and threatens nothing user-facing) · Size: M · Files (causes 1 & 2 done): `server/middleware/runTokenAuth.ts`,
`server/services/workflow-runs/RunLifecycleService.ts` — remaining:
`tests/integration/api.runs.file-upload.test.ts`,
`tests/integration/runFileUpload.test.ts`, `tests/integration/text-canonicalization.test.ts`,
`tests/integration/codeBlocks.aliasCollision.test.ts`,
`tests/integration/codeBlocks.multiOutput.test.ts` — plus whatever server code the
triage below lands on


### Status — 2026-09-11

- **Gate green** since `f57bf806` (2026-09-11), on `dev` and `test`; allowlist empty.
- **It went red again in between** — 23 consecutive runs, 2026-09-07 → 09-11, 1–3
  files each, with nobody forced to look. That is precisely the failure AC 4 names.
  The last of it was cause 6's preview suites, fixed as backlog `RLS-B1` (`760353b6`).
- **AC 4 met.** `RLS Enforcement Gate` is a **required check on `main-protection`**
  (2026-09-11), and a failing gate on a push **posts to Slack**
  (`scripts/ci/post-slack-gate-failure.js`, both jobs in `rls-gate.yml`). Not made
  required on `dev`: `dev-protection` has no required checks and pushes use the owner
  bypass, so it would change nothing there.
- **The flake cited for keeping it advisory has not recurred**: zero
  `Registration failed` lines across all 29 gate runs since 2026-09-08 (all single-fork).
- ✅ **Cause 5 fixed 2026-09-12** — concurrent `ALTER ROLE` in per-worker setup; the gate runs
  parallel again. All four ACs are met and the ticket is closed.
### Finding

`.github/workflows/rls-gate.yml` has failed on **every push since 2026-08-28** —
**35 consecutive runs**, 9 days. Last green: `1e359b31`. First red: `f7a07709`
("feat(steps): canonicalize Short and Long Text as `text`"), which is also where
`text-canonicalization.test.ts` was introduced. Each initiative since (STB, GH-146
file uploads, Code Blocks) has added to the pile against an already-red gate, so
nobody's per-ticket run reported anything new.

Reproduced locally 2026-09-06 on `b168a1d5`, single-fork exactly as CI runs it:
**5 failing files / 6 failing tests, allowlist empty.** As of `8db4be80` it is
**6 files** — CB-8 added `codeBlocks.testEndpoint.test.ts`, which has never been
green under enforcement. The set is otherwise stable run to run. Normal (owner-role) mode
on the same commit is **145 files green** — so every one of these is
RLS-enforcement-specific and invisible to `npm run test:integration`.

```
npx tsx scripts/rls-gate.ts     # ~18 min; writes rls-gate-results.json
```

Five distinct root causes:

| # | Files | Symptom | Reading |
|---|---|---|---|
| 1 | `api.runs.file-upload`, `runFileUpload` | 404 `"Workflow for run not found"` on a bare run token | The workflow self-identification bootstrap (migration `0030`, `app.current_workflow_id`) is not pinned on this path. **Likely a real defect.** |
| 2 | `text-canonicalization` | prefill write silently produces **0** `step_values` rows, expected 1 | A write dropped with no error — the exact "RLS fails by returning empty" shape this gate exists to catch. **Likely a real defect.** |
| 3 | `codeBlocks.aliasCollision`, `codeBlocks.testEndpoint` | raw `DrizzleQueryError` instead of the translated `400`; test-endpoint failures | The Code Blocks work is landing on top of a red gate and inheriting it. `testEndpoint` arrived with CB-8 on 2026-09-06 and was never green here. |
| 4 | `codeBlocks.multiOutput` | cross-tenant step create answers `404`, test pins `403` | Arguably the *test* is wrong: under enforcement the foreign tenant cannot see the page, and 404 leaks less than 403. Needs a ruling, then either the test or `classifyRouteError` changes. |
| 5 | rotating, 1–2 per run | a different extra file fails on every parallel run | The restricted-role harness is not worker-safe. See below. |

**Why this is P0 and not test debt: `dev` has been enforcing since `0041`
(2026-08-25), three days before the gate went red.** Causes 1 and 2 are
user-visible paths — run-token file upload, and answer prefill — so they are
expected to be broken in the dev environment right now. That has **not** been
verified against the live app; doing so is acceptance criterion 1.

### Causes 1 & 2 — FIXED and confirmed live on dev, 2026-09-07

**Both were live on dev, and the same one-line-shaped mistake twice: a tenant
that was known was never applied to the connection, so an RLS-covered read came
back EMPTY and the caller read that as missing data.**

**Cause 1 — the run-token tenant was resolved and then dropped.**
`runTokenAuth` resolves the tenant correctly and calls `setCurrentTenantId`,
which writes into the AsyncLocalStorage store. Any route running multer loses
that store (multer resumes the chain from its own stream callback), so those
routes re-mount `rlsContext` — which re-seeds **only** from `req.tenantId`, a
field `hybridAuth` sets and `runTokenAuth` did not. Every multipart run-token
request therefore ran unscoped. Fixed by stamping `req.tenantId` at both
resolution sites in `server/middleware/runTokenAuth.ts`; that repairs every such
route at once and gives downstream reads the real tenant, rather than
bootstrapping `app.current_workflow_id` layer by layer — which `pages`/`steps`
do not even honour (their policies key on tenant-ownership or `is_public`,
never on that GUC). Safe because nothing treats the presence of `req.tenantId`
as proof of a user: `requireTenant`/`checkTenantAccess` are only ever mounted
beside `hybridAuth`.

**Cause 2 — the prefill reads never opened a tenant transaction.**
`RunLifecycleService.populateInitialValues` called `pageRepo.findByWorkflowId`
and `stepRepo.findByPageIds` with **no `tx`**, so they ran on the bare pool where
`app_current_tenant()` is unset — even on the fully authenticated path, where a
real tenant was in the async context the whole time. `allSteps` came back empty,
the loop had nothing to iterate, and every step `defaultValue` and every
prefilled `initialValues` silently failed to persist. Fixed by wrapping both
reads in one `withCurrentTenant` transaction.

**AC 1 — confirmed against live dev** (read-only, via the Neon MCP on branch
`br-shy-rain-ahpucki7`; nothing created or modified):

| fact | value |
|---|---|
| deployed dev `DATABASE_URL` role (Railway) | `ezbuildr_app`, with `RLS_ENFORCED=true` |
| `ezbuildr_app` bypasses RLS? | **no** — `rolbypassrls = false` |
| `workflows`/`pages`/`steps`/`sections` | RLS **enabled AND forced** |
| `app_current_tenant()` with no GUC | **NULL** → policy's tenant branch is `false` |
| only surviving disjunct | `is_public = true AND status = 'active'` |
| dev workflows matching it | **46 of 88** |

So both defects were live on dev for the **42 non-public workflows** — uploads
404ing on a valid run token, and runs starting with no defaults. **The
`is_public` escape is why nobody noticed:** public-link runs, the most-demoed
path, kept working, and the breakage was confined to private workflows.

Note the local trap this exposed: local `.env` connects as `neondb_owner`, which
holds BYPASSRLS, so **running the app locally against the dev database cannot
reproduce any of this**. Only `ezbuildr_app` sees the policies.

Gate effect: **6 failing files → 3.** `api.runs.file-upload`, `runFileUpload` and
`text-canonicalization` all pass under enforcement; the three Code Blocks files
(causes 3 and 4) remain.

### Causes 3 & 4 — FIXED 2026-09-07

**Cause 3 was a real defect, and a nastier one than the triage guessed.**
`StepService.rethrowAliasCollision` turns a `23505` on
`steps_workflow_alias_unique` into a helpful `400` naming the conflicting
step — but it *required* the violation's `DETAIL` string and parsed the alias
out of it. **Postgres omits DETAIL when the role is subject to RLS on the
table**, because that string quotes column values the role may not be allowed
to read. Measured as the restricted role: `code` is `'23505'` and `constraint`
is `steps_workflow_alias_unique` exactly as expected, and `detail` is
`undefined`.

So on the branch that matters — production, once it connects as a non-owner —
**every alias collision reaching the index escaped as a raw
`DrizzleQueryError`** instead of the 400 the code exists to produce. It passed
in owner mode, where DETAIL *is* present, which is why it read as correct.

Two fixes, both of which behave identically in either mode:

1. `restoreStep` now does the **preflight alias check** every other write path
   already does (`validateOutputAliases`). It was the one route that reached
   the unique index with no preflight and leaned on error forensics. Asking
   first needs no DETAIL, names the owner, and never issues a statement that
   would poison the caller's transaction.
2. `rethrowAliasCollision` no longer *requires* DETAIL. The constraint name
   alone already proves what happened, so the alias identity is an enrichment,
   not a precondition: parse DETAIL when present, and still answer `400` when
   it is withheld.

**Cause 4 was test drift, and the ruling already existed.** Both
`codeBlocks.multiOutput` and `codeBlocks.testEndpoint` pinned `403` on a
**cross-tenant** denial, each with a comment reasoning from
`classifyRouteError`. That reasoning is right in owner mode and wrong under
enforcement, where the row is invisible, the route never reaches its own check,
and the honest answer is `404`.

Which code is correct was **decided, not defaulted**: `RLS_HANDOFF.md` §0b, put
to the repo owner on 2026-08-22 and delegated back — 404 accepted for
cross-tenant reads because it leaks strictly less (a 403 confirms the resource
exists), and preserving 403 would require a deliberately-unscoped existence
probe on the very paths that must fail closed. The repo already ships
`expectCrossTenantDenied` for exactly this, and says a test passing in only one
mode is evidence of nothing. Both sites now use it.

Nothing was weakened to go green: each test still pins the property it exists
for — `multiOutput` asserts no step was written, `testEndpoint` asserts the
executor was never called. **In-tenant RBAC denials still assert a plain 403**
and were not touched.

### Cause 6, found 2026-09-07 — the CB-9a preview work is landing red ✅ fixed 2026-09-11 (backlog `RLS-B1`, `760353b6`; the CI collection break by `faaa7e68`)

With causes 1–4 fixed the gate is down to **two** files, and both are new:
`preview.isolation.test.ts` (CB-9a-1) and `preview.execution.test.ts`
(CB-9a-3a). They arrived in the tree via the `cb-9` merge while causes 1–4 were
being worked, and they are the same class as everything above:

```
normal (owner) mode : 2 files / 36 tests  PASS
RLS_RESTRICTED=true : 2 files /  4 tests  FAIL
```

Symptoms: a signature-creation simulation answering `400` where the suite
expects `200`, and `safeFetch` never called where a provider dispatch is
expected — i.e. reads coming back empty again, in the delivery/provider paths.

**Deliberately not fixed here.** CB-9a is actively in flight (a dev is mid-way
through 9a-3b, and `0c540217` already records three transport defects found
there), so changing it underneath that work would collide. It is written up so
the number is honest rather than quietly attributed to RLS-11's other causes.

**Separately, that same merge turned `dev` CI red — not the gate, ordinary CI.**
Deterministic, 3 runs out of 3, starting at `37a1d702` (2026-09-07 12:13) and
still red; the last green was `0cf8c649`. One file, zero failing tests — it
cannot even be collected:

```
FAIL unit-fast tests/unit/services/RunExecutionCoordinator.validationErrors.test.ts
TypeError: this[writeSym] is not a function
  ❯ Object.LOG [as info]  node_modules/pino/lib/tools.js:74:21
  ❯ server/services/storage/index.ts:15:12   logger.info('Initializing Disk Storage Provider')
  ❯ server/services/workflow-runs/RunPreviewPolicyService.ts:10:1
```

`server/services/storage/index.ts` calls `logger.info` at **module scope**, and
CB-9a-1's new `RunPreviewPolicyService` pulled that module into
`RunLifecycleService`'s import graph — so a unit-fast file that never touched
storage now executes that log line at import time and dies on it. The landmine
is the import-time side effect, which predates CB-9a; the new import chain is
what stepped on it. Passes locally, fails every CI run.

Left for whoever owns CB-9a rather than fixed here, for the same
work-in-flight reason as above.

**This is the third time in nine days that new work has landed on this gate
while it was red** — CB-8 added `codeBlocks.testEndpoint`, CB-9a has now added
two more. That is the cost the gate's own header predicted, and it is what
AC 4 (make a red gate visible within a day) exists to stop.

### Cause 5, found 2026-09-06 — the restricted-role harness is not worker-safe ✅ fixed 2026-09-12

**Root cause, found 2026-09-12 — test setup, not tenant state.** Every worker's setup
re-asserts the two cluster-level test roles (`rls5_app_role`, `rls6_admin_bypass_role`) with
`ALTER ROLE … WITH PASSWORD`. Two workers doing it at the same instant write the same
`pg_authid` row, and Postgres rejects the loser with `tuple concurrently updated` (XX000). That
fails the worker's setup and takes down whichever test file it was starting — a different one
each run. Stack-confirmed on a failing parallel run (2 files, both `tuple concurrently updated` at
`provisionRestrictedRole`, `tests/setup.ts:196`), and reproduced in isolation: 8 clients × 40
re-assertions of one role → **275 of 320 failed without a lock, 0 of 320 with one**.

The guesses written below — the shared role's *policies*, per-connection GUC pinning — were
wrong. It was concurrent catalog DDL in test setup, which is why it appeared only in parallel runs
and never touched application code.

**Fix.** `provisionSharedRoles` in `tests/setup.ts` runs both provisioning functions inside one
transaction holding `pg_advisory_xact_lock`, which serializes every worker on the database, plus a
bounded retry on the concurrent-role-write codes for the cross-database case (advisory locks are
per-database; roles are cluster-wide). `scripts/rls-gate.ts` no longer pins single-fork.

**Evidence:** three consecutive unpinned gate runs — 151/151 files each, 0 `tuple concurrently
updated`, 0 `Registration failed` — in **412 s, 358 s and 399 s** locally, against ~1,066 s
single-fork on the same machine.

---

*Original write-up, 2026-09-06:*

Separate from the four above, and found by accident while making the suite
parallel. Run with more than one worker under `RLS_RESTRICTED`, three
consecutive CI runs reported the stable core of 5 **plus a rotating extra that
differed every run**: `{datavault.routes, lifecycle-hooks-execution}`, then
`{creation-limits-reorder}`, then `{api.workflows}`. Single-fork runs — in CI
and locally — report the core and nothing else.

Normal (owner-role) parallel runs are clean: 144 files, identical to serial. So
this is specific to the restricted path, and the per-worker schemas that isolate
ordinary runs are not enough here. Prime suspects: the shared non-owner role, and
GUC pinning that assumes one connection per schema.

`scripts/rls-gate.ts` therefore pins `VITEST_SINGLE_FORK=true` deliberately —
the only place left that does — with the reasoning in a comment there. A gate
with a rotating false member is worse than a slow gate: it pushes someone to
"fix" a file that was never broken, or to allowlist it.

### Acceptance criteria

1. Causes 1 and 2 are reproduced (or ruled out) against the **live dev
   environment**, not just the suite — see the `verify` skill. Record which.
2. Each of the four causes is fixed at the layer that is actually wrong, or —
   for cause 4 only — the test's expectation is corrected with the ruling
   written down. Do not "fix" a real scoping defect by relaxing an assertion.
3. `npm run test:rls-gate` is green with `.rls-allowlist.json` **still empty**,
   and — cause 5 — green with the single-fork pin REMOVED from
   `scripts/rls-gate.ts`, so the gate is no longer paying ~5 minutes to hide a
   harness bug. Removing the pin without fixing worker-safety is not a pass.
   ✅ **Met 2026-09-12** — green with the allowlist empty, and green with the single-fork
   pin removed: three consecutive parallel runs, 151/151 files each.
   Adding an entry to close this ticket is an automatic fail: the gate's own
   header says an unexplained entry is how it rots.
4. Something makes a red gate visible within a day rather than 35 runs. Cheapest
   credible option: make `RLS Enforcement Gate` a required check on `dev` in the
   `dev-protection` ruleset. If the "Registration failed" flake in
   RLS_HANDOFF §4 still makes that unsafe, say so and propose the alternative.
   ✅ **Met 2026-09-11** — required on `main-protection` rather than `dev` (where the
   owner bypass makes a required check a no-op), plus a Slack alert on any failing push.

### Ties

- Load the `run-tests` skill (the gate is the `integration` project under
  `RLS_RESTRICTED=true`) and the `verify` skill for AC 1.
- Causes 1/2 are independent of 3/4 and can run in parallel; 3 and 4 are both
  Code Blocks and touch adjacent files, so sequence them or give them to one dev.
- Related: **RLS-8** (32 unscoped call sites) may well contain cause 1's site —
  check the audit output before hunting by hand.
- The 9-day blindness is the same failure mode as the integration suite once
  going months without running in CI. AC 4 is the part that stops a repeat.

---

## Phase 2 Gate

- [~] RLS-1 ✅, RLS-2a ✅, RLS-2b ✅, RLS-2c ✅, RLS-2d ✅, RLS-2e ✅, RLS-2f ✅, RLS-3 ✅,
      RLS-5 ✅, RLS-6 ✅, RLS-7 ✅ (2026-08-22). **RLS-4 is done for dev and test
      (2026-08-25) and open for production.** Three coverage tickets were added
      2026-08-25 — **RLS-8** (32 unscoped call sites), **RLS-9** (put the surface
      audit in CI; it is wired into nothing today), **RLS-10** (data-driven proof
      that policies isolate, not merely that they are enabled)
- [x] **RLS-2's shape ruled on by the repo owner** — service boundary, 2026-08-18 — now
      needs delivering
- [x] A cross-tenant read proven impossible at the database level, with fail-closed evidence
      — **dev, 2026-08-22.** As `ezbuildr_app`: tenant pinned -> that tenant's rows only,
      0 from any other; GUC unset -> 0; GUC `''` -> 0. Both fail-closed, covering the
      empty-string trap. Not yet true of `test`/`production` (no policies there yet)
- [~] **The admin console still shows every tenant** after `FORCE` — proven in the test
      suite (`api.admin-user-workflows` green under `RLS_RESTRICTED=true` with a real
      BYPASSRLS pool, and `rls7-adminDb-readonly` proves that pool cannot write).
      **Not yet exercised against the live dev environment**, which is the remaining half
- [x] Full integration green as the restricted role in CI — **green again since
      `f57bf806` (2026-09-11), allowlist empty, and now a required check on `main`.**
      It was red 2026-08-28 → 09-06 and again 09-07 → 09-11 while advisory — see
      RLS-11. The "Registration failed" flake (RLS_HANDOFF §4) has not recurred in 29
      runs since 2026-09-08, all single-fork
- [~] `docs/architecture/TENANT_ISOLATION_RLS.md` covers §2a–§2g and the admin
      `BYPASSRLS` path. **Needs a pass for what 2026-08-22 changed**: the multer
      async-context hazard, `forEachTenant` for background jobs, and the fact that in
      Neon the bypass role is `neondb_owner` (so the read-only property rests on code
      containment plus a test, not on privileges)
- [ ] Reviewer has committed each passed ticket

**Dispatch order (updated 2026-08-18 after RLS-1 landed and RLS-2 was split):**

```
RLS-1  ✅ done bc90cc3e
RLS-2a    pilot: the pattern, on CollectionService
RLS-2b    rollout: the remaining ~35 tenant-scoped services  ─┐ parallel with
RLS-3     policy coverage repair                              ├─ each other and
RLS-6     admin cross-tenant read path                        ─┘ with RLS-2b
RLS-2f ✅ done 2026-08-21 — the call-site sweep (121 -> 25 sites)
RLS-7     admin.routes' remaining cross-tenant ops  (blocks RLS-4, needs an owner ruling)
RLS-4     FORCE + restricted role   (blocked on 2b, 2f, 3, 6 and 7)
RLS-5     gate: full integration as the restricted role

added 2026-08-25, after 0041 found the policies were defined but inert:
RLS-8     close the 32 unscoped call sites        ─┐ 8 before 9, or the
RLS-9  ✅ surface audit into CI, two-way ratchet  ─┘ done 2026-08-25
RLS-10 ✅ data-driven per-table isolation proof     done 2026-09-13

added 2026-09-06, after the gate was found red for 9 days:
RLS-11    repair the enforcement gate               (P0 — two causes look live in dev)
```

RLS-2b, RLS-3 and RLS-6 are mutually disjoint — services, migrations and the admin path
respectively — so they can run concurrently once RLS-2a fixes the pattern. **RLS-4 needs all
three**: without 2b it returns zero rows, without 3 the coverage is wrong, without 6 the admin
console silently truncates.

**Added 2026-08-21:** RLS-2f closed the gap the service-by-service rollout could not see —
call sites that never went through a service. RLS-7 is the same argument as RLS-6, applied to
the admin operations RLS-6 did not cover, and it blocks RLS-4 for the identical reason.

---

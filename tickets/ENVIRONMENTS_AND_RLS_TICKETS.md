# Environment split & real tenant isolation (ENV / RLS)

**Status:** open · **Written:** 2026-08-12
**Ticket prefixes:** `ENV-1..4` (Phase 1), `RLS-1..5` (Phase 2)
**Audit grade for the area:** **D** — tenant isolation has no database backstop, and there is
no environment in which to safely build one.

---

## How to work this document

- Read this header and **your ticket only**.
- Line numbers are advisory; the **quoted code plus the symbol name** is the locator. Grep
  for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- **Devs do not commit or stage.** The reviewer commits, one commit per passed ticket.
- `npm run test:fast` is **not** a sufficient gate here — nothing in this initiative is
  covered by the no-DB project. Run `npm run test:integration`, and for Phase 2 run it **as
  the non-owner role** (RLS-5).
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
2. **`main` auto-deploys to production with no staging gate, and branch protection is off**
   (confirmed via `gh api …/branches/main/protection` → 404 "Branch protection has been
   disabled on this repository").
3. **Row-level security is defined but structurally inert.** Details in Phase 2.

Phase 1 must land before Phase 2 starts. Making RLS real requires connecting as a
non-owner role and running a full integration suite against a database you are willing to
break — doing that against the production database is the hazard Phase 1 removes.

## Correction to an earlier claim — do not re-file

An earlier verbal audit (same day) claimed *"RLS is enabled on more tables than the policies
cover, and RLS-enabled-with-no-policy means deny-all."* **That is wrong.** The `FOREACH`
loop at `migrations/0001_enable_rls.sql:51` executes **both** `ALTER TABLE … ENABLE ROW LEVEL
SECURITY` **and** `CREATE POLICY tenant_isolation …` for every table in its array, so every
looped table has a policy. The error came from counting literal `CREATE POLICY` occurrences
(4) without noticing one is inside a loop covering 24 tables. The real defect is different
and worse — see RLS-2.

---

# Phase 1 — Environment split (ENV)

## ENV-1 — Create dev and test Railway environments, each with its own database 🔲

**Priority: P0** · Size: M · Files: Railway configuration, `.env`, `.env.example`, `docs/deployment/CI_CD_SETUP.md`

### Finding

`.env` `DATABASE_URL` is the production Neon connection string (`neondb_owner@…neon.tech/neondb`).
Every local run — the dev server, any `tsx` probe, `npm run db:push`, `npm run db:migrate` —
talks to production. The repo owner's plan is three Railway environments (`main`/`test`/`dev`),
each with its own database.

This is the ticket that unblocks everything else in this file.

### Preferred fix

Create the `dev` and `test` environments in Railway with their own Postgres instances, then
repoint local `.env` at the **dev** database. Keep `production` as the only environment
`main` deploys to.

Use the `use-railway` skill rather than improvising CLI invocations. Set variables
**per environment** — do not rely on inherited values.

**Do not conflate Railway's `test` environment with the local test database.**
`TEST_DATABASE_URL` points at the Docker Postgres on port **5434** and is what Vitest uses;
Railway `test` is a deployed app with its own Neon/Postgres instance. Two different things
with one word. `.env.example` must document both, distinctly.

### Ties

- Load `use-railway` (environments, variables, deploys) and `db-schema-change` (before any
  migration runs against a new database).
- **Sequenced before ENV-2** — ENV-2 needs a fresh database to compare against production.
- `LU-B1` in `tickets/BACKLOG.md` is the standing record of this hazard; close it here.
- One CLI trap: `railway variables --json`/`--kv` **renders** `${{...}}` references, so
  grepping output for a reference finds nothing even when one exists. Probe with a throwaway
  variable instead of trusting a grep.

### Acceptance criteria

1. `dev` and `test` Railway environments exist, each with its own database, neither sharing
   production's.
2. Local `.env` `DATABASE_URL` points at the **dev** database. Producing evidence: `/health`
   on a locally-started server reports `database.connected: true` **and** the host is not the
   production instance.
3. `production` remains the only environment `main` deploys to; `dev`/`test` deploys do not
   fire on a push to `main` unless deliberately configured.
4. `.env.example` documents `DATABASE_URL` (per-environment) and `TEST_DATABASE_URL` (local
   Docker, Vitest only) with a sentence each saying which is which.
5. `docs/deployment/CI_CD_SETUP.md` describes the three environments and which branch, if
   any, deploys to each.
6. **A destructive-command smoke check:** running `npm run db:push` locally alters the dev
   database and demonstrably not production (compare a `information_schema` probe on both
   before/after, or add and drop a scratch column).

---

## ENV-2 — Prove the migration chain reproduces production's schema 🔲

**Priority: P0** · Size: M · Files: none expected; a written comparison plus whatever drift repair it turns up

### Finding

A fresh dev database will be built by running the migration chain
(`migrations/0000_init_baseline.sql` + follow-ons). Production, however, has been maintained
over a long period in a repo where `npm run db:push` is a documented workflow
(`CLAUDE.md`, "Common Commands").

**Whether the chain reproduces production's current schema is unverified.** If it does not,
every developer works against a schema that differs from production in ways no test can
catch — which is *worse* than sharing one database, because the divergence is silent.

This ticket is stated as a risk to measure, not a defect to assume. It may come back clean.

### Preferred fix

Build a scratch database from the migration chain alone, then diff its schema against
production's. Compare, at minimum: table list, column names/types/nullability, enum values,
indexes, constraints, and which tables have RLS enabled.

Read-only introspection against production only — `information_schema` and `pg_catalog`.
**No writes to production in this ticket, at all.**

If drift exists, the deliverable is a written inventory plus a decision from the repo owner on
each item: add a migration to bring the chain up to production, or correct production. Do not
silently "fix" production.

### Ties

- Load `db-schema-change` **first** — the migration chain was regenerated 2026-07-19 and
  intuition about how migrations run here is wrong.
- Depends on **ENV-1**.
- Note for context: the test-suite path applies `migrations/*.sql` its own way via
  `tests/setup.ts`, so a green test suite is **not** evidence that the chain matches
  production.

### Acceptance criteria

1. A scratch database is built from the migration chain with no manual patching, and the
   commands used are recorded.
2. A written diff against production covering tables, columns (name/type/nullability), enum
   values, indexes, constraints, and RLS-enabled tables.
3. Either "no drift" is demonstrated, or every drift item is listed with a proposed
   resolution and escalated to the repo owner for a decision.
4. Zero writes to the production database; the introspection queries used are pasted.

---

## ENV-3 — Per-environment secrets, and fix the live storage misconfiguration 🔲

**Priority: P1** · Size: S · Files: Railway variables per environment, `.env.example`

### Finding

Two things, bundled because they are the same pass through Railway's variable UI.

**(a) Secrets become per-environment.** Each environment's database holds its own
AES-256-GCM-encrypted rows (`connections`, `secrets`). `VL_MASTER_KEY` decrypts them.
`CLAUDE.md` is explicit: **never regenerate `VL_MASTER_KEY` on a machine with stored
secrets** — it breaks every stored secret irrecoverably. So each environment needs its own
stable key, and production's must not change. Do not copy production's key into dev; dev
should not be able to decrypt production secrets even in principle.

**(b) `STORAGE_DRIVER=s3` is unset in Railway and is causing live document 404s.** Recorded
as `DEBT-OPS1` in `tickets/BACKLOG.md` and outstanding for weeks. Every deploy re-serves
404s for generated documents.

### Preferred fix

Set per environment: `VL_MASTER_KEY` (distinct per env, generated fresh for `dev`/`test`,
**production's left alone**), `JWT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, `BASE_URL`,
`ALLOWED_ORIGIN`, and `STORAGE_DRIVER` with its bucket configuration.

Note for context: production `JWT_SECRET`/`SESSION_SECRET` placeholders have been reviewed
before and are deliberate — **do not flag them as findings**; this ticket only ensures each
environment has its own.

Ship the `STORAGE_DRIVER` change with `railway redeploy` (not the MCP `deploy`), and then
**prove documents serve** rather than assuming.

### Ties

- Load `use-railway`.
- Depends on **ENV-1**.
- `DEBT-OPS1` in `tickets/BACKLOG.md` — close it here.

### Acceptance criteria

1. Each of the three environments has its own `VL_MASTER_KEY`; production's is provably
   unchanged (compare before/after, or confirm it was never written).
2. `JWT_SECRET`, `SESSION_SECRET`, `BASE_URL`, `ALLOWED_ORIGIN` set per environment.
3. `STORAGE_DRIVER=s3` and its bucket configuration set in **production**, redeployed.
4. **A generated document downloads successfully from production** — the URL and a non-404
   status pasted. This is the criterion that actually closes `DEBT-OPS1`; a set variable is
   not proof.
5. `.env.example` lists every variable that must be set per environment.

---

## ENV-4 — Turn on branch protection and make the test environment mean something 🔲

**Priority: P1** · Size: S · Files: GitHub repository settings; possibly `.github/workflows/ci.yml`

### Finding

`gh api repos/ShawnC-LaunchCode/ezBuildr/branches/main/protection` returns **404 — "Branch
protection has been disabled on this repository."** Combined with `main` auto-deploying to
production, any push reaches customers with no review and no required check. Recorded as
`DEBT-OPS2`.

### Preferred fix

Require a pull request and a passing CI check to merge to `main`. Once ENV-1 exists, the
`test` environment is the natural place for the check to run.

**Escalate before enabling:** the repo owner works this repo from a second IDE and this
session has been committing directly to `main` all day. Requiring PRs changes their workflow,
so confirm the desired strictness (linear history? required reviewers? admin bypass?) rather
than picking for them.

### Ties

- Depends on **ENV-1** for a meaningful check target.
- `DEBT-OPS2` in `tickets/BACKLOG.md` — close it here.
- `tickets/BACKLOG.md` `DEBT-OPS3` (delete the stale `origin/debt9-typecheck-proof` branch) is
  a one-liner worth doing in the same pass.

### Acceptance criteria

1. Branch protection is enabled on `main`; `gh api …/branches/main/protection` returns 200 and
   its JSON is pasted.
2. At least one status check is required, and it actually runs on a PR (evidenced by a test PR).
3. The strictness settings were confirmed with the repo owner before enabling, and that
   confirmation is noted.

---

## Phase 1 Gate

- [ ] ENV-1..4 ✅ each with a dated verification note
- [ ] Local `.env` demonstrably points away from production
- [ ] A generated document downloads from production (404s gone)
- [ ] `gh api …/branches/main/protection` returns 200
- [ ] Schema-drift comparison written and, if drift exists, ruled on by the repo owner
- [ ] Reviewer has committed each passed ticket

---

# Phase 2 — Make RLS real (RLS)

**Do not start Phase 2 until the Phase 1 gate is signed off.** Every ticket here needs a
database you can lock yourself out of.

## The current state, verified 2026-08-12

> ### 🔴 CORRECTED 2026-08-13 — measured against production, not read from the migration
>
> An earlier version of this table described what `migrations/0001_enable_rls.sql` *says*
> and presented it as the state of production. **A read-only snapshot of the production
> database proves otherwise.** Reproduce with:
>
> ```bash
> npx tsx scripts/schema-snapshot.ts > snapshot.txt   # read-only; safe on prod
> ```
>
> | Measured on production (`billowing-base-67211686` / `production`) | Count |
> |---|---|
> | Tables | 107 |
> | Tables with a `tenant_id` column | **26** |
> | Of those, actually protected by RLS | **2** — `run_document_deliveries`, `run_resume_links` |
> | **Tenant-bearing tables with NO RLS at all** | **24** |
> | Tables with `FORCE ROW LEVEL SECURITY` | **0** |
> | RLS policies present in total | 9 (7 are DataVault children with no `tenant_id`, scoping via parent) |
>
> The 24 unprotected tables include `users`, `organizations`, `projects`, `connections`,
> `audit_logs`, `teams`, `tenant_domains`, `signature_requests`, `records`.
>
> **Migration `0001` provably did nothing.** All 24 migrations are applied
> (`__drizzle_migrations` has 24 rows), yet the 24 tables in `0001`'s array are *exactly*
> the 24 that lack RLS. The loop's `to_regclass(quote_ident(t))` guard (line ~47) skips a
> table it cannot resolve with `RAISE NOTICE` and continues — so it ran, matched nothing,
> and succeeded. It has looked applied for months.
>
> **Two latent bugs in `0001` regardless:** it lists `files`, which has **no `tenant_id`
> column** in production, so that entry could never have yielded a valid policy; and it
> omits `ai_usage`, which does have one.
>
> **So the real position is worse than "policies exist but the owner bypasses them."**
> Policies do not exist for 24 of 26 tenant tables, *and* the 9 that exist are bypassed.
> Tenant isolation in production is service-layer discipline alone, everywhere.

| Fact (about the migration source, not production) | Evidence |
|---|---|
| `0001` *intends* RLS + a `tenant_isolation` policy on 24 tenant tables | `migrations/0001_enable_rls.sql:51` `FOREACH` loop — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` per table. **Not present in production — see above.** |
| It also *intends* ownership-based policies on `workflows`, `sections`, `steps` | same file, lines ~104, ~126, ~156, using `app_current_tenant()` (line 67). **Also absent from production.** |
| Policies key off a **transaction-local GUC** | `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)` |
| **No `FORCE ROW LEVEL SECURITY` anywhere** | `grep -rn "FORCE ROW LEVEL" migrations/ server/` → no matches |
| The app connects as the **table owner** | `.env` `DATABASE_URL` user is `neondb_owner` |
| ⇒ **every policy is bypassed in production** | Postgres: the table owner bypasses RLS unless `FORCE` is set |
| **Nothing sets the GUC.** The helper exists and has no production callers | `set_config('app.current_tenant_id', …, true)` at `server/utils/rlsContext.ts:75`; `withTenant`/`applyTenantToTransaction` referenced only by `tests/integration/rls-context.test.ts` |
| The middleware that would populate tenant context is **not registered** | `server/middleware/rlsContext.ts` exists; no reference in `server/index.ts` or `server/production.ts` |
| Tenant scoping today is **service-layer only** | repositories use explicit `eq(table.tenantId, tenantId)` — e.g. `CollectionRepository.ts:26`, `DatavaultDatabasesRepository.ts:30` |

**The consequence, and why RLS-2 is the real work:** if you set `FORCE` today,
`current_setting('app.current_tenant_id', true)` returns NULL for every query, the policy
evaluates `tenant_id = NULL` → NULL → false, and **every query returns zero rows.** The
application goes completely dark. The existing RLS tests pass because they connect as a
non-owner role *and* set the GUC explicitly — they prove the policies are correct, not that
the app can live under them.

## RLS-1 — Register the tenant-context middleware 🔲

**Priority: P1** · Size: M · Files: `server/index.ts`, `server/production.ts`, `server/middleware/rlsContext.ts`

### Finding

`server/middleware/rlsContext.ts` exports `rlsContext`, which calls `runWithTenantContext`
(`server/utils/rlsContext.ts:59`) to put the tenant id into an `AsyncLocalStorage`. **It is
registered in no application entrypoint** — grep `server/index.ts` and `server/production.ts`
for `rlsContext` returns nothing. So the async context is never populated in a running app.

### Preferred fix

Register the middleware after authentication has resolved the tenant (it needs
`req.tenantId`, which `hybridAuth`/`attachUserToRequest` sets — see
`server/middleware/auth.ts:214`, which re-hydrates `tenantId` from the database on every
request). Mirror how the sibling middlewares are registered in both entrypoints; production
and dev entrypoints are separate files and **both** need it.

Unauthenticated and public routes have no tenant. The middleware must be a no-op there, not
throw — public run access (`/api/workflows/public/:slug/start`) must keep working.

### Ties

- Load `add-api-endpoint` for middleware ordering conventions.
- **Sequenced before RLS-2**, which consumes the context this ticket populates.
- `docs/architecture/TENANT_ISOLATION_RLS.md` (SEC-051) is the design doc — read it, and
  update it if this changes the described flow.

### Vertical proof

Entry point: an authenticated `GET` on any tenant-scoped route. Hops: `hybridAuth` resolves
`tenantId` → `rlsContext` middleware → `AsyncLocalStorage` populated → a handler reads it back.
Unmocked: the middleware chain and the auth resolution. End state: a route can observe the
current tenant id without it being threaded through its arguments. Cross-tenant case: a
request authenticated as tenant B never observes tenant A's id. Suite:
`tests/integration/` (extend `rls-context.test.ts` or add alongside it).

### Acceptance criteria

1. `rlsContext` is registered in **both** `server/index.ts` and `server/production.ts`, after
   tenant resolution.
2. An integration test proves the context is populated for an authenticated request and
   carries the correct tenant id.
3. An integration test proves an unauthenticated/public route still succeeds with no tenant
   context and does not throw.
4. `type-check` 0 errors · `lint` 0 problems · `test:integration` no new failures.

---

## RLS-2 — Set the transaction-local GUC on the repository data path 🔲

**Priority: P0** · Size: **L** · Files: `server/repositories/BaseRepository.ts`, `server/db.ts`, `server/utils/rlsContext.ts`, and the repository layer broadly

> **⚠️ ESCALATED TO THE REPO OWNER AT GENERATION TIME — do not dispatch this as written.**
> This is Size L, spans every data-access path, and the correct shape is an architectural
> decision rather than a fix the ticket can prescribe. It is written up here so the decision
> has a home, not because it is ready for a dev.

### Finding

Policies key off `app.current_tenant_id`, set transaction-locally by
`server/utils/rlsContext.ts:75`:

```ts
await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
```

`is_local => true` is correct and deliberate — the file's own comment explains that a
session-level `SET` would stick to the pooled physical connection and leak across tenants,
which is the bug being avoided. `CLAUDE.md` states the same rule.

But **no production code calls it.** `withTenant` and `applyTenantToTransaction` appear only
in `tests/integration/rls-context.test.ts`. Repositories issue queries directly against `db`
with an explicit `eq(table.tenantId, tenantId)` predicate.

So enforcing RLS requires that *every* tenant-scoped query run inside a transaction that has
set the GUC. Today essentially none do.

### The decision the repo owner needs to make

Three shapes, with the trade-off that matters:

1. **Wrap at the repository base.** `BaseRepository` opens a tenant transaction per operation.
   Smallest call-site change; turns every single-row read into a transaction, and multi-repo
   service operations get one transaction each rather than a shared one.
2. **Wrap at the service boundary.** A service method opens one tenant transaction and threads
   `tx` down. Correct transactional semantics and one GUC set per logical operation; touches
   every service signature, and this repo already has a documented `tx`-threading hazard
   (`SystemStats` deadlocked a size-1 pool when a repository ran pool queries inside a
   caller's transaction).
3. **Wrap at the request boundary.** One transaction per HTTP request. Conceptually cleanest
   and the usual answer; long-lived transactions per request have real cost, and background
   workers (`RunCompletionJobWorker`) are not requests and need their own path.

**Recommendation: (2), incrementally, with (1) as the fallback for read-only repositories.**
But this is a judgment call about transaction semantics across the whole backend and should be
ruled on before anyone writes code.

Whichever is chosen, **service-layer `eq(tenantId, …)` predicates stay.** RLS is a backstop,
not a replacement — defence in depth, and it keeps the system working if the GUC is ever
missing.

### Ties

- `add-api-endpoint` (3-tier pattern), `db-schema-change`.
- **Blocks RLS-4** — `FORCE` cannot be set until this lands.
- Depends on **RLS-1**.
- Related hazard to read first: the `SystemStats` transaction deadlock — repository methods
  that run pool queries inside a caller's transaction deadlock the size-1 test pool.

### Acceptance criteria

*Deliberately not written.* Escalated — the acceptance criteria depend on which shape is
chosen, and writing them now would presume the answer.

---

## RLS-3 — Repair policy coverage: 24 of 26 tenant tables are unprotected 🔲

**Priority: P0** (raised from P1 on 2026-08-13 — the coverage gap was measured, not theoretical)
· Size: M · Files: a new migration, `docs/architecture/TENANT_ISOLATION_RLS.md`

> **The measurement is already done — start from it, don't redo it.** Production has 26
> tables with a `tenant_id` column and **2** of them are protected. Regenerate the evidence
> any time with `npx tsx scripts/schema-snapshot.ts` (read-only). The unprotected 24 are
> exactly `0001`'s array, because that migration's loop silently matched nothing.
>
> This ticket is therefore **repair**, not audit: write a migration that actually applies
> RLS, and prove it applied by re-snapshotting rather than by the migration exiting 0 —
> which is precisely what `0001` did wrong.
>
> Do **not** simply re-run `0001`'s approach. A loop that skips unresolvable tables with a
> `RAISE NOTICE` is how this went unnoticed; the replacement must **fail loudly** if a table
> it expects is absent.
>
> Two specific defects to fix while you are in there: `files` is in the array but has **no
> `tenant_id` column**, and `ai_usage` has one but is **not** in the array.

### Finding

The loop covers 24 tables:

```
audit_logs collab_docs collections connections datavault_api_tokens datavault_databases
datavault_number_sequences datavault_row_notes datavault_tables external_destinations files
metrics_events metrics_rollups organizations projects records review_tasks signature_requests
sli_configs sli_windows teams tenant_domains users workflow_blueprints
```

plus explicit ownership-based policies on `workflows`, `sections`, `steps`.

`CLAUDE.md` says the schema has **106 tables**. Which of the remaining ones carry tenant data
and have **no** policy is unknown. Two failure modes to look for, in opposite directions:

- A tenant table with **no** policy — silently unprotected once `FORCE` lands.
- A table in the array that no longer exists, or has no `tenant_id` column. The loop skips
  missing tables with a `RAISE NOTICE` (line ~47), so a typo or a renamed table fails
  **silently** — note that `review_tasks` and `signature_requests` were repointed to
  `workflow_runs` during the graph-run-table removal, and `records` is flagged in
  `tickets/BACKLOG.md` (`DV-B3`) as a parallel data model nobody has investigated.

**Also verify that `0001` was actually applied to production.** Nobody has confirmed it; if it
was not, RLS is not merely bypassed, it is absent.

### Preferred fix

Enumerate every table with a `tenant_id` column from `shared/schema/`, cross-check against
`pg_policies` on a real database, and produce a coverage table: table → has `tenant_id` → RLS
enabled → policy present. Add a follow-on migration for genuine gaps; remove stale array
entries. Record the result in `docs/architecture/TENANT_ISOLATION_RLS.md`.

Prefer a **test that asserts coverage** over a one-time spreadsheet, so a new tenant table
without a policy fails CI rather than shipping.

### Ties

- Load `db-schema-change` before authoring any migration. **Never hand-edit the journal.**
- `docs/claude/SCHEMA.md` is the table inventory; `docs/architecture/TENANT_ISOLATION_RLS.md`
  is the design doc.
- Can run in parallel with RLS-1 (disjoint files).

### Acceptance criteria

1. A coverage table for every table with a `tenant_id` column: RLS enabled? policy present?
2. Every genuine gap either closed by a follow-on migration or explicitly ruled out of scope
   with a reason.
3. Stale entries in the loop's array removed, and it is stated whether any were silently
   skipped in practice.
4. Confirmed and recorded whether `0001` is applied to the production database.
5. A test fails when a table with `tenant_id` has no policy.
6. `type-check` 0 · `lint` 0 · `test:integration` no new failures.

---

## RLS-4 — Add `FORCE ROW LEVEL SECURITY` and move off the owner role 🔲

**Priority: P0** · Size: M · **BLOCKED on RLS-2 and RLS-3** · Files: a new migration, Railway/Neon role configuration, `.env.example`

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

## RLS-5 — Gate: full integration as the non-owner role 🔲

**Priority: P0** · Size: M · Files: `vitest.config.ts` or CI configuration; `.github/workflows/ci.yml`

### Finding

The existing RLS suites (`rls-context.test.ts`, `rls-datavault.test.ts`,
`rls-phase4-workflows.test.ts`) deliberately connect as a non-owner role to exercise policies.
They prove the **policies** are right. Nothing proves the **application** works under them —
and that is the risk RLS-4 carries.

### Preferred fix

Run the whole integration suite with `TEST_DATABASE_URL` pointed at the restricted role, as a
CI job. Any test that fails only under RLS is a real gap: a query path that never sets the GUC.

Expect failures on the first run, and treat them as the deliverable — the list of unprotected
query paths is the point.

### Ties

- Depends on **RLS-4**. Load `run-tests`.
- **Baseline:** `test:integration` on `main` is currently **112 files passed / 1111 passed /
  0 failed / 0 skipped** (2026-08-12, both compose services up). Any failure here is new.
- Do not run two DB-backed suites concurrently.

### Acceptance criteria

1. A CI job runs the full integration suite as the restricted role.
2. It is green, or every failure is triaged as a named unprotected query path with a follow-up
   ticket.
3. The job is required by branch protection (ENV-4).
4. Output pasted for both the owner-role and restricted-role runs, side by side.

---

## Phase 2 Gate

- [ ] RLS-1, RLS-3, RLS-4, RLS-5 ✅ each with a dated verification note
- [ ] RLS-2's shape ruled on by the repo owner, ticketed properly, and delivered
- [ ] A cross-tenant read proven impossible at the database level, with fail-closed evidence
- [ ] Full integration green as the restricted role in CI, and required by branch protection
- [ ] `docs/architecture/TENANT_ISOLATION_RLS.md` matches reality
- [ ] Reviewer has committed each passed ticket

---

## Backlog / observations

- **`records` is a parallel data model nobody has investigated** (`DV-B3` in
  `tickets/BACKLOG.md`). It is in the RLS array. RLS-3 should say whether it holds real tenant
  data or is vestigial.
- **`DEBT-11`** ("RLS policies defined but not enforced", `product-decision`) is **superseded by
  this file** — resolve it as promoted rather than leaving it parked, or the next audit re-files it.
- **Background workers are not requests.** `RunCompletionJobWorker` runs outside any HTTP
  request, so whatever RLS-2 chooses must give workers a tenant-context path of their own.
  Noted here because it is the likeliest thing to be forgotten until RLS-5 goes red.

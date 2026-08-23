# Environment split & real tenant isolation (ENV / RLS)

**Status:** open · **Written:** 2026-08-12
**Ticket prefixes:** `ENV-1..4` (Phase 1), `RLS-1..5` (Phase 2)
**Audit grade for the area:** **D** — tenant isolation has no database backstop, and there is
no environment in which to safely build one.

---

> **Finishing RLS? Start with [`RLS_COMPLETION_PLAN.md`](RLS_COMPLETION_PLAN.md)**
> for the phased scope and estimates against the client-data date, then
> [`RLS_HANDOFF.md`](RLS_HANDOFF.md) for state, patterns and traps. Run
> `npx tsx scripts/audit-rls-surface.ts` for the current worklist.
>
> <details><summary>Original pointer, kept for the record</summary>
>
> **Finishing RLS? Start with [`RLS_HANDOFF.md`](RLS_HANDOFF.md).** The rollout is complete
> (21 services); only RLS-4 and RLS-5 remain, and RLS-4 is **blocked** by a measured defect —
> the policies RAISE rather than filter when no tenant is pinned. The handoff carries the fix,
> the four open preconditions, and the environment traps that cost real hours.
> *(Superseded: the blocker and all preconditions were closed 2026-08-20/21.)*
> </details>

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

## ENV-1 — Create dev and test Railway environments, each with its own database ✅ DONE 2026-08-22

**Priority: P0** · Size: M · Files: Railway configuration, `.env`, `.env.example`, `docs/deployment/CI_CD_SETUP.md`

### Progress — 2026-08-15 (AC1–AC3), 2026-08-19 (AC4–AC5), 2026-08-22 (AC6 — closed)

The environments were built on 2026-08-13 but never written up, so the board still read as
untouched. Measured state:

| | Neon endpoint | S3 bucket | `VL_MASTER_KEY` | `/health` |
|---|---|---|---|---|
| dev | `ep-frosty-firefly-ah3o6q52` | `clientexposedstorage-ec8pcl` | distinct | 200, `database.connected: true` |
| test | `ep-fragrant-boat-ahn0lgc7` | `clientexposedstorage-crb-pk` | distinct | 200, `database.connected: true` |
| production | `ep-gentle-leaf-ahsz38kq` | `integrated-flask-…` | distinct | 200, `database.connected: true` |

- **AC1 ✅** Both environments exist, each with `ezBuildr - prod` + `gotenberg` +
  `railway-clamav` all SUCCESS. Note they are **Neon branches of production**
  (`init_source: parent-data`, parent LSN `4/FAE303E0`), so they are write-isolated —
  a `db:push` against dev cannot reach production — but they were *cloned*, not built from
  the migration chain. That is why ENV-2 remained necessary; see its result.
- **AC2 ✅ 2026-08-15** Local `.env` `DATABASE_URL` repointed from `ep-gentle-leaf`
  (production, byte-identical to production's Railway value) to `ep-frosty-firefly` (dev).
  This closes `LU-B1`. Backup of the prior value taken before the edit.
- **AC3 ✅** `dev`→dev, `test`→test, `main`→production. **Only verifiable in Railway's
  Settings → Source pane** — neither the API nor `railway status` reports the connected
  branch, so this rests on the 2026-08-15 owner verification recorded in CLAUDE.md.

- **AC4 ✅ 2026-08-19** `.env.example` now documents `DATABASE_URL` as per-environment
  (including that local points at the **dev** branch, never production) and distinguishes
  `TEST_DATABASE_URL` — local Docker on 5434, Vitest only — from Railway's `test`
  *environment*, which is the same word for a different thing.
- **AC5 ✅ 2026-08-19** `docs/deployment/CI_CD_SETUP.md` no longer claims *"Only `main`
  deploys"* — false since the dev/test environments were created 2026-08-13. It now carries the
  branch → environment → database table, the `railway.json` pre-deploy migration step, the
  warning that only Railway's Settings → Source pane reveals the connected branch, and the
  `Wait for CI` hazard **with the evidence** (every `dev` deploy failed 2026-08-16 → 08-18
  while the environment served stale code).

- **AC6 ✅ 2026-08-22** Destructive-command smoke check run, with both
  `information_schema` probes watched as the AC intended.

  A scratch table was created **through the local `.env` `DATABASE_URL`** — i.e.
  the exact connection a careless local command would use — and then probed on
  both Neon branches:

  | step | dev | production |
  |---|---|---|
  | before | — | `env1_isolation_probe` absent (0) |
  | after `CREATE TABLE` via local `.env` | **present (1)** | **still absent (0)** |
  | after `DROP TABLE` | absent (0) | never touched |

  So a destructive local command reaches **dev and only dev**. Production was
  read twice and written never.

  A scratch TABLE was used rather than the AC's suggested scratch column: it
  proves the same isolation property while touching no real table, so a failure
  mid-way could not leave a production-shaped table altered. `db:push` itself was
  deliberately not run — it would sync the entire Drizzle schema, which is a far
  larger mutation than the question needs, and dev's schema is currently the
  reference for the RLS work.

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

## ENV-2 — Prove the migration chain reproduces production's schema ✅ DONE 2026-08-15

**Priority: P0** · Size: M · Files: none expected; a written comparison plus whatever drift repair it turns up

### Result — 2026-08-15 · measured, and it came back DIRTY in exactly one dimension

Built a scratch database from the chain alone and diffed it against a live database.
Commands, reproducible verbatim:

```bash
docker exec ezbuildr-test-db-1 psql -U postgres -c "CREATE DATABASE ezbuildr_env2_chain;"
DATABASE_URL='postgresql://postgres:postgres@localhost:5434/ezbuildr_env2_chain' \
  npx tsx scripts/runMigrations.ts                       # chain from empty -> "Migrations completed"
npx tsx scripts/schema-snapshot.ts > snap_dev.txt        # .env now points at dev
DATABASE_URL='postgresql://postgres:postgres@localhost:5434/ezbuildr_env2_chain' \
  npx tsx scripts/schema-snapshot.ts > snap_chain.txt
diff snap_dev.txt snap_chain.txt
```

**Compared against `dev`, not production** — `dev` is a Neon branch of production cut
2026-08-13 from parent LSN `4/FAE303E0` with `init_source: parent-data`, so it is a
byte-identical copy of production's schema. This kept the comparison strictly read-only
with respect to production, satisfying "zero writes to production".

| Dimension | dev (= production) | chain-built | Verdict |
|---|---|---|---|
| Tables | 107 | 107 | ✅ identical |
| Columns | 1008 | 1008 | ✅ identical |
| Enums | 43 | 43 | ✅ identical |
| Indexes | 319 | 319 | ✅ identical |
| Constraints | 326 | 326 | ✅ identical |
| **RLS policies** | **9** | **36** | 🔴 **drift** |

**So the chain reproduces production's schema exactly, except for RLS.** Every column
type, nullability, default, index and constraint matches line-for-line — e.g. `public.users`
is identical in all three of those sections and differs *only* by the `[RLS]` marker and a
`tenant_isolation` policy present in the chain build and absent from production.

**27 tables have a policy in the chain that production does not have:**

```
ai_usage audit_logs collab_docs collections connections datavault_api_tokens
datavault_databases datavault_number_sequences datavault_row_notes datavault_tables
external_destinations metrics_events metrics_rollups organizations projects records
review_tasks sections signature_requests sli_configs sli_windows steps teams
tenant_domains users workflow_blueprints workflows
```

### 🔴 This overturns the diagnosis in RLS-3 — read before working it

The board (and commit `ee55f6ac`) concluded **"migration `0001` provably did nothing"** and
inferred its `to_regclass` loop guard is broken. **The guard is not broken.** Run `0001` in
chain order against an empty database and it produces all 24 tenant policies plus the
ownership policies on `workflows`/`sections`/`steps` — 36 in total. `0001`'s recorded hash
also **matches** production's, so the file was never edited.

The real cause is sequencing, not the migration: production's tables were created out of
band by `npm run db:push` (a documented workflow in CLAUDE.md), so when `0001` ran, the
tables it names did not yet exist, `to_regclass` returned NULL, and it correctly skipped
them and recorded itself applied. **Production is the drifted artifact; the chain is
correct.** RLS-3 should therefore not rewrite `0001` — see the correction on that ticket.

Two related board claims are also wrong: `0001` omitting `ai_usage` is **already fixed** by
`0004_ai_usage_rls` (the chain build has an `ai_usage` policy), and `files` never appears in
the chain's policy list, so that stale array entry is inert rather than harmful.

### Second finding — 9 of 24 migration files were edited after production applied them

Comparing `drizzle.__drizzle_migrations` hashes by `created_at` order:

```
0005_lying_amphibian  0006_remove_legacy_intake_reuse  0007_add_storage_key
0011_datavault_rls_phase4  0014_outstanding_darkstar  0016_delivery_tenant_not_null
0017_icy_siren  0018_magenta_chat  0019_run_resume_links_rls
```

Consistent with the 2026-07-19 chain regeneration. It has caused no schema divergence — the
table above proves that — but it means production's ledger no longer matches the files on
disk. Recorded as an observation; not blocking.

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

## ENV-3 — Per-environment secrets, and fix the live storage misconfiguration 🔄 mostly done

**Priority: P1** · Size: S · Files: Railway variables per environment, `.env.example`

### Progress — 2026-08-15 (AC1–AC3 met; AC4–AC5 remain)

- **AC1 ✅** All three environments carry a **distinct** `VL_MASTER_KEY`.
- **AC2 ✅** `JWT_SECRET`, `SESSION_SECRET`, `BASE_URL`, `ALLOWED_ORIGIN` are set per
  environment. Production's `JWT_SECRET`/`SESSION_SECRET` are the known deliberate
  placeholders — **do not re-file them as findings.**
- **AC3 ✅** `STORAGE_DRIVER=s3` set in production with `AWS_S3_*` wired, and each
  environment has its **own bucket** (production `integrated-flask-…`, dev
  `clientexposedstorage-ec8pcl`, test `clientexposedstorage-crb-pk`).
- **The "dev must not decrypt production secrets" concern is void.** There are **zero**
  `connections` rows and **zero** `secrets` rows in the database, so the key divergence
  across the Neon branches breaks no stored data. Consistent with the standing finding that
  the database holds only test data (2 users, 43 tenants, 86 workflows, 0 runs).

- **AC5 ✅ 2026-08-19** `.env.example` now carries an explicit *"must be set per environment"*
  list — `DATABASE_URL`, `VL_MASTER_KEY`, `JWT_SECRET`, `SESSION_SECRET`, `BASE_URL`,
  `ALLOWED_ORIGIN`, `STORAGE_DRIVER` + `AWS_S3_*`, and `ADMIN_DATABASE_URL` (RLS-6) — each with
  the reason inheriting it would be a bug rather than a convenience. It also **records the
  variables that are shared today** rather than hiding them: `METRICS_API_KEY` is
  byte-identical across all three environments, so one leaked value covers all three; the
  Google keys are shared and arguably fine.

### Progress — 2026-08-22 · AC4 scoped precisely; it needs a production exercise

Config re-verified on production: `STORAGE_DRIVER=s3`,
`AWS_S3_BUCKET=integrated-flask-bf4igkar`, `AWS_REGION=iad`,
`PDF_CONVERTER_API_URL=http://gotenberg.railway.internal:3000`.

**AC4 cannot be closed by inspection, and cannot be closed from existing data
either:** `run_generated_documents` on the production branch holds **0 rows**.
There is no document to download, so the only way to satisfy "a generated
document downloads successfully from production" is to *generate* one there —
sign in as a production user, run a workflow to completion, and fetch the
resulting file.

That is a deliberate write to production and it needs the owner's explicit
go-ahead; it was not done unilaterally. It is also worth doing BEFORE the RLS
production cutover rather than after, because it proves the storage path works
while the variables are still the known-good ones — if it were run afterwards
and failed, the cause would be ambiguous between storage and RLS.

**I cannot close this myself.** Production has exactly 2 users, both real
accounts whose passwords I do not hold, and `VITE_PUBLIC_SIGNUP_ENABLED` is not
set there, so registering is not available either. Closing AC4 needs one of:
the owner running it and pasting the result; a production account for the
purpose; or temporarily opening signup — which is a security-relevant toggle on
the live system and was not something to do unprompted.

### What the check for AC4 turned up, which matters more than the AC

| production | |
|---|---|
| users | 2 |
| workflows | 86 |
| runs | 97, of which **10 completed** |
| **`run_generated_documents`** | **0** |
| **`run_document_deliveries`** | **0** |
| latest run | 2026-08-01 |

**Ten completed runs and not one recorded generated document, ever.** Either
document generation is not reached by those workflows, or it fails silently, or
the recording is broken. This is precisely what AC4 exists to catch, and it says
`DEBT-OPS1`'s "the bucket is serving" is weaker evidence than it reads: a
reachable bucket is not a working end-to-end document path.

### Production is also 12 migrations behind — RLS-4 there is blocked like `test`

| | migrations | latest | tables with RLS |
|---|---|---|---|
| dev | 37 | 2026-08-22 | full chain |
| test | 24 | ~2026-08-09 | 0 |
| **production** | **24** | **2026-08-09** | **9** |

`files` does not even exist as a table in production. So the production cutover
carries the same precondition as `test`: the promotion chain has to run first.
The 9 RLS-enabled tables there are the pre-0024 set, matching the known note
that the chain yields far more coverage than production currently has.

Still open: **AC4** — a generated document downloading from **production** has still not been
demonstrated, and a set variable is not proof. This one needs the repo owner: proving it means
generating a real document in the live environment, which is a production write and not
something to do unsupervised.

**New observation — shared secrets across environments.** `METRICS_API_KEY` is
byte-identical in all three environments, as are `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`
and `GOOGLE_CLIENT_ID`. The metrics key is the one worth splitting: it authenticates the
metrics endpoint, so one leaked value covers all three environments. The Google keys are
arguably fine to share. Not blocking; folded into this ticket rather than filed separately.

### Finding

Two things, bundled because they are the same pass through Railway's variable UI.

**(a) Secrets become per-environment.** Each environment's database holds its own
AES-256-GCM-encrypted rows (`connections`, `secrets`). `VL_MASTER_KEY` decrypts them.
`CLAUDE.md` is explicit: **never regenerate `VL_MASTER_KEY` on a machine with stored
secrets** — it breaks every stored secret irrecoverably. So each environment needs its own
stable key, and production's must not change. Do not copy production's key into dev; dev
should not be able to decrypt production secrets even in principle.

**(b) ~~`STORAGE_DRIVER=s3` is unset~~ — WRONG, and corrected 2026-08-13.** Production has
`STORAGE_DRIVER=s3` with `AWS_S3_*` wired as Railway reference variables. It was closed as
**O-3 on 2026-08-04** in the Roadmap board (retired 2026-08-18 → `backlog/ROADMAP.md`,
where O-3 is recorded in the `Closed — do not re-file` table); only the stale `DEBT-OPS1`
index entry said
otherwise, and I repeated it here without measuring. **There is no 404 incident.** Nothing
to do for storage in this ticket.

The general failure: a backlog index entry is a claim about a tree that has since moved.
`tickets/BACKLOG.md`'s own header says exactly that — "Promoting one means re-verifying the
finding first" — and I promoted it into a ticket without doing so.

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

## ENV-4 — Turn on branch protection and make the test environment mean something ✅ DONE 2026-08-15

**Priority: P1** · Size: S · Files: GitHub repository settings; possibly `.github/workflows/ci.yml`

### Finding

> **⚠️ This finding was wrong, corrected 2026-08-15. Protection was never off.**
>
> The 404 below is what the **legacy** branch-protection API returns when a repo uses
> **rulesets** instead — which this one does, and has since 2026-08-13. `main-protection`
> was active the whole time: deletion, non-fast-forward, and PR-required with status checks.
> Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`; the `…/branches/main/protection`
> endpoint cannot see rulesets and its error message actively misleads.
>
> The real gap was narrower and is now closed: only *Quality Gates* and *Validate Strict
> Zones* were required, so **`Tests (24.x)` and `Security Scan` were not** — a PR with a red
> test suite or an unaddressed high-severity advisory could merge. Both were added to
> `main-protection` on 2026-08-15. `dev-protection` was created the same day; `test` already
> had `test-snapshot-protection`.

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

### Progress — 2026-08-13 (the repo-side half is done; GitHub settings remain)

The branch workflow this ticket assumes now exists and is enforced locally:

- `dev` → `test` → `main` is documented in CLAUDE.md ("Branch flow"), with `test` → `main`
  specified as **PR-only** because that hop reaches production.
- **CI runs on all three branches.** `ci.yml`, `strict-mode-check.yml` and `auth-tests.yml`
  previously triggered on `main` alone (and `strict-mode-check.yml` on a `develop` branch that
  has never existed), so there was no check available to require on a `test` → `main` PR.
  There is now — which is criterion 2's dependency.
- `.claude/hooks/guard-branch-push.mjs` blocks a direct push to `test`/`main`, overridable with
  `EZB_DIRECT_PUSH=1` when the repo owner asks. This constrains **Claude**, not git — it is not
  a substitute for protection, which is why this ticket stays open.

### Progress — 2026-08-15 (done, bar one toggle)

- `main-protection` now requires **Tests (24.x)** and **Security Scan** alongside the two it
  already had. This is the substance of criteria 1–2.
- `dev-protection` created (deletion + non-fast-forward), matching `test-snapshot-protection`.
- `delete_branch_on_merge` set to **false**. It was `true`, and merging the first `test` →
  `main` promotion PR deleted the `test` branch outright — the ruleset's `deletion` rule did
  not stop it because all rulesets grant `RepositoryRole → bypass: always`. Railway's test
  environment went to *"Connected branch does not exist"* until the branch was recreated.
- Strictness, decided: **0 required approvals** (GitHub forbids self-approval, so any non-zero
  count locks a solo maintainer out of their own repo) and **admin bypass kept** for
  break-glass. **No linear-history rule** — it forces squash/rebase merges that break the
  fast-forward promotions this branching model needs.

Still open: **`Wait for CI` is OFF on all three Railway environments**, so a deploy starts the
moment GitHub receives a push, regardless of whether Actions pass. Required checks gate the
*merge*, not the *deploy*, so this is the last real gap on the production path. It is a toggle
in Railway → service → Settings → Source, and it is the repo owner's call.

### Acceptance criteria

> **Rewritten 2026-08-15.** The original AC1 required
> `gh api …/branches/main/protection` to return 200. **That is unsatisfiable** — this repo
> protects `main` with a *ruleset*, and the legacy endpoint cannot see rulesets, so it
> returns 404 no matter how strict the protection is. Chasing that criterion is what made
> three separate audits conclude protection was off.

1. ✅ `main` is protected, evidenced by `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`
   — **not** the legacy endpoint. Verified 2026-08-15: `main-protection` (active) with
   `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`; plus
   `dev-protection` and `test-snapshot-protection` (active, deletion + non-fast-forward).
2. ✅ Required checks on `main` are **Quality Gates, Validate Strict Zones, Tests (24.x),
   Security Scan**, and all three branches run CI so they are actually produced.
3. ✅ Strictness confirmed with the repo owner 2026-08-15: **0 required approvals**
   (required *status checks* are CI jobs, not human reviewers — the owner can self-merge
   once CI is green), **RepositoryRole bypass retained** so the owner is never locked out,
   and **no linear-history rule** (it would force squash/rebase, rewriting SHAs and breaking
   the fast-forward promotions this model depends on).
4. ✅ `delete_branch_on_merge` is `false` and must stay so — it is what deleted `test` and
   broke that Railway environment, since every ruleset grants RepositoryRole bypass.

---

## Phase 1 Gate

- [ ] ENV-1..4 ✅ each with a dated verification note — **ENV-2 ✅, ENV-4 ✅; ENV-1 and
      ENV-3 are at AC-level partial (docs + the production document-download proof)**
- [x] Local `.env` demonstrably points away from production — repointed to the dev Neon
      endpoint 2026-08-15; `schema-snapshot.ts` reading `.env` connects to `ep-frosty-firefly`
      and returns a full 107-table snapshot
- [ ] A generated document downloads from production — **still unproven** (ENV-3 AC4).
      Note the original premise was wrong: `STORAGE_DRIVER=s3` has been set since
      2026-08-04, so there is no 404 incident to fix; this is now just missing evidence
- [x] ~~`gh api …/branches/main/protection` returns 200~~ — **unsatisfiable by design.**
      Replaced by `gh api …/rulesets`; `main-protection` verified active 2026-08-15
- [x] Schema-drift comparison written — ENV-2 done. **Drift found: RLS policies only**
      (9 in production vs 36 from the chain). Everything else identical. Needs an owner
      ruling on the repair, which is now RLS-3's reframed scope
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

## RLS-1 — Register the tenant-context middleware ✅ DONE 2026-08-18

**The dispatched dev was killed mid-ticket by a session limit**, having written the
implementation and **no tests and no gates**. The reviewer finished it (tests, entrypoint
guard, doc correction) and ran every gate. Implementation credit is the dev's; the design
call below is its finding and it is a good one.

- `type-check` **0 errors** (tsbuildinfo cleared first) · `eslint --max-warnings 0` on all
  seven touched files **exit 0**
- `test:fast` **281 files / 3252 passed**, 1 unrelated failure —
  `captcha.service.test.ts > should generate unique tokens` — which **passes in isolation
  (10/10)**. This is the documented order-dependent flake: adding a test file shifts
  scheduling and surfaces one unrelated test. Baseline 280/3246 → +1 file, +6 tests, exactly
  the new guard suite.
- `test:integration` **115 files / 1135 passed / 0 failed**, run alone against
  `ezbuildr_test_rls_1` (baseline 114/1129 → +1 file, +6 tests, exactly the new suite)

### 🔴 The Preferred fix below was wrong — corrected by the dev, verified by the reviewer

It said *"Register the middleware after authentication has resolved the tenant."* **There is
no such point.** ezBuildr resolves auth **per route** — `hybridAuth`, `optionalHybridAuth` and
`requireAuth` are declared inline on each route (`app.get(path, hybridAuth, handler)`) and are
**never** mounted globally. Verified independently at review: `grep "app.use(hybridAuth"`
across `server/` returns nothing, while `admin.routes.ts` alone uses it 22 times.

The shipped design instead splits it in two: `rlsContext` mounts **globally, before auth**, and
opens an *empty* `AsyncLocalStorage` store; `server/middleware/auth.ts` then calls
`setCurrentTenantId(...)` from both `attachUserToRequest` (bearer) and `cookieStrategy`
(refresh cookie) once that route's own auth resolves. The store is a mutable object, so the
later write is visible to everything downstream in the request's async chain.

**The detail that makes it correct rather than merely working:** the write is placed **after**
the DB re-hydration block, so the context always carries the tenant that authorization
decisions actually used — not a stale JWT claim. Getting this backwards would have made the
context disagree with the tenancy checks it exists to back up.

This is why the footprint grew beyond the ticket's stated files to include
`server/middleware/auth.ts` and `server/utils/rlsContext.ts` (`runWithRequestContext`,
`setCurrentTenantId`). `runWithTenantContext` is untouched, so existing callers are unaffected.

### Reviewer's own errors, recorded because both are instructive

1. **The first entrypoint guard reported a false violation** — its ordering regex matched
   `registerRoutes()` inside a *comment* in `server/index.ts`. The code was correct; the test
   was not. Now matches the call form `registerRoutes(app)`.
2. **The guard was then vacuous.** Mutation-tested by commenting out `app.use(rlsContext)`:
   **all six tests still passed**, because a plain regex matches `// app.use(rlsContext);` just
   as happily — and commenting it out is the single most likely way it gets disabled. Fixed by
   stripping comment lines before asserting; re-mutated, and **2 tests now fail**. The
   integration proof was mutation-tested the same way: disabling the bearer-path
   `setCurrentTenantId` fails **3** tests while the two no-op tests correctly still pass.

### ⚠️ `TM-B1` bit again, immediately

A conventional integration test here would have exercised **nothing**. The shared harness
builds its app from `registerRoutes`, which does not mount entrypoint middleware, so
`rlsContext` would never have run. The new integration test mounts it onto `ctx.app` exactly
as the entrypoints do — but that means it **cannot** notice an entrypoint losing its
registration, which is why `tests/unit/middleware/rlsContextRegistration.test.ts` exists and
is source-level. Neither `tsc` nor ESLint can see a deleted `app.use(...)`.
**Second initiative in a row this gap has cost real work.**

`docs/architecture/TENANT_ISOLATION_RLS.md` updated: its "mount the middleware after auth"
instruction is struck and replaced with the actual flow.

**Priority: P1** · Size: M · Files: `server/index.ts`, `server/production.ts`, `server/middleware/rlsContext.ts`, `server/middleware/auth.ts`, `server/utils/rlsContext.ts`, `docs/architecture/TENANT_ISOLATION_RLS.md`, tests

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

## RLS-2a — Establish the service-boundary tenant transaction, on one pilot service ✅ DONE 2026-08-18

**Gates re-run by the reviewer**, not read off the report: `type-check` **0 errors** (the real
`npm run type-check`; the dev used `npx tsc --noEmit -p .`) · `eslint --max-warnings 0` on all
four touched files **exit 0** · `test:fast` **281 files / 3254 passed** (baseline 281/3252,
+2 new unit tests) · `test:integration` **116 files / 1141 passed / 0 failed** run alone
against `ezbuildr_test_rls_2a` (baseline 115/1135 → +1 file, +6 tests). Every number matched
the dev's report exactly.

### The pattern RLS-2b copies

`CollectionService.withTx(expectedTenantId, tx, fn)`:
- a caller-supplied `tx` is reused, never nested;
- otherwise the **ambient** tenant (`getCurrentTenantId()`, populated by RLS-1) is compared
  against `expectedTenantId` — the same value that method's `eq(tenantId, …)` predicate uses;
- mismatch **throws before any query runs**; absent ambient falls through to
  `withCurrentTenant`'s existing "no tenant in context" throw;
- on success exactly **one** transaction is opened and threaded to every repository call in
  the method body, including the multi-repo ones.

**`withCurrentTenant` was sufficient as-is (AC6).** No second helper was written. RLS-1 is what
made it usable — the async store it reads was never populated before `bc90cc3e`.

**Repositories needed zero changes.** All three already thread `tx` via
`BaseRepository.getDb(tx)` and none call a sibling repository, so the `SystemStats` deadlock
class does not arise here. Reviewer confirmed no repository file appears in `git status`.
**Good omen for RLS-2b's cost — but re-check per service rather than assuming.**

### The dev overruled the reviewer on the design, and was right

The reviewer raised two sources of truth — the GUC set from the ambient context versus the
`tenantId` argument the predicates use — and leaned toward feeding both from the passed value
so they agree by construction. **The dev rejected that and it had the better argument:** two
checks fed by one input are not two checks, so a miscomputed `tenantId` would defeat the
predicate and the GUC identically and RLS would stop being an independent backstop, which is
exactly what AC3 exists to protect. Its mismatch guard keeps them independent *and* removes
the silent-zero-rows failure the reviewer was worried about, by throwing loudly instead. It
dominates the reviewer's suggestion rather than trading against it.

**Known gap, deliberately documented rather than fixed:** the mismatch check runs only on the
branch where the service opens the transaction. A caller-supplied `tx` is trusted, so passing
a tenant-A transaction into a tenant-B call is unwarned. That is a caller bug and out of the
pilot's scope — **RLS-2b inherits it**; it is recorded in the class comment and §2b of
`docs/architecture/TENANT_ISOLATION_RLS.md` so thirty-five services do not each rediscover it.

### Reviewer verification beyond the gates

- **Mutation re-run independently.** Disabling the mismatch guard fails **exactly one** test
  (the mismatch test), 5 pass; restored. The dev's claim was accurate.
- **Every changed assertion was audited**, because the dev promised to itemise them and its
  final report did not. Result vindicates it: `collections.e2e.test.ts` changed **zero**
  assertions — all edits wrap call sites in `runWithTenantContext` to stand in for the
  middleware a direct service call does not get. `CollectionService.test.ts` changed exactly
  **one**, `toHaveBeenCalledWith(mockCollectionId, undefined)` → `mockTx`, which is *stronger*
  than what it replaced and is the behaviour this ticket creates. Nothing was loosened.
- **The proof is discriminating, not decorative.** AC1 is proven by
  `expect(seenTxs[0]).toBe(seenTxs[1])` — the *identical transaction object* observed in two
  different repositories, not merely two transactions carrying the same tenant. AC4 asserts
  both halves in one test (GUC equals tenant A inside; a pool query afterwards reads
  null/empty), and a second test proves it is the *caller's* tenant rather than a constant.
  Fail-closed and mismatch both assert the repository was **never called**.
- **Fail-closed is safe in production**: all nine production callers of `collectionService`
  live in `server/routes/collections.routes.ts` and are request-scoped, so RLS-1's middleware
  always populates the context. There is no background-job caller for the throw to break.
- The mismatch error embeds both tenant ids but contains neither `not found` nor
  `Access denied`, so `classifyRouteError` returns the generic fallback and the ids never
  reach a client.

**Priority: P0** · Size: M · **Depends on RLS-1 (landed `bc90cc3e`)** · Files: `server/services/CollectionService.ts`, `server/repositories/{Collection,CollectionField,Record}Repository.ts`, `server/utils/rlsContext.ts` (only if a gap appears), `docs/architecture/TENANT_ISOLATION_RLS.md`, tests

> **Re-scoped 2026-08-18, after the owner's ruling.** The original RLS-2 was a single Size-L
> ticket spanning every data-access path, escalated at generation time and explicitly marked
> "do not dispatch as written". The owner has now ruled the shape — **service boundary,
> incrementally** — and "incrementally" is what this split delivers. **RLS-2a establishes the
> pattern on one service; `RLS-2b` rolls it out.** The original Files line described the
> *repository*-base shape (option 1) and no longer matches the ruling.
>
> **Measured surface, 2026-08-18:** 99 service files, **35 reference `tenantId`**, **24 carry
> explicit tenancy checks**. That is the RLS-2b rollout, and it is far too much for one ticket.

### Why CollectionService is the pilot

Two reasons, both deliberate. It **spans three repositories**
(`collectionRepository`, `collectionFieldRepository`, `recordRepository`), so a single service
operation genuinely exercises the shared-transaction property that motivated the ruling — a
one-repository pilot would prove nothing about it. And the `add-api-endpoint` skill already
names it as the reference implementation for `verifyTenantOwnership`, so the pattern
established here becomes the example every future endpoint copies.

`WorkflowService` was rejected as the pilot: it touches seven repositories, which makes it a
rollout target, not a place to discover the pattern.

### What RLS-1 already gave you

`server/utils/rlsContext.ts` already exports **`withCurrentTenant`**, which reads the tenant
from the `AsyncLocalStorage` and opens a transaction with the GUC set. Until RLS-1 that store
was never populated, so the helper was unusable in a running app. **It is now populated on
every authenticated request** (`bc90cc3e`). Do not write a second helper — check whether this
one is sufficient first, and say so either way.

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

### ✅ RULED 2026-08-18 by the repo owner — wrap at the **service boundary** (option 2)

Build it incrementally, with option 1 (repository-base wrapping) as the fallback for
**read-only** repositories.

**Why this and not the others.** The deciding argument is boundary alignment, not transaction
semantics: **the services are already the tenancy layer.** CLAUDE.md defines them as "business
logic, authorization (tenancy checks)", and every `verifyTenantOwnership` lives there. Setting
the GUC at that same boundary means one place owns tenancy. Options 1 and 3 create a *second*
boundary for the same concern, and a split boundary is how this codebase has drifted before.
Option 1 is also the wrong granularity — a service operation spanning repositories would get
several separate transactions, so the GUC is set repeatedly and a partial failure is not
atomic. Option 3's cleanliness is real, but background workers
(`RunCompletionJobWorker`) are not requests, so it would mean maintaining two mechanisms
anyway.

**Known cost, accepted:** the `tx`-threading hazard is real — it already deadlocked
`SystemStats` on a size-1 pool when a repository ran pool queries inside a caller's
transaction. It is bounded, documented and a known fix, and was judged the better trade than a
permanently split tenancy boundary.

**Unchanged:** service-layer `eq(tenantId, …)` predicates **stay**. RLS is a backstop, not a
replacement.

<details><summary>Original three options, kept for the record</summary>

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

</details>

### Ties

- `add-api-endpoint` (3-tier pattern), `db-schema-change`.
- **Blocks RLS-4** — `FORCE` cannot be set until this lands.
- Depends on **RLS-1**.
- Related hazard to read first: the `SystemStats` transaction deadlock — repository methods
  that run pool queries inside a caller's transaction deadlock the size-1 test pool.

### Vertical proof

Entry point: an authenticated request to a `CollectionService` route that touches more than
one repository. Hops: route → `hybridAuth` (populates the async context, RLS-1) → service →
`withCurrentTenant` opens ONE transaction → all three repositories run inside it → Postgres.
Unmocked: the whole chain and the database.

End state, asserted **inside** the transaction:
`SELECT current_setting('app.current_tenant_id', true)` equals the caller's tenant.

Two discriminating halves, both required — either alone proves nothing:
1. **The GUC is set** during the operation, and it is the *caller's* tenant, not a constant.
2. **It does not survive** the transaction: a query issued on the pool afterwards sees
   empty/null. This is the pooled-connection leak the `is_local => true` flag exists to
   prevent, and it is the failure that would silently cross tenants.

Suite: `tests/integration/`.

### Acceptance criteria

1. `CollectionService`'s tenant-scoped operations run inside a **single** transaction opened at
   the service boundary, with the GUC set — not one transaction per repository call.
2. The three repositories accept an optional `tx` and use it when given, matching the existing
   `BaseRepository` optional-`tx` convention. No repository opens its own transaction when
   handed one.
3. **Service-layer `eq(tenantId, …)` predicates remain in place.** RLS is a backstop; removing
   them is out of scope and would be a regression.
4. An integration test proves both halves of the Vertical proof above.
5. **A test proves the no-tenant path fails closed, not open** — a service call with no tenant
   in the async context must not silently run an unscoped query. State and test whichever
   behaviour is chosen (throw, or refuse), and say why in the ticket note.
6. The pattern is documented in `docs/architecture/TENANT_ISOLATION_RLS.md` as the shape RLS-2b
   will copy — including whether `withCurrentTenant` was sufficient as-is.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

> **Watch for the `SystemStats` deadlock class.** A repository method that runs a *pool* query
> while inside a caller's transaction deadlocks the size-1 test pool. If a repository you
> thread `tx` through calls another repository, that inner call needs the `tx` too. This has
> bitten this repo before and it presents as a hang, not an error.

---

## RLS-2b — Roll out: DataVault cluster + TransferService ✅ DONE 2026-08-19 (8 of 23 — remainder is RLS-2c)

**Scoped down at review, deliberately.** The dispatched dev was killed by a session limit
partway through and reported "all clean" from a state that was not — the real suite showed
**7 files / 30 tests failing plus a hang**. What it had genuinely completed is one coherent
cluster, so this ticket now closes at that boundary and `RLS-2c` carries the other 15.

**Converted (8):** the 7 DataVault services + `TransferService`, with their callers
(`WriteRunner`, `ReadTableBlockRunner`, `EnhancedDocumentEngine`, two route files).

**Gates, reviewer-run after the reviewer's own fixes:** `type-check` **0** ·
`eslint --max-warnings 0` on all touched files **exit 0** · `test:fast` **282 files / 3266
passed** · `test:integration` **118 files / 1150 passed / 0 failed, 0 skipped** (the failing
run had 20 skipped; they now execute).

### 🔴 Finding 1 — a deadlock that hangs instead of failing, and it is systemic

`getAccessibleOwnershipFilter` and `getUserOrgIds` (`server/utils/ownershipAccess.ts`) took no
`tx`, so repositories called them **on the pool** from inside the service's transaction. Test
mode runs `max: 1` (`server/db.ts`, deliberately, for schema-isolation reliability), so the
query waits forever on the connection its own transaction holds. **It presents as a 600s hang
and a 300s hook timeout, never as an error** — which is why the dev's own runs did not catch it.

The dev *had* threaded `tx` through `canAccessAsset`, `isOrgMember` and `canManageOrg` in that
same file. It threaded the three helpers called directly and missed the two called a layer
down, inside repositories.

⚠️ **This is not DataVault-specific.** `getAccessibleOwnershipFilter` is also called without
`tx` from **`ProjectRepository` (2 sites)** and **`WorkflowRepository` (2 sites)** — the exact
services RLS-2c converts first. The helper now accepts `tx`; those four call sites still need
it threaded. **See RLS-2c AC2.**

### 🔴 Finding 2 — converted services need an ambient tenant, and three paths do not supply one

This is `TM-B1` in three distinct shapes, all of which had to be fixed:

1. **The shared harness** (`tests/helpers/integrationTestHelper.ts`) built its app from
   `registerRoutes`, which does not mount `rlsContext`. **The dev fixed this correctly** — and
   it is a genuine improvement beyond this ticket.
2. **Tests that build their own app.** Eight integration suites call `registerRoutes`
   themselves and therefore inherit nothing; `datavault-v4-regression` was returning **500 on
   every route**. Fixed by mounting `rlsContext` there too. **The other seven will bite RLS-2c**
   as it converts the services they exercise — `api.projects`, the four `portability.*` suites,
   `api.ai.doc`, `js_helpers`.
3. **Tests that call services directly**, bypassing HTTP entirely. These need the context bound
   explicitly.

**A measured detail worth keeping:** `AsyncLocalStorage.enterWith` binds only the *current*
async execution. Binding in `beforeAll` does **not** reach test bodies, and **`beforeEach` does
not either** — vitest runs each hook and test in its own context. Verified empirically, not
assumed. So a suite calling services directly must bind inside each test body.

`enterTenantContextForTests` was added to `server/utils/rlsContext.ts` for that. It **throws**
outside test/development rather than merely documenting the hazard: `enterWith` has no scope
to exit, so in a request handler it would bleed one tenant's id into whatever ran next on that
tick — the precise leak this phase exists to prevent. It is named in camelCase rather than
copying `_testOnly_setGoogleClient`'s prefix, because that prefix needs an `eslint-disable` and
a rename beats a suppression.

### Reviewer's judgement on the test edits

Every test change is **setup only** — mounting middleware, or binding the tenant context the
middleware would have set. **No assertion was weakened anywhere.** The one assertion that
changed shape did so in RLS-2a, not here.

**Priority: P0** · Size: L (delivered as M) · Files: `server/services/Datavault*.ts`, `TransferService.ts`, `server/utils/ownershipAccess.ts`, `server/utils/rlsContext.ts`, `server/repositories/Datavault{Databases,Tables}Repository.ts`, callers, and 6 test files

---

## RLS-2c — Roll out: collections/records + misc clusters ✅ DONE 2026-08-19 (4 of 15 — remainder is RLS-2d)

**Gates re-run by the reviewer, independently:** `type-check` **0** ·
`eslint --max-warnings 0` on all touched files **exit 0** · `test:fast` **285 files / 3281
passed** · `test:integration` **121 files / 1162 passed / 0 failed, 0 new skips** (baseline
119/1153 → +2 files, +9 tests). Every number matched the dev's report exactly.

**Converted:** `CollectionFieldService`, `RecordService` (collections/records) and
`ReviewTaskService`, `SignatureRequestService` (misc). Stopped at a clean cluster boundary,
disclosed rather than hidden — the remaining clusters are far larger than this ticket assumed
(`OrganizationService` is 927 lines with **no repository layer at all**, direct `db.*` calls
throughout; `WorkflowClonerService` is 1752). See `RLS-2d`.

### The best turn-in of this initiative — two behaviours worth copying

1. **It corrected the reviewer's own number.** This ticket said `WorkflowRepository` had **2**
   un-threaded `getAccessibleOwnershipFilter` call sites. It has **4** (`findByCreatorId`,
   `findByUserAccess`, `findByCreatorAndStatus`, `findUnfiledByCreatorId`). Reviewer verified
   directly: six sites across both repositories, all now threaded. Trusting the ticket would
   have left two live — and they **hang rather than fail**.
2. **It refused to report a gate it had not seen.** Its second full integration run was still
   completing at report time; it said so and offered interim evidence rather than projecting a
   number, then followed up with the real result once it landed. That is the exact opposite of
   RLS-2b's "all clean" from a state that was not.

### It found two regressions its own conversion would have caused

Neither would have shown up as a failing test — it audited callers. `CollectionBlockRunner`
(background completion job) and `SignatureBlockService.executeSignatureBlock` (run-token
holder) both run with **no ambient tenant**, so converting the services beneath them would have
broken real paths. Both now wrap in `runWithTenantContext`, mirroring RLS-2b's
`ReadTableBlockRunner` fix.

### Unconvertible, with reasons (AC6)

- **`RunFileUploadService`** — its one RLS-protected read (`projectRepository.findById` inside
  `resolveContext`) is a **bootstrapping lookup**: the tenant is not known until that query
  returns, so it structurally cannot sit inside a tenant-scoped transaction. Same class as
  `WorkflowTenantResolver`. Its own table (`step_values`) has no `tenant_id` and no policy, so
  wrapping it afterwards would gain nothing either.
- **`QueryService`** — dead code. Reviewer confirmed independently: zero references anywhere in
  `server/` outside its own definition. Left unconverted rather than speculatively converted.

⚠️ **A gap it flagged and correctly did NOT fix — RLS-4 must account for it.**
`SignatureRequestService`'s public token-authenticated methods (`getSignatureRequestByToken`,
`signDocument`, `declineSignature`, plus the `markExpiredRequests` cron) perform an **unscoped
initial SELECT**: the token *is* the authorization, and the row's own `tenantId` then drives a
fresh `withTenant` for every write. Under `FORCE` that bootstrap lookup runs with no tenant
GUC. Same shape RLS-6 solved for the admin console.

### Reviewer verification

- **All six landmine sites threaded** — checked directly, not read off the report.
- `QueryService` dead-code claim confirmed by independent grep.
- AC5's `expect(seenTxs[0]).toBe(seenTxs[1])` present in **both** cluster tests — the identical
  transaction object, not merely the same tenant.
- **Reviewer fix:** the usage example in `ownershipAccess.ts` still showed the **un-threaded**
  call — the precise form that caused RLS-2b's deadlock. A doc comment that teaches the bug is
  worse than none; it now passes `tx`.

`docs/architecture/TENANT_ISOLATION_RLS.md` §2c documents the three service shapes this rollout
needed (ambient-only, optional-`expectedTenantId`, token-authenticated), so RLS-2d does not
rediscover them.

**Priority: P0** · Size: L (delivered as M) · Files: 15

---

## RLS-2d — Roll out: org/access cluster ✅ DONE 2026-08-19 (4 of 9 — remainder is RLS-2e)

**Gates re-run by the reviewer independently:** `type-check` **0** ·
`eslint --max-warnings 0` **exit 0** · `test:fast` **285 files / 3281 passed** ·
`test:integration` **122 files / 1167 passed / 0 failed, 0 skipped** (baseline 121/1162 → +1
file, +5 tests, exactly `rls2d-orgAccessCluster.test.ts`). The reviewer's run and the dev's
agreed exactly.

**Converted:** `OrganizationService`, `ProjectService`, `TeamService`.
**Deliberately not converted:** `AdminOrgStatsService` (see below).
Also fixed the five hand-rolled-app suites flagged in the dispatch — `api.projects` and the
four `portability.*` — which now mount `rlsContext` before `registerRoutes`.

`OrganizationService` was the risky one: ~927 lines, **no repository layer**, ~20 methods
issuing `db.*` directly. Reviewer verified **zero bare `db.` calls remain**. It uses §2c's
**ambient-only** `withTx` variant, and the reviewer checked the premise rather than accepting
it: no method takes a `tenantId` argument (it derives the tenant internally), so there is
nothing to cross-check and the mismatch guard would have nothing to compare. Correct variant.

AC5 asserts the identical transaction object across **three** repositories
(`seenTxs[0] === [1] === [2]`), stronger than the two required.

### 🔴 Reviewer finding — `AdminOrgStatsService` will silently truncate under FORCE

The dev correctly declined to convert it and documented why: it is an **admin-only,
cross-tenant aggregate** reporting one row per organization across every tenant, so a
tenant-scoped transaction would defeat its entire purpose. It even identified it as "the same
class as RLS-6's BYPASSRLS path". That reasoning is right.

**But it is not on that path.** `AdminOrgStatsRepository` imports the **normal** `db` pool, and
it is **not** in RLS-6's `adminDb` allowlist — only `AdminAccessService` is. So the moment
RLS-4 sets `FORCE`, `GET` on the admin org-stats route returns **only the acting admin's own
tenant's organizations**: no error, just a short list that looks correct. That is precisely the
failure RLS-6 was created to prevent, in a service RLS-6 did not cover.

**This is now a third precondition on RLS-4** — see that ticket. The fix is small (route
`AdminOrgStatsRepository`'s reads through `AdminAccessService`/`adminDb` and add it to the
containment allowlist), but it must land before `FORCE`.

The pattern is worth naming: the dev reasoned correctly all the way to *"cannot convert"* and
stopped there, without asking *"then does it still work after RLS-4?"*. Nearly every real
defect in this initiative has lived at exactly that seam.

### Process note — the dev disclosed its own error rather than tidying it

Believing its integration run had died, it launched a **second concurrent full suite** — the
documented clobbering hazard. It then caught this itself, checked `pg_stat_activity` before
trusting either result, killed the redundant run, and **reported the mistake explicitly rather
than presenting a clean account**. The reviewer's independent run produced the identical
number, so nothing was contaminated. Disclosing a process error you could have hidden is the
behaviour this board wants; the underlying rule still stands — **never run two DB-backed suites
at once**.

**Priority: P0** · Size: L (delivered as M) · Files: 16

---

## RLS-2e — Roll out: workflow/template cluster ✅ DONE 2026-08-20 — **the rollout is complete**

All five converted: `WorkflowService`, `VersionService`, `TemplateService`,
`TemplateValidationService`, `WorkflowClonerService` (`copyProject` + `copyWorkflow`;
`copyWorkflowAsAdmin` deliberately excluded, below). **21 services now open a tenant-scoped
transaction at the service boundary.** RLS-2a → 2e is finished; only RLS-4 and RLS-5 remain.

**Gates re-run by the reviewer:** `type-check` **0** · `eslint --max-warnings 0` **exit 0** ·
`test:fast` **285 files / 3283 passed** (baseline 3281 → +2, the reviewer's guard tests).

### 🔴 The dev found a real DEADLOCK, not a documented degradation — the key result of this ticket

`VersionService.serializeWorkflowInTx` calls `WorkflowService.getWorkflowWithDetails` **nested
inside its own open transaction**, which then called the unconverted `BrandingService` **on the
pool**. Against the `max: 1` test pool that is a hard hang: the branding read queues forever for
the connection the outer transaction already holds.

**This is a new path into the `SystemStats` deadlock class** — reached through a *converted
service*, not a bare repository call. Every prior instance was repository-level. It reproduced
the hang with `pg_stat_activity`, killed the hung task, `pg_terminate_backend`'d the stale
`idle in transaction` row, and — correctly — **did not start a second concurrent run** to check.

**Fix:** branding resolves only when `getWorkflowWithDetails` opened the transaction itself
(every caller except `VersionService`). Nested calls compute the same workflow-only fallback
`resolveForWorkflow`'s own failure branch uses, synchronously, with no DB call. Verified safe:
`VersionService` has **zero** references to branding and the version snapshot schema does not
carry it, so nothing downstream loses data.

### 🔴 A third non-request caller, found by audit and in no checkpoint report

`server/realtime/auth.ts` — **WebSocket collab upgrades never pass through Express middleware**,
so a converted `verifyAccess` would have thrown "no tenant in context" for **every collaborative
editing connection**. Now wrapped in `runWithTenantContext(payload.tenantId, …)`, using a tenant
already verified from the JWT and checked against the room. Found by auditing callers, not by a
failing test — and it appeared in no checkpoint, which is why the reviewer diffs the tree rather
than reading reports.

### Reviewer additions

The dev was killed by a session limit before adding the guard tests the reviewer asked for, so
the reviewer wrote them. The branding fix is **correct today and invisible if it regresses**: if
the top-level path ever took the fallback branch too, every other assertion in the file would
still pass and the builder would silently render **default branding on a customer-facing
portal**. Two tests now pin both directions, and both were **mutation-proven**:

- force `openedOwnTransaction = false` → the "resolves REAL branding" test goes red (and so does
  the pre-existing GH-158 preview test);
- force it `true` → the "does NOT hit BrandingService when nested" test goes red, i.e. the
  deadlock path is detected.

### `copyWorkflowAsAdmin` — the dev's reasoning beat the obvious fix

Wrapping it in the ambient `withTx` would set the GUC to the **admin's** tenant while
`copyWorkflowCore` reads the **source** workflow's sections and steps, silently producing an
**empty copy**. Copying nothing quietly is worse than failing. Left with no GUC at all, so under
`FORCE` it fails closed — it **breaks rather than leaks**, which is the correct direction.

### Unconverted, all flagged with post-FORCE behaviour stated (AC6)

| Item | Behaviour once `FORCE` is on |
|---|---|
| `copyWorkflowAsAdmin` | Fails closed (throws / empty copy). Needs RLS-6-style bypass. |
| `BrandingService.resolveForWorkflow` | Silently renders **default branding** on the client portal — customer-visible. |
| `VariableService.listVariables` (via `TemplateValidationService.validate`) | Sees **zero variables**, so a template is reported clean when it is not. |

All three are now RLS-4 preconditions. Note the mechanism the reviewer corrected: the branding
exposure is `resolveTenantIdForWorkflow` reading **`workflows`** (RLS-covered), **not** the
branding column — `tenants` has no policy. Worded the other way, the next reader checks
`tenants`, finds nothing, and dismisses it.

**Priority: P0** · Size: L · Files: 11

**Priority: P0** · Size: **L** · **BLOCKS RLS-4** · Dispatchable now

### Scope — the last 5 services

`WorkflowService`, `WorkflowClonerService`, `VersionService`, `TemplateService`,
`TemplateValidationService`.

`WorkflowClonerService` is ~1752 lines. `VersionService` needs the same bare-call →
`scopedTx.*` treatment `OrganizationService` needed. **Splitting again is acceptable** — every
slice of this rollout has landed that way and each was accepted.

### Everything already mapped — do not rediscover it

1. **Read `docs/architecture/TENANT_ISOLATION_RLS.md` §2b and §2c.** Three service shapes are
   documented; pick one. `OrganizationService` is the worked example for a service with no
   repository layer.
2. **The `getAccessibleOwnershipFilter` landmine is fixed** (six sites thread `tx`). If you add
   a call, pass `tx` — omitting it **hangs rather than fails** against the `max: 1` test pool.
3. **Two suites that build their own app remain unfixed** and are in your path: `api.ai.doc`
   and `js_helpers`. Add `app.use(rlsContext)` before `registerRoutes`.
4. **Direct-call suites** need `enterTenantContextForTests(tenantId)` **inside each test body** —
   `beforeAll` and `beforeEach` both fail to propagate.
5. **Audit callers before declaring a service done.** `WorkflowClonerService` and
   `VersionService` are both reachable from non-request paths (background jobs, run-token
   holders) where there is **no ambient tenant**. RLS-2c found two such regressions that no
   failing test would have shown.
6. **For anything you decline to convert, ask the second question**: does it still work once
   `FORCE` is on? `AdminOrgStatsService` passed the first test and failed the second.

### Acceptance criteria

Same as RLS-2d, applied to the five services above — one transaction at the service boundary,
repositories threading `tx`, predicates unchanged, a fail-closed test per service, an
identical-transaction-object assertion, unconvertible services listed **with their post-FORCE
behaviour stated**, and `type-check` 0 / `lint` 0 / `test:fast` above baseline /
`test:integration` 0 failed and no new skips.

### Reporting

Report after each service or small group, not only at the end. **Five** devs on this board have
now been killed mid-ticket by session limits.

**Priority: P0** · Size: **L** · **BLOCKS RLS-4** · Dispatchable now

### Scope — 9 services, and they are the big ones

| Cluster | Services |
|---|---|
| Org / access (4) | `Organization`, `Project`, `Team`, `AdminOrgStats` |
| Workflow / template (5) | `Workflow`, `WorkflowCloner`, `Version`, `Template`, `TemplateValidation` |

**Sized honestly:** `OrganizationService` ~927 lines with **no repository layer** — it calls
`db.*` directly across ~20 methods, so every bare call becomes `scopedTx.*`.
`WorkflowClonerService` ~1752 lines. `VersionService` needs the same treatment. **Expect this
to split again**; stopping at a cluster boundary with a written record is a good outcome and is
how RLS-2b and 2c both landed.

### Everything already mapped — do not rediscover any of it

1. **Read `docs/architecture/TENANT_ISOLATION_RLS.md` §2b and §2c first.** §2c documents the
   three service shapes; pick the one that fits rather than inventing a fourth.
2. **The `getAccessibleOwnershipFilter` landmine is FIXED** — all six sites thread `tx`, and the
   doc comment now shows the safe form. If you add a call, pass `tx`, or the suite **hangs
   rather than fails** (pool query inside a transaction against a `max: 1` pool).
3. **Seven suites build their own express app** and never mount `rlsContext`. **Five are
   squarely in your path**: `api.projects` and the four `portability.*` suites. Add
   `app.use(rlsContext)` before `registerRoutes` — see
   `tests/integration/datavault-v4-regression.test.ts`.
4. **Suites calling services directly** need `enterTenantContextForTests(tenantId)` **inside
   each test body** — `beforeAll` and `beforeEach` both fail to propagate. Measured, not
   assumed.
5. **Audit callers before declaring a service done.** RLS-2c found two real regressions no
   failing test would have shown. `WorkflowClonerService` and `VersionService` are both
   reachable from non-request paths — check them.

### Acceptance criteria

Same as RLS-2c, applied to the nine services above:

1. One transaction at the service boundary per operation, following §2b/§2c.
2. Any repository lacking optional-`tx` gains it; say which were already correct.
3. `eq(tenantId, …)` predicates stay.
4. A fail-closed test per converted service — the repository must not be reached.
5. At least one multi-repository service per cluster asserts the **identical transaction
   object** (`expect(txA).toBe(txB)`).
6. Unconvertible services listed with reasons; **non-request callers flagged for RLS-4**.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` **0 failed and
   no new skips**.

### Reporting

Report after each cluster. Four devs on this board have now been killed mid-ticket by session
limits: the ones that checkpointed had their work landed, the ones that did not had it
reconstructed by the reviewer at real cost.

**Priority: P0** · Size: L · **BLOCKED on nothing — dispatchable now** · **BLOCKS RLS-4**

### Scope

| Cluster | Services |
|---|---|
| Workflow / template (5) | `Workflow`, `WorkflowCloner`, `Version`, `Template`, `TemplateValidation` |
| Org / access (4) | `Organization`, `Project`, `Team`, `AdminOrgStats` |
| Collections / records (3) | `CollectionField`, `Record`, `Query` |
| Misc (3) | `ReviewTask`, `SignatureRequest`, `RunFileUpload` |

`CollectionService` (RLS-2a), the 7 DataVault services and `TransferService` (RLS-2b) are
done — do not redo them.

### Read this before starting — it will save you a day

1. **Copy the pattern from `CollectionService.withTx`.** Do not re-derive it, do not write a
   second helper, and do not relitigate the ambient-vs-argument independence — it was ruled on.
2. **`getAccessibleOwnershipFilter` now takes `tx`, and four call sites still ignore it:**
   `ProjectRepository` (2) and `WorkflowRepository` (2). **Thread it.** Miss one and the suite
   **hangs rather than fails** — a pool query inside a transaction against a size-1 pool. This
   cost RLS-2b real time; it should cost you ten minutes.
3. **Seven integration suites build their own express app** and so never mount `rlsContext`:
   `api.projects`, `portability.export`, `portability.import`, `portability.import.limits`,
   `portability.roundtrip`, `api.ai.doc`, `js_helpers`. As you convert the services they
   exercise, each needs `app.use(rlsContext)` before `registerRoutes`, exactly as
   `datavault-v4-regression.test.ts` now does.
4. **Suites calling services directly** need `enterTenantContextForTests(tenantId)` **inside
   each test body** — `beforeAll` and `beforeEach` both fail to propagate.

**Worth considering and reporting on:** mounting `rlsContext` inside `registerRoutes` would fix
class (3) permanently for every consumer — entrypoints, shared harness and hand-rolled test
apps alike. It was **not** done here because it contradicts RLS-1's shipped design and its
entrypoint guard test, and that trade deserves a deliberate decision rather than a drive-by
change mid-rollout. If you reach the same conclusion, say so and let the reviewer rule.

### Acceptance criteria

1. Every service in the table opens tenant-scoped work in **one** transaction at the service
   boundary, following the pilot's `withTx` shape.
2. **All four remaining `getAccessibleOwnershipFilter` call sites thread `tx`**, and any other
   helper reached from inside a transaction does too.
3. `eq(tenantId, …)` predicates stay everywhere.
4. Each converted service has a test proving it **fails closed** with no tenant in context —
   the repository must not be reached. Per-cluster parameterised tests are fine.
5. At least one **multi-repository** service per cluster asserts the *identical* transaction
   object reaches both repositories (`expect(txA).toBe(txB)`). Same-tenant is a weaker claim.
6. Any service that cannot be converted is **listed with its reason** — a background/non-request
   caller is the expected legitimate case, and it hits `FORCE` unprotected in RLS-4.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` **0 failed and
   no new skips** — a suite that silently skips is not a suite that passes.

### Reporting

Report after each cluster. Two devs on this board were killed mid-ticket by session limits;
a cluster-sized checkpoint is what makes partial work landable instead of discarded.

**Priority: P0** · Size: **L** · **BLOCKED on RLS-2a** · Files: the tenant-scoped services and the repositories they call

### Finding

**35 of 99 service files reference `tenantId`; 24 carry explicit tenancy checks** (measured
2026-08-18). RLS-2a converts one of them. Until the rest are converted, any query issued
outside a tenant transaction will see **zero rows** the moment RLS-4 sets `FORCE` — so this is
the ticket that decides whether enforcement is survivable.

### Preferred fix

Copy the pattern RLS-2a documents, service by service. **Do not re-derive it**, and do not
introduce a second helper.

**Size it and batch it after RLS-2a lands, not now.** The pilot will reveal the real per-service
cost, and any estimate written before it is a guess. Services are largely disjoint files, so
batches can be dispatched in parallel — but note the shared repositories underneath, and
**sequence any two services that thread `tx` through the same repository**.

Read-only repositories may use repository-base wrapping as the fallback (the owner's ruling),
which is cheaper where there is nothing transactional to protect.

### Ties

- Depends on **RLS-2a**; **blocks RLS-4**.
- `RLS-5` is the gate that proves the rollout is complete — a service missed here shows up
  there as an integration failure under the restricted role, which is exactly what that gate
  is for.

### Scope, measured 2026-08-18 after the pilot landed

**23 services**, in five domain clusters. Work them cluster by cluster:

| Cluster | Services |
|---|---|
| DataVault (7) | `DatavaultApiTokens`, `DatavaultColumns`, `DatavaultDatabases`, `DatavaultRowNotes`, `DatavaultRows`, `DatavaultTablePermissions`, `DatavaultTables` |
| Workflow / template (5) | `Workflow`, `WorkflowCloner`, `Version`, `Template`, `TemplateValidation` |
| Org / access (5) | `Organization`, `Project`, `Team`, `Transfer`, `AdminOrgStats` |
| Collections / records (3) | `CollectionField`, `Record`, `Query` |
| Misc (3) | `ReviewTask`, `SignatureRequest`, `RunFileUpload` |

`CollectionService` is done (RLS-2a) — do not redo it. `QueryService` and `TransferService`
are not directly route-reachable; convert them anyway if a converted service calls them, and
say so if they turn out to be dead.

### What the pilot established — copy it, do not re-derive it

Read `server/services/CollectionService.ts` first. The shape is a private
`withTx(expectedTenantId, tx, fn)`: reuse a caller-supplied `tx`, otherwise compare the
ambient tenant against the `tenantId` the method's own `eq(tenantId, …)` predicate uses, throw
on mismatch, and open exactly one transaction via `withCurrentTenant`. §2b of
`docs/architecture/TENANT_ISOLATION_RLS.md` documents it.

**The pilot needed zero repository changes** — all three already threaded `tx` through
`BaseRepository.getDb(tx)`. **Do not assume that holds everywhere.** Check each repository a
service touches, and where one is missing `tx` support, add it following the same convention.

⚠️ **The `SystemStats` deadlock class is the real hazard at this scale.** A repository method
that runs a *pool* query inside a caller's transaction deadlocks the size-1 test pool, and it
presents as a **hang, not an error**. If a repository you thread `tx` through calls another
repository, the inner call needs the `tx` too. With 23 services this will happen at least once.

### Acceptance criteria

1. Every service in the table above opens its tenant-scoped work inside **one** transaction at
   the service boundary, following the pilot's `withTx` shape. No second helper, no per-repository
   transactions.
2. Any repository lacking optional-`tx` support gains it, matching the `BaseRepository`
   convention. Repositories that already support it are left unchanged — **say which were
   already correct**, as the pilot did, rather than editing files that need nothing.
3. **`eq(tenantId, …)` predicates stay everywhere.** RLS is a backstop. Removing one is a
   regression, not a cleanup.
4. Each converted service has a test proving it **fails closed** with no tenant in context —
   the repository must not be reached. A per-cluster parameterised test is fine; 23 near-identical
   files are not required.
5. At least one **multi-repository** service per cluster has a test asserting the *identical*
   transaction object reaches both repositories (`expect(txA).toBe(txB)`), as RLS-2a did.
   Same-tenant is not the same claim as same-transaction.
6. Any service that cannot be converted is **listed with the reason**, not silently skipped.
   A background/non-request caller is the expected reason — those have no ambient tenant, and
   forcing one would be wrong. Flag them for RLS-4, since they will hit `FORCE` unprotected.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

### Reporting

**Report progress after each cluster**, not only at the end. A dev on this board was killed
mid-ticket by a session limit and left no record of what it had decided; the recovery cost was
real. A cluster-sized checkpoint makes partial work resumable by the next session.

---

## RLS-3 — Repair policy coverage: 24 of 26 tenant tables are unprotected ✅ DONE 2026-08-18

**Gates re-run by the reviewer:** `type-check` **0 errors** · `eslint --max-warnings 0` on both
touched files **exit 0** · `test:integration` **117 files / 1147 passed / 0 failed** run alone
against `ezbuildr_test_rls_3` (baseline 116/1141 → +1 file, +6 tests, exactly
`rls-coverage.test.ts`) · `test:fast` 281/3254, unchanged.

### The root cause, which is better than the ticket's diagnosis

Neither `0001` nor `0004` is broken, and the dev did not touch them. **The tables were created
out of band by `npm run db:push` before those migrations first ran for real**, so every
`to_regclass(...)` guard resolved NULL for a table that did not exist *at that moment*, the
loop logged a NOTICE and continued — **and the migration still recorded itself applied.** That
is the whole 9-vs-36 divergence, and it explains why a chain-built database gets 36 policies
while production and its Neon-branch clones have 9.

The repair is a **forward** migration, `0024_repair_rls_coverage.sql`, re-applying the 24
direct-`tenant_id` policies plus the 3 ownership-derived ones on `workflows`/`sections`/`steps`.
Unlike the originals it **fails loudly** (`RAISE EXCEPTION`) when an expected table is missing,
so this class of silent skip cannot recur. It is idempotent, so a database already built
correctly from the chain is unaffected.

### Reviewer verification, measured independently

- **Target database confirmed before anything else:** the worktree's `DATABASE_URL` is
  `ep-frosty-firefly` — **dev**. Production is `ep-gentle-leaf`. Production was not touched.
- **Ran my own read-only probe against dev after the migration:** **36 policies**, and
  **zero** `tenant_id` tables without a policy. The dev's 9 → 36 claim is true.
- **The coverage test is self-proving, not merely asserting.** It creates a real `tenant_id`
  table with no policy and asserts the detector flags it, then creates one *with* RLS and a
  policy and asserts it clears, dropping both. That discrimination is permanent, which is
  stronger than a one-off mutation check.
- `files` is confirmed **permanently inert** — the table does not exist at all, so the stale
  entry in `0001`'s array was never a live gap.

**Accepted deviation:** the migration was applied to **dev only**. The dev had no
credentials for `test`/production in a dev worktree, and `railway.json` runs `db:migrate` as a
pre-deploy step, so both receive it through the normal `dev` → `test` → `main` promotion.
Reaching for production credentials from a dev worktree is precisely what Phase 1 exists to
prevent, so this is the right call rather than a shortfall.

⚠️ **`0024` is now applied to the dev database, which freezes its number.** RLS-6 also
generated an `0024` in its own worktree — worktrees are isolated, so neither dev could see the
other's journal. RLS-6 must regenerate as `0025`; renumbering *this* one would strand a
`drizzle.__drizzle_migrations` row pointing at a file that no longer exists. Both also bumped
the schema-cache token to `_v27`; RLS-6 takes `_v28` so its new table actually invalidates the
cached test schema.

**Priority: P0** (raised from P1 on 2026-08-13 — the coverage gap was measured, not theoretical)
· Size: M · Files: a new migration, `docs/architecture/TENANT_ISOLATION_RLS.md`

> ### 🔴 CORRECTED 2026-08-15 by ENV-2 — the preferred fix below is wrong
>
> ENV-2 built a database from the migration chain alone and got **36 policies**, covering
> all 24 tenant tables plus `workflows`/`sections`/`steps`. Production has 9. So:
>
> - **`0001` is not broken and its loop guard is not the defect.** Its recorded hash matches
>   production's, so the file was never edited, and it demonstrably works in chain order.
> - **Do NOT "replace `0001` with a version that fails loudly".** That instruction below was
>   written from a wrong diagnosis. Changing `0001` would alter an already-applied
>   migration's hash for no gain — and 9 files are already in that state (ENV-2).
> - The defect is that **production's tables were created by `db:push` out of band**, so they
>   did not exist when `0001` ran; it skipped them and recorded itself applied.
>
> **The work is therefore a forward migration that applies the missing policies to existing
> databases**, written to be idempotent and to fail loudly if a table it names is absent.
> The chain build is the specification for what the end state must look like — diff against
> it rather than re-deriving the list.
>
> Two sub-claims below are also void: `ai_usage` is already covered by `0004_ai_usage_rls`,
> and `files` never yields a policy in the chain, so that array entry is inert.
>
> Note dev and test are **Neon branches of production**, so they carry the same 9-policy
> gap. Fixing production alone will leave them drifted — apply to all three.

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

## RLS-4 — Add `FORCE ROW LEVEL SECURITY` and move off the owner role 🔄 dev DONE 2026-08-22

### Progress — 2026-08-22 · **dev is cut over and enforcing**

Procedure, measured Neon facts and rollback: [`RLS4_CUTOVER.md`](RLS4_CUTOVER.md).

| AC | State |
|---|---|
| 1. Migration sets `FORCE` on every policy table | ❌ **not done — and read this before doing it.** `neondb_owner` holds `BYPASSRLS` *directly*, and BYPASSRLS beats FORCE, so a FORCE migration alone changes nothing here. The isolation comes from AC2. FORCE is still worth adding as defence against a future non-bypassing owner, but it is not what makes this work. |
| 2. Least-privilege role, not owner, no BYPASSRLS | ✅ `ezbuildr_app` on the dev branch — `rolbypassrls=false`, no role memberships |
| 3. `DATABASE_URL` uses it in dev and test | 🔄 **dev only.** `test` is BLOCKED — see below. `production` gated on both, per this AC |
| 4. Cross-tenant read proven impossible | ✅ as the app role with tenant A pinned: that tenant's rows only, **0** from any other |
| 5. Proven non-vacuous, incl. the empty-string trap | ✅ GUC unset → **0**; GUC `''` → **0**; real tenant → its rows. Both fail-closed |
| 6. Documented rollback | ✅ `RLS4_CUTOVER.md` §5 — variable change + redeploy, no migration to revert |

⚠️ Cutting over broke the first deploy: container start runs `db:migrate`, which
needs DDL the app role does not have. Fixed by `MIGRATION_DATABASE_URL`
(`scripts/runMigrations.ts`), which `test`/`production` must also set.

### 🔴 `test` cannot be cut over yet — it has no RLS policies at all

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

**So the order is forced, and it cannot be shortcut:**

1. Get CI green on `dev` (currently red — `npm test`, 5 files; not RLS).
2. Promote `dev` → `test`. The deploy runs `db:migrate` and brings the schema to 0036.
3. *Then* cut `test` over and re-run the verification below.

The `ezbuildr_app` role already exists on the test branch (created 2026-08-22,
`rolbypassrls=false`, no memberships) and `ALTER DEFAULT PRIVILEGES` is set, so
tables created by migrations 0024–0036 will be granted to it automatically. Only
the four Railway variables and the redeploy remain.

Running the migrations against test out of band would work, but it would put the
schema ahead of the code it is meant to be a snapshot of, which is the one thing
the promotion model exists to prevent.

**Priority: P0** · Size: M · **BLOCKED on RLS-2, RLS-3, and now the admin-access path below** · Files: a new migration, Railway/Neon role configuration, `.env.example`

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

## RLS-5 — Gate: full integration as the non-owner role ✅ DONE 2026-08-22 (AC3 deliberately deferred)

### Progress — 2026-08-22

`scripts/rls-gate.ts` + `.github/workflows/rls-gate.yml`, documented in
`RLS_HANDOFF.md` §7.

| AC | State |
|---|---|
| 1. CI job runs full integration as the restricted role | ✅ on dev/test/main |
| 2. Green, or every failure triaged | ✅ **124/124 files, 1183/1183 tests, allowlist EMPTY** |
| 3. Required by branch protection | 🔲 **deliberately advisory for now** — see below |
| 4. Output for both owner and restricted runs | ✅ both green; recorded in `RLS_HANDOFF.md` §1 |

AC3 is held back on purpose, not forgotten. §4's intermittent "Registration
failed" is still unexplained, and a gate that goes red for reasons unrelated to
the change under test teaches people to re-run it — which is worse than no gate,
because it still carries authority. Promote it to required once that is closed.

The ratchet runs both ways: an unlisted failure fails the build, and so does an
allowlisted file that starts passing. All six behaviours were proven to fire
against synthetic fixtures before it was trusted.

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

## RLS-6 — Cross-tenant read path for the admin console, audited ✅ DONE 2026-08-19

**Gates re-run by the reviewer** after the reviewer's own fixes: `type-check` **0** ·
`eslint --max-warnings 0` on all touched files **exit 0** · `test:fast` **283 files / 3268
passed** · `test:integration` **119 files / 1153 passed / 0 failed** (baseline 118/1150 →
+1 file, +3 tests, exactly the new admin suite).

The dispatched dev was killed by a session limit before reporting, so the reviewer verified
everything from the tree rather than from a turn-in.

### What shipped

`server/db/adminDb.ts` — a second pool on a dedicated `BYPASSRLS` role, behind
`ADMIN_DATABASE_URL`, reachable only from `AdminAccessService`, which writes an
`admin_access_log` row per cross-tenant read. All **four** global admin reads now route
through it. The dev found one the board's own survey had missed: the **"prevent demoting the
last admin"** check, which is cross-tenant by nature and would have silently mis-counted under
`FORCE`, letting the final admin be demoted.

`admin_access_log` (migration `0025`) indexes `target_tenant_id` and `created_at`, so A4's
future customer-facing view ("admin access to *my* tenant, newest first") is a UI change
rather than a migration. FKs are `ON DELETE set null` so deleting a user cannot erase the
audit trail.

### Reviewer verification

- **The containment guard is non-vacuous** — proven by adding a disallowed file that imports
  `adminDb`: it fails, and passes again once removed. It uses an explicit allowlist rather
  than a directory prefix, so widening it is a deliberate edit.
- **AC3/AC4 are proven in one test**, as required: admin crosses tenants and is audited, while
  the same read on the restricted role with the GUC pinned sees only its own tenant. Plus a
  fail-closed case under `FORCE` and an AC6 check that no policy gained an `is_platform_admin`
  clause and the admin role is not the table owner.
- **The four out-of-scope files are justified knock-ons**, and one is a genuine catch:
  `admin_access_log` is added to `EXCLUDED_TABLES` in the portability entity graph. Without it,
  a tenant's export would carry platform-admin audit data out of the system. Startup wiring in
  both entrypoints is gated on `isAdminDbConfigured()`, so it is a no-op until an environment
  provisions the URL.

### 🔴 Reviewer fix 1 — the fallback relocated the failure instead of removing it

`AdminAccessService` fell back to the normal pool when `ADMIN_DATABASE_URL` was unset. Correct
*today* — nothing enforces RLS, so the normal pool still sees every tenant. But the moment
RLS-4 sets `FORCE` in an environment that never got the variable, that fallback hands the
admin console a **tenant-scoped view** — a short list that looks correct, which is the exact
failure this ticket exists to prevent, merely moved from "no escape hatch" to "the escape
hatch is silently inactive".

It now **throws** when `RLS_ENFORCED` is on and the admin pool is unconfigured.

⚠️ **Known limitation, and a hard precondition for RLS-4.** `RLS_ENFORCED` is an application
flag and is **not** the same thing as `FORCE ROW LEVEL SECURITY` on the tables; setting FORCE
while `RLS_ENFORCED` stays false leaves this guard blind. **RLS-4 must therefore provision
`ADMIN_DATABASE_URL` FIRST, then set `FORCE` and `RLS_ENFORCED` together as one step.**

### 🔴 Reviewer fix 2 — a false green the reviewer created, then caught

Reconciling the `0024` collision, the reviewer deleted the dev's
`0024_certain_nightcrawler.sql` and regenerated it as `0025` **without reading it first**. The
regenerated migration contains only the table, while the test did
`ALTER ROLE ezbuildr_admin_bypass …`, assuming a migration had created that role. Nothing in
the tree did.

**It passed anyway** — the dev's earlier `db:migrate` had left the role in the shared Docker
container, and **Postgres roles are cluster-level, so they outlive the database**. Green here,
red on any fresh cluster, i.e. CI.

The fix is better than restoring what was deleted: **the test provisions the role itself,
idempotently**, exactly as it already did for its restricted role. A `CREATE ROLE` in the
migration chain is a whole-cluster side effect a managed Postgres may refuse outright, and
**RLS-4 AC2 already owns production role provisioning** as Railway/Neon configuration.
Verified by dropping the leftover role to simulate a fresh cluster and re-running: **3/3**.

**Migration reconciliation:** RLS-3 and RLS-6 were worked concurrently in isolated worktrees,
so both generated an `0024` and both bumped the schema token to `_v27` — neither could see the
other. RLS-3 merged first and its `0024` was already applied to the dev database, freezing its
number; RLS-6 was regenerated as `0025` and takes `_v28`.

**Priority: P0** · Size: M · **BLOCKED RLS-4 — now unblocked**

**Priority: P0** · Size: M · **BLOCKS RLS-4** · Depends on RLS-2 · Files: `server/db.ts`, a new `server/db/adminDb.ts`, `server/repositories/UserRepository.ts`, `server/routes/admin.routes.ts`, a new migration (audit table), tests

### Repo owner decisions, 2026-08-18 — do not relitigate

| # | Decision |
|---|---|
| A1 | **Admins keep the ability to see and help users**, including running a user's workflow to replicate a reported problem and working inside their account for testing. Enforcing RLS must not take this away. |
| A2 | **Minimal scope now, full initiative later.** This ticket builds *only* the cross-tenant read path the admin console already needs, plus audit. Tenant-switching support sessions, impersonation and time-boxing are a separate initiative. |
| A3 | **Replication runs land in the user's own tenant, unflagged.** Fidelity beats cleanliness: a cloned sandbox loses the tenant's DataVault rows, connections and settings, which is exactly where the reported bugs live. |
| A4 | **Admin access is customer-visible from the start** — when the support-session initiative ships, the customer-facing access record ships with it, not bolted on later. |

> **Consequence of A3 + A4 worth carrying into the later initiative, not a defect here.** A
> customer told "an admin accessed your account" will look at their run list and find runs they
> did not create, with nothing marking what they are. The mitigation is one boolean column
> (`workflow_runs.is_support_run`) plus filtering it out of their analytics; the owner chose
> fidelity over labelling for now. If the labelling is ever wanted, **add it before the first
> support run exists** — retrofitting means guessing which historical rows were staff.

### Finding

`migrations/0001_enable_rls.sql` creates one policy shape,
`USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`, with **no
platform-admin clause**, and **`users` is in the covered table list**.

The admin console reads globally:

```ts
const usersWithStats = await userRepository.findAllUsersWithWorkflowCounts(); // admin.routes.ts:60
const allUsers      = await userRepository.findAllUsers();                    // admin.routes.ts:180
const workflows     = await workflowRepository.findAttributedToUser(userId);  // admin.routes.ts:356
```

None of these is tenant-scoped, and none can be — listing every user is the feature. Once
RLS-4 sets `FORCE` and the app connects as a non-owner role, each returns **only the admin's
own tenant**, with no error raised. A truncated list that looks correct is worse than a
failure.

### Preferred fix

**A second connection pool, on a dedicated role, reachable from exactly one module.**

1. A new DB role with `BYPASSRLS`, distinct from both the table owner and RLS-4's restricted
   application role. Its connection string is a **separate env var** (`ADMIN_DATABASE_URL`),
   set per environment.
2. `server/db/adminDb.ts` exports one Drizzle instance on that pool and **nothing else**. Every
   query through it writes an audit row first.
3. Admin repository methods that genuinely need cross-tenant reads take the admin instance
   explicitly — the existing optional-`tx`/injection pattern, not a global switch.
4. A new `admin_access_log` table: actor user id, action, target tenant id (nullable for
   global lists), target user id, timestamp, request id. This is the table the customer-facing
   view in the later initiative will read, so **design it for that reader now** (A4).

**Why not the alternatives.** Adding `OR current_setting('app.is_platform_admin', true) = 'on'`
to the policy turns a GUC into god mode, and GUCs are set by application code — the thing
RLS-2 just spent a whole ticket making systematic. `SECURITY DEFINER` functions are tighter
still but push query logic into SQL that Drizzle cannot see, and there are only ~4 call sites.
**Do not give RLS-4's application role `BYPASSRLS`** — that returns the system to "one
connection sees everything" and deletes the property Phase 2 exists to create.

**Containment is the point.** A `BYPASSRLS` pool is a loaded weapon; the value is that exactly
one module can reach it. Add a test asserting no file outside `server/routes/admin*` and the
admin services imports `adminDb` — the same shape as
`tests/unit/client/store.deadSetters.test.ts`, which exists because neither `tsc` nor ESLint
can catch a *used* import that simply should not be there.

### Ties

- Load `add-api-endpoint` (service/repository conventions, error contract) and
  `db-schema-change` (the audit table migration; migration index collisions are a known
  hazard when boards run in parallel).
- **Blocks RLS-4** — `FORCE` must not ship before this exists.
- Depends on **RLS-2** (the GUC is set on the normal path) but not on RLS-3.
- ⚠️ RLS-4 AC2 stays as written: the *application* role has no `BYPASSRLS`. This ticket adds a
  **second** role, it does not weaken the first.
- Related: `admin-role-vs-tenant-role` — `users.role` gates `/api/admin`; `tenant_role` gates
  RBAC writes. This ticket concerns the former only.

### Vertical proof

Entry point: `GET /api/admin/users` as a platform admin whose own tenant is A, with at least
one user in tenant B. Hops: route → `hybridAuth` → admin role check → admin service →
`adminDb` → Postgres as the `BYPASSRLS` role. Unmocked: the route chain, both pools, the
database. End state: **users from both tenant A and tenant B are returned**, and an
`admin_access_log` row exists naming the actor and the action.

**The discriminating case:** the same query issued through the *normal* application pool, with
the GUC pinned to tenant A, returns **only tenant A** — proving the admin path is the only
thing crossing the boundary, and that RLS is genuinely enforced everywhere else. Both halves
must be asserted in one test, or the test proves nothing about isolation.

Suite: `tests/integration/`.

### Acceptance criteria

1. A `BYPASSRLS` role exists, separate from the table owner and from RLS-4's application role,
   with its own `ADMIN_DATABASE_URL` documented in `.env.example` per environment.
2. `server/db/adminDb.ts` is the only module exposing it, and a test asserts no file outside
   the admin routes/services imports it.
3. The three admin reads above return cross-tenant results with `FORCE ROW LEVEL SECURITY`
   enabled — proven by an integration test, not by inspection.
4. The same queries on the normal pool with the GUC set to one tenant return **only** that
   tenant — asserted in the same test as (3).
5. Every cross-tenant read writes an `admin_access_log` row (actor, action, target tenant,
   target user, timestamp, request id), and the schema is shaped for a future
   customer-facing reader (A4).
6. No policy gains an admin clause, and RLS-4's application role does not gain `BYPASSRLS`.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

---

## RLS-2f — The call-site sweep: convert everything the audit found ✅ DONE 2026-08-21 (bar RLS-7)

**RLS-2a…2e converted the SERVICES. This converted the CALL SITES** — the ones that never
went through a service, or went through one that had not been converted, and were therefore
invisible to the service-by-service rollout. `scripts/audit-rls-surface.ts` (written
2026-08-21) made that finite: **121 sites across 28 files** at the start.

**Result: 121 → 25, and of the 25 remaining, 14 are RLS-7 below and 10 are audit false
positives** (uncovered tables inside the scanner's 400-character window) or deliberate
(registration's insert, which must run with NO tenant pinned — 0027's NULL-safe `WITH CHECK`
is exactly what permits it). One is `WorkflowClonerService.copyWorkflowAsAdmin`, also RLS-7.

Converted, in order of size: `WorkflowPatchService` (27), `auth.routes` (10),
`SignatureBlockService` (9), the two scripting hook services (10), `ImportService` (7),
`metrics`/`sli`/`TemplateAnalysisService`/`QueryRunner` (7), the small route sites (7),
`RunStateService` + `ReadTableBlockRunner` (3), `MfaService` (2), `adminAuth` (2).

**Gates:** `type-check` 0 · `eslint --max-warnings 0` on every touched file · `test:fast`
**285 files / 3283 passed** · `test:integration` **124 files / 1183 passed** (the one failing
file, `hardening/processingTimeout.test.ts`, is the documented leaked-temp-file trap — cleared
and re-run in isolation, 4/4 green).

**Restricted-role re-measurement** (`RLS_RESTRICTED=true npm run test:integration`, the run
RLS-5 will gate on): **812 tests passed, up from 770**; 41 files pass, up from 39. The raw
"violates row-level security" grep rose 20 → 48, which is the trap this initiative has fallen
into before — attributed by caller, **10 are production code and 38 are test fixtures writing
through the app's restricted pool** (Phase 2's `ownerDb` work). See `RLS_HANDOFF.md` §1.

### The findings that mattered more than the count

Ranked by failure shape, because every one of these would have failed **silently**, not loudly
— see `docs/architecture/TENANT_ISOLATION_RLS.md` §2g for the table:

- **`metrics.emit` and the audit-log writers swallow their own errors.** A rejected insert
  means the run succeeds and its telemetry simply vanishes.
- **`TemplateAnalysisService`** answers "which workflows would this template update break?"
  from `workflows`/`sections`/`steps`. Unscoped it answers **none** — the answer that gets a
  template overwritten with no warning.
- **`RunStateService.getSharedRunDetails`** backs a route with **no auth middleware at all**;
  unscoped, `accessSettings` falls back to defaults and the shared page renders
  `allow_portal: false` as though the owner had set it.
- **`ImportService`'s collision check** reports "no collisions" and creates the duplicates it
  was asked to warn about.
- **`datavault/options.routes` had grown a SECOND implementation of tenant resolution** — the
  workflow → project → creator walk, hand-rolled and unscoped. That is precisely the defect
  `0033` exists for: it resolves *confidently to the wrong tenant* after a project transfer.
  Deleted; it delegates to `WorkflowTenantResolver` now.

### Two corrections worth keeping

- **The audit itself was over-counting.** `logic_rules`, `blocks`, `templates`,
  `workflow_versions` and `step_values` have **no policy** — 7 phantom sites and three whole
  files (the ListTools/Query/Write block runners) that needed nothing. Checked against every
  `CREATE POLICY` in `migrations/`, not assumed. The list now carries its derivation and a
  warning to extend it when a table gains a policy, since the reverse error hides real work.
- **A lib must not open the transaction.** `QueryRunner` takes an injectable `db`; a
  `withTenant` placed inside it opened one on the global pool and silently bypassed that
  injection — every test driving it through a mock failed with "Database not initialized".
  The transaction belongs at the service boundary (`QueryBlockRunner`/`QueryService`), which
  is what §2b already said.

---

## RLS-7 — Route `admin.routes`' remaining cross-tenant operations through `adminDb` ✅ DONE 2026-08-22

### Progress — 2026-08-22 · built to the owner's ruling

Reads go through `AdminAccessService` (`getUser`, `findUserByEmail`,
`getWorkflow`, `countRunsByWorkflowIds`, `listRunsForWorkflow`), each paired
with an `admin_access_log` row. `deleteWorkflow` resolves the target's tenant
through the bypass pool and then writes on the **normal** pool inside
`withTenant` — the read-only-bypass shape that was ruled.

| AC | State |
|---|---|
| 1. Every cross-tenant admin op via `AdminAccessService` | ✅ |
| 2. Each writes an `admin_access_log` row | ✅ |
| **2b. No write on the `adminDb` connection — asserted by a TEST** | ✅ `tests/integration/rls7-adminDb-readonly.test.ts` |
| 3. Containment test passes and is non-vacuous | ✅ passes |
| 4. Behaves as today with `ADMIN_DATABASE_URL` unset | ✅ admin suites green in normal mode |
| 5. Gates | ✅ tsc 0 · lint 0 · restricted + normal integration green |

**AC 2b is enforced by PRIVILEGE, not by inspection.** `tests/setup.ts` grants
the bypass role `SELECT` only and revokes INSERT/UPDATE/DELETE/TRUNCATE, so a
regression that routes a write through `adminDb` fails with SQLSTATE 42501
naming the role, instead of passing quietly. A static scan of
`AdminAccessService` was rejected as the mechanism: it would pass for a write
issued from a repository three frames down, which is how the mistake would
actually be made.

**Proven non-vacuous**, per §6's habit: inverting the REVOKE into a GRANT makes
both write cases fail with *"the write was NOT refused — the bypass role can
write"*. Two traps were hit writing it and are worth knowing — a
collection-time `isAdminDbConfigured()` skipped the entire suite while
reporting green ("1 skipped" reads like a pass), and Drizzle wraps the driver
error so the SQLSTATE is on `.cause`, never on the top-level message.

⚠️ In PRODUCTION the bypass role is `neondb_owner`, which CAN write — Neon
offers no BYPASSRLS-but-read-only role (see `RLS4_CUTOVER.md` §1). So there the
property rests on code containment plus this test, not on privileges. Also
note `adminDb.ts` claimed a migration created a dedicated role that has never
existed; corrected.

> ### ✅ RULED BY THE REPO OWNER 2026-08-21 — the shape is settled, build it this way
>
> **The BYPASSRLS pool stays READ-ONLY. Admin writes are ordinary tenant-pinned
> writes against the TARGET's tenant.**
>
> The flow for every write: read the target row through the audited `adminDb`
> path (which already writes its `admin_access_log` row), take that row's
> tenant, then perform the write inside `withTenant(targetTenantId, …)` on the
> **normal** pool. It works for all five cases — a newly created user has no
> tenant to pin, exactly like registration; `workflows` derives its tenant from
> ownership, so pinning the owner's tenant satisfies the policy.
>
> **Why this over extending `AdminAccessService` to write through `adminDb`:**
> it costs one extra read per write and keeps a property that can be stated in
> one sentence and tested — *the bypass connection cannot write*. The
> alternative doubles what a leaked admin connection can do for a convenience
> saving. It also means the containment test keeps its current meaning.
>
> Consequence for the mechanical cost noted below: **`adminDbOverride` only
> ever needs threading through READ methods**, so `BaseRepository.create` /
> `.delete` do not need to change — which was the ugliest part of the estimate.

**Priority: P1** · Size: M · **BLOCKS RLS-4** (same reason RLS-6 did) · Files:
`server/routes/admin.routes.ts`, `server/services/AdminAccessService.ts`,
`server/repositories/{User,Workflow}Repository.ts`, possibly `BaseRepository.ts`

### Finding

RLS-6 built the audited BYPASSRLS path and routed **four** global admin reads through it.
The 2026-08-21 sweep found **14 more sites in `admin.routes.ts`** that are equally
cross-tenant and still on the normal pool, plus `WorkflowClonerService.copyWorkflowAsAdmin`
(already documented in-file as "fails closed, does not leak" — which under `FORCE` means the
admin copy feature stops working).

They split into two kinds, and the second is why this is a ticket rather than a continuation
of the sweep:

- **Reads** (7): `userRepository.findById` for a target user ×4, `findByEmail`,
  `workflowRepository.findAll`, `workflowRepository.findById` ×3, and the three
  `get*Stats` aggregates.
- **Writes** (4): `updateIsActive`, `updateRole`, `userRepository.create`,
  `workflowRepository.delete` — and `mfaService.adminResetMfa`, which reaches a `users`
  write for someone else's row through `disableMfa`.

`AdminAccessService`'s own docstring scopes it to *reads* ("read cross-tenant through
`adminDb`, then write one `admin_access_log` row"). **Extending it to writes is a real
semantic step and wants the repo owner's eyes**, not a reviewer's judgement call: a
BYPASSRLS pool that can also write is a materially larger blast radius than one that cannot.

### Preferred fix (settled by the ruling above)

1. **Reads** — one `AdminAccessService` method per operation, pairing the `adminDb` call with
   an `admin_access_log` row, exactly as the existing four do. Thread
   `adminDbOverride?: DrizzleDB` through the repository READ methods involved
   (`UserRepository.findById`/`findByEmail`, `WorkflowRepository.findAll`/`findById`, the
   `get*Stats` aggregates). `BaseRepository.findById` gaining the parameter is acceptable;
   `create`/`delete` must NOT.
2. **Writes** — `AdminAccessService` resolves the target's tenant via (1), then performs the
   write in `withTenant(targetTenantId, …)` on the normal pool, logging the same audit row.
   `userRepository.create` for a brand-new admin-created user has no tenant to pin and runs
   unscoped, exactly like registration (0027's NULL-safe `WITH CHECK` is what permits it).
3. `mfaService.adminResetMfa` reaches a `users` write for another user through `disableMfa` —
   it takes the same treatment, and `server/utils/selfUser.ts` is explicitly NOT the answer
   for it (its doc comment says so).
4. **Do not let any of this push anyone toward giving the app role `BYPASSRLS`** — RLS-4's
   AC2 stands.

### Ties

- Depends on nothing; blocks RLS-4, which must not ship an admin console that silently
  truncates. Same failure shape RLS-6 was created for.
- `adminDb.containment.test.ts`'s allowlist may need widening — deliberately, by editing an
  explicit list, which is why it is a list and not a directory prefix.
- `server/utils/selfUser.ts` is **not** the answer for any of these: its two warnings say so.

### Acceptance criteria

1. Every cross-tenant admin operation in `admin.routes.ts` goes through `AdminAccessService`;
   none touches a repository directly.
2. Each one writes an `admin_access_log` row (actor, action, target user/tenant, request id).
2b. **No write is issued on the `adminDb` connection** — asserted by a test, not by review.
   Every write goes through `withTenant` on the normal pool.
3. The containment test still passes and is still non-vacuous (prove it fails when a
   disallowed file imports `adminDb`).
4. With `ADMIN_DATABASE_URL` unset, every admin route behaves exactly as today (the
   documented interim fallback) — proven by the existing admin integration suites.
5. `type-check` 0 · `lint` 0 · `test:fast` at or above baseline · `test:integration` no new
   failures.

---

## Phase 2 Gate

- [ ] RLS-1 ✅ (2026-08-18, `bc90cc3e`), RLS-2a, RLS-2b, RLS-3, RLS-4, RLS-5, RLS-6 ✅, RLS-2f ✅ (2026-08-21), RLS-7 each with a dated verification note
- [x] **RLS-2's shape ruled on by the repo owner** — service boundary, 2026-08-18 — now
      needs delivering
- [ ] A cross-tenant read proven impossible at the database level, with fail-closed evidence
- [ ] **The admin console still shows every tenant** after `FORCE` — the same test that proves
      the line above must prove admin crosses it and nothing else does (RLS-6 AC3/AC4)
- [ ] Full integration green as the restricted role in CI, and required by branch protection
- [ ] `docs/architecture/TENANT_ISOLATION_RLS.md` matches reality, **including the admin
      `BYPASSRLS` role and why it exists**
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
```

RLS-2b, RLS-3 and RLS-6 are mutually disjoint — services, migrations and the admin path
respectively — so they can run concurrently once RLS-2a fixes the pattern. **RLS-4 needs all
three**: without 2b it returns zero rows, without 3 the coverage is wrong, without 6 the admin
console silently truncates.

**Added 2026-08-21:** RLS-2f closed the gap the service-by-service rollout could not see —
call sites that never went through a service. RLS-7 is the same argument as RLS-6, applied to
the admin operations RLS-6 did not cover, and it blocks RLS-4 for the identical reason.

---

## Backlog / observations

- **`dev.ezbuildr.com` and `test.ezbuildr.com` do not resolve** (NXDOMAIN, verified
  2026-08-15). Both are registered on the service in Railway with `sync_status: ACTIVE`,
  but the registrar records were never created, so certificates sit at
  `CERTIFICATE_STATUS_TYPE_VALIDATING_OWNERSHIP`. Records required:
  `CNAME dev → t46dsnmf.up.railway.app` + `TXT _railway-verify.dev = railway-verify=4c13d8da…`,
  and `CNAME test → aiq8x4lt.up.railway.app` + `TXT _railway-verify.test = railway-verify=0e402974…`.
  Both environments are reachable meanwhile at their `.up.railway.app` hosts.
  **Owner decision 2026-08-15: leave for now.** *Tag: operational.*
- **If those subdomains are ever activated, `BASE_URL`/`ALLOWED_ORIGIN` must move with
  them.** Both currently point at `ezbuildr-prod-{dev,test}.up.railway.app` while
  `RAILWAY_PUBLIC_DOMAIN` is the branded host, so OAuth callbacks and CORS would reject the
  branded host — the same class of defect as O-2. *Tag: operational.*
- **`/health` cannot distinguish environments.** All three run `NODE_ENV=production`, so
  every environment reports `"environment": "production"`. Anything that verifies "am I
  hitting dev or prod?" must compare the host or the database, not `/health`.
  *Tag: informational.*
- **`records` is a parallel data model nobody has investigated** (`DV-B3` in
  `tickets/BACKLOG.md`). It is in the RLS array. RLS-3 should say whether it holds real tenant
  data or is vestigial.
- **`DEBT-11`** ("RLS policies defined but not enforced", `product-decision`) is **superseded by
  this file** — resolve it as promoted rather than leaving it parked, or the next audit re-files it.
- **Background workers are not requests.** `RunCompletionJobWorker` runs outside any HTTP
  request, so whatever RLS-2 chooses must give workers a tenant-context path of their own.
  Noted here because it is the likeliest thing to be forgotten until RLS-5 goes red.

---
name: db-schema-change
description: "Use this skill for ANY work involving ezBuildr's Postgres schema, Drizzle definitions, or SQL migrations. Two situations REQUIRE it: (1) Schema edits — adding, renaming, or removing tables, columns, indexes, or pgEnum values, or touching shared/schema/ or migrations/. (2) Migration tooling problems — a migration in migrations/ that npm run db:migrate skips or doesn't apply, questions about how db:push vs db:migrate work or which to use, migration files failing in CI or tests, and 'relation does not exist' / 'column does not exist' errors anywhere (after pulling, in integration test beforeAll/setup, at runtime). The migration chain was regenerated 2026-07-19 (baseline + RLS + functions) and tests apply .sql files their own way, so intuition about how migrations run here is wrong — always load this skill before answering. DO NOT use for data-level work: querying, seeding, DataVault tables made via the app UI, editing values or fields inside a jsonb config column (no DDL involved), connection pooling, or query performance tuning."
---

# Database Schema Changes

## Where schema lives

- One file per domain under `shared/schema/` (`auth.ts`, `workflow.ts`, `run.ts`, `datavault.ts`, `integrations.ts`, `relations.ts`, `billing.ts`, `branding.ts`, `ai.ts`, `system.ts`, `files.ts`, `template_shares.ts`, `analytics.ts` — analytics.ts holds interfaces only, no tables), barreled by `shared/schema/index.ts`; the top-level `shared/schema.ts` just re-exports it.
- Import as `import { foos, type Foo, type InsertFoo } from '@shared/schema'`.
- Define drizzle-zod insert schemas next to the table (`insertFooSchema`) — routes validate with them.
- `drizzle.config.ts`: schema `./shared/schema.ts`, migrations out `./migrations`.

## The golden rule: never hand-author a migration + hand-edit the journal

The chain drifted (2026-07) precisely because migrations were hand-written and
`_journal.json` was hand-edited **without snapshots** — drizzle-kit's model
froze while the SQL moved on, the baseline stopped matching the schema, three
build paths diverged, and `tests/setup.ts` grew a failsafe `ADD COLUMN` block to
compensate. It was regenerated 2026-07-19. **Always let drizzle-kit author
migrations so the SQL, `_journal.json`, and `meta/NNNN_snapshot.json` stay in
lockstep.**

## The workflow

1. **Edit the Drizzle table** in the right `shared/schema/*.ts` domain file (types + relations in `relations.ts` if needed).
2. **Generate the migration:** `npm run db:generate` (drizzle-kit generate). It
   diffs the schema against the latest snapshot and writes the next
   `NNNN_*.sql` **plus** its journal entry **plus** its snapshot. Never create
   the `.sql` by hand and never edit `_journal.json` by hand.
3. **For SQL drizzle can't express** — RLS policies, PL/pgSQL functions,
   imperative data migrations (renames/backfills): `npm run db:generate -- --custom --name my_change`,
   which prepares an empty migration file **with a proper journal entry +
   snapshot**; write the SQL into it. Use `--> statement-breakpoint` between
   statements (the test applier splits on it). Keep DDL idempotent
   (`IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`, `to_regclass`
   guards) so it re-runs cleanly.
4. **Apply:** `npm run db:migrate` (`scripts/runMigrations.ts` → drizzle
   `migrate()`), which CI now runs too. For a personal dev DB you may
   `npm run db:push`, but push is interactive and destructive on drift — never
   the source of truth.

### Current chain (2026-07-19 regeneration)

- `0000_init_baseline.sql` — full current schema (all tables/enums/FKs/indexes), regenerated from `shared/schema.ts`.
- `0001_enable_rls.sql` — custom: direct-`tenant_id` policies + `app_current_tenant()`/`app_owner_tenant()` + workflows/sections/steps policies.
- `0002_db_functions.sql` — custom: DataVault autonumber PL/pgSQL functions.

The next new migration is `0003_...`. Do **not** edit the baseline for new
changes — always add a new file via `db:generate`.

## Tests apply migrations their own way — keep them working

`tests/setup.ts` does **not** use drizzle's migrator. It reads `migrations/*.sql` in alphanumeric order, rewrites `"public".` to a per-worker test schema, and executes each file (splitting on `--> statement-breakpoint` as fallback). Consequences for migration authors:

- Migrations must be **runnable in order on a fresh database** — never assume manual pre-steps.
- Prefer idempotent DDL (`IF NOT EXISTS` / `IF EXISTS`) where reasonable.
- Schema-qualify as `"public"."table"` or leave unqualified — a hardcoded other schema will break test rewriting.
- The old `tests/setup.ts` failsafe `ADD COLUMN` block and `ensureDbFunctions()`
  were **removed** in the 2026-07-19 regeneration — the migrations now build the
  full schema alone. Do **not** reintroduce failsafes; if a fresh test schema is
  missing something, the migration is wrong — fix the migration.
- Per-worker test schemas are cached by a `_vN` token in
  `tests/helpers/schemaManager.ts`. **Bump it (e.g. `_v6`→`_v7`) whenever a new
  migration must reach already-built local schemas** — otherwise reused schemas
  skip migrations and go stale.

## Tenant-scoped tables need an RLS policy (SEC-051)

If the new/changed table has a direct `tenant_id` column, it must also get a
`tenant_isolation` Row-Level Security policy. RLS lives in SQL migrations, not the
Drizzle schema. Copy the pattern in [`migrations/0001_enable_rls.sql`](../../../migrations/0001_enable_rls.sql)
into a **new** migration (don't edit 0001): add the table name to the array. If the
table is scoped indirectly (no `tenant_id`, e.g. via a `workflow_id`), it needs a
join-based policy instead. Full design + the enforcement rollout are in
[docs/architecture/TENANT_ISOLATION_RLS.md](../../../docs/architecture/TENANT_ISOLATION_RLS.md).
A tenant table without a policy is a silent cross-tenant leak once RLS is enforced.

## Enum changes

`stepTypeEnum` and friends are `pgEnum`s (e.g. `shared/schema/workflow.ts:38`). Adding a value needs both the TS enum edit **and** a migration with `ALTER TYPE "step_type" ADD VALUE IF NOT EXISTS 'new_value';`. Postgres can't remove enum values — plan additions carefully.

## Troubleshooting

- "column does not exist" after pulling: your dev DB is behind — `npm run db:migrate` (or `db:push` for a throwaway dev DB). If a reused **test** schema is behind, bump `_vN` in `schemaManager.ts`.
- Validate a fresh-DB run cheaply: `npm run test:docker:up` (PG 16 on port 5434, tmpfs), create an empty DB in the container, then `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/<db> npm run db:migrate` — should apply the whole chain with zero errors, then assert RLS policies (`pg_policies`) + functions (`pg_proc`) exist.
- CI builds the schema with `db:migrate` (ci.yml, auth-tests.yml) — **not** `db:push` — so RLS policies and PL/pgSQL functions are present the same way as prod.

## Reconciling an existing (drifted) database to the regenerated chain

A DB that predates the regeneration has the tables but no drizzle
`__drizzle_migrations` ledger, so `db:migrate` would try to re-CREATE existing
tables. Options: **rebuild** (dev/CI/throwaway — drop schema, `db:migrate`), or
**baseline-stamp** (staging/prod with data — apply a one-time delta to schema
parity, then mark the baseline + RLS + functions migrations as already-applied
in `drizzle.__drizzle_migrations` so future `db:migrate` starts clean).

## After the change

- Run `npm run test:unit:db` and at least one integration file against a fresh Docker DB (proves the migration applies cleanly).
- Update `docs/claude/SCHEMA.md` — CLAUDE.md points agents at it as the tables reference; a stale entry misleads every future session.

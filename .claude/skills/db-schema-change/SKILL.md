---
name: db-schema-change
description: "Use this skill for ANY work involving ezBuildr's Postgres schema, Drizzle definitions, or SQL migrations. Two situations REQUIRE it: (1) Schema edits — adding, renaming, or removing tables, columns, indexes, or pgEnum values, or touching shared/schema/ or migrations/. (2) Migration tooling problems — a migration in migrations/ that npm run db:migrate skips or doesn't apply, questions about how db:push vs db:migrate work or which to use, migration files failing in CI or tests, and 'relation does not exist' / 'column does not exist' errors anywhere (after pulling, in integration test beforeAll/setup, at runtime). The migration journal has drifted and tests apply .sql files their own way, so intuition about how migrations run here is wrong — always load this skill before answering. DO NOT use for data-level work: querying, seeding, DataVault tables made via the app UI, editing values or fields inside a jsonb config column (no DDL involved), connection pooling, or query performance tuning."
---

# Database Schema Changes

## Where schema lives

- One file per domain under `shared/schema/` (`auth.ts`, `workflow.ts`, `run.ts`, `datavault.ts`, `integrations.ts`, `relations.ts`, `billing.ts`, `branding.ts`, `ai.ts`, `system.ts`, `files.ts`, `template_shares.ts`, `analytics.ts` — analytics.ts holds interfaces only, no tables), barreled by `shared/schema/index.ts`; the top-level `shared/schema.ts` just re-exports it.
- Import as `import { foos, type Foo, type InsertFoo } from '@shared/schema'`.
- Define drizzle-zod insert schemas next to the table (`insertFooSchema`) — routes validate with them.
- `drizzle.config.ts`: schema `./shared/schema.ts`, migrations out `./migrations`.

## The workflow

1. **Edit the Drizzle table** in the right `shared/schema/*.ts` domain file (types + relations in `relations.ts` if needed).
2. **Apply to your dev DB:** `npm run db:push` (drizzle-kit push — fine for dev/Neon).
3. **Write a SQL migration** in `migrations/` for anything that must reach other environments: next sequential number, snake-case name, statements separated by `--> statement-breakpoint` (drizzle's delimiter — the test applier splits on it too). The chain was **compacted in July 2026 to a single `0000_init_baseline.sql`** that builds the full schema from scratch — so the next new file is `0001_...`. Do not edit the baseline for new changes; add a new file.
4. `npm run db:migrate` runs `scripts/runMigrations.ts` (drizzle `migrate()` with `migrations/meta/_journal.json`). The journal was reset with the compaction and now has one clean baseline entry — but the failure mode is unchanged: if you add a `.sql` file **without** a matching `migrations/meta/_journal.json` entry, it will silently never run via `db:migrate`. (The old drifted chain's leftovers — `scripts/applyMigrationNNNN.ts` — still exist but are historical; don't use them.)

## Tests apply migrations their own way — keep them working

`tests/setup.ts` does **not** use drizzle's migrator. It reads `migrations/*.sql` in alphanumeric order, rewrites `"public".` to a per-worker test schema, and executes each file (splitting on `--> statement-breakpoint` as fallback). Consequences for migration authors:

- Migrations must be **runnable in order on a fresh database** — never assume manual pre-steps.
- Prefer idempotent DDL (`IF NOT EXISTS` / `IF EXISTS`) where reasonable.
- Schema-qualify as `"public"."table"` or leave unqualified — a hardcoded other schema will break test rewriting.
- If a past migration drifted, `tests/setup.ts` has a failsafe block (~lines 230-274) of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` fixes. Only add there as a last resort; fixing the migration is better.

## Enum changes

`stepTypeEnum` and friends are `pgEnum`s (e.g. `shared/schema/workflow.ts:38`). Adding a value needs both the TS enum edit **and** a migration with `ALTER TYPE "step_type" ADD VALUE IF NOT EXISTS 'new_value';`. Postgres can't remove enum values — plan additions carefully.

## Troubleshooting

- "column does not exist" after pulling: your dev DB is behind — `npm run db:push` (the old `scripts/fixAllMissingColumns.ts` no longer exists)
- DataVault-specific migrations: `npm run db:migrate:datavault`
- Validate a fresh-DB run cheaply: `npm run test:docker:up` (PG 16 on port 5434, tmpfs) then run any integration test with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/ezbuildr_test` — setup.ts will apply every migration from scratch.

## After the change

- Run `npm run test:unit:db` and at least one integration file against a fresh Docker DB (proves the migration applies cleanly).
- Update `docs/claude/SCHEMA.md` — CLAUDE.md points agents at it as the tables reference; a stale entry misleads every future session.

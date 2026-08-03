# Tenant Isolation via Postgres Row-Level Security (RLS)

Status: **Phase 1–2 landed; Phase 4 done for workflows/sections/steps and for the six DataVault tables listed below (all defined, not yet enforced).** Tracking ticket: SEC-051.

This document is the source of truth for how ezBuildr isolates one tenant's data
from another at the database layer, why it is rolled out in stages, and the exact
steps to turn enforcement on. Read it before changing anything under
`migrations/*rls*`, `server/utils/rlsContext.ts`, or the tenant middleware.

---

## 1. The problem RLS solves

ezBuildr is multi-tenant: many tenants share the same tables, separated by a
`tenant_id` column. Today isolation is enforced **only in application code** —
every query is expected to include `WHERE tenant_id = <caller's tenant>`. That is
consistent today, but it is a convention, not a guarantee: one forgotten predicate
in a future query is a silent cross-tenant leak, with nothing underneath to catch
it.

RLS moves the guarantee into Postgres itself. With RLS enforced, the database
refuses to return or modify rows that don't belong to the current tenant — even if
the application forgets the filter. It is the structural backstop; the
service-layer scoping and the `withTenant` query helper
(`server/repositories/tenantWrapper.ts`) remain as defense in depth.

---

## 2. How it works here

- **The policy.** Migration [`0001_enable_rls.sql`](../../migrations/0001_enable_rls.sql)
  enables RLS and installs a `tenant_isolation` policy on every table with a direct
  `tenant_id` column. The policy is:

  ```sql
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  ```

  `USING` filters reads/updates/deletes; `WITH CHECK` blocks writing a row for
  another tenant. `current_setting(..., true)` returns NULL when the GUC is unset,
  so an unset session sees **zero** rows (fail-closed).

- **The runtime context.** `server/utils/rlsContext.ts` sets that GUC per request.
  The critical detail is that it uses **transaction-scoped** `set_config(..., true)`
  (i.e. `SET LOCAL`), never a session-level `SET` — see §4.

- **The middleware.** `server/middleware/rlsContext.ts` binds the request's
  `req.tenantId` into an `AsyncLocalStorage` so `withCurrentTenant()` can open a
  correctly-scoped transaction without threading the id everywhere.

---

## 3. Why it is staged (and currently NOT enforced)

Postgres does not apply RLS to a table's **owner** or to **superusers** unless the
table is also in `FORCE` mode. In every environment we run:

- **Production (Neon):** the app connects as the role that owns the tables → RLS
  bypassed.
- **CI / local Docker tests:** connect as the `postgres` superuser → RLS bypassed.

So after migration 0001, the policies are **defined but inert everywhere**. This is
deliberate: it lets us land the policies and the runtime plumbing, verify them, and
only then flip enforcement — instead of a big-bang cutover that would break every
un-scoped code path at once (a session that never sets the tenant GUC sees no rows).

---

## 4. The pooling hazard (read this before touching rlsContext)

The app runs on a **connection pool** (Neon serverless in prod; `pg` pool locally).
Requests do not own a connection.

- ❌ A session-level `SET app.current_tenant_id = 'A'` sticks to the physical
  connection. The next request that reuses that connection inherits tenant A —
  a cross-tenant leak **worse** than the problem we're fixing.
- ✅ `set_config('app.current_tenant_id', 'A', true)` inside a `BEGIN…COMMIT` is
  scoped to that transaction and reset on commit/rollback. Safe under pooling.

Therefore **all RLS-scoped work must run inside a transaction** opened by
`withTenant(tenantId, tx => …)`. `rls-context.test.ts` asserts the value does not
leak to a later query on the pool.

---

## 5. Rollout runbook

**Phase 1 — Define policies. ✅ Done.**
`0001_enable_rls.sql` — ENABLE + `tenant_isolation` on 24 direct-`tenant_id` tables.
Inert (owner/superuser bypass). Non-breaking.

**Phase 2 — Runtime context. ✅ Landed, opt-in.**
`server/utils/rlsContext.ts` (`withTenant`, `withCurrentTenant`,
`runWithTenantContext`), `server/middleware/rlsContext.ts`, and the `RLS_ENFORCED`
flag (default off). Mount the middleware after auth, and migrate tenant-scoped
repository reads/writes to run inside `withTenant`/`withCurrentTenant`. Until this
adoption is complete, do NOT proceed to Phase 3.

**Phase 3 — Enforce.** Only after Phase 2 is adopted and verified in staging:
- Preferred: create a dedicated **non-owner, non-BYPASSRLS** app role, grant it
  DML on the tenant tables, and point the app's `DATABASE_URL` at it. Owner keeps
  BYPASSRLS for migrations/admin.
- Alternative: `ALTER TABLE <t> FORCE ROW LEVEL SECURITY` for each table (makes the
  owner subject to RLS too). Simpler, but then migrations/admin jobs must set a
  tenant or explicitly bypass.
- Set `RLS_ENFORCED=true`.
- Handle the exceptions explicitly: background jobs, cron, migrations, the
  bootstrap-admin path, and public/unauthenticated flows (intake-by-slug, run
  tokens, portal) either run as a bypass role or wrap their work in `withTenant`
  with the resolved tenant.

**Phase 4 — Indirectly-scoped tables.** Tables with no direct `tenant_id`
(`workflow_runs`, `step_values`, `datavault_rows`, `secrets`, `workflows`,
`sections`, `steps`, …) need policies that resolve the tenant through a join.

⚠️ Note `workflows` itself has **no `tenant_id`** — an earlier draft of this
section showed `w.tenant_id`, which does not exist. A workflow's tenant is derived
from its ownership model (`owner_type`/`owner_uuid` → `users`/`organizations`,
else `project_id` → `projects`, else legacy `owner_id`/`creator_id`).

**Done for `workflows` / `sections` / `steps`** —
[`migrations/0005_rls_phase4_workflows_sections_steps.sql`](../../migrations/0005_rls_phase4_workflows_sections_steps.sql)
(SEC-051 / ICW-B2). It adds two SECURITY-INVOKER helpers:

- `app_current_tenant()` — `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`;
  collapses both the unset and the pooled-connection empty-string reset to NULL.
- `app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id, project_id)` —
  COALESCE-precedence resolution of a workflow's tenant (exactly one tenant per row).

`workflows` resolves from its own columns; `sections`/`steps` resolve through
their `workflow_id`. Each policy is `CASE`-guarded so a no-tenant request returns
zero rows **without** evaluating the resolver (which reads users/orgs/projects and
would otherwise trip 0001's raw `current_setting(...)::uuid` on an empty string).
Verified by [`tests/integration/rls-phase4-workflows.test.ts`](../../tests/integration/rls-phase4-workflows.test.ts),
which proves cross-tenant isolation, org-owned resolution, fail-closed, and
WITH CHECK — under a non-owner role via `SET LOCAL ROLE` (owner/superuser bypass
means isolation can't be observed otherwise, per §6).

**Done for the six DataVault tables that had no policy at all** (DVH-3) —
[`migrations/0011_datavault_rls_phase4.sql`](../../migrations/0011_datavault_rls_phase4.sql).
`0001_enable_rls.sql` covered five DataVault tables with a direct `tenant_id`
(`datavault_api_tokens`, `datavault_databases`, `datavault_number_sequences`,
`datavault_row_notes`, `datavault_tables`) but left the two tables holding
actual customer data — `datavault_rows` and `datavault_values` — uncovered,
along with `datavault_columns`, `datavault_table_permissions`,
`datavault_database_access` and `datavault_table_access`. None of these six has
a `tenant_id` column, and they are not all the same derivation — three shapes:

- `datavault_rows`, `datavault_columns`, `datavault_table_permissions`,
  `datavault_table_access` — one hop via `table_id → datavault_tables.tenant_id`.
- `datavault_database_access` — one hop via `database_id → datavault_databases.tenant_id`.
- `datavault_values` — two hops via `row_id → datavault_rows.table_id → datavault_tables.tenant_id`
  (it has no `table_id` of its own).

0011 adds three `STABLE` SQL helpers (`app_datavault_table_tenant`,
`app_datavault_database_tenant`, `app_datavault_row_tenant`) mirroring
`app_owner_tenant`'s un-pinned `search_path`, and wraps each policy in the same
`CASE WHEN app_current_tenant() IS NULL THEN false ELSE … END` guard so an
empty/unset GUC denies without evaluating the derivation. Verified by
[`tests/integration/rls-datavault.test.ts`](../../tests/integration/rls-datavault.test.ts)
under a non-owner role, covering cross-tenant isolation on all six tables,
fail-closed on both an unset and an explicitly-empty GUC, and `WITH CHECK` on
`datavault_rows`. This ticket does not change enforcement — DataVault tenancy
is still service-layer only in practice; it makes the enforcement flip
(Phase 3 / DEBT-11) safe to say yes to without silently leaving the two tables
that hold the actual rows/cells unprotected.

Still outstanding for the remaining indirectly-scoped tables (`workflow_runs`,
`step_values`, `secrets`, …). These are higher-risk (performance + correctness)
and deferred to their own migration; they can reuse `app_current_tenant()` and
the same `EXISTS (… workflows … app_owner_tenant …)` pattern where they hang
off a workflow.

---

## 6. Verifying enforcement manually

RLS can't be proven as a superuser. Use a throwaway non-superuser role against a
scratch DB (Docker test DB shown):

```sql
-- as postgres (superuser):
CREATE TABLE rls_demo (id int, tenant_id uuid, val text);
ALTER TABLE rls_demo ENABLE ROW LEVEL SECURITY;
ALTER TABLE rls_demo FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rls_demo
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
INSERT INTO rls_demo VALUES (1,'11111111-1111-1111-1111-111111111111','A'),
                            (2,'22222222-2222-2222-2222-222222222222','B');
CREATE ROLE rls_tester NOLOGIN; GRANT SELECT ON rls_demo TO rls_tester;

BEGIN;
  SET LOCAL ROLE rls_tester;
  SELECT set_config('app.current_tenant_id','11111111-1111-1111-1111-111111111111', true);
  SELECT val FROM rls_demo;      -- expect: only 'A'
COMMIT;
```

If the second `SELECT` returns only tenant A's row, enforcement works.

---

## 7. Adding a new tenant-scoped table

1. Add the `tenant_id uuid` column (see the `db-schema-change` skill).
2. Add the table name to a new RLS migration (copy the pattern in `0001`) — do NOT
   edit `0001`. New tenant tables without a policy are a silent isolation gap.
3. If the table is scoped indirectly, write a join-based policy (§5, Phase 4).
4. Route its queries through `withTenant`/`withCurrentTenant` once enforcement is on.

---

## 8. Files

| File | Role |
|---|---|
| [`migrations/0001_enable_rls.sql`](../../migrations/0001_enable_rls.sql) | Enables RLS + policies on direct-`tenant_id` tables (Phase 1) |
| [`migrations/0005_rls_phase4_workflows_sections_steps.sql`](../../migrations/0005_rls_phase4_workflows_sections_steps.sql) | Phase 4 join/ownership policies for workflows/sections/steps + `app_current_tenant()` / `app_owner_tenant()` helpers (now consolidated into `0001_enable_rls.sql` — this filename no longer exists on disk as a separate file post-regeneration; see `tests/integration/rls-phase4-workflows.test.ts` for the current source of truth) |
| [`tests/integration/rls-phase4-workflows.test.ts`](../../tests/integration/rls-phase4-workflows.test.ts) | Proves Phase 4 cross-tenant isolation, fail-closed, and WITH CHECK |
| [`migrations/0011_datavault_rls_phase4.sql`](../../migrations/0011_datavault_rls_phase4.sql) | DVH-3: policies + derivation helpers for `datavault_rows`/`datavault_values`/`datavault_columns`/`datavault_table_permissions`/`datavault_database_access`/`datavault_table_access` |
| [`tests/integration/rls-datavault.test.ts`](../../tests/integration/rls-datavault.test.ts) | Proves DVH-3 cross-tenant isolation and fail-closed (unset + empty GUC) under a non-owner role |
| [`server/utils/rlsContext.ts`](../../server/utils/rlsContext.ts) | Transaction-scoped tenant GUC + `withTenant` |
| [`server/middleware/rlsContext.ts`](../../server/middleware/rlsContext.ts) | Binds `req.tenantId` into async context |
| [`server/repositories/tenantWrapper.ts`](../../server/repositories/tenantWrapper.ts) | App-layer `withTenant` predicate helper (defense in depth) |
| [`tests/integration/rls-context.test.ts`](../../tests/integration/rls-context.test.ts) | Proves the GUC is transaction-local and fails closed |

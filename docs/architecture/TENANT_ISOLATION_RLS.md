# Tenant Isolation via Postgres Row-Level Security (RLS)

Status: **Phase 1–2 landed (defined, not yet enforced).** Tracking ticket: SEC-051.

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
`sections`, `steps`, …) need policies that resolve the tenant through a join, e.g.:

```sql
CREATE POLICY tenant_isolation ON workflow_runs USING (
  EXISTS (SELECT 1 FROM workflows w
          WHERE w.id = workflow_runs.workflow_id
            AND w.tenant_id = current_setting('app.current_tenant_id', true)::uuid)
);
```

These are higher-risk (performance + correctness) and are intentionally deferred to
their own migration. Track as a follow-up.

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
| [`migrations/0001_enable_rls.sql`](../../migrations/0001_enable_rls.sql) | Enables RLS + policies (Phase 1) |
| [`server/utils/rlsContext.ts`](../../server/utils/rlsContext.ts) | Transaction-scoped tenant GUC + `withTenant` |
| [`server/middleware/rlsContext.ts`](../../server/middleware/rlsContext.ts) | Binds `req.tenantId` into async context |
| [`server/repositories/tenantWrapper.ts`](../../server/repositories/tenantWrapper.ts) | App-layer `withTenant` predicate helper (defense in depth) |
| [`tests/integration/rls-context.test.ts`](../../tests/integration/rls-context.test.ts) | Proves the GUC is transaction-local and fails closed |

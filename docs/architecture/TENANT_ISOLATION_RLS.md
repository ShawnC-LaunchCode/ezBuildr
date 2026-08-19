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
  tenant into an `AsyncLocalStorage` so `withCurrentTenant()` can open a
  correctly-scoped transaction without threading the id everywhere.
  **It is mounted globally *before* auth, not after** — see the note below.

### Why the context middleware runs before auth (RLS-1, 2026-08-18)

The obvious design — mount it after the middleware that resolves the tenant — is
not available here. **ezBuildr resolves auth per-route:** `hybridAuth`,
`optionalHybridAuth` and `requireAuth` are declared inline on each route
(`app.get(path, hybridAuth, handler)`), never as one global middleware that runs
before dispatch. There is therefore no point in the global stack where
`req.tenantId` is known for every request.

So the flow is two-part:

1. `rlsContext` is mounted once, globally, near the top of both entrypoints. It
   opens an **empty** `AsyncLocalStorage` store for the request.
2. `server/middleware/auth.ts` calls `setCurrentTenantId(...)` from
   `attachUserToRequest` (bearer) and `cookieStrategy` (refresh cookie), once
   that route's own auth has resolved a tenant — and **after** the DB
   re-hydration step, so the context always reflects the tenant that
   authorization decisions actually used, not a stale JWT claim.

The store is a mutable object, so that later write is visible to everything
downstream in the request's async chain. If nothing ever sets a tenant (public
and unauthenticated routes), `getCurrentTenantId()` simply returns `undefined`
for the request's lifetime — it never throws.

Registration is guarded by `tests/unit/middleware/rlsContextRegistration.test.ts`,
which asserts both entrypoints mount it *before* `registerRoutes(app)`. That
guard is source-level because neither `tsc` nor ESLint can see a deleted
`app.use(...)`, and because the behavioural test necessarily mounts its own copy
(the shared integration harness builds its app from `registerRoutes`, which does
not mount entrypoint middleware — see `TM-B1` in `tickets/BACKLOG.md`).

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

**Phase 1 — Define policies. ✅ Done — but "done" needed a second migration (RLS-3, 2026-08-18).**
`0001_enable_rls.sql` — ENABLE + `tenant_isolation` on 24 direct-`tenant_id` tables, plus
`0004_ai_usage_rls.sql` for a 25th. Inert (owner/superuser bypass) once actually applied. Non-breaking.

**RLS-3 finding: those migrations were not broken, but they never actually ran on production
or its Neon-branch clones (`dev`/`test`).** A scratch database built from the migration chain
alone gets all 36 policies the chain defines (ENV-2, 2026-08-15). A live measurement against
`dev` (byte-identical to production) on 2026-08-18 found only **9**. Cause: production's
tables were created out of band by `npm run db:push` before `0001`/`0004` first ran for real,
so each migration's `to_regclass(...)` guard resolved NULL for a table that did not exist
*yet* at that moment, logged a `NOTICE`, and moved on — the migration still recorded itself
applied. The seven DataVault child tables (`0011`/`0012`) and `run_document_deliveries`/
`run_resume_links` (`0015`/`0019`) were unaffected because their target tables already existed
by the time those later migrations ran for real.

**`migrations/0024_repair_rls_coverage.sql` closes the gap on an already-provisioned
database.** It re-applies the exact same 24 direct-`tenant_id` policies (23 from `0001` minus
`files`, which has no `tenant_id` column and was always an inert array entry — plus `ai_usage`
from `0004`) and the 3 ownership-derived policies on `workflows`/`sections`/`steps`, byte-
identical in shape to what `0001` already defines. Unlike `0001`/`0004`'s `RAISE NOTICE …
CONTINUE` guard, `0024` **fails loudly** (`RAISE EXCEPTION`) if a table it expects is missing,
because on any database this repair runs against, every named table is expected to already
exist. Idempotent (`ENABLE ROW LEVEL SECURITY` + `DROP POLICY IF EXISTS` + `CREATE POLICY` are
all safe to re-run), so it is also a no-op-equivalent re-application on a database the chain
already built correctly from empty. Verified byte-identical to a fresh chain build after
applying: same 36 `tenant_isolation` policies, same predicates, zero diff outside the `[RLS]`
markers in a full schema snapshot. Applied directly to `dev` 2026-08-18; `test`/production
receive it automatically via `railway.json`'s `preDeployCommand: npm run db:migrate` on their
next deploy through the normal `dev` → `test` → `main` promotion.

Coverage is now guarded by [`tests/integration/rls-coverage.test.ts`](../../tests/integration/rls-coverage.test.ts),
a general assertion over every table with a `tenant_id` column (not a fixed list), so a future
tenant-scoped table added without a policy fails this suite instead of becoming a 25th silent
gap.

**Phase 2 — Runtime context. ✅ Landed, opt-in.**
`server/utils/rlsContext.ts` (`withTenant`, `withCurrentTenant`,
`runWithTenantContext`), `server/middleware/rlsContext.ts`, and the `RLS_ENFORCED`
flag (default off). ~~Mount the middleware after auth~~ — **corrected 2026-08-18
(RLS-1): mount it globally *before* auth and let `auth.ts` write the tenant into
the open context**, because auth is resolved per-route and no global point has
`req.tenantId` for every request. See the note in §2. The middleware is now
registered in both entrypoints. Still outstanding: migrate tenant-scoped
repository reads/writes to run inside `withTenant`/`withCurrentTenant` (that is
RLS-2, ruled to happen at the **service boundary**, piloted on `CollectionService`
in RLS-2a — see §2b below — and rolled out to the remaining ~35 tenant-scoped
services in RLS-2b). Until this adoption is complete, do NOT proceed to Phase 3.

### 2b. The service-boundary transaction pattern (RLS-2a pilot, 2026-08-18)

`CollectionService` (`server/services/CollectionService.ts`) is the pilot for how
every tenant-scoped service should open its transaction. **`withCurrentTenant` —
already shipped by RLS-1 — was sufficient as-is.** No second transaction-opening
helper was written; RLS-2a only added a small *private, service-local* wrapper
(`withTx`) around it, described below. Any service copying this pattern in RLS-2b
should do the same: call the existing `withCurrentTenant`/`withTenant`, don't
invent a parallel one.

**The shape, in one method:**

```ts
private async withTx<T>(
  expectedTenantId: string,
  tx: DbTransaction | undefined,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  if (tx) {
    return fn(tx);               // caller already has a transaction — reuse it
  }
  const ambientTenantId = getCurrentTenantId();
  if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
    throw new Error(`RLS: tenant mismatch — ...`);   // see below
  }
  return withCurrentTenant(fn);  // opens exactly one transaction, GUC = ambient tenant
}
```

Every public method wraps its whole body in `withTx`, including methods that call
more than one repository (`getCollectionWithFields` touches `collectionRepo` and
`fieldRepo`; `listCollectionsWithStats` touches all three) — so a single logical
service operation gets **one** transaction and **one** GUC `set_config`, not one
per repository call. Internal helper calls (`verifyTenantOwnership`,
`ensureUniqueSlug`, …) always receive the already-open `tx`, so they never open a
second one. `server/repositories/{Collection,CollectionField,Record}Repository.ts`
needed **no changes** — they already thread an optional `tx` through every method
via `BaseRepository.getDb(tx)`, and none of them call a sibling repository, so
there was no `SystemStats`-class deadlock risk to fix in this pilot. A repository
being converted in RLS-2b that *does* call another repository must thread `tx`
into that inner call too, or it will deadlock the pool the same way `SystemStats`
did.

**Fail-closed, two ways, both proven by disabling the check and watching a named
test fail (not just asserted):**
- No tenant at all in the async context → `withCurrentTenant` itself throws
  (`RLS: no tenant in context.`). Nothing is queried.
- A tenant **is** in context but disagrees with the `tenantId` argument the
  caller passed for its own `eq(tenantId, ...)` predicate → `withTx` throws a
  `tenant mismatch` error before opening a transaction at all.

**Why the mismatch check exists — two sources of truth, on purpose.** Every
method also takes an explicit `tenantId` argument, used for the `eq(tenantId,
...)` predicates that AC3 requires to stay (RLS is a backstop, not a
replacement). `withTx` opens the transaction against the **ambient** tenant from
the async context, not the passed `tenantId` — deliberately. If it used the
passed value instead, a bug that computed the wrong `tenantId` would corrupt the
predicate and the GUC identically, and RLS would stop being an independent check
at all. The cost of keeping them independent is that they *can* disagree; if they
silently did, the predicate would scope to one tenant and the GUC to another, the
row-set intersection would be empty, and the caller would see a silent "not
found" instead of an error — exactly the failure class this phase exists to
eliminate. The mismatch check turns that into a loud 500 instead. Today this can
never fire for a real request: RLS-1 sets both the route's `tenantId` and the
async context from the same `attachUserToRequest`/`cookieStrategy` resolution.
It is a real guard for a future caller that doesn't go through that path — an
admin cross-tenant path (`RLS-6`) or a batch job.

**Known gap, inherited by RLS-2b:** the mismatch check only runs on the
"we open the transaction ourselves" branch. A caller that supplies its own `tx`
skips it — `withTx` trusts a caller-supplied transaction was opened for the
right tenant and never re-reads its GUC. Nobody does that today (every call into
`CollectionService` comes from its routes with no `tx`), so this is a documented
limitation, not a fixed hole.

Proof: [`tests/integration/rls2a-collectionService.test.ts`](../../tests/integration/rls2a-collectionService.test.ts)
(the vertical proof — GUC = caller's tenant inside a real multi-repository
transaction, does not survive it, single transaction shared by two repositories,
fails closed with no context, and the mismatch guard) and
[`tests/unit/services/CollectionService.test.ts`](../../tests/unit/services/CollectionService.test.ts)
(the same two fail-closed branches, at the unit level with mocked repositories).

### 2c. Three variants the rollout needed (RLS-2c, 2026-08-19)

The pilot's `withTx(expectedTenantId, tx, fn)` assumes every method carries its
own `tenantId` argument to cross-check against ambient. Rolling out past
`CollectionService`/`RecordService` (which do) surfaced services that don't —
same primitives throughout (`withCurrentTenant`/`getCurrentTenantId`/`withTenant`),
no new central helper, just three per-service shapes:

1. **No `tenantId` argument at all** (`CollectionFieldService`,
   `ReviewTaskService`'s read/decision methods, `WorkflowService`,
   `VersionService`, ...). Authorization is `userId` + ACL, or the table is
   scoped via a parent row, so there is no second value to cross-check.
   `withTx(tx, fn)` drops the mismatch branch entirely — reuse a supplied `tx`,
   otherwise `withCurrentTenant(fn)`. Still fails closed (`withCurrentTenant`'s
   own "no tenant in context" throw); it just can't also detect a mismatch,
   because there is nothing to be mismatched against.
2. **Mixed, per-method** (`SignatureRequestService`, `ReviewTaskService`'s
   `create*`). Some methods carry an explicit `tenantId` (an insert whose
   column is `NOT NULL`), others don't. One local `withTx<T>(tx, fn,
   expectedTenantId?)` per service — the mismatch guard only runs when a
   caller passes `expectedTenantId`.
3. **Public/token-authenticated, no ambient tenant by design**
   (`SignatureRequestService.getSignatureRequestByToken` / `signDocument` /
   `declineSignature`, and `markExpiredRequests`, a cron caller). A run-token
   holder is never a tenant user, so `rlsContext` never gets a tenant to set —
   this is not a bug to guard against, it is the shape of the caller. The
   initial lookup (`findByToken`, or `findExpired`'s cross-tenant scan) runs
   unscoped, exactly as before RLS-2c; **once the row is found, its own
   `tenantId` column is a concrete value**, so every write from that point opens
   its own `withTenant(request.tenantId, ...)` rather than reading ambient.
   The initial unscoped SELECT is the same cross-tenant bootstrapping gap
   `RLS-6` solved for the admin console (a BYPASSRLS path) — not fixed here,
   flagged for whichever ticket turns `FORCE` on.

**A caller can have the identical problem as case 3 even over HTTP.** Any route
mounting `optionalHybridAuth` + a run-token strategy (`creatorOrRunTokenAuth`,
the intake/portal paths) can dispatch to a converted service with no ambient
tenant, same as a background job. `CollectionBlockRunner` (called from both a
live HTTP-driven run submission and `RunCompletionJobWorker`'s background poll
loop) and `SignatureBlockService.executeSignatureBlock` (run-token-reachable)
both now wrap their calls into a converted service in
`runWithTenantContext(tenantId, ...)` at the call site, using a tenant they
already have in hand (resolved from the workflow/project) — the same fix
`ReadTableBlockRunner` applied in RLS-2b. **Converting a service is not enough
by itself; every caller reachable without an authenticated tenant needs the
same audit**, and it is easy to miss one, since it fails only when that
specific code path runs with no ambient context — which passing tests may
never exercise.

### 2d. A fourth hazard: don't hold the transaction open across a network call (RLS-2d, Org/access cluster)

`OrganizationService` has no repository layer — every method issues `db.*`/`tx.*`
directly — so RLS-2d's `withTx` there wraps a whole method body the way §2b
describes, no different in kind from the pilot. `createInvite` is the exception
that mattered: its original (pre-RLS-2d) shape deliberately ran the outbound
email send (`sendInviteEmail` → `EmailQueueService`, plus
`authService.generateSystemInviteToken`) **outside** any transaction — the
comment said so ("Queue invitation email (outside transaction -
non-blocking)"). Wrapping the *whole* method in one `withTx` (matching every
other method in the file) held a Postgres transaction open for the duration of
those calls. In the test/dev environment that queue call does not resolve
quickly, so the connection sat `idle in transaction` holding row locks on
`organization_invites` — invisible until the *next* test's `TRUNCATE` blocked
on it, so every subsequent test in the file hung, not failed. Measured
directly: `pg_locks` showed an ungranted `AccessExclusiveLock` waiting behind a
granted `RowShareLock` held by a backend stuck mid `INSERT INTO
organization_invites`.

**The fix is not "always wrap the whole method."** `createInvite` now opens a
short transaction for the DB validation + insert, lets it commit, and only
*then* makes the outbound calls — with each follow-up write (mark
sent/failed, audit log) getting its own short `withTx` rather than reusing one
long-held transaction across the slow call. This is the same shape the
pre-RLS-2d code had, for the same reason; RLS-2d just gives each DB phase its
own tenant-scoped transaction instead of leaving both unscoped. **Nesting a
second `withTx` inside an already-open one is not the alternative fix** — the
test pool is size 1, so the still-open outer transaction holds the only
connection and a nested one deadlocks waiting for a second (the `SystemStats`
class again, just via `withTx` this time instead of a bare repository call).

A related, narrower version of the same principle: `acceptInvite` marks an
invite `expired` and then throws — a side effect that must survive the
rejection. Doing that write and the throw in the *same* transaction makes
Postgres roll the write back when the throw aborts it, silently undoing the
mark (caught by `organizationInvites.test.ts`'s "should reject expired
invite": the row stayed `pending`). Fixed by splitting into a read-only
decision phase (its own `withTx`) and, depending on the decision, a **separate**
short write-then-throw call — never a write inside the same transaction whose
error path is expected to keep it.

**Anyone converting a service with an outbound network call inside a method
being wrapped (email, webhook, AI provider, PDF conversion, ...) should check
this first**, rather than reflexively wrapping the entire method body the way
§2b's `CollectionService` does — that shape is correct when everything inside
is a DB call, not when it isn't.

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
| [`migrations/0001_enable_rls.sql`](../../migrations/0001_enable_rls.sql) | Enables RLS + policies on direct-`tenant_id` tables (Phase 1) — defines the policies; see `0024` for why that alone did not apply them on production/`dev`/`test` |
| [`migrations/0024_repair_rls_coverage.sql`](../../migrations/0024_repair_rls_coverage.sql) | RLS-3: re-applies the 24 direct-`tenant_id` policies + 3 ownership-derived policies that `0001`/`0004` defined but never actually applied on a database whose tables were created by `db:push` out of band |
| [`tests/integration/rls-coverage.test.ts`](../../tests/integration/rls-coverage.test.ts) | RLS-3: general coverage gate — every table with a `tenant_id` column must have RLS + a `tenant_isolation` policy; proven discriminating against a scratch probe table |
| [`migrations/0005_rls_phase4_workflows_sections_steps.sql`](../../migrations/0005_rls_phase4_workflows_sections_steps.sql) | Phase 4 join/ownership policies for workflows/sections/steps + `app_current_tenant()` / `app_owner_tenant()` helpers (now consolidated into `0001_enable_rls.sql` — this filename no longer exists on disk as a separate file post-regeneration; see `tests/integration/rls-phase4-workflows.test.ts` for the current source of truth) |
| [`tests/integration/rls-phase4-workflows.test.ts`](../../tests/integration/rls-phase4-workflows.test.ts) | Proves Phase 4 cross-tenant isolation, fail-closed, and WITH CHECK |
| [`migrations/0011_datavault_rls_phase4.sql`](../../migrations/0011_datavault_rls_phase4.sql) | DVH-3: policies + derivation helpers for `datavault_rows`/`datavault_values`/`datavault_columns`/`datavault_table_permissions`/`datavault_database_access`/`datavault_table_access` |
| [`tests/integration/rls-datavault.test.ts`](../../tests/integration/rls-datavault.test.ts) | Proves DVH-3 cross-tenant isolation and fail-closed (unset + empty GUC) under a non-owner role |
| [`server/utils/rlsContext.ts`](../../server/utils/rlsContext.ts) | Transaction-scoped tenant GUC + `withTenant` |
| [`server/middleware/rlsContext.ts`](../../server/middleware/rlsContext.ts) | Binds `req.tenantId` into async context |
| [`server/repositories/tenantWrapper.ts`](../../server/repositories/tenantWrapper.ts) | App-layer `withTenant` predicate helper (defense in depth) |
| [`tests/integration/rls-context.test.ts`](../../tests/integration/rls-context.test.ts) | Proves the GUC is transaction-local and fails closed |
| [`server/services/CollectionService.ts`](../../server/services/CollectionService.ts) | RLS-2a pilot: service-boundary transaction pattern (§2b) — `withTx` |
| [`tests/integration/rls2a-collectionService.test.ts`](../../tests/integration/rls2a-collectionService.test.ts) | Proves the RLS-2a pattern end to end: GUC = caller's tenant, doesn't survive the transaction, one transaction shared across repositories, fail-closed, mismatch guard |
| [`server/services/OrganizationService.ts`](../../server/services/OrganizationService.ts) / [`ProjectService.ts`](../../server/services/ProjectService.ts) / [`TeamService.ts`](../../server/services/TeamService.ts) | RLS-2d, Org/access cluster: variant-1 `withTx` (no `tenantId` cross-check). `OrganizationService` also documents §2d — don't hold the transaction open across an outbound network call |
| [`tests/integration/rls2d-orgAccessCluster.test.ts`](../../tests/integration/rls2d-orgAccessCluster.test.ts) | RLS-2d Org/access cluster: fail-closed per service, identical-transaction-object proof spanning `projectRepository` + `workflowRepository`, GUC set/doesn't-survive proof for `OrganizationService` |
| [`server/services/AdminOrgStatsService.ts`](../../server/services/AdminOrgStatsService.ts) | RLS-2d: deliberately unconverted — admin-only cross-tenant aggregate, same BYPASSRLS class as RLS-6's admin console read path |

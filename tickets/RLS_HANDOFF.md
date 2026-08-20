# RLS Phase 2 — handoff to finish it

**Written 2026-08-20.** `dev` is at `7ac6fe78`, pushed, all suites green.
Board: [`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md).

Deliberately **not** named `*_TICKETS.md` — that glob is what dispatch scans for work. This is
context, not a board.

---

## 1. Read this first, in this order

1. This file, end to end. It is short on purpose.
2. `docs/architecture/TENANT_ISOLATION_RLS.md` **§2b and §2c** — the three service shapes.
3. `server/services/CollectionService.ts` — the pilot's `withTx`.
4. RLS-4 in the board file, especially the 🛑 block at the top.

**Do not relitigate these.** They are repo-owner rulings with reasoning recorded:

- The tenant GUC is set at the **service boundary**, not repository or request.
- The ambient GUC and the `eq(tenantId, …)` predicate stay **independent** — two checks fed by
  one input are not two checks.
- Admin cross-tenant access goes through a **separate `BYPASSRLS` role** reachable from one
  module. Never give the app role `BYPASSRLS`; never add an `is_platform_admin` clause to a
  policy (that turns a GUC into god mode).

---

## 2. What is already done

The service rollout is **complete — 21 services** (RLS-2a…2e), plus RLS-1, RLS-3, RLS-6.

| Commit | What |
|---|---|
| `bc90cc3e` | RLS-1 — `rlsContext` middleware; tenant in `AsyncLocalStorage` per request |
| `d2dcbb2f` | RLS-2a — `withTx` pattern piloted |
| `a3a3a0d2` | RLS-3 — policy coverage repaired (dev: 9 → **36 policies, 0 gaps**) |
| `ec64d2cb` `e3826bd6` `f1ea4055` `af6aa5c4` | RLS-2b…2e — the rollout |
| `5bdce710` | RLS-6 — admin `BYPASSRLS` pool + `admin_access_log` |
| `0141b19a` | RLS-4 precondition 3 **closed** — admin org-stats on the audited path |
| `7ac6fe78` | RLS-4 FORCE proof + the blocking finding below |

**Remaining: RLS-4 and RLS-5 only.**

---

## 3. 🛑 The blocking defect — fix this before anything else

**Proven** by `tests/integration/rls4-forceEnforcement.test.ts` against a real non-owner role:
with `FORCE ROW LEVEL SECURITY` on and no tenant pinned, a query does **not** return zero rows.
It **raises** `invalid input syntax for type uuid: ""`.

Once a custom GUC has been touched on a connection it reverts to **empty string**, not unset,
and every policy casts unguarded:

```sql
USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
```

`''::uuid` raises. **No policy in `0001` or `0024` wraps it in `NULLIF`** — verified by grep.

Nothing leaks (it is fail-closed either way), but the app uses a **pooled** connection, so under
FORCE any query running outside a tenant transaction on a connection that previously served one
returns a hard **500** instead of an empty result. That is most of the app on day one.

**The fix:**

```sql
USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
```

Needs a **new migration** recreating the policies — `0001` and `0024` are applied and immutable.
Model it on `0024_repair_rls_coverage.sql`, which is idempotent and `RAISE EXCEPTION`s (rather
than logging a notice) when an expected table is missing.

**Verify by making the existing proof stricter:** after the fix, the "no tenant pinned" test in
`rls4-forceEnforcement.test.ts` should assert `rowCount === 0` *without* the catch branch. If it
still raises, the fix did not take.

---

## 4. RLS-4's four open preconditions

Each is a **silent** failure — no error, just wrong or missing data. Precondition 3 is closed.

| # | Item | Behaviour once FORCE is on |
|---|---|---|
| 1 | Ordering | Provision `ADMIN_DATABASE_URL` **first**, then set `FORCE` and `RLS_ENFORCED` **together**. `RLS_ENFORCED` is an app flag, *not* FORCE — setting FORCE while the flag is false leaves `AdminAccessService`'s guard blind and the admin console truncates silently. |
| 2 | `SignatureRequestService` token methods + `RunFileUploadService` | Unscoped **bootstrap SELECT** — the token is the authorization and the row's own `tenantId` then drives writes, so there is no tenant to pin beforehand. This is the **public signing portal**; getting it wrong is a customer-visible outage. |
| 4 | `BrandingService.resolveForWorkflow` | Client portal renders **default branding** — wrong logo/colours. ⚠️ The exposed table is **`workflows`** (RLS-covered) via `resolveTenantIdForWorkflow`, **not** the branding column — `tenants` has no policy, so checking there finds nothing and misleads. |
| 5 | `VariableService.listVariables` (via `TemplateValidationService.validate`) | Sees **zero variables**, so a template is reported **clean when it is not**. |

**Acceptable as-is:** `WorkflowClonerService.copyWorkflowAsAdmin` is a cross-tenant admin path
left with no GUC. Under FORCE it **fails closed** (throws / empty copy) rather than leaking. Give
it RLS-6-style bypass when convenient; it is not a correctness risk.

---

## 5. RLS-5 — what blocks it and the shape of the fix

RLS-5 wants the **whole integration suite run as the restricted role**. The blocker is concrete:

- The app's pool is a **singleton created at import** from `DATABASE_URL` (`server/db.ts`).
- `tests/setup.ts` creates the per-worker schema, sets `DATABASE_URL`, then imports `server/db`
  and runs migrations through that same instance (`applyManualMigrations(db)`).
- **Migrations must run as the owner**, so the connection cannot simply be repointed first.

**The fix:** have `tests/setup.ts` apply schema creation + migrations through a **separate owner
`Client`**, then set `DATABASE_URL` to the restricted role's credentials *before* importing
`server/db`. Gate it behind an env flag (e.g. `RLS_RESTRICTED=true`) so the default path is
untouched. `tests/setup.ts` already saves the owner URL as `__BASE_DB_URL__`, which is the hook.

Role provisioning is already demonstrated in `rls4-forceEnforcement.test.ts` (`beforeAll`):
`CREATE ROLE … LOGIN`, `NOBYPASSRLS NOSUPERUSER`, `GRANT USAGE ON SCHEMA`, `GRANT
SELECT/INSERT/UPDATE/DELETE ON ALL TABLES`, `GRANT USAGE, SELECT ON ALL SEQUENCES`. Grants must
happen **after** the per-worker schema exists.

**The ticket says first-run failures ARE the deliverable** — the list of unprotected query paths
is the point. Expect the four preconditions above to show up there; treat anything else as new.

---

## 6. Environment facts that will cost you hours otherwise

- **Test pool is `max: 1`** (`server/db.ts`, deliberate, for schema isolation). A pool query
  issued from inside a transaction **deadlocks and HANGS — it never errors**. If a DB-backed test
  hangs, suspect this before the harness, Docker, or the schema cache. See
  `server/utils/ownershipAccess.ts` for the fixed instance (`getAccessibleOwnershipFilter`).
- **`AsyncLocalStorage.enterWith` binds only the current async execution.** Measured three times:
  it does not reach test bodies from `beforeAll`, **nor from `beforeEach`**, **nor from an async
  callee back to its caller after `await`**. A suite calling services directly must bind inside
  **each test body** (`enterTenantContextForTests`, or `runWithTenantContext(...)` around the call).
- **Eight integration suites build their own express app** and so mount no `rlsContext`. Fixed:
  `datavault-v4-regression`, `api.projects`, the four `portability.*`. **Still unfixed:**
  `api.ai.doc`, `js_helpers`. Copy the shape from `datavault-v4-regression.test.ts`.
- **Postgres roles are cluster-level and outlive databases.** A test that assumes a role exists
  can pass locally off a leftover and fail on a fresh cluster. Provision roles in the test itself,
  idempotently. (This bit us: a renumbered migration dropped a `CREATE ROLE` and the suite stayed
  green.)
- **Worktrees:** `pwsh scripts/new-worktree.ps1 -Name <id> -BaseBranch dev` (the script defaults
  to `main` — pass `dev`). Tear down with `-Remove`. **It can exit 0 having failed** — verify with
  `git worktree list`, never the exit code.
- **Never run two DB-backed suites at once**, even across worktrees. If a run looks dead, check
  `pg_stat_activity` before starting another.
- **`test:docker:up` restarting the containers wipes the tmpfs databases**, including
  per-worktree ones. Recreate `ezbuildr_test_<name>` before running, or the whole suite fails as a
  phantom code defect.

---

## 7. Order of work

1. **The `NULLIF` policy migration** (§3). Nothing else in RLS-4 is safe until this lands.
2. **Preconditions 4 and 5** (branding, variables) — both are ordinary `tx`-threading fixes;
   `WorkflowTenantResolver.resolveForWorkflowId` already accepts a `tx`.
3. **Precondition 2** (signing portal / run-file bootstrap) — needs a design decision, not just a
   fix: the tenant is unknowable before the read. Options are an RLS-6-style narrow bypass, a
   `SECURITY DEFINER` function, or a policy exception keyed on the token. **Escalate rather than
   improvising** — it is the public signing portal.
4. **RLS-5's harness change** (§5), then run it and triage.
5. **RLS-4's FORCE migration**, scoped by what RLS-5 proves safe. Precondition 1's ordering is
   operational — provision, then flip both flags together.
6. `test` → `main` promotion is a **PR only**, and `main` needs the owner.

---

## 8. Verifying, and the one habit that matters

Current green baseline on `dev` — any deviation is yours:

```
npm run test:fast        → 285 files / 3283 passed
npm run test:integration → 124 files / 1183 passed
npm run type-check       → 0
```

`tests/unit/captcha.service.test.ts` is a known order-dependent flake; re-run it in isolation
before calling it a regression.

**Prove every guard fails.** Three green-but-worthless checks were caught in one session here: a
source-level guard that matched its own commented-out target, a test leaning on a leftover
cluster role, and a dev's "all clean" from a stale tree. For any guard or invariant: mutate the
thing it protects, watch it go red, restore. Budget a minute each.

**And ask the second question.** Nearly every real defect in this initiative lived at one seam —
someone reasons correctly to *"this service cannot be tenant-scoped"* and stops, without asking
*"then does it still work once FORCE is on?"* `AdminOrgStatsService` passed the first and failed
the second. So did `AdminAccessService`'s fallback. **When you declare something unconvertible,
state its post-FORCE behaviour.**

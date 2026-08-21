# RLS Phase 2 — state, patterns and traps

**Updated 2026-08-21 (second session).** Assumes no prior context. Everything
described here is **committed** on `dev`.

- **Plan and estimates:** [`RLS_COMPLETION_PLAN.md`](RLS_COMPLETION_PLAN.md) —
  phased scope against the ~2026-10-21 client-data date. Read that for *what to
  do and when*. Read **this** file for *state, patterns and hazards*.
- **Board:** [`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md)
  — RLS-2f (this sweep, done) and **RLS-7** (the one piece of production
  conversion still open) are the two entries that matter now.

---

## 0. Orientation, in this order

1. This file, §1–§3.
2. `docs/architecture/TENANT_ISOLATION_RLS.md` **§2b–§2g** — the
   `withTx`/service-boundary pattern, the four self-identification variants, and
   §2g's four lessons from the call-site sweep. **Read before inventing a
   mechanism for anything below;** the next bootstrap-shaped problem almost
   certainly fits an existing shape.
3. `npx tsx scripts/audit-rls-surface.ts` — the remaining worklist, generated
   fresh. Its header explains what it can and cannot see.

**Repo-owner rulings — settled, do not relitigate:**
- Tenant GUC is set at the **service boundary**, never repository or request.
- The ambient GUC and the `eq(tenantId, …)` predicate stay **independent**
  checks. Two checks fed by one input are not two checks.
- Admin cross-tenant access goes through the **separate `BYPASSRLS` role**
  (RLS-6's `server/db/adminDb.ts`), reachable from one audited module. Never
  give the app role `BYPASSRLS`; never add an `is_platform_admin` policy clause.
- Bootstrap-shaped problems get a **narrow, table-specific, GUC-keyed `OR`
  clause in `USING`** — not a `SECURITY DEFINER` function, not a second pool.
- **`0032` stays as written** (ruled 2026-08-20). See §5.

---

## 0b. Phase 2's recipe — proven on six suites, apply it mechanically

Every remaining restricted-run failure is one of three things, and the fix for
each is local and verifiable. **Work one suite at a time; run it under
`RLS_RESTRICTED=true` and then in normal mode before moving on.**

1. **Fixture writes and verification reads go through the observer.**
   `db.insert/update/delete/select` in a test → `getOwnerDb()`. The app runs
   restricted; a test building the world it exercises is not the app.
2. **`new TestFactory()` → `new TestFactory(getOwnerDb())`.** Same reason. The
   handle is now typed with the schema generic so this just works.
3. **Direct service calls need `enterTenantContextForTests(ctx.tenantId)`** —
   and they need it in **each place** such a call happens. A `beforeAll` entry
   covers the rest of that hook and **does not propagate into a test body**.
   Measured twice; on `api.runs.completed-immutability` the hook-only entry
   took it from 4-skipped to 3-passed-1-failed, and the one failure was the
   test whose body made its own service call.

**Do NOT put step 3 into `setupIntegrationTest`.** It is tempting — dozens of
suites would get it free — but four `rls*` suites use that helper and exist to
assert `/no tenant in context/`. They would keep passing only because
hook-entered context does not propagate into their test bodies, i.e. the
guards protecting this entire initiative would depend on an invisible rule
nobody would notice changing. Explicit per-suite edits are worth the extra
diff.

**Never apply any of this to the `rls*` suites themselves.** They exist to
observe what a restricted role cannot see; an owner handle or a free tenant
makes them pass unconditionally.

### The remaining 81 files, classified by first error

| Files | Class | What it means |
|---|---|---|
| 28 | quiet: "not found" / "access denied" / undefined row | A read filtered to zero rows — recipe steps 1-3 |
| 14 | wrong status code | Same, one layer up |
| 4 | app 500 | Usually a real unscoped write behind the route |
| 34 | other | Mixed; classify individually |
| 1 | timeout | ✅ was `collab.sync`, fixed |

---

## 1. Status

**Two gates, both still shut.** `FORCE` is not set anywhere and the app still
connects as the table owner, which Postgres exempts from RLS. Policies exist and
are **not enforced**; isolation today is service-layer `eq(tenantId, …)`
predicates, as it always was.

**Do not set `FORCE` yet.** Measured, not predicted — `RLS_RESTRICTED=true npm
run test:integration`, which is exactly what RLS-4 creates:

| | 2026-08-20 start | 2026-08-20 end | **2026-08-21 (now)** |
|---|---|---|---|
| Files | 98 failed / 26 passed | 85 failed / 39 passed | **83 failed / 41 passed** |
| Tests passed | 423 | 770 | **812** |
| Tests skipped (suite died in setup) | 463 | 113 | **112** |
| Raw "violates row-level security" hits | 100 | 20 | **48** |

**Read the last row correctly or you will misjudge the work — this is the trap
§4 warns about, and it fires on this very table.** The raw count went *up*
because more tests now get further: a suite that used to fail at a read now
proceeds to a write. Attributed by caller (the grep in §4):

- **10 are production code** — `WorkflowService` 3, `VersionService` 2,
  `routes/datavault/rowArchive.routes` 2, `routes/auth.routes` 2 (registration's
  insert; the comment at that call site claims 0027 permits it and the
  measurement disagrees — unresolved, see §5), `routes/dataSource.routes` 1
  (`createDataSource` inserting `datavault_databases` unscoped).
- **38 are test fixtures writing through the app's restricted pool** —
  `api.runs.prefill-allowlist`, `runner-hardening-run13`,
  `datavault.cloneUniqueKeys` and ~20 others. That is Phase 2 work and
  `tests/helpers/ownerDb.ts` is the tool for it, not a production change.

Judge progress by **passed** (770 → 812) and by the production-attributable
violation count (20 → 10), never by the raw grep.

**The dominant remaining failure is still the QUIET mode** — a SELECT filtered
to zero rows, surfacing as "Access denied - insufficient permissions" or "not
found" rather than an error. Reproduced in isolation on
`publish-lint-gate.test.ts`.

**Normal mode is green and must stay so: 124/124 files, 1183/1183 tests.**
Verified after every risky change. It is the regression gate for all of this.

---

## 2. What is left — a bounded list, not a search

`scripts/audit-rls-surface.ts` replaced discovery-by-execution with a static
bound. **121 sites at the start of 2026-08-21; 31 now**, and the bound itself
got two corrections along the way (§4).

```
Repository calls on RLS-covered tables with no tx argument:  17 across 4 files
Direct db.* calls on RLS-covered tables:                      8 across 6 files
Raw db.execute() SQL naming a covered table:                  6 across 4 files
TOTAL:                                                       31
```

**Triaged, so nobody re-does it:**

| Count | Where | Verdict |
|---|---|---|
| 14 | `routes/admin.routes.ts` | **RLS-7** — cross-tenant admin, belongs on `adminDb`. Needs an owner ruling first (does the audited module cover WRITES?). |
| 1 | `WorkflowClonerService.copyWorkflowAsAdmin` | RLS-7, same argument |
| 3 | `metricsRollup.ts`, `alerts.batchEvaluateAlerts` | Background jobs scanning `metrics_rollups` across **every** tenant, by design. Needs RLS-4's job-exception decision, not a wrapper. |
| 1 | `auth.routes` registration insert | Deliberate — no tenant exists yet |
| ~13 | `MfaService`, `AuthService`, `auditLogger`, `AuditLogService`, `TemplateAnalysisService`, `DatavaultDatabasesRepository`, `UserRepository.ping`, `BranchingService` | **False positives** — uncovered tables inside the scanner's window, Drizzle subqueries that never execute separately, or deliberate NULL-tenant fallbacks |

So: **the only unconverted production surface is the admin cluster (RLS-7) and
the two cross-tenant jobs.** Everything else on the list is triaged noise.

⚠️ **The audit list is not the whole job, and cannot be.** It finds code that
never opens a scoped transaction. It cannot find *converted* code that opens one
and then writes a row the policy still rejects — `WorkflowService` (3) and
`VersionService` (2) both violate at runtime in the restricted run despite being
converted, which means a row's derived tenant disagrees with the pinned one.
Only the restricted run finds those, which is why RLS-5 is a gate and not a
formality: static bound for what to convert, restricted run for whether it
works.

Then: **test tail** (§1's 38 fixture violations plus the quiet-mode failures —
re-measure before estimating), **CI gate (RLS-5)**, **dev rollout (RLS-4)**,
**test → prod**.

---

## 3. The tools you have — use these, do not invent

**`server/utils/rlsContext.ts`:**

| Helper | Use for |
|---|---|
| `withCurrentTenant(fn)` | Ordinary tenant-scoped work; reads the ambient tenant |
| `withTenant(tenantId, fn)` | You already know the tenant explicitly |
| `withTenantAsUser(tenantId, userId, fn)` | An UPDATE moving a row *between* tenants, or assigning a first tenant |
| `withCurrentUserId(userId, fn)` | Bootstrap: identity verified, tenant unknown |
| `withVerifiedIdentifier(guc, value, fn)` | Bootstrap keyed on any other proven value |
| `withLoginEmail(email, fn)` | **Auth paths only.** See §5 |
| `runWithTenantContext(tenantId, fn)` | Populates the async STORE — see the trap in §4 |

**`server/utils/selfUser.ts`** — `findSelfUser` / `updateSelfUser` for the
caller's OWN `users` row before a tenant exists (auth routes, MFA). Encodes the
UPDATE gotcha. **Never for an admin acting on someone else's row.**

**The house service pattern** (§2c "ambient-only" variant — most services):

```ts
private async withTx<T>(tx: DbTransaction | undefined, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  if (tx) { return fn(tx); }        // reuse a caller's, never nest
  return withCurrentTenant(fn);
}
```

**"Resolve the tenant from a credential you already verified"** — the recipe for
any caller holding a run token, share token or callback HMAC, used in four
places now (`runTokenAuth`, `SignatureBlockService`, `RunStateService`,
`datavault/options.routes`). Written out in TENANT_ISOLATION_RLS §2g. **If you
find a second implementation of tenant resolution, delete it** — `options.routes`
had grown one, and a hand-rolled copy resolves *confidently to the wrong tenant*
after a project transfer, which is what 0033 exists to prevent.

**`tests/helpers/ownerDb.ts` — the single biggest lever for Phase 2.** It
separates the test *observer* from the *application*: the app runs restricted
while fixture setup and verification reads go through an owner connection.
Applying it across 82 suites moved passing tests **495 → 736 in one commit**,
and §1's 38 fixture violations are the same problem again. **Read its two bold
warnings** — never use it to make an app-path failure disappear, and never in
the `rls-*` suites.

Direct-service-call suites need `enterTenantContextForTests(tenantId)` **inside
each test body**; `beforeAll` and `beforeEach` both fail to propagate through
`AsyncLocalStorage` (measured, not assumed).

---

## 4. Traps that have each cost real time

**The async store and the transaction GUC are INDEPENDENT.** This cost two
separate wasted fixes. `runWithTenantContext` populates the `AsyncLocalStorage`
store, which only *converted services* consult when they call
`withCurrentTenant`. **A repository call issued directly on the pool never looks
at it.** Equally, `withTenant(explicitId, …)` sets the GUC *without* populating
the store, so `getCurrentTenantId()` reads undefined exactly where a tenant is
very much pinned. If a fix "sets the tenant" and the symptom does not move,
check whether the failing read is actually inside a transaction.

**A pool query inside a transaction HANGS, it does not fail.** The
`SystemStats` deadlock class: against the `max: 1` test pool, a second query
issued while a transaction holds the only connection waits forever — a 600s
hang and a hook timeout, never an error. **`Promise.all` of several queries on
one `tx` handle is the same shape**; make them sequential. Hit again this
session in `SignatureBlockService` (two shapes: a parallel read pair, and a
per-block fan-out).

**A lib must not open the transaction.** `QueryRunner` takes an injectable `db`;
a `withTenant` placed inside it opened one on the *global* pool and silently
bypassed that injection — every test driving it through a mock died with
"Database not initialized". The transaction belongs at the service boundary.

**Converting a service breaks the unit tests that mock its repos**, three ways:
the `server/db` mock needs `transaction` (whose stub `tx` must answer whatever
the code calls on it — `execute`, and sometimes a full `select().from()` chain);
`toHaveBeenCalledWith` assertions gain a trailing `tx` (use `expect.anything()`,
a *stronger* claim than the arity it replaces); and a mocked `server/logger` may
need `createLogger` once a newly-imported module wants it. When a test asserted
the *mechanism* (`expect(db.update).toHaveBeenCalledTimes(2)`), replace it with
an assertion about *what is written* rather than restoring the count.

**Attribute failures by CALLER, not error text — including your own progress
metrics.** An entire earlier plan was built on a grep that matched the right
string and the wrong layer. §1's raw violation count rising 20 → 48 while the
work genuinely improved is the same trap in its friendliest costume. Always:

```bash
grep -oE 'at [A-Za-z]+(Service|Repository)\.[a-zA-Z]+ \(C:/[^)]*server/[^)]*\)' run.log \
  | sort | uniq -c | sort -rn
```

…and for violations specifically, walk back ~30 lines from each hit and take the
first `server/` or `tests/` frame — vitest prints them as `❯ tests/…`, which the
`at …` pattern above misses entirely.

**The audit script over- and under-counted, in both directions.** It listed five
repositories whose tables have **no policy** (`logic_rules`, `blocks`,
`templates`, `workflow_versions`, `step_values`) — 7 phantom sites and three
whole files needing nothing — and it was **blind to raw `db.execute` SQL**,
which hid a real defect (`StorageQuotaService` reporting zero storage used).
Both fixed. **When you add a table to an RLS policy, add it to that script**, or
the bound silently stops covering it.

**A failing restricted run leaks temp files**, and
`tests/integration/hardening/processingTimeout.test.ts` asserts the OS temp dir
is clean — so it then fails in **normal** mode and looks like a regression you
caused. It is not. Clear and re-run in isolation:

```bash
TMP="$(node -e 'console.log(require("os").tmpdir())')"
ls "$TMP" | grep -E "^file-[0-9]+-[a-f0-9]+\.(docx|pdf)$" | while read f; do rm -f "$TMP/$f"; done
```

**Environment:**
- Never pipe a background DB run through `tail` — it truncates the *saved*
  output. Redirect to a file.
- Never run two DB-backed suites at once. Check `pg_stat_activity` first.
- `npm run test:docker:up` starts postgres (5434) **and** gotenberg (3009).
- A transient `57P03` ("the database system is in recovery mode") mid-run means
  **the test Postgres segfaulted and restarted**, not that it is merely busy.
  Confirmed 2026-08-21 in `docker logs ezbuildr-test-db-1`: `server process …
  was terminated by signal 11: Segmentation fault`, and it has now happened on
  2026-08-19, 08-20 and 08-21 — roughly once a day under heavy runs. It takes
  down whichever suites were mid-setup (5 files / 15 skipped in one observed
  run) and looks exactly like a code regression. **Check `docker logs` before
  believing a mass failure**, then re-run the affected files in isolation; they
  pass. Worth fixing before RLS-5 becomes a required gate, or the gate will be
  flaky for reasons that have nothing to do with RLS.
- Schema-cache token is **`_v36`** (`tests/helpers/schemaManager.ts`) — bump it
  for any new migration, with the reasoning in a comment.
- A full restricted run takes ~19 minutes; normal integration ~10. Budget for
  that in any measure/fix loop.

---

## 5. Migrations 0026–0033, and the open questions

| | What it fixed |
|---|---|
| `0026` | Unguarded `::uuid` cast **raised** instead of filtering (`NULLIF`) |
| `0027` | `NULL = NULL` is NULL, so a NULL-tenant user could never match — blocked registration |
| `0028` | `hybridAuth`'s own identity re-hydration was blocked → **every authenticated route** |
| `0029` | Signature-token bootstrap (hashed-token variant) |
| `0030` | Run-token/upload bootstrap (verified-foreign-key variant) |
| `0031` | Public workflows (declared-visibility carve-out, no GUC) |
| `0032` | **Every password login was broken** — see below |
| `0033` | `projects`/`organizations` bootstrap, completing tenant resolution |

**`0032` — the authentication front door.** `findByEmail` runs with neither a
tenant nor a user id known (resolving who the caller is *is* the point), so
every user with a real tenant was invisible and **all password logins failed as
"Invalid credentials"** — plus registration's duplicate check, password reset,
and the Google OAuth upsert.

✅ **Ruled 2026-08-20: keep as written.** It is the weakest of the four
self-identification variants and that was raised before the ruling: `0028`
verifies a JWT signature, `0029`'s token hash *is* the proof, `0030`'s id came
from a verified match — in `0032` **nothing is verified, the caller typed the
email**. Justified structurally (a credential cannot be checked without reading
the row holding it) and kept narrow by `users_email_idx` being UNIQUE,
read-only, transaction-local. The documented alternative, still a clean future
swap: a dedicated low-privilege auth connection that may read `users` and
nothing else.

**`0033` closed a correctness hole, not just availability.**
`resolveForWorkflow` tries the PROJECT tenant first. With only the user paths
reachable, a filed workflow did not fail — it fell **through** to the creator
and resolved *that person's* tenant. Usually identical, silently not after a
project transfer, so a run or document could be confidently attributed to the
**wrong tenant**. `app_owner_tenant()` is plain SQL, **not `SECURITY DEFINER`**,
so it is bound by RLS like any other caller — which is why the derivation tables
each needed their own clause.

✅ **Closed 2026-08-21:** the flagged "`runTokenAuth` may have the same
resolution hole and no test would show it" is now verified and guarded —
`tests/unit/middleware/runTokenAuth.tenant.db.test.ts` asserts the resolved
tenant id lands in the async context, and was proven non-vacuous by breaking
`setCurrentTenantId` and watching it fail.

### Three open questions for whoever takes RLS-4

1. ✅ **CLOSED 2026-08-21 — it was never an application bug.** Registration's
   `users` INSERT violated in restricted mode because **11 of the 124 test
   schemas were still running migrations 0026-era policies** while carrying a
   current-looking `_v36` name: schema reuse was gated on "does it have
   tables?", which cannot see a policy-only migration, and migration failures
   were swallowed twice over. Fixed by fingerprinting the migration set (see
   §4) — the evidence below is kept because the *reasoning* was right and the
   environment was lying, which is the more useful lesson:
   - the logged params show `tenant_id` **NULL**, not `''`;
   - the policy in the schema that run actually used (`test_schema_w35_v36`) is
     the NULL-safe one — a single PERMISSIVE `tenant_isolation`, `WITH CHECK
     (NOT (tenant_id IS DISTINCT FROM NULLIF(current_setting(…), '')::uuid))`,
     verified with `pg_policies`;
   - `NOT (NULL IS DISTINCT FROM NULL)` is TRUE;
   - the stack goes through **pg-pool**, not a transaction, so no `SET LOCAL`
     is in scope, and no session-level `set_config` exists anywhere in the repo
     (verified by grep).

   Every one of those checks was correct. The insert was simply running against
   a schema built before 0027. Proven both ways: inserting a NULL-tenant `users`
   row as the restricted role by hand **succeeds** on a correctly-built schema,
   and `pg_policies` showed 11 schemas whose `users` WITH CHECK still used bare
   `=` instead of `IS NOT DISTINCT FROM`.

   **The transferable lesson: when every check says the code is right, check
   whether the environment is what it claims to be.** A cache keyed on
   something it cannot validate will eventually lie, and it lies in the shape
   of an application defect.
2. **The DocuSign webhook cannot resolve a tenant.** `/webhook/docusign`
   arrives with an envelope id and nothing else, so there is nothing to resolve
   *from* until `signature_requests` — covered — has been read. Documented at
   the call site in `SignatureBlockService.withResolvedTenant`. Closing it is a
   decision: a bootstrap clause on `provider_request_id` keyed on a GUC pinned
   only after the webhook signature verifies (0029's shape, weaker proof), or
   `adminDb`. The HMAC callback route, which *does* carry a run id, is scoped
   properly today.
3. **Background jobs have no tenant by design.** `metricsRollup` and
   `alerts.batchEvaluateAlerts` scan `metrics_rollups` across every tenant.
   RLS-4's runbook already lists jobs as an explicit exception; it needs an
   actual answer (a bypass role for jobs, or a per-tenant loop).

⚠️ **Before enforcement, spend 30 minutes on the accumulated escape clauses.**
`users` (self-id + login-email), `workflows` (workflow-id + public),
`signature_requests`, `projects`, `organizations` each now carry a narrow
read-only `OR` keyed on a GUC **application code sets**. Five auditable clauses
beats every query site — but it is no longer "the database enforces it
regardless of the app," which is what this phase was originally sold on. That
trade is discussed in `RLS_COMPLETION_PLAN.md` §6.

---

## 6. The habit that actually matters

**Prove the guard fails, and ask the second question.** This paid out five times
in a row in the first session, and again in this one: the new `runTokenAuth`
test was only worth anything after breaking `setCurrentTenantId` and watching it
go red; the audit script's numbers were only worth anything after checking its
table list against the migrations.

When a fix here looks done, run it once more and see whether a *different* error
appears where the old one was. That is usually not noise; it is the next layer.

# RLS Phase 2 — state, patterns and traps

**Rewritten 2026-08-21 for a cold start.** Assumes no prior context. `dev` is at
`0aafd677`; everything described here is **committed** and the working tree is
clean.

- **Plan and estimates:** [`RLS_COMPLETION_PLAN.md`](RLS_COMPLETION_PLAN.md) —
  phased scope against the ~2026-10-21 client-data date. Read that for *what to
  do and when*. Read **this** file for *state, patterns and hazards*.
- **Board:** [`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md).
  Deliberately not `*_TICKETS.md` — that glob is what dispatch scans; this is
  context, not a board.

---

## 0. Orientation, in this order

1. This file, §1–§3.
2. `docs/architecture/TENANT_ISOLATION_RLS.md` **§2b–§2f** — the
   `withTx`/service-boundary pattern, and the self-identification pattern with
   its four variants. **Read before inventing a mechanism for anything below;**
   the next bootstrap-shaped problem almost certainly fits an existing shape.
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

## 1. Status

**Two gates, both still shut.**

`FORCE` is not set anywhere, and the app still connects as the table owner —
which Postgres exempts from RLS. So policies exist and are **not enforced**.
Isolation today is service-layer `eq(tenantId, …)` predicates, as it always was.

**Do not set `FORCE` yet.** Measured, not predicted: running the whole app
against a real non-owner role (`RLS_RESTRICTED=true npm run test:integration`)
still fails **85 of 124 files**. That run is exactly what RLS-4 creates.

| | Start of 2026-08-20 | Now |
|---|---|---|
| Files | 98 failed / 26 passed | **85 failed / 39 passed** |
| Tests passed | 423 | **770** |
| Tests skipped (suite died in setup) | 463 | **113** |
| Hard RLS violations | 100 | **20** |

**Read that table correctly or you will misjudge the work.** A suite that dies
in `beforeAll` reports every test as *skipped*, not failed. So as setup gets
fixed, tests move from skipped → running, and the *failure* count can rise while
things genuinely improve. Judge by **passed** and **skipped**.

Remaining violations: `collab_docs` 10, `users` 4, `datavault_rows` 4,
`datavault_databases` 2. Everything else failing is the *quiet* mode — a SELECT
filtered to zero rows, surfacing as "not found" or a failed assertion rather
than an error.

**Normal mode is green and must stay so: 124/124 files, 1183/1183 tests.**
Verified after every risky change. It is the regression gate for all of this.

---

## 2. What is left — a bounded list, not a search

The epic felt unbounded because the failure mode is discovery-by-execution: an
unscoped read is invisible until a test drives that path, so every pass found
more work *because it got further*. `scripts/audit-rls-surface.ts` replaces that
with a static bound:

```
Repository calls on RLS-covered tables with no tx argument:  97 across 22 files
Direct db.* calls on RLS-covered tables:                     24 across 11 files
TOTAL call sites to triage:                                 121
```

Highly concentrated — five files hold over half:

```
27  server/services/WorkflowPatchService.ts
14  server/routes/admin.routes.ts       ← belongs on adminDb, NOT a conversion
11  server/routes/auth.routes.ts
 9  server/services/esign/SignatureBlockService.ts
 6  server/services/portability/ImportService.ts
```

⚠️ **Not every hit is a conversion.** `admin.routes.ts` and
`middleware/adminAuth.ts` are cross-tenant admin reads that belong on RLS-6's
existing `adminDb` path. `AclService` already threads `tx` through every method
and correctly never opens its own transaction — it needs its *callers* fixed,
not itself. `QueryService` is dead code. `WorkflowTenantResolver` is bootstrap
by design.

**Top remaining runtime failures** (from the last restricted run — pair these
with the static list, since they show what actually breaks):

```
11 ExportService.exportToFile          access check still denies in some suites
10 UserRepository.findByEmail          a by-email path 0032 did not reach
10 RunLifecycleService (:443 / :571)   the document RENDERING layer
14 DatavaultRowsService                the only remaining hard violations
 6 PersonalizationService.generateText
 5 ImportService.apply                 the row-writing half
```

Then: **test tail** (many will fall out once the above land — re-measure before
estimating), **CI gate**, **dev rollout**, **test → prod**.

---

## 3. The tools you have — use these, do not invent

**`server/utils/rlsContext.ts`:**

| Helper | Use for |
|---|---|
| `withCurrentTenant(fn)` | Ordinary tenant-scoped work; reads the ambient tenant |
| `withTenant(tenantId, fn)` | You already know the tenant explicitly |
| `withTenantAsUser(tenantId, userId, fn)` | An UPDATE moving a row *between* tenants |
| `withCurrentUserId(userId, fn)` | Bootstrap: identity verified, tenant unknown |
| `withVerifiedIdentifier(guc, value, fn)` | Bootstrap keyed on any other proven value |
| `withLoginEmail(email, fn)` | **Auth paths only.** See §5 |
| `runWithTenantContext(tenantId, fn)` | Populates the async STORE — see the trap in §4 |

**The house service pattern** (§2c: "ambient-only" variant — most services):

```ts
private async withTx<T>(tx: DbTransaction | undefined, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  if (tx) { return fn(tx); }        // reuse a caller's, never nest
  return withCurrentTenant(fn);
}
```

**`tests/helpers/ownerDb.ts` — the single biggest lever.** It separates the test
*observer* from the *application*: the app runs restricted, while fixture setup
and verification reads go through an owner connection. Applying it across 82
suites moved passing tests **495 → 736 in one commit**. If a suite fails on its
own fixture reads, reach for this first. **Read its two bold warnings** — never
use it to make an app-path failure disappear, and never in the `rls-*` suites.

Direct-service-call suites need `enterTenantContextForTests(tenantId)` **inside
each test body**; `beforeAll` and `beforeEach` both fail to propagate through
`AsyncLocalStorage` (measured, not assumed).

---

## 4. Traps that have each cost real time

**The async store and the transaction GUC are INDEPENDENT.** This cost two
separate wasted fixes, in different costumes. `runWithTenantContext` populates
the `AsyncLocalStorage` store, which only *converted services* consult when they
call `withCurrentTenant`. **A repository call issued directly on the pool never
looks at it.** Equally, a caller using `withTenant(explicitId, …)` sets the GUC
*without* populating the store, so `getCurrentTenantId()` reads undefined
exactly where a tenant is very much pinned. If a fix "sets the tenant" and the
symptom does not move, check whether the failing read is actually inside a
transaction.

**A pool query inside a transaction HANGS, it does not fail.** The `SystemStats`
deadlock class: against the `max: 1` test pool, a second query issued while a
transaction holds the only connection waits forever. It presents as a 600s hang
and a hook timeout, never an error. Hit again this session by putting an ACL
check (which issues its own queries) inside a read transaction — the fix is to
give it its OWN transaction, sequenced after. Likewise, `Promise.all` of several
queries on one `tx` is the same shape: make them sequential.

**Converting a service breaks the unit tests that mock its repos**, two ways:
the `server/db` mock may need `transaction` (whose stub `tx` needs `execute`),
and `toHaveBeenCalledWith` assertions gain a trailing `tx`. Updating them to
`expect.anything()` is a *stronger* claim, not a weaker one. Also watch for a
mocked `server/logger` missing `createLogger` once a newly-imported module needs
it.

**A failing restricted run leaks temp files**, and
`tests/integration/hardening/processingTimeout.test.ts` asserts the OS temp dir
is clean — so it then fails in **normal** mode and looks like a regression you
caused. It is not. Clear and re-run in isolation:

```bash
TMP="$(node -e 'console.log(require("os").tmpdir())')"
ls "$TMP" | grep -E "^file-[0-9]+-[a-f0-9]+\.(docx|pdf)$" | while read f; do rm -f "$TMP/$f"; done
```

**Attribute failures by CALLER, not error text.** An entire earlier plan was
built on a grep that matched the right string and the wrong layer — it counted
"violates row-level security policy" and assumed the callers were test fixtures.
They were production code, and the real finding (the rollout was never complete)
was missed for two days. Always:

```bash
grep -oE 'at [A-Za-z]+(Service|Repository)\.[a-zA-Z]+ \(C:/[^)]*server/[^)]*\)' run.log \
  | sort | uniq -c | sort -rn
```

**Environment:**
- Never pipe a background DB run through `tail` — it truncates the *saved*
  output. Redirect to a file.
- Never run two DB-backed suites at once. Check `pg_stat_activity` first.
- `npm run test:docker:up` starts postgres (5434) **and** gotenberg (3009).
- A transient `57P03` mid-run is Postgres recovering under load, not a
  regression. Re-run.
- Schema-cache token is **`_v36`** (`tests/helpers/schemaManager.ts`) — bump it
  for any new migration, with the reasoning in a comment.
- A full restricted run takes ~19 minutes. Budget for that in any measure/fix
  loop; it is why this work does not interleave well with feature work.

---

## 5. Migrations 0026–0033, and the one flagged decision

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
read-only, transaction-local.

The alternative, still a clean future swap: a **dedicated low-privilege auth
connection** that may read `users` and nothing else — `adminDb`'s shape but far
narrower — moving containment from convention into the connection. It changes
*how* the read is permitted, not any of the seven call sites.

**`0033` closed a correctness hole, not just availability.**
`resolveForWorkflow` tries the PROJECT tenant first. With only the user paths
reachable, a filed workflow did not fail — it fell **through** to the creator
and resolved *that person's* tenant. Usually identical, silently not after a
project transfer, so a run or document could be confidently attributed to the
**wrong tenant**. `app_owner_tenant()` is plain SQL, **not `SECURITY DEFINER`**,
so it is bound by RLS like any other caller — that is why the derivation tables
each needed their own clause.

⚠️ **Worth verifying, not assumed:** `runTokenAuth` had this same resolution
hole and swallowed it as best-effort ("leave the context empty rather than
invent a tenant"), so **no test showed it**. The `0033` + resolver fixes
*should* have closed it, but that was never tested directly. Confirm before
RLS-4.

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
in a row: each fix revealed the next layer rather than finishing the job —
fixture UPDATE → login by email → section creation → step creation → route
middleware → that file's own fixture reads. Every single time the tempting move
was to stop at "the error changed."

When a fix here looks done, run it once more and see whether a *different* error
appears where the old one was. That is usually not noise; it is the next layer.

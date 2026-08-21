# RLS Phase 2 — handoff to finish RLS-4 and RLS-5

**Rewritten 2026-08-20 (second rewrite, later the same day).** The previous
version of this file was written before anyone had read the restricted-role
failures caller-by-caller. **Its central diagnosis was wrong** — see §2, which
exists specifically so the next session does not re-derive the wrong plan from
the old one. `dev` is at `6f09ba54`; everything described here is **committed**.

Board: [`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md).
Deliberately not named `*_TICKETS.md` — that glob is what dispatch scans for
work; this is context, not a board.

---

## 0. Read this first, in this order

1. This file, end to end. **§2 before you plan anything.**
2. `docs/architecture/TENANT_ISOLATION_RLS.md` **§2e and §2f** — the
   self-identification pattern and its variants (primary-key, token-hash,
   verified-foreign-key, and now login-email) plus the declared-visibility
   carve-out. **Read this before inventing a new mechanism for anything below.**
3. §2b/§2c/§2d in the same doc for the underlying `withTx`/service-boundary
   pattern everything here builds on.

**Do not relitigate these — repo-owner rulings, reasoning already recorded:**
- Tenant GUC set at the **service boundary**, never repository or request.
- Ambient GUC and `eq(tenantId, …)` predicate stay **independent** checks.
- Admin cross-tenant access goes through the **separate `BYPASSRLS` role**
  (RLS-6), reachable from one audited module. Never give the app role
  `BYPASSRLS`; never add an `is_platform_admin` clause to a policy.
- Bootstrap-shaped RLS problems (identity known, tenant not yet) get a
  **narrow, table-specific, GUC-keyed `OR` clause in `USING`** — not a
  `SECURITY DEFINER` function, not a second bypass pool.

---

## 1. 🔴 THE HEADLINE: do not roll RLS-4 out to dev yet

**Setting `FORCE` + the restricted role in dev today would take dev down.**
This is measured, not predicted — `RLS_RESTRICTED=true npm run test:integration`
runs the whole app against a real non-owner role, which is exactly what RLS-4
creates, and **98 of 124 files still fail**.

Everything in §3 must land first. The gate that says "safe to roll out" is
RLS-5 being green, and that is what RLS-5 was always for.

---

## 2. 🔴 The previous handoff's diagnosis was wrong — read this before planning

The prior version sorted the ~99 failing files into three categories and called
the dominant one:

> **Category B — the long tail: individual files with their own unscoped
> fixture writes.** … Confirmed by root-cause grep: **206 of ~230 raw RLS
> errors in the final run are `"violates row-level security policy for table
> X"`**, traced to files never routing through the fixed shared helpers.

**That inference does not hold.** The grep matched the *error text* and then
assumed the *caller* was a test fixture. It was not checked. When the callers
are actually read, every one of the top stack frames is in `server/`:

```
84 at SectionRepository.create            (via SectionService — unconverted)
14 at UserRepository.create               (registration path)
14 at RunLifecycleService.generateDocumentsInner
 4 at MarketplaceService.installTemplate
 4 at ImportService.resolveTargetOwner / .apply
 2 at StepService.createStep              (unconverted)
 2 at StripePaymentService.handleWebhook
 2 at DocumentAIAssistService.*
 1 at SectionService.createSection / RunService.createRun
```

**So the real finding is bigger than a test-fixture cleanup: the service
rollout was never complete.** RLS-2 declared victory at "21 services" using a
scoping criterion measured on 2026-08-18 — *services that reference
`tenantId`* (35 of 99 files). That criterion is structurally blind in three
directions, and every blind spot is a live gap:

1. **Ownership-derived tables.** `sections`, `steps` and `workflows` carry no
   `tenant_id` column — their policies resolve the tenant through the parent
   workflow. So the services that own them **never mention `tenantId`** and
   fell straight out of the measured surface. `SectionService` and
   `StepService` are the workflow builder's core, and neither had a single
   line of RLS conversion.
2. **Services outside `server/services/*.ts`.** The survey globbed one
   directory. `server/lib/templates/MarketplaceService.ts`,
   `server/lib/ai/DocumentAIAssistService.ts`,
   `server/services/workflow-runs/RunLifecycleService.ts`,
   `server/services/portability/ImportService.ts` and
   `server/services/integrations/StripePaymentService.ts` were never counted.
3. **A whole layer nobody named: route middleware.** `steps.routes.ts`'s
   `lookupWorkflowIdFromStepMiddleware` and its two siblings read
   `steps`/`sections` on the bare pool to resolve a `workflowId` before the
   handler runs. Under RLS they 404 a step that exists. This is neither a
   service nor a fixture, so no category covered it.

**Practical consequence for whoever picks this up:** do not budget "several
passes of mechanical fixture fixes." Budget **finishing the rollout** — call it
RLS-2f — and expect test-fixture work to be the *smaller* half.

**How to avoid repeating the error:** when you tally RLS failures, group by the
**top `server/` stack frame**, never by the error string:

```bash
grep -oE 'at [A-Za-z]+(Service|Repository)\.[a-zA-Z]+ \(C:/[^)]*server/[^)]*\)' run.log \
  | sort | uniq -c | sort -rn
```

---

## 3. What landed this session, and what is measurably left

### Committed (five commits, each gated independently)

| Commit | What |
|---|---|
| `bfc54bfe` | The prior session's uncommitted tree: `0026`–`0031`, the RLS-5 harness, the two shared fixtures |
| `13af4730` | **`0032` — the authentication front door.** See below |
| `7107752b` | `SectionService` + `StepService` converted; the route-middleware layer; `audit_logs` missing-`tenantId` |
| `6f09ba54` | `AuditLogger` silently dropping every tenanted audit row |
| `4a9f3ff2` | Owner's ruling on `0032` recorded |
| `6941b767` | Background-job tenant bootstrap; `WorkflowTenantResolver`; `RunDefinitionProvider` |
| `7f13e14b` | **`0033`** — bootstrap clauses on `projects`/`organizations`, completing tenant resolution |
| `3a2b2d97` | Portability export/import; `AuditLogService`'s three inserts |

### The two findings worth carrying forward

**`0032` — every password login was broken.** `validateCredentials` starts with
`userRepository.findByEmail(email)`, which runs with neither a tenant nor a user
id known (resolving who the caller is *is* the point). Against `0027`/`0028`'s
policy that reduces to `tenant_id IS NOT DISTINCT FROM NULL OR id = NULL`, so
every user with a real tenant is invisible and login fails as "Invalid
credentials". Same shape broke the registration duplicate check, password reset
and the Google OAuth upsert. **This is a total authentication outage under
FORCE** — broader than `0028`, which only broke re-hydration for tokens already
issued.

✅ **`0032` was RULED ON by the repo owner 2026-08-20 — keep it as written. Do
not relitigate.** It is still the weakest of the four self-identification
variants, and that was raised explicitly before the ruling: `0028` verifies a JWT signature first; `0029`'s
token hash *is* the proof; `0030`'s id came from a verified token match. In
`0032` **nothing is verified — the caller typed the email.** It is justified
structurally (a credential cannot be checked without first reading the row that
holds it) and kept narrow by `users_email_idx` being UNIQUE, by being read-only,
and by being transaction-local. The Google path is the stronger case, since
`verifyGoogleToken` has already checked the signature.

The alternative the owner weighed it against, kept here because it stays a clean
future swap: **a dedicated low-privilege auth connection** that may read `users`
and nothing else — RLS-6's `adminDb` shape but much narrower — which moves
containment from convention (who is allowed to set the GUC) into the connection
itself. It changes HOW the read is permitted, not any call site, so it can
replace `0032` later without touching the seven callers.

**The async store and the transaction GUC are INDEPENDENT.** This cost a wasted
fix. `AuditLogger` was "fixed" by falling back to `getCurrentTenantId()` — but a
caller that opened its transaction via `withTenant(explicitId, …)` sets the GUC
**without** populating the `AsyncLocalStorage` store, so the fallback resolved to
undefined exactly where a tenant was pinned. Violations moved 190 → 188. The
real defect was the no-transaction path writing a real tenant onto the pool,
where no GUC is set. **Never infer one mechanism from the other.**

### ⚠️ Two traps this vertical exposed — both will bite again

**`runWithTenantContext` is NOT enough on its own.** It populates the async
STORE, which is what *converted services* read when they call
`withCurrentTenant`. A repository call issued **directly on the pool** never
consults it. So "I set the tenant context" does not make a bare
`someRepository.findById(id)` work — that read needs a real transaction. This is
the same store-vs-GUC confusion that wasted a fix on `AuditLogger`, in a second
costume. If a fix "sets the tenant" and the symptom does not move, check whether
the failing read is actually inside a transaction.

**`WorkflowTenantResolver` could not resolve a tenant under enforcement, and
`runTokenAuth` still silently suffers it.** Migration `0030` makes the
*workflow* readable during bootstrap, but *deriving its tenant* reads
`users`/`projects`/`organizations` — RLS-covered in their own right — and
`app_owner_tenant()` is plain SQL, **not `SECURITY DEFINER`**, so it is subject
to RLS as well. Resolution therefore found the workflow and still returned
`null`, which every caller correctly treats as "deny".

Fixed for the user-id paths by pinning `app.current_user_id` to an id taken off
the already-read workflow (`0028`'s existing clause makes it visible — **no new
migration needed**). ⚠️ **The `projects` and `organizations` paths are NOT
fixed**: a workflow whose tenant is only derivable through its project or an org
owner will still fail to resolve. That needs the same verified-foreign-key
clause on those two tables when someone hits it.

⚠️ **`runTokenAuth` has this identical hole** and swallows it as best-effort
("leave the context empty rather than invent a tenant"), so **no test shows
it** — run-token requests have been silently getting no tenant. Worth a
deliberate look before RLS-4.

### Measured progress, four full restricted-role runs

| | Files | Tests failed | passed | skipped |
|---|---|---|---|---|
| Start of session | 98 failed / 26 passed | 297 | 423 | 463 |
| After `0032` (login) | 97 / 27 | 344 | 455 | 384 |
| After Section/Step/audit | 98 / 26 | 316 | 484 | 383 |
| **End of session** | **96 / 28** | 325 | **495** | **363** |

**The headline number is not in that table: hard RLS violations went 100 → 4.**
Only `datavault_rows` still raises. Everything remaining is the *quiet* failure
mode — a SELECT filtered to zero rows, surfacing as "not found" or a failed
assertion rather than an error — which is exactly why it has to be chased
caller-by-caller rather than by grepping for violations.

**Read this table carefully — "failed" going up is progress here.** Suites that
used to die in `beforeAll` counted all their tests as *skipped*; now they run and
fail individually on the next layer. The honest signals are **passed: 423 → 484**
and **skipped: 463 → 383**. Judging this work by the failure count alone will
make real progress look like regression.

RLS violations by table, same three runs: `sections` **84 → 0**,
`audit_logs` 2 → 190 → **0**, `users` 14 → 2.

### What is left, measured

**(a) Services still unconverted that touch RLS-covered tables (14).**

Top remaining by measured failure count: `RunLifecycleService` (21 — the
document-RENDERING layer below what is now fixed: templates, `RenderCore`,
`FinalBlockRenderer`), `DatavaultRowsService` (18, and the only source of the
4 remaining hard violations), `ImportService.apply` (11 — the row-writing half;
its owner-resolution half is done).

⚠️ **Two entries on this list need no conversion — check before starting.**
`AclService` already threads `tx` through every method and never opens its own
transaction, which is the CORRECT shape for a helper called from inside one:
it needs its *callers* to pass a `tx`, not a `withTx` of its own.
`MarketplaceService` is a pure delegate to `ImportService` and needed no change
at all — its 4 failures were `ImportService`'s.

| File | Lines |
|---|---|
| `WorkflowPatchService` | 748 |
| `RunService` | 657 |
| `TransformBlockService` | 595 |
| `AclService` | 257 |
| `LogicRuleService` / `AliasRenameService` | 240 each |
| `BlockService` | 187 |
| `WorkflowExportService` | 181 |
| `ReadTableBlockService` | 172 |
| `QueryBlockService` | 159 |
| `ListToolsBlockService` | 152 |
| `portability/ImportService` | 1218 |
| `workflow-runs/RunLifecycleService` | 712 |
| `lib/ai/DocumentAIAssistService` | 328 |
| `integrations/StripePaymentService` | 266 |
| `lib/templates/MarketplaceService` | 98 |

**Legitimately excluded, do not convert:** `AdminAccessService` (RLS-6's
`adminDb`, by design), `QueryService` (dead code, confirmed twice),
`WorkflowTenantResolver` (bootstrap by design — that is what `0030`'s GUC is for).

**(b) Route-layer bare repository reads — 5 files, 22 call sites:**
`admin.routes.ts` (15 — most of these should arguably route through RLS-6's
`adminDb` rather than being tenant-scoped; decide per site),
`dashboard.routes.ts` (3), `dataSource.routes.ts` (2), `blocks.routes.ts` (1),
`tenant.routes.ts` (1).

**(c) Test-fixture writes.** Real, and still the long tail by file count — but
the *smaller* half of the work, not the whole of it. Fix pattern unchanged from
the previous handoff (`applyTenantToTransaction` for a fresh INSERT with a known
tenant; `withTenantAsUser` for an UPDATE moving a row between tenants; mirror
`testFactory.createWorkflow` when only a userId is known).

**(d) Category A (6 files) — tests doing their own DDL via `db`.** Unchanged,
still low priority, still not app bugs: `rls-coverage`, `rls-phase4-workflows`,
`datavault.dvp2-perf`, `rls-datavault`, `rls4-forceEnforcement`,
`rls6-adminAccess`.

---

## 4. Order of work to actually close RLS-4 and RLS-5

1. **Finish the rollout (§3a, §3b)** — the services and the route layer. This is
   the bulk of the remaining work and it is what the previous plan under-scoped.
   Convert in clusters, commit per cluster, and **audit each service's callers**
   for non-request paths with no ambient tenant before declaring it done.
2. **Test-fixture cleanup (§3c)** until `RLS_RESTRICTED` is green or every
   remaining failure is freshly triaged.
3. **Wire RLS-5 into CI** per its ticket AC: a required check running the full
   suite as the restricted role, output for both roles pasted side by side.
4. **Only then RLS-4's dev rollout** — provision `ADMIN_DATABASE_URL` and the
   least-privilege role in dev, set `FORCE` and `RLS_ENFORCED=true` **together**
   (a FORCE-without-the-flag leaves `AdminAccessService`'s guard blind), repoint
   `DATABASE_URL`, then prove AC4 (cross-tenant read impossible) and AC5
   (non-vacuous with the GUC unset) with pasted output, and document a rollback.
5. `test`, then a **PR-only** promotion to `main`.

---

## 5. Environment facts that will cost you hours otherwise

- **Never pipe a `RLS_RESTRICTED`/DB-backed background run through `tail`.**
  Redirect to a file (`... > scratchpad/foo.log 2>&1`). A `| tail -N` on a
  backgrounded command truncates the SAVED output to N lines.
- **Never run two DB-backed suites concurrently**, including across a
  foreground/background split. Check first:
  `docker exec ezbuildr-test-db-1 psql -U postgres -d ezbuildr_test -c "SELECT count(*) FROM pg_stat_activity WHERE datname='ezbuildr_test' AND state='active';"`
- **`npm run test:docker:up` starts postgres (5434) AND gotenberg (3009).** Both
  are needed; a missing service reads like a code defect.
- **A failing restricted-role run leaks temp files into the OS temp dir**, and
  `tests/integration/hardening/processingTimeout.test.ts` asserts that directory
  is clean. It will then fail in **normal** mode and look like a regression you
  caused. It is not. Clear them and re-run in isolation to confirm:
  ```bash
  TMP="$(node -e 'console.log(require("os").tmpdir())')"
  ls "$TMP" | grep -E "^file-[0-9]+-[a-f0-9]+\.(docx|pdf)$" | while read f; do rm -f "$TMP/$f"; done
  ```
- **A transient `FATAL: the database system is not yet accepting connections`
  (`57P03`) mid-run is not a regression** — Postgres recovering under load.
  Re-run rather than chasing it.
- **`set_config`'s GUC-name argument can safely be a bind parameter** — this is
  what makes `withVerifiedIdentifier(gucName, value, fn)` work.
- **Column shapes for the next self-identification clause:** `workflows.id` is
  `uuid` (needs `::uuid`), `users.id` is `varchar` (no cast), `users.email` is
  `varchar` UNIQUE (no cast), `signature_requests.token` is `text` holding an
  already-hashed value (no cast).
- Schema-cache token is at **`_v35`** (`tests/helpers/schemaManager.ts`) — bump
  it for any further migration, with the reasoning in a comment.
- **Converting a service breaks the unit tests that mock its repos**, in two
  ways: the `server/db` mock may need `transaction` (and `execute`), and
  `toHaveBeenCalledWith` assertions gain a trailing `tx`. Updating them to
  `expect.anything()` is a *stronger* claim, not a weaker one — same as RLS-2a.

---

## 6. The one habit that matters

**Prove every guard fails, and ask the second question.** This session it paid
out four times in a row, each fix revealing the next layer rather than finishing
the job: `createTestUser`'s unscoped UPDATE → login by email → section creation →
step creation → route middleware → that file's own fixture reads. Every single
time, the tempting move was to stop at "the error changed."

And the sharper version, which is what §2 is really about: **when you attribute
a failure, check the caller, not the error text.** An entire plan was built on a
grep that matched the right string and the wrong layer.

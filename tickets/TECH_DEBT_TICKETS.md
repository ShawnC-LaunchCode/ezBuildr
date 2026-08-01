# Tech Debt — standing backlog (DEBT-1..16)

Standing register of known, evidenced debt in ezBuildr. Unlike an audit-driven
initiative, this file has **no phases and no phase gates**: the items are
independent and can be dispatched in any order, subject to the file-overlap
notes in each ticket's Ties. That is a deliberate deviation from the usual
ticket-flow structure — forcing artificial phases onto unrelated debt would
serialize work that has no reason to be serialized.

Opened 2026-07-28. Every item below was verified against the working tree on
that date with `file:line` evidence; line numbers drift, so search for the
quoted code if a reference goes stale.

**Nothing here is on fire.** These are the things that will cost more the
longer they sit, not outages. Priorities are relative to each other, not to
feature work.

---

## How to work this document

- Read the file's rules plus **your ticket only**.
- **Load the named project skills before touching code** — `.claude/skills/`
  for Claude Code; non-Claude agents read `AGENTS.md` at the repo root first,
  which names each `SKILL.md` by path.
- **Gates for every ticket:** `npm run type-check` → 0 errors, `npm run lint`
  → 0 problems, `npm run test:fast` → green at ≥ baseline.
- **Baseline at authoring time (2026-07-28, `npm run test:fast`):**
  `Test Files 146 passed | 1 skipped (147)`, `Tests 1978 passed | 15 skipped (1993)`.
- **Current baseline (2026-07-31, `npm run test:fast` on `main`):**
  `Test Files 156 passed | 1 skipped (157)`, `Tests 2059 passed | 14 skipped (2073)`.
  Measure against this one — the authoring-time figure is kept only for history.
- **Watch the tsc cache.** Fixed in `647d1465` for new trees, but if you are in
  a worktree created before that commit, `rm -f .tsbuildinfo` (and
  `node_modules/typescript/tsbuildinfo`) before believing `type-check`.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Theme | Priority | Size | Status |
|---|---|---|---|---|
| DEBT-1 | Drain unused eslint-disable directives | P2 | L | ✅ `4912f21f`..`0500ba6b` (8 tranches) — entry removed |
| DEBT-2 | Retire the 143 blanket file-level eslint-disable headers | P2 | L | ✅ `ac518f1d` |
| DEBT-3a | Restore the two skipped `visibleIf` document-generation tests | P1 | M | ✅ verified at review 2026-07-30 — entry removed |
| DEBT-3b | Restore the skipped collab sync test | P1 | S | ✅ `8dfdee82` |
| DEBT-4 | E-signature provider registry is never initialized | P1 | S | ✅ `9fcf05b4` — ruled dormant; entry removed |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | P1 | S | ✅ `f308fde2` + `50408c33` — entry removed |
| DEBT-6 | Two parallel file subsystems | P2 | L | ✅ `058530b0` |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | P1 | S | ✅ `23a5863e` — entry removed |
| DEBT-8 | DI container is built but ~unused | P2 | M | ✅ **Decision: removed, not adopted** (2026-07-30) — `server/di/` deleted; it had zero consumers. Entry removed |
| DEBT-9 | `type-check` is advisory in CI | P2 | S | ✅ `a0e43c9b` — entry removed |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | 🔄 1/10 — #129 merged, #130–#138 open |
| DEBT-11 | RLS policies defined but not enforced (decision, not a fix) | — | — | 🔲 tracked |
| DEBT-13 | Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type | P1? | S | ✅ verified at review 2026-07-31 |
| DEBT-14 | `creation-routes.test.ts` fails 18 tests only when the whole file runs | P2 | M | ✅ `5ae7fde3` — fixed in services, not the test |
| DEBT-15 | Generated documents are written to the ephemeral container filesystem | P1 | L | ✅ code done — **needs `STORAGE_DRIVER=s3` in Railway to take effect** |
| DEBT-16 | `propagateRename` swallows errors inside a caller's transaction | P2 | S | ✅ atomic model; mutation-proved |

## DEBT-2 — Retire the 143 blanket file-level eslint-disable headers ✅

> **✅ VERIFIED AND COMMITTED 2026-07-31 — `ac518f1d`, 123 files.** Gates re-run
> by the reviewer: type-check 0 · lint 0 · **`check:strict-zones` all passed** ·
> `test:fast` **154 files / 2052 tests** (baseline 153/2047 plus 5 new).
>
> **AC 1** — `grep -rl "^/\* eslint-disable" server/ client/ shared/ tests/`
> returns **0**, re-checked after fast-forwarding so main's newly added files
> were included. No allowlist was needed.
>
> **AC 2** — `.eslintrc.json` is **untouched**, so nothing was relocated into
> config. The 345 replacements are all next-line scoped, **all** carry a `--`
> reason, and **none** lists a rule after the separator (which would silently
> fail to disable it). Lint runs `--report-unused-disable-directives` and
> passes, so every one of the 345 is load-bearing rather than dead.
>
> **AC 3 (the payoff record)** — measured by the reviewer, since the turn-in did
> not report it: **94 of 122 files needed real code changes** beyond comment
> moves (whitespace-ignored); only 28 were comment/whitespace only.
>
> ### Two regressions the turn-in's own gates could not see
>
> 1. **`sanitizeObject` lost array handling — live, and global.** Replacing
>    `Array.isArray(obj) ? [] : {}` with a plain `{}` rewrote any JSON array
>    body, and any nested array-of-arrays, into an object with numeric string
>    keys. `sanitizeInputs` is `app.use`d in **both** `server/index.ts` and
>    `server/production.ts`, so it sees every request. `tsc` could not catch it
>    because the function returns through an `as T` cast, and `sanitize.ts` had
>    **no tests at all**. Reproduced against main before and after
>    (`isArray: true` → `false`), fixed, and covered by a new
>    `tests/unit/utils/sanitize.test.ts` whose two shape tests are
>    mutation-proved.
> 2. **`getRetryAfter` failed `check:strict-zones`** — a gate `npm run
>    type-check` does not run, which is why both the dev and the reviewer's
>    first pass saw green. Typing `error` as `unknown` instead of `any` is
>    precisely what exposed it: while it was `any`, `match[1]` was `any` too and
>    the unchecked index was invisible. **This is the ticket's thesis in
>    miniature** — the suppression was hiding real latent unsafety.
>
> ⚠️ **The turn-in reported `test:fast` 151/2042 "meeting baseline".** It was
> measured on a base ~4 commits stale; baseline was already 153/2047. Per
> [[tech-debt-register]] and the initiative notes, **a reported count that
> undershoots the current baseline means a stale worktree, not a regression** —
> ff first, then re-measure. After ff it was 153/2047 exactly.
>
> **Lesson worth keeping: `npm run type-check` is not the commit gate.**
> `scripts/pre-commit-checks.ts` also runs `check:strict-zones`, and a strict
> zone pulls in files transitively through imports — so a file nowhere near
> `server/services/scripting/` can break it.

**Priority: P2** · Size: L · Files: repo-wide

### Finding

**143 files** open with a file-level `/* eslint-disable ... */` header
(measured 2026-07-28). A blanket header disables the rule for the *whole file*,
including code written years later by someone who never saw the original
reason.

The concrete danger is not style, it is that these headers hide real defects.
In IEX Phase 0, three files carried a six-rule header; removing them exposed
**55 errors**, and every one of those errors was a symptom of a genuine broken
type import (`server/types/adm-zip.d.ts` shadowing adm-zip's real typings with
`getEntries(): any[]`). The suppression had been masking the evidence of the
bug for as long as it existed. `lint` was green the entire time.

### Preferred fix

Replace each file-level header with the narrowest thing that works, in this
order of preference:

1. **Fix the code** — most of these are `no-unsafe-*` cascades from one bad
   type at the top of the file, exactly as in the adm-zip case. Fixing the
   root type usually clears the whole file at once.
2. A targeted `// eslint-disable-next-line <rule> -- <reason>` at the single
   site that needs it.
3. If a whole file genuinely needs an exemption (generated code, a vendored
   shim), an `overrides` entry in `.eslintrc.json` scoped by path — visible in
   config review rather than buried at the top of a file.

Tranche this the same way as DEBT-1 and for the same reason. **Tranche means
organise the work by directory and keep the tree gate-clean between them — it
does not mean commit.** DEBT-1's acceptance criteria asked the dev for "one
commit per directory tranche", which no dev can satisfy under this file's
"devs do not commit" rule; the reviewer split the delivered tree into the eight
tranche commits at review instead. Do not repeat that criterion here.

**Beware the measurement trap:** `tsc --pretty` emits ANSI codes, so
`grep "error TS"` finds nothing on a failing tree. Read raw output or grep
`-E "Found [0-9]+ error"`.

### Ties

- **Depends on DEBT-1** (sequence after; heavy file overlap).
- Prior art for the "fix the root type instead" approach: commit `64c2b698`,
  which deleted `server/types/adm-zip.d.ts` and cleared 55 errors without a
  single suppression.
- Load `run-tests`.

### Acceptance criteria

1. `grep -rl "^/\* eslint-disable" server/ client/ shared/ tests/` returns
   **0** files, or a documented allowlist with an `overrides` entry per file
   and a reason.
2. Every removed header was resolved by fixing code or by a targeted
   next-line disable carrying a `--` reason — not by moving the same blanket
   rule set into `.eslintrc.json`.
3. Each tranche reports how many real errors the removal exposed, so the
   payoff is recorded.
4. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline.

---

## DEBT-3b — Restore the skipped collab sync test ✅

> **✅ DONE — implemented and verified by the reviewer 2026-07-31, `8dfdee82`.**
> Not dispatched.
>
> ### It found a live production break
>
> **Real-time collaboration could not connect at all, for any registered user.**
> `authenticateConnection` validated `payload.role` against
> `owner|builder|runner|viewer`, but that claim is the **system** role —
> `auth.routes.ts:223` sets it to `'creator'` on every registration — so every
> WebSocket was closed with `1008 Invalid user role` immediately after auth. I
> saw the close frame directly. `canMutate()` and `AuthenticatedUser.role` are
> both defined in tenant-role terms, so `tenantRole` is the claim the check
> always meant. ESLint then flagged the return cast as unnecessary, which is its
> own confirmation the corrected claim already has the right type.
>
> ### The ticket was mis-scoped and could not have been done as written
>
> It assumed a test-file-only change in the `unit` project. In fact the whole
> describe block is gated on `COLLAB_SERVER_URL`, which **nothing in the repo
> sets**, against a hardcoded `ws://localhost:5174` that nothing starts — so it
> could never have run. And the collab server calls `loadDocument()`, requiring
> a database that a `unit-fast` test must not touch. Real coverage now lives in
> **`tests/integration/collab.sync.test.ts`**; the dead skipped test is deleted
> and points there.
>
> **Gates:** type-check 0 · lint 0 · `check:strict-zones` passed · `test:fast`
> 2052 passing (skipped 15 → 14) · `collab.sync` 3/3 on an isolated database.
>
> **Mutation-proved, and the split is the useful part:** disabling
> `broadcastUpdate` fails the two live-sync tests while the late-joiner test
> still passes — because that one exercises the initial-sync path instead.
> Reverting the auth fix fails all three. A whole-file revert would have shown
> neither.
>
> **Two traps worth keeping:** `server/routes.ts:48` already calls
> `initCollabServer`, so attaching a second one produces
> `handleUpgrade() was called more than once` **while the tests still appear to
> pass**. And the integration harness mints `authToken` at registration, before
> it assigns the tenant, so that token carries a null `tenantId` and the collab
> server rejects it as cross-tenant — re-mint from the persisted user row.

---

## DEBT-15 — Generated documents are written to the ephemeral container filesystem ✅

> **✅ VERIFIED AND COMMITTED 2026-07-31.** Dev did the architecture; the
> reviewer fixed a deploy-breaking migration, an unmet AC 5, lint, and AC 2.
>
> **What shipped.** `FinalBlockRenderer` uploads each generated document to
> `storageProvider` under `runs/{runId}/documents/{filename}`, records the key
> on `run_generated_documents.storage_key`, and unlinks its local scratch copy
> before returning. The per-run download route resolves that key through
> `storageProvider` instead of reading `server/files/{archives,outputs}`. As a
> side effect its ownership check got *stronger*: it now looks the record up
> scoped by `runId` rather than pattern-matching the filename.
>
> **AC 4 — the route was deleted, not repaired.** `/api/files/download/:filename`
> had exactly one producer (`TemplateTestService`) and **no client callers**,
> and its authorization lookup compared a bare filename against a column
> storing a full path, so it could never match. `server/routes/files.routes.ts`
> is gone with zero dangling references.
>
> **Reviewer fixes.** (1) **Deploy-breaking migration.** The generated
> `ADD COLUMN "storage_key" text NOT NULL` aborts on any populated table —
> reproduced against a real DB seeded with one row:
> `ERROR: column "storage_key" ... contains null values`. It passed every local
> gate only because test tables start empty. Regenerated via `db:generate` and
> rewritten as add-nullable → backfill → `SET NOT NULL`; re-verified end to end
> on a seeded database, which now backfills
> `runs/{run_id}/documents/{file_name}` and enforces NOT NULL.
> (2) **AC 5 was unmet.** The turn-in read bytes back via
> `storageProvider.getFile()` in the same process, which proves nothing —
> `DiskStorageProvider`'s baseDir *is* `process.cwd()/server/files`. Replaced
> with `tests/integration/finalBlock.download.durability.test.ts`, which deletes
> both generation directories and then downloads over HTTP through the real
> endpoint. **Mutation-proved:** restoring the local-disk read makes it fail.
> (3) lint (orphaned `fs` import, `||`→`??`) and (4) AC 2 comments on
> `FinalBlockRenderer:144` / `DocumentEngine:46`.
>
> **Gates, all reviewer-run:** type-check 0 · lint 0 · `check:strict-zones`
> 6/6 · `test:fast` **157 files / 2061 tests** (baseline) · doc-generation
> integration **3 files / 11 tests** green · migration applied to a populated
> DB.
>
> ### ⚠️ AC 7 — this does NOT close the customer bug on its own
>
> `STORAGE_DRIVER` still defaults to `disk`, and `DiskStorageProvider` writes
> under `process.cwd()/server/files`. **Until `STORAGE_DRIVER=s3` and bucket
> credentials are set in Railway, generated documents remain on the ephemeral
> container filesystem and will still vanish on deploy.** The code is now
> correct and driver-agnostic; the remaining step is provisioning, tracked
> outside this ticket. Required env: `STORAGE_DRIVER=s3` plus the S3 settings
> in `.env.example:108-110`.

**Priority: P1** · Size: L · Files: `server/services/document/FinalBlockRenderer.ts`,
`server/services/document/DocumentEngine.ts`, `server/routes/finalBlock.routes.ts`,
`server/routes/files.routes.ts`, `server/services/fileService.ts`,
`server/services/TemplatePreviewService.ts`, `server/services/storage/*`

*Spotted 2026-07-31 while scoping DEBT-6. Re-scoped 2026-07-31 after the
durability question was answered — see below. Size raised S→L and the "?" on
P1 dropped.*

### Finding

Generated customer documents are written to the container's own filesystem,
which Railway wipes on every deploy — and this project auto-deploys from
`main`, so restarts are routine, not rare.

The **durable customer path** is:

1. `FinalBlockRenderer.ts:141` writes the generated document to
   `path.join(process.cwd(), 'server', 'files', 'archives')`.
2. `RunLifecycleService.ts:479` and `DocumentGenerationWorker.ts:114` insert a
   `run_generated_documents` row with
   `fileUrl = /api/runs/:runId/final-documents/:filename/download`.
3. `finalBlock.routes.ts:334` serves that back out of `archives`, falling back
   to `outputs` at `:342`.

Other `process.cwd()` write sites, all under `server/files/`:

- `DocumentEngine.ts:46` (default `outputDir`)
- `TemplatePreviewService.ts:163` (`outputs/previews`)
- `fileService.ts:134-136` (previews, outputs, archives)
- `files.routes.ts:33` serves downloads out of `outputs`

The production image never contains these paths: the Dockerfile's runtime stage
copies only `dist`, `package.json` and `node_modules` (see
[[runtime-cwd-files-vs-docker-stage]], the same class of bug as IEX2-8). The
directories exist only because something creates them at runtime.

### The durability question — ANSWERED 2026-07-31

**Yes, these outputs are expected to survive, and the schema proves it.**

`run_generated_documents` (`shared/schema/run.ts:192`) durably persists
`fileName` and `fileUrl` per run, indexed by `runId`, and
`GET /api/runs/:runId/final-documents` lists them. A durable DB row pointing at
a file, plus a list endpoint and a per-run download endpoint, only makes sense
if later retrieval is expected.

So the failure mode is the worst available one: **the listing keeps working
while the download 404s.** Customers see their documents and cannot fetch them.
This is not a regression — it has behaved this way for as long as it has
shipped — but it is live.

Severity is *not* uniform across the two download routes, and the earlier
version of this ticket conflated them:

- `/api/files/download/:filename` is referenced only by
  `TemplateTestService.ts:101,104` (builder template test-renders) and by **no
  client code at all**. Same-session preview — genuinely low severity.
- The final-block per-run download is the customer path and the P1.

### The trap: `storageProvider` alone does not fix this

`DiskStorageProvider.ts:20` defaults its `baseDir` to
`path.join(process.cwd(), 'server', 'files')` — *the same ephemeral location* —
and `storage/index.ts:7` defaults `STORAGE_DRIVER` to `disk`.

Routing writes through `storageProvider` therefore fixes the **architecture**
(one storage mechanism instead of three) but changes **nothing** about
durability under the default driver. A dev who does only the refactor will see
every test pass and leave production exactly as broken.

**Decision (Shawn, 2026-07-31): target S3.** `S3StorageProvider` already exists
and the env surface is documented in `.env.example:108-110`. Both halves are in
scope for this ticket: the code unification *and* proving durability against a
non-disk driver.

### Preferred fix

1. Route durable run/final-block artifacts through `storageProvider` rather
   than `process.cwd()` paths — `FinalBlockRenderer.ts:141` first, since that is
   the customer path.
2. Keep local disk only for genuinely single-request temporaries (template test
   renders, previews), and comment each remaining local write with *why* it is
   allowed to be ephemeral.
3. Persist a storage **key** on `run_generated_documents` rather than relying on
   a filesystem path, and have the download route resolve it through
   `storageProvider`.
4. Fold in the authorization bug below.

Do **not** simply add a Railway volume — that fixes one deployment, keeps three
storage mechanisms, and does not survive multi-instance.

### Folded in: the download authorization lookup can never match

`files.routes.ts:62` looks up
`where: eq(runGeneratedDocuments.fileUrl, filename)` — matching a **bare
filename** against a column that stores a **full path**
(`/api/runs/:runId/final-documents/:filename/download`, written at
`RunLifecycleService.ts:479`). These can never be equal, so the authorization
lookup always fails and the route always 404s.

Confirm that before changing it — if it is genuinely dead surface, deleting the
route is a better outcome than repairing it, and TemplateTestService's two URL
builders (`:101,104`) must then be repointed or removed with it. Either way, do
not leave a route whose authorization check is structurally incapable of
succeeding.

### Ties

- Related: DEBT-6 removed the *second* file subsystem; this is the third.
- **File overlap:** none with DEBT-10/11/14. Safe to dispatch in parallel with
  any of them.
- Load `add-api-endpoint` (the download routes are authenticated surface),
  `db-schema-change` (adding a storage-key column to
  `run_generated_documents` needs a generated migration — never hand-author
  one), and `run-tests`.
- `.env.example:108-110` documents the S3 env surface. Do not commit
  credentials; the bucket is provisioned outside this ticket.

### Acceptance criteria

1. Durable run/final-block artifacts are written and read through
   `storageProvider`. No durable artifact is written to a `process.cwd()` path.
2. Every remaining local-disk write is single-request-temporary and carries a
   comment saying so.
3. `run_generated_documents` resolves its artifact through a storage key, via a
   migration generated by `npm run db:generate` (journal + snapshot in
   lockstep — do not hand-edit `_journal.json`). Bump the `_vN` token in
   `tests/helpers/schemaManager.ts` so cached test schemas pick it up.
4. The `files.routes.ts:62` authorization lookup either matches correctly and
   is covered by a test, or the route is deleted along with its
   `TemplateTestService` callers. Record which path you took and why.
5. An integration test proves a generated document is still retrievable through
   the normal per-run download path **after the local working directory is
   gone** — e.g. against a non-disk driver or with the local dir removed
   between write and read. A test that only round-trips through the disk driver
   in one process does not satisfy this.
6. Gates: `type-check` 0, `lint` 0, `check:strict-zones` passed, `test:fast` ≥
   baseline, document-generation integration suites green.
7. Because the default driver stays `disk`, state explicitly in your turn-in
   what must be set in Railway (`STORAGE_DRIVER`, bucket, credentials) for this
   fix to take effect in production. The code change alone does not close the
   customer-facing bug.

---

## DEBT-16 — `propagateRename` swallows errors inside a caller's transaction ✅

> **✅ VERIFIED AND COMMITTED 2026-07-31.** Clean turn-in — no reviewer fixes.
>
> **AC 1 — atomic, and said so.** All six per-phase `try/catch` blocks are gone
> from `propagateRename`, `renameStepVisibleIf` and `renameSectionVisibleIf`,
> and the chosen model is stated in a doc comment on the method with the
> reasoning: Postgres aborts the transaction on any statement error anyway, so
> catching only hid that the step update it ran alongside would never commit.
>
> **Accepted deviation, and the dev was right.** The ticket scoped only
> `AliasRenameService.ts`, but `StepService.handleAliasRenamePropagation` had
> the identical catch-inside-a-transaction shape. Fixing one and not the other
> would have moved the bug up a frame rather than killing it — the outer catch
> would have swallowed the newly-thrown error and `updateStepById` would still
> resolve with a payload for a transaction that cannot commit. Reviewer
> confirmed against `5ae7fde3` that DEBT-14 did modify that method. Proceeding
> without asking was correct: the judgment call the ticket reserved (atomic vs
> best-effort) was unchanged; this was a consequence of it.
>
> **AC 2 — mutation-proved by the reviewer, not just run.** The new
> `StepService.db.test.ts` case forces a rejection in the first propagation
> phase, asserts `updateStepById` rejects, then re-reads the row and asserts
> the alias rolled back. Restoring the swallow makes it fail with
> `promise resolved "{ …(17) }" instead of rejecting` — it discriminates on
> exactly the defect.
>
> **Behaviour-change risk checked.** Propagation failures are now fatal to a
> rename where they were previously swallowed. `renameAliasInExpression`
> (`shared/conditionEvaluator.ts:138`) already returns malformed expressions
> untouched rather than throwing, so the only remaining way to fail is a
> genuine query error — precisely when the rollback is wanted. No orphans:
> `log` is still used at `:197`, and the `Logger` import and `stepId` param
> were removed with the catches that used them.
>
> **Gates, all reviewer-run after merging `main`:** type-check 0 · lint 0 ·
> `test:fast` **157 files / 2061 tests** (baseline) · `creation-routes.test.ts`
> **38/38** whole-file · `StepService.db.test.ts` **6/6**.
>
> *(The turn-in quoted baseline 156/2059; that was a stale base. Re-measured at
> 157/2061 after merging `main`, which matches.)*

**Priority: P2** · Size: S · Files: `server/services/AliasRenameService.ts`

*Filed by the reviewer 2026-07-31 while passing DEBT-14. Pre-existing error
handling that DEBT-14's fix made unsafe — not a defect the dev introduced.*

### Finding

`AliasRenameService.propagateRename` wraps each propagation phase in its own
`try/catch` that logs and continues — transform blocks at `:135`, document
hooks at `:149`, lifecycle hooks at `:163`, section/step loading at `:180`,
Final Block mappings at `:194`, plus `renameStepVisibleIf` and
`renameSectionVisibleIf`.

That was safe while these queries ran on the pool: a failed propagation was
non-fatal and the step update still committed. After DEBT-14 they run inside
the caller's transaction, where the semantics are different — Postgres aborts
the whole transaction on any statement error, so every subsequent statement
fails with `current transaction is aborted`, each catch swallows it, and the
method returns a success-shaped `AliasRenameResult` for a transaction that can
never commit.

The user-visible effect: the logs say "Failed to propagate alias rename" while
the step edit that triggered it silently disappears. Rare — it needs a query to
actually error — but the failure is silent and the result object lies.

### Preferred fix

Decide explicitly whether propagation is best-effort or part of the atomic
unit, and make the code say so:

- If atomic (preferred, and what the transaction implies): let errors
  propagate so the whole update rolls back honestly, and drop the per-phase
  catches.
- If best-effort: run propagation *outside* the caller's transaction, after it
  commits — which reintroduces the pool query DEBT-14 removed, so this only
  works if it is genuinely deferred.

Do not keep catch-and-continue inside the transaction; that combination cannot
be correct either way.

### Ties

- Caused by: DEBT-14 (`5ae7fde3`), which threaded `tx` through this method.
- Same defect class as [[systemstats-tx-deadlock]].
- **File overlap:** `AliasRenameService.ts` — sequence after DEBT-14 (already
  landed). No overlap with DEBT-10/11/15.
- Load `run-tests`; `creation-routes.test.ts` is the integration file that
  exercises this path.

### Acceptance criteria

1. `propagateRename` no longer both runs inside the caller's transaction and
   swallows query errors. State which of the two models above you chose and
   why, in a comment at the method.
2. A test proves the chosen semantics: if atomic, that a failing propagation
   query rolls back the originating step update; if deferred, that a failing
   propagation leaves the committed step update intact.
3. `creation-routes.test.ts` still passes 38/38 as a whole file.
4. Gates: `type-check` 0, `lint` 0, `test:fast` ≥ baseline.

---

## DEBT-14 — `creation-routes.test.ts` fails 18 tests only when the whole file runs ✅

> **✅ VERIFIED AND COMMITTED 2026-07-31.** Fixed in `server/services/`, not in
> the test file — the ticket's guess that this was test-isolation debt was
> wrong, and the dev correctly ignored it.
>
> **Root cause.** Renaming an implicitly aliased step in `QA-SEC` made
> `StepService.updateStepById` call `AliasRenameService.propagateRename` from
> inside an open transaction, but propagation queried the global `db` pool.
> The test pool is pinned to one connection for schema isolation, so
> propagation waited for a connection the transaction itself was holding. The
> run timed out and leaked the connection, failing the 18 tests that came
> after. Same defect class as the SystemStats deadlock.
>
> **Fix.** The caller's `DbTransaction` is threaded from `updateStepById`
> through `handleAliasRenamePropagation` into `propagateRename` and on to every
> repository call it makes. Reviewer verified each receiving signature really
> takes `tx` in that position — notably
> `findBySectionIds(sectionIds, tx?, includeVirtual)`, where a positional slip
> would have silently bound `includeVirtual`. One caller exists; it threads
> `tx`.
>
> **Gates (reviewer-run, not taken on report).** `creation-routes.test.ts`
> 38/38 in 14.4s; `test:fast` 156 files / 2059 tests; `tsc` 0; lint 0.
>
> **Follow-up filed as DEBT-16** — `propagateRename`'s per-phase `try/catch`
> predates this change and now swallows errors inside the caller's
> transaction, which is no longer safe. See that ticket.

**Priority: P2** · Size: M · Files: `tests/integration/creation-routes.test.ts`

*Filed by the reviewer 2026-07-31 while clearing DEBT-3b. Not a product bug —
the endpoints are fine. This is a test-isolation defect that has been poisoning
every full integration run.*

> **Refs re-verified 2026-07-31 against the dispatch base — all exact:**
> `setupIntegrationTest` in the single `beforeAll` at `:40`, `aggregate size
> caps (ICW-11)` at `:247`, `POST /api/steps/:id/duplicate` at `:630`,
> `POST /api/sections/:id/duplicate` at `:719`.
>
> **Baselines: `test:fast` 155 files / 2053 tests; portability `unit-db` 7 / 74;
> portability integration 3 / 25.**
>
> **Use a dedicated database.** A reviewer Postgres is already running on
> **5435** (`ezbuildr-review-db`); point `TEST_DATABASE_URL` at it, or start
> your own. Do **not** use the shared 5434 instance — schema names are per
> *worker*, not per process, so any concurrent run corrupts yours and produces
> dozens of unrelated failures. That is what disguised this defect for two full
> suite runs.
>
> ⚠️ **Reproducing costs ~21 minutes per full-file run.** Do not iterate that
> way. The duplicate blocks pass alone in ~13s, so bisect by adding preceding
> describes until they break — that keeps each cycle short.

### Finding

Running the full `integration` project, this file fails **18 of 38 tests**, all
of them in the two `duplicate` describe blocks (`:630` steps, `:719` sections),
and the file takes **~1270 seconds** — roughly 33s per failing test, the shape
of request timeouts rather than assertion failures.

**The same tests pass in isolation.** Verified on a dedicated, empty Postgres
with nothing else running:

- `-t "returns 404 for a nonexistent section"` → **1 passed**, 9.3s.
- `-t "ICW2-B5"` (both duplicate blocks, 10 tests) → **10 passed**, 12.8s.

**It is deterministic and it is on `main`.** Two runs of the whole file, each on
its own private empty Postgres, differing only in whether an unrelated change
was present:

| Tree | Database | Result | Duration |
|---|---|---|---|
| clean `main` (`2aa03bd2`) | 5436 | **18 failed / 20 passed** | 1273.59s |
| `main` + DEBT-3b | 5435 | **18 failed / 20 passed** | 1273.96s |

Same count, same tests, durations within half a second. So this is not
contention, not database state, and not caused by any in-flight work — it
reproduces on clean `main` on demand, which also makes it cheap to bisect.

So the endpoints work. Something earlier in the file leaves state that makes the
last two describes hang. The file has a single `setupIntegrationTest` in one
`beforeAll` (`:39`), so it is not a per-describe server leak. A prime suspect is
the `aggregate size caps (ICW-11)` block at `:247`, which mutates the shared
`LIMITS.MAX_SECTIONS_PER_WORKFLOW` / `MAX_STEPS_PER_WORKFLOW` globals and
restores them in `afterEach` — a leak there would make later duplicate calls hit
a cap of 3 — but that is a hypothesis, not a diagnosis.

### Why this matters more than 18 tests

**It has been masking real signal.** Two full integration runs during the DEBT-3b
review failed with *different* files each time, which read as database
contention — and some of it was. This file is not contention: it reproduces on a
private database with nothing else running. As long as it fails, no full
integration run can be trusted, and the reviewer discipline of "run the whole
suite before committing" is unusable.

### Preferred fix

Find what leaks, do not paper over it. Bisect by running progressively more of
the file — the duplicate blocks pass alone, so add preceding describes until
they start failing, and the last one added is the culprit. Then fix the leak at
its source rather than reordering tests or adding retries.

Capture the **actual error** from a failing run first: a filtered
`Select-String` on the output hides it, which is why this went undiagnosed
through two full-suite runs. Report what the failing requests actually return.

### Ties

- Load `run-tests`. Use a dedicated database (see below) so contention cannot be
  confused with the defect.
- Related: `concurrent-test-runs-share-one-db` — schema names are per *worker*,
  not per process, so any two DB-backed runs collide. There are now reviewer
  Postgres instances on **5435** and **5436** for exactly this.

### Acceptance criteria

1. The root cause is named with evidence — which earlier describe leaks what.
2. `npm run test:integration -- tests/integration/creation-routes.test.ts` runs
   **38 passed** in a time comparable to the ~13s the duplicate blocks take
   alone, not ~1270s.
3. The fix is at the source of the leak; no test reordering, retries, or
   increased timeouts as the remedy.
4. A full `npm run test:integration` completes green on a dedicated database.
5. Gates: type-check 0, lint 0, `check:strict-zones` passed.

---

**Priority: P1** · Size: S · Files: `tests/unit/collab.server.test.ts`

*Split from the original DEBT-3 on 2026-07-30.*

### Finding

`tests/unit/collab.server.test.ts:97` — `should sync document updates between
two clients` connects two WebSocket clients, waits 1s, and closes them. Its own
comment: *"Full Yjs protocol integration would be needed for complete test."*
**Real-time collaboration sync is currently untested**, which also means the
pending `yjs` bump in DEBT-10 has no safety net.

### Preferred fix

Drive the Yjs handshake properly — apply an update on client A and assert
client B's `Y.Doc` converges, with a bounded wait on a condition rather than a
fixed `setTimeout`.

### Ties

- **Sequence after DEBT-2, or accept a collision.** The server this test
  drives, `server/realtime/collabServer.ts`, carries a blanket file-level
  `eslint-disable` header and is therefore in DEBT-2's path. The test file
  itself has no header, so if the fix stays purely in the test, the conflict
  is avoidable — but any server-side change will collide.
- **DEBT-10** wants this landed first for the `yjs` bump.
- Load `run-tests` — this one is in the `unit` project.

### Acceptance criteria

1. The test is un-skipped and asserts document convergence between two
   clients, not merely that both sockets are `OPEN`.
2. No fixed-duration `setTimeout` as the synchronization primitive.
3. `vitest/expect-expect` passes without a suppression.
4. Gates: type-check 0 errors, lint 0 problems, `npm run test:unit` green.

---

## DEBT-6 — Two parallel file subsystems ✅

> **✅ VERIFIED AND COMMITTED 2026-07-31 — `058530b0`.** Gates re-run by the
> reviewer on a dedicated database: type-check 0 · lint 0 ·
> `check:strict-zones` passed · `test:fast` **155 files / 2053 tests** ·
> portability `unit-db` **7 files / 71 tests** · portability integration
> **3 / 24**.
>
> **The dev's headline claim was true and I verified it independently: no
> migration accompanies this, and that is correct rather than an omission.**
> `files` and `file_context` appear in **no migration at all**, so Drizzle never
> tracked the table and `db:generate` genuinely has nothing to emit. The table
> only ever existed in dev databases built with `db:push`; anything built from
> migrations — including production — never had it. AC 2's "with a migration"
> was unsatisfiable as written.
>
> ### Two reviewer interventions
>
> 1. **Their base was stale and `entityGraph.ts` overlapped with IEX2-14** —
>    exactly the hazard the ticket warned about. Their `git merge main --ff-only`
>    reported "Already up to date", which was true when they ran it and false by
>    hand-in; main had since gained IEX2-14. **Staging their file as-is would
>    have silently deleted IEX2-14's `scanPaths` with no conflict.** Rebased
>    instead, then verified both changes survived: `scanPaths` intact at
>    `:66`/`:76`/`:96`, `files` gone from `EXCLUDED_TABLES`.
> 2. **They left an untracked `migrations/meta/0006_snapshot.json`** from the
>    `db:generate` run. The journal has 6 entries (0000–0005), so that snapshot
>    is an orphan — and a stray snapshot is what corrupts the *next*
>    `db:generate`. Removed. Note `intake-removal` is concurrently authoring a
>    real `0006`, which is why this mattered.
>
> **AC 3 verified rather than assumed:** `schemaCoverage.test.ts:103-112`
> actively asserts `EXCLUDED_TABLES` never names a table that no longer exists,
> so leaving that entry in would have failed the suite. Real coverage, which the
> turn-in never mentioned. Also confirmed `shared/schema/files.ts` held only
> files-related exports, so deleting it wholesale was right.
>
> **Filed separately, deliberately not bundled:** `files.routes.ts:33` serves
> generated documents from the raw container filesystem, which is ephemeral on
> Railway. That is a live durability question, not dead-code cleanup.

**Priority: P2** · Size: **M** (was L) · Files:
`server/services/FileStorageService.ts`, `shared/schema/files.ts`,
`server/repositories/index.ts`, a migration

> ### ⚠️ Re-scoped 2026-07-31 — the premise was wrong, and this is now much smaller
>
> **There are not two competing file subsystems. There is one live subsystem and
> one that is entirely dead code.** Verified against `4ea5f6fd`:
>
> - **Nothing anywhere inserts, updates, reads or selects the `files` table.**
>   `git grep "insert(files\|from(files\|update(files\|schema.files"` over
>   `server/`, `tests/` and `scripts/` returns **no matches at all**.
> - **`fileStorageService` is imported by nobody.** The singleton is exported at
>   `FileStorageService.ts:224`; the only other file in the repo mentioning it
>   is `entityGraph.ts`, and only inside a *comment* plus an `EXCLUDED_TABLES`
>   entry that deliberately keeps `files` out of export bundles.
> - **`FileRepository` was already deleted.** `server/repositories/FileRepository.ts`
>   does not exist and its export is commented out at
>   `server/repositories/index.ts:19`.
> - `storageProvider` has **seven** consumers and is the real subsystem:
>   `TemplatePreviewService`, `TemplateVersionService`, `templates`,
>   `templateFiles`, portability `ImportService` and `blobs`, plus
>   `storage/index.ts`.
>
> So the "unification" this ticket was written to design does not need
> designing. There is nothing to unify and nothing to migrate — and per the
> project-wide confirmation that the database holds only test data with zero
> dependencies on existing rows, there are no `files` rows to preserve either.
>
> **The original AC 1 (a written proposal approved before implementation) is
> hereby satisfied by this block.** Shawn's remaining decision is the one in
> "Decision required" below; everything after it is ordinary deletion work.
>
> **Do not** attempt to make `FileStorageService` the surviving subsystem, and
> do not port its quota/virus-scanning ideas into `storageProvider` as part of
> this ticket. Those are real gaps but they are separate work — this ticket is
> removal only.

### Decision — DELETE, approved by Shawn 2026-07-31

✅ **Shawn approved deletion on 2026-07-31 when dispatching this ticket. The
blocking question is closed — do not stop to re-ask it, and do not implement the
"keep it" branch.** The reasoning that was put to him is preserved below.

**Delete the dead subsystem (recommended), or keep it?** Recommended: delete.
It has never been wired up, `FileRepository` was already removed, and leaving
it costs a recurring tax — the IEX audit had to warn dispatched devs off it
precisely because it is the obvious-looking API and the wrong one. That warning
is the only thing this code has ever done.

The counter-case is that `files` is a more principled design than bare
`fileRef` strings — it has `storageKey`, `provider`, `size` and a
`file_context` enum, which is what you would want if quota accounting or
retention ever became real. Keeping it means keeping a table nothing writes,
on the chance it is revived. **Deleting does not foreclose that:** the schema
is recoverable from git history, and rebuilding it against a real requirement
would be better than reviving a shape guessed at in advance.

### Preferred fix (once the delete is confirmed)

1. Delete `server/services/FileStorageService.ts` (201 lines) and its
   `UploadResult` interface.
2. Drop the `files` table and the `file_context` enum from
   `shared/schema/files.ts`, plus a generated migration. **Author it with
   `npm run db:generate` — never hand-edit the journal** (see
   `db-schema-change`).
3. Remove the commented-out `FileRepository` export line at
   `server/repositories/index.ts:19` and the stale comment at `:12`.
4. Update `entityGraph.ts`'s `EXCLUDED_TABLES` entry for `files` — the table
   will no longer exist, so an exclusion referencing it is misleading. Check
   whether `EXCLUDED_TABLES` is asserted against the live schema by
   `schemaCoverage.test.ts`; if it is, that test is the one that will catch
   this and it must stay green.

### Ties

- **No longer sequenced after DEBT-5.** That dependency existed because both
  touched a shared live path; with this reduced to deleting dead code, the only
  overlap is `entityGraph.ts`.
- ⚠️ **`entityGraph.ts` is shared with IEX2-14, which is in flight right now.**
  These were dispatched in parallel deliberately. The regions differ — IEX2-14
  works the descriptors' `redactPaths`/`scanPaths` near the top of the file,
  this ticket touches only the `EXCLUDED_TABLES` entry for `files` near the
  bottom — so a clean merge is expected but not guaranteed. **Do
  `entityGraph.ts` last**, and `git merge main --ff-only` immediately before you
  hand the work in so whichever ticket lands second sees the other's edit.
- Load `db-schema-change` (a table drop is still a migration) and `run-tests`.
- Related: [[runtime-cwd-files-vs-docker-stage]] is *not* in play here; this
  code path never ran at all.

### Acceptance criteria

1. `git grep -n "FileStorageService\|fileStorageService"` returns **no matches
   outside git history** — including the `entityGraph.ts` comment.
2. The `files` table and `file_context` enum are gone from
   `shared/schema/files.ts`, with a migration generated by `npm run db:generate`
   that applies cleanly against a fresh test database.
3. `schemaCoverage.test.ts` (or whichever test asserts `ENTITY_GRAPH` /
   `EXCLUDED_TABLES` against the live schema) is green **and** was confirmed to
   actually cover the removed table — if it does not reference `files` at all,
   say so rather than claiming coverage.
4. Portability export and import still round-trip: portability `unit-db` and
   the portability integration suites green at or above baseline.
5. Gates: type-check 0, lint 0, `check:strict-zones` passed, `test:fast` ≥
   baseline. **Note `npm run type-check` is not the commit gate** — run
   `npx tsx scripts/pre-commit-checks.ts` with the work staged.

### Follow-up spotted while scoping this — not part of DEBT-6

`server/routes/files.routes.ts:33` serves generated documents from
`path.join(process.cwd(), 'server', 'files', 'outputs')` — the **raw container
filesystem**, which is a third storage path and is ephemeral on Railway. Any
generated document written there does not survive a redeploy. That deserves its
own ticket; it is a live durability question, not a dead-code cleanup, and it
should not be bundled into this one.

---

## DEBT-10 — 10 dependabot PRs open since 2026-07-11 🔄 1 of 10 done

> **Progress 2026-07-31 — read this before picking the ticket up.**
>
> **#129 (`actions/github-script` 7→9) is merged** (`f9a66690`) and is fine.
> **#130–#138 remain open.**
>
> The first dev correctly stopped on a red post-merge run. That red was **not
> caused by #129** — two unrelated faults were failing Deployment Safety Check,
> and `main` was already red for every push including two feature merges. Both
> are now fixed (`eaede9a6`, `4aad6e00`) and **`main` is fully green at
> `4aad6e00`**. You are not inheriting a broken tree.
>
> What broke, because it will shape how you read your own CI runs:
>
> 1. **gitleaks scans commit history, not the diff.** Merging a three-week-old
>    dependabot branch widened the ancestry and pulled in two findings from a
>    2026-07-28 commit — fixtures in
>    `tests/unit/portability/secretScanner.test.ts`, the test for our own secret
>    scanner. Fingerprints are now in `.gitleaksignore`. **Diagnose a gitleaks
>    failure by the finding's commit date, not by what you just merged.**
> 2. **`npm run lint` is `--max-warnings 0` repo-wide.** A stray warning
>    anywhere fails CI, and `npx eslint <changed files>` exits 0 on those same
>    warnings. Run the script, not a file list.
>
> **#130 is `gitleaks/gitleaks-action` 2→3** — a major bump to the exact action
> that just broke CI. Treat its post-merge run as the highest-risk step in this
> ticket. If v3 changes ignore-file handling, `.gitleaksignore` may stop being
> honoured and the secretScanner fixtures will surface again; that is a config
> fix, not a reason to delete the fixtures or weaken the scan.

**Original ticket follows.**

**Priority: P2** · Size: S · Files: `package.json`, `.github/workflows/*`

### Finding

Ten dependabot PRs (#129–#138) have been open since 2026-07-11 — over two
weeks. **Five** are GitHub Actions major-version bumps (`checkout` 3→7,
`setup-node` 3→6, `upload-artifact` 4→7, `github-script` 7→9,
`gitleaks-action` 2→3) and **five** are npm packages (`yjs` 13.6.28→13.6.31,
`autoprefixer`, `@radix-ui/react-toast`, `@radix-ui/react-context-menu`,
`@tailwindcss/typography`). *(The original text said six and four; corrected
2026-07-31 against the live PR list.)*

Action bumps that far behind eventually become forced work when GitHub retires
the old runner images, and `yjs` underpins real-time collaboration.

### Preferred fix

Triage in two batches, not one merge queue. GitHub Actions bumps first — they
are major versions and can break CI, so land them one at a time and confirm CI
is green after each. Then the npm bumps, with the full suite run against `yjs`
specifically since collaboration is the least-tested area (see **DEBT-3**).

Close, with a reason, anything not wanted rather than leaving it open.

### Ties

- **DEBT-3b is now closed** (`8dfdee82`, 2026-07-31), so the collab sync test is
  restored and `tests/integration/collab.sync.test.ts` exists. The `yjs` bump
  finally has a safety net — run that file specifically against the bump. The
  earlier advice to land DEBT-3 first is satisfied; do not wait on anything.
- **Re-verified 2026-07-31:** all ten PRs (#129–#138) are still open, unchanged
  since 2026-07-11. Five are GitHub Actions bumps (`checkout` 3→7,
  `setup-node` 3→6, `upload-artifact` 4→7, `github-script` 7→9,
  `gitleaks-action` 2→3) and five are npm (`yjs`, `autoprefixer`,
  `@radix-ui/react-toast`, `@radix-ui/react-context-menu`,
  `@tailwindcss/typography`).
- **File overlap:** none with DEBT-15 or DEBT-16 — this ticket lives in
  `package.json` / `package-lock.json` / `.github/workflows/`. Safe in parallel.
- Branch protection is currently **off**, so a red CI run will not block a
  merge. Read each run's result yourself rather than trusting the merge button.
- Load `run-tests`.

### Acceptance criteria

1. Every one of #129–#138 is merged or closed with a stated reason.
2. CI green after each Actions bump individually, not just at the end.
3. The `yjs` bump is verified against real-time collaboration behaviour, by
   test or by hand, with evidence attached.

---

## DEBT-13 — Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type ✅

> **DONE — implemented and verified by the reviewer 2026-07-31, `fec4dbe7`.**
> Not dispatched; the rescope reduced it below dispatch overhead.
>
> The read and the cast are gone; `conditions` is now unconditionally `null`,
> which is byte-for-byte what `metadata?.visibleIf ?? null` already produced for
> every row, so the change cannot alter runtime behaviour.
> `buildLegacyFinalBlockConfig` was retained as required.
>
> **Gates, all run by the reviewer:** type-check exit 0 · lint exit 0
> (`npm run lint`) · `test:fast` **153 files / 2047 tests** (exactly baseline) ·
> `docs.autogeneration` + `runner-hardening-run13` **9/9 green**.
>
> **Mutation-proved.** Neutering `buildLegacyFinalBlockConfig` with an early
> `return null` turned **exactly one** `docs.autogeneration` test red in 13.8s —
> a genuine assertion failure, not a crash or hang, and the probe was confirmed
> present in the file before the run. The coverage claimed in AC 4 is real.
>
> ⚠️ **Process note for the next person:** `docs.autogeneration.test.ts` failed
> with a 300s hook timeout and 6 skipped tests when run in parallel with another
> integration file, then passed 6/6 alone under `VITEST_SINGLE_FORK=true`. That
> is the flake the `run-tests` skill warns about — not a regression. Re-run
> single-fork before believing an integration failure in this area.

**Priority: P3** · Size: S · Files:
`server/services/workflow-runs/RunLifecycleService.ts`

*Found during the DEBT-3a review, 2026-07-30. Not fixed there — DEBT-3a was
scoped to one test file.*

> **BLOCKING QUESTION ANSWERED 2026-07-31 — this is now dead-code removal, not
> a bug fix.** Shawn confirmed the database holds **only test data, with zero
> dependencies on any existing rows**. There are therefore no legacy
> `templates` rows carrying `metadata.visibleIf`, and the conditional-document
> defect described below **cannot be reached in practice**. The ticket dropped
> from P1? to P3 and the fix is now "delete the read", not "normalize the
> shape". Do **not** implement the normalization branch.
>
> Refs re-verified 2026-07-31 against `6745e6e1`: the `as` cast is at
> `RunLifecycleService.ts:566` exactly, `buildLegacyFinalBlockConfig` at `:536`.
> Worktree `.claude/worktrees/debt-13`. Baseline `test:fast` **153 files / 2047
> tests**.
>
> ⚠️ **Delete the `visibleIf` read only — do NOT delete the legacy path.**
> `buildLegacyFinalBlockConfig` stays. It handles legacy Final Documents
> sections (`config.finalBlock` + `config.templates`), **a shape
> `WorkflowService` still actively writes** (see `b508a60b`). Removing the
> function would break live document generation.

### Finding

`buildLegacyFinalBlockConfig` reads a template's `metadata.visibleIf` and
assigns it straight to a document's `conditions`
(`RunLifecycleService.ts:561-566`):

```ts
const metadata = template.metadata as { visibleIf?: unknown } | null;
documents.push({
  ...
  conditions: (metadata?.visibleIf ?? null) as FinalBlockConfig['documents'][number]['conditions'],
```

Those are **two different shapes**, and the `as` cast is what stops the
compiler from saying so:

- `conditions` is typed `LogicExpression` (`shared/types/stepConfigs.ts:567`) —
  `{ operator?, conditions: [{ key, op, value }] }`.
- `visibleIf` elsewhere in the app is a `ConditionGroup` —
  `{ type: 'group', operator, conditions: [{ type: 'condition', variable, operator, value }] }`.

`EnhancedDocumentEngine.evaluateConditions` (`EnhancedDocumentEngine.ts:493-517`)
reads `cond.key` and `cond.op` off each entry. Given a `ConditionGroup` those
are both `undefined`, so it builds a condition with no variable and no
operator and hands it to `evaluateConditionExpression`. A legacy Final
Documents section with a `visibleIf` would therefore gate on garbage — the
document silently always generates, or never does.

The now-deleted test fixture in `runtime-pipelines.test.ts` stored exactly the
`ConditionGroup` shape in `metadata.visibleIf`, which is weak evidence that
this is the shape that was really written at some point.

### Why this is dead code

**Nothing in the codebase writes `metadata.visibleIf`.** Verified 2026-07-31
two ways, beyond the original repo-wide grep:

- Across the **entire git history**, no commit touching any template service or
  repository file has ever written that key
  (`git log --all -S "visibleIf" -- "*emplate*.ts"` → no writer).
- In the **current tree** `metadata.visibleIf` appears in exactly two places:
  this reader, and a descriptive comment in
  `tests/integration/workflows/runtime-pipelines.test.ts:392`.

The only ever-evidence it was written was a since-deleted test fixture, which
this ticket already called weak. Combined with Shawn's confirmation that the DB
holds only test data, the read is unreachable.

(Note for anyone re-reading the original SQL: `DocumentTemplateRepository`
wraps the **`templates`** table — `super(templates, …)` at
`DocumentTemplateRepository.ts:21` — despite the repository's name. The old
query named the right table.)

### Preferred fix

Delete the read and the cast in `buildLegacyFinalBlockConfig`:

- Remove `const metadata = template.metadata as { visibleIf?: unknown } | null;`
  (`:561`).
- Replace the `conditions:` line (`:566`) with a plain `conditions: null` — no
  `as` cast. **This is behaviour-preserving by construction:** the existing
  expression is `metadata?.visibleIf ?? null`, which already evaluates to `null`
  for every row that lacks the key, and no row has it.
- Update the doc comment at `:528`, which currently claims `metadata.visibleIf`
  conditions "carry over".

If `conditions: null` does not satisfy the `FinalBlockConfig` type, fix it by
correcting the type or omitting the property — **not** by reintroducing a cast.
The cast is the entire point of this ticket; it is what hid a two-shape
mismatch from the compiler.

### Ties

- Surfaced by **DEBT-3a**, which proved the *modern* `'final'`-step path works
  correctly (`runtime-pipelines.test.ts`). This is the legacy sibling path only.
- Related: the same file's `'final'` step path at `RunLifecycleService.ts:410-418`
  reads `step.config` as an already-correct `FinalBlockConfig` — no cast, no bug.
- Load `run-tests`.

### Acceptance criteria

1. ✅ **Already satisfied** — the data question is answered and recorded in the
   banner above. Do not re-ask it.
2. Both the `as` cast (`:566`) and the `template.metadata` read (`:561`) are
   gone, and **no `as` cast is reintroduced anywhere in
   `buildLegacyFinalBlockConfig`**.
3. `git grep -n "metadata.visibleIf"` returns **no live reader** — only the
   comment in `runtime-pipelines.test.ts` (or nothing, if you tidy that too).
4. `buildLegacyFinalBlockConfig` **still exists and still resolves legacy
   sections.** The covering test already exists and has been located for you:
   **`tests/integration/docs.autogeneration.test.ts`**, which builds the exact
   legacy shape at `:286` (`config: { finalBlock: true, templates: [...] }`) and
   whose header comment scopes it to legacy sections. Run it and paste the
   actual output. `tests/integration/runner-hardening-run13.test.ts:117` builds
   the same shape and must also stay green.
   - This is the criterion that proves the deletion did not break live document
     generation, so it is the one to run first and the one a reviewer will
     re-run independently.
5. The doc comment at `:528` no longer claims `visibleIf` conditions carry over.
6. Gates: type-check 0 errors, lint 0 problems (`npm run lint`, not
   `npx eslint .`), `npm run test:fast` ≥ **153 files / 2047 tests**, and the
   document-generation integration suites green. Report each command's actual
   output, not a summary.

---

## DEBT-11 — RLS policies defined but not enforced 🔲 *tracked, not a fix*

**Not a ticket yet — a decision Shawn owns.** Recorded here so it stops living
only in migration comments.

`migrations/0001_enable_rls.sql` is explicit that this is deliberate:

> SAFE TO SHIP: RLS is bypassed for a table's OWNER and superusers unless FORCE
> mode is set. Prod connects to Neon as the table owner; CI/tests connect as the
> postgres superuser — so policies are **DEFINED but NOT ENFORCED** until a
> deliberate later step.

So tenant isolation currently rests entirely on service-layer `tenant_id`
scoping; the database-level backstop exists but is inert. That is a considered
posture, not an oversight — but it means the second line of defence is not
actually a line of defence, and the longer it stays that way the more code is
written assuming it will never be turned on.

Turning it on is a real project: it needs a non-owner role, a connection
strategy, and a test pass proving nothing breaks. See
`docs/architecture/TENANT_ISOLATION_RLS.md` (SEC-051).

**Next step:** a decision on whether enforcement is planned this quarter. If
yes, it becomes its own initiative with its own ticket file. If no, say so in
the docs so nobody mistakes the policies for active protection.

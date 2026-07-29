# Tech Debt — standing backlog (DEBT-1..10)

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
- **Watch the tsc cache.** Fixed in `647d1465` for new trees, but if you are in
  a worktree created before that commit, `rm -f .tsbuildinfo` (and
  `node_modules/typescript/tsbuildinfo`) before believing `type-check`.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Theme | Priority | Size | Status |
|---|---|---|---|---|
| DEBT-1 | Drain the 796 unused eslint-disable directives | P2 | L | 🔲 |
| DEBT-2 | Retire the 143 blanket file-level eslint-disable headers | P2 | L | 🔲 |
| DEBT-3 | Restore the three tests skipped for asserting nothing | P1 | M | 🔲 |
| DEBT-4 | E-signature provider registry is never initialized | P1 | S | 🔲 |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | P1 | S | 🔲 |
| DEBT-6 | Two parallel file subsystems | P2 | L | 🔲 |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | P1 | S | 🔲 |
| DEBT-8 | DI container is built but ~unused | P2 | M | 🔲 |
| DEBT-9 | `type-check` is advisory in CI | P2 | S | 🔲 |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | 🔲 |
| DEBT-11 | RLS policies defined but not enforced (decision, not a fix) | — | — | 🔲 tracked |

---

## DEBT-1 — Drain the 796 unused eslint-disable directives 🔲

**Priority: P2** · Size: L · Files: repo-wide

### Finding

`npx eslint . --ext .ts,.tsx --report-unused-disable-directives` reports **796**
unused directives (measured 2026-07-28). Each one is a suppression whose
underlying error no longer exists — so it suppresses nothing, and it teaches
the next reader that the rule is a problem here when it isn't.

This is not theoretical. During the IEX Phase 0 review a six-rule
`eslint-disable` header sat on a pure data file with **zero** violations
without it, and the same submission's `bundleWriter.ts` carried a
`no-unsafe-call` disable that was equally unnecessary. Both were copied from
surrounding style.

`f3eeab4a` stopped the bleeding: the pre-commit hook now runs eslint on staged
files with `--report-unused-disable-directives`, so no *new* dead suppression
can land. It does not clean the existing 796.

### Preferred fix

Drain in tranches by directory, not in one commit — a 796-line diff is
unreviewable and will collide with everything in flight. Suggested order,
smallest blast radius first: `shared/` → `server/repositories/` →
`server/services/` → `server/routes/` → `client/`.

For each tranche: run eslint with the flag, delete the reported directives,
re-run the full gates. A directive that turns out to be load-bearing means
the rule genuinely fires — fix the code rather than restoring the comment.

Do **not** add `--report-unused-disable-directives` to `npm run lint` until
the count is zero; the moment it is, that flip belongs in this ticket's final
commit so the debt cannot come back.

### Ties

- **DEBT-2** is the sibling problem and touches many of the same files.
  Sequence them: do DEBT-1 first, since deleting dead directives shrinks the
  surface DEBT-2 has to reason about.
- Enforcement mechanism: `scripts/pre-commit-checks.ts`.
- Load `run-tests`.

### Acceptance criteria

1. `npx eslint . --ext .ts,.tsx,.js,.jsx --report-unused-disable-directives`
   reports **0** unused directives.
2. `npm run lint` (i.e. `eslint . --max-warnings 0`) is still 0 problems.
3. No directive was removed by adding a different suppression in its place —
   the diff contains no net-new `eslint-disable`.
4. Work landed in reviewable tranches, one commit per directory tranche.
5. Final commit adds `--report-unused-disable-directives` to the `lint` script
   in `package.json`.
6. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline.

---

## DEBT-2 — Retire the 143 blanket file-level eslint-disable headers 🔲

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

Tranche this the same way as DEBT-1 and for the same reason.

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

## DEBT-3 — Restore the three tests skipped for asserting nothing 🔲

**Priority: P1** · Size: M · Files: `tests/unit/collab.server.test.ts`,
`tests/integration/workflows/runtime-pipelines.test.ts`

### Finding

Enabling `vitest/expect-expect` in `42996bcb` found six tests that passed while
asserting nothing. Three were deleted as genuinely worthless; **three describe
coverage worth having and were marked `.skip` rather than deleted**, so the
gap is honest instead of hidden. They are now real coverage holes:

1. `tests/unit/collab.server.test.ts` — `should sync document updates between
   two clients`. Connected two WebSocket clients, waited 1s, closed them. Its
   own comment: *"Full Yjs protocol integration would be needed for complete
   test."* **Real-time collaboration sync is currently untested.**
2. `tests/integration/workflows/runtime-pipelines.test.ts` — `should skip
   document generation when visibleIf condition is false`.
3. Same file — `should generate document when visibleIf condition is true`.
   Both inserted rows, deleted them, asserted nothing. Their comment:
   *"we can't easily test document generation without the actual template
   file."*

(2) and (3) matter most: `visibleIf`-gated document generation is a
customer-visible path, and document generation has already produced one live
production incident this quarter.

### Preferred fix

For (2) and (3): build a real template fixture. `tests/` already generates
DOCX fixtures elsewhere — find that helper and reuse it rather than committing
a binary. Then assert on `run_generated_documents` rows: exactly zero when the
`visibleIf` condition is false, exactly one when true.

For (1): drive the Yjs handshake properly — apply an update on client A and
assert client B's `Y.Doc` converges, with a bounded wait rather than a fixed
`setTimeout`.

If a fixture turns out to be genuinely impractical, that is a blocker to
report, not a reason to restore an assertion-free test.

### Ties

- Introduced by `42996bcb`; the guard that found them is
  `vitest/expect-expect` in `.eslintrc.json`.
- **Load `run-tests`** — `runtime-pipelines.test.ts` is in the `integration`
  project and `collab.server.test.ts` is in `unit`; they need different
  commands and different database setup.
- These are two independent files and may be worked in parallel.

### Acceptance criteria

1. All three tests are un-skipped and passing with real assertions.
2. The document-generation pair asserts on actual
   `run_generated_documents` rows for both the true and false `visibleIf`
   branch.
3. The collab test asserts document convergence between two clients, not
   merely that both sockets are `OPEN`.
4. No fixed-duration `setTimeout` is used as the synchronization primitive;
   wait on a condition with a timeout instead.
5. `vitest/expect-expect` passes on all three without a suppression.
6. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline,
   relevant `test:unit` / `test:integration` green.

---

## DEBT-4 — E-signature provider registry is never initialized 🔲

**Priority: P1** · Size: S · File: `server/services/esign/index.ts`

### Finding

`initializeEsignProviders()` is defined at `server/services/esign/index.ts:47`
and **called from nowhere**. Repo-wide grep returns exactly one hit — the
definition itself. The provider registry is therefore unconditionally empty at
runtime, so every e-signature code path resolves no provider.

This means the e-signature feature is not "partially working", it is inert,
and no test covers the gap.

### Preferred fix

First **establish whether e-signature is meant to be live.** If it is not,
the honest fix is to say so in `docs/claude/FEATURES.md` and leave the code
dormant — this is a documentation-accuracy problem, and this repo has already
had to correct false capability claims once (`DOCH-2`, commit `999d9005`).

If it is meant to be live: call `initializeEsignProviders()` during server
startup alongside the other registry initializations, and add a test asserting
the registry is non-empty after boot so it cannot silently regress again.

Do not wire it up without checking — see the Ties.

### Ties

- Related known breakage: per the project's own notes, e-signature has
  **three independent breaks**, not just this one. Re-verify the others before
  declaring the feature working.
- Docs to correct either way: `docs/guides/ESIGNATURE_INTEGRATION.md`,
  `docs/claude/FEATURES.md`.
- Load `add-api-endpoint` if any service or route changes.

### Acceptance criteria

1. A decision is recorded in the ticket: feature is live, or feature is
   dormant.
2. If live: `initializeEsignProviders()` is called at startup, and a test
   asserts the registry is non-empty after initialization.
3. If dormant: `docs/claude/FEATURES.md` states the true status, and no code
   claims otherwise.
4. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline.

---

## DEBT-5 — `getTemplateFilePath` hardcodes disk storage 🔲

**Priority: P1** · Size: S · File: `server/services/templateFiles.ts:17`

### Finding

```ts
export function getTemplateFilePath(fileRef: string): string {
  // Legacy support: We assume disk storage provider structure for now.
  return path.join(process.cwd(), 'server', 'files', fileRef);
}
```

The function builds a local filesystem path unconditionally and says so. It is
correct only while `STORAGE_DRIVER` selects the disk provider; the moment
production moves to S3 it returns a path to a file that does not exist, and the
failure will surface as a missing template at document-generation time — the
least convenient possible place.

### Preferred fix

Route through the storage abstraction instead: `server/services/storage/`
exposes `getFile(fileRef): Promise<Buffer>` (`types.ts:50`) and
`exists(fileRef)` (`types.ts:44`).

Callers that genuinely need a *path* rather than bytes (e.g. handing a file to
a subprocess) should spool the buffer to a temp file and clean it up, rather
than assuming the bytes are already local. Audit every caller before changing
the signature — some may want bytes and be using the path only to read them.

### Ties

- **DEBT-6** is the wider version of this problem; this ticket is the
  narrow, high-value slice and should land first.
- Storage interface: `server/services/storage/types.ts`.
- Load `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `getTemplateFilePath` either goes through `storageProvider`, or is deleted
   in favour of callers using `getFile`/`exists` directly.
2. Every existing caller is updated and none assumes a local path.
3. A test proves template resolution works against a non-disk provider (a stub
   provider is fine — no S3 credentials in tests).
4. `grep -rn "process.cwd(), 'server', 'files'" server/` returns no matches.
5. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline,
   `npm run test:unit` green.

---

## DEBT-6 — Two parallel file subsystems 🔲

**Priority: P2** · Size: L · Files: `server/services/FileStorageService.ts`,
`server/services/storage/*`, `shared/schema/files.ts`

### Finding

The app has **two independent file subsystems** that do not know about each
other:

1. The `files` table (`shared/schema/files.ts:28`) plus `FileStorageService`,
   with its own `storageKey` / `provider` columns.
2. `storageProvider` (`server/services/storage/index.ts`) addressed by bare
   `fileRef` strings, with no database row at all — this is where template
   binaries live.

The split is a live source of error. The IEX audit had to warn dispatched devs
explicitly not to reach for `FileStorageService` when handling template bytes,
because the obvious-looking API is the wrong one. Storage quota accounting,
virus scanning, and cleanup all have to be implemented twice or silently apply
to only one half.

### Preferred fix

Design work before code. Produce a short proposal covering: which subsystem
survives, how existing `fileRef` values migrate, what happens to quota
accounting, and whether a database row becomes mandatory for every stored
object. Bring that to Shawn before implementing — this is a Size L change with
a migration, and picking the wrong direction is expensive.

### Ties

- **Sequence after DEBT-5**, which removes the worst individual symptom.
- Load `db-schema-change` — any unification needs a migration.
- Context: the IEX initiative's Phase 1 notes on why template bytes are not in
  the `files` table.

### Acceptance criteria

1. A written proposal exists and has been approved by Shawn **before** any
   implementation commit.
2. (Post-approval criteria to be written into this ticket once the direction
   is chosen — do not implement against a guess.)

---

## DEBT-7 — `WorkflowClonerService` silently drops `workflows.settings` 🔲

**Priority: P1** · Size: S · File: `server/services/WorkflowClonerService.ts`

### Finding

`workflows.settings` is `jsonb("settings").default('{}').notNull()`
(`shared/schema/workflow.ts`), and the cloner's workflow insert never mentions
it — `grep -c "settings" server/services/WorkflowClonerService.ts` returns
**0**.

Every enumerated column is copied by hand at the insert site, so an omission is
invisible: the clone succeeds, the column takes its `'{}'` default, and the
copied workflow quietly loses whatever configuration `settings` held. Because
the column is `notNull` with a default, nothing errors.

Found while deriving the portability entity graph from the cloner's insert
sites. It is a latent bug in the cloner, not in the portability work — the
portability graph reproduces the omission faithfully and will need updating
alongside this fix.

### Preferred fix

Determine what `settings` actually holds and whether it is safe to carry across
a clone (some fields may be intentionally reset, the way `publicLink`, `slug`
and `status` deliberately are). Then either copy it, or leave it out **with a
comment stating the reason** so the next reader does not have to re-derive it.

Whichever way it goes, add `settings` to the `workflows` descriptor's `fields`
in `server/services/portability/entityGraph.ts` if it is portable, so the two
do not drift.

### Ties

- Touches `entityGraph.ts`, which the IEX initiative also edits — check for
  in-flight IEX work before dispatching, and sequence behind it if any.
- Donor context for deliberate omissions: the cloner already resets
  `publicLink: null`, `slug: null`, `status: "draft"` on purpose.
- Load `run-tests`.

### Acceptance criteria

1. A test asserts the intended behaviour of `settings` across
   `copyWorkflow` — either preserved, or reset with the reason documented.
2. If preserved, `settings` appears in the `workflows` descriptor's `fields` in
   `entityGraph.ts`.
3. If deliberately omitted, a comment at the insert site states why.
4. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline,
   `npm run test:unit` green.

---

## DEBT-8 — DI container is built but ~unused 🔲

**Priority: P2** · Size: M · Files: `server/di/*`

### Finding

`server/di/` contains a full container implementation — `container.ts`,
`registrations.ts`, `tokens.ts`, `index.ts` — and the entire server resolves
from it in **5 places** (`grep -rn "container.resolve\|container.get" server/`).
Everything else uses singletons. `CLAUDE.md` already concedes the state:
*"only partially adopted — prefer singletons."*

So the codebase carries a second, competing wiring mechanism that a new
contributor must learn, understand is not the real one, and then not use.
`tokens.ts` in particular has to be kept in sync with service types for no
runtime benefit.

### Preferred fix

Pick a direction and commit to it. The cheap, honest option is **removal**:
delete `server/di/`, convert the 5 call sites to the singletons everything else
uses, and drop the "partially adopted" line from `CLAUDE.md`.

Full adoption is the alternative but is a much larger change and should be
argued for explicitly, not drifted into.

Recommend removal unless there is a concrete plan to finish adoption.

### Ties

- `CLAUDE.md` "Directory Structure" and "Key Conventions" both mention it and
  must be updated either way.
- Load `add-api-endpoint` (service wiring conventions).

### Acceptance criteria

1. A decision is recorded: remove, or adopt.
2. If removed: `server/di/` is deleted, all 5 call sites use singletons, and
   `grep -rn "server/di" server/ client/ shared/` returns no matches.
3. `CLAUDE.md` no longer describes a half-adopted container.
4. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline.

---

## DEBT-9 — `type-check` is advisory in CI 🔲

**Priority: P2** · Size: S · File: `.github/workflows/ci.yml`

### Finding

CI does not gate on TypeScript. From `.github/workflows/ci.yml:10`:

```yaml
# Quality gates. Full-project `tsc` still carries known migration/debt backlog
# (see docs/TYPESCRIPT_STRICT_MODE_MIGRATION.md), so type-check remains
# advisory. Repo-wide eslint is blocking again now that the backlog is clean.
```

The comment was accurate when written. **It may no longer be:** `npm run
type-check` was clean on `main` at 0 errors on 2026-07-28. If the backlog is
in fact drained, the only thing standing between a type error and production is
the pre-commit hook on one developer's machine — and `main` auto-deploys to
production with no staging gate.

### Preferred fix

Verify `type-check` is genuinely 0 errors on a clean checkout of `main` (not a
worktree, and not against a stale `.tsbuildinfo`). If it is, promote the step
to blocking and update the comment. If it is not, record the real remaining
count in the comment so the next reader is not misled.

### Ties

- Related: `docs/TYPESCRIPT_STRICT_MODE_MIGRATION.md`.
- Interacts with **DEBT-1/DEBT-2** — draining suppressions can surface type
  errors, so re-measure after those land if they are in flight.
- Branch protection is currently off, which is a separate but compounding gap.

### Acceptance criteria

1. `npm run type-check` verified on a clean clone of `main` and the result
   recorded in the ticket.
2. If 0 errors: the CI step is blocking and the stale comment is corrected.
3. If non-zero: the exact count and the plan are written into the comment.
4. A deliberately introduced type error fails CI (verified on a scratch
   branch, then reverted).

---

## DEBT-10 — 10 dependabot PRs open since 2026-07-11 🔲

**Priority: P2** · Size: S · Files: `package.json`, `.github/workflows/*`

### Finding

Ten dependabot PRs (#129–#138) have been open since 2026-07-11 — over two
weeks. Six are GitHub Actions major-version bumps (`checkout` 3→7,
`setup-node` 3→6, `upload-artifact` 4→7, `github-script` 7→9,
`gitleaks-action` 2→3), four are npm packages including `yjs` 13.6.28→13.6.31.

Action bumps that far behind eventually become forced work when GitHub retires
the old runner images, and `yjs` underpins real-time collaboration.

### Preferred fix

Triage in two batches, not one merge queue. GitHub Actions bumps first — they
are major versions and can break CI, so land them one at a time and confirm CI
is green after each. Then the npm bumps, with the full suite run against `yjs`
specifically since collaboration is the least-tested area (see **DEBT-3**).

Close, with a reason, anything not wanted rather than leaving it open.

### Ties

- **DEBT-3** — collab sync is currently untested, so a `yjs` bump has no
  safety net. Prefer landing DEBT-3 first, or test the bump by hand.
- Load `run-tests`.

### Acceptance criteria

1. Every one of #129–#138 is merged or closed with a stated reason.
2. CI green after each Actions bump individually, not just at the end.
3. The `yjs` bump is verified against real-time collaboration behaviour, by
   test or by hand, with evidence attached.

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

---

## DEBT-12 — `remapJsonIds` had three copies; consolidated to one ✅

> **Done 2026-07-28.** Filed and fixed in the same pass, because the fix was a
> delete-and-import and the justification for the duplication had already
> expired.

**Priority: P2** · Size: S · Files: `server/services/SectionService.ts`,
`server/utils/remapJsonIds.ts`, `tests/unit/services/SectionService.test.ts`

### Finding

Three code paths copy jsonb containing embedded ids, and each had its own copy
of the same recursive walker. IEX-9 merged two of them into
`server/utils/remapJsonIds.ts`; `SectionService.ts:30` kept a third, carrying a
comment explaining it was *"reimplemented here rather than imported so this
file's duplicate path stays independent of the whole-asset cloner."*

That reasoning was sound when written (ICW2-B5) — importing from
`WorkflowClonerService` would have pulled a heavy service in for one 15-line
function — but IEX-9 dissolved it. The walker now lives in a leaf module with
**zero imports**, so importing it couples `SectionService` to a pure utility,
not to the cloner. The dependency the comment was avoiding no longer exists.

These were not three similar uses either. All three remap the *same column*,
`logic_rules.conditionValue` — the column `ENTITY_GRAPH` declares in `jsonRefs`.

### Fix applied

`SectionService` now imports the shared walker; its local copy is deleted. The
shared module documents that it is the single implementation for all three
callers, and records a known limitation found while reviewing it: **only string
*values* are remapped, never object *keys***, so an id-keyed config
(`{ "<stepId>": {...} }`) passes through untouched. Nothing in the current schema
relies on that shape, but if it ever does, the fix now lands once for all three
callers instead of needing to be remembered in three places.

### Coverage gap this exposed

Mutation-checking the consolidation turned up something worth more than the
consolidation itself: **neutering the walker entirely left all 19 SectionService
tests green.** The existing tests assert `conditionStepId` and `targetStepId`,
which are remapped by direct `idMap.get()` lookups and never touch the walker;
ids embedded *inside* `conditionValue` had no coverage at all. Only the
portability suites caught the mutation.

A test was added for exactly that case, and re-running the same mutation now
reds it and nothing else. Without it, a future change to the shared walker
driven by portability requirements could have broken section duplication
silently — which is precisely the risk consolidation is supposed to remove.

### Verification

type-check 0, eslint 0 (with `--report-unused-disable-directives`, which also
flagged a now-orphaned file-level suppression in the test file — removed),
`test:fast` 148 files / 2007 tests (from 2006), `unit-db` 9 files / 85 tests.
`grep -rn "function remapJsonIds"` now returns exactly one hit.

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
| DEBT-1 | Drain unused eslint-disable directives | P2 | L | ✅ `4912f21f`..`0500ba6b` (8 tranches) — entry removed |
| DEBT-2 | Retire the 143 blanket file-level eslint-disable headers | P2 | L | 🔲 |
| DEBT-3a | Restore the two skipped `visibleIf` document-generation tests | P1 | M | 🔄 dispatched 2026-07-30 (worktree `debt-3a`) |
| DEBT-3b | Restore the skipped collab sync test | P1 | S | 🔲 blocked-ish — see Ties |
| DEBT-4 | E-signature provider registry is never initialized | P1 | S | ✅ `9fcf05b4` — ruled dormant; entry removed |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | P1 | S | ✅ `f308fde2` + `50408c33` — entry removed |
| DEBT-6 | Two parallel file subsystems | P2 | L | 🔲 |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | P1 | S | ✅ `23a5863e` — entry removed |
| DEBT-8 | DI container is built but ~unused | P2 | M | ✅ **Decision: removed, not adopted** (2026-07-30) — `server/di/` deleted; it had zero consumers. Entry removed |
| DEBT-9 | `type-check` is advisory in CI | P2 | S | ✅ `a0e43c9b` — entry removed |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | 🔲 |
| DEBT-11 | RLS policies defined but not enforced (decision, not a fix) | — | — | 🔲 tracked |

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

## DEBT-3a — Restore the two skipped `visibleIf` document-generation tests 🔄

**Priority: P1** · Size: M · Files: `tests/integration/workflows/runtime-pipelines.test.ts`
(this file only)

*Split from the original DEBT-3 on 2026-07-30. Evidence below was re-verified
against the tree at `7fd88e89` that day; the collab half is now DEBT-3b.*

### Finding

Enabling `vitest/expect-expect` in `42996bcb` found six tests that passed while
asserting nothing. Three were deleted; three were marked `.skip` rather than
deleted so the gap stayed honest. Two of those live in this file:

- `runtime-pipelines.test.ts:332` — `should skip document generation when
  visibleIf condition is false`
- `runtime-pipelines.test.ts:356` — `should generate document when visibleIf
  condition is true`

Both insert a `workflowRuns` row and a `stepValues` row, delete the run, and
assert nothing. Their own comment: *"we can't easily test document generation
without the actual template file."*

**The re-audit found the deeper reason they assert nothing, and it is not just
the missing fixture.** The `beforeAll` at line 288 creates a `templates` row
with `fileRef: '/test/template.docx'` — a fake path with no bytes behind it —
and puts the `visibleIf` condition in `template.metadata` (lines 298-315,
`email contains 'show'`). But **that template is never wired into any `'final'`
step or legacy Final Documents section**, and neither test ever calls a
generation entry point. So the template is orphaned: even fully unskipped, with
a real docx on disk, these tests would still generate nothing. Fixing the
fixture alone will not fix the test.

This matters because `visibleIf`-gated generation is customer-visible and
document generation has already produced one live production incident this
quarter.

### Preferred fix

`tests/integration/docs.autogeneration.test.ts` already does this correctly,
end to end, with nothing stubbed. **Copy its approach; do not invent one.**

1. **Real docx bytes.** Copy the local `createDocxBuffer` helper at
   `docs.autogeneration.test.ts:29-57` (PizZip — already a dependency —
   writing `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`) and the
   `createTemplateOnDisk` pattern at lines 92-106 that writes it under the real
   `server/files` dir. It is a local, non-exported function in that file, so
   copying is expected. **Do not commit a binary `.docx`** — none are tracked
   in this repo and that is deliberate.
2. **Wire the template into the run.** Point the template's `fileRef` at the
   real file, then attach it to an actual `'final'` step's
   `config.documents[]` with the `visibleIf` expression as that document's
   `conditions` — see `docs.autogeneration.test.ts:157-180`. (The legacy path
   at `RunLifecycleService.ts:561-566` reads `template.metadata.visibleIf` and
   maps it onto `documents[].conditions`; either route is acceptable, but the
   `'final'` step route is the one the sibling test proves.)
3. **Actually trigger generation:** `await runLifecycleService.generateDocuments(runId)`
   (`server/services/workflow-runs/RunLifecycleService.ts:364`), exactly as
   `docs.autogeneration.test.ts:184` does.
4. **Assert on real rows** in `runGeneratedDocuments` filtered by `runId`:
   **exactly zero** when the condition is false, **exactly one** when true. For
   the true branch also read the produced file back and assert its merged text,
   using the `readDocxText` pattern at `docs.autogeneration.test.ts:60-65`.

The gate you are proving is `EnhancedDocumentEngine.renderFinalBlock()` at
`server/services/document/EnhancedDocumentEngine.ts:397-409` (`if
(doc.conditions) { ... skipped.push({ reason: 'Conditions not met' }) }`),
which evaluates via `evaluateConditions()` at lines 493-517.

### The trap in this ticket — read before turning in

**A false-branch test that asserts "zero rows" passes trivially if generation
never ran at all** — which is exactly the bug the current test has. Zero rows
is the same observation whether the condition correctly excluded the document
or the template was never wired up.

So AC 5 below is not optional bookkeeping: you must **mutation-test** the pair.
Flip the fixture's condition (or the step value) so the false case should
become true, re-run, and confirm the false-branch test **fails**. If it still
passes, your test is measuring nothing and the ticket is not done. Seven
turn-ins on a sibling initiative shipped tests that passed for the wrong
reason; this is the specific check that catches it.

### Ties

- Introduced by `42996bcb`; the guard that found them is `vitest/expect-expect`
  in `.eslintrc.json`.
- **Pattern to copy: `tests/integration/docs.autogeneration.test.ts`** — real
  PizZip docx, real disk write, real `generateDocuments` call, real row
  assertions. Read it first.
- **Load `run-tests`.** This file is in the **`integration`** project, not
  `unit` — it needs a database (`npm run test:docker:up`) and
  `npm run test:integration`. `npm test` naively gives wrong results here.
- **File footprint: this one test file.** No overlap with DEBT-2 (which is
  repo-wide but touches only files carrying a blanket `/* eslint-disable`
  header — this file has none) or with the live IEX2 tickets (portability
  only). Safe to run concurrently with both.
- Sibling: **DEBT-3b** (collab), deliberately not in scope here.

### Acceptance criteria

1. Both tests at `runtime-pipelines.test.ts:332` and `:356` are un-skipped and
   passing with real assertions.
2. The template used is a real, byte-valid docx written to disk by the test,
   wired into a `'final'` step (or legacy Final Documents section) that the run
   actually reaches — not an orphaned `templates` row with a fake `fileRef`.
3. Each test calls a real generation entry point
   (`runLifecycleService.generateDocuments(runId)` or
   `runService.generateDocuments(runId)`) and asserts on `runGeneratedDocuments`
   rows scoped to that run: exactly 0 for the false branch, exactly 1 for the
   true branch.
4. The true branch additionally asserts on the *content* of the generated
   file, read back off disk, not merely on row count.
5. **Mutation proof, pasted into the turn-in:** with the condition inverted so
   the false case should generate, the false-branch test **fails**; restored,
   it passes. Show both runs' output. A turn-in without this is incomplete.
6. No fixed-duration `setTimeout` is used as a synchronization primitive; wait
   on a condition with a timeout instead.
7. `vitest/expect-expect` passes on both tests without a suppression.
8. Any fixture written to disk is cleaned up in `afterAll`, and the file's
   existing `afterAll` cleanup (line 325) still leaves no rows behind.
9. Gates: type-check 0 errors, lint 0 problems, `npm run test:fast` ≥ baseline
   (152 files / 2045 tests at `7fd88e89`), and
   `npm run test:integration -- runtime-pipelines` green.

---

## DEBT-3b — Restore the skipped collab sync test 🔲

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

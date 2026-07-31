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
| DEBT-3a | Restore the two skipped `visibleIf` document-generation tests | P1 | M | ✅ verified at review 2026-07-30 — entry removed |
| DEBT-3b | Restore the skipped collab sync test | P1 | S | 🔲 blocked-ish — see Ties |
| DEBT-4 | E-signature provider registry is never initialized | P1 | S | ✅ `9fcf05b4` — ruled dormant; entry removed |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | P1 | S | ✅ `f308fde2` + `50408c33` — entry removed |
| DEBT-6 | Two parallel file subsystems | P2 | L | 🔲 |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | P1 | S | ✅ `23a5863e` — entry removed |
| DEBT-8 | DI container is built but ~unused | P2 | M | ✅ **Decision: removed, not adopted** (2026-07-30) — `server/di/` deleted; it had zero consumers. Entry removed |
| DEBT-9 | `type-check` is advisory in CI | P2 | S | ✅ `a0e43c9b` — entry removed |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | 🔲 |
| DEBT-11 | RLS policies defined but not enforced (decision, not a fix) | — | — | 🔲 tracked |
| DEBT-13 | Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type | P1? | S | 🔲 needs a prod-data check first |

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

## DEBT-13 — Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type 🔲

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

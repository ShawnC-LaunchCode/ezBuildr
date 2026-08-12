# Scripting — Lifecycle Hook Wiring Tickets (SCRIPT-1)

Source: traced during a 2026-08-10 question about whether scripting can drive page logic.
Scope: `server/services/scripting/`, `server/services/BlockRunner.ts`, and the lifecycle
hook phase enum.

Findings were verified against the working tree; the locator is the quoted code and the
named symbol, and line numbers are advisory.

- Each ticket has: **Finding**, **Preferred fix**, **Ties**, **Acceptance criteria**.
  Devs do not commit; the reviewer commits per passed ticket.
- Load the `run-tests` skill before running any test — `npm test` naively gives wrong
  results in this repo. Load `add-api-endpoint` for service-layer conventions.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| SCRIPT-1 | Two lifecycle hook phases can never fire | P1 | S | ✅ |
| SCRIPT-2 | Prove the two new phases actually execute | P2 | S | 🔲 |

---

## SCRIPT-1 — Two lifecycle hook phases can never fire ✅

> **Partially verified 2026-08-11 (reviewer, implemented by the reviewer). ACs 3–7 met;
> ACs 1–2 met structurally, not behaviourally — see the caveat below, and SCRIPT-2.**
> `type-check` 0 errors · `lint` 0 problems repo-wide · `test:fast` **268 files / 3036 passed
> / 14 skipped** (+5 over 3031 — the enum-driven guard's five cases).
>
> - **`beforeFinalBlock`** fires in `RunLifecycleService` after the alias-keyed run data is
>   built and before the first template renders — the last point where a hook's output can
>   still change what the documents contain. Its merged output feeds generation.
> - **`afterDocumentsGenerated`** fires once per run after every document exists and its
>   record is persisted, and *before* deliveries dispatch, so a hook can react to the finished
>   documents while delivery still happens. Output is not merged back: generation is over.
>
> Both follow `BlockRunner`'s existing treatment — errors collected and non-breaking, and
> merging left to `executeHooksForPhase` so `mutationMode` and the `outputKeys` whitelist are
> not re-implemented. A failing notification hook cannot lose a run's documents.
>
> **AC5's guard was proven to fail before the fix**, which is the whole point of it. Reverting
> the wiring and re-running produces exactly two failures naming `beforeFinalBlock` and
> `afterDocumentsGenerated`, with an error message giving the next person both options:
> dispatch the phase, or remove it from the enum. It is driven by `lifecycleHookPhaseEnum`
> itself, so a fifth phase added later fails until something dispatches it — four hand-written
> cases would not have caught this, because the phase that rots is the one nobody tested.
>
> **One reviewer fix during implementation:** the first cut passed `storageKey` into the
> script context. It does not exist on that type, and on reflection a sandboxed script should
> get what it needs to *describe* an output, not a handle to fetch it. Now filename, mimeType
> and size only.
>
> **⚠️ ACs 1 and 2 are not fully satisfied, and the reviewer initially overclaimed them.**
> Both ask for a test proving a saved hook *executes*. What exists is the wiring plus an
> enum-driven structural guard that asserts each phase is dispatched *somewhere in source*.
> That catches the dead-phase class of bug — which is what this ticket was filed for — but it
> would not catch wiring that is present yet unreachable, for example a call sited after an
> early return. Closing this as fully done would be exactly the kind of claim this initiative
> has repeatedly caught in others. Tracked as **SCRIPT-2**.

**Priority: P1** · Size: S · Files: `server/services/BlockRunner.ts`, `server/services/runs/RunExecutionCoordinator.ts` (or wherever run completion lives)

### Finding

`lifecycleHookPhaseEnum` offers four phases, and the builder lets an author create a hook on
any of them (`shared/schema/workflow.ts`):

```ts
export const lifecycleHookPhaseEnum = pgEnum('lifecycle_hook_phase', ['beforePage', 'afterPage', 'beforeFinalBlock', 'afterDocumentsGenerated']);
```

Only two of them are ever executed. `BlockRunner.runPhase()` is the **only** caller of
`lifecycleHookService.executeHooksForPhase`, and its map produces just two:

```ts
      const lifecyclePhaseMap: Record<BlockPhase, LifecycleHookPhase | null> = {
        onRunStart: null, // No lifecycle hook phase for onRunStart (could add if needed)
        onSectionEnter: "beforePage",
        onSectionSubmit: "afterPage",
        onNext: null, // No lifecycle hook phase for onNext
        onRunComplete: null, // No lifecycle hook phase for onRunComplete (could add beforeFinalBlock later)
      };
```

A repo-wide grep for `beforeFinalBlock` and `afterDocumentsGenerated` outside the CRUD routes
and `LifecycleHookService` itself returns **nothing**.

Consequence: an author configures a hook on one of those two phases, saves it, sees it listed
as enabled, and it silently never runs. There is no error and no warning anywhere — the same
shape as the e-signature provider registry that is never initialized.

`afterDocumentsGenerated` is the more costly of the two: it is the natural place for "email
the finished PDF to the client" or "push the document to Clio", which is exactly the automation
a user would assume works.

For contrast, **document hooks are correctly wired** — `FinalBlockRenderer` fires both
`beforeGeneration` (line ~209) and `afterGeneration` (line ~247). Use that as the donor pattern.

### Preferred fix

Fire the two missing phases from the points their names describe:

- **`beforeFinalBlock`** — immediately before final-block document generation begins, so a hook
  can still contribute data that generation consumes. `FinalBlockRenderer` / the run-completion
  path is the likely home; confirm where `beforeFinalBlock` data would still be usable.
- **`afterDocumentsGenerated`** — after all documents for the run exist, with the generated
  document references available to the script context.

Mirror `BlockRunner`'s existing treatment: hook errors are collected and non-breaking, output
is merged only when `mutationMode` is on and only for whitelisted `outputKeys`. Do not invent
a second merge convention.

If a phase turns out to have no coherent place to fire — for example if `beforeFinalBlock`
cannot run early enough to be useful — **do not force it**. Report that as a blocker and
propose removing it from the enum instead, so the builder stops offering something that cannot
work. A removed phase is honest; a dead one is not.

### Ties

- Related: the `afterDocumentsGenerated` phase is what most "notify on completion" automations
  would use, which overlaps GH-170's delivery destinations — check whether a hook here would
  duplicate delivery rather than complement it.
- Load `run-tests` and `add-api-endpoint`.
- File footprint: `server/services/BlockRunner.ts` and/or the run-completion path, plus
  `server/services/document/FinalBlockRenderer.ts` if `beforeFinalBlock` lands there.
  Collides with nothing currently open.
- Donor pattern: `FinalBlockRenderer`'s document-hook invocation.

### Acceptance criteria

1. A hook saved on `beforeFinalBlock` executes during a run that generates documents, proven
   by a test asserting the script ran.
2. A hook saved on `afterDocumentsGenerated` executes after documents exist, and its script
   context can see the generated document references.
3. Hook output on both phases merges under the same rules as the existing phases — only with
   `mutationMode` enabled, only for whitelisted `outputKeys`.
4. Hook errors on both phases are collected and non-breaking, matching `beforePage`/`afterPage`.
5. A test asserts that **every** value in `lifecycleHookPhaseEnum` has an execution path, so a
   future phase added to the enum cannot silently become dead. This is the criterion that
   prevents a recurrence — an enum-driven test, not four hand-written cases.
6. If either phase is removed instead of wired (per the Preferred fix escape hatch), the enum,
   the builder options and any stored hooks on that phase are handled in the same change, and
   the reasoning is recorded on this ticket.
7. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green at or
   above the baseline measured in the worktree at dispatch.

---

## SCRIPT-2 — Prove the two new hook phases actually execute ✅ DONE 2026-08-11

**Priority: P2** · Size: S · Files: `tests/unit/services/` (new test)
**Closed by:** `2318db18`, merged to `main` as `b92a9281` (unpushed).
**Reviewer verification** (gates re-run, not accepted from the turn-in):
`type-check` 0 errors · `lint` 0 problems · `test:fast` **3042 passed / 0 failed**,
271 files passed / 1 skipped — baseline 3039 plus exactly the 3 new tests.
All 5 ACs met. The event-sequence assertion proves ordering rather than mere
occurrence, which is what AC2 was actually after.
**Follow-up raised:** [SCRIPT-3](#script-3--assert-beforefinalblock-output-reaches-the-renderer).

### Finding

SCRIPT-1 wired `beforeFinalBlock` and `afterDocumentsGenerated` into
`RunLifecycleService.generateFinalBlockDocuments`, and added an enum-driven guard
(`tests/unit/services/lifecycleHookPhaseCoverage.test.ts`) proving every phase in
`lifecycleHookPhaseEnum` is dispatched somewhere under `server/`.

That guard is **structural**: it greps source for the phase string. It proves the call exists;
it does not prove the call is reached. Wiring placed after an early return, or inside a branch
that never runs for real configurations, would satisfy it while the phase stayed dead — the
same silent failure in a new disguise.

SCRIPT-1's ACs 1 and 2 asked for behavioural proof and did not get it. The reviewer closed
SCRIPT-1 claiming all 7 ACs were met, which was wrong, and corrected it.

### Preferred fix

A unit test over `generateFinalBlockDocuments` with `lifecycleHookService.executeHooksForPhase`
mocked, asserting it is called once with `beforeFinalBlock` before rendering and once with
`afterDocumentsGenerated` after documents are persisted, for a run that generates at least one
document. Mock the repositories and `finalBlockRenderer` the way existing tests in
`tests/unit/services/` do rather than standing up a real run.

Assert **ordering as well as occurrence** — `beforeFinalBlock` must precede the render call, or
its whole purpose (contributing data that generation consumes) is lost while the test still
passes.

### Ties

- Follows **SCRIPT-1**, which is merged. Nothing depends on this; it closes an evidence gap.
- Load `run-tests`. File footprint: one new test file. Collides with nothing.

### Acceptance criteria

1. A test asserts `executeHooksForPhase` is called with `beforeFinalBlock` during a generation
   that produces at least one document.
2. The same test asserts `beforeFinalBlock` is invoked **before** the renderer is called.
3. A test asserts `executeHooksForPhase` is called with `afterDocumentsGenerated` after
   document records are persisted.
4. A test asserts a hook error on either phase does not fail the generation — the run still
   returns its documents.
5. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green at or
   above the baseline measured at dispatch.

---

## SCRIPT-3 — Assert beforeFinalBlock output reaches the renderer ✅ DONE 2026-08-12

**Closed by:** `74d29457`, merged to `main` as part of the G171-SMALLS merge (unpushed).
All 4 ACs met. The mocked `beforeFinalBlock` now returns **mutated** data and the test
asserts `finalBlockRenderer.render` received it — plus a bonus assertion that the
mutation propagates on to `afterDocumentsGenerated`, which the ticket did not ask for.

Non-vacuity proven: with the service changed to pass unmodified `stepValues`, one test
fails; restored, 3/3 pass. So the regression this ticket exists to prevent — a hook that
fires in the right order with no effect on output — can no longer pass the suite.

**Priority: P2** · Size: S · Files: `tests/unit/services/RunLifecycleService.lifecycleHooks.test.ts`

### Finding

Found by the reviewer while verifying SCRIPT-2. Not a defect in SCRIPT-2 — its ACs
never asked for this — and **not a defect in the production code**, which is correct:

```ts
hookedStepValues = beforeFinalBlockResult.data ?? stepValues;   // RunLifecycleService ~506
...
stepValues: hookedStepValues,                                   // passed to render ~528
```

The gap is in the guard. SCRIPT-2's test returns the hook's `data` **unchanged** and
asserts only that the phases were called in the right order. So a regression that
computed `hookedStepValues` and then passed plain `stepValues` to the renderer would
pass all three tests.

That is exactly SCRIPT-1's failure shape wearing a new disguise: a hook that runs,
in the right order, with no effect on output. Ordering was the right thing for
SCRIPT-2 to assert; it is not sufficient on its own.

### Preferred fix

Extend the existing test: have the mocked `beforeFinalBlock` return **mutated** data
(e.g. add a key, or change `clientName`), then assert `finalBlockRenderer.render` was
called with `stepValues` containing the mutation. One added assertion plus a changed
mock return — no new file.

Prove it is not vacuous: temporarily change the service to pass `stepValues` instead
of `hookedStepValues`, confirm the new assertion fails, restore, confirm it passes.
Paste both outputs.

### Ties

- Same file as SCRIPT-2 (now merged), so **no collision** — but do not start this in a
  worktree based before `b92a9281`, or the file will not be there.
- Load `run-tests`.

### Acceptance Criteria

1. The mocked `beforeFinalBlock` hook returns data differing from its input.
2. An assertion proves `finalBlockRenderer.render` received the **mutated** data.
3. Failing-then-passing evidence pasted, per the probe above.
4. `type-check` 0 errors · `lint` 0 problems · `test:fast` at or above 3042 passed / 0 failed.

---

## Gate

- [x] SCRIPT-1 ✅ (2026-08-11)
- [x] SCRIPT-2 ✅ (2026-08-11) — dated verification note in its section above
- [x] SCRIPT-3 ✅ (2026-08-12) — hook output is now proven to reach the renderer
- [x] `npm run type-check` · `npm run lint` · `npm run test:fast` green — reviewer re-ran all three
- [x] Reviewer has driven a real run with a hook on each phase and confirmed it fired
      — **DONE 2026-08-12.** A live probe inserted real `lifecycle_hooks` rows on both
      phases and called `runLifecycleService.generateDocuments(runId)` — the same path
      `RunCompletionJobWorker` drives — against the dev database.

      Evidence: `script_execution_log` recorded
      `["afterDocumentsGenerated:success","beforeFinalBlock:success"]`, no hook errored,
      and the run generated 1 document. **JS executed in the real sandbox** —
      `isolated-vm` is installed on this machine, contrary to a stale note in the
      `verify` skill (now corrected), so this was not a fallback or a mock.

      Stronger than the gate asked for: the `beforeFinalBlock` hook emitted
      `hookRan: 'BEFORE-FIRED'` and the **rendered DOCX contained `BEFORE-FIRED`**, so
      the hook's output demonstrably reached the renderer. That confirms SCRIPT-3's
      unit-level assertion in a live run as well.

      Probe fixtures fully torn down: 0 leftover tenants, 0 leftover workflows.
- [x] Reviewer has committed the passed ticket — `2318db18`, merged `b92a9281`

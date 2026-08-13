# Scripting Hooks (SCRIPT) — retired 2026-08-12

**3 of 3 tickets closed.** The two document-generation lifecycle hook phases —
`beforeFinalBlock` and `afterDocumentsGenerated` — existed in the enum and in the builder
since the scripting system shipped, and **nothing ever invoked them**: a hook saved on
either phase silently never ran. They now fire, in the right order, and their output
provably reaches the renderer.

Original ticket file: `tickets/SCRIPTING_HOOKS_TICKETS.md`. Recover the full ticket text,
acceptance criteria and dated verification notes with:

```bash
git log -p -- tickets/SCRIPTING_HOOKS_TICKETS.md
```

## Parked entries

None. Every finding in this initiative became a ticket and shipped.

## Lessons worth keeping

**A structural guard proves a call exists, not that it is reached.** SCRIPT-1 shipped with
`lifecycleHookPhaseCoverage.test.ts`, which greps `server/` for each phase string in
`lifecycleHookPhaseEnum`. That passes just as happily when the call sits after an early
return or inside a branch no real config enters — the same silent failure in a new
disguise. SCRIPT-2 existed only because the reviewer closed SCRIPT-1 claiming ACs 1 and 2
were met when they were not, then corrected it.

**Ordering is not sufficient either.** SCRIPT-2 asserted the phases fire in the right
sequence (`beforeFinalBlock → render → persist → afterDocumentsGenerated`). SCRIPT-3
existed because that still could not catch a regression where the hook's *returned data*
was computed and then discarded — a hook that fires, in order, with no effect on output.
The fix chain is `hookedStepValues = beforeFinalBlockResult.data ?? stepValues` then
`stepValues: hookedStepValues` into the renderer; the test now mutates the hook's return
and asserts the renderer received the mutation.

Generalisation: **for any hook or middleware, ask what a test would catch — existence,
ordering, or effect.** These three tickets are the three answers, and only the third is
worth much.

**`isolated-vm` IS installed on this machine** (verified 2026-08-12). The `verify` skill
previously claimed neither sandbox module was present and told reviewers to settle for unit
tests; that was stale and is now fixed. Lifecycle hooks are fully verifiable live.

## Closed — do not re-file

| Ticket | Outcome | Commit |
|---|---|---|
| SCRIPT-1 — two lifecycle hook phases can never fire | ✅ both phases wired into `RunLifecycleService`, plus an enum-driven coverage guard | see `git log` for `lifecycleHookPhaseCoverage` |
| SCRIPT-2 — prove the two new hook phases actually execute | ✅ behavioural test asserting occurrence **and ordering**, plus non-fatal error handling on both phases | `2318db18` → `b92a9281` |
| SCRIPT-3 — assert `beforeFinalBlock` output reaches the renderer | ✅ hook returns mutated data; test asserts the renderer received it | `74d29457` → merged in the G171-SMALLS merge |

**Gate fully satisfied**, including the live item: a real run with a hook on each phase,
driven through `runLifecycleService.generateDocuments` (the path `RunCompletionJobWorker`
uses) on 2026-08-12. `script_execution_log` recorded
`["afterDocumentsGenerated:success","beforeFinalBlock:success"]`, and the rendered DOCX
contained the before-hook's emitted marker, so its output demonstrably reached the
renderer. Closed in `2085bb29`.

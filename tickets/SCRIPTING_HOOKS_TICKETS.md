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
| SCRIPT-1 | Two lifecycle hook phases can never fire | P1 | S | 🔲 |

---

## SCRIPT-1 — Two lifecycle hook phases can never fire 🔲

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

## Gate

- [ ] SCRIPT-1 ✅ with a dated verification note
- [ ] `npm run type-check` · `npm run lint` · `npm run test:fast` green
- [ ] Reviewer has driven a real run with a hook on each phase and confirmed it fired
- [ ] Reviewer has committed the passed ticket

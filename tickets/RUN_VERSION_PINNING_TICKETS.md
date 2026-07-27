# Run Version Pinning — Server-Side Initiative (RVP-1..5)

Source: escalation RUN2-E1 from the interview runner audit
(`tickets/INTERVIEW_RUNNER_TICKETS.md`), deferred there by Shawn on 2026-07-25
to its own initiative. Evidence below **re-verified against the current tree**
on 2026-07-25, after all 16 RUN2 tickets landed.

Scope: every server-side decision made about an in-flight run —
`LogicService` (navigation, completion validation, context building),
`RunExecutionCoordinator` (section submit, next, JS questions, alias map),
`RunLifecycleService` (start section, document generation).

**INITIATIVE CLOSED 2026-07-26** — RVP-1..7 all done. Final gates: type-check 0
errors, `test:fast` **1951 passing**, integration **84/85 files, 906 passing**
(the one failure, `hardening/quota.test.ts`, is unrelated in-flight work by the
repo owner and fails without these changes). RVP-5's regression net passes
unmodified and caught RVP-7 en route.

Overall grade for this area at audit time: **D** — the run stores which version it is pinned
to and then never consults it again, so the client and the server are reading
two different definitions of the same interview.

---

## The problem, stated once

`RunService.createRun` records the version a run is pinned to
(`server/services/RunService.ts:208`, and `:520` for anonymous runs):

```ts
workflowVersionId: targetVersionId ?? undefined,
```

`RunRuntimeService.getRuntime` honours it: the client renders from
`version.graphJson`, parsed and validated against `VersionRuntimeSchema`.

**No server-side decision path reads it.** `workflowVersionId` appears exactly
twice in `RunService.ts` — both writes — and nowhere in `LogicService.ts` or
`RunExecutionCoordinator.ts`. Every server decision instead re-reads the live
tables:

| Path | Reads | Line |
|---|---|---|
| `LogicService.buildContext` | `sectionRepo.findByWorkflowId` | `LogicService.ts:68` |
| `LogicService.evaluateNavigation` | `sectionRepo.findByWorkflowId` | `LogicService.ts:123` |
| `LogicService.validateCompletion` | `sectionRepo.findByWorkflowId` | `LogicService.ts:188` |
| `RunExecutionCoordinator.submitSection` | `stepRepo.findBySectionId` | `RunExecutionCoordinator.ts:109` |
| `RunExecutionCoordinator.executeJsQuestions` | `stepRepo.findBySectionId` | `:175` |
| `RunExecutionCoordinator.getVisibleStepIds` | `sectionRepo.findByWorkflowId` | `:225` |
| `RunExecutionCoordinator.getWorkflowStepIds` | `sectionRepo.findByWorkflowId` | `:297` |
| `RunLifecycleService.determineStartSection` | `logicSvc.buildContext` | `RunLifecycleService.ts:237` |

So the moment an author edits a published workflow, in-flight respondents are
answering one interview while the server validates a different one. Observed
consequences (RUN2-15 mitigated the first, the rest are open):

1. Delete a question mid-run → the client still renders it from the snapshot and
   submits its value. **Mitigated** by RUN2-15: unknown ids are now dropped with
   a warning instead of throwing. The answer is still silently lost.
2. Add a **required** question mid-run → the respondent never sees it (not in
   their snapshot) but `validateCompletion` demands it. Submission is refused
   with "Missing required steps: …" for a question that does not exist in their
   interview, and there is no action the respondent can take.
3. Reorder or delete a **section** mid-run → `next()` returns an id the client
   cannot find, and the client falls into its "Server nextSectionId not locally
   visible" fallback (`useRunNavigation.ts`), desynchronising the two cursors
   for the remainder of the run.
4. Edit a **logic rule** mid-run → visibility flips underneath the respondent:
   the client evaluates the pinned rules, the server the live ones, so a step
   the client shows can be treated as hidden server-side (and vice versa).

Consequence 2 is the worst: it is unrecoverable for the respondent and produces
no useful error.

---

## Design decision required before Phase 2 — for Shawn

The mechanical fix is to resolve sections/steps/rules from the pinned graph
rather than the tables. The open question is **what happens to a run with no
`workflowVersionId`**, which `RunService.createRun` explicitly permits for
authenticated creators (`RunService.ts:169-171` logs "run might be unstable"
and proceeds):

- **Option A — fall back to live tables.** A versionless run keeps exactly
  today's behaviour. Lowest risk, no migration, but the two code paths persist
  forever and "unstable" runs stay unstable.
- **Option B — pin at creation, always.** `createRun` creates a draft version
  when none exists (the machinery already exists: `createDraftVersion`), so
  every run has a definition. One code path, but it makes run creation a write
  to `workflow_versions` and changes behaviour for creator preview runs.
- **Option C — refuse versionless runs.** Cleanest invariant, most disruptive:
  a creator could not run an unpublished draft at all without publishing.

**My recommendation: B**, with A as the fallback for pre-existing runs whose
`workflowVersionId` is already null. RUN2-9's publish gate means a draft version
is cheap to produce and already validated, and B is the only option that ends
the dual-definition problem rather than managing it. But B changes creator
preview behaviour, so it is Shawn's call, and **RVP-2 must not start until it is
made.**

### ✅ DECIDED 2026-07-26 — Option B

Shawn chose **B**: every new run is pinned at creation, auto-creating a draft
version when the workflow has none. **A remains the fallback for pre-existing
runs** whose `workflowVersionId` is already null — there is no migration, so
those keep resolving from the live tables via the provider's `source: 'live'`
branch, which RVP-1 already built.

Two implementation constraints that follow from the existing code, both of which
belong to **RVP-6**:

- `createDraftVersion` returns `null` when the serialized checksum matches the
  latest version, meaning "no new version needed". RVP-6 must then **reuse the
  latest existing version** rather than treating `null` as a failure.
- Run creation becomes a write to `workflow_versions`. That is acceptable for
  the creator-preview path this affects, but it must not fire for runs that
  already resolve a published or pinned version — only when there is none.

---

## How to work this document

- Phases are ordered by risk. Do not start a phase until the previous phase's
  **Phase Gate** has been verified and committed by the reviewer.
- **Dispatch each ticket in its own git worktree** — see the "Parallel work"
  section of `CLAUDE.md`, including the warning that a new worktree may start
  from a stale base commit.
- Load `add-api-endpoint` before touching `server/services/`, and `run-tests`
  before running anything. Gates for every ticket: `npm run type-check` (0
  errors), `npm run lint` on every touched file, `npm run test:fast`, plus the
  relevant integration files (`npm run test:docker:up` first).
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Phase | Theme | Tickets |
|---|---|---|
| 1 | Make the pinned definition loadable server-side | RVP-1 |
| 2 | Pin every run, then thread it through every decision path | RVP-6 → RVP-2 → RVP-3 → RVP-4 (sequential) |
| 3 | Prove it end to end | RVP-5 |

---

# Phase 1 — A single source for a run's definition

## RVP-1 — Extract a run-definition provider ✅

**Priority: P1** · Size: M · Files: `server/services/workflow-runs/` (new), `RunRuntimeService.ts`

### Finding

`RunRuntimeService.getRuntime` already contains the only correct implementation
of "resolve this run's definition": it loads the version, parses `graphJson`
against `VersionRuntimeSchema`, flattens `sections[].steps[]` into steps, and
resolves logic-rule aliases into ids (`RunRuntimeService.ts`, the `steps`,
`stepIdByAlias` and `logicRules` mapping). But it is welded to the HTTP response
shape (`RunRuntimeDefinition`, `contractVersion`, run values) and is reachable
only from `GET /api/runs/:runId/runtime`.

Every server decision path needs the same three collections — sections, steps,
logic rules — and today each re-derives them from the live tables instead.

### Preferred fix

Extract a provider, e.g. `RunDefinitionProvider`, exposing one method:

```ts
getDefinition(run: WorkflowRun): Promise<{
  sections: RunSection[]; steps: RunStep[]; logicRules: LogicRule[]; source: 'version' | 'live';
}>
```

- When `run.workflowVersionId` is set: parse the pinned graph — reuse the exact
  schema and mapping `RunRuntimeService` uses today rather than writing a second
  parser. Move that logic into the provider and have `RunRuntimeService` call it,
  so there is one implementation.
- When it is not set: read the live tables (today's behaviour), and report
  `source: 'live'` so callers and logs can tell the difference. Whether this
  branch survives depends on the Option A/B/C decision above — build it either
  way; RVP-2 can remove it later if B or C is chosen.

Keep the RUN2-10 behaviour intact: a version whose `graphJson` fails the schema
must still fail closed, log the Zod issues with run/workflow/version ids, and
surface as a 4xx.

### Ties

- Sole dependency of RVP-2/3/4 — **must land first.**
- Load `add-api-endpoint`, `run-tests`.
- Existing tests to keep green: `tests/unit/services/RunRuntimeService.test.ts`,
  `tests/integration/api.runs.runtime.test.ts`.

### Acceptance criteria

1. A new provider returns sections, steps and logic rules for a run, sourced
   from the pinned version when one exists.
2. `RunRuntimeService.getRuntime` is refactored to call it — the graph parsing
   and alias-resolution logic exists in exactly one place, and its existing
   response shape is unchanged.
3. A run with no `workflowVersionId` returns the live-table definition and
   `source: 'live'`.
4. A version failing `VersionRuntimeSchema` still fails closed with the RUN2-10
   logging and 4xx behaviour.
5. New unit tests cover 1, 3 and 4; existing runtime tests pass unmodified.
6. Gates green.

---

## Phase 1 Gate

- [x] RVP-1 ✅ — verified 2026-07-26: type-check 0, lint 0, `test:fast` 1886 passed,
      `tests/integration/api.runs.runtime.test.ts` green (proves getRuntime's
      response shape is byte-identical), 9 existing RunRuntimeService unit tests
      pass unmodified. Commit `186d5c7b`.
- [x] **Option B decided by Shawn, 2026-07-26** — recorded above; RVP-6 added to
      implement it, and Phase 2 corrected to sequential dispatch — record the decision in this
      file before Phase 2 is dispatched

---

# Phase 2 — Thread it through the decision paths

Each ticket below replaces live-table reads with the provider.

**Correction (2026-07-26): these must run SEQUENTIALLY, not in parallel.** The
original text here claimed they touch different files; that was wrong. RVP-2
changes `LogicService`'s signatures, and its callers are
`RunExecutionCoordinator`, `RunCompletionService`, `RunLifecycleService` and
`RunService` — precisely RVP-3, RVP-4 and RVP-6's files. RVP-2 therefore has to
touch them at least enough to keep the tree compiling, and a parallel dispatch
would collide.

**Dispatch order: RVP-6 → RVP-2 → RVP-3 → RVP-4 → RVP-5.** RVP-6 goes first
because it establishes the "every new run is pinned" invariant while the
decision paths still read live tables, so it is behaviour-neutral on its own.

---

## RVP-6 — Pin every new run at creation ✅

**Priority: P0** · Size: M · File: `server/services/RunService.ts`

*Implements the Option B decision recorded above. Added 2026-07-26.*

### Finding

`RunService.createRun` permits a run with no version
(`server/services/RunService.ts:169-174`):

```ts
const targetVersionId = workflow.pinnedVersionId ?? workflow.currentVersionId;
if (!targetVersionId && !userId) {
  throw new Error('Workflow has no published version for anonymous runs');
}
if (!targetVersionId) {
  logger.warn({ workflowId }, "No current or pinned version found for workflow, run might be unstable");
}
```

Anonymous runs already refuse, so this only affects a signed-in creator
test-running an unpublished draft. Those runs then have nothing for the pinned
definition to resolve from, which is what forces the dual code path the rest of
this initiative is trying to remove.

### Preferred fix

When `targetVersionId` is absent and the caller is authenticated, create a draft
version and pin the run to it, before the run row is inserted. Use the existing
`versionService.createDraftVersion(workflowId, userId, notes?)` — do not write a
second serializer.

Handle its `null` return correctly: `createDraftVersion` returns `null` when the
checksum matches the latest version, meaning nothing changed and no new row was
written. In that case fetch and use the **latest existing version** for the
workflow. Treating `null` as a failure would break exactly the common case of a
creator re-running an unchanged draft.

Leave the anonymous guard exactly as it is — it must keep throwing. Do not
back-fill existing runs; pre-existing null runs keep resolving via the
provider's `source: 'live'` branch (Option A fallback), which RVP-1 built.

### Ties

- Implements the Option B decision; **must land before RVP-2**.
- Touches `RunService.ts`, which RVP-2 also edits for a call-site update —
  sequential, not parallel.
- Load `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. A creator run on a workflow with no published or pinned version results in a
   run whose `workflowVersionId` is set, and a draft version exists for it.
2. When `createDraftVersion` returns `null` (unchanged checksum), the run pins to
   the latest existing version rather than erroring or staying null.
3. A run on a workflow that already has a published or pinned version is
   unchanged — no new version is created.
4. An anonymous run on a workflow with no published version still throws
   `'Workflow has no published version for anonymous runs'`.
5. New tests assert 1–4. Gates green, including
   `tests/integration/api.runs.*` and `tests/integration/activation-publish.test.ts`.

## RVP-2 — LogicService decides from the pinned definition ✅

**Priority: P0** · Size: M · File: `server/services/LogicService.ts`

### Finding

All three entry points re-read the live tables (`LogicService.ts:68`, `:123`,
`:188`) and none accepts a version. `validateCompletion` is where this hurts
most: it builds the required-step set from the live definition, so a required
question added after a respondent started blocks their submission with
"Missing required steps: <title>" for something they were never shown.

### Preferred fix

Have `buildContext`, `evaluateNavigation` and `validateCompletion` take the run
(or a pre-resolved definition) rather than a bare `workflowId`, and source
sections/steps/rules from RVP-1's provider. Do not change the evaluation
semantics — `evaluateWorkflowVisibility` and the RUN2-2/3/5/11 fixes inside it
stay exactly as they are; only the *inputs* change.

Update callers: `RunExecutionCoordinator`, `RunCompletionService`,
`RunLifecycleService`, `RunService.resolveInitialSectionId`.

### Acceptance criteria

1. Navigation and completion validation for a pinned run use the pinned
   definition; editing the live workflow does not change either.
2. A required step added to the live workflow after a run started does not block
   that run's completion.
3. A versionless run behaves exactly as today.
4. New tests assert 1–3, including the "required step added mid-run" regression.
5. Gates green, including `tests/unit/services/LogicService.queryCounts.test.ts`.

---

## RVP-3 — RunExecutionCoordinator submits and navigates against the pinned definition 🔲

**Priority: P0** · Size: M · File: `server/services/runs/RunExecutionCoordinator.ts`

### Finding

Five live-table reads (`:109`, `:175`, `:225`, `:297`, `:298`). `submitSection`
is the one respondents hit on every page; RUN2-15 stopped it throwing on a
deleted step, but the answer is still dropped and the visibility/alias maps are
still built from the live definition.

### Preferred fix

Source `steps`, `getVisibleStepIds`, `getWorkflowStepIds` and `getAliasMap` from
the provider. Once section steps come from the pinned definition, RUN2-15's
"dropped ids" branch should become unreachable for pinned runs — keep the guard
(versionless runs still need it) but note in a comment that it is now a
fallback, and confirm with a test that a pinned run no longer drops anything.

### Acceptance criteria

1. Section submit validates against the pinned definition's steps.
2. A question deleted from the live workflow after the run started is still
   accepted and saved for that run — no dropped-value warning.
3. RUN2-15's cross-section mass-assignment error still fires.
4. JS questions and the alias map resolve from the pinned definition.
5. New tests assert 1–4. Gates green.

---

## RVP-4 — RunLifecycleService resolves start section and documents from the pinned definition ✅

**Priority: P1** · Size: S · File: `server/services/workflow-runs/RunLifecycleService.ts`

### Finding

`determineStartSection` builds its context from the live workflow
(`RunLifecycleService.ts:237`) and throws "Workflow has no sections" from live
data. `generateDocuments` collects final-block configs from
`stepRepo.findByWorkflowIdWithAliases` — so a run generates documents from
whatever the final block says *now*, not what it said when the respondent
answered.

### Preferred fix

Use the provider for both. Document generation is the higher-stakes half: a
document produced from an edited template mapping after the fact is a
correctness and auditability problem, not just a UX one.

### Acceptance criteria

1. Start-section resolution uses the pinned definition.
2. Document generation collects final-block configs from the pinned definition.
3. Versionless runs behave as today.
4. New tests assert 1–3. Gates green.

---

## Phase 2 Gate

- [ ] RVP-2, RVP-3, RVP-4 ✅ · gates green · affected integration files green
- [ ] `grep -rn "findByWorkflowId\|findBySectionId" server/services/LogicService.ts server/services/runs/RunExecutionCoordinator.ts` returns only provider-internal or versionless-fallback uses

---

## RVP-7 — Persistence re-validates against live tables, defeating RVP-3 ✅

**Priority: P0 (bug)** · Size: M · File: `server/services/runs/RunPersistenceWriter.ts`

*Found by RVP-5 while writing the end-to-end regression suite, 2026-07-26. This
is precisely what that suite exists to catch: every unit test mocks
`RunPersistenceWriter`, so the interaction between the fixed coordinator and the
unfixed writer was invisible until a real database was involved.*

### Finding

RVP-3 made `RunExecutionCoordinator.submitSection` resolve a section's steps
from the run's pinned definition, so an answer to a question the author deleted
after the run started is correctly accepted. It then hands those values to
`RunPersistenceWriter`, which throws them out again by re-deriving membership
from the **live** tables (`RunPersistenceWriter.ts:145-152`):

```ts
const workflowSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
const stepsById = new Map(workflowSteps.map(s => [s.id, s]));
...
if (!stepsById.has(v.stepId)) {
    throw new Error(`Step ${v.stepId} does not belong to workflow ${workflowId}`);
}
```

`findByWorkflowIdWithAliases` filters soft-deleted steps (`isNull(steps.deletedAt)`),
so a step still legitimately present in the run's pinned definition is rejected.
`saveStepValue` (`:106-113`) has the same defect via `stepRepo.findById` +
`sectionRepo.findById`.

Observed against a real database:

```
Error: Step <id> does not belong to workflow <id>
  at RunPersistenceWriter.bulkSave (RunPersistenceWriter.ts:152)
  at RunExecutionCoordinator.submitSection (:144)
```

**This is worse than the pre-RVP-3 baseline.** RUN2-15 dropped the single
unknown value with a warning and let the respondent continue; now `bulkSave`
throws before persisting **any** value in the batch, so the whole section submit
fails. It directly contradicts RVP-3's own AC2.

### Preferred fix

Resolve the step set the same way every other run decision now does: through
`RunDefinitionProvider` (RVP-1), keyed on the run rather than the workflow.
Every entry point already receives `runId`.

- `bulkSave` builds `stepsById` from `definition.steps` instead of
  `stepRepo.findByWorkflowIdWithAliases`.
- `saveStepValue` checks membership against the same definition rather than
  `stepRepo.findById` + `sectionRepo.findById`.
- `validateBulkValues` keeps its current behaviour; widen its `stepsById`
  parameter structurally so it accepts either a live `Step` row or the
  provider's `RunStep`, exactly as RVP-2 did for `LogicContext` and RVP-3 did
  for `validatePage`.

A versionless run resolves through the provider's `source: 'live'` branch, so
its behaviour is unchanged. Keep the membership check itself — it is the
anti-mass-assignment guard; only its **source** changes.

### Ties

- Unblocks **RVP-5**, whose test should then pass unmodified — use it as the
  acceptance check.
- Depends on RVP-1; builds on RVP-3.
- Load `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. A value for a step present in the run's pinned definition but soft-deleted
   from the live workflow is persisted, not rejected.
2. A value for a step that exists in neither is still refused — the
   mass-assignment guard survives.
3. A versionless run behaves exactly as today.
4. Format validation (`validateBulkValues`) is unchanged in behaviour.
5. `tests/integration/run-version-pinning-rvp5.test.ts` passes unmodified.
6. Gates green: type-check, lint, `test:fast`, and the affected integration files.

---

# Phase 3 — Prove it

## RVP-5 — End-to-end proof that editing a live workflow cannot break an in-flight run ✅

**Priority: P1** · Size: M · File: `tests/integration/` (new)

### Preferred fix

One integration test that reproduces each of the four consequences listed at the
top of this file, against a real database:

1. start a run on a published workflow;
2. mutate the live workflow — delete a question, add a **required** question,
   reorder sections, edit a logic rule;
3. assert the run still renders, submits, navigates and **completes**, with the
   definition it started with.

This is the regression net for the whole initiative; without it the next
refactor silently reintroduces the split.

### Acceptance criteria

1. Each of the four mutations has a case, and each asserts the run completes.
2. The test fails if any decision path is reverted to live-table reads (verify
   by temporarily reverting one and observing a red test — state this in the
   report).
3. Gates green.

---

## Status

| Ticket | Title | Status |
|---|---|---|
| RVP-1 | Extract a run-definition provider | ✅ Done 2026-07-26 (186d5c7b) |
| RVP-6 | Pin every new run at creation (Option B) | ✅ Done 2026-07-26 |
| RVP-2 | LogicService uses the pinned definition | ✅ Done 2026-07-26 |
| RVP-3 | RunExecutionCoordinator uses the pinned definition | ✅ Done 2026-07-26 |
| RVP-4 | RunLifecycleService uses the pinned definition | ✅ Done 2026-07-26 |
| RVP-7 | Persistence re-validates against live tables | ✅ Done 2026-07-26 |
| RVP-5 | End-to-end mid-run-edit regression suite | ✅ Done 2026-07-26 |

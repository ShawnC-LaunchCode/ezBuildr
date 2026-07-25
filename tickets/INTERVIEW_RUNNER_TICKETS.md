# Interview Runner — Robustness & Invalid-Interview Rejection Tickets (RUN2-1..14 + escalations + backlog)

Source: full code audit of the interview runner (client render path, client/server
navigation, validation, and the publish→runtime contract), 2026-07-25.
Scope: `client/src/pages/WorkflowRunner.tsx`, `client/src/hooks/runner/*`,
`client/src/components/runner/**`, `shared/workflowLogic.ts`,
`shared/validation/*`, `server/routes/runs.routes.ts`, `server/services/RunService.ts`,
`server/services/workflow-runs/*`, `server/services/runs/RunExecutionCoordinator.ts`,
`server/services/LogicService.ts`, `server/services/IntakeQuestionVisibilityService.ts`,
`server/workflows/validation.ts`, `server/services/VersionService.ts`,
`server/services/WorkflowLintService.ts`.
Overall grade at audit time: **C-** (the render layer is well-structured and
type-routing is complete and test-guarded, but there are at least four ways to
author a workflow that publishes cleanly and then cannot be completed by any
respondent, and the only publish-time validator is a stub that returns
`{ valid: true }`).

Baseline at audit time: `npm run test:fast` → **115 files passed, 1765 tests
passed, 0 failed** (26s). All findings below are additional to a green suite.

Findings marked **[probe-confirmed]** were reproduced by executing the real
shared modules, not inferred from reading. The probe output is quoted inside the
relevant ticket.

Every finding was verified against the working tree at audit time with file:line
evidence. Line numbers may drift as fixes land — search for the quoted code if a
reference is stale.

---

## Initiative closed — 2026-07-25

**All 16 tickets ✅.** Escalation RUN2-E2 was resolved into RUN2-16; RUN2-E1 is
deferred to its own initiative and mitigated by RUN2-15.

Final gates, run by the reviewer on the working tree:

| Gate | Result |
|---|---|
| `npm run type-check` | 0 errors |
| `npm run lint` (per touched file) | 0 problems |
| `npm run test:fast` | 123 files, **1839 passed**, 0 failed (audit baseline: 1765) |
| Pre-commit hook (repo-wide ESLint + tsc + strict zones) | 4/4 on every commit |
| Integration (publish gate, runtime, prefill, first-next, activation, versioning) | green |

**Behavioural re-verification.** The defects originally caught by executing the
real modules were re-probed against the finished tree:

```
                                 BEFORE                    AFTER
answer-array mutation            MUTATED=true              MUTATED=false
backwards skip_to                A -> A -> A -> A ...      C -> null -> A -> B -> C -> null
orphan is_empty hides section    true                      false  (control: genuine rule still fires)
zero visible sections            silent dead-end screen    explicit terminal screen w/ submit
required file_upload             completion refused        requiredSteps [] -> completion valid
```

**What now rejects an invalid interview.** `VersionService.validateWorkflow` was
a stub returning `{ valid: true }`; it now runs seven structural checks plus the
reference linter, and both doors into `active` funnel through `publishVersion`,
so publish and activate share one gate. Its UUID check is tied to
`RunRuntimeService`'s `VersionRuntimeSchema` by an integration test that
publishes, starts a run, and loads the pinned runtime — anything the gate admits
is guaranteed to load at run time.

**Deferred / follow-ups:** RUN2-E1 (version pinning is client-only) and backlog
RUN2-B1..B6. B5 and B6 were filed during this initiative.

---

## How to work this document

- **Tickets are grouped into 4 phases**, ordered by risk and dependency. Do not
  start a phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer (Shawn's senior model).
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred fix**
  (the approach the reviewer expects — deviate only with a stated reason),
  **Ties** (related tickets/skills/docs — load the named skills before touching
  code), and **Acceptance criteria** (all must pass).
- **Repo-specific rules:**
  - Load the `run-tests` skill before running any test. `npm test` naively gives
    wrong results here — the suite is three Vitest projects. Default sanity
    check is `npm run test:fast` (~26s, no DB). Server tickets touching
    repositories also need `npm run test:unit` / the relevant integration file
    (needs `npm run test:docker:up`).
  - Any change under `server/routes/`, `server/services/`, or
    `server/repositories/` → load the `add-api-endpoint` skill first (error-string
    contract + tenancy invariants).
  - Any change that adds/changes a step or question type → load `add-step-type`.
  - Any change with a visible result in the browser → load the `design` skill
    (Shawn's global CLAUDE.md requires it for all UI work).
  - Gates for every ticket: `npm run type-check` (0 errors) and `npm run lint`
    (zero-error policy) on every touched file.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Runner dead-ends — workflows that publish but cannot be completed | RUN2-1..5 | ~2 days |
| 2 | Run-data integrity & prefill security | RUN2-6 | ~0.5 day |
| 3 | Reject invalid interviews at the gate (publish / activate / runtime) | RUN2-7..12 | ~2.5 days |
| 4 | Correctness & performance polish in the render layer | RUN2-13..14 | ~0.5 day |
| Escalations | Need Shawn's decision before ticketing | RUN2-E1, RUN2-E2 | — |
| Backlog | Not phase-gated | RUN2-B1..B4 | — |

---

# Phase 1 — Runner dead-ends

### Verification pass — 2026-07-25 (reviewer)

**RUN2-1 ✅, RUN2-2 ✅, RUN2-4 ✅, RUN2-5 ✅.** Remaining: RUN2-3, RUN2-15.

Gates run by the reviewer on the working tree, not taken from dev reports:
- `npm run type-check` → 0 errors
- `npm run lint` (per touched file) → 0 problems
- `npm run test:fast` → 116 files, **1787 passed**, 0 failed (baseline at audit
  time was 1765 — +22 tests from these four tickets)
- Pre-commit hook (repo-wide ESLint + tsc + strict-zone validation) → 4/4 passed
  on each commit

**Behavioral re-verification.** The four defects were originally caught by
executing the real shared modules; the same probe was re-run against the fixed
tree:

```
BEFORE                                   AFTER
PROBE1 MUTATED=true                      PROBE1 MUTATED=false
PROBE1 conditionValue mutated = true     PROBE1 conditionValue mutated = false
PROBE2 A -> A -> A -> A -> A -> A        PROBE2 C -> null -> A -> B -> C -> null
```

PROBE2 now reaches `null` (run completes) instead of pinning to one section.
PROBE3/4/5 are unchanged by design — PROBE3 is RUN2-11 (still open) and
PROBE4/5 assert engine output that RUN2-4 now *handles* in the UI rather than
changing.

Commits: `1ec61271` (RUN2-1), `94c08bf7` (RUN2-4), `85b187ad` (RUN2-2 + RUN2-5).

**Deviations accepted at review:**
- RUN2-1 made `logicRuleRepo` a class field rather than a 6th constructor
  param, because the constructor was already at the repo's `max-params: 5`
  ceiling. Correct call — the alternative was a lint suppression.
- RUN2-4 determined "completable" from `actualRunId != null` rather than
  re-running required-step validation. Sound: with zero visible sections the
  required set is empty by construction, so the check would be vacuous.
- RUN2-2 and RUN2-5 share one commit. Both landed in `shared/workflowLogic.ts`
  before the first could be committed, so they were not separable by path. A
  reviewer sequencing error, not a dev error.

---

Five independent ways an author can build a workflow that saves, publishes, and
then traps the respondent with no path to submission. Each is a distinct code
path; all five are in scope for this phase. Out of scope here: *preventing*
these at publish time (that is Phase 3) — Phase 1 makes the runner itself
survivable, Phase 3 stops the bad definition from shipping.

## RUN2-1 — Section submit uses a different visibility engine than the rest of the runner ✅

**Priority: P0 (bug)** · Size: M · File: `server/services/runs/RunExecutionCoordinator.ts`

### Finding

There are two visibility engines on the same request path, and they disagree.

The client render path, `POST /api/runs/:id/next` (`LogicService.evaluateNavigation`)
and `PUT /api/runs/:id/complete` (`LogicService.validateCompletion`) all use
`evaluateWorkflowVisibility` from `shared/workflowLogic.ts`, which evaluates
**logic rules *and* `visibleIf`**, and **fails closed** (an unparseable
`visibleIf` hides the target — `shared/workflowLogic.ts:192-199`).

But `POST /api/runs/:runId/sections/:sectionId/submit` — the gate the respondent
must pass on every single page — uses a different service
(`server/services/runs/RunExecutionCoordinator.ts:108-117`):

```ts
const visibility = await intakeQuestionVisibilityService.evaluatePageQuestions(
    sectionId, runId, dataMap
);
const validationResult = validatePage(steps, dataMap, visibility.visibleQuestions);
```

`IntakeQuestionVisibilityService.evaluatePageQuestions`
(`server/services/IntakeQuestionVisibilityService.ts:110-141`) evaluates **only
`step.visibleIf`**. It never loads or applies logic rules, and it **fails open**:

```ts
} catch (error) {
  // Default to visible on error (fail-safe)
  isVisible = true;
```

Consequences, both of which hard-block the respondent on the Next button with an
error about a field they cannot see:

1. Any workflow using a rule-based **hide** on a **required** step: the client
   hides the step (rule applied), so the respondent never answers it; the server
   considers it visible (rules ignored) and `validatePage` reports
   `"<title> is required"`. The run cannot advance past that page. Rule-based
   show/hide is a first-class documented feature (`conditionalActionEnum`), so
   this is not an edge case.
2. A malformed `visibleIf` on a required step: client hides it (fail-closed),
   server requires it (fail-open). Same block, opposite direction.

### Preferred fix

Make section submit use the same engine as every other path. In
`RunExecutionCoordinator.submitSection`, replace the
`intakeQuestionVisibilityService.evaluatePageQuestions` call with
`logicService`-derived visibility, mirroring how `LogicService.validateCompletion`
(`server/services/LogicService.ts:180-213`) builds its inputs: load sections,
steps, and logic rules, call `evaluateWorkflowVisibility`, and pass the visible
step ids for the submitted section into `validatePage`.

Do **not** patch `IntakeQuestionVisibilityService` to add rules — it has its own
callers (intake preview) and a 30s cache with different semantics; leave it
alone and stop using it from the run-submit path. Do not change the fail-closed
semantics of `evaluateWorkflowVisibility`; fail-closed is the correct posture and
the rest of the system already relies on it.

### Ties

- Touches the same method as **RUN2-3** (`submitSection` validation) — **work
  RUN2-1 first, then RUN2-3**; they must not be dispatched in parallel.
- Load `add-api-endpoint` (service-layer conventions) and `run-tests`.
- Existing tests to keep green: `tests/unit/services/RunExecutionCoordinator.test.ts`,
  `tests/unit/services/intakeQuestionVisibility.test.ts`.

### Acceptance criteria

1. `submitSection` computes visible step ids via `evaluateWorkflowVisibility`
   (logic rules + `visibleIf`), not `IntakeQuestionVisibilityService`.
2. A required step hidden by a `hide` **logic rule** is excluded from
   `validatePage` and the section submit returns `{ success: true }`.
3. A required step whose `visibleIf` is malformed is treated as **hidden**
   (fail-closed), matching `evaluateWorkflowVisibility`, and does not block submit.
4. A required, visible step with no value still returns
   `{ success: false, errors: ["<title>: <title> is required"] }` (existing
   behavior unchanged).
5. New tests in `tests/unit/services/RunExecutionCoordinator.test.ts` assert 2, 3,
   and 4.
6. `npm run type-check` 0 errors; `npm run lint` clean on touched files;
   `npm run test:fast` green.

---

## RUN2-2 — A backwards `skip_to` rule traps the run in an infinite navigation loop ✅

**Priority: P0 (bug)** · Size: S · File: `shared/workflowLogic.ts`

### Finding

`skip_to` unconditionally overrides normal flow and is never checked for
direction or for having already been visited
(`shared/workflowLogic.ts:127-130`, `shared/workflowLogic.ts:429-448`):

```ts
case 'skip_to':
  // Set the skip target - this takes precedence over normal flow
  result.skipToSectionId = targetId;
```
```ts
if (skipToSectionId) {
  if (visibleSections.has(skipToSectionId)) {
    return skipToSectionId;
  }
```

If the skip target is at or before the current section and the triggering
condition stays true (which it does — the answer that triggered it does not
change by navigating), every `POST /next` returns the same section forever.

**[probe-confirmed]** Executing the real module with sections A(1), B(2), C(3),
all visible, and one rule `q1 equals "yes" → skip_to A`, starting at B:

```
PROBE2 skip_to-backwards navigation sequence from B: A -> A -> A -> A -> A -> A
```

The respondent can press Next indefinitely and never reach the review screen.
Nothing in the builder, the linter, or publish prevents authoring a backwards
`skip_to` — it is a plain choice in the logic UI.

Secondary defect in the same function: multiple firing `skip_to` rules
silently last-one-wins in array order, and `evaluateRules` never sorts by
`rule.order`, so which target wins is effectively arbitrary.

### Preferred fix

In `resolveNextSection`, treat a skip target that is **not strictly after** the
current section as a no-op and fall through to normal flow. `resolveNextSection`
currently does not receive the current section, so extend its signature to take
`currentSectionId: string | null` and compare `order` values from the already-
supplied `sections` array (the same sorted-by-`order` list
`calculateNextSection` uses). Update both call sites in
`server/services/LogicService.ts:146-152`.

For the multiple-`skip_to` case, make `evaluateRules` deterministic: process
section rules in ascending `rule.order` and keep the **first** firing `skip_to`,
not the last. Do not change the show/hide precedence semantics.

### Ties

- Also edits `shared/workflowLogic.ts`, same as **RUN2-5** — **sequence: RUN2-2
  then RUN2-5**, do not dispatch in parallel.
- Load `run-tests`. Existing tests: `tests/unit/shared/workflowLogic.test.ts`,
  `tests/unit/services/LogicService.queryCounts.test.ts`.

### Acceptance criteria

1. A `skip_to` rule targeting a section with `order` <= the current section's
   `order` is ignored; navigation proceeds to the next visible section by order.
2. A forward `skip_to` still works exactly as today, including the existing
   "skip target not visible → first visible after it" fallback.
3. With two firing `skip_to` rules, the one with the lower `rule.order` wins,
   deterministically.
4. New tests in `tests/unit/shared/workflowLogic.test.ts` assert 1, 2, and 3,
   including a regression test that six consecutive `resolveNextSection` calls
   from a backwards-skip workflow terminate rather than repeating one id.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-3 — A required question the runner cannot render makes the interview unfinishable ✅

**Priority: P0 (bug)** · Size: M · Files: `shared/validation/BlockValidation.ts`, `server/workflows/validation.ts`, `client/src/components/runner/blocks/BlockRenderer.tsx`

### Finding

The runner classifies three persisted step types as intentionally unsupported
(`client/src/components/runner/blocks/stepTypeRouting.ts:54-58`):

```ts
export const RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES = [
  "file_upload", "loop_group", "repeater",
] as const satisfies readonly RunnerStepType[];
```

For these, `BlockRenderer` renders a static notice with no input
(`BlockRenderer.tsx:112-114`, `ExplicitRunnerTypeNotice`). But both validators
still require a value:

- Client: `shared/validation/BlockValidation.ts:53-56` pushes
  `{ type: "required" }` for **any** step type when `step.required` is true.
- Server: `server/workflows/validation.ts:161-168` builds
  `{ required: step.required }` for every non-hidden step regardless of type.

So a required `file_upload` question — creatable today, since `file_upload` is a
live member of `stepTypeEnum` (`shared/schema/workflow.ts:38`) and
`GenericStepEditor` explicitly keeps it editable
(`client/src/components/builder/cards/GenericStepEditor.tsx:8`) — produces a page
the respondent can never satisfy. Same class of failure, same blocking outcome:

- a `choice` question that resolves to zero options renders "No options
  available" (`ChoiceBlock.tsx:241-243`) and cannot be answered;
- a `choice` question with a `display` value that is neither `radio`,
  `dropdown`, nor `multiple` falls through to "Invalid choice configuration"
  (`ChoiceBlock.tsx:266-267`);
- a `multi_field` question whose `config.fields` is empty renders no inputs
  (`MultiFieldBlock.tsx:46`).

In every case the Next button reports "<title> is required" for a control that
does not exist on screen.

### Preferred fix

Two layers, both in this ticket because they are the same concern:

1. **Never require what cannot be answered.** In
   `shared/validation/BlockValidation.ts`, skip the `{ type: "required" }` rule
   when the step type is one the runner cannot render. Export the unsupported
   set from a shared location rather than duplicating the list — move
   `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` (and the hidden set) from
   `client/src/components/runner/blocks/stepTypeRouting.ts` into `shared/`, and
   have both the client routing module and the validators import it. Mirror the
   same skip in `server/workflows/validation.ts:161-168` so client and server
   agree.
2. **Make the notice honest.** `ExplicitRunnerTypeNotice` currently says the
   type "is not available in the runner yet" with no indication that the
   question is being skipped. Since it is now never required, state that it is
   skipped for this response. This is user-visible copy — load the `design`
   skill before touching it.

Do **not** add renderers for `file_upload` / `repeater` / `loop_group` here;
that is a separate initiative. Do not silently drop the steps from the page —
the respondent and the author both need to see that something was skipped.

### Ties

- Depends on **RUN2-1** landing first (same `submitSection` validation path).
- **RUN2-9** adds the publish-time gate that stops these definitions shipping at
  all; this ticket is the runtime safety net. Both are required.
- Load `add-step-type` (the step-type enumeration checklist), `design` (for the
  notice copy), and `run-tests`.
- Existing test to keep green: `tests/unit/client/runnerStepTypeRouting.test.ts`
  (it asserts every `stepTypeEnum` value is classified — keep that invariant
  after the move to `shared/`).

### Acceptance criteria

1. The unsupported/hidden step-type sets live in one `shared/` module, imported
   by both `stepTypeRouting.ts` and the two validators; no duplicated literal lists.
2. `getValidationSchema` returns no `required` rule for `file_upload`,
   `loop_group`, `repeater`, or an unrecognized type, even when
   `step.required === true`.
3. `server/workflows/validation.ts` `validatePage` skips the same step types, so
   `POST /sections/:id/submit` does not report them as missing.
4. A section containing only a required `file_upload` step submits successfully
   and the run can reach completion.
5. The runner's notice for an unsupported/unknown type states the question is
   skipped for this response.
6. New tests: unit coverage of 2 in `tests/unit/` for `getValidationSchema`, and
   of 3/4 in `tests/unit/services/RunExecutionCoordinator.test.ts`.
   `tests/unit/client/runnerStepTypeRouting.test.ts` still passes unmodified in
   intent (every enum value classified).
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-4 — Zero visible sections leaves the respondent on a dead screen ✅

**Priority: P0 (bug)** · Size: S · Files: `client/src/pages/WorkflowRunner.tsx`, `client/src/hooks/runner/useRunNavigation.ts`

### Finding

`visibleSections` can legitimately be empty — every section hidden by rules, or
by a `visibleIf` that failed to parse (fail-closed hides the section), or a
workflow published with no sections at all.

**[probe-confirmed]** With one section and one orphaned `is_empty → hide` rule:

```
PROBE4 visibleSections size = 0  visibleSteps = 0
PROBE5 malformed visibleIf -> visibleSections = 0
```

When that happens the runner renders `QuestionRunnerScreen` with
`currentSection === undefined`. The body shows the string "No visible sections."
(`client/src/pages/WorkflowRunner.tsx:466-470`) and the navigation bar still
renders a **Next** button — which does nothing, because `handleNext` bails
immediately (`client/src/hooks/runner/useRunNavigation.ts:351`):

```ts
if (currentSection == null) {return;}
```

`isLastSection` is `0 === -1` → `false`, so the button never becomes "Review".
There is no path to the review screen, no submit, and no error. The respondent
is silently stuck on a blank card with a dead button.

Related type lie in the same hook: `UseRunNavigationReturn.currentSection` is
declared `ApiSection` but `visibleSections[currentSectionIndex]` is
`ApiSection | undefined` (`useRunNavigation.ts:277`, `:319`), which is why this
state type-checks today.

### Preferred fix

Handle "no visible sections" as an explicit terminal state rather than an
accidental one. In `WorkflowRunnerScreen`/`LoadedRunnerScreen`, branch **before**
`QuestionRunnerScreen` when `visibleSections.length === 0` and render a dedicated
screen — reuse the existing `SessionError` component shape in the same file so
the styling and dark-mode treatment already match — explaining that no questions
apply to this response, with the submit action if the run is completable, or a
clear "nothing to complete" message if it is not. Copy and layout are
user-visible: load the `design` skill.

Also correct the return type: `currentSection: ApiSection | undefined` in
`UseRunNavigationReturn`, and fix the resulting type errors at the call sites
rather than casting.

### Ties

- The publish-time counterpart is **RUN2-9** (a workflow with zero sections
  should not publish); this ticket covers the runtime states that RUN2-9 cannot
  prevent (rules hiding everything at runtime).
- Load the `design` skill (required by Shawn's global CLAUDE.md for any UI
  change) and `run-tests`.

### Acceptance criteria

1. When `visibleSections.length === 0`, the runner renders a dedicated terminal
   screen, not `QuestionRunnerScreen` with a dead Next button.
2. That screen offers a working submit path when the run has no unmet required
   steps, and otherwise states plainly that no questions apply.
3. `UseRunNavigationReturn.currentSection` is typed `ApiSection | undefined`; no
   new `as` casts were introduced to absorb it.
4. New test in `tests/unit/client/` renders `WorkflowRunner` (or the screen
   component) with zero visible sections and asserts 1 and 2.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-5 — Logic evaluation sorts the respondent's answer array in place, corrupting saved data ✅

**Priority: P0 (bug)** · Size: S · File: `shared/workflowLogic.ts`

### Finding

`isEqual` sorts both operands in place to compare arrays
(`shared/workflowLogic.ts:283-286`):

```ts
if (Array.isArray(actual) && Array.isArray(expected)) {
  return JSON.stringify(actual.sort()) === JSON.stringify(expected.sort());
}
```

`actual` is the live value out of the run's data map and `expected` is
`rule.conditionValue`. `Array.prototype.sort` mutates. So merely *evaluating* a
logic rule against a multi-select answer reorders the respondent's stored answer
— and on the client that array is the exact object held in `formValues` state,
which the 1.5s autosave then persists (`useRunValues.ts:150-163`).

**[probe-confirmed]** One `equals` rule evaluated once against `['c','a','b']`:

```
PROBE1 array-mutation: before=["c","a","b"] after=["a","b","c"] MUTATED=true
PROBE1 rule.conditionValue mutated = true
```

Impact: any multi-select (`choice` with `allowMultiple`, `multiple_choice`)
referenced by a logic rule has its answer order silently rewritten, and the
rule's own `conditionValue` is mutated in the in-memory rule set for the rest of
that evaluation pass. Answer order is meaningful in document generation and
DataVault writeback, so this is data corruption, not cosmetics.

### Preferred fix

Copy before sorting:

```ts
return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
```

Scan the rest of `shared/workflowLogic.ts` and `shared/conditionEvaluator.ts` for
any other in-place mutation of caller-owned values (`sort`, `reverse`, `splice`,
`push` onto an input) and fix the same way. Do not change the comparison
semantics (sorted, order-insensitive equality stays).

### Ties

- Edits `shared/workflowLogic.ts`, same file as **RUN2-2** — **sequence: RUN2-2
  then RUN2-5.**
- Load `run-tests`. Existing test: `tests/unit/shared/workflowLogic.test.ts`.

### Acceptance criteria

1. Evaluating any rule leaves both the data map's values and
   `rule.conditionValue` byte-identical to their inputs.
2. Order-insensitive array equality still returns the same boolean results as
   before for every existing case.
3. No other in-place mutation of caller-owned arrays/objects remains in
   `shared/workflowLogic.ts` or `shared/conditionEvaluator.ts`.
4. New test in `tests/unit/shared/workflowLogic.test.ts` asserts 1 by deep-equal
   comparison against a pre-evaluation clone.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-15 — Section submit throws when the author edits a published workflow mid-run ✅

**Priority: P0 (bug)** · Size: S · File: `server/services/runs/RunExecutionCoordinator.ts`

*Decided 2026-07-25: this is the agreed mitigation for escalation **RUN2-E1**
(server reads live tables, client reads the pinned version). Full version
pinning is deferred to its own initiative — do **not** attempt it here.*

### Finding

`submitSection` computes the legal step ids for a section from the **live**
tables (`RunExecutionCoordinator.ts:90-100`):

```ts
const steps = await this.stepRepo.findBySectionId(sectionId);
const sectionStepIds = new Set(steps.map(step => step.id));
const outOfSectionStepIds = values.map(v => v.stepId).filter(id => !sectionStepIds.has(id));
if (outOfSectionStepIds.length > 0) {
    throw createError.validation(`Section submit contains out-of-section stepIds: ...`);
}
```

The client submits the step ids it rendered, which come from the **pinned
version snapshot** (`RunRuntimeService.getRuntime` → `version.graphJson`). If an
author deletes or moves a step after publishing, an in-flight respondent submits
a step id that no longer exists in that live section — and gets a hard 400 they
cannot clear by any action. The run is bricked at that page.

The check itself is a legitimate anti-mass-assignment guard (it stops a caller
writing values into a section they aren't on) and must not simply be removed.

### Preferred fix

Degrade instead of throwing. Partition the submitted values:

- ids present in the live section → persist as today;
- ids that exist on **this workflow** but in a **different** section → still an
  error (that is the mass-assignment case the guard exists for), keep throwing;
- ids that exist nowhere on this workflow → drop them, and log a single warning
  with `runId`, `sectionId`, and the dropped ids.

The third bucket is the author-edited-mid-run case: the respondent's answer to a
now-deleted question is simply not saved, which is correct, and they continue.
Resolving "exists on this workflow" needs the workflow's full step id set —
`getAliasMap` in the same class (`RunExecutionCoordinator.ts:203-214`) already
loads exactly that; reuse the same repository calls rather than adding a new
query pattern.

### Ties

- **Same method as RUN2-1 and RUN2-3.** Dispatch order for this file:
  **RUN2-1 → RUN2-3 → RUN2-12 → RUN2-15.** Never in parallel.
- Mitigation for **RUN2-E1**; the escalation stays open as a future initiative.
- Load `add-api-endpoint` and `run-tests`. Existing test:
  `tests/unit/services/RunExecutionCoordinator.test.ts`.

### Acceptance criteria

1. A submitted step id that exists nowhere on the workflow is dropped, logged
   once with `runId`/`sectionId`/ids, and the submit proceeds normally.
2. A submitted step id belonging to a **different section of the same workflow**
   still throws the existing validation error, unchanged message.
3. Values for ids in the current live section are persisted exactly as today.
4. New tests in `tests/unit/services/RunExecutionCoordinator.test.ts` assert 1–3.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## Phase 1 Gate

- [ ] RUN2-1..5 and RUN2-15 all ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] `npm run test:fast` → ≥1765 passing, 0 failing
- [ ] `npm run test:unit` green (RUN2-1/RUN2-3 touch server services)
- [ ] Live verification per the `verify` skill: publish a workflow containing
      (a) a rule-hidden required step, (b) a backwards `skip_to`, (c) a required
      `file_upload`, and drive a real run to completion in the browser
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Run-data integrity & prefill security

## RUN2-6 — URL/query prefill bypasses the intake prefill allowlist ✅

**Priority: P0 (security)** · Size: M · Files: `server/services/RunService.ts`, `server/services/workflow-runs/RunLifecycleService.ts`

### Finding

The runner turns **every** unreserved URL query parameter into an initial step
value (`client/src/hooks/runner/useRunSession.ts:33-46`):

```ts
for (const [key, value] of urlParams.entries()) {
  if (RESERVED_URL_PARAMS.includes(key)) { continue; }
  try { initialValues[key] = JSON.parse(value); } catch { initialValues[key] = value; }
}
```

Those go to `POST /api/workflows/:id/runs` or
`POST /api/workflows/public/:slug/start` → `RunService.createRun(...initialValues)`
→ `RunLifecycleService.populateInitialValues`
(`RunLifecycleService.ts:99-141`), which writes any key matching a step **alias
or id**, with no allowlist consulted.

The prefill allowlist exists and is enforced — but only on the intake path:

```
server/services/IntakeService.ts:134  if (prefillParams && intakeConfig.allowPrefill && intakeConfig.allowedPrefillKeys) {
server/services/IntakeService.ts:148    if (intakeConfig.allowedPrefillKeys.includes(key)) {
```

`allowPrefill: false` therefore does nothing on `/run/:id` or a public link.
Anyone with the link can seed any question — including questions the author
intended to be computed, internal, or gated behind logic — by appending a query
parameter, and the seeded value flows into documents and DataVault writeback.

### Preferred fix

Enforce the allowlist in the run-creation path, not just intake. In
`RunService.createRun` (and `createAnonymousRun`), before calling
`populateInitialValues`, filter `mergedInitialValues` against the workflow's
`intakeConfig`, mirroring the check already written in
`IntakeService.ts:134-150` — same semantics, so extract that filtering into a
shared helper used by both rather than writing a second copy.

Decide and document the default: absent `intakeConfig`, or
`allowPrefill !== true`, must mean **no caller-supplied prefill is applied** for
anonymous/public runs. Do not weaken the authenticated creator path more than
necessary, but the same filter should apply — a creator-started run is still
driven by a URL.

Values sourced from a snapshot or from `randomize` are server-derived, not
caller-supplied, and must keep working unfiltered.

### Ties

- Load `add-api-endpoint` (service-layer authorization conventions) and `run-tests`.
- Related docs: `docs/architecture/SECURITY_THREAT_MODEL.md` (mass-assignment
  invariants — this is the same class of defect at the run layer).
- Existing tests: `tests/integration/api.runs.*.test.ts`,
  `tests/e2e/auth/anonymous-runs.e2e.ts`.

### Acceptance criteria

1. With `intakeConfig.allowPrefill !== true`, caller-supplied `initialValues` are
   ignored entirely on both `POST /api/workflows/:id/runs` and
   `POST /api/workflows/public/:slug/start`.
2. With `allowPrefill: true` and `allowedPrefillKeys: ["email"]`, only `email` is
   applied; any other supplied key is dropped (not an error).
3. Snapshot- and `randomize`-derived values are unaffected by the filter.
4. The filtering logic is shared with `IntakeService`, not duplicated.
5. New integration test asserts 1, 2, and 3.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` and
   the touched integration file green.

---

## RUN2-16 — Unify the two validation engines and make the server authoritative ✅

**Priority: P1 (security)** · Size: M · Files: `server/workflows/validation.ts`, `shared/validation/*`

*Decided 2026-07-25: this is escalation **RUN2-E2**, scoped to "one shared
engine, `pattern` guarded, warn-mode rollout". Read that escalation section
before starting.*

### Finding

There are two validation engines with different rulesets, and the weaker one is
the only one that is enforced.

Server (`server/workflows/validation.ts:161-165`):

```ts
const config: FieldValidationConfig = {
  required: step.required ?? undefined,
  // TODO: Extract from step.config if stored there
};
```

`validateField` directly above it fully implements minLength, maxLength, min,
max, email, and pattern (`validation.ts:44-110`) — and none of it is ever
reachable, because nothing populates the config from `step.config`.

Client (`shared/validation/BlockValidation.ts:63-150`) derives all of those rules
per step type and `useRunNavigation.handleNext` enforces them before submitting.
So every format rule an author configures is **presentation-only**: a direct
`POST /api/runs/:id/values/bulk`, or a section submit built by hand, stores any
value in any field. That data flows into generated documents and DataVault
writeback.

### Preferred fix

Do not add a second copy of the rules to the server. Make the server use the
shared derivation:

1. `server/workflows/validation.ts` `validatePage` calls `getValidationSchema`
   from `shared/validation/BlockValidation.ts` and evaluates it with the shared
   `Validator` (`shared/validation/Validator.ts`) — the same code the client
   runs. Keep the server-only concerns in place: visibility filtering (post
   RUN2-1) and the `repeater` branch at `validation.ts:145-160`.
2. **Warn-mode first.** Add an env-gated mode where a server-side failure that
   the old `required`-only check would have passed is **logged** (with `runId`,
   `stepId`, rule, and value shape) but does not block. Default the flag to
   warn-mode in this ticket; flipping to enforce is a follow-up decision once
   the logs are clean. This is what keeps in-flight runs holding
   non-conforming values from breaking on deploy.
3. **Bound `pattern`.** Author-supplied regex must never be compiled and run
   unbounded on the event loop. Reject patterns over a fixed length, cap the
   input length matched, and execute under a timeout. If a pattern is rejected
   by the guard, log it and skip that rule rather than failing the respondent.

### Ties

- **Depends on RUN2-1** (visibility source) and **RUN2-3** (unrenderable types
  must not be required) — both touch `validatePage`. Dispatch order:
  **RUN2-1 → RUN2-3 → RUN2-16.**
- Load `add-api-endpoint` and `run-tests`.
- Related: `docs/architecture/SECURITY_THREAT_MODEL.md`.

### Acceptance criteria

1. `server/workflows/validation.ts` derives its rules from
   `shared/validation/BlockValidation.ts`; no duplicated per-type rule logic
   remains on the server.
2. In enforce mode, a section submit whose value violates a configured
   minLength / maxLength / min / max / email rule returns
   `{ success: false, errors: [...] }`.
3. In warn-mode (the default this ticket ships), the same submit succeeds and
   logs one warning per violated rule with `runId`, `stepId`, and the rule.
4. A `pattern` longer than the configured bound, or a match exceeding the
   timeout, is skipped with a log — never hangs the request and never fails the
   respondent.
5. `required` behavior is byte-identical to today in both modes.
6. New tests assert 2, 3, 4, and 5, including a catastrophic-backtracking
   pattern (e.g. `(a+)+$` against a long non-matching input) completing well
   inside the timeout.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## Phase 2 Gate

- [ ] RUN2-6 and RUN2-16 ✅ with dated verification notes
- [ ] `npm run type-check` 0 errors; `npm run lint` 0 errors; `npm run test:fast` green
- [ ] Integration test for the prefill filter green (`npm run test:docker:up` first)
- [ ] Live verification: `/run/<id>?someAlias=injected` does **not** seed the
      question when `allowPrefill` is off
- [ ] Reviewer has committed the ticket + this gate

---

# Phase 3 — Reject invalid interviews at the gate

This is the phase that answers "make sure the runner can reject invalid
interviews so nothing can be imported incorrectly." Today the only structural
validator that runs before a workflow goes live is a stub. Phase 3 builds the
real gate, fixes the linter that the gate depends on, and makes the runtime's
own rejection legible instead of a generic 500.

## RUN2-7 — `POST /api/workflows/:id/publish` activates a workflow without running the lint gate ✅

**Priority: P1** · Size: S · Files: `server/routes/versions.routes.ts`, `server/services/VersionService.ts`

### Finding

`PUT /api/workflows/:workflowId/status` gates activation on the linter
(`server/routes/workflows.routes.ts:262-268`):

```ts
if (status === 'active') {
  const lintResults = await workflowLintService.lint(workflowId, userId);
  const errors = lintResults.filter(r => r.type === 'error');
  if (errors.length > 0) {
    return res.status(400).json({ message: `Cannot activate workflow: ...` });
  }
}
```

But `POST /api/workflows/:id/publish` (`server/routes/versions.routes.ts:91`)
reaches the same end state through `VersionService.publishVersion`, which sets
`status: 'active'` directly (`server/services/VersionService.ts:328-335`) and
runs **no** lint at all. The two doors into "active" have different locks, and
publish is the one the builder actually uses.

Secondary issue in the same method: `publishVersion` calls
`serializeWorkflow(workflowId, userId)` at line 281 **before** the
`aclService.hasWorkflowRole(userId, workflowId, 'edit')` check at line 282-285 —
work is done before authorization is established.

### Preferred fix

Move the lint gate into `VersionService.publishVersion` so both doors share it,
and have `PUT /status` keep calling it (or delegate) rather than duplicating.
Reuse the existing error shape so the builder's existing handling still works.
Reorder the ACL check to run before `serializeWorkflow`.

Add a `force` escape hatch only if one already exists — `publishVersion` already
takes `force: boolean`; honor it for lint errors the same way it currently
would for `validation.errors`, and log the forced publish to `auditLogs` as the
method already does.

### Ties

- **Depends on RUN2-8** — turning the gate on while the linter emits false
  positives would block valid workflows from publishing. **Work RUN2-8 first.**
- **RUN2-9** extends what the gate checks. Both touch `VersionService`; sequence
  RUN2-8 → RUN2-7 → RUN2-9.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. `POST /api/workflows/:id/publish` returns **400** with the lint error messages
   when the workflow has lint errors, and does not create a version or set
   `status: 'active'`.
2. `force: true` still publishes, and the audit log records `forced: true` plus
   the lint errors that were overridden.
3. The ACL `edit` check runs before `serializeWorkflow`.
4. `PUT /api/workflows/:workflowId/status` behavior is unchanged for callers.
5. New integration test asserts 1, 2, and 3.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-8 — The lint gate reports false "unknown alias" errors that block valid workflows ✅

**Priority: P1 (bug)** · Size: S · File: `server/services/WorkflowLintService.ts`

### Finding

`WorkflowLintService.lint` builds its alias set from step aliases plus a
`section.alias` field that the serializer never emits
(`WorkflowLintService.ts:38-47`):

```ts
for (const section of sections) {
  if (section.alias) {validAliases.add(section.alias);}
```

`VersionService.serializeWorkflow` maps sections to
`{ id, title, description, order, visibleIf, skipIf, config, steps }` — there is
no `alias` key (`server/services/VersionService.ts:102-126`). Meanwhile the same
serializer sets a section rule's `targetAlias` to the **section title**, and a
condition's `conditionStepAlias` to the step's alias **or the raw step id when
the step has no alias** (`VersionService.ts:130-135`):

```ts
conditionStepAlias: rule.conditionStepId ? (stepIdToAlias.get(rule.conditionStepId) ?? rule.conditionStepId) : '',
targetAlias: (rule.targetType === 'section' && rule.targetSectionId) ? (sectionIdToAlias.get(rule.targetSectionId) ?? rule.targetSectionId) : ...
```

`lintLogicRules` then compares those against the step-alias set
(`WorkflowLintService.ts:67-76`) and emits `type: "error"`. Result:

- **every** section-targeted show/hide/skip rule → `Logic rule target references
  unknown alias: "<section title>"`;
- **every** rule whose condition step has no alias → `Logic rule condition
  references unknown alias: "<uuid>"` (aliases are optional — the linter itself
  only *warns* about a missing alias at line 58).

Both are hard `error`s, so today `PUT /status → active` refuses to activate
entirely ordinary workflows. This must be fixed before RUN2-7 turns the same
gate on for publish.

### Preferred fix

Validate rule references against what they actually are:

- Section targets: resolve against the set of section **ids and titles** present
  in the serialized data, not step aliases.
- Condition/step targets: accept a step **alias or id**.

Keep the genuine cases erroring — a rule pointing at an alias/id that exists
nowhere in the workflow is still a real error and should still block. Prefer
matching on ids where the serializer emits them (`rule.targetId`,
`rule.conditionStepId` are both present in `WorkflowContentData`) and treat the
alias fields as a fallback, which removes the title-collision ambiguity entirely.

### Ties

- **Blocks RUN2-7** — do this first.
- Load `run-tests`. Existing test: `tests/unit/services/WorkflowLintService.test.ts`
  (extend it; it currently does not cover section-targeted rules).

### Acceptance criteria

1. A workflow with a section-targeted `hide` rule lints with **zero** errors.
2. A workflow with a rule whose condition step has no alias lints with zero
   errors.
3. A rule referencing a step alias/id that exists nowhere still produces a
   `type: "error"`.
4. A rule referencing a section id/title that exists nowhere still produces a
   `type: "error"`.
5. New tests in `tests/unit/services/WorkflowLintService.test.ts` assert 1–4.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-9 — `validateWorkflow` is a stub: nothing structurally validates a workflow before it goes live ✅

**Priority: P0** · Size: M · Files: `server/services/VersionService.ts`, `server/services/WorkflowLintService.ts`

### Finding

The publish-time validator is a hardcoded pass
(`server/services/VersionService.ts:200-202`):

```ts
validateWorkflow(_workflowId: string, _graphJson: WorkflowGraph): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}
```

Its docstring above still claims it checks "Acyclic graph / Valid expressions /
Template placeholders resolved / Required collections exist". It checks nothing,
and `publishVersion` consumes the result at line 288 as though it did.

Consequence: every runner dead-end in Phase 1 can be published without
resistance. Specifically, none of the following is caught today:

- a required step of a type the runner cannot render (RUN2-3);
- a `skip_to` rule targeting an earlier section (RUN2-2);
- a workflow whose sections are all hidden by an always-true rule (RUN2-4);
- a `choice` step with zero options, or a `display` mode outside
  `radio | dropdown | multiple`;
- a logic rule whose `targetStepId` / `targetSectionId` resolves to nothing;
- a step id or section id that is not a UUID, which the runtime schema later
  rejects outright (see RUN2-10).

### Preferred fix

Implement `validateWorkflow` as the structural gate, and call it from the same
place the lint gate runs (after RUN2-7 lands, that is one place). Keep the
existing `ValidationResult { valid, errors, warnings }` contract so the call site
at `VersionService.ts:288` needs no change.

Checks to implement as **errors** (block publish):

1. At least one section, and at least one non-virtual step (today only the
   linter checks this, and only on the `PUT /status` door).
2. Every step id and section id is a UUID — must match
   `VersionStepSchema` / `VersionSectionSchema` in
   `server/services/workflow-runs/RunRuntimeService.ts:15-39`, so that a
   published version can never fail to parse at runtime.
3. Every step `type` is a member of `stepTypeEnum`.
4. No **required** step whose type the runner cannot render (import the shared
   set introduced in RUN2-3).
5. Every `skip_to` rule targets a section strictly after the rule's own
   position (aligns with RUN2-2's runtime rule).
6. Every logic rule resolves to an existing target and an existing condition step.
7. Every `choice` step has at least one statically-resolvable option **or** a
   dynamic source configured, and its `display` is one of the three supported
   values.

Checks to implement as **warnings** (do not block): step without alias, required
step with a `visibleIf`, and the existing lint warnings.

Reuse `WorkflowLintService` rather than reimplementing alias resolution — the
cleanest shape is `validateWorkflow` calling into the lint service for the
reference checks and adding the structural checks above. Do not duplicate the
alias-resolution logic RUN2-8 just fixed.

### Ties

- **Sequence: RUN2-8 → RUN2-7 → RUN2-9.** All three touch `VersionService` /
  `WorkflowLintService`; do not dispatch in parallel.
- Depends on the shared unsupported-type set from **RUN2-3**.
- Aligns with **RUN2-2** (skip direction) and **RUN2-10** (runtime schema).
- Load `add-api-endpoint`, `add-step-type`, and `run-tests`.

### Acceptance criteria

1. `validateWorkflow` implements checks 1–7 above, returning `valid: false` with
   a distinct, human-readable message per failed check.
2. Publishing a workflow that violates any of 1–7 returns 400 and does not
   activate the workflow (unless `force: true`, which is audit-logged).
3. Every workflow that passes `validateWorkflow` parses successfully against
   `VersionRuntimeSchema` in `RunRuntimeService` — assert this directly in a
   test by publishing and then loading the runtime.
4. The stale docstring above `validateWorkflow` is replaced with an accurate one.
5. New tests cover each of checks 1–7 (one failing fixture each) plus the happy
   path, and assert 3.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green;
   the touched integration file green.

---

## RUN2-10 — A version the runtime schema rejects surfaces as a generic 500 with no diagnostic ✅

**Priority: P1** · Size: S · Files: `server/services/workflow-runs/RunRuntimeService.ts`, `server/routes/runs.routes.ts`

### Finding

`RunRuntimeService.getRuntime` validates the pinned `graphJson` and throws a
bare string on failure (`RunRuntimeService.ts:136-139`):

```ts
const parsed = VersionRuntimeSchema.safeParse(version.graphJson);
if (!parsed.success) {
  throw new Error("Invalid runtime definition for workflow version");
}
```

`classifyRouteError` (`server/utils/routeErrors.ts`) matches only "not found",
"Access denied"/"Unauthorized"/"Only the", and "Validation error" — none of which
this message contains — so it becomes **500 / "Failed to fetch run runtime"**.
The `parsed.error` detail is discarded and never logged.

For the respondent that is a "Session Error / We couldn't start this workflow"
card with an unhelpful message. For the author there is nothing in the logs
saying *which* field of *which* step was wrong. The file's own header comment
records that this exact class of bug already 500'd the entire runner once for
every newly-activated workflow (the `.optional()` vs `.nullish()` incident), so
the failure mode is proven, not hypothetical.

### Preferred fix

Keep failing closed — a definition the runtime cannot trust must not render —
but make the failure diagnosable:

1. Log `parsed.error.issues` at `error` level with `runId`, `workflowId`, and
   `versionId` before throwing. This is the piece that would have made the prior
   incident a five-minute fix.
2. Throw an error the classifier maps to a 4xx: use the `createError.validation`
   helper (`server/utils/errors.ts`) so `statusCode` drives the mapping, matching
   the pattern `classifyRouteError` documents for intentional 4xx.
3. In the client, `SessionError` already displays the server message
   (`WorkflowRunner.tsx:225-242`) — no change needed once the message is real,
   but confirm the text does not leak internal field paths to anonymous
   respondents; keep the respondent-facing copy generic and put the detail in
   the log.

### Ties

- **RUN2-9** makes this path unreachable for newly published workflows; this
  ticket covers versions already in the database and any future schema drift.
- Load `add-api-endpoint` (error-string contract — read the `classifyRouteError`
  section carefully) and `run-tests`.
- Existing tests: `tests/unit/services/RunRuntimeService.test.ts`,
  `tests/integration/api.runs.runtime.test.ts`.

### Acceptance criteria

1. A version whose `graphJson` fails `VersionRuntimeSchema` produces a server log
   at `error` level containing the Zod issues, `runId`, `workflowId`, `versionId`.
2. `GET /api/runs/:runId/runtime` returns **4xx**, not 500, for that case.
3. The respondent-facing message contains no internal field paths or ids.
4. New tests in `tests/unit/services/RunRuntimeService.test.ts` assert 1 and 2.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-11 — An unresolvable logic rule becomes an always-true `is_empty` rule at runtime ✅

**Priority: P1 (bug)** · Size: S · Files: `server/services/workflow-runs/RunRuntimeService.ts`, `shared/workflowLogic.ts`

### Finding

When a published version's rule cannot resolve its condition step,
`RunRuntimeService` substitutes an empty string
(`RunRuntimeService.ts:175`):

```ts
conditionStepId: rule.conditionStepId ?? stepIdByAlias.get(rule.conditionStepAlias ?? "") ?? "",
```

`evaluateCondition` then reads `data[""]` → `undefined`
(`shared/workflowLogic.ts:235`), and for the `is_empty` operator `undefined` is
empty, so the rule **fires unconditionally**.

**[probe-confirmed]** One rule `{ conditionStepId: '', operator: 'is_empty',
action: 'hide', targetSectionId: 'B' }` against data `{ q1: 'anything' }`:

```
PROBE3 orphan is_empty rule hid section B = true
```

A broken rule therefore does not degrade to "no effect" — it degrades to
"always hide", which can silently remove sections or steps from a live run, and
in combination with a second such rule removes the entire interview (this is the
exact fixture that produced RUN2-4's `visibleSections size = 0`).

### Preferred fix

Two guards, both needed:

1. In `RunRuntimeService`, drop rules whose condition step cannot be resolved
   rather than emitting `conditionStepId: ""`, and log each dropped rule with
   `versionId` and the unresolved alias. A rule that cannot be evaluated must
   have no effect.
2. In `shared/workflowLogic.ts` `evaluateCondition`, return `false` immediately
   when `rule.conditionStepId` is falsy, before the `is_empty` branch — so this
   fails safe regardless of how a rule reaches the engine.

Do not change `is_empty`'s behavior for legitimately-empty values.

### Ties

- The publish-time counterpart is **RUN2-9** check 6 (rules must resolve).
- Touches `shared/workflowLogic.ts` — coordinate with **RUN2-2** and **RUN2-5**;
  run this after Phase 1 has landed.
- Load `run-tests`.

### Acceptance criteria

1. A version rule whose condition step resolves to nothing is omitted from
   `getRuntime`'s `logicRules` and logged once with the unresolved alias.
2. `evaluateCondition` returns `false` for any rule with an empty/missing
   `conditionStepId`, for every operator including `is_empty` and `is_not_empty`.
3. Legitimate `is_empty` / `is_not_empty` behavior on a real step is unchanged.
4. New tests assert 1 (in `tests/unit/services/RunRuntimeService.test.ts`) and
   2–3 (in `tests/unit/shared/workflowLogic.test.ts`).
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-12 — A branch block's `nextSectionId` is trusted without validation ✅

**Priority: P1** · Size: S · File: `server/services/runs/RunExecutionCoordinator.ts`

### Finding

`RunExecutionCoordinator.next` accepts whatever a branch block returns and
writes it straight to the run's cursor
(`RunExecutionCoordinator.ts:53-60`, `:72-77`):

```ts
if (blockResult.nextSectionId) {
    navigation = {
        nextSectionId: blockResult.nextSectionId,
        currentProgress: 0, visibleSections: [], visibleSteps: [], requiredSteps: [],
    };
}
```

There is no check that the id names a section of **this** workflow, that it is
visible, or that it exists at all. Branch block config is author-controlled
JSONB, so a typo, a copied workflow with stale ids, or a deleted section yields
a `currentSectionId` pointing at nothing. From there `calculateNextSection`
returns `null` (`shared/workflowLogic.ts:403-405`, `currentIndex === -1`), and
the client falls into its "Server nextSectionId not locally visible" fallback
(`useRunNavigation.ts:246-254`) — client and server cursors diverge for the rest
of the run.

Note the response also reports `visibleSections: []`, `requiredSteps: []`, and
`currentProgress: 0` for branch-driven navigation, so the progress bar resets and
any caller relying on those arrays gets empty data.

### Preferred fix

Validate the branch result against the navigation the logic engine already
computed. Compute `logicSvc.evaluateNavigation(...)` first, then accept
`blockResult.nextSectionId` only when it is in that result's `visibleSections`;
otherwise log a warning naming the block and fall back to the computed
`nextSectionId`. Populate `visibleSections` / `visibleSteps` / `requiredSteps` /
`currentProgress` from the computed navigation in both branches so the response
shape is consistent.

### Ties

- Touches `RunExecutionCoordinator.next`, adjacent to **RUN2-1**'s
  `submitSection` change — same file, so **run after RUN2-1 lands**.
- Load `add-api-endpoint` and `run-tests`. Existing test:
  `tests/unit/services/RunExecutionCoordinator.test.ts`.

### Acceptance criteria

1. A branch block returning a section id that is not a visible section of this
   workflow is ignored; navigation falls back to the logic-computed next section
   and a warning is logged naming the block.
2. A branch block returning a valid visible section id still overrides normal
   flow, as today.
3. `visibleSections`, `visibleSteps`, `requiredSteps`, and `currentProgress` are
   populated in both branches.
4. New tests in `tests/unit/services/RunExecutionCoordinator.test.ts` assert 1–3.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## Phase 3 Gate

- [ ] RUN2-7..12 all ✅ with dated verification notes
- [ ] `npm run type-check` 0 errors; `npm run lint` 0 errors
- [ ] `npm run test:fast`, `npm run test:unit`, and the touched integration files green
- [ ] Live verification per the `verify` skill: each of the seven RUN2-9 checks
      demonstrably blocks publish with a specific message, and a clean workflow
      still publishes and runs end to end
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Render-layer correctness & performance

## RUN2-13 — Display-block variables never resolve, and final-block conditions evaluate against `{}` ✅

**Priority: P1 (bug)** · Size: S · Files: `client/src/components/runner/blocks/DisplayBlock.tsx`, `client/src/components/runner/blocks/BlockRenderer.tsx`

### Finding

Two defects in how the render layer passes run data into blocks. Bundled because
both are the same `BlockRenderer` → block contract.

**(a) `{{alias}}` in a display block always renders empty.**
`DisplayBlockRenderer` interpolates against the context map by raw key
(`DisplayBlock.tsx:31-46`):

```ts
return text.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
  const key = variableName.trim();
  const value = context[key];
```

But the context handed down is `effectiveValues`, which is keyed by **step id**
(`SectionSteps.tsx:88` passes `context={values}`; `useRunValues.ts:115-117`
builds it as `initial[v.stepId] = v.value`). Aliases are the documented authoring
variable (`docs/guides/STEP_ALIASES.md`), and the logic engine resolves them via
`resolveAlias` — but the display block has no resolver, so an author writing
`{{clientName}}` gets an empty string with no error.

**(b) Final-block document conditions evaluate against an empty object.**
`BlockRenderer` passes `context` to the display block but not to the final block
(`BlockRenderer.tsx:171` vs `:175`):

```ts
case "display":
  return <DisplayBlockRenderer step={step} context={props.context} />;
...
case "final_documents":
  return <FinalBlockRenderer step={step} />;
```

`FinalBlockRendererProps.stepValues` defaults to `{}`
(`FinalBlock.tsx:35`), and `visibleDocuments` filters on
`evaluateDocumentConditions(doc.conditions, stepValues)` — so every conditional
document is decided against no data.

### Preferred fix

(a) Give the display block an alias-aware lookup. Build an alias→stepId map in
`SectionSteps` from the steps it already has (mirror
`useSectionVisibility.ts:37-43`'s `resolveAlias`) and resolve `{{name}}` against
alias first, then step id, then empty string. Keep the existing "missing →
empty string" behavior for genuinely unknown names.

(b) Pass `props.context` to `FinalBlockRenderer` as `stepValues`, matching the
display-block call one case above it.

Both are user-visible output — load the `design` skill before changing anything
rendered.

### Ties

- Load `design` (required for UI work) and `run-tests`.
- Related: `docs/guides/VARIABLES_IN_DOCUMENTS.md`, `docs/guides/STEP_ALIASES.md`.

### Acceptance criteria

1. A display block containing `{{someAlias}}` renders the value of the step with
   `alias === "someAlias"`.
2. A display block containing `{{<stepId>}}` still resolves (back-compat).
3. An unknown `{{name}}` still renders as an empty string, not an error.
4. `FinalBlockRenderer` receives the run values; a document with a condition
   referencing an answered step is shown/hidden correctly.
5. New tests in `tests/unit/client/` assert 1–4.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-14 — Choice options reload on every keystroke, and an empty option alias crashes the question ✅

**Priority: P1** · Size: S · Files: `client/src/components/runner/blocks/choice/useChoiceOptions.ts`, `client/src/components/runner/blocks/ChoiceBlock.tsx`

### Finding

Bundled: both defects live in the choice option pipeline.

**(a) Option reload storm.** `useChoiceOptions`'s effect depends on `context`
(`useChoiceOptions.ts:196`), and `context` is the whole run value map — a new
value on **every keystroke in any field on the page**. For
`dynamicConfig.type === 'table_column'`, `loadOptions` performs
`fetch('/api/tables/${tableId}/rows?limit=...')` (`useChoiceOptions.ts:75-101`).
So a workflow with a table-backed dropdown issues one API request per keystroke
per such question, on the respondent's page. For static options it still rebuilds
the array and calls `setOptions` on every keystroke.

**(b) Empty option alias crashes the block.** Normalization uses `??`
(`useChoiceOptions.ts:117`, `:151`, `:64-68`):

```ts
alias: opt.alias ?? opt.id,
```

`??` does not catch the empty string, and `getOptionValue`
(`ChoiceBlock.tsx:73-75`) returns it verbatim into
`<SelectItem value={...}>`. Radix throws for an empty `SelectItem` value, so a
single option authored with `alias: ""` takes the whole question down into
`BlockErrorBoundary` ("Component Error"). Option config is unvalidated JSONB, so
this is reachable from the builder and from any import.

### Preferred fix

(a) Narrow the effect's dependency to what option resolution actually reads. For
`type: 'list'`, that is `context[listVariable]`; for `table_column`, nothing from
context at all; for static, nothing. Derive a single primitive/stable dependency
value and depend on that instead of the whole `context` object. Do not paper
over it by removing the dependency wholesale — list-backed options must still
refresh when their source list changes.

(b) Normalize option identity in one place in `useChoiceOptions`: coalesce
empty/whitespace `alias` and `id` to a generated stable fallback (the existing
`opt${idx}` convention in `parseLegacyOptions`), and drop options that have no
usable label **and** no usable value. `getOptionValue` should then never be able
to return `""`.

### Ties

- **RUN2-9** check 7 rejects zero-option / bad-display choice steps at publish;
  this ticket makes the runner survive the ones already published.
- Load `design` (UI) and `run-tests`.

### Acceptance criteria

1. Typing in an unrelated field on a page containing a `table_column` choice
   question issues **zero** additional `/api/tables/*/rows` requests.
2. A `list`-backed choice question still updates its options when the underlying
   list value changes.
3. An option with `alias: ""` (or missing both alias and id) renders without
   throwing, in radio, dropdown, and multiple modes.
4. Selecting such an option stores a non-empty stable value.
5. New tests in `tests/unit/client/` assert 1–4.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## Phase 4 Gate

- [ ] RUN2-13, RUN2-14 ✅ with dated verification notes
- [ ] `npm run type-check` 0 errors; `npm run lint` 0 errors; `npm run test:fast` green
- [ ] Live verification: display block with `{{alias}}` renders the answer;
      network tab shows no per-keystroke table fetches
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 5 — Promoted backlog (2026-07-25)

Promoted from the backlog after the main initiative closed. Evidence below was
**re-verified against the current tree**, not carried over from the audit —
these three were confirmed still live after all 16 tickets landed. (RUN2-B3 was
closed without a ticket: RUN2-16 replaced the `visibleStepIds.includes()` loop
with a `Set`.)

Dispatch these in **git worktrees**, one per ticket — see the "Parallel work"
section of `CLAUDE.md`.

## RUN2-17 — A `final` step renders inline as a question 🔲

**Priority: P2** · Size: S · File: `client/src/hooks/runner/useSectionVisibility.ts`

### Finding

`getVisibleSectionSteps` excludes final blocks from the question list by exact
type match (`useSectionVisibility.ts:71-73`):

```ts
const sectionSteps = allSteps.filter(
  (step) => step.sectionId === sectionId && !step.isVirtual && step.type !== 'final_documents'
);
```

`final` is the easy-mode alias for the same thing —
`normalizeRunnerStepType` maps `final` → `final_documents`
(`shared/types/runnerStepTypes.ts`), and `BlockRenderer` routes both to
`FinalBlockRenderer`. So a step authored as `final` is *not* filtered here and
renders inline in the middle of a question page, while an identical step
authored as `final_documents` is excluded. Two authoring shapes for the same
concept behave differently.

### Preferred fix

Filter on the normalized type rather than the raw one: import
`normalizeRunnerStepType` from `@shared/types/runnerStepTypes` (already the
single source of truth after RUN2-3) and compare its result to
`'final_documents'`. Do not add a second literal — that is exactly the
duplication RUN2-3 removed.

### Ties

- Depends on the shared module introduced by **RUN2-3** (landed).
- Load `run-tests`. Existing tests: `tests/unit/client/useSectionVisibility.test.tsx`.

### Acceptance criteria

1. A step of type `final` is excluded from `getVisibleSectionSteps`, exactly as
   `final_documents` is.
2. Ordinary question types are still returned.
3. No duplicated string literal for the final-block type — the check goes
   through `normalizeRunnerStepType`.
4. New test in `tests/unit/client/useSectionVisibility.test.tsx` asserts 1 and 2.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-18 — Shared runs read a graph shape that no longer exists, so their final-block config is always null 🔲

**Priority: P1 (bug)** · Size: S · File: `server/services/workflow-runs/RunStateService.ts`

### Finding

`getSharedRunDetails` looks for the final block inside a `nodes[]` array on the
version graph (`RunStateService.ts:167-178`):

```ts
const graph = version.graphJson as any;
if (graph.nodes && Array.isArray(graph.nodes)) {
  const finalNode = graph.nodes.find((n: any) => n.type === 'final');
  if (finalNode?.data?.config) { finalBlockConfig = finalNode.data.config; }
}
```

Graph nodes went away with the graph builder. `VersionService.serializeWorkflow`
emits `sections[]` — grepping it for `nodes` returns **0 matches** — so this
branch never executes for any version written by the current code. Every shared
run with a `workflowVersionId` therefore returns `finalBlockConfig: null`, and
the shared-run view silently loses its document configuration. The `else` branch
(draft runs, read from the live steps table) is the only path that ever
produces a config today.

### Preferred fix

Read the final block from the serialized `sections[].steps[]` shape the current
serializer actually emits: find the first step whose type is `final` or
`final_documents` and take its `config`. Mirror how
`RunLifecycleService.generateDocuments` collects final-block configs
(`RunLifecycleService.ts:362-369`), which already handles both type spellings.
Delete the `nodes[]` branch rather than leaving it as a fallback — it is dead
code for every version the system can now produce.

### Ties

- Related to **RUN2-17** (both concern the `final`/`final_documents` split) but
  a different file — they may run in parallel, in separate worktrees.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. A shared run whose pinned version contains a final-block step returns that
   step's config as `finalBlockConfig`, for both the `final` and
   `final_documents` spellings.
2. A shared run whose version has no final block returns `null` (unchanged).
3. The draft-run path (no `workflowVersionId`) is unchanged.
4. The dead `graph.nodes` branch is deleted, not left as a fallback.
5. New test asserts 1, 2 and 3.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## RUN2-19 — Every versionless run drops its analytics events 🔲

**Priority: P1 (bug)** · Size: S · File: `server/services/workflow-runs/RunMetricsService.ts`

### Finding

`RunMetricsService` substitutes the literal string `'draft'` when a run has no
pinned version — three times (`RunMetricsService.ts:82`, `:126`, `:179`):

```ts
versionId: versionId ?? 'draft',
```

But the destination column is a UUID with a foreign key
(`shared/schema/run.ts:248`):

```ts
versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
```

So every such insert fails with `invalid input syntax for type uuid: "draft"`,
is swallowed by the surrounding try/catch, and logs
`"Failed to record analytics event"`. Observed repeatedly in integration output.
Consequence: any metric derived from `run.start` / `run.succeeded` /
`run.failed` silently under-counts, and the gap is exactly the versionless runs
— which is a meaningful slice, since `RunService.createRun` explicitly permits
them for authenticated creators.

Note the column is `NOT NULL` *and* a foreign key, so there is no null to write
either: a run with no version genuinely cannot have an event row.

### Preferred fix

Skip the event instead of attempting an insert that cannot succeed. Where
`versionId` is absent, log once at `debug`/`info` ("skipping analytics event for
versionless run") and return, rather than calling
`analyticsService.recordEvent` with a sentinel. Apply at all three sites — a
shared private guard is cleaner than repeating the check.

Do not change the column to nullable and do not invent a placeholder version
row; both are schema changes well beyond this ticket, and versionless runs are
themselves a transitional state that RUN2-9's publish gate makes rarer.

### Ties

- Independent file; safe to run in parallel with RUN2-17 and RUN2-18.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. A run with no `workflowVersionId` records no analytics event and logs no
   error — the "Failed to record analytics event" line no longer appears for it.
2. A run with a real `workflowVersionId` still records its events unchanged.
3. All three call sites are covered by one shared guard, not three copies.
4. New test asserts 1 and 2.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` green.

---

## Phase 5 Gate

- [ ] RUN2-17..19 ✅ with dated verification notes
- [ ] `npm run type-check` 0 errors; `npm run lint` 0 errors; `npm run test:fast` green
- [ ] Integration output no longer shows `invalid input syntax for type uuid: "draft"`
- [ ] Reviewer has committed each passed ticket + this gate

---

# Escalations — need Shawn's decision before ticketing

## RUN2-E1 — Version pinning is client-only: the server navigates and validates against the *live* workflow

**Would be P0 · Size L · spans `RunService`, `RunExecutionCoordinator`, `LogicService`, `RunLifecycleService`**

The runner client renders the **pinned version snapshot**:
`GET /api/runs/:runId/runtime` reads `version.graphJson`
(`RunRuntimeService.ts:131-141`). Every server-side decision about that same run
reads the **live tables** instead:

- `RunExecutionCoordinator.submitSection` → `this.stepRepo.findBySectionId(sectionId)`
  (`RunExecutionCoordinator.ts:90`)
- `LogicService.evaluateNavigation` / `validateCompletion` →
  `sectionRepo.findByWorkflowId(workflowId)` (`LogicService.ts:127-131`, `:184-188`)
- `RunLifecycleService.determineStartSection` → `logicSvc.buildContext(workflowId, ...)`
  (`RunLifecycleService.ts:237`)

None of them receives `run.workflowVersionId`. So editing a published workflow
while runs are in flight breaks those runs:

- Delete a step after publish → the client still renders it from the snapshot and
  submits its value → `submitSection` computes `outOfSectionStepIds` from live
  steps and **throws** `"Section submit contains out-of-section stepIds"`
  (`RunExecutionCoordinator.ts:92-100`) → the respondent is hard-blocked on that
  page with no recovery.
- Add a required step after publish → the respondent never sees it (not in the
  snapshot) but `validateCompletion` demands it → submission is refused with
  "Missing required steps: <title>" for a question that does not exist in their
  interview.
- Reorder or delete a section → `nextSectionId` names a section the client
  cannot find → the "Server nextSectionId not locally visible" fallback
  (`useRunNavigation.ts:246-254`) desynchronizes the cursors for the rest of the run.

**Why this is an escalation, not a ticket:** the fix is to thread
`run.workflowVersionId` through the whole server-side run path and resolve
sections/steps/rules from the pinned graph — that is a large, cross-cutting
change to four services, and it forces a decision about runs whose
`workflowVersionId` is null (`RunService.createRun:169-171` logs "run might be
unstable" and proceeds).

**My recommendation:** do it, as its own initiative rather than inside this one,
and in the meantime add a cheap mitigation ticket here: make `submitSection`
**ignore** unknown step ids instead of throwing, so an author's edit degrades to
"that answer isn't saved" rather than "the respondent is bricked." Shawn's call:
(a) full version-pinning initiative now, (b) mitigation ticket now + initiative
later, or (c) mitigation only.

## RUN2-E2 — Server-side field validation does not exist; all format rules are client-only

**Would be P1 · Size M–L · `server/workflows/validation.ts`**

`validatePage` builds its config with everything except `required` left as a TODO
(`server/workflows/validation.ts:161-165`):

```ts
const config: FieldValidationConfig = {
  required: step.required ?? undefined,
  // TODO: Extract from step.config if stored there
};
```

`validateField` right above it fully implements minLength, maxLength, min, max,
email, and pattern (`validation.ts:44-110`) — none of it is ever reached, because
nothing populates the config. The client computes all of those rules
(`shared/validation/BlockValidation.ts:63-150`) and enforces them in
`useRunNavigation.handleNext`, so they are **presentation-only**: a direct
`POST /api/runs/:id/values/bulk` or a crafted section submit stores any value in
any field. That data flows into generated documents and DataVault writeback.

**Why this is an escalation:** turning it on is a behavior change with blast
radius. Existing in-flight runs that already hold non-conforming values would
start failing submission, and the two validators would have to agree exactly
(the client's `getValidationSchema` and the server's `FieldValidationConfig` are
different shapes today, so "just wire it up" understates the work). There is also
a smaller security question inside it: `validateField` compiles author-supplied
regex with `new RegExp(config.pattern)` (`validation.ts:100-107`) — moving that
onto the server puts a catastrophic-backtracking pattern on the Node event loop,
so enabling pattern rules server-side needs a length/complexity bound or a
timeout, not a bare `new RegExp`.

**My recommendation:** ticket it, scoped to (1) sharing one schema derivation
between client and server, (2) enforcing everything except `pattern`
server-side, and (3) `pattern` behind a bounded-execution guard. Shawn's call on
whether that lands in this initiative or its own.

---

# Backlog / observations (not ticketed)

- **RUN2-B1** — `useSectionVisibility.getVisibleSectionSteps` filters out
  `step.type !== 'final_documents'` (`useSectionVisibility.ts:71-73`) but not the
  easy-mode alias `'final'`, which `normalizeRunnerStepType` maps to the same
  thing. A `final` step therefore renders inline inside a question section.
  Small, but it makes the two final-block authoring shapes behave differently.
- **RUN2-B2** — `RunStateService.getSharedRunDetails` still reads a
  `version.graphJson.nodes[]` array looking for a `type === 'final'` node
  (`RunStateService.ts:167-178`). Graph nodes were removed with the graph
  builder; `serializeWorkflow` emits `sections[]`, never `nodes[]`, so this
  branch is dead and shared runs silently get `finalBlockConfig: null`.
- **RUN2-B3** — ✅ closed without a ticket: RUN2-16 replaced the
  `visibleStepIds.includes(step.id)` loop in `server/workflows/validation.ts`
  with a `Set` while rewriting `validatePage`.
- **RUN2-B5** — runs with no pinned version pass the literal string `'draft'`
  as the version id into the analytics event writer, but
  `workflow_run_events.version_id` is a `uuid` column. Every such run logs
  `invalid input syntax for type uuid: "draft"` and silently drops its
  `run.start` event, so draft-run analytics are simply missing. Observed in
  integration output while verifying RUN2-9; pre-existing and unrelated to this
  initiative, but it means any metric derived from `run.start` under-counts.
- **RUN2-B6** — `BlockResult` (`shared/types/blocks.ts`) carries a
  `nextSectionId` but no block id or name, and `BlockRunner.runPhase` does not
  surface which block produced a branch decision. RUN2-12 therefore has to log
  the *section* whose `onNext` phase emitted a bad target rather than naming the
  offending block. Threading a block id through `BlockResult` would make that
  warning directly actionable. Raised by the RUN2-12 dev; accepted as a
  deviation there.
- **RUN2-B4** — `parseInitialValuesFromUrl` (`useRunSession.ts:39-43`)
  `JSON.parse`s every query parameter, so `?name=123` stores the number `123`
  and `?flag=true` stores the boolean. For a text question that silently changes
  the value's type before any validation sees it. Worth deciding whether prefill
  should be type-coerced against the step type. Related to **RUN2-6**.

---

## Status

| Ticket | Title | Status |
|---|---|---|
| RUN2-1 | Section submit uses a different visibility engine | ✅ Done 2026-07-25 |
| RUN2-2 | Backwards `skip_to` = infinite navigation loop | ✅ Done 2026-07-25 |
| RUN2-3 | Required unrenderable question = unfinishable interview | ✅ Done 2026-07-25 |
| RUN2-4 | Zero visible sections = dead screen | ✅ Done 2026-07-25 |
| RUN2-5 | Logic evaluation mutates the respondent's answer array | ✅ Done 2026-07-25 |
| RUN2-6 | URL prefill bypasses the intake allowlist | ✅ Done 2026-07-25 |
| RUN2-7 | Publish bypasses the lint gate | ✅ Done 2026-07-25 |
| RUN2-8 | Lint gate emits false "unknown alias" errors | ✅ Done 2026-07-25 |
| RUN2-9 | `validateWorkflow` is a stub | ✅ Done 2026-07-25 |
| RUN2-10 | Runtime schema rejection is an opaque 500 | ✅ Done 2026-07-25 |
| RUN2-11 | Unresolvable rule becomes always-true `is_empty` | ✅ Done 2026-07-25 |
| RUN2-12 | Branch-block `nextSectionId` trusted unvalidated | ✅ Done 2026-07-25 |
| RUN2-13 | Display `{{alias}}` never resolves; final block gets `{}` | ✅ Done 2026-07-25 |
| RUN2-14 | Choice options reload per keystroke; empty alias crashes | ✅ Done 2026-07-25 |
| RUN2-15 | Submit throws when author edits a published workflow mid-run | ✅ Done 2026-07-25 |
| RUN2-16 | Unify validation engines; server authoritative, pattern guarded | ✅ Done 2026-07-25 |
| RUN2-17 | `final` step renders inline as a question | 🔲 Open |
| RUN2-18 | Shared runs read a dead graph shape; final config always null | 🔲 Open |
| RUN2-19 | Versionless runs drop every analytics event | 🔲 Open |
| RUN2-E1 | Version pinning is client-only | ⚠️ Deferred to own initiative — mitigated by RUN2-15 (Shawn, 2026-07-25) |
| RUN2-E2 | No server-side field validation | ✅ Resolved into RUN2-16 (Shawn, 2026-07-25) |

### Dispatch order (file-locality)

| Group | Files | Order |
|---|---|---|
| A | `RunExecutionCoordinator.ts`, `server/workflows/validation.ts` | RUN2-1 → RUN2-3 → RUN2-12 → RUN2-15 → RUN2-16 |
| B | `shared/workflowLogic.ts`, `RunRuntimeService.ts` | RUN2-2 → RUN2-5 → RUN2-11 → RUN2-10 |
| C | client runner UI | RUN2-4 → RUN2-13 → RUN2-14 |
| D | `VersionService.ts`, `WorkflowLintService.ts` | RUN2-8 → RUN2-7 → RUN2-9 (RUN2-9 needs RUN2-3's shared type set) |
| E | `RunService.ts`, `RunLifecycleService.ts` | RUN2-6 (independent) |

Groups A–E may run in parallel; tickets **within** a group must not.

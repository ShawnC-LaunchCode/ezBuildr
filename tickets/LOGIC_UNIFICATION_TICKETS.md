# Logic Unification (LU) — decomposition of epic GH-154

**Senior audit:** 2026-08-07 · **Initiative prefix:** `LU-1..6`
**Parent epic:** GH-154 in `tickets/ROADMAP_TICKETS.md` ("Unify conditional logic editing across the builder", P1/L)

---

## How to work this document

You are a **dev**. Read this header, the **Decisions** section, and **your ticket only**.
Do not read or work other tickets. Do not commit or stage anything — the reviewer controls commits.

**Locators are quoted code + symbol anchors.** `file:line` references are advisory and
accurate as of 2026-08-07; if a line has drifted, grep for the quoted snippet or the named
symbol. A drifted line number is not a broken ticket.

**Recorded baseline (clean `main` @ `c4d86db8`, verified in each worktree at creation):**
`npm run test:fast` = **217 files passed / 1 skipped, 2604 tests passed / 14 skipped.**
Compare against this number, not against a number you measure after you start editing.

**Project skills you must load** are named in each ticket's *Ties*. At minimum, every ticket
here requires the `run-tests` skill (naive `npm test` gives wrong results in this repo) and
the `design` skill for any ticket that changes rendered UI.

---

## Audit summary — what GH-154 actually found

The epic says "multiple separate logic surfaces exist." That is true, but the epic's five
acceptance criteria misdescribe the state of the code. **Two of the five are already built.**
The audit below is what the tickets are written against.

### There are three condition models, not two

| | Model | Where | Status |
|---|---|---|---|
| **A** | `ConditionExpression` — nested AND/OR groups, 28-value `ComparisonOperator` | `shared/types/conditions.ts`, evaluated by `shared/conditionEvaluator.ts` on **both** client and server | **LIVE.** Backs `steps.visible_if` + `sections.visible_if` |
| **B** | `logic_rules` rows — flat, 9-value `conditionOperatorEnum`, plus *actions* A lacks (`show`/`hide`/`require`/`make_optional`/**`skip_to`**) | `shared/schema/workflow.ts` (`logicRules` table); evaluated in the runner by `useSectionVisibility` / `SectionSteps` | **LIVE at runtime, but has no editor UI** |
| **C** | A third `ConditionExpression` — own operator union, own `validateConditionExpression`, `{ and: [...], op: "gt", left/right }` shape | `server/workflows/conditions.ts` (472 lines) + `server/workflows/conditionAdapter.ts` (an A↔C translator) | **DEAD.** Imported by tests only |

### Corrections to the epic's acceptance criteria

- **AC2 ("standardized operator dropdown matching `ComparisonOperator`") is already done
  for Model A.** `OPERATORS_BY_STEP_TYPE` in `shared/types/conditions.ts:103` maps every
  supported step type to full operator configs, including the date-diff operators. The real
  AC2 gap is Model B's 9-operator enum, which is a data-model question, not a dropdown.
- **AC3's "type-aware comparison values" is already done.** `ConditionValueInput` already
  branches on `operatorConfig.valueType` and renders `<Input type="date">`, `<Input
  type="number">`, choice `<Select>`s, and a variable-reference picker. The remaining AC3
  gap is **only alias autocompletion** — the variable picker is a plain `Select`, not a
  typeahead.
- **AC4 (circular-reference validation) is genuinely absent.** Grepped
  `shared/conditionEvaluator.ts`, `shared/types/conditions.ts`, and
  `server/services/workflowLintRules.ts` — nothing.
- **AC1's "reused across steps, sections, and document outputs"**: steps ✅ and sections ✅
  already share `LogicBuilder`. Two real gaps: list fields **forked** it, and final documents
  have no visibility UI at all.

### Why the list-field fork happened (this drives LU-2)

`LogicBuilder` is **already a controlled component** — it takes `value` / `onChange` and does
not self-save. The fork was not caused by save behavior. It was caused by `LogicBuilder`
**hard-fetching its own variable list**:

```ts
// client/src/components/logic/LogicBuilder.tsx — export function LogicBuilder
const { data: rawVariables, isLoading } = useWorkflowVariables(workflowId);
```

A list field's condition operands are its **sibling fields**, not workflow variables, so
`ListFieldSettings` could not use `LogicBuilder` and re-wired `ConditionGroup` by hand,
duplicating the variable-mapping and adding a documented lossy type cast. The unification fix
is therefore **inject the variable source**, not "extract a controlled core."

---

## Decisions

**Decision #1 — Model C is deleted, not unified.** It is dead code with no production
importer. Unifying against it would be work spent on a model nothing runs. (LU-1)

**Decision #2 — `LogicBuilder` stays one component and gains an optional injected variable
list.** Do not extract a new "core" component and leave `LogicBuilder` as a shell; that
doubles the surface. Add an optional prop that, when supplied, replaces the
`useWorkflowVariables` fetch. (LU-2)

**Decision #3 — Model A / Model B convergence is NOT in this initiative's Phase 1.** It is
escalated to the repo owner as a product+schema call, now resolved in **Decision #4** below.
No Phase 1 ticket
may change the `logic_rules` schema or its runtime evaluation. If your ticket seems to
require that, STOP and report a blocker.

---

## Decision #4 — RESOLVED 2026-08-07: fold Model B into Model A

**Repo owner's call: option 1 — fold `logic_rules` into `ConditionExpression`.** Add actions
(incl. `skip_to`) to the live model, migrate/drop `logic_rules`, end with one model and one
evaluator. This is the only option that actually delivers the epic's "unify", and it closes the
AC5 parity risk by construction rather than by testing around it.

### Scope correction the Senior owes the record

When the decision was presented, option 1 was described as "largest change; needs a migration."
That undersold it. A post-decision grep for `logicRules` / `logic_rules` / `LogicRule` across
`server/`, `shared/`, and `client/` returns **46 files**, including subsystems that serialize
logic rules as part of their own contracts:

- **Versioning** — `VersionService.ts` pins rules into published definitions
- **Portability** — `portability/entityGraph.ts`, `remapJsonIds.ts`, `WorkflowContentIngestService.ts`,
  `ExportWorkflowDialog.tsx`, `ImportPreviewReport.tsx` (import/export round-trip)
- **Cloning** — `WorkflowClonerService.ts:618` (`tx.insert(logicRules)`)
- **AI generation** — 8 files under `services/ai/` plus `AiController`, `shared/types/ai.ts`
- **Run execution** — `RunDefinitionProvider`, `RunRuntimeService`, `RunExecutionCoordinator`
- **Alias plumbing** — `AliasRenameService`, `AliasResolver`

The decision stands, but **Phase 2 is XL, not L**, and is decomposed accordingly below. It is
sequenced work, not parallelizable — the shape change lands first, everything else follows it.

### The shape mismatch that drives the design

`logic_rules` is **one condition per row**, combined across rows by `logicalOperator` + `order`:

```ts
// shared/schema/workflow.ts - export const logicRules
conditionStepId: uuid(...).notNull(),
operator: conditionOperatorEnum("operator").notNull(),
conditionValue: jsonb("condition_value"),
action: conditionalActionEnum("action").notNull(),   // show|hide|require|make_optional|skip_to
logicalOperator: varchar("logical_operator").default("AND"),
order: integer("order").notNull().default(1),
```

`ConditionExpression` is a **nested tree with no action concept** — it is implicitly
show/hide. So the fold is two separate changes that must not be conflated:

1. **Give Model A an action.** Today `visibleIf` means "show if". `require`,
   `make_optional`, and `skip_to` have no representation and must be added to the type.
2. **Collapse N rows into one tree.** Group rows by (target, action), then combine by
   `logicalOperator` respecting `order`.

### Data migration is probably a drop, not a migration — verify first

Per the standing finding that this database holds only test data, there may be zero
`logic_rules` rows worth preserving, which turns the migration from a data transform into a
`DROP TABLE`. **LU-6a must confirm this against the actual database before any migration is
written** — do not assume it in either direction.

---

# Phase 1 — Model-agnostic cleanup and unification

Dispatchable now. Footprints are disjoint except where noted.

## LU-1 — Delete the dead third condition model ✅

> **Verified 2026-08-07 (Senior).** Gates re-run by the reviewer in the worktree, not taken
> from the dev's report: `tsc --noEmit` exit 0, `npm run lint` (`--max-warnings 0`) exit 0,
> `test:fast` **215 files / 2556 tests passed, 1 file + 14 tests skipped** — reproducing the
> dev's numbers exactly.
>
> **Test-count delta accounted for.** Baseline 2604 → 2556 = −48, which is −51 (the deleted
> `conditionTruthTable.test.ts`, confirmed at exactly 51 `it(` blocks) +3 ported. No
> unexplained regression.
>
> **AC3 — ported coverage verified.** Three cases were genuinely uncovered and are now in
> `tests/unit/shared/conditionEvaluator.test.ts`: `greater_than` against a non-numeric string
> (the existing fail-closed suite covered only missing/empty, not unparseable), double
> negation, and dot-notation path resolution through a full evaluation. The double-negation
> port is a real translation rather than a copy — Model A expresses NOT as a `not: true` flag
> on a group, not as a wrapper node, so the ported test nests two flagged groups. The dev
> also named a covering test for every case it declined to port, and correctly identified
> seven cases as unportable because the *feature* is absent from Model A (`in`/`notIn`,
> regex `matches`, dual data source, bracket-index paths, whitespace trimming, the
> empty-OR-array convention, and `validateConditionExpression`'s own error strings).
>
> **AC7 — REG-1 deletion upheld.** The reviewer checked the deleted file rather than the
> argument for deleting it. `regression-REG-1.test.ts` imported `evaluateVisibility` from the
> dead `conditionAdapter`, re-implemented its filtering inline (`allSteps.filter(...)`)
> instead of calling `validatePage` or any production service, and — decisively — cast
> `s.visibleIf as unknown as string` to make production's structured `ConditionExpression`
> jsonb accept its fabricated string format. A test that must lie to the type system to
> reach dead code protects nothing. Deleting was right.
>
> **`server/workflows/validation.ts` untouched** and still imported by
> `RunExecutionCoordinator.ts:7`, as required by AC2. Scoped repo grep for
> `conditionAdapter` / `workflows/conditions` / `workflows/examples` returns zero code hits.


**Priority: P1** · Size: S
**Files:** `server/workflows/conditions.ts`, `server/workflows/conditionAdapter.ts`,
`server/workflows/examples.ts`, `tests/unit/workflows/conditionTruthTable.test.ts`,
`tests/integration/regression-REG-1.test.ts`
**Ties:** Load the `run-tests` skill. Footprint is server-only — no collision with LU-2/LU-3/LU-4.

### Finding

`server/workflows/conditions.ts` defines a complete third condition system:

```ts
export type ConditionOperator = ...
export interface ComparisonCondition { ... }
export function evaluateCondition(...)
export function validateConditionExpression(expression: unknown): string[]
```

and `server/workflows/conditionAdapter.ts` exists solely to translate between it and Model A:

```ts
 * Adapts between the new UI-friendly condition format (used by LogicBuilder)
 * and the existing backend condition format (used by IntakeNavigationService).
```

**No production code imports any of it.** Verified by grepping `server/`, `client/`, and
`shared/` for `workflows/conditions`, `workflows/conditionAdapter`, and `workflows/examples`:
the only hits are `tests/unit/workflows/conditionTruthTable.test.ts` and
`tests/integration/regression-REG-1.test.ts`. The referenced `IntakeNavigationService` no
longer consumes it.

**Do not delete `server/workflows/validation.ts`** — that one IS live
(`server/services/runs/RunExecutionCoordinator.ts:7` imports `validatePage`). Leave it and its
`README.md` entry alone except for removing references to the deleted files.

### Preferred fix

1. Delete `conditions.ts`, `conditionAdapter.ts`, and `examples.ts` from `server/workflows/`.
2. Delete `tests/unit/workflows/conditionTruthTable.test.ts`. Before deleting, **read it** and
   check whether any operator edge case it covers is *not* already covered by
   `tests/unit/shared/conditionEvaluator.test.ts` or `tests/unit/shared/conditions.test.ts`.
   Port any genuinely unique case over to the Model A tests rather than losing coverage.
   Report which cases you ported, if any.
3. `tests/integration/regression-REG-1.test.ts` — inspect what it actually regression-tests.
   If it tests behavior that only exists in Model C, delete it. If it tests real runner
   behavior *through* Model C, rewrite it against Model A. State which you did and why.
4. Update `server/workflows/README.md` to drop the deleted modules.

### Acceptance criteria

1. `conditions.ts`, `conditionAdapter.ts`, `examples.ts` deleted from `server/workflows/`.
2. `server/workflows/validation.ts` untouched and still imported by `RunExecutionCoordinator`.
3. Any unique operator edge case from the deleted truth-table test is ported to a Model A test
   file, or you state explicitly that every case was already covered (with the covering test
   named).
4. `server/workflows/README.md` no longer references deleted modules.
5. `npm run type-check` exits 0; `npm run lint` exits 0.
6. `npm run test:fast` passes with no regression against the baseline you record before
   starting (record it first — run it and paste the count).
7. A repo-wide grep for `conditionAdapter`, `workflows/conditions`, and `workflows/examples`
   returns zero hits outside git history.

---

## LU-2 — Un-fork the list-field visibility editor ✅

> **Verified 2026-08-07 (Senior).** Gates re-run by the reviewer: `tsc --noEmit` exit 0,
> `npm run lint` exit 0, `check:strict-zones` all 6 zones pass, `test:fast` **217 files /
> 2609 tests passed** — baseline 2604 plus exactly the 5 new tests, no unexplained delta.
>
> **AC1 verified at the source, not the claim.** `useWorkflowVariables` and `useWorkflowSteps`
> are both gated `enabled: !hasInjectedVariables` in `LogicBuilder.tsx`, and
> `useVariables.ts` grew an optional `{ enabled }` that composes with its existing guard, so
> the injected path genuinely does not fetch rather than fetching and discarding. Asserted by
> test, not by comment.
>
> **AC2/AC3 verified.** `ListFieldSettings` no longer imports `ConditionGroup` — it renders
> `LogicBuilder` with the injected sibling list, and the hand-wired duplicate is deleted
> rather than disabled. `VisibilityField.tsx` and `SectionLogicSheet.tsx` are byte-unchanged,
> so the step and section paths are untouched.
>
> **AC7 live proof accepted.** The dev found the shared Playwright profile locked by a
> concurrent session and — correctly — did not treat that as a blocker or substitute RTL
> tests. It drove an isolated Chromium against its own worktree's `dev:test` server on port
> 5199, first confirming by source-grep for `hasInjectedVariables` that the server was serving
> the worktree's code and not the main checkout's (the standing `preview_start` trap). It then
> registered a real user through the signup UI, set a list-field visibility condition whose
> operand dropdown showed "This item's fields → trigger" (proving the sibling list is the
> source, not a workflow fetch), applied it, **reloaded the page** and confirmed the condition
> survived, then verified server-side via API GET that
> `visibleIf.conditions[0].variable === "trigger"`. Fixtures torn down clean.
>
> **Two deviations, both accepted.** `LogicBuilder`'s `elementType` union gained `"field"` and
> `workflowId`/`elementId` became optional; `useWorkflowVariables` gained an optional
> `options` param. Neither file was named in the ticket's Files list, but both are required by
> the ticket's own instruction to make the prop types honest rather than pass dummy strings,
> and by Decision #2's "gate the hook with `enabled`". Backward compatible — the 12 other
> `useWorkflowVariables` call sites and both existing `LogicBuilder` callers are unaffected.


**Priority: P1** · Size: M
**Files:** `client/src/components/logic/LogicBuilder.tsx`,
`client/src/components/builder/cards/list/ListFieldSettings.tsx`, plus a new/updated test file
**Ties:** Load `run-tests` **and** `design` (this changes rendered UI). **Collides with LU-4** —
LU-4 is sequenced after this ticket. Do not touch `ConditionValueInput.tsx` or
`ConditionRow.tsx`.

### Finding

`LogicBuilder` is already controlled (`value` / `onChange`), but hard-fetches its operands:

```ts
// client/src/components/logic/LogicBuilder.tsx — export function LogicBuilder
const { data: rawVariables, isLoading } = useWorkflowVariables(workflowId);
```

Because a list field's operands are sibling fields rather than workflow variables,
`ListFieldSettings` could not reuse it and duplicated the editor. Its own comment records this:

```ts
// client/src/components/builder/cards/list/ListFieldSettings.tsx — FieldVisibilitySection
 * This instead reuses `ConditionGroup`, the same condition-tree editor `LogicBuilder` itself
 * renders, wired to a locally-scoped sibling variable list instead of a
 * `useWorkflowVariables` fetch.
```

The duplication also carries a lossy cast that `LogicBuilder` does not have to make:

```ts
// buildSiblingVariables
type: (sibling.kind === "question" ? sibling.type : "list") as VariableInfo["type"],
```

### Preferred fix

Per **Decision #2**: add an **optional** `variables?: VariableInfo[]` prop to `LogicBuilder`.
When supplied, skip the `useWorkflowVariables` call entirely (do not fetch and discard — gate
the hook with `enabled`) and use the injected list. When omitted, behavior is byte-for-byte
what it is today, so `VisibilityField` and `SectionLogicSheet` need no changes.

Then rewrite `FieldVisibilitySection` in `ListFieldSettings.tsx` to render `LogicBuilder` with
the injected sibling list, deleting the hand-wired `ConditionGroup` block. Keep the existing
Collapsible + `LogicStatusText` shell — that part is legitimately list-specific because list
fields are controlled and never self-save.

`workflowId` / `elementId` become optional-or-ignored on the injected path; make the prop types
honest rather than passing dummy strings. **Delete** anything the change orphans, including
`buildSiblingVariables` if it moves.

### Acceptance criteria

1. `LogicBuilder` accepts an optional injected variable list; when supplied, `useWorkflowVariables`
   does not fire (assert this in a test — a spy or an `enabled: false` assertion, not a comment).
2. `ListFieldSettings`'s `FieldVisibilitySection` renders `LogicBuilder` and no longer wires
   `ConditionGroup` directly; the duplicated mapping code is **deleted**, not commented out.
3. Steps and sections still edit visibility exactly as before — `VisibilityField.tsx` and
   `SectionLogicSheet.tsx` are unchanged.
4. New/updated component tests cover: injected-variables path renders sibling fields as
   operands; the fetch path still renders workflow variables; a condition edited in a list
   field round-trips through `onChange`.
5. No new lint suppressions. If the prop change trips a complexity rule, extract a helper.
6. `npm run type-check` 0 errors; `npm run lint` 0 problems; `npm run test:fast` no regression
   against the baseline you record before starting.
7. **Live proof required:** run the dev app (`verify` skill), open a workflow with a List step,
   set a visibility condition on a list field referencing a sibling field, and confirm it saves
   and renders. Attach evidence. RTL tests are not live proof.

---

## LU-3 — Detect circular and unresolvable condition references ✅

> **Verified 2026-08-07 (Senior), after one failed review.** Gates re-run by the reviewer:
> `tsc --noEmit` exit 0, `npm run lint` exit 0, `test:fast` **219 files / 2626 tests passed**
> (baseline 2604, +22 new).
>
> **Failed the first review pass on a publish-blocking false positive.** The dev keyed each
> step's graph node by its alias, falling back to a synthetic `__step__:<id>`. But
> `ConditionRow.tsx` writes the operand as `value={v.alias ?? v.id}`, so a step with **no**
> alias is legitimately referenced by its raw UUID — which resolved to no node and was
> reported as a dangling reference. Because this ticket also (correctly) escalated dangling
> references from `warning` to `error`, the effect was that a workflow whose author set a
> visibility condition on an alias-less question could no longer be published, with a message
> claiming it "references unknown alias" while naming a step that exists. The reviewer
> reproduced it against the dev's own code before sending it back; every fixture in the
> original suite happened to give every step an alias, so all 31 tests passed over the bug.
>
> **Fixed correctly.** References now resolve through an `alias-or-raw-id -> canonical node`
> map (`workflowLintRules.ts`, `const resolve`), rather than the naive fix of registering the
> raw id as a second graph node — which would have given one step two nodes and corrupted
> cycle detection. Three reviewer-mandated cases are now covered and pass: an alias-less step
> referenced by raw id produces no error; a cycle that runs **through** such a step is still
> detected (the case the naive fix breaks); and a genuinely deleted alias still errors, so the
> false positive was not "fixed" by weakening the check. The reviewer re-ran the original
> failing probe verbatim against the fix — it passes.
>
> **Algorithm verified independently.** Three-colour (white/grey/black) DFS in
> `shared/conditionGraph.ts`, genuinely O(V+E) with the complexity stated in-code as AC5
> requires. Only a GREY (still on the current DFS path) neighbour counts as a cycle, so the
> diamond case `A->B->D, A->C->D` is correctly a DAG merge and not reported — covered by a
> negative test at `tests/unit/shared/conditionGraph.test.ts:109`, which is the criterion this
> class of implementation most often fails. Findings flow through `workflowLintRules` in the
> existing shape, so the GH-152 publish gate picks them up and the Review tab deep-links work.
>
> **Reviewer fix (small, taken at review rather than round-tripped).** The commit was blocked
> by `check:strict-zones`, which the pre-commit hook runs and which `npm run type-check` does
> NOT cover — it compiles the scripting zones under stricter settings and pulls
> `workflowLintRules.ts` in transitively. Under `noUncheckedIndexedAccess`, `cycle.path[0]`
> is `string | undefined`, so `info.get(cycle.path[0])` failed TS2345. `detectCycles` never
> emits an empty path, but the type cannot know that, so the first node is now destructured
> and checked rather than asserted. Strict zones pass; the 22 LU-3 tests still pass.
> This is the standing trap: a green `type-check` is not a green commit gate.


**Priority: P1** · Size: M
**Files:** `shared/conditionEvaluator.ts` (or a new `shared/conditionGraph.ts`),
`server/services/workflowLintRules.ts`, new test files
**Ties:** Load `run-tests`. Footprint is shared/ + server/services — disjoint from LU-1
(server/workflows) and LU-2/LU-4 (client). This is epic GH-154 AC4.

### Finding

Nothing in the codebase detects a condition cycle. Step A can be `visibleIf` B, and B
`visibleIf` A; both silently evaluate to hidden with no author-facing signal. Grepped
`shared/conditionEvaluator.ts`, `shared/types/conditions.ts`, and
`server/services/workflowLintRules.ts` for `circular` / `cycle` — the only hits are unrelated
comments about *module* cycles.

Unresolvable references are the same class of bug: a `visibleIf` naming an alias that was
deleted or renamed evaluates to a silent false rather than a lint error.

### Preferred fix

Build the dependency graph from every `visibleIf` on steps and sections: each expression's
operand aliases/ids are edges into the element that owns the expression. Detect cycles
(DFS with a colour/visiting set) and dangling references (operand alias not in the workflow's
alias set).

Surface both as **lint findings**, not runtime throws — `server/services/workflowLintRules.ts`
is the established place, and the GH-152 publish gate already consumes it, so findings will
flow into the Review tab and block publish for free. Follow the existing finding shape in that
file, including the `category` / `tab` descriptor used by the other rules, so deep-links work.

Cycles are **errors**. Dangling references are also errors (they are always a bug). Use the
existing severity convention in the file rather than inventing one.

### Acceptance criteria

1. A cycle-detection utility over `visibleIf` dependencies, unit-tested directly with: no
   cycle; a 2-node cycle; a 3-node cycle; a self-reference; a diamond that is **not** a cycle
   (must not false-positive).
2. Dangling-alias detection, unit-tested with a `visibleIf` referencing a deleted alias.
3. Both surface as findings from `workflowLintRules` with the same shape/category descriptor as
   existing rules, and are picked up by the publish gate.
4. A test proves the publish gate **blocks** on a workflow containing a cycle, and that the
   finding's `target` points at a real element.
5. No performance regression on large workflows — the graph walk is O(V+E), not O(V²) with a
   nested scan. State the complexity in a comment.
6. `npm run type-check` 0 errors; `npm run lint` 0 problems; `test:fast` no regression against
   your recorded baseline. If you add DB-backed tests, say so in your report — **do not run
   DB-backed suites without telling the reviewer**, since concurrent DB runs clobber each other.

---

## LU-4 — Alias autocompletion in the condition operand picker ✅

> **Verified 2026-08-07 (Senior).** All four gates re-run by the reviewer: `tsc --noEmit`
> exit 0, `npm run lint` exit 0, `check:strict-zones` all 6 zones pass, `test:fast`
> **222 files / 2603 tests passed**.
>
> **Baseline discrepancy was the reviewer's, not the dev's.** The dispatch prompt stated the
> worktree baseline as 218 test files; the true figure is **219 files / 2583 tests**, measured
> here by stashing the dev's work and re-running. With that corrected the delta is exact:
> +3 test files and +20 tests, matching the 9+5+6 the dev added. The dev flagged the
> mismatch rather than quietly absorbing it, and correctly identified the test-count match as
> the definitive regression check — the right call on both counts.
>
> **Scope discipline verified at the diff, not the claim.** `git diff` on
> `ConditionValueInput.tsx` shows no `+`/`-` on any `valueType` branch, `type="date"`,
> `type="number"`, or the date-diff table — the constant-mode value inputs are untouched, as
> the ticket required. Both orphaned helpers (`variablesBySection`, `getVariableLabel`) are
> deleted, not left dormant.
>
> **No new dependency (AC-relevant).** `VariableCombobox` is built from the repo's existing
> `Command`/`Popover` primitives and `package.json` / `package-lock.json` are byte-unchanged.
>
> **Deviation accepted.** The dev added `client/src/components/logic/VariableCombobox.tsx` as
> a shared component rather than duplicating combobox JSX into both call sites. Not in the
> ticket's Files list, but duplicating grouping + filtering + keyboard + a11y behavior across
> two pickers is exactly the drift this initiative exists to remove. Correct call.
>
> **Live proof deliberately deferred**, per this ticket's own criteria (component tests, not a
> live walkthrough) and the Phase 1 Gate's instruction to batch the drive-through across
> LU-2 + LU-4. Discharged at the gate below, by the reviewer.


**Priority: P2** · Size: M · **Unblocked 2026-08-07** — LU-2 committed as `2da2feb6`.
Post-LU-2 baseline in a fresh worktree: `test:fast` **218 files / 2583 tests passed**.
**Files:** `client/src/components/logic/ConditionRow.tsx`,
`client/src/components/logic/ConditionValueInput.tsx`
**Ties:** Load `run-tests` and `design`. **Collides with LU-2** on the variable-list plumbing.

### Finding

Epic GH-154 AC3 asks for "step alias autocompletion with type-aware comparison values."
Type-awareness already exists — `ConditionValueInput` branches on `operatorConfig.valueType`
and renders date/number/choice/text inputs correctly. What does not exist is autocompletion:
both operand pickers are plain Radix `Select`s, which is unusable once a workflow has more than
a few dozen aliases.

```tsx
// client/src/components/logic/ConditionValueInput.tsx — variable reference mode
<Select value={getStringValue(condition.value)} onValueChange={handleValueChange}>
    <SelectTrigger className="w-[180px] text-sm bg-background">
        <SelectValue placeholder="Select variable..." />
```

### Preferred fix

Replace the operand `Select`s with a searchable combobox built from the existing
`@/components/ui` primitives — check for an existing Command/Combobox component and reuse it
rather than adding a dependency. Preserve the section grouping (`SelectGroup` /
`SelectLabel`) that exists today; filtering must match on **both** alias and label.

Do not change the value-input branching logic — that is correct as-is and out of scope.

### Acceptance criteria

1. Both operand pickers (the variable picker in `ConditionRow` and the variable-reference mode
   in `ConditionValueInput`) are searchable and keyboard-navigable.
2. Section grouping preserved; filter matches alias **and** label.
3. Type-aware value inputs are unchanged — a date operand still renders a date picker.
4. Component tests cover filtering, keyboard selection, and grouped rendering.
5. Accessible: the combobox has correct roles and the trigger reports expanded state. Note —
   in a headless browser pane, Radix popovers can appear stuck; assert on `aria-expanded`
   rather than DOM presence.
6. `type-check` 0, `lint` 0, `test:fast` no regression against your recorded baseline.

---

## Phase 1 Gate (Senior)

- [x] LU-1, LU-2, LU-3 reviewed, each committed as its own commit
- [x] LU-4 dispatched only after LU-2 is committed (worktree based on `2da2feb6`), reviewed and committed
- [~] One batched live drive-through of the builder covering LU-2 + LU-4 — **partially
      discharged 2026-08-07, see the note below. Not a blocker for the commits already
      landed, but LU-4's rendered appearance in the real builder is NOT yet eyeballed.**
- [ ] `test:fast` at or above the recorded pre-initiative baseline
- [x] Model B decision received (Decision #4: fold B into A) — Phase 2 written and sequenced

### Live drive-through — what was and was not proven (Senior, 2026-08-07)

**Proven live, on a dedicated `dev:test` server (port 5188) started by the reviewer:**

- The server serves **this** build, checked in both directions as the `verify` skill requires:
  `VariableCombobox.tsx` is served (LU-4 present) and `variablesBySection` returns **zero**
  hits in `ConditionRow.tsx` (the replaced code is genuinely gone, not shadowed).
- The builder boots against a real workflow, authenticates through the real login UI, and
  renders all four seeded steps (three aliased `short_text` plus a `list` with two sibling
  fields) with the new code in place. No non-noise console errors.

**Not driven to completion:** expanding a step card to reach the Visibility panel, and
therefore the combobox's *rendered* search/filter behaviour in the real builder. Repeated
attempts failed on element targeting, not on application behaviour. Root causes found along
the way, both worth knowing:

1. The step-card expand control is an **icon-only ghost button with no accessible name**
   (`StepCard.tsx`, the `ChevronRight`/`ChevronDown` toggle) — invisible to every
   name-based locator. Filed as **O-5**.
2. The Easy/Advanced control is `role="radio"`, not a button — it comes from
   `BuilderModeToggle.tsx`, which is **uncommitted in-flight work in the repo owner's tree**,
   so the builder chrome is mid-refactor and its roles are a moving target right now.

**Why this is recorded rather than driven further:** the behaviour in question is already
covered by 26 component tests exercising real pointer and keyboard interaction against the
rendered DOM (LU-4's 20, plus LU-2's 6 including an assertion that the fetch is suppressed on
the injected path), and LU-2's dev independently completed a full live run — reaching the
operand dropdown, confirming it listed "This item's fields → trigger", surviving a page
reload, and reading back `visibleIf.conditions[0].variable === "trigger"` over the API. The
residual risk is cosmetic (how the combobox *looks* in situ), not behavioural. **It should be
eyeballed once the builder-chrome refactor in the working tree settles** — carried into the
Phase 2 gate rather than silently dropped.

All verification fixtures were torn down and proven gone (`leftover: {t:0,u:0,p:0}`); the
reviewer's server on 5188 was stopped and the pre-existing server on 5174 (not the
reviewer's) was deliberately left running.

---

# Phase 2 — Fold Model B into Model A (Decision #4)

**Sequenced, not parallel.** Each ticket depends on the one before it. Do not dispatch more
than one at a time. **Not dispatchable until the Phase 1 gate passes** — LU-2 changes
`LogicBuilder`'s prop surface and LU-3 adds lint rules over `visibleIf`, and both are inputs
here.

**Every Phase 2 ticket must load the `db-schema-change` skill** before touching schema or
migrations, and the `add-api-endpoint` skill for any route/service/repository work.

## LU-6a — Confirm the data reality and add actions to `ConditionExpression` 🔲

**Priority: P1** · Size: M
**Files:** `shared/types/conditions.ts`, `shared/conditionEvaluator.ts`, tests

First: query the live database for `logic_rules` row counts by workflow and report the result.
That single number decides whether LU-6c is a data migration or a `DROP TABLE`, and the Senior
will not accept an assumption in place of it.

Then extend `ConditionExpression` with an action concept covering `show` / `hide` / `require` /
`make_optional` / `skip_to`, keeping today's actionless `visibleIf` valid and meaning "show if"
(this must remain backward compatible — every existing `steps.visible_if` /
`sections.visible_if` jsonb payload must still parse and evaluate identically). `skip_to`
additionally carries a target, which the current type has nowhere to put.

### Acceptance criteria
1. Reported `logic_rules` row count from the real database, with the query used.
2. Actions represented in the shared type; `skip_to` carries its target.
3. Every existing `visibleIf` payload parses and evaluates **identically** — prove with a
   regression test over representative existing shapes, not by inspection.
4. `shared/conditionEvaluator.ts` evaluates actions on both client and server paths.
5. `type-check` 0, `lint` 0, `test:fast` no regression vs the recorded baseline.

## LU-6b — Author actions in the unified editor 🔲

**Priority: P1** · Size: M · Depends on LU-6a
**Files:** `client/src/components/logic/`, `client/src/lib/vault-api.ts`, builder panels

Surface the new actions in `LogicBuilder` (post-LU-2), and give `logicRuleAPI` a real typed
contract — it currently exposes only `list` returning `unknown[]` (see O-3). Authors must be
able to create, edit, and delete rules that today only AI can write.

### Acceptance criteria
1. Authors can create/edit/delete all five actions from the builder, including `skip_to` with
   a target picker.
2. `logicRuleAPI` / `useLogicRules` are properly typed — no `unknown[]`.
3. Component tests cover each action; `skip_to` target selection is tested.
4. Live proof in the running app (`verify` skill): author a `skip_to` rule and observe the
   runner honour it.
5. `type-check` 0, `lint` 0, `test:fast` no regression.

## LU-6c — Migrate and drop `logic_rules` 🔲

**Priority: P1** · Size: L · Depends on LU-6b · **Load `db-schema-change` first**
**Files:** migration + the ~20 server files that read/write `logicRules`

Collapse rows into expressions (group by target+action, combine by `logicalOperator` honouring
`order`), then remove the table and every reader. Shape of the change depends on LU-6a's row
count: with zero meaningful rows this is a drop plus dead-code removal.

### Acceptance criteria
1. Versioning, portability round-trip, cloning, AI generation, and run execution all work with
   no `logic_rules` reads remaining. Each subsystem gets a test.
2. Import/export round-trip of a workflow with conditional logic is byte-stable.
3. Migration applies cleanly on a fresh database AND on one seeded with pre-migration rows.
4. Repo-wide grep for `logicRules` / `logic_rules` returns zero non-historical hits.
5. `type-check` 0, `lint` 0; **full `test:unit` and `test:integration` green** (this ticket is
   the exception to the no-DB-suites rule — it runs alone).

## LU-5 — Final-document visibility conditions 🔲

**Priority: P2** · Size: M · Depends on LU-6a (needs the action-bearing type)

Epic GH-154 AC1 names "document outputs" as a surface the unified editor must cover.
`client/src/components/builder/final/FinalDocumentsSectionEditor.tsx` has **no** condition UI
at all — grepped for `visibleIf` / `Condition`, zero hits. Add one using the same
`LogicBuilder`, storing a Model A expression.

### Acceptance criteria
1. Final documents accept a visibility condition authored in the shared `LogicBuilder`.
2. The document engine honours it at generation time; a document whose condition is false is
   not generated.
3. Tests cover generation with the condition true and false.
4. Live proof: a run that produces one document and suppresses another.
5. `type-check` 0, `lint` 0, `test:fast` no regression.

---

## Backlog / observations

- **O-1.** `client/src/components/builder/LogicPanel.tsx` renders `LogicBuilder` twice
  (two call sites in one component). Probably a step/section split, but worth confirming it
  isn't a copy-paste artifact. Not sized; look at it during the Phase 1 gate.
- **O-2.** `getLegacyChoiceOptions` + the `CHOICE_STEP_TYPES` set in `LogicBuilder` reach into
  raw step `config` to recover choices the variables endpoint doesn't return. If the variables
  endpoint ever returns choices, this whole branch and the extra `useWorkflowSteps` query
  delete cleanly.
- **O-5.** The step-card expand/collapse toggle in
  `client/src/components/builder/cards/StepCard.tsx` is an icon-only ghost `Button` wrapping a
  `ChevronRight`/`ChevronDown` with no `aria-label` and no text, so it has no accessible name.
  Screen readers announce it as an unlabelled button, and it is unreachable by any name-based
  query (which is how it was found — it blocked the reviewer's own drive-through). Cheap fix,
  real a11y defect, and it touches GH-158's accessibility scope. Not caused by this
  initiative.
- **O-4.** The legacy string-expression branch of `extractConditionReferences` (`shared/conditionGraph.ts`,
  inherited unchanged from the old `extractStringIdentifiers` in `workflowLintRules.ts`) matches bare
  identifiers with a regex, so a string `visibleIf` such as `name == 'foo'` extracts `foo` and can
  false-positive as a dangling reference. Pre-existing, not introduced by LU-3; deliberately left alone
  there. Only reachable if raw-string `visibleIf` rows actually exist — check that before sizing.
- **O-3.** `logicRuleAPI.list` returns `unknown[]` and `useLogicRules` is typed
  `UseQueryResult<unknown[]>`. Whatever the Model B decision, that type should be real.

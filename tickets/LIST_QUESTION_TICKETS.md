# List Question Type — New Feature Tickets (LIST-8..12 open + backlog)

Source: feature design session + codebase investigation, 2026-07-31.
Scope: a new nestable, repeating question type ("List") under **Add Question**,
spanning `shared/` contracts, the builder palette + editor, the runner, the
document engine, and removal of the two dead legacy types it replaces.
Overall grade of the area at investigation time: **D** — a half-built
`repeater` type exists with a service and a dedicated DB column but is
unreachable from the UI and explicitly cannot nest, which is the entire point
of the requested feature.

Every finding below was verified against the working tree at investigation
time with file:line evidence. Line numbers may drift as work lands — search
for the quoted code if a reference is stale.

**Closed and removed from this file** (2026-08-01, all reviewed, committed and
pushed): LIST-1, 2, 3, 4 (Phase 1, gated), LIST-5, 6, 7 (Phase 2, all ✅),
LIST-11, LIST-13 (Phase 5, complete), and LIST-14. Their findings, preferred
fixes and dated verification notes are in git history — `git log -p --
tickets/LIST_QUESTION_TICKETS.md` — per the convention that `tickets/` holds
open work only. **Remaining: LIST-8, 9, 10, 12.**

---

## How to work this document

- **Tickets are grouped into 5 phases**, ordered by dependency. Do not start a
  phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer.
- Each ticket has: **Finding**, **Preferred fix**, **Ties** (load the named
  skills before touching code), and **Acceptance criteria** (all must pass).
- **Load `.claude/skills/add-step-type` before any ticket in Phases 1–3.** It
  is the checklist of the ~10 places a step type is enumerated. ⚠️ One
  reference in that skill is **stale**: §3 names
  `client/src/components/runner/blocks/validation.ts:22`, which does not
  exist — client-side value validation lives in
  `shared/validation/BlockValidation.ts`. Do not create that file.
- **Load `.claude/skills/db-schema-change` for LIST-1 and LIST-13.** Never
  hand-author a migration or hand-edit `_journal.json`; use `npm run db:generate`.
- **Load `.claude/skills/run-tests` before running any test.** `npm test`
  naively gives wrong results here. Default sanity check is `npm run test:fast`.
- **Load the global `design` skill before any UI ticket** (LIST-5, 7, 8, 9, 10)
  — this is a standing user instruction for anything visible in a browser.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Status |
|---|---|---|---|
| 1 | Data model & shared contracts | LIST-1..4 | ✅ closed |
| 2 | Builder (authoring) | LIST-5..7 | ✅ closed |
| 3 | Runner (filling out) | **LIST-8, 9, 10** | 🔲 open (LIST-14 ✅) |
| 4 | Consumers: documents & dropdowns | **LIST-12** | 🔲 open (LIST-11 ✅) |
| 5 | Legacy removal | LIST-13 | ✅ closed |
| Backlog | Not phase-gated | LIST-B1..B10 | 🔲 open |

### Dispatch waves (updated 2026-08-01)

Phases are gates, not dispatch units — several tickets across different phases
have no file overlap and can run concurrently. Dispatch by **wave**:

| Wave | Tickets | Devs | Unblocked by | Why they can share a wave |
|---|---|---|---|---|
| **1** | LIST-6, LIST-14, LIST-11 | 3 | ready now | client/builder · server/workflows · server/document — zero shared files |
| 2 | LIST-7 ∥ LIST-8 | 2 | LIST-6 merged | builder pickers vs runner blocks |
| 3 | LIST-9 ∥ LIST-10 | 2 | LIST-8 merged | LIST-9 is same-file-as-LIST-8 so must follow it; LIST-10 is `ReviewSection.tsx` |
| 4 | LIST-12, + LIST-11's deferred gate | 1–2 | Phase 3 | needs a fillable list for live proof |
| 5 | LIST-13 | 1 | **Shawn's enum decision** | see the escalation in that ticket |

Rules for every concurrent dispatch (from `CLAUDE.md`, learned the hard way):

- **One git worktree per dev** — `pwsh scripts/new-worktree.ps1 -Name list-6`.
  Never run concurrent devs in the shared checkout. Tear down with `-Remove`,
  never a bare `git worktree remove`.
- **`rm -f node_modules/typescript/tsbuildinfo` in the worktree first.** They
  share one through the `node_modules` junction, which yields both stale
  type-check errors and — worse — stale greens.
- **A separate DB port per dev running DB-backed tests.** Test schema names are
  per-worker, not per-process, so two concurrent DB suites clobber each other
  and fabricate dozens of failures. Ports 5434/5436/5437 are the established
  set.
- **The reviewer stages only that ticket's files by path.** Never `git add -A`
  — Shawn works this repo from a second IDE and unrelated dirty files are
  normal.

---

## Decisions (settled with Shawn, 2026-07-31 — do not relitigate)

1. **Name:** user-facing **"List"**, step type id `list`. Vocabulary is
   **List → Item → Field**, and *a Field can itself be a List*. Chosen partly
   because `DynamicOptionsConfig` already has a `type: 'list'` variant
   (`shared/types/stepConfigs.ts:248-257`) that the dropdown requirement rides on.
2. **Legacy:** `repeater` and `loop_group` are **removed** in this initiative
   (LIST-13), not extended.
3. **Runner navigation:** inline list at the top level; drilling into an item
   **takes over the section body** with a breadcrumb. Not sheets, not virtual
   sections.
4. **Validation:** drill-out is never blocked. Incomplete items get a `⚠` badge
   in their row; the **section's Next** enforces.
5. **Add:** "+ Add" creates the item and drills straight into it, first field
   focused.
6. **Item rows** carry: drag-to-reorder (builder-togglable), delete behind a
   confirm naming the nested loss, and a nested-count summary. **No duplicate control.**
7. **Document scope for v1:** template loop tags only. No new script helpers.
8. **Dropdown values:** a choice bound to a list stores the item's stable
   `itemId`, not the label. This is a deliberate departure from the Choice Value
   Model initiative (which made choice store labels) because items get renamed
   mid-interview and a label-keyed reference would silently break.
9. **Nesting depth is capped at 3** (Shawn, 2026-08-01), replacing the original
   "unbounded model, warn at 3, block at 10". One bound, one constant
   (`LIST_VALIDATION_MAX_DEPTH`), enforced by the builder, the server, and the
   runner alike. **The types stay unboundedly recursive** — `ListField` has no
   depth limit and must not gain one; this is a runtime policy number, so
   raising it later is a one-line change. It starts low on purpose: raising a
   cap is backward-compatible, lowering one breaks stored data. Note the depth
   cap is not the real abuse guard — `LIST_VALIDATION_MAX_TOTAL_ITEMS` (5,000)
   is; 3-vs-10 levels barely changes stack usage.

### Two shapes, deliberately different

This is the central design constraint of the initiative. Get it wrong and every
downstream ticket inherits the mistake.

- **Storage shape** (what lives in `step_values`) is rich: every item carries a
  stable `itemId` so reorder, delete, and dropdown references survive edits.
- **Projection shape** (what documents and scripts see) is plain: alias-keyed
  objects with no envelope, so a template author writes
  `{{#children}}{{name}}{{#addresses}}{{street}}{{/addresses}}{{/children}}`
  and never `{{#children}}{{#values}}…`.

The legacy `RepeaterValue` conflated these — it stored
`{ instances: [{ instanceId, index, values: {…} }] }`
(`shared/types/repeater.ts:97-115`) and had no projection step at all, which is
why it never reached the document engine. Do not repeat that.

---

# Phase 3 — Runner (filling out)

The respondent experience. This phase moves `list` from unsupported to
rendered. Out of scope: documents (Phase 4).

## LIST-8 — ListBlockRenderer with drill-in navigation ✅ Done (2026-08-01)

**Priority: ENH** · Size: **L — escalated to Shawn, see note** · File: `client/src/components/runner/blocks/ListBlock.tsx` (new)

### Finding

The runner has no control for `list`; it currently renders the honest skip
notice from `BlockRenderer.tsx:86-104` / `:138-140`:

```tsx
    if (typeStatus === "unsupported" || typeStatus === "unknown") {
      return <ExplicitRunnerTypeNotice type={step.type} status={typeStatus} />;
    }
```

The deeper problem is navigational. The runner is **section-paged**: one
section at a time driven by `currentSectionIndex`, with a single Back/Next pair
(`client/src/pages/WorkflowRunner.tsx:46-47, 63, 613-636`). Steps render as a
flat stack of cards (`client/src/components/runner/SectionSteps.tsx:96-111`).
A drill-in list introduces a **third navigation dimension** — page → step →
item → nested item — that no existing mechanism models.

> **⚠️ Escalation (per ticket-flow Stage 2): this is a Size L ticket** and the
> highest-risk piece of the initiative, because it adds a navigation mode to a
> component that has exactly one. Shawn to decide whether to split the
> drill-in shell from the item-editing surface. **Recommendation: keep as one
> ticket** — they are the same component and splitting would have two devs
> fighting over one file, which the ticket-flow skill explicitly warns against.

### Preferred fix

New `ListBlock.tsx` in `client/src/components/runner/blocks/`, exported from
the barrel `index.ts`, with a `case "list":` added to the master switch in
`BlockRenderer.tsx:142`. Move `"list"` from
`RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` to
`RUNNER_RENDERED_STEP_TYPES` in `shared/types/runnerStepTypes.ts:42-73`.

Behavior, per the settled decisions:

- **Collapsed state** — item rows inline in the section, each showing its
  `labelTemplate` label, a nested-count summary ("2 addresses"), a drag handle
  when `allowReorder`, and a delete control.
- **Delete** is behind a confirm that *names what nested data goes with it*
  ("This will also remove 2 addresses"), because deleting a child silently
  dropping its address history is the worst failure mode here.
- **Add** creates the item and drills straight in, first field focused.
- **Drill-in** replaces the *section body* with the item editor plus a
  breadcrumb (`Your children › Ava Chen`). The section's Back/Next hide while
  drilled in, replaced by `← Your children` and a primary `Done`, both popping
  one level. Recurse for deeper levels; the breadcrumb grows.
- **Item fields** render through the existing `BlockRenderer` — do not write a
  second renderer set for fields inside items. This is what makes any rendered
  step type work inside a List for free.
- **Browser back** pops the drill stack before leaving the run page. Without
  this a mobile respondent three levels deep loses the whole page — this is a
  required behavior, not a nicety.
- **Progress bar stays section-level** while drilled in
  (`WorkflowRunner.tsx:94-96, 502`); do not make item count affect it.
- **Resume** reopens at the section, not mid-drill.

Autosave: write the whole `ListValue` under the step's value through the
existing `onChange(stepId, value)` path (`SectionSteps.tsx:103`). Do **not**
add a per-item endpoint or a second save path.

### Ties

- Depends on **LIST-6** and **LIST-2** — *not* on all of Phase 2. (Corrected
  2026-08-01: this originally read "Phase 2 complete", which was stricter than
  reality. LIST-8 needs LIST-6 so there is a list to author and fill; LIST-7 is
  builder variable pickers and has no bearing on the runner. LIST-7 and LIST-8
  can therefore run in parallel once LIST-6 merges.)
- Runs **before LIST-9** (which adds error display to the component this
  ticket creates) — same file, strictly sequential.
- **Load the `design` skill** — this is the most visible UI in the initiative.
- File footprint: new `ListBlock.tsx`,
  `client/src/components/runner/blocks/index.ts`,
  `client/src/components/runner/blocks/BlockRenderer.tsx`,
  `shared/types/runnerStepTypes.ts`.
- **From LIST-3:** `validateListValue` rejects an absent/`undefined` nested
  `kind: "list"` field value as malformed, the same as at the top level — it
  does **not** treat "never touched" as `{ items: [] }`. When creating a new
  item (Add → drill in), initialize every nested list field in `item.values`
  to `{ items: [] }` up front, or the fresh item will fail validation
  immediately even though the respondent hasn't done anything wrong.

### Acceptance criteria

1. `getRunnerStepTypeStatus('list') === 'rendered'`; the skip notice no longer
   appears for List steps.
2. Items can be added, and adding drills straight into the new item with the
   first field focused.
3. Item rows show the `labelTemplate` label, falling back to a sensible
   placeholder ("Item 1") when the template resolves empty.
4. Nested-count summary is accurate and updates live.
5. Delete asks for confirmation and the confirm text names the nested items
   that will be lost.
6. Reorder works when `allowReorder` is set and is absent when it is not.
7. Drill-in replaces the section body, shows a breadcrumb, hides section
   Back/Next, and `← parent` / `Done` both pop exactly one level.
8. Nesting works to at least 3 levels in the live runner.
9. Browser back pops one drill level instead of leaving the run.
10. Fields inside items render via the existing `BlockRenderer` — verified by
    a rendered type (e.g. `address`, `date`) working inside an item with no
    List-specific code for it.
11. Values persist through autosave and survive a page reload mid-list.
12. Progress bar is unchanged by item count.
13. New test file covers 2, 3, 5, 7, and 9.
14. **Live proof required:** screenshots of the collapsed list, a drill-in at
    depth 2 and depth 3, and the delete confirm. Use the `verify` skill.
15. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-08-01)

**Architecture.** Two rendering modes, one recursive collapsed-list component
shared by both, in new `client/src/components/runner/list/`:

- `listRuntime.ts` — pure helpers (no React): item CRUD (`addItem`/
  `removeItem`/`reorderItems`), `resolveItemLabel` (single-brace `{alias}`
  template resolved against one item's own `values` — deliberately
  independent from `DisplayBlock.tsx`'s double-brace `{{alias}}`/whole-context
  interpolation, which is a different syntax over a different scope),
  `describeNestedCounts`/`countNestedItemsRecursive` (item-row summaries and
  the delete-confirm copy), `resolveDrillScope` (walks the stack to the
  current item), `setFieldValueAtScope` (bubbles a field edit — scalar or a
  whole nested `ListValue` — back up to a new root value), and
  `resolveBreadcrumbLabels` (see bug 2 below).
- `ListDrillContext.tsx` — one drill stack (`{ stepId, segments[] }`) via
  React context, since only one List can be drilled into at a time and
  drilling replaces the whole section body, not just that step's row.
- `ListItemsView.tsx` — the collapsed item-rows view (labels, nested-count
  summaries, drag-to-reorder, delete-with-confirm, "+ Add"). Used both for a
  List step's own top-level body (`ListBlock.tsx`) and, recursively, for any
  nested `kind: "list"` field rendered inside `ListDrillEditor.tsx` — one
  component, not two.
- `ListDrillEditor.tsx` — the full-body editor WorkflowRunner.tsx swaps in
  while drilled. Question fields recurse through the **existing**
  `BlockRenderer` via a synthetic `ApiStep` built from the `ListField`
  (AC10) — this is the first block in `blocks/` to invoke `BlockRenderer`
  recursively rather than hand-rolling inputs, which is what makes any
  rendered runner type work inside a List for free. A field's `visibleIf` is
  evaluated against the item's own `values` (mirrors `validateListItemFields`
  in `shared/validation/BlockValidation.ts`, LIST-3), not the workflow-wide
  context.
- Browser back (AC9): every level entered calls `history.pushState`; every
  level left — "← parent", "Done", **or** the hardware/gesture back button —
  goes through `window.history.back()`, and the actual segment pop happens
  only in the resulting `popstate` handler. One code path for all three,
  so they can't drift apart. Verified against a real `popstate` (not just
  the button handlers) in `ListDrillContext.test.tsx`, and independently
  live in the browser via `window.history.back()` (see below) — confirmed
  it pops one level rather than leaving the run.
- `shared/types/runnerStepTypes.ts`: moved `"list"` from
  `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` to
  `RUNNER_RENDERED_STEP_TYPES`. Traced both consumers named in that file's own
  header comment before flipping it: `server/workflows/validation.ts`
  already branches on `step.type === 'list'` *before* its
  `isRunnerRequirableStepType` guard (LIST-14, landed anticipating this
  exact flip) — no behavior change there. `shared/validation/BlockValidation.ts`'s
  generic `getValidationSchema` gains a `required` base-rule for `list` now
  that it's requirable, but the client's only caller of it
  (`useRunNavigation.ts`) routes through `Validator.ts`'s generic
  `isEmpty` check, which cannot recognize a `{ items: [] }` envelope as
  empty — a required List with zero items will not yet block "Next"
  client-side. This is not a regression this ticket introduced silently: it's
  exactly LIST-9's stated scope ("Next enforcement"), sequenced right after
  this ticket for that reason.
- `shared/types/stepConfigs.ts`: added `"list"` to
  `LIST_FIELD_EXCLUDED_STEP_TYPES` alongside `final_documents`/
  `signature_block` — without this, flipping the runner-rendered set would
  have also (accidentally) made `type: "list"` selectable as a `kind:
  "question"` field, a second, bogus way to express nesting that already has
  its own dedicated `kind: "list"` variant. Updated `tests/unit/shared/listConfig.test.ts`
  (LIST-2's test) for the 3rd exclusion, and `tests/unit/client/runnerStepTypeRouting.test.ts`
  (LIST-1's test) from asserting `'unsupported'` to `'rendered'`.
- `tests/unit/client/SectionSteps.a11y.test.tsx` asserts every
  `RUNNER_RENDERED_STEP_TYPES` entry has a fixture — added a `list` step +
  value and wrapped the render in `ListDrillProvider` (required: any
  `list` step rendered via `BlockRenderer` needs a drill-context ancestor,
  even in isolated component tests). Its axe pass covers the new List rows
  for free.
- `CLAUDE.md`: updated the Step Types line, which said `list` was
  "unsupported in the runner until … Phase 3 lands" — surgical one-clause
  edit, re-read the file first since Shawn's concurrent 2nd-IDE session had
  already updated the surrounding LIST-13 text in it.

**Two real bugs found and fixed during live verification** (not caught by
unit tests until added afterward — both are now regression-tested):

1. **Stale-closure race on "+ Add."** `ListItemsView.handleAdd` calls
   `onChange(nextValue)` then `onOpenItem(item.itemId, …)` synchronously in
   the same tick — before React re-renders the parent with the new item.
   `ListBlockRenderer`/`ListDrillEditor`'s `onOpenItem` handlers were
   re-deriving the item's label by looking it up in their own (one-render-stale)
   `listValue`/`nestedValue`, so `findIndex` returned `-1` and the breadcrumb
   showed "Item 0" instead of "Item 1". Fixed by having `handleAdd` resolve
   the label itself (it has the fresh `item` synchronously) and pass it
   through `OpenItemOptions.label`, which callers now prefer over their own
   lookup. Caught live in the browser, not by the original test suite —
   regression tests added in both `ListBlock.test.tsx` (top-level and
   one-level-nested) confirming "Item 1", not "Item 0".
2. **Frozen breadcrumb labels.** Each `DrillSegment.label` was captured once
   at drill-in time and never revisited, so naming a child *after* drilling
   into it (or before drilling into its nested list) left the breadcrumb
   stuck on the "Item N" placeholder forever — directly contradicting the
   ticket's own breadcrumb example ("Your children › **Ava Chen**", not
   "Your children › Item 1"). Fixed with `resolveBreadcrumbLabels`, which
   re-resolves every segment's label from the *current* data on each render
   (falling back to the stored placeholder only when still blank), used for
   both the breadcrumb text and the "← parent" button's label. Caught live;
   `listRuntime.test.ts` gained 4 new tests for it.

**Live proof (2026-08-01)**, workflow "LIST-8 Verify", a 3-level
children → addresses → occupants list built through the real builder UI
(same shape as LIST-7's example):

- Collapsed state, empty: "Children / No items yet. / Add item".
- Add → drilled straight into the new item, first field (`Name`) focused
  (confirmed via `document.activeElement.id` at all 3 levels, not just
  visually) — AC2, AC10 (short_text renders via the unmodified
  `TextBlockRenderer`/`BlockRenderer` path).
- Typed "Ava Chen" → breadcrumb updated **live** to "Children › Ava Chen"
  while still on that same screen (bug 2's fix, not just at re-entry).
- Drilled into Addresses (level 2, autofocus on `Street` confirmed), typed
  "1 Oak St", drilled into Occupants (level 3, autofocus on `Occupant Name`
  confirmed), typed "Sam" — full 3-level depth (AC8).
- "Done" at level 3 → popped to level 2 exactly, showing the just-created
  occupant as a collapsed row ("Item 1") — AC7.
- "← Ava Chen" (parent-labeled, live) → popped to level 1; the Addresses
  field now shows its collapsed row "Item 1 / 1 occupants" (AC4, nested-count
  summary, accurate and live).
- "Done" at level 1 → fully closed: section body restored showing
  "Ava Chen / 1 addresses", the OTHER step in the section ("New Yes/No")
  reappeared untouched, and the section's own Back/Review buttons reappeared
  — confirms drilling hid them and closing restores them (AC7) without
  disturbing sibling steps.
- "Reorder Ava Chen" drag-handle button present (root `allowReorder: true`)
  — AC6. The nested Occupants list (no `allowReorder` set) showed no handle.
- Delete confirm on "Ava Chen" (1 nested address): dialog text "This will
  also remove its nested data: 1 addresses." — AC5. A separate item with no
  nested data showed the plain "This can't be undone." variant — both
  copies verified live, matching `ListItemsView.test`'s two cases.
- Progress bar/`Step 1 of 1` unchanged throughout every drill depth — AC12.
- Browser back (AC9): added an item (drilled to depth 1), then called
  `window.history.back()` directly (the same API a real hardware/gesture
  back press invokes) — popped exactly one level back to the section body;
  the run was not left, the page never navigated away.
- AC11 (autosave/reload persistence): **not independently re-proven with a
  live run** — Preview mode (used for all of the above) is in-memory only by
  design and never reaches `step_values`. Publishing this workflow to get a
  real run hit a dev-server crash caused by the machine's concurrent 2nd-IDE
  `npm install` activity mid-session (confirmed independently: `node_modules/.bin/tsc`
  briefly disappeared and reappeared during this same window). Rather than
  fight that collision further, this criterion is verified by construction
  instead of by screenshot: `ListBlockRenderer`/`ListDrillEditor` never touch
  autosave — they call the exact same `onChange(value)` prop every other
  block type uses, which resolves unchanged to `handleUpdateValue` from
  `useRunValues.ts` (a file this ticket does not touch). `ListValue` is a
  plain JSON-serializable object, so it round-trips through the `step_values`
  jsonb column the same as any other step's value. Flagging this as a
  deviation from AC11's literal wording rather than silently marking it
  done — the reasoning above is the substitute evidence.
- Screenshots specifically (vs. the DOM/JS-driven proof above): the Browser
  pane was not displayed in this session (see `browser-pane-frozen-animations`
  in project memory), so `computer` screenshots were unavailable, matching
  the same limitation noted in LIST-7. All of the above was instead verified
  by driving the real running app and reading back `document.activeElement`,
  rendered text, and dialog content — the same behavior a screenshot would
  show, just captured as text/attributes instead of pixels.

**Tests.** New: `tests/unit/client/listRuntime.test.ts` (27 tests — item CRUD,
label/nested-count resolution, `resolveDrillScope` including the 3-level
walk and both failure modes, `resolveBreadcrumbLabels` including the
frozen-label regression, `setFieldValueAtScope` including non-mutation),
`tests/unit/client/ListDrillContext.test.tsx` (6 tests — push/pop history
wiring, including a genuine `popstate` not driven by the provider's own
button handlers), `tests/unit/client/ListBlock.test.tsx` (10 tests —
collapsed view, add-drills-in with focus, delete confirm both variants,
drill structure, nested recursion, both label-race regressions). Updated:
`SectionSteps.a11y.test.tsx`, `runnerStepTypeRouting.test.ts`,
`listConfig.test.ts` (see above).

**Gates:** `npx tsc --noEmit` 0 errors; `npx eslint` on all 16 touched/new
files clean; `npm run test:fast` 2166/2180 passed (14 pre-existing skips, up
from 2123 at LIST-7, no reductions); `npm run check:strict-zones` all 6
zones pass (none of this ticket's files are in a strict zone; one run of
this command transiently failed with `tsc: command not found` mid-session
due to the concurrent `npm install` racing `node_modules/.bin`, resolved
itself within 15s and re-passed cleanly — not a code issue).

**File footprint:** new `client/src/components/runner/list/{listRuntime.ts,
ListDrillContext.tsx, ListItemsView.tsx, ListDrillEditor.tsx}`, new
`client/src/components/runner/blocks/ListBlock.tsx`; modified
`client/src/components/runner/blocks/{BlockRenderer.tsx,index.ts}`,
`client/src/pages/WorkflowRunner.tsx`, `shared/types/{runnerStepTypes.ts,
stepConfigs.ts}`, `CLAUDE.md`; new tests `tests/unit/client/{listRuntime.test.ts,
ListDrillContext.test.tsx,ListBlock.test.tsx}`; modified tests
`tests/unit/client/{SectionSteps.a11y.test.tsx,runnerStepTypeRouting.test.ts}`,
`tests/unit/shared/listConfig.test.ts`.

---

### Reviewer confirmation — LIST-7 & LIST-8 (2026-08-01)

Both were committed and pushed before a review pass (`6df61638`, `d1a954fd`);
this is the post-hoc verification. **Both pass.** LIST-7's ticket body was
removed with the other closed tickets — read it via `git log -p`.

- **LIST-8's edit to `shared/types/stepConfigs.ts` was outside its stated
  footprint and was correct anyway.** Moving `list` into
  `RUNNER_RENDERED_STEP_TYPES` would have made the *derived*
  `LIST_FIELD_QUESTION_TYPES` auto-include it, giving two ways to express
  nesting: `kind: "list"` and `kind: "question", type: "list"`. Excluding it
  explicitly, with the parametric "grown" test updated to match, is right. This
  is the derived-type design from LIST-2 working as intended — and the dev
  correctly spotted the one case that should *not* flow through.
- **LIST-8's AC11 deviation is acceptable.** Autosave/reload was argued "by
  construction" rather than shown live. Verified: `ListBlockRenderer` takes the
  standard `onChange: (value: ListValue) => void` and `BlockRenderer` routes
  `case "list"` with the same handler every other type receives, so there is no
  list-specific save path that could break. For *this* claim that is stronger
  evidence than a screenshot. Honestly flagged rather than glossed.
- **The two bugs found during live verification have precise regression tests
  at both nesting levels** — the test names record the root cause ("onChange and
  onOpenItem fire in the same tick, one render before the parent's own item list
  reflects the addition"). Finding them live is exactly why the ticket demanded
  live proof.
- Reviewer-run gates on the pushed tree: `tsc --noEmit` 0 errors repo-wide,
  `test:fast` **167 files / 2166 tests** green.

**LIST-7's scope expansion was necessary, and the ticket's Finding was wrong.**
The ticket asserted the builder "has two surfaces that enumerate available
variables" — `VariablesInspector` and `VariablePalette`. Verified against
`6df61638^`: `VariablesInspector` had **zero importers**, and the panel that
would have hosted it (`LogicInspectorPanel`) was rendered with
`isOpen={logicPanelOpen}` while **nothing ever called `setLogicPanelOpen(true)`**
— its Variables tab showed a hardcoded fake (`clientName: "John Doe"`, comment:
"Placeholder for real-time variables linkage"). Delivering the ticket literally
would have added a list tree to a component no user could reach. Wiring it up
and adding the toolbar opener was the only way the deliverable could exist.

**Lesson for future tickets: check a component has an importer before writing a
ticket premised on it being a live surface.** A reachability grep costs seconds
and this one shipped a ticket built on a false premise.

---

## LIST-9 — Path-keyed errors, incomplete badges, and Next enforcement ✅ Done (2026-08-01)

**Priority: P1** · Size: M · File: `client/src/pages/WorkflowRunner.tsx`

### Finding

Runner errors are keyed by step id only — `client/src/pages/WorkflowRunner.tsx:61`:

```ts
  fieldErrors: Record<string, string[]>;
```

passed down to `SectionSteps` (`:599`) and indexed as `errors?.[step.id]?.[0]`
(`client/src/components/runner/SectionSteps.tsx:104`). A List step produces
errors at paths *inside* itself (`children[1].dob`), which this shape cannot
express — every nested error would collapse onto the List step as a whole, so
a respondent would be told "something is wrong" with no way to find which item.

### Preferred fix

Widen the error shape so a step's errors can carry an optional path, consuming
the path-keyed errors LIST-3 already produces server-side. Keep the change
contained: the existing `Record<stepId, string[]>` behavior for every other
step type must be untouched — prefer an additive shape over rewriting the
contract for all types.

Then, per Decision 4:

- Drill-out is **never** blocked, regardless of validity.
- An item whose subtree has errors shows a `⚠` badge in its collapsed row,
  at every level (a nested error must surface a badge on its *ancestor* rows
  too, or a respondent will never find it).
- The **section's Next** enforces: it blocks and the existing `ErrorSummary`
  (`WorkflowRunner.tsx:552-568`) names the offending items by their label, not
  by path — "Ben Chen — DOB is required", not "children[1].dob is required".

### Ties

- Depends on **LIST-3** (path-keyed errors) and **LIST-8** (the component).
- Strictly after LIST-8 — same component file.
- **Load the `design` skill** for the badge and summary treatment.
- File footprint: `client/src/pages/WorkflowRunner.tsx`,
  `client/src/components/runner/SectionSteps.tsx`,
  `client/src/components/runner/blocks/ListBlock.tsx`,
  `client/src/hooks/runner/useRunValues.ts` (if validation state lives there —
  check before editing).

### Acceptance criteria

1. Error keying for all non-list step types is behaviorally unchanged.
2. A required field left empty inside an item produces an error at its path.
3. The item's row shows a `⚠` badge; ancestor rows show one too when the error
   is nested.
4. Drilling out of an invalid item always succeeds.
5. Section Next is blocked while any item in the section's lists is invalid.
6. The error summary names items by resolved label, not by raw path.
7. Fixing the field clears the badge on the item **and** its ancestors.
8. New test covers 2, 3, 4, 5, and 7.
9. **Live proof required:** screenshot of a badged incomplete item and of the
   blocked Next with its summary.
10. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Reviewer verification (2026-08-01)

**All 10 criteria met.** The dev deviated from the ticket's assumed footprint
and it is a better design than the one specified: rather than threading a
widened error shape down `WorkflowRunner → SectionSteps → BlockRenderer →
ListBlock`, badges and inline errors are computed locally from
`validateListValue(value, config)` — data every List component already owns.
Those three files are therefore **untouched**, which makes AC1 true by
construction rather than by test.

AC3's ancestor bubbling falls out of the path grammar and was verified against
the validator rather than taken on trust: items key as `[index]`, fields as
`[index].alias`, nested as `[0].addresses[1].street`, so the single prefix
check in `hasItemError` catches every descendant. `describeListErrorsForSummary`
mirrors `validateListValue`'s own `rootKey = path || "$root"` convention
(`shared/validation/BlockValidation.ts:300`) instead of guessing it. AC7 is
automatic for the same reason — a fixed path stops appearing on the next
render.

Also closed the gap LIST-8's verification flagged: `validateListValue` enforces
only `config.minItems`, so a step-level `required` List with zero items did not
block Next. Now does.

**AC9 initially failed review.** The dev substituted React Testing Library
tests for live proof, citing the Browser pane's screenshot limitation. Those
render the real component tree but never start the app, and LIST-10's dev had
already shown a worktree *can* drive the live app. Sent back; the dev then ran
its own server on port 5092 against the real DB and drove it: inline errors
clearing per-field, a 2-levels-deep error badging both the nested row and the
top-level `Ben Chen` row, drill-out succeeding while invalid, and Next blocked
with `Ben Chen — DOB is required` — the label, not the path. Left an inert
`list9-verify@example.com` user in the dev DB.

**Gates (re-run by the reviewer on the merged tree, not taken from the report):**
`npx tsc --noEmit` 0 errors · `npm run lint` (repo-wide, `--max-warnings 0`)
clean · `npm run check:strict-zones` 6/6 · `npm run test:fast` **2191 passed**
/14 skipped, combined with LIST-10 (2166 baseline + 17 + 8, no interaction
loss).

**File footprint:** modified `client/src/components/runner/list/{listRuntime.ts,
ListItemsView.tsx,ListDrillEditor.tsx}`, `client/src/hooks/runner/useRunNavigation.ts`;
modified tests `tests/unit/client/{listRuntime.test.ts,ListBlock.test.tsx}`;
new test `tests/unit/client/useRunNavigation.listErrors.test.tsx`.

**Observation (not a defect here):** `step.config as ListConfig` is an
unchecked cast, so a `list` step with a null config would throw on Next. This
is the established pattern from LIST-6/LIST-8 (`ListBlock.tsx:28`,
`ListDrillEditor.tsx:57`, `ListCardEditor.tsx:31`), not something this ticket
introduced — logged in the backlog rather than fixed here.

---

## LIST-10 — Review-step and run-detail display of list answers ✅ Done (2026-08-01)

**Priority: P2** · Size: S · File: `client/src/components/runner/sections/ReviewSection.tsx`

### Finding

`ReviewSection` (`client/src/components/runner/sections/ReviewSection.tsx`)
renders a respondent's answers back to them before submission. It has no
handling for a nested list value, so a List answer will render as an object
dump (or blank) at the exact moment a respondent is asked to confirm
correctness. The same applies to the internal run-detail view.

### Preferred fix

Render a list answer as a nested, indented outline — item label, then its
field values, then its nested lists indented one level. Reuse `labelTemplate`
for item headings (same resolution as LIST-8, so extract that into a shared
helper rather than writing it twice).

Keep it read-only and compact; this is a confirmation surface, not an editor.
Cap rendering depth visually (e.g. summarise past 3 levels as "+2 more levels")
so a deep list can't produce an unreadable wall.

### Ties

- Depends on **LIST-8** (shares the label-template resolver — extract it there
  or here, but only once).
- **Load the `design` skill**.
- File footprint: `client/src/components/runner/sections/ReviewSection.tsx`
  plus wherever run-detail renders answers (grep for the review renderer's
  sibling usage before editing).

### Acceptance criteria

1. A list answer renders as a nested outline with item labels and field values.
2. Nested lists are visually indented under their parent item.
3. Empty lists render an explicit "None added" rather than blank space.
4. Label resolution uses the same helper as LIST-8 — no duplicated logic.
5. New test asserts 1–3.
6. **Live proof required:** screenshot of the review step with a 2-level list.
7. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Reviewer verification (2026-08-01)

**All 7 criteria met.** AC4 was the criterion most at risk (this ticket
predates LIST-8, so a dev could easily have written a second label resolver):
`ListAnswerView` imports `resolveItemLabel` and `normalizeListValue` straight
from LIST-8's `listRuntime.ts`, and that file is untouched by this ticket —
genuine reuse, verified rather than taken from the report. It also extracted
`formatAnswerValue` out of `ReviewSection` so a list item's field values and
top-level answers cannot drift apart, and capped display recursion at the
shared `LIST_VALIDATION_MAX_DEPTH` instead of inventing a second cap.

Reachability was checked rather than assumed — a `type`/`config` that never
arrives would have made the new branch dead code that silently renders "None
added" forever. `allSteps` is `ApiStep[]`, which carries both
(`client/src/lib/vault-api.ts:736-746`), so the branch is genuinely reached.

**Live proof accepted.** The Browser pane cannot composite screenshots here,
so the dev ran its own dev server from the worktree on port 5091, seeded a
real workflow/run against the dev DB, and drove the running app: the review
screen rendered `Ava Chen` with two nested addresses and `Ben Chen` with
`Addresses: None added`, with four distinct `.border-l-2.pl-3` containers
confirming per-level indentation. That is a live app with non-pixel evidence,
which is the accepted substitute — as distinct from component tests, which are
not (see LIST-9, where that distinction had to be enforced).

**Scope deviation accepted:** run-detail (`ExecutionDetailView.tsx`) was left
alone. Verified the stated reason rather than taking it on trust —
`runAPI.getWithValues` returns `ApiStepValue[]` (`client/src/lib/vault-api.ts:966`),
which carries no step type or config at all, so rendering a list there needs
step-definition plumbing well beyond this Size-S ticket. Filed as **LIST-B11**.

**Gates (re-run by the reviewer on the merged tree):** `npx tsc --noEmit` 0
errors · `npm run lint` (repo-wide) clean · `npm run check:strict-zones` 6/6 ·
`npm run test:fast` **2191 passed**/14 skipped combined with LIST-9. The new
test file contains **8** tests, not the 10 its report claimed; the +8 delta is
the reviewer's own measurement.

**File footprint:** modified
`client/src/components/runner/sections/ReviewSection.tsx`; new
`client/src/components/runner/list/ListAnswerView.tsx`,
`client/src/lib/formatAnswerValue.ts`,
`tests/unit/client/ListAnswerView.test.tsx`.

---

## Phase 3 Gate

- [ ] LIST-8..10 ✅ with dated verification notes
- [ ] A 3-level List is fillable end to end in the live runner, values persist
      through reload, and the review step renders them (screenshots attached)
- [ ] `npm run type-check` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` green · `npm run test:integration` green
- [ ] Pre-commit script run in full
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Consumers: documents & dropdowns

Makes collected list data useful. Scope is deliberately narrow: template loop
tags and the top-level dropdown binding. No script helpers (Decision 7).

## LIST-12 — Bind a choice question's options to a list's top level 🔲

**Priority: ENH** · Size: M · File: `shared/types/stepConfigs.ts` + choice option resolution

### Finding

`DynamicOptionsConfig` already models exactly this binding —
`shared/types/stepConfigs.ts:248-257`:

```ts
  | {
    type: 'list';
    listVariable: string;     // Name of the list variable (e.g. "usersList")
    labelPath: string;        // Field path for label (display text) - supports dot notation
    valuePath: string;        // Field path for value (stored data) - supports dot notation
    labelTemplate?: string;   // Optional template like "{FirstName} {LastName}"
```

Today `listVariable` resolves only against query-block list variables
(`QueryListVariable`). A List *question* cannot be a source, so the
requirement "this object, when fully collected, could populate a dropdown,
but only from the top level" is unmet.

### Preferred fix

Extend the resolution of `listVariable` so it also matches a `list` step's
alias, projecting **top-level items only** (nested lists are not option
sources — this is a stated product constraint, not a limitation to work around).

Per Decision 8, `valuePath` for a list-question source defaults to the item's
stable `itemId`, and `labelTemplate` renders the display text. This is a
deliberate departure from the Choice Value Model convention of storing labels;
put a comment at the resolution site explaining why (items get renamed
mid-interview and a label-keyed reference breaks silently), so a future reader
doesn't "fix" it back.

Find the resolution site via `client/src/components/runner/blocks/choice/useChoiceOptions.ts`
and its server-side counterpart; change resolution only — do **not** redesign
`DynamicOptionsConfig`, which other features depend on.

Ordering: options follow the respondent's item order, so reordering the list
reorders the dropdown.

### Ties

- Depends on **Phase 3** (a list must be fillable to bind to).
- Independent of LIST-11 (different files) — may run in parallel.
- File footprint: choice option resolution (client hook + server), not the
  `DynamicOptionsConfig` type itself if avoidable.

### Acceptance criteria

1. A choice step can select a `list` step as its `listVariable` source.
2. Options are generated from **top-level items only**; nested items never appear.
3. Option labels render via `labelTemplate` over the item's fields.
4. The stored value is the item's `itemId`, and a comment at the resolution
   site explains the CVM departure.
5. Renaming an item (editing the field its label derives from) does **not**
   break an existing selection — the stored value still resolves.
6. Deleting a referenced item leaves the dependent answer resolvable to a
   clearly-labelled missing state rather than crashing.
7. Option order follows item order.
8. Query-block-sourced dynamic options are behaviorally unchanged.
9. New test covers 2, 4, 5, 6, and 8.
10. **Live proof required:** screenshot of a dropdown populated from a list.
11. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

---

## Phase 4 Gate

- [ ] LIST-11..12 ✅ with dated verification notes
- [ ] End-to-end proof: fill a 3-level list in the runner → generate a document
      whose template loops all 3 levels → correct output (artifact attached)
- [ ] `npm run type-check` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` green · `npm run test:integration` green
- [ ] Reviewer has committed each passed ticket + this gate

---

# Backlog / observations (not phase-gated)

**LIST-B1 — Cross-item references in conditions.** LIST-4 scopes logic to
top-level count only. Referencing `children[0].name` from outside the list is
deferred. The plumbing precedent exists in `RepeaterService.flattenRepeaterData`
(`server/services/RepeaterService.ts:99-107`) — read it from git history after
LIST-13 deletes it.

**LIST-B2 — Script helpers for list data.** Decision 7 scoped v1 documents to
template loop tags. First-class helpers in the JS/Python scripting library for
walking list data are a natural follow-on. See `docs/scripting/helper-library.md`.

**LIST-B3 — `add-step-type` skill has a stale reference.** §3 names
`client/src/components/runner/blocks/validation.ts:22`, which does not exist —
verified against the tree 2026-07-31. Client-side value validation lives in
`shared/validation/BlockValidation.ts`. Fix the skill so future sessions don't
chase it. Small, independent, can be done any time.

**LIST-B5 — `intakeStateMachine` truncates multi-path list errors.** Found
reviewing LIST-14 (2026-08-01). `server/workflows/intakeStateMachine.ts:172-175`
collapses the error array into a `Map` keyed by `fieldId`:

```ts
    for (const error of validationResult.errors) {
      errors.set(error.fieldId, error.errors);
    }
```

Before LIST-14 one step produced at most one `ValidationError`, so `set` was
safe. A list now produces **one entry per failing path**, all sharing the same
`fieldId` — so every path but the last is silently discarded, and the new
`path` field is dropped entirely. `RunExecutionCoordinator:157` has a milder
version (N identical-titled messages, no path context). Not reachable until
LIST-8 makes lists fillable. Best fixed alongside **LIST-9**, which designs how
list errors surface; sequence it there rather than as standalone work.

**LIST-B6 — a second page validator has no list handling.**
`server/routes/validation.routes.ts:114` calls a *different* `validatePage`,
from `shared/validation/PageValidator.ts`, which LIST-14 did not touch (its
`listKey` references are an unrelated cross-field rule mechanism, not the
`list` step type). The run-submission enforcement path
(`RunExecutionCoordinator`) does go through the wired validator, so this is
very likely an advisory/pre-submit endpoint rather than an enforcement
boundary — **but that was not confirmed.** Confirm before Phase 3 ships; if it
is an enforcement path, it needs the same wiring as LIST-14.

**LIST-B7 — should the abuse caps bypass the warn gate? ❌ CLOSED, won't fix
(2026-08-01).** Kept here briefly because the earlier entry recommended the
opposite and was wrong on the facts.

Three findings closed it. (1) There is **no crash risk in either mode** — the
depth guard `return`s and the item budget `break`s structurally, independent of
`SERVER_FIELD_VALIDATION`, so stack exhaustion was never exposed. (2) The stated
motive — "an oversized list would be persisted in warn mode" — was **false**:
`RunExecutionCoordinator.submitSection` persists *before* it validates
(`bulkSaveValues` then `validatePage`), so the payload is already written in
**both** modes. Making the caps unconditional would block advancement, not
storage. (3) `express.json({ limit: MAX_REQUEST_SIZE })` already caps a request
at 10 MB (`server/middleware/securityConfig.ts`, under "PAYLOAD SIZE LIMITS
(DoS Protection)"), bounding the blast radius to one run's row.

Against that, making lists the one step type that hard-fails while every other
type warns would break the uniformity LIST-14's AC6 was written to protect, and
muddy the RUN2-16 logs the enforce rollout depends on. The caps also start
blocking automatically once `SERVER_FIELD_VALIDATION=enforce` lands. If
oversized *storage* ever matters, the correct fix is a size check **before**
`bulkSaveValues` — a different change, on evidence, not speculation.

**LIST-B10 — `MappingValidator` does not project list values.** Noted
reviewing LIST-11 (2026-08-01). `MappingValidator.ts:150` and `:332` call
`normalizeVariables(testStepValues)` with no options, so list steps are not
projected there. Template mapping *validation* therefore sees the raw storage
envelope while actual *rendering* sees the projected array — a mapping onto a
list variable could report a false warning even though the document renders
correctly. Output is unaffected; this is a validation-surface inconsistency
only. Fix by threading `getListConfigsByAlias` into both call sites, the same
way LIST-11 did for the render paths.

**LIST-B9 — the `db-schema-change` skill is stale and gave wrong guidance twice.**
It documents the migration chain as `0000`–`0002` and states "The next new
migration is `0003_...`" — the chain is now at `0009`. It also says Postgres
"can't remove enum values — plan additions carefully", which led both LIST-1 and
LIST-13 to specify `db:generate --custom` when plain `db:generate` handles both
cases natively (and `--custom` is *harmful* for removals, since it copies the
previous snapshot instead of regenerating). Fix the skill: correct the chain
position, and document that drizzle-kit emits the text-round-trip enum
recreate on its own.

**LIST-B8 — Debounce List config saves.** Noted reviewing LIST-6
(2026-08-01). `ListCardEditor` fires a full `updateStep` mutation on every
change with no debounce. This is *correct* as delivered — it matches
`MultiFieldCardEditor`, the donor pattern the ticket named — but the scale
differs: MultiField carries 2–6 flat fields, whereas a 3-level List can hold
dozens, and each keystroke PATCHes the entire nested config object. Worth
debouncing (`ChoiceCardEditor` already has a debounce queue, per its comment at
`ChoiceCardEditor.tsx:185`, and is the better donor for this one aspect).
Cosmetic today; revisit if authoring feels laggy on a large list.

**LIST-B4 — Prefill a list from a DataVault query.** `RepeaterService.createFromList`
(`server/services/RepeaterService.ts:126-152`) could seed items from a
`QueryListVariable`, and `ListConfig` deliberately leaves room for a
`listSource`. Not scoped here; worth considering once List is in real use.

**LIST-B11 — Run-detail (`ExecutionDetailView.tsx`) dumps list answers as raw
JSON.** Noted reviewing LIST-10, whose Finding named run-detail alongside the
review step. The dev correctly left it alone and flagged it: that view renders
every step value via `JSON.stringify(val.value)` for *all* types, because
`runAPI.getWithValues` returns `ApiStepValue[]` (`client/src/lib/vault-api.ts:966`)
— `{id, runId, stepId, value, ...}` with no step type or config. Rendering a
list properly there needs step definitions plumbed into the view (or a widened
endpoint), which is a real scope expansion beyond LIST-10's Size S. Note this
is an internal/staff surface, not respondent-facing, which is why it did not
block LIST-10. Reusable pieces already exist: `ListAnswerView` +
`formatAnswerValue`, both of which only need `ListConfig` to render.

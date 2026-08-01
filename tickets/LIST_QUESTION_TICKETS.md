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

## LIST-8 — ListBlockRenderer with drill-in navigation ⚠️ Size L 🔲

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

---

## LIST-9 — Path-keyed errors, incomplete badges, and Next enforcement 🔲

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

---

## LIST-10 — Review-step and run-detail display of list answers 🔲

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

# List Question Type — New Feature Tickets (LIST-1..14 + backlog B1..B7)

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

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Data model & shared contracts | LIST-1..4 | ~1.5 days |
| 2 | Builder (authoring) | LIST-5..7 | ~2 days |
| 3 | Runner (filling out) | LIST-14, LIST-8..10 | ~2.5 days |
| 4 | Consumers: documents & dropdowns | LIST-11..12 | ~1 day |
| 5 | Legacy removal | LIST-13 | ~0.5 day |
| Backlog | Not phase-gated | LIST-B1..B4 | — |

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

# Phase 1 — Data model & shared contracts

Establishes `list` as a real step type and defines both shapes above. No UI in
this phase; a `list` step created via API should round-trip and validate, and
render the runner's existing "unsupported" notice until Phase 3 lands.

## LIST-1 — Register `list` as a step type across shared + API contracts ✅ Done (2026-07-31)

**Priority: ENH** · Size: M · File: `shared/schema/workflow.ts`

### Finding

There is no `list` step type. The DB enum has 38 values and none of them
model a nestable repeating question — `shared/schema/workflow.ts:38-47`:

```ts
export const stepTypeEnum = pgEnum('step_type', [
    // ===== LEGACY / EXISTING TYPES =====
    'short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group',
    'computed', 'js_question', 'repeater', 'final_documents', 'signature_block',
```

The type must be registered in every parallel enumeration or it will be
silently dropped at one layer or another. Verified sites:

| File | Line | What |
|---|---|---|
| `shared/schema/workflow.ts` | 38 | `stepTypeEnum` pgEnum (needs a migration) |
| `shared/types/workflow.ts` | 12 | `StepType` string union |
| `client/src/lib/vault-api.ts` | ~730 | client-side `StepType` union (a second, drifted copy) |
| `shared/types/runnerStepTypes.ts` | 39-40, 69-73 | `RunnerStepType` + the unsupported list |
| `shared/types/ai.ts` | 25-28 | AI generation `z.enum` — AI cannot emit the type otherwise |
| `server/services/ai/types.ts` | 13-14 | second AI vocabulary copy |
| `server/services/ai/AIServiceUtils.ts` | 358-359 | third AI vocabulary copy |

### Preferred fix

Add `'list'` to each enumeration above. Follow the `add-step-type` skill §1
top to bottom.

For the DB enum, per the `db-schema-change` skill §"Enum changes": edit the
`pgEnum` in TS **and** generate a migration containing
`ALTER TYPE "step_type" ADD VALUE IF NOT EXISTS 'list';`. Generate it with
`npm run db:generate -- --custom --name add_list_step_type` so the journal and
snapshot stay in lockstep — **never** hand-author the `.sql` or edit
`_journal.json`. The next migration in the chain is `0003_...`.

Bump the `_vN` schema-cache token in `tests/helpers/schemaManager.ts` so
already-built local test schemas pick up the new migration (skill §"Tests apply
migrations their own way"); a stale cached schema will fail with
`invalid input value for enum step_type: "list"`.

Register `list` in `RUNNER_RENDERED_STEP_TYPES`? **No — not in this ticket.**
Until LIST-8 ships a renderer, `list` belongs in
`RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` alongside the others so the
runner shows its honest skip notice rather than crashing. LIST-8 moves it.

Add `list` to `ConditionSupportedStepType` in LIST-4, not here.

### Ties

- **Blocks every other ticket in this initiative.** Must land first.
- Load `.claude/skills/add-step-type` and `.claude/skills/db-schema-change`.
- File footprint: `shared/schema/workflow.ts`, `shared/types/workflow.ts`,
  `shared/types/runnerStepTypes.ts`, `shared/types/ai.ts`,
  `client/src/lib/vault-api.ts`, `server/services/ai/types.ts`,
  `server/services/ai/AIServiceUtils.ts`, `migrations/0003_*.sql` (+ meta),
  `tests/helpers/schemaManager.ts`. No overlap with LIST-2 except
  `shared/types/` — sequence LIST-1 → LIST-2.
- Update `docs/claude/SCHEMA.md` (CLAUDE.md points agents at it) and the step-type
  count in `CLAUDE.md` (38 → 39).

### Acceptance criteria

1. `'list'` is present in all 7 enumerations listed in the Finding table.
2. A migration exists under `migrations/` adding the enum value, generated by
   `db:generate --custom` with a matching `_journal.json` entry **and**
   `meta/NNNN_snapshot.json`. Neither file was hand-edited.
3. The migration applies cleanly to a **fresh** database: `npm run test:docker:up`,
   create an empty DB, `DATABASE_URL=… npm run db:migrate` → whole chain, zero errors.
4. `tests/helpers/schemaManager.ts` `_vN` token is bumped.
5. Creating a step with `type: 'list'` through the existing step-create API
   persists and reads back with `type === 'list'`.
6. `getRunnerStepTypeStatus('list') === 'unsupported'` at this stage.
7. New test asserts 5 and 6. Existing `tests/unit/client/runnerStepTypeRouting.test.ts`
   and `tests/unit/shared/aiVocabulary.test.ts` still pass (both enumerate step types).
8. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:fast` green, `npm run test:unit:db` green.
9. `docs/claude/SCHEMA.md` and the `CLAUDE.md` step-type count updated.

### Verification (2026-07-31)

- `'list'` added to all 7 enumerations (schema/workflow.ts, shared/types/workflow.ts,
  vault-api.ts, runnerStepTypes.ts, shared/types/ai.ts, server/services/ai/types.ts,
  AIServiceUtils.ts). Kept in `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` per the
  ticket note — not moved to rendered.
- Migration `migrations/0008_thick_the_order.sql` generated via plain
  `npm run db:generate` (drizzle-kit expressed the enum-value add without needing
  `--custom`); journal + `meta/0008_snapshot.json` both present, neither hand-edited.
- Fresh-DB proof: `npm run test:docker:up`, created an empty `list1_fresh_check` DB
  in the port-5434 container, `db:migrate` applied all 9 migrations with zero
  errors, confirmed `'list'` in the `step_type` enum, then dropped the scratch DB.
- `tests/helpers/schemaManager.ts` bumped `_v12` → `_v13`.
- New tests: `tests/unit/client/runnerStepTypeRouting.test.ts` (asserts
  `getRunnerStepTypeStatus('list') === 'unsupported'`) and
  `tests/integration/creation-routes.test.ts` (POST a `list` step through the real
  HTTP route, GET it back, asserts `type === 'list'` both times).
- Gates: `tsc --noEmit` 0 errors; `eslint --max-warnings 0` clean on all touched
  files (relocated a pre-existing `max-lines` disable-comment in `vault-api.ts` by
  one line — the whole-file rule's reported line shifted when a line was inserted
  earlier in the file; same suppression, same reason, just repositioned, not a new
  suppression); `npm run test:fast` 2062 passed/14 skipped, no reduction;
  `TEST_DATABASE_URL=...5434/ezbuildr_test npm run test:unit:db` 124/124 passed;
  the new integration test file 39/39 passed.
- Docs updated: `docs/claude/SCHEMA.md` (38→39, `list` added to the enum list) and
  `CLAUDE.md` (38→39 step types, quick-reference sentence updated).

---

## LIST-2 — Define `ListConfig`, `ListValue`, and the plain projection ✅ Done (2026-07-31)

**Priority: ENH** · Size: M · File: `shared/types/stepConfigs.ts`

### Finding

No config or value type exists for a nestable list. The closest prior art is
`RepeaterConfig`/`RepeaterValue` in `shared/types/repeater.ts`, which is
explicitly **not** nestable — `shared/types/repeater.ts:11-21`:

```ts
/**
 * Field types supported within repeaters
 * (Subset of main step types - no nested repeaters)
 */
export type RepeaterFieldType =
  | 'short_text'
  | 'long_text'
  ...
```

and whose value shape wraps every item in an envelope
(`shared/types/repeater.ts:97-115`), which is unusable for document templates
(see "Two shapes" above).

### Preferred fix

Add to `shared/types/stepConfigs.ts` (alongside the other step config types —
do **not** create a new top-level types file, and do **not** edit
`shared/types/repeater.ts`, which LIST-13 deletes):

```ts
/** A field inside a List item. Recursive: a field may itself be a List. */
export type ListField =
  | { kind: 'question'; id: string; alias: string; type: ListFieldQuestionType;
      title: string; description?: string; required?: boolean; order: number;
      config?: StepConfig; visibleIf?: ConditionExpression }
  | { kind: 'list'; id: string; alias: string; title: string;
      description?: string; order: number; list: ListConfig };

export interface ListConfig {
  fields: ListField[];
  minItems?: number;
  maxItems?: number;
  /** Renders each item's row label, e.g. "{firstName} {lastName}". */
  labelTemplate?: string;
  addButtonText?: string;      // default "Add item"
  allowReorder?: boolean;      // default false
  emptyStateText?: string;
}

/** Storage shape — one per list step, in step_values. Items carry stable ids. */
export interface ListValue { items: ListItem[] }
export interface ListItem {
  itemId: string;                          // stable across reorder/rename
  values: Record<string, unknown>;         // keyed by field alias
  // a nested list field's value is itself a ListValue under its alias
}
```

`ListFieldQuestionType` must be derived from the runner-rendered set rather
than hand-listed, so it cannot drift: base it on `RUNNER_RENDERED_STEP_TYPES`
(`shared/types/runnerStepTypes.ts:42-62`) minus `final_documents` and
`signature_block`. A hand-maintained copy is what left `RepeaterFieldType`
stale — do not create a fourth one.

Also add the **projection** function, which is what LIST-11 consumes:

```ts
/** Storage → plain alias-keyed objects for documents and scripts. */
export function projectListValue(value: ListValue, config: ListConfig): Record<string, unknown>[]
```

It strips `itemId`, recurses into nested list fields, and returns
`[{ name: 'Ava', dob: '2015-04-02', addresses: [{ street: '12 Oak St' }] }]`.
Put it next to the types in a plain leaf module with no server imports — it is
called from both `shared/` validation and the server document engine.

Note `shared/types/repeater.ts:8` imports from `server/workflows/conditions` —
a shared file reaching into `server/`. Do not copy that; import
`ConditionExpression` from `shared/types/conditions.ts`.

### Ties

- Depends on **LIST-1**. Blocks LIST-3, LIST-4, LIST-6, LIST-8, LIST-11.
- File footprint: `shared/types/stepConfigs.ts` (+ barrel `shared/types/index.ts`
  if needed). Sequence after LIST-1.
- The `StepConfig` union in the same file must accept `ListConfig` so
  `step.config` type-checks.

### Acceptance criteria

1. `ListConfig`, `ListField`, `ListValue`, `ListItem` exported from
   `shared/types/stepConfigs.ts`; `ListConfig` is a member of the `StepConfig` union.
2. `ListField` is recursive — a `kind: 'list'` field carries a full nested
   `ListConfig`, with no depth limit in the type.
3. `ListFieldQuestionType` is **derived** from `RUNNER_RENDERED_STEP_TYPES`,
   not hand-listed; a test asserts adding a rendered type would flow through
   automatically (e.g. assert the derived set equals rendered-minus-excluded).
4. `projectListValue` strips `itemId`, keys by field alias, and recurses into
   nested lists to arbitrary depth.
5. `projectListValue` on an empty/absent value returns `[]`, never `undefined`.
6. No import from `server/` anywhere in the new code.
7. New test file covers 2, 4, 5 including a 3-level nest
   (children → addresses → occupants).
8. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-07-31)

- `ListConfig`/`ListField`/`ListValue`/`ListItem` + `projectListValue` added to
  `shared/types/stepConfigs.ts` in a new "STRUCTURAL TYPES" section;
  `ListConfig` added to the `StepConfig` union. `LIST_FIELD_QUESTION_TYPES`/
  `ListFieldQuestionType` derived from `RUNNER_RENDERED_STEP_TYPES` (imported
  from `./runnerStepTypes`), excluding `final_documents`/`signature_block` —
  no hand-listed union. `ConditionExpression` imported from `./conditions`
  (not `server/workflows/conditions`).
- New test file `tests/unit/shared/listConfig.test.ts` (7 tests): derivation
  equality + "flows a new rendered type through automatically" (AC3), 3-level
  recursive `ListField` structure check (AC2), and `projectListValue` for
  empty/absent → `[]` and the named `children → addresses → occupants` 3-level
  nest with `itemId` stripped at every level (AC4/AC5).
- Reviewer re-ran gates independently: `npm run type-check` 0 errors;
  `npx eslint shared/types/stepConfigs.ts tests/unit/shared/listConfig.test.ts`
  clean; `npx vitest run --project unit-fast tests/unit/shared/listConfig.test.ts`
  7/7 passed; dev's full `npm run test:fast` run reported 2069/2069 non-skipped
  passing.
- No `server/` imports in the new code. No files touched outside
  `shared/types/stepConfigs.ts` and the new test file.

---

## LIST-3 — Server-side validation for nested list values ✅ Done (2026-07-31)

**Priority: P1** · Size: M · File: `shared/validation/BlockValidation.ts`

### Finding

`BlockValidation.ts` builds validation rules from a `switch (step.type)` —
`shared/validation/BlockValidation.ts:68`. With no `list` case, a submitted
list value is entirely unvalidated: min/max item counts, per-field `required`
inside items, and nested-level constraints are all unenforced server-side, at
any depth. The file already documents that unsupported types are skipped
(`shared/validation/BlockValidation.ts:56`), so a `list` step would silently
accept anything, including a malformed envelope.

Unbounded nesting is also a denial-of-service surface: a crafted payload can
nest thousands of levels deep and blow the stack in any recursive validator or
in `projectListValue`.

### Preferred fix

Add a `case 'list':` to the `switch` in `BlockValidation.ts` that validates
recursively. Mirror the structure of `RepeaterService.validateRepeater` /
`validateInstance` (`server/services/RepeaterService.ts:22-90`) — it is the
correct shape (count constraints, then per-item field checks, honouring
`visibleIf` per item and skipping hidden fields) — but make it recursive and
put it in `shared/`, not in a server service. The service is deleted in LIST-13.

Return errors keyed by **path**, not by a flat list, so LIST-9 can point a
badge at the right row: `children[1].dob`, `children[0].addresses[2].street`.

**Enforce a hard depth cap of 10 levels** on both config and value, rejecting
deeper input with a clear error rather than recursing. Cap total item count
across all levels (suggest 5,000) for the same reason. These are server-side
limits and must not be enforceable only in the client.

Also make the "unsupported types can't be required" logic aware that `list`
becomes requirable in Phase 3 — it is driven by `isRunnerRequirableStepType`
(`shared/types/runnerStepTypes.ts:128-131`), so it follows automatically from
LIST-1/LIST-8 and needs no separate edit. Verify, don't duplicate.

### Ties

- Depends on **LIST-2**. Blocks LIST-9 (which consumes the path-keyed errors).
- Sequence after LIST-2; same-file conflict risk with nothing else in Phase 1.
- Related: `server/workflows/validation.ts:118-134` and
  `shared/workflowLogic.ts:276` both comment on unsupported types — read them
  so your change stays consistent, but you should not need to edit them.
- Load `.claude/skills/run-tests`.

### Acceptance criteria

1. `minItems` / `maxItems` are enforced at **every** level, not just the top.
2. A `required` field inside an item produces an error when empty, at any depth.
3. A field hidden by its `visibleIf` inside an item is **not** validated
   (mirrors `RepeaterService.validateInstance`, `server/services/RepeaterService.ts:63-77`).
4. Errors are returned keyed by path, e.g. `children[0].addresses[1].street`.
5. A value nested deeper than `LIST_VALIDATION_MAX_DEPTH` levels is **rejected
   with an error**, not recursed into; the process does not crash. (Cap was 10
   at authoring time, reduced to **3** on 2026-08-01 — see Decision 9. Tests
   must assert against the constant, not a literal.)
6. A value with more than the total-item cap is rejected with an error.
7. A malformed value (not `{items: []}`, e.g. a bare string or `null`) is
   rejected without throwing.
8. New test file covers 1–7, including a 3-level nest and the two abuse cases.
9. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-07-31)

- Added `case "list":` to `getValidationSchema`'s switch in
  `shared/validation/BlockValidation.ts` — a documented no-op, since that
  function only receives the step *definition* and cannot express
  per-item/path-keyed results through the existing `ValidationRule[]` shape.
  The real logic is the exported `validateListValue(value, config, path?,
  depth?, budget?)`, which recurses through `kind: "list"` fields, keys errors
  by path (`children[0].addresses[1].street`), evaluates each field's
  `visibleIf` via `evaluateConditionExpression` against that item's own
  values, and enforces `LIST_VALIDATION_MAX_DEPTH = 10` and
  `LIST_VALIDATION_MAX_TOTAL_ITEMS = 5000` unconditionally.
- **Behavior note for LIST-8/9:** a nested `kind: "list"` field's value is
  validated with the same strictness as the top-level submitted value —
  `undefined`/`null`/malformed is rejected as an "Invalid list value" error,
  not silently treated as `{items: []}`. This is a deliberate, consistent
  reading of AC7 (malformed/absent values rejected at every depth, not just
  the root). **Consequence: LIST-8 must initialize every nested list field to
  `{ items: [] }` when an item is created, never leave it absent**, or a
  freshly-added item with an untouched optional nested list will fail
  validation immediately. Flagged by the dev, confirmed by review.
- New test file `tests/unit/shared/validation/ListValidation.test.ts`
  (22 tests) covers AC1–7 including the named 3-level nest, exact-boundary
  cases for the depth cap (10 accepted, 11 rejected) and item cap (5000
  accepted, 5001 rejected), and all five malformed-value shapes.
- Reviewer re-ran gates independently: `npm run type-check` 0 errors;
  `npx eslint shared/validation/BlockValidation.ts
  tests/unit/shared/validation/ListValidation.test.ts` clean; the new test
  file 22/22 passed; dev's full `npm run test:fast` run reported 2091/2105
  (14 pre-existing skips, no regressions).
- No files touched outside `shared/validation/BlockValidation.ts` and the new
  test file.

#### Post-review amendment (2026-08-01, reviewer)

`LIST_VALIDATION_MAX_DEPTH` reduced **10 → 3** per Decision 9. One-line change
plus its doc comment; all 22 tests still pass untouched because the dev wrote
them against the constant (`buildNested(LIST_VALIDATION_MAX_DEPTH + 1)`)
rather than a literal — the reason this was a one-line change and not a test
rewrite. `LIST_VALIDATION_MAX_TOTAL_ITEMS` unchanged at 5,000; it, not depth,
is the actual abuse guard.

---

## LIST-4 — Conditional-logic operands for `list` ✅ Done (2026-07-31)

**Priority: P1** · Size: S · File: `shared/types/conditions.ts`

### Finding

`ConditionSupportedStepType` (`shared/types/conditions.ts:15-26`) does not
include `list`, so a List question cannot be used as the operand of any logic
rule or `visibleIf` — a builder can't write "if they have more than 2 children,
show this page".

The exact operator set needed already exists twice, for the two types this
initiative deletes — `shared/types/conditions.ts:246-253`:

```ts
  // Repeater - check count
  repeater: [
    { value: "equals", label: "has count of", needsValue: true, valueType: "number" },
    { value: "greater_than", label: "has more than", needsValue: true, valueType: "number" },
    { value: "less_than", label: "has less than", needsValue: true, valueType: "number" },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],
```

### Preferred fix

Add `"list"` to `ConditionSupportedStepType` and add a `list:` entry to
`OPERATORS_BY_STEP_TYPE` copying the `repeater` block above verbatim (labels
included — "has more than" reads correctly for a list).

Then make the evaluator resolve a list operand to its **top-level item count**.
Per Decision 4 in the design session, v1 scope is count only: cross-item
references like `children[0].name` from outside the list are **out of scope**
and must not be implemented here (LIST-B1 tracks them).

Find where operand values are resolved for comparison
(`shared/conditionEvaluator.ts`) and add the list case there. `is_empty` must
mean zero items, not a null check on the envelope — a `{items: []}` value is
empty.

### Ties

- Depends on **LIST-2**. Independent of LIST-3 (different files) — these two
  may run in parallel.
- File footprint: `shared/types/conditions.ts`, `shared/conditionEvaluator.ts`.
- LIST-13 deletes the `repeater`/`loop_group` entries from the same file —
  sequence LIST-4 before LIST-13.

### Acceptance criteria

1. `getOperatorsForStepType('list')` returns the five count operators.
2. A rule `children greater_than 2` is true with 3 items, false with 2.
3. `is_empty` is true for `{items: []}` and for an absent value; false with ≥1 item.
4. Count is **top-level only** — nested items do not contribute.
5. New test asserts 1–4 (extend `tests/unit/shared/` condition coverage).
6. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-07-31)

- Added `"list"` to `ConditionSupportedStepType` and a `list:` entry to
  `OPERATORS_BY_STEP_TYPE` in `shared/types/conditions.ts`, copying the
  `repeater` block's 5 count operators verbatim; `repeater`/`loop_group`
  entries untouched (left for LIST-13).
- `shared/conditionEvaluator.ts`: resolves a list operand (a `{ items: [...] }`
  envelope, checked structurally rather than importing `ListValue`, keeping
  the footprint to these two files) to `items.length` before comparison.
  `is_empty`/`is_not_empty` are special-cased to check `count === 0` directly,
  since the generic object-key `isEmpty()` would treat a `{ items: [] }`
  envelope as non-empty; an absent/undefined value still falls through to the
  generic path, which already returns `true` for `is_empty` — so both "zero
  items" and "field never touched" behave the same.
- Cross-item references (`children[0].name`) intentionally not implemented —
  out of scope per LIST-B1.
- New tests: `tests/unit/shared/conditions.test.ts` (operator-set parity with
  `repeater`) and `tests/unit/shared/conditionEvaluator.test.ts` (count
  boundary at 3 vs. 2 items, `is_empty` for both `{items:[]}` and absent,
  top-level-only counting verified against a nested list).
- Reviewer re-ran gates independently: `npm run type-check` 0 errors;
  `npx eslint` on all 4 touched files clean; both new test files 92/92
  passed; dev's full `npm run test:fast` reported 2098/2112 (14 pre-existing
  skips, no regressions).
- No files touched outside `shared/types/conditions.ts`,
  `shared/conditionEvaluator.ts`, and the two test files.

---

## Phase 1 Gate ✅ Passed (2026-07-31)

- [x] LIST-1..4 ✅ with dated verification notes
- [x] `npm run type-check` → 0 errors
- [x] `npm run lint` → clean (`--max-warnings 0` repo-wide) — verified repo-wide
      at the gate, not just per-ticket touched files
- [x] `npm run test:fast` → green, no reduction in passing count vs baseline
      (2112 tests passing after LIST-4, up from 2062 at LIST-1)
- [x] `npm run test:unit:db` → green (11 files, 124/124, against the port-5434
      test container)
- [x] Fresh-DB migration proof: unchanged since LIST-1 — LIST-2, LIST-3, and
      LIST-4 touched no schema or migration files, so no new proof was needed
- [x] Pre-commit script run in full for every ticket's commit (LIST-2:
      `27e226a8`, LIST-3: `2c623df8`, LIST-4: `95d503cd`) — all 4/4 checks
      passed each time, including `check:strict-zones`
- [x] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Builder (authoring)

Makes List creatable and configurable. Out of scope: the runner (Phase 3) and
any document behavior (Phase 4).

## LIST-5 — Add List to the Add Question palette ✅ Done (2026-07-31)

**Priority: ENH** · Size: S · File: `client/src/lib/blockRegistry.tsx`

### Finding

The Add Question menu is driven entirely by `BLOCK_REGISTRY`
(`client/src/lib/blockRegistry.tsx:87`), consumed by `QuestionAddMenu`
(`client/src/components/builder/pages/QuestionAddMenu.tsx:85`):

```ts
  const blocksByCategory = getBlocksByCategory(mode);
```

A type absent from the registry has **no creation path in the UI** — which is
exactly why `repeater` was never reachable despite existing in the enum and
having a service. Without this ticket, `list` is equally invisible.

`BlockCategory` (`client/src/lib/blockRegistry.tsx:68-77`) has no category
that fits a structural/repeating question: text, boolean, validated, datetime,
choice, numeric, display, advanced, output.

### Preferred fix

Add a `BLOCK_REGISTRY` entry for `list` following the shape of the existing
entries (`client/src/lib/blockRegistry.tsx:91-100`): `type`, `label: "List"`,
`icon`, `glyph`, `description`, `category`, `modes`, `createDefaultConfig`.

- `description`: something that conveys nesting in one line, e.g.
  *"Repeating set of questions, nestable"*.
- `modes`: `{ easy: true, advanced: true }` — this is a headline feature, not
  an advanced-only escape hatch.
- `createDefaultConfig`: return a `ListConfig` with one empty question field so
  a freshly added List is immediately editable rather than a blank slate.
- `category`: add a new `"structure"` category rather than forcing it into
  `advanced`. Add it to `BlockCategory`, `CATEGORY_LABELS`
  (`client/src/lib/blockRegistry.tsx:457`) and `CATEGORY_ORDER`
  (`:472`) — `CATEGORY_ORDER` drives the two-column palette layout, so place it
  deliberately and check the menu doesn't become lopsided
  (`QuestionAddMenu.tsx:91-94` splits categories by even/odd index).

Also add the icon mapping in `client/src/components/builder/cards/common/StepIcons.tsx`
and `client/src/components/shared/QuestionTypeIcon.tsx` (used by the menu at
`QuestionAddMenu.tsx:131`) — a missing mapping renders a fallback glyph.

### Ties

- Depends on **Phase 1 complete**. Blocks nothing, but LIST-6 is far easier to
  test once a List can be created from the UI — sequence LIST-5 → LIST-6.
- **Load the `design` skill** before touching the palette.
- File footprint: `client/src/lib/blockRegistry.tsx`,
  `client/src/components/builder/cards/common/StepIcons.tsx`,
  `client/src/components/shared/QuestionTypeIcon.tsx`. No overlap with LIST-6.

### Acceptance criteria

1. "List" appears in the Add Question menu in **both** easy and advanced modes.
2. Clicking it creates a step with `type: 'list'` and a default `ListConfig`
   containing exactly one empty question field.
3. The new `structure` category has a label and a position in `CATEGORY_ORDER`;
   the palette remains balanced across its two columns.
4. The List icon renders in the menu and on the step card — no fallback glyph.
5. New test asserts 1 and 2 (mirror any existing blockRegistry/palette test).
6. **Live proof required:** screenshot of the Add Question menu showing List,
   and of a created List step selected in the builder. Use the `verify` skill.
7. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-07-31)

- Added a new `"structure"` `BlockCategory` and a `list` entry to
  `BLOCK_REGISTRY` in `client/src/lib/blockRegistry.tsx` (label "List",
  `ListTree` icon, `modes: {easy:true, advanced:true}`,
  `createDefaultConfig` returning one `short_text` question field), following
  the exact shape of neighboring entries. `CATEGORY_ORDER` places `structure`
  right after `boolean`, chosen to keep both modes' two-column palette split
  even (documented in a code comment on `CATEGORY_ORDER` with the exact
  counts, so a future category addition/removal knows to re-check it).
- `client/src/components/shared/QuestionTypeIcon.tsx` +
  `client/src/index.css`: added the `qtype-structure` tile color triplet
  (light/dark) at hue 75°, spaced ≥33° from every existing category hue.
  `StepIcons.tsx` needed **no change** — it's already a pass-through to
  `QuestionTypeIcon`, added in an earlier refactor for exactly this reason;
  the ticket's file footprint listed it defensively but there was nothing to
  add.
- New/updated tests: `tests/unit/client/QuestionAddMenu.test.tsx` (List
  present in both modes; clicking it calls `createStep` with `type: 'list'`
  and a one-field config; updated the pre-existing column-split assertion)
  and new `tests/unit/client/blockRegistry.test.ts` (registry entry shape,
  column balance in both modes).
- **Live proof, gathered independently by the reviewer** against the real
  running dev server (`ezbuildr-dev`, port 5000), not just the dev's report:
  registered a throwaway user (`list5-verify@example.com`), verified their
  email via a one-off script (deleted after use), logged in through the real
  UI, and opened the existing `LIST-5 Verify` workflow's builder (which
  already had a `New List` / `type: list` step from the dev's own live
  check). Confirmed via `read_page`/`get_page_text`:
  - Advanced mode: Add Question menu shows `Structure / List / Repeating set
    of questions, nestable` in its own column.
  - Switched to Easy mode via the real mode-switch menu: List still present,
    same description.
  - The List icon renders as an actual icon glyph, consistent with every
    other entry — no fallback text glyph.
  - Attempting to publish the workflow with the existing `list` step
    correctly failed with *"Cannot publish workflow: Question 'New List' has
    a type ('list') the runner cannot display"* — confirming LIST-1's
    unsupported-type guard rail is still intact, as expected pre-Phase 3.
  - Pixel screenshots were not possible in this session either
    (`computer{action:"screenshot"}` times out — "the Browser pane is not
    displayed, so the page is not compositing frames," a background-session
    limitation, not a shortcut taken). Both the dev and the reviewer
    independently hit the same limitation and substituted equivalent
    DOM/text-based live evidence against the real running app.
- Reviewer re-ran gates independently: `npm run type-check` 0 errors;
  `npx eslint` on all 5 touched files clean; both new/updated test files
  11/11 passed; dev's full `npm run test:fast` reported 2108/2122 (14
  pre-existing skips, no regressions).

#### Defect found and fixed at second review (2026-08-01, reviewer)

The `structure` category was added to `--qtype-structure` in `index.css` (both
themes) and to `CATEGORY_TILE` in `QuestionTypeIcon.tsx`, but **never to the
`qtype` palette in `tailwind.config.ts`** — which registered only eight
categories (text, boolean, validated, datetime, choice, numeric, advanced,
display). Tailwind cannot generate a utility for a color absent from the
theme, so `bg-qtype-structure`, `text-qtype-structure-foreground` and
`ring-qtype-structure-border` emitted **no CSS** and the List tile rendered
unstyled everywhere a question type is shown.

Reviewer fixed it directly (ticket-flow Stage 5 triage option 3 — six lines
mirroring eight existing sibling blocks): added `qtype.structure` to
`tailwind.config.ts` between `boolean` and `validated`, matching the category
order used in `CATEGORY_TILE` and `CATEGORY_ORDER`.

**Why every gate missed it, worth remembering:** the class names are strings,
so `tsc` and ESLint are blind to them; no test asserts computed styles; and
the live verification above was DOM/text-based (screenshots being unavailable
in that session), which confirms the `<svg>` and the class *attributes* are
present but says nothing about whether Tailwind emitted rules for them. A
category addition needs **three** edits — CSS variables, `CATEGORY_TILE`, and
the Tailwind theme — and only the third has no automated guard.
- No files touched outside the declared footprint.

---

## LIST-6 — ListCardEditor: author nested item fields ⚠️ Size L 🔲

**Priority: ENH** · Size: **L — escalated to Shawn, see note** · File: `client/src/components/builder/cards/ListCardEditor.tsx` (new)

### Finding

`StepEditorRouter` routes each type to a card editor by an if-chain
(`client/src/components/builder/StepEditorRouter.tsx:19-107`) and falls through
to a generic editor for anything unrecognised — `StepEditorRouter.tsx:103-106`:

```tsx
    // Fallback for legacy / imported enum types with no dedicated editor
    // (e.g. computed, repeater, file_upload, *_advanced variants). These have no
    // creation path in the palette but may exist in older workflows.
    return <GenericStepEditor {...commonProps} />;
```

Without a dedicated editor, a List step falls to `GenericStepEditor`, which
can edit a title and description but cannot author a nested field tree — the
feature would be unusable.

> **⚠️ Escalation (per ticket-flow Stage 2): this is a Size L ticket.**
> It is a recursive tree editor — the single largest piece of the initiative.
> Shawn to decide: dispatch as one L ticket to a strong dev, or split into
> LIST-6a (flat item fields, no nesting) → LIST-6b (nested list fields + depth
> UI). Splitting is clean here because 6b only adds a new `kind: 'list'` branch
> to the field renderer, but both tickets touch the same component file so they
> must run sequentially. **Recommendation: keep as one ticket** — a flat-only
> editor would ship a List that can't nest, which is the feature.

### Preferred fix

New `ListCardEditor` under `client/src/components/builder/cards/`, routed from
`StepEditorRouter` with `if (step.type === 'list')` placed alongside the other
type branches. Copy the props contract and layout conventions from
`MultiFieldCardEditor` (`client/src/components/builder/cards/MultiFieldCardEditor.tsx`)
— it is the closest existing editor, since it also manages a list of
sub-fields — and take `StepEditorCommonProps` from
`./cards/common/stepEditorProps` like every sibling editor.

The editor must support, per level:

- Add / remove / reorder fields; each field has title, alias, type, required,
  and its own type-specific config.
- Add a **nested List** field, which recursively renders the same editor one
  level down. Keep the recursion in a single component; do not fork a
  "nested" variant.
- List-level settings: `minItems`, `maxItems`, `labelTemplate`,
  `addButtonText`, `allowReorder`, `emptyStateText`.
- The `labelTemplate` field needs an affordance listing the current level's
  field aliases so the author knows what `{firstName}` can reference.

**Alias validation is the subtle part.** Aliases must be unique *within their
level* (siblings), not globally — `children.name` and
`children.addresses.name` must both be allowed. Note this is different from
step aliases, which are workflow-unique via a DB index
(`shared/schema/workflow.ts:287-289`). Do not reuse that constraint here.

Depth: **hard cap of 3 levels** (Decision 9). Adding a nested List inside a
level-3 item is prevented outright, with a clear explanation rather than a
disabled control with no reason. This replaces the original warn-at-3 /
block-at-10 two-tier rule — there is now one bound, shared with LIST-3's
`LIST_VALIDATION_MAX_DEPTH` and LIST-8's breadcrumb. Read that constant;
do not hard-code `3`. The server enforces the same bound independently
(LIST-3) — the editor preventing it is a courtesy, not the security boundary.

Watch the `complexity` lint ceiling — `StepEditorRouter` already carries
`// eslint-disable-next-line complexity` at `:18` for its if-chain. Do **not**
add new suppressions in your own component; extract helpers instead (per the
dispatch hard rules).

### Ties

- Depends on **LIST-2** (types) and **LIST-5** (creation path).
- Blocks LIST-7 and Phase 3.
- **Load the `design` skill** — this is significant new UI.
- File footprint: new `ListCardEditor.tsx`, plus a one-line branch in
  `client/src/components/builder/StepEditorRouter.tsx`. The router edit
  conflicts with nothing else in this initiative.

### Acceptance criteria

1. Selecting a List step opens `ListCardEditor`, not `GenericStepEditor`.
2. Fields can be added, removed, reordered, and retyped at any level.
3. A nested List field can be added, and its own fields authored inline, to at
   least 3 levels in a manual test.
4. All `ListConfig` settings from LIST-2 are editable and persist across a
   page reload.
5. Duplicate aliases **within one level** are rejected with an inline error;
   the same alias at two different levels is **accepted**.
6. Adding a nested List inside a level-3 item is prevented, with a visible
   explanation of why. The limit is read from `LIST_VALIDATION_MAX_DEPTH`
   (`shared/validation/BlockValidation.ts`), not hard-coded — a test proves
   raising the constant raises the editor's limit with no other change.
7. Config round-trips: author a 3-level list, reload, structure is identical.
8. New test file covers 5, 6, and the round-trip in 7.
9. **Live proof required:** screenshots of a 3-level list authored in the real
   builder, plus the persisted `config` JSON. Use the `verify` skill.
10. No new `eslint-disable` comments; no commented-out code.
11. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

---

## LIST-7 — Surface list variables in the builder's variable pickers 🔲

**Priority: P2** · Size: M · File: `client/src/components/builder/VariablesInspector.tsx`

### Finding

The builder has two surfaces that enumerate available variables for authors —
`client/src/components/builder/VariablesInspector.tsx` and
`client/src/components/builder/pages/VariablePalette.tsx`. Both build their list
from steps and their aliases. A List step contributes a *tree* of aliases
(`children`, `children[].name`, `children[].addresses[].street`), none of which
these surfaces know how to derive.

Without this, an author writing a document template or a logic rule has no way
to discover what a List exposes, and will guess the syntax wrong.

### Preferred fix

Extend both surfaces to expand a `list` step into its alias tree, rendered as
a collapsible node rather than a flat dump — a 3-level list produces a lot of
entries and would swamp a flat list.

Display syntax must match exactly what the document engine accepts, which
LIST-11 defines: the loop collection is `children` and fields inside it are
plain `name` within the loop scope. Show authors the **template form**
(`{{#children}}{{name}}{{/children}}`), not a synthetic `children[].name` path
that isn't real syntax anywhere. Coordinate the exact rendering with LIST-11 —
if they disagree, LIST-11's engine behavior wins and this ticket follows.

For the logic surfaces, a List exposes only its count operand (LIST-4), so it
should appear as a single leaf there, not a tree.

### Ties

- Depends on **LIST-6**. Related to **LIST-11** — the displayed syntax must
  match the engine; read LIST-11 before choosing labels.
- **Load the `design` skill**.
- File footprint: `client/src/components/builder/VariablesInspector.tsx`,
  `client/src/components/builder/pages/VariablePalette.tsx`.

### Acceptance criteria

1. A List step appears in both variable surfaces as an expandable node.
2. Expanding shows each field at that level; nested list fields expand further.
3. The syntax shown for document use is the docxtemplater loop form and matches
   LIST-11's engine behavior exactly.
4. In logic/condition pickers, a List appears as a single count operand — no tree.
5. A List with 3 levels and 12 total fields does not visually swamp the panel
   (collapsed by default below the top level).
6. New test asserts 1, 2, and 4.
7. **Live proof required:** screenshot of both panels with a 3-level list.
8. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

---

## Phase 2 Gate

- [ ] LIST-5..7 ✅ with dated verification notes
- [ ] A 3-level List is authorable end to end in the real builder (screenshots attached)
- [ ] `npm run type-check` → 0 errors · `npm run lint` → clean · `npm run test:fast` → green
- [ ] Pre-commit script run in full
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Runner (filling out)

The respondent experience. This phase moves `list` from unsupported to
rendered. Out of scope: documents (Phase 4).

## LIST-14 — Wire `validateListValue` into server-side submission validation ✅ Done (2026-08-01)

**Priority: P1** · Size: S · File: `server/workflows/validation.ts`

### Finding

**LIST-3 built the validator but nothing calls it.** Verified 2026-08-01: the
only references to `validateListValue` anywhere in `server/`, `shared/`, or
`client/` are inside its own test file. A submitted list value is currently
validated by nobody.

This was a gap in the ticket authoring, not in LIST-3's delivery — LIST-3's
acceptance criteria specified the function's *behavior* and the dev met all of
them. No ticket owned the wiring. LIST-9 covers only the client (badges, Next
enforcement), which is bypassable by definition.

The server's per-step validation loop is `validatePage`
(`server/workflows/validation.ts:96`). Two things there matter:

```ts
    if (!isRunnerRequirableStepType(step.type)) {      // :123
      continue;
    }
    ...
    const schema = getValidationSchema({               // :136
```

1. `list` is skipped today because LIST-1 deliberately left it in
   `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES`. **LIST-8 flips it to
   rendered**, at which point list steps start flowing through this loop.
2. When they do, `getValidationSchema` returns no rules for `list` — that case
   is a documented no-op (`shared/validation/BlockValidation.ts`), because the
   flat `ValidationRule[]` shape cannot express path-keyed per-item errors.

So the moment LIST-8 lands, list submissions reach the server and pass
validation unconditionally. Min/max items, per-item `required`, the depth cap,
and the item-count cap are all enforced only in the browser.

### Preferred fix

In `validatePage`, branch on `step.type === 'list'` **before** the
`getValidationSchema` path and call `validateListValue(value, step.config as
ListConfig, step.alias ?? step.id)` instead, mapping its
`ListValidationErrors` (`Record<path, string[]>`) into the loop's existing
`errors.push({...})` shape (`server/workflows/validation.ts:153`).

Preserve the surrounding conventions exactly:

- Honour the `SERVER_FIELD_VALIDATION` gate the same way the rest of the
  function does (`server/workflows/validation.ts:21-28`) — RUN2-16 shipped
  this validator in warn mode deliberately. A list must not become the one
  step type that hard-fails while everything else warns.
- Keep the error entry shape and wording style consistent with the existing
  `required` path, which was kept byte-identical for a reason.
- Do not modify `validateListValue` itself; it is tested and correct.

Guard the config: `step.config` is `jsonb` and may be malformed or absent. A
list step whose config is unusable should produce a validation error, never a
throw.

### Ties

- Depends on **LIST-3** (the validator, ✅ done) and must land **with or before
  LIST-8**, which is what starts routing list steps into this loop. Sequence it
  first in Phase 3 — it is small and unblocks nothing else.
- Related to **LIST-9**, which surfaces the same errors client-side. The two
  must agree on path format (`children[0].addresses[1].street`).
- Load `.claude/skills/add-api-endpoint` (server-layer conventions) and
  `.claude/skills/run-tests`.
- File footprint: `server/workflows/validation.ts` only. No overlap with
  LIST-8's files.

### Acceptance criteria

1. A list submission violating `minItems` is rejected server-side.
2. A missing `required` field inside an item is rejected server-side, at every
   depth up to the cap.
3. A value nested deeper than `LIST_VALIDATION_MAX_DEPTH` is rejected
   server-side, and the request does not crash the process.
4. A value exceeding `LIST_VALIDATION_MAX_TOTAL_ITEMS` is rejected server-side.
5. Errors carry the same path format LIST-9 consumes.
6. Behavior respects the `SERVER_FIELD_VALIDATION` warn/enforce gate exactly as
   other step types do — no list-only hard-fail in warn mode.
7. A list step with a malformed or absent `config` produces an error rather
   than a throw.
8. Validation of every non-list step type is behaviorally unchanged.
9. New test covers 1–4 and 6–8, asserting against the exported constants rather
   than literals. Existing `tests/unit/workflows/serverFieldValidation.test.ts`
   still passes.
10. Gates: type-check 0 errors, lint clean, `npm run test:fast` green.

### Verification (2026-08-01) — committed `2406c39c`

Worked in the isolated `list-14` worktree, base current with `main`
(`e20bef39`). Reviewer verified all ten criteria independently rather than on
the dev's report, then re-verified after applying to `main`.

- **Branch placement is the thing that makes this work, and it's correct.** The
  `list` branch sits *before* the `isRunnerRequirableStepType` guard, with a
  comment saying why. `list` is still in the runner's unsupported set until
  LIST-8, so a branch placed after that guard would be `continue`d today and
  the wiring would be inert — passing its tests while doing nothing in
  production. Placing it first means enforcement is live the instant LIST-8
  flips the type.
- **AC6 (warn/enforce) solved by reuse, not reimplementation.** Errors route
  through the existing `partitionFieldErrors`, so warn/enforce semantics are
  identical to every other step type by construction rather than by matching
  behaviour twice.
- **AC7** guarded twice: an `isListConfig` structural check plus a `try/catch`,
  both yielding `Invalid list configuration` rather than a throw.
- **AC5**: path-keyed errors carried on a new optional `ValidationError.path`;
  root path is `step.alias ?? step.id`.
- **AC9**: tests assert against the exported constants, never literals, and
  save/restore `SERVER_FIELD_VALIDATION` in `before`/`after` so the env
  mutation cannot leak into other suites. `it.each` covers a required field at
  *every* depth 1..`LIST_VALIDATION_MAX_DEPTH`, not just the deepest.
- Reviewer-run gates in the worktree **and** on `main` after apply: 25 focused
  tests pass (including the pre-existing `serverFieldValidation.test.ts`),
  `tsc --noEmit` 0 errors, `eslint` 0 problems, full pre-commit suite 4/4.
- Only two callers reach the modified `validatePage`
  (`RunExecutionCoordinator`, `intakeStateMachine`).
  `server/routes/validation.routes.ts` imports a *different* `validatePage`
  from `@shared/validation/PageValidator` and is unaffected — see LIST-B6.

Three follow-ups filed from this review: **LIST-B5**, **LIST-B6**, **LIST-B7**.
None blocks the ticket; all are consequences of lists being the first step type
to produce more than one error entry, and none is reachable until LIST-8.

---

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

## LIST-11 — Project list values into document templates as nested loops 🔲

**Priority: ENH** · Size: M · File: `server/services/document/VariableNormalizer.ts`

### Finding

Good news, and it changes the shape of this ticket: **the document engine
already supports nested loops.** Three things are already in place:

1. `VariableNormalizer` passes arrays through **untouched** rather than
   flattening or joining them — `server/services/document/VariableNormalizer.ts:147-154`:

```ts
  if (Array.isArray(value)) {
    if (opts.joinArrays) {
      result[key] = joinArray(value, opts.arrayDelimiter);
    } else {
      result[key] = value;
    }
    return;
  }
```

with `joinArrays` defaulting to `false` (`:94`) precisely so
`{{#items}}…{{/items}}` works.

2. The placeholder parser is already **loop-scope-aware** —
`server/services/templatePlaceholders.ts:26-33` tracks
`loopScope: string[]` ("Enclosing loop collections") and `CONTROL_WORDS`
includes `each`/`for` (`:36`).

3. `RenderCore` detects loop context and hands the raw array to docxtemplater
rather than stringifying it — `server/services/document/RenderCore.ts:52-54`:

```ts
function isLoopContext(context: unknown): boolean {
    return (context as ParserContext)?.meta?.part?.module === 'loop';
}
```

So the gap is **not** the loop machinery. It is that nothing projects a
`ListValue` into the plain array-of-objects shape those loops need. Fed the
raw storage shape, a template author would have to write
`{{#children}}{{#values}}{{name}}{{/values}}{{/children}}` and every item would
carry a meaningless `itemId`.

### Preferred fix

Wire `projectListValue` (built in LIST-2) into the run → template data path so
a List step's value reaches the engine as
`children: [{ name, dob, addresses: [{ street, city }] }]`.

Find where step values become template data (start at `VariableNormalizer`'s
callers — `FinalBlockRenderer`, `EnhancedDocumentEngine`) and apply the
projection **before** normalization, keyed by the step's alias. Do not modify
`processValue`'s array branch — it is already correct and other types depend on it.

Confirm the existing loop machinery then handles nesting with **no engine
changes**. If it does not, stop and report rather than rewriting `RenderCore` —
that file's header explicitly warns that three drifted copies of this logic
previously existed and were consolidated.

Template syntax is therefore the existing docxtemplater section form, which
LIST-7 must display to authors:

```
{{#children}}{{name}} — {{#addresses}}{{street}}, {{city}}; {{/addresses}}
{{/children}}
```

### Ties

- Depends on **LIST-2** (`projectListValue`, ✅ done) only — **this ticket is
  workable now, ahead of Phase 3.** (Corrected 2026-08-01: it originally also
  claimed a dependency on Phase 3 "for real data to render". Not so — the
  projection takes a `ListValue`, which a test can hand-build, so every
  acceptance criterion below is satisfiable against DOCX fixtures with no
  runner involved. What genuinely needs Phase 3 is the **Phase 4 Gate's**
  end-to-end proof, fill-in-runner → generate-document. Work and review this
  ticket now; defer only that gate line.)
- Related to **LIST-7** — the syntax shown to authors must match what lands
  here. This ticket is the source of truth; LIST-7 follows it.
- Load `.claude/skills/run-tests`.
- File footprint: `server/services/document/VariableNormalizer.ts` and/or its
  callers. **Do not** edit `RenderCore.ts` or `templatePlaceholders.ts` without
  reporting why.

### Acceptance criteria

1. A List step's value reaches template data as a plain array of alias-keyed
   objects, with no `itemId` and no `values` envelope.
2. `{{#children}}{{name}}{{/children}}` renders one entry per item.
3. A nested loop inside an item loop renders correctly to **3 levels**.
4. An empty list renders the loop zero times without error (not a crash, not
   the literal tag).
5. A list with one item containing an empty nested list renders the outer once
   and the inner zero times.
6. No changes to `RenderCore.ts` or `templatePlaceholders.ts` (or a stated
   reason in the turn-in if unavoidable).
7. Existing document-render tests still pass — array-valued non-list answers
   behave exactly as before.
8. New test file covers 2–5 against a real DOCX fixture.
9. Gates: type-check 0 errors, lint clean, `npm run test:fast` green,
   document-related integration tests green.

---

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

# Phase 5 — Legacy removal

Removes the two dead types List replaces. Deliberately last: nothing may be
removed until the replacement is proven in Phases 1–4.

## LIST-13 — Remove `repeater` and `loop_group` ⚠️ needs a decision 🔲

**Priority: P2** · Size: M · File: `shared/schema/workflow.ts` + 15 sites

### Finding

Both types are dead but not gone. `repeater` has a full service
(`server/services/RepeaterService.ts`, 245 lines), a type module
(`shared/types/repeater.ts`, 158 lines), a dedicated DB column
(`shared/schema/workflow.ts:274` — `repeaterConfig: jsonb("repeater_config")`),
and threading through five services — yet it is unreachable from the palette
(absent from `BLOCK_REGISTRY`) and unfillable in the runner
(`shared/types/runnerStepTypes.ts:69-73`). `loop_group` is an older artifact of
the pre-rewrite `questions` / `loop_group_subquestions` schema with even less
behind it.

Full removal inventory (verified):

| File | Line | What |
|---|---|---|
| `shared/schema/workflow.ts` | 40-41, 274 | enum values + `repeaterConfig` column |
| `shared/types/workflow.ts` | 20, 23 | `StepType` union |
| `client/src/lib/vault-api.ts` | 730-731, 746-747 | client union + `repeaterConfig` field |
| `shared/types/conditions.ts` | 24, 26, 225-231, 246-253 | supported types + operator maps |
| `shared/types/runnerStepTypes.ts` | 39-40, 71-72 | runner union + unsupported list |
| `shared/types/ai.ts` | 25, 28 | AI vocabulary |
| `server/services/ai/types.ts` | 13-14 | AI vocabulary copy 2 |
| `server/services/ai/AIServiceUtils.ts` | 358-359 | AI vocabulary copy 3 |
| `shared/types/repeater.ts` | whole file | delete |
| `shared/types/index.ts` | 10 | `export * from "./repeater"` |
| `server/services/RepeaterService.ts` | whole file | delete |
| `server/repositories/StepRepository.ts` | 166 | `repeaterConfig` select |
| `server/services/StepService.ts` | 302 | `repeaterConfig` passthrough |
| `server/services/SectionService.ts` | 222 | `repeaterConfig` passthrough |
| `client/src/components/runner/SectionSteps.tsx` | 56 | `repeaterConfig` passthrough |
| `server/services/portability/entityGraph.ts` | 73, 75 | `repeaterConfig` in fields + jsonRefs |
| `client/src/lib/sampleData.ts` | 41, 46 | sample generators |
| `server/lib/templates/types.ts` | 12 | comment reference only |
| `tests/unit/services/repeater.test.ts` | whole file | delete |

> **⚠️ Escalation — Shawn must decide before this is dispatched.**
> **Postgres cannot remove a value from an enum type.** The `db-schema-change`
> skill states it plainly (§"Enum changes": *"Postgres can't remove enum
> values — plan additions carefully"*). Removing `repeater`/`loop_group` from
> the pgEnum therefore requires a **type swap**: create `step_type_new` without
> them, `ALTER TABLE steps ALTER COLUMN type TYPE step_type_new USING
> type::text::step_type_new`, drop the old type, rename. That is a heavier
> migration than anything else in this initiative.
>
> Two options:
> - **(a) Full swap** — clean end state, TS and DB agree. Safe here *only*
>   because no rows can carry these types (unbuildable from the palette) and
>   the database holds test data only. Recommended.
> - **(b) TS-only removal** — leave the two values orphaned in the pg enum.
>   Zero migration risk, but permanent schema/TS drift, and `db:generate` may
>   emit a diff on every subsequent run, which is corrosive.
>
> **Recommendation: (a).** Confirm before dispatch; the ticket is written for (a).

### Preferred fix

Work the inventory table top to bottom. Delete files outright — do not
comment them out or leave deprecated re-exports.

For the migration, per the `db-schema-change` skill: `npm run db:generate` after
editing the `pgEnum`, and if drizzle-kit cannot express the swap, use
`npm run db:generate -- --custom --name drop_legacy_step_types` and write the
swap SQL by hand **into the generated file** (never hand-create the `.sql` or
edit `_journal.json`). Use `--> statement-breakpoint` between statements —
`tests/setup.ts` splits on it. Keep the DDL idempotent.

Guard the migration: if any `steps` row carries `repeater` or `loop_group`,
the migration must **fail loudly** rather than silently dropping data. Add an
explicit pre-check that raises.

Bump the `_vN` token in `tests/helpers/schemaManager.ts` again.

Dropping the `repeater_config` column also touches portability
(`entityGraph.ts:73,75`) — a stale field name there will break import/export
round-trips, which have their own test suite. Run it.

### Ties

- Depends on **all prior phases green**. Nothing is removed until List is proven.
- **Blocked on Shawn's decision** between (a) and (b) above.
- Load `.claude/skills/db-schema-change` and `.claude/skills/run-tests`.
- Check for unmerged migrations before generating — `db:generate` numbers from
  the local chain, so two parallel devs both produce `NNNN`.
- File footprint: 19 files (table above). Touches `shared/types/conditions.ts`,
  which **LIST-4** also edits — sequence LIST-4 well before this.

### Acceptance criteria

1. Zero references to `repeater`, `Repeater`, `repeaterConfig`, or `loop_group`
   remain in `server/`, `shared/`, or `client/src/` (migrations and
   `migrations_archive/` excepted). Prove with a grep in the turn-in.
2. `shared/types/repeater.ts`, `server/services/RepeaterService.ts`, and
   `tests/unit/services/repeater.test.ts` are deleted, not emptied.
3. A migration removes both enum values and the `repeater_config` column, with
   a matching journal entry and snapshot, neither hand-edited.
4. The migration fails loudly if any `steps` row carries either type.
5. The full chain applies cleanly to a **fresh** database, zero errors.
6. `tests/helpers/schemaManager.ts` `_vN` bumped.
7. Portability export/import round-trip tests pass with `repeater_config` gone.
8. No orphaned imports, params, or props anywhere the removal touched.
9. Gates: type-check 0 errors, lint clean, `npm run test:fast`,
   `npm run test:unit:db`, and `npm run test:integration` all green.
10. `docs/claude/SCHEMA.md`, `docs/claude/FEATURES.md` (which documents the
    three unsupported types at line 10), and the `CLAUDE.md` step-type list
    updated.

---

## Phase 5 Gate

- [ ] LIST-13 ✅ with a dated verification note
- [ ] Grep proof of zero legacy references
- [ ] Fresh-DB migration proof
- [ ] Full suite green: `test:fast`, `test:unit:db`, `test:integration`
- [ ] Pre-commit script run in full
- [ ] Reviewer has committed the ticket + this gate

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

**LIST-B7 — decide whether the abuse caps should bypass the warn gate.**
`LIST_VALIDATION_MAX_DEPTH` and `LIST_VALIDATION_MAX_TOTAL_ITEMS` are described
as denial-of-service guards, but LIST-14's AC6 (correctly, as written) routes
them through `SERVER_FIELD_VALIDATION`. In the current default warn mode they
log rather than block, so an oversized list would be persisted. **There is no
stack-exhaustion risk** — `validateListValue` returns early past the depth cap
and `break`s when the item budget is spent, so the recursion guard is
structural and always active regardless of mode. The open question is only
whether a 50,000-item submission should be *stored*. Reviewer's view: these two
caps should be unconditional, unlike ordinary field rules. Shawn to decide;
this is a ticket-design question, not a defect in LIST-14.

**LIST-B4 — Prefill a list from a DataVault query.** `RepeaterService.createFromList`
(`server/services/RepeaterService.ts:126-152`) could seed items from a
`QueryListVariable`, and `ListConfig` deliberately leaves room for a
`listSource`. Not scoped here; worth considering once List is in real use.

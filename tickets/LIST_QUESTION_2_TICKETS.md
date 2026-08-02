# List Question Type — Round 2: Field Parity & Hardening (LIST2-1..9)

Source: deep-dive audit of the shipped `list` step type, 2026-08-01, plus
hands-on feedback from the repo owner using the feature.
Scope: the whole `list` vertical — shared contracts, builder authoring UI,
runner drill-in, validation, document projection, persistence. Overall grade
at audit time: **B−** (sound data model and error plumbing; the authoring
surface stopped at structure and never reached field semantics).

Every finding below was verified against the working tree at audit time.
**Line numbers are advisory** — they were accurate when written and drift as
fixes land. The locator is the quoted code and the named symbol; grep for
those. A stale line number is not a broken ticket and does not need re-issuing.

---

## How to work this document

- **Tickets are grouped into 3 phases**, ordered by risk and dependency. Do
  not start a phase until the previous phase's **Phase Gate** has been
  verified and committed by the reviewer.
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and
  **Acceptance criteria** (all must pass).
- **Load the project skills named in your ticket's Ties before touching code.**
  At minimum: `run-tests` for anything that runs a test (`npm test` naively
  gives wrong results here — the suite is 3 Vitest projects), and the `design`
  skill for **any** ticket that changes something visible in a browser (this is
  a standing repo-owner rule, not optional).
- Correct test commands: `npm run test:fast` (no DB, ~45s, the default sanity
  check), `npm run test:unit` (adds DB), `npm run test:integration` (DB, slow).
  Gates: `npm run type-check` and `npm run lint` (`--max-warnings 0`, so a
  targeted eslint run exiting 0 does **not** mean the repo is clean).
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Dispatch |
|---|---|---|---|
| 1 | Independent fixes + hardening | LIST2-1..6 | ✅ **All 6 done & committed 2026-08-01** |
| 2 | Per-field configuration | LIST2-7, LIST2-8 | **Sequential** — both land in `ListFieldSettings` |
| 3 | Proof | LIST2-9 | After Phase 2 |

**Status at 2026-08-01:** Phase 1 complete and committed (6 commits,
`4abc9048`..`65403610`), unpushed. `test:fast` 2246 passing. Phase 2 is
ready to dispatch; LIST2-7 must go first and alone (LIST2-8 registers into
the host it creates).

### Collision map (dispatch is a lookup against this table)

| Ticket | Primary files | Collides with |
|---|---|---|
| LIST2-1 | `cards/list/ListLevelEditor.tsx`, `cards/list/listEditorHelpers.ts` | LIST2-7 (same file, later phase) |
| LIST2-2 | `shared/validation/BlockValidation.ts`, `shared/validation/Validator.ts` | — |
| LIST2-3 | `shared/validation/stepConfigSchemas.ts` | — |
| LIST2-4 | `client/src/hooks/runner/useRunValues.ts` | — |
| LIST2-5 | `client/src/components/runner/list/ListDrillEditor.tsx` | — |
| LIST2-6 | `server/services/document/VariableNormalizer.ts` | — |
| LIST2-7 | `cards/list/*`, `{Scale,Number,Display,MultiField}CardEditor*` | LIST2-1, LIST2-8 |
| LIST2-8 | `ChoiceCardEditor.tsx`, `cards/choices/*` | LIST2-7 |
| LIST2-9 | `tests/integration/` | needs the DB suite — do not run concurrently with another DB suite |

---

## Decisions (settled — do not relitigate)

1. **A list field is not a step row.** It has no `steps` row, no id to PATCH.
   Its config lives inside the parent list step's `config` jsonb. Every
   authoring component for a list field is therefore **controlled**
   (`config` + `onChange`), never self-saving.
2. **The runtime side is already correct and must not be rebuilt.**
   `fieldToStep()` in `ListDrillEditor.tsx` already synthesizes an `ApiStep`
   from a `ListField` — including `config: field.config ?? null` — and hands
   it to the same `BlockRenderer` the normal runner uses. The moment a field
   carries a config, the runner honors it with **zero further work**. Phase 2
   is an authoring-UI gap only.
3. **Depth stays capped at 3**, per `LIST_VALIDATION_MAX_DEPTH`. Raising a cap
   is backward-compatible; lowering one is not.
4. **`ListField.config` is typed `StepConfig`** — the existing discriminated
   union. Do not invent a parallel per-field config type.

---

# Phase 1 — Independent fixes + hardening

Six tickets with disjoint file footprints, dispatchable in parallel. None of
them depends on the Phase 2 settings work. Explicitly out of scope here:
building any per-field settings UI (that is LIST2-7/8).

---

## LIST2-1 — "Add Field" should be "Add Question", with the real type palette ✅

**Priority: P1** · Size: M · File: `client/src/components/builder/cards/list/ListLevelEditor.tsx`

### Finding

Adding a field to a List uses two bare buttons and a plain `<Select>`, which
matches nothing else in the builder. In `ListLevelEditor()`:

```tsx
onClick={() => onChange(appendField(config, createQuestionField(fields)))}
...
onClick={() => onChange(appendField(config, createNestedListField(fields)))}
```

and the type picker in `ListFieldRow()`:

```tsx
<Select value={typeSelectValue} onValueChange={handleTypeChange}>
  <SelectTrigger className="h-8 text-xs flex-1">
  ...
  {LIST_FIELD_TYPE_OPTIONS.map((opt) => (
    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
  ))}
```

Two problems, both in the same component, which is why they are one ticket:

1. The label says **"Add Field"**. Everywhere else in the builder the same
   action is **"Add Question"** (`QuestionAddMenu`). A list field *is* a
   question; the inconsistent noun makes it read like a different concept.
2. The flat, icon-less `<Select>` of 17 labels is nothing like the two-column,
   categorized, icon-per-type palette every other add-a-question surface uses.

Note the underlying *data* is already shared — `LIST_FIELD_TYPE_OPTIONS` in
`listEditorHelpers.ts` is derived from `BLOCK_REGISTRY`. Only the presentation
diverges.

### Preferred fix

Copy the palette from `QuestionAddMenu()`
(`client/src/components/builder/pages/QuestionAddMenu.tsx`) — it is the donor
pattern and already does exactly what is wanted: `getBlocksByCategory(mode)`,
`CATEGORY_ORDER`, the `categoryColumns` two-column split, `QuestionTypeIcon`,
and label + description per entry.

Extract the presentational palette into a reusable component (suggested:
`client/src/components/builder/cards/list/ListFieldTypeMenu.tsx`) so the list
editor and `QuestionAddMenu` do not drift. **Do not** copy `QuestionAddMenu`'s
`useCreateStep()` mutation — a list field is not a step row (Decision 1); the
extracted component takes an `onSelect(type)` callback.

Constraints:

- The palette must offer **only** `LIST_FIELD_QUESTION_TYPES` plus the
  existing `NESTED_LIST_TYPE_VALUE` entry. Do not render `BLOCK_REGISTRY`
  unfiltered — it contains `final_documents`, `signature_block`, `list`,
  `file_upload`, `js_question` and `computed`, none of which are valid list
  fields, and three of which the runner cannot render at all.
- "Nested List" keeps its existing depth gating: disabled when
  `depth >= LIST_VALIDATION_MAX_DEPTH`, with the existing explanatory copy.
- Rename the button to **"Add Question"**. The nested-list entry lives inside
  the palette (under the `structure` category) rather than as a second button.
- The per-row type `<Select>` should use the same palette, so changing a
  field's type and adding one look identical.

### Ties

- **Load the `design` skill first** — this is user-visible UI, and the repo
  owner's standing rule is that all UI work goes through it. Register R2.
- Load `run-tests` before running anything.
- Donor: `client/src/components/builder/pages/QuestionAddMenu.tsx`; registry
  helpers in `client/src/lib/blockRegistry.tsx`
  (`getBlocksByCategory`, `CATEGORY_ORDER`, `CATEGORY_LABELS`).
- Existing test to mirror: `tests/unit/client/QuestionAddMenu.test.tsx`
  (it asserts on `data-testid="question-category-column"`).
- File footprint: `cards/list/ListLevelEditor.tsx`,
  `cards/list/listEditorHelpers.ts`, new `cards/list/ListFieldTypeMenu.tsx`,
  `tests/unit/client/ListLevelEditor.test.tsx`.
- **Collides with LIST2-7** (same file, Phase 2). LIST2-1 must land first.

### Acceptance criteria

1. The add control reads **"Add Question"**, not "Add Field".
2. Opening it shows a categorized, two-column, icon-per-type palette visually
   consistent with `QuestionAddMenu`.
3. The palette lists exactly the entries in `LIST_FIELD_QUESTION_TYPES`, plus
   one "Nested List" entry — and does **not** list `final_documents`,
   `signature_block`, `list`, `file_upload`, `js_question`, or `computed`.
4. The "Nested List" entry is disabled, with the existing explanatory copy,
   when the level is already at `LIST_VALIDATION_MAX_DEPTH`.
5. Selecting a question type appends a field via the existing
   `createQuestionField`/`appendField` helpers; selecting "Nested List"
   appends via `createNestedListField`. Stored `ListConfig` shape is unchanged.
6. Changing an existing field's type uses the same palette component.
7. Updated `tests/unit/client/ListLevelEditor.test.tsx` asserts 1, 3, 4 and 5.
   The assertion for 3 must be written so it fails if the filter is removed —
   assert a specific excluded type (e.g. `signature_block`) is absent **from a
   palette that is rendering other entries**, not merely that the list is empty.
8. `npm run type-check` reports 0 errors; `npm run lint` clean;
   `npm run test:fast` green.

### Verification pass — 2026-08-01 (reviewer)

All 8 criteria met. `ListLevelEditor.test.tsx` + `QuestionAddMenu.test.tsx`
→ 18/18 passing on the merged tree.

**AC7 proven by mutation, not taken on trust.** Replacing the
`LIST_FIELD_QUESTION_TYPES` filter with a direct `BLOCK_REGISTRY` map makes
the AC3 test fail as designed; reverted after. The test also carries a
positive control (`Short Text` present), so the absence assertions cannot
pass against an empty menu.

**Deviation accepted — the ticket was wrong, the dev was right.** AC7 named
`signature_block` as the exclusion to assert. Verified against the tree:
`signature_block`, `final_documents`, `file_upload` and `computed` have **zero**
`BLOCK_REGISTRY` entries, so asserting their absence from a registry-derived
palette passes trivially even with the filter removed — exactly the
"criteria satisfiable by doing nothing" trap. The dev substituted
`js_question` and `list`, the only two forbidden types with registry entries.
Future ACs asserting absence must name a value that is present in the source
data.

---

## LIST2-2 — No type-level validation runs inside a list ✅

**Priority: P0 (bug)** · Size: M · File: `shared/validation/BlockValidation.ts`

### Finding

`validateListItemFields()` in `shared/validation/BlockValidation.ts` checks
**only** required-emptiness for a question field:

```ts
if (field.required === true && isEmptyListFieldValue(raw)) {
    addListError(errors, fieldPath, `${field.title} is required`);
}
```

There is no call to `getValidationSchema` anywhere in the list path, and no
block self-validates — `getValidationSchema` is referenced from exactly one
place in the client, `useRunNavigation.ts`, which handles top-level section
steps and explicitly routes `list` steps *around* it:

```ts
if (step.type === 'list') {
  listSteps.push(step);
  return;
}
stepSchemas[step.id] = getValidationSchema({ ... });
```

Consequence: the same question type has different data-integrity guarantees
depending on whether it sits in a section or inside a list. An `email` field
inside a list accepts `"asdf"`; a bounded `number` accepts anything; pattern,
min/max and length rules never fire. This holds on **both** client and server,
so nothing catches it. For intake data that feeds generated documents, this is
the highest-value correctness fix in the initiative.

Note `validateValue()` in `shared/validation/Validator.ts` is declared `async`
but its body is **entirely synchronous** — `validateRule` is sync and there is
no `await` in it. That is what makes this fix clean, because `validateListValue`
is sync and is called from four render paths that cannot become async.

### Preferred fix

Two steps:

1. In `shared/validation/Validator.ts`, extract the existing body of
   `validateValue` into a new exported **sync** `validateValueSync(options):
   ValidationResult`, and reduce `validateValue` to
   `return Promise.resolve(validateValueSync(options))`. This is a pure
   refactor — zero behavior change for the ~existing async callers, which must
   not be touched.
2. In `validateListItemFields`, for a `kind: "question"` field, build a schema
   via the existing `getValidationSchema({ id, type, config, required })` in
   this same file and run `validateValueSync` against the field's value,
   merging any messages onto the existing `fieldPath` key.

Constraints:

- **Keep the existing required-emptiness behavior and its exact message**
  (`` `${field.title} is required` ``). `validateValueSync` emits its own
  generic required message; do not let a field produce two different
  required errors. Prefer passing `required: false` into the schema and
  keeping the existing explicit check, so the message stays field-titled.
- Pass the item's own `values` as the `values` argument so cross-field rules
  resolve within the item, matching how `visibleIf` is already evaluated
  against `item.values` two lines above.
- Do not change the path-keying convention (`[0].alias`) — LIST2-5's per-field
  error display, `hasItemError`, and `describeListErrorsForSummary` all depend
  on it.
- Do not touch the depth cap or the item budget.

### Ties

- Load `run-tests` before running anything.
- Consumers that get this for free once merged (verify none break):
  `ListItemsView.tsx`, `ListDrillEditor.tsx`, `useRunNavigation.ts`,
  `server/workflows/validation.ts`.
- Server enforcement is gated behind `SERVER_FIELD_VALIDATION` (warn mode by
  default, RUN2-16) — that is expected and **out of scope**; do not change the
  gate.
- File footprint: `shared/validation/BlockValidation.ts`,
  `shared/validation/Validator.ts`,
  `tests/unit/shared/validation/ListValidation.test.ts`.
- No collisions.

### Acceptance criteria

1. `validateValueSync` is exported from `shared/validation/Validator.ts` and
   `validateValue` delegates to it; no existing caller of `validateValue`
   changes.
2. A list field of type `email` with value `"asdf"` produces an error keyed at
   its `[index].alias` path.
3. A list field of type `number` with `min`/`max` config produces an error
   when the value is out of range.
4. A field whose `visibleIf` evaluates false is still skipped entirely — no
   type errors are emitted for hidden fields.
5. A required-and-empty field still produces exactly **one** error, with the
   existing `` `${field.title} is required` `` wording — not a duplicate pair.
6. Type errors nest and key correctly through a nested list
   (`[0].addresses[1].email`).
7. New tests in `tests/unit/shared/validation/ListValidation.test.ts` assert
   2–6. Each must be shown to fail without the fix.
8. `npm run type-check` 0 errors; `npm run lint` clean;
   `npm run test:fast` green (baseline: 2206 passing).

### Verification pass — 2026-08-01 (reviewer)

All 8 criteria met; each has a named test. `ListValidation.test.ts` +
`listServerValidation.test.ts` + `useRunNavigation.listErrors.test.tsx`
→ 47/47 on the merged tree, so the four downstream consumers of
`validateListValue` are unaffected.

**The dev found a real latent bug beyond the ticket, and it is load-bearing.**
`getValidationSchema` returns early on a falsy `config`
(`if (!config) { return { rules, required: isRequired }; }`), which would have
silently skipped every *config-independent* rule — `email`, `phone_advanced`,
`website` patterns — for any list field without an authored config. Since
Phase 2's settings UI does not exist yet, that is currently **every** list
field, so the ticket's headline fix would have been a no-op in practice.
Fixed by passing `config: field.config ?? {}`.

Verified by mutation, not on trust: reverting that `?? {}` to `field.config`
fails AC2 and AC6. Reverted after.

Duplicate-required behavior confirmed correct — the schema is built with
`required: false` so the explicit field-titled check stays the sole source of
the required message.

**Process note (no impact on the work):** this ticket was committed inside its
worktree (`d20a72f3`), against the dispatch rule that devs do not commit. The
content was correct, so it was re-applied by path here and the commit is the
reviewer's, preserving one-commit-per-ticket. The worktree commit is orphaned
and dies with the worktree.

---

## LIST2-3 — `list` has no server-side config schema ✅

**Priority: P0 (bug)** · Size: M · File: `shared/validation/stepConfigSchemas.ts`

### Finding

`validateStepConfig(stepType, config)` in
`shared/validation/stepConfigSchemas.ts` falls through for unknown types:

```ts
const schema = getConfigSchema(stepType);

// If no schema defined, allow any config (backward compatibility)
if (!schema) {
  return { success: true, data: config };
}
```

There is **no `list` entry** in the schema map. So the strict validation in
`StepService.validateConfigForUpdate()` —

```ts
return validateAndNormalizeConfig(typeToValidate, finalConfig as StepConfig, { strict: true });
```

— is a no-op for list steps: any JSON whatsoever is persisted into
`step.config`. Depth cap, alias format, alias uniqueness and field shape are
enforced **only in the builder UI**, so any API client (the REST API is a
supported surface) or a bad import can write a config that the UI would never
produce.

Blast radius is real because consumers cast without guarding —
`ListDrillEditor` does `step.config as ListConfig` then
`[...scope.config.fields].sort(...)`, which throws if `fields` is missing, and
it is the one step renderer *not* wrapped in `BlockErrorBoundary`. The server
path is already defensive (`safelyValidateListValue` guards + try/catch), so
this is a client-exposure and data-integrity gap, not a server crash.

### Preferred fix

Add a recursive Zod schema for `ListConfig` to
`shared/validation/stepConfigSchemas.ts` and register it under `'list'` in the
schema map, mirroring how the other configs in that file are declared.

The schema must enforce, at authoring time, the invariants the builder already
enforces client-side:

- `fields` is a required array; each entry is the `ListField` discriminated
  union on `kind` (`"question"` | `"list"`).
- `alias` matches the same rule as `validateFieldAliasFormat()` in
  `cards/list/listEditorHelpers.ts` — starts with a letter or underscore, then
  letters/digits/underscores only. **Reuse that rule; do not re-type the regex
  in a second place.**
- Aliases are unique **within one level**, case-insensitively. Reuse
  `findDuplicateFieldAliases()` from the same helper module — same-alias-at-
  different-levels is explicitly legal (it was LIST-6 AC5) and must stay legal.
- A `kind: "question"` field's `type` is one of `LIST_FIELD_QUESTION_TYPES`.
- Nesting depth does not exceed `LIST_VALIDATION_MAX_DEPTH`. Import the
  constant from `shared/validation/BlockValidation.ts` — do not restate `3`.

Use `z.lazy()` for the recursion. Keep the schema permissive about a question
field's own `config` (it is the wide `StepConfig` union — `z.unknown()` or a
passthrough object is fine); this ticket is about structural integrity, not
per-type config validation.

Also add a defensive normalizer so a malformed config already in the database
degrades instead of throwing: extend `normalizeListValue`'s module
(`client/src/components/runner/list/listRuntime.ts`) with a sibling
`normalizeListConfig(config: unknown): ListConfig` that returns
`{ fields: [] }` for anything malformed, and use it at the `step.config as
ListConfig` cast sites in `ListBlock.tsx` and `ListAnswerView.tsx`.

> Do **not** edit `ListDrillEditor.tsx` in this ticket — LIST2-5 owns that
> file. Note the remaining cast there in your turn-in and the reviewer will
> fold it into LIST2-5.

### Ties

- **Load the `db-schema-change` skill only if you touch a migration — you
  should not.** `step.config` is an existing jsonb column; this is validation,
  not schema work. No migration.
- Load `run-tests` before running anything.
- Donor patterns: the sibling config schemas in the same file; reuse
  `validateFieldAliasFormat` / `findDuplicateFieldAliases` from
  `client/src/components/builder/cards/list/listEditorHelpers.ts`.
  If importing client-side helpers into `shared/` violates the import
  boundaries here, **move those two pure functions into `shared/`** and
  re-export from the helper module rather than duplicating them — say so in
  your turn-in.
- Related: LIST2-2 (also validation, different file — no conflict).
- File footprint: `shared/validation/stepConfigSchemas.ts`,
  `client/src/components/runner/list/listRuntime.ts`,
  `client/src/components/runner/blocks/ListBlock.tsx`,
  `client/src/components/runner/list/ListAnswerView.tsx`, plus tests.
- No collisions. **Do not touch `ListDrillEditor.tsx`.**

### Acceptance criteria

1. `POST`/`PATCH` of a list step whose config has a field with a
   malformed alias (e.g. `"2bad"`) is rejected with a validation error.
2. A config with two same-alias fields **at the same level** is rejected; the
   same alias **at two different levels** is accepted.
3. A config nested deeper than `LIST_VALIDATION_MAX_DEPTH` is rejected.
4. A `kind: "question"` field with a `type` outside
   `LIST_FIELD_QUESTION_TYPES` (e.g. `"signature_block"`) is rejected.
5. A well-formed config produced by the builder round-trips unchanged through
   `validateAndNormalizeConfig` — no field is dropped or reordered.
6. `normalizeListConfig` returns `{ fields: [] }` for `null`, `undefined`, a
   string, and `{}`; the runner renders an empty list instead of throwing.
7. New unit tests assert 1–6; an integration test in
   `tests/integration/creation-routes.test.ts` asserts 1 and 3 through the
   real endpoint (that file already has the LIST-1 list-step smoke test to
   extend).
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green; the touched integration file passes.

### Verification pass — 2026-08-01 (reviewer)

All 8 criteria met. Unit: 88/88 across `stepConfigSchemas`, `listRuntime`,
`ListBlock`, `ListAnswerView`, `listConfig`. Integration:
`creation-routes.test.ts` **41/41** against real Docker PG.

Verified by mutation: commenting out the `list: ListConfigSchema` registration
fails exactly the two new endpoint tests (AC1 malformed alias, AC3 depth cap),
proving they exercise the real server boundary rather than the schema in
isolation. Reverted after.

The depth cap is enforced structurally rather than by a check — at
`LIST_VALIDATION_MAX_DEPTH` the field union simply drops its `"list"` variant,
so an over-deep config matches neither member. Depth numbering was confirmed
against `validateListValue` (root config = depth 1): three levels of
`ListConfig` are accepted, the fourth is rejected. Both deviations
(`listFieldHelpers.ts` in `shared/`, reusing `conditionExpressionSchema` for
`visibleIf`) are accepted — the first was the ticket's own stated fallback and
the `shared/` → `client/` import boundary was confirmed real; the second is
free correctness.

**Carried to LIST2-5:** the dev flagged a third unguarded cast at
`ReviewSection.tsx` (`step.config as unknown as ListConfig | null` feeding
`ListAnswerView`), correctly outside their footprint. Folded into the LIST2-5
reviewer fix.

---

## LIST2-4 — Autosave silently dies above 64 KB ✅

**Priority: P1** · Size: S · File: `client/src/hooks/runner/useRunValues.ts`

### Finding

`performSave()` in `client/src/hooks/runner/useRunValues.ts` posts the entire
values map with `keepalive`:

```ts
await fetchAPI(`/api/runs/${actualRunId}/values/bulk`, {
  method: 'POST',
  keepalive: true, // Allow request to complete if the page is unloading
  body: JSON.stringify({ values: valuesToSave })
});
```

Per the Fetch standard, a `keepalive` request whose body exceeds **64 KiB** is
rejected with a `TypeError` (Chrome enforces this as an inflight quota). Lists
are the first step type that can plausibly produce a body that large. Measured
against a realistic children-with-addresses shape:

```
 15 children x 5 addresses -> 18.5 KB
 25 children x 5 addresses -> 30.8 KB
 50 children x 5 addresses -> 61.5 KB   <-- at the cliff
```

and `LIST_VALIDATION_MAX_TOTAL_ITEMS` permits 5,000 items. Above the cliff
**every** autosave fails permanently, `useAutoSave`'s `drainSaveQueue` catches
and sets `saveStatus: "error"`, and the respondent's only signal is a small
status chip. Section submit still persists (it is a separate non-keepalive
request), so the damage is draft loss on refresh/crash — precisely the
"come back and finish later" promise a long list depends on most.

### Preferred fix

Keep `keepalive` for the small case it was added for (surviving page unload)
and drop it when the body would exceed the cap:

- Serialize the body once, measure it with `new Blob([body]).size` (or
  `TextEncoder`), and set `keepalive` only when the size is under a constant
  — suggested `KEEPALIVE_MAX_BYTES = 60 * 1024`, slightly under 64 KiB to
  leave headroom for headers.
- Above the threshold, send the identical request **without** `keepalive`. It
  will not survive an unload, which is strictly better than never sending.

Do **not** implement delta/partial saves in this ticket — that is a larger
change to the bulk contract and belongs in its own ticket if it is ever wanted.
Do not change `useAutoSave`.

Scope note: `client/src/lib/analytics.ts` also uses `keepalive`, with tiny
bodies. Leave it alone.

### Ties

- Load `run-tests` before running anything.
- Related: none — this file is untouched by every other ticket in this
  initiative.
- Server side already accepts up to `MAX_REQUEST_SIZE` (default `10mb`, in
  `server/middleware/securityConfig.ts`), so no server change is needed.
- File footprint: `client/src/hooks/runner/useRunValues.ts` plus a new/updated
  unit test.
- No collisions.

### Acceptance criteria

1. A values payload under the threshold is still sent with `keepalive: true`.
2. A values payload over the threshold is sent with `keepalive` falsy (or
   absent), and is otherwise byte-identical in body and URL.
3. The threshold is a single named exported constant, not a magic number at
   the call site.
4. New unit test asserts 1 and 2 by stubbing `fetchAPI` and inspecting the
   options argument, using a payload built to straddle the threshold. The
   over-threshold case must use a genuinely large fixture, not a mocked size.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

### Verification pass — 2026-08-01 (reviewer)

All 5 criteria met. `useRunValues.test.tsx` → 5/5 on the merged tree.

The over-threshold test uses a genuine 80 KiB fixture rather than a mocked
size, as AC4 required, and asserts the body stays byte-identical — so the
non-keepalive path is proven to change *only* the flag. Verified by mutation:
forcing `keepalive = true` fails that test. Reverted after.

Scope held exactly — `useAutoSave.ts` and `analytics.ts` untouched, and no
delta-save behavior was smuggled in.

---

## LIST2-5 — Dropdowns inside a list can't resolve their source ✅

**Priority: P1** · Size: S · File: `client/src/components/runner/list/ListDrillEditor.tsx`

### Finding

Two defects in the same component, bundled because they are the same few lines.

**(a) `aliasMap` is never threaded in.** `ListDrillEditor` renders each
question field with:

```tsx
<BlockRenderer
  step={fieldToStep(field, step)}
  ...
  context={scope.item.values}
/>
```

`BlockRenderer` forwards `aliasMap` to `ChoiceBlockRenderer` and
`DisplayBlockRenderer`, and `SectionSteps.tsx` supplies it on the normal path
— but `ListDrillEditor` passes only `context`. In `ChoiceBlock.tsx`,
option resolution does:

```ts
const resolvedStepId = aliasMap?.[listVariable];
```

so with `aliasMap` undefined, a `choice` field inside a list whose options are
bound to a list/table variable silently resolves to no options. This becomes
user-visible the moment LIST2-8 lets authors configure such a dropdown.

**(b) An unguarded config cast.** The same component does:

```tsx
const rootConfig = step.config as ListConfig;
...
const fields = [...scope.config.fields].sort((a, b) => a.order - b.order);
```

`ListDrillEditor` is the **one** step renderer not wrapped in
`BlockErrorBoundary` (see `QuestionCardContent` in
`client/src/pages/WorkflowRunner.tsx`), so a config missing `fields` — which
LIST2-3 establishes is currently persistable — takes down the whole section
body rather than one block.

### Preferred fix

**(a)** Thread `aliasMap` from the runner down to `ListDrillEditor` and pass
it to `BlockRenderer`, mirroring exactly how `SectionSteps.tsx` obtains and
forwards it. Trace the existing source rather than building a new map. Note
the drilled editor is rendered by `QuestionCardContent` in
`WorkflowRunner.tsx`, so the prop must be plumbed through there too.

Leave `context={scope.item.values}` as-is — item-scoped context is the
intended semantic (a field inside an item resolves against that item), and
changing it is a separate design question.

**(b)** Use the `normalizeListConfig()` helper LIST2-3 adds to
`listRuntime.ts` at the `step.config as ListConfig` cast. Additionally wrap
the `<ListDrillEditor>` render site in `WorkflowRunner.tsx` in
`BlockErrorBoundary`, matching how every other block is wrapped.

> LIST2-3 is landing `normalizeListConfig` in parallel. If it has not merged
> when you start, **stop and report the blocker** rather than writing a second
> copy of the helper.

### Ties

- **Load the `design` skill** — (b) changes what a respondent sees when a
  block fails. Register R2.
- Load `run-tests` before running anything.
- Depends on LIST2-3 for `normalizeListConfig`. Same phase; coordinate at
  review if ordering slips.
- Donor for aliasMap plumbing: `client/src/components/runner/SectionSteps.tsx`.
- File footprint: `client/src/components/runner/list/ListDrillEditor.tsx`,
  `client/src/pages/WorkflowRunner.tsx`, plus tests.
- No collisions. **LIST2-3 must not touch `ListDrillEditor.tsx`** — that file
  is yours.

### Acceptance criteria

1. `ListDrillEditor` receives `aliasMap` and forwards it to every
   `BlockRenderer` it renders.
2. A `choice` field inside a list, configured with a list-bound
   `dynamicOptions`, resolves its options — proven by a test that supplies an
   `aliasMap` and asserts the options render.
3. The same case with `aliasMap` absent degrades to no options **without
   throwing**.
4. A list step whose `config` is `null`/malformed renders an empty list
   instead of throwing.
5. The `ListDrillEditor` render site is wrapped in `BlockErrorBoundary`.
6. New/updated tests assert 2, 3 and 4.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

### Verification pass — 2026-08-01 (reviewer)

Turned in at **B with an honest blocker**, closed to **A** by the reviewer.
16/16 across `ListDrillEditor`, `WorkflowRunner.listDrillErrorBoundary` and
`ListAnswerView`.

**The dev did the right thing.** AC4 depended on `normalizeListConfig` from
LIST2-3, which had not merged. Rather than writing a second copy — which the
ticket explicitly warned would create a merge collision — they shipped the
independent part (a) in full and reported part (b) blocked, precisely as
instructed. That is the behavior the dispatch rule was written to produce.

**Reviewer fixes** (triage option 3 — ~90% context already in hand, small):

1. AC4 closed: `ListDrillEditor`'s `step.config as ListConfig` →
   `normalizeListConfig(step.config)`, orphaned `ListConfig` import removed.
   New `it.each` covers `null`, a bare string, and `{}`.
2. `ReviewSection.tsx`'s `step.config as unknown as ListConfig | null` →
   `normalizeListConfig` — the third cast, flagged by the LIST2-3 dev and
   carried here. Its `?? { fields: [] }` handled `null` but not a malformed
   non-null value.
3. **AC5's test had to be rewritten, because the AC4 fix invalidated it.** As
   delivered it triggered the boundary with a `fields`-less config — the exact
   crash AC4 removes — so after fix 1 it failed. AC4 and AC5 are separate
   guarantees: AC4 says *this known bad input* does not crash, AC5 says *any*
   crash is contained. The fault is now injected by mocking `ListDrillEditor`
   to throw, which is what keeps AC5 honest; otherwise deleting the
   `BlockErrorBoundary` wrap would leave every test green.

All three verified by mutation: reverting the cast fails all 3 AC4 cases;
unwrapping the boundary fails AC5. Reverted after.

**Ticket-authoring lesson:** two ACs in one ticket described the same
observable event from opposite sides — one asserting it stops happening, the
other asserting it is caught when it happens. They cannot both be tested
against the same trigger. Watch for that pairing.

---

## LIST2-6 — List-bound dropdown answers render as raw UUIDs in documents ✅

**Priority: P1** · Size: M · File: `server/services/document/VariableNormalizer.ts`

### Finding

A `choice` step bound to a list step stores the selected item's **`itemId`**,
by deliberate design — `isListStepSourceConfig()` in
`client/src/components/runner/blocks/ChoiceBlock.tsx` says so:

```ts
// Stored choice values for list steps are stable itemIds (per Decision 8).
```

That was a deliberate departure from the Choice Value Model, which otherwise
stores the *label*. But CVM's whole point was that storing labels let the
document engine's option-resolution layer be **deleted**. Grepping
`server/services/document/` and `server/lib/templates/` finds no
choice-label resolution of any kind.

Consequence: a document that renders a list-bound dropdown answer emits a raw
UUID (`a3f2c1e0-…`) where the respondent expects `Ava Whitmore`. The
projection work in LIST-11 wired `listConfigs` into the two real render paths,
but a *choice* step is not a list step, so `getListConfigsByAlias()` never
covers it.

### Preferred fix

Resolve a list-bound choice value back to its display label at normalization
time, in `normalizeVariables()` — the same seam LIST-11 used for list
projection, so both live in one place:

- Extend `NormalizationOptions` with the mapping needed to resolve a choice
  step whose `dynamicOptions.type === 'list'`: for such a step, look up the
  referenced list step's value, find the item whose `itemId` matches the
  stored value, and resolve its label using the **same** `labelTemplate`
  logic the runner uses.
- `resolveItemLabel()` in
  `client/src/components/runner/list/listRuntime.ts` is that logic. It is a
  pure function with no React import. **Move it into `shared/`** and re-export
  from `listRuntime.ts` so client and server share one implementation — do not
  reimplement label resolution server-side. `projectListValue` in
  `shared/types/stepConfigs.ts` is the precedent for pure list logic living in
  `shared/` and being called from both sides.
- Wire the new option at the same two call sites LIST-11 wired:
  `server/routes/finalBlock.routes.ts` and
  `server/services/workflow-runs/RunLifecycleService.ts`.

An unresolvable value (deleted item, missing source) must fall back to
emitting the raw stored value rather than throwing or emitting empty — the
document should degrade, not fail.

Out of scope: `MappingValidator.ts`'s two unprojected `normalizeVariables`
calls (backlog LIST-B10). Note it, do not fix it here.

### Ties

- Load `add-api-endpoint` if you touch anything under `server/routes/` or
  `server/services/` beyond the two wiring call sites.
- Load `run-tests` before running anything.
- Donor: LIST-11's `listConfigs` threading — read
  `getListConfigsByAlias()` in `VariableNormalizer.ts` and its two call sites,
  and mirror the shape exactly.
- Existing test to extend: `tests/unit/services/ListDocumentProjection.test.ts`.
- File footprint: `server/services/document/VariableNormalizer.ts`,
  `server/routes/finalBlock.routes.ts`,
  `server/services/workflow-runs/RunLifecycleService.ts`,
  `shared/` (moved `resolveItemLabel`),
  `client/src/components/runner/list/listRuntime.ts` (re-export only).
- No collisions.

### Acceptance criteria

1. A `choice` step bound to a list step renders its selected item's resolved
   **label** in a generated document, not the `itemId`.
2. Resolution honors the source list's `labelTemplate`, matching what the
   runner displays for the same item.
3. A stored value with no matching item (deleted) emits the raw stored value
   and does not throw.
4. A multi-select list-bound choice resolves every selected id.
5. `resolveItemLabel` exists in exactly one place; `listRuntime.ts`
   re-exports it and the client behavior is unchanged.
6. Non-list-bound choice steps are **completely unaffected** — assert an
   existing static-options choice still renders identically.
7. New tests in `tests/unit/services/ListDocumentProjection.test.ts` assert
   1–4 and 6.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

### Verification pass — 2026-08-01 (reviewer)

All 8 criteria met. `ListDocumentProjection` + `listRuntime` + `listConfig`
→ 51/51 on the merged tree. Verified by mutation: bypassing
`resolveListBoundChoiceValue` fails AC1/AC2 and AC4. Reverted after.

`resolveItemLabel` now lives in `shared/types/stepConfigs.ts` beside
`projectListValue`, with `listRuntime.ts` re-exporting it — one
implementation, every existing client consumer untouched. This merged cleanly
with LIST2-3's `normalizeListConfig` addition to the same file even though
both tickets edited it; my collision map called this file "re-export only"
for LIST2-6, which understated it. The regions did not overlap so it cost
nothing, but the map was wrong.

Scoping is right in a way the ticket did not spell out:
`getChoiceListBindingsByAlias` resolves **only** when the dynamic source is
itself a `list` step, so Read Table / List Tools sources — which also produce
ListVariables — are deliberately left alone. AC6 has its own test.

**Reported failure was not real.** The dev flagged 2 failures in
`VersionService.diff.test.ts` as pre-existing. They are not: that file passes
clean on `main` and passed here. It was contention from six devs running
`test:fast` concurrently, starving its mock timers. Their conclusion (not
caused by this change) was right; the label was wrong.

---

## Phase 1 Gate — ✅ PASSED 2026-08-01 (one item carried, see below)

- [x] LIST2-1..6 all ✅ with dated verification notes
- [x] `npm run type-check` → 0 errors (via the pre-commit hook on every one of
      the six commits, which also runs `check:strict-zones` — `type-check`
      alone is **not** the commit gate here)
- [x] `npm run lint` → exit 0, repo-wide, `--max-warnings 0`
- [x] `npm run test:fast` → **2246 passed / 14 skipped, 0 failed**
      (baseline 2206, +40 new)
- [x] Integration → `creation-routes` + `dynamic_options_workflow` **42/42**
- [x] App boots on the merged tree: `/health` reports
      `database.connected: true`, `pdfConverter.reachable: true`
- [x] All four changed/new client modules transform through the real Vite dev
      pipeline (HTTP 200, no resolve/transform errors) — a check `tsc` cannot
      make
- [x] Reviewer has committed each passed ticket + this gate

**Every ticket was mutation-tested, not taken on report.** For each, the fix
was reverted and the new tests were confirmed to fail, then restored:
LIST2-1 (registry filter → AC3 fails), LIST2-2 (`?? {}` → AC2/AC6 fail),
LIST2-3 (schema registration → both endpoint tests fail), LIST2-4
(`keepalive = true` → over-threshold test fails), LIST2-5 (raw cast → all 3
AC4 cases fail; unwrap boundary → AC5 fails), LIST2-6 (bypass resolution →
AC1/AC2 and AC4 fail).

### ⚠️ Carried: browser drive-through not performed

The gate's click-through (build a nested list via the palette, fill 3 items,
watch autosave reach "saved", reload) **was not done** — this review session
had no browser/computer-use tooling. What stands in for it:

- Everything reachable over real HTTP **was** exercised: the integration
  suite drives the real Express app and real auth via supertest, which is how
  LIST2-3's server boundary was proven.
- The app boots and serves, and all four changed client modules transform
  through Vite — so this is not an untested tree, but it is not a
  *user-observed* one.
- The LIST2-1 dev reported their own live run (dev server on port 5098,
  registered user, drove the palette and confirmed the 18-entry list). That is
  their report, not reviewer-verified.

**This is the one gate item outstanding.** Recommend the repo owner spends
five minutes on it before Phase 2 dispatch, since LIST2-7 builds directly on
LIST2-1's UI.

### Environment finding (not a ticket, worth knowing)

The main checkout has **no `TEST_DATABASE_URL`**, so `npm run test:integration`
fails there out of the box with a confusing `password authentication failed`.
`tests/setup.ts` deliberately ignores the inherited `DATABASE_URL` and guards
on hostname, so there is **no risk of a test run hitting the production Neon
database** — it simply falls back to port 5432, where nothing is listening.
Port 5434 is currently held by a leftover `iex2-5-test-db-1` container, which
happens to be credential-compatible and is what the worktrees (and this
review) used. Worth either setting `TEST_DATABASE_URL` in the main `.env` or
cleaning up the stale containers.

### Process finding: don't run six devs' `test:fast` concurrently

LIST2-6 reported 2 failures in `VersionService.diff.test.ts` as
"pre-existing". They were not — that file passes clean on `main` and on the
fully merged tree. Six concurrent `test:fast` runs starved its mock timers.
The suite is no-DB so it is *safe* to run in parallel, but it is not
*reliable* to, and the failure mode looks exactly like a real regression.

---

# Phase 2 — Per-field configuration

The headline gap. `ListField` already carries `config?: StepConfig`, and the
runner already honors it (Decision 2) — the builder simply never writes it. So
today a `choice` field inside a list renders a dropdown **with no options**,
a `scale` has no bounds or labels, and `display` has no content.

The obstacle is narrow and specific: every settings panel is welded to a save
mechanism rather than to a shape. `ScaleCardEditor` is representative —

```tsx
const updateStepMutation = useUpdateStep();
...
updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
```

A list field has no `stepId` because it is not a row (Decision 1). The panels
need to be `(config, onChange)`; today they are `(step)` **and they save
themselves**. The fix is a wrapper, not a rewrite, and the repo already does
this in four files — `ScaleCardEditor.components.tsx` exports
`RangeSection({ config, onUpdate })`, pure and save-free.

Both tickets land in the same host component, so they are **sequential**.

---

## LIST2-7 — Per-field settings panel (host + Scale/Number/Display/MultiField) ✅

**Priority: P1** · Size: L · File: `client/src/components/builder/cards/list/ListLevelEditor.tsx`

> **Size L, accepted deliberately.** Splitting it further would put two devs
> in the same host component. Give this to one strong dev.

### Finding

`ListFieldRow()` in `cards/list/ListLevelEditor.tsx` exposes only title,
alias, type, required and (for nested lists) an expander. There is no
`config`, no `description`, and no `visibleIf` — even though `ListField`
declares all three:

```ts
| {
    kind: "question";
    id: string;
    alias: string;
    type: ListFieldQuestionType;
    title: string;
    description?: string;
    required?: boolean;
    order: number;
    config?: StepConfig;
    visibleIf?: ConditionExpression;
  }
```

`visibleIf` is fully honored on the read side — `validateListItemFields`
skips hidden fields, and `ListDrillEditor` evaluates it before rendering —
making per-field conditional logic inside a list a **dead capability**:
implemented, unreachable.

### Preferred fix

1. **Extract presentational settings sections** from the four editors in
   scope, following the existing donor pattern in
   `ScaleCardEditor.components.tsx` (`RangeSection({ config, onUpdate })`):
   `ScaleCardEditor`, `NumberCardEditor`, `DisplayCardEditor`,
   `MultiFieldCardEditor`. Each keeps its current `XCardEditor` as a thin
   step-bound wrapper that renders the extracted section and owns the
   `useUpdateStep()` mutation. **Existing standalone behavior must not change**
   — this is a refactor beneath it.
2. **Add a host**, `cards/list/ListFieldSettings.tsx`, taking
   `({ field, onChange })` and rendering, per field type, the extracted
   section — plus `description` and `visibleIf` for **all** question types.
3. **Wire it into `ListFieldRow`** as a collapsible "Settings" disclosure,
   mirroring the existing nested-list expander so the row doesn't grow.
4. For `visibleIf`, reuse the existing `VisibilityField` from
   `cards/common/VisibilityField.tsx`, scoped to sibling field aliases at the
   same level (an item's `visibleIf` is evaluated against `item.values`).

The 11 types not listed above work correctly on their defaults today and are
explicitly **out of scope**; `choice` is LIST2-8.

### Ties

- **Load the `design` skill first** — substantial user-visible UI. Register R2.
- Load `run-tests` and `add-step-type` (it is the map of where step/question
  type behavior is enumerated).
- **Depends on LIST2-1** (same file — must be merged first).
- **LIST2-8 follows this** and registers into `ListFieldSettings.tsx`.
- Donor: `ScaleCardEditor.components.tsx`; `cards/common/VisibilityField.tsx`;
  `cards/common/EditorField.tsx`.
- File footprint: `cards/list/ListLevelEditor.tsx`, new
  `cards/list/ListFieldSettings.tsx`,
  `{Scale,Number,Display,MultiField}CardEditor.tsx` + `.components.tsx`.
- Backlog LIST-B8 notes `ListCardEditor` PATCHes the whole config with no
  debounce; this ticket makes configs bigger. If authoring feels laggy, note
  it — **do not** add debouncing here.

### Acceptance criteria

1. Each of `ScaleCardEditor`, `NumberCardEditor`, `DisplayCardEditor`,
   `MultiFieldCardEditor` renders via an extracted presentational section
   taking `config`/`onChange` and containing **no** `useUpdateStep` call.
2. Existing standalone step editors for those four types behave identically —
   proven by their existing tests still passing unmodified.
3. A list field of type `scale` can have min/max/step/labels set in the
   builder; the values persist into `ListField.config` in the parent step's
   config.
4. Same for `number` (min/max), `display` (content), and `multi_field`
   (sub-fields).
5. A list field's `description` can be set and renders in the runner.
6. A list field's `visibleIf` can be set, and a field hidden by it is not
   rendered in the drilled editor **and** is skipped by validation.
7. Settings are collapsed by default; the row's default height does not grow.
8. Round-trip: configure, reload the builder, and the settings are still there
   — no field or setting is dropped by `validateAndNormalizeConfig`.
9. New tests assert 3–6 and 8; the four editors' existing tests pass unchanged.
10. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
    green.

### Verification pass — 2026-08-01 (reviewer)

All 10 criteria met. `test:fast` **2261 passed / 0 failed** (from 2246),
repo-wide lint exit 0. This is the ticket the whole initiative existed for: a
`scale` field inside a list now has bounds, a `number` has a range, `display`
has content, `multi_field` has sub-fields, and every question field has
`description` and `visibleIf`.

Verified by mutation, not on report:
- Breaking `handleConfigChange` so it drops `config` fails all four AC3/AC4
  capability tests.
- Stripping `config` from LIST2-3's `ListConfigSchema` fails the AC8
  round-trip test — confirming that test is a real net over the
  LIST2-3 × LIST2-7 interaction (a `visibleIf` shape that failed
  `conditionExpressionSchema` would have had the **entire config rejected on
  save**, which is the sharpest edge in this ticket).

AC1 verified mechanically: the four extracted sections contain zero
`useUpdateStep` *calls* — the four grep hits are comments explaining their
absence. The wrappers retain the mutation.

All three deviations accepted. The second is the notable one: `VisibilityField`
could not be reused because **it self-saves against a real step id** — exactly
the coupling this phase exists to work around (see the Phase 2 preamble). The
dev reused its `ConditionGroup`/`LogicStatusText` primitives instead, which is
the right decomposition.

**AC2 was a bad criterion — my fault, and the second instance this initiative.**
"Existing tests pass unmodified" is vacuous for these four editors: they have
**no** dedicated tests, so nothing could have failed. That means a refactor of
four live builder editors shipped with no regression net of its own. I read all
four wrapper diffs and confirmed the moved logic landed intact in the extracted
sections — scale's invalid-config save gate and stars defaulting, number's
advanced/currency/number mode derivation and min>max message, display's
markdown handling, multi-field's layout presets and per-sub-field label and
**required** toggles. Faithful, but *reviewed*, not *tested*. Same lesson as
LIST2-1's AC7: **an acceptance criterion that names existing tests must first
establish that those tests exist.**

**Live proof still owed, and now for two tickets.** The dev declined to write
throwaway tenant/workflow rows into the shared dev DB because the repo owner
works this repo from a second IDE — a good call on a shared resource, and the
right instinct. But LIST2-1 and LIST2-7 are now both unverified in a browser,
and they compose: LIST2-7's settings disclosure hangs off LIST2-1's field row.
This is the single highest-value thing left before LIST2-8.

---

## LIST2-8 — Choice options for a list field ✅

**Priority: P1** · Size: M · File: `client/src/components/builder/cards/ChoiceCardEditor.tsx`

### Finding

`choice` is in `LIST_FIELD_QUESTION_TYPES`, so an author can add a dropdown to
a list — and it renders with **no options**, because nothing writes
`ListField.config`. `ChoiceBlockRenderer` reads:

```ts
const dynamicConfig = (step.config as ChoiceAdvancedConfig | undefined)?.options as DynamicOptionsConfig | undefined;
```

which is `undefined` for every list field today. This is the single most
visible instance of the Phase 2 gap: dropdowns are the most-reached-for
question type and the only one that is *completely* non-functional inside a
list rather than merely un-tunable.

It is separated from LIST2-7 because `ChoiceCardEditor.tsx` is 633 lines with
its own debounce queue and List-Tools linking — an order of magnitude more
extraction work than the other four editors combined.

### Preferred fix

Extract the **static options editor** from `ChoiceCardEditor` into a
presentational `cards/choices/ChoiceOptionsSettings.tsx` taking
`({ config, onChange })`, and register it in `ListFieldSettings.tsx` for the
`choice` type. `ChoiceCardEditor` keeps its debounce queue and its
`useUpdateStep`, and renders the extracted component.

**Scope the first pass to static options.** Dynamic options
(`dynamicOptions.type: 'list' | 'table_column'`) and inline List-Tools block
creation depend on workflow-level variable pickers and a `linkedListToolsBlockId`
that has no meaning for a field inside an item — offering them here would ship
a second broken affordance. Render dynamic-options config as **not available
for list fields** with a short explanation, and file a backlog note.

Note LIST2-5 makes `aliasMap` available inside the drilled editor, so the
runner is ready for dynamic options whenever they are scoped properly. Say so
in the backlog note.

### Ties

- **Load the `design` skill first.** Register R2.
- Load `run-tests`; load `add-step-type` for the choice-type enumeration map.
- **Depends on LIST2-7** (registers into `ListFieldSettings.tsx`) and benefits
  from LIST2-5.
- Beware the Choice Value Model: a choice stores the **label**, not an id.
  Do not reintroduce id-based option values — see LIST2-6 for what that costs.
- File footprint: `cards/ChoiceCardEditor.tsx`, new
  `cards/choices/ChoiceOptionsSettings.tsx`, one registration in
  `cards/list/ListFieldSettings.tsx`.

### Acceptance criteria

1. A `choice` field inside a list can have static options added, edited,
   reordered and removed in the builder.
2. Those options persist into `ListField.config` and render in the runner's
   drilled item editor.
3. The selected value is stored as the option **label**, consistent with the
   Choice Value Model.
4. The standalone `ChoiceCardEditor` behaves identically — its existing tests
   pass unmodified, including the debounce behavior.
5. Dynamic-options configuration is visibly unavailable for list fields, with
   an explanation, rather than shown-and-broken.
6. A choice field's answer renders correctly on the review step
   (`ListAnswerView`) and in a generated document.
7. New tests assert 1–3 and 5; `ChoiceCardEditor`'s existing tests unchanged.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

### Verification pass — 2026-08-02 (reviewer)

All 8 criteria met, turned in at A, **closed at B→A after one reviewer fix**.
Committed `a73e5363`. `test:fast` 2266 passed / 0 failed.

**Reviewer fix — a real regression the gates could not see.**
`ChoiceOptionsSettings` built its duplicate-alias set keyed on
`option.alias ?? option.label`, but its consumer `StaticOptionsEditor` looks the
key up with `option.alias ?? option.id`, and `ChoiceCardEditor:85` still
validates saves with `?? id`. The original built the set with `?? opt.id` and
matched. Net effect for any option with no explicit alias: the duplicate is
never highlighted, yet the save is still rejected — **blocked with nothing
flagged**. Keyed back to `?? id`, with two new tests; the id-collision one is
mutation-proven (reverting to `?? label` fails it). The second test (same label,
distinct ids → not flagged) passes under both and is a semantic pin, not a
mutation-proof guard — recorded honestly rather than counted as coverage.

No existing test could have caught this: `StaticOptionsEditor.test.tsx` passes
`duplicateAliases` in directly and never exercises the new integration.

**Two undeclared changes, both accepted.** (1) `nextOption()` corrects a latent
bug in the logic it inherited — the original checked `usedAliases.has('option{n}')`
while minting `alias: 'Option {n}'`, so the alias half of that guard never
matched anything. (2) The `[&_.cursor-grab]:hidden` wrapper also hides the grip
in the **standalone** ChoiceCardEditor, which contradicts AC4's "behaves
identically" — but that grip is a bare `GripVertical` in a `div` with no
dnd-kit, no `onDragStart`, no wiring at all. Hiding a decorative affordance that
lied is an improvement. Both should have been declared rather than found in
review.

AC4 is a *sound* criterion here, unlike LIST2-7's AC2:
`tests/unit/client/StaticOptionsEditor.test.tsx` genuinely exists and passes
unmodified.

Live-verified on a dedicated port (5101, not the contested 5098): two options
persisted into `ListField.config` with `alias === label`.

---

## Phase 2 Gate

- [ ] LIST2-7, LIST2-8 ✅ with dated verification notes
- [ ] All Phase 1 gate commands still green
- [ ] **Live drive-through**: build a "Children" list with a nested
      "Addresses" list; give a child a `scale`, a `number` with bounds, a
      `choice` with options, and a `visibleIf`-gated field; fill two children
      in the runner; confirm validation fires on a bad email and an
      out-of-range number; generate a document and confirm all values render
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Proof

## LIST2-9 — No end-to-end coverage of the list lifecycle ✅

**Priority: P1** · Size: M · File: `tests/integration/`

### Finding

Integration coverage for the entire `list` vertical is one smoke test —
`tests/integration/creation-routes.test.ts`:

```ts
it("creates a 'list' step and reads it back with type 'list' (LIST-1)", async () => {
```

It creates a list step and reads it back. Nothing covers save → submit →
validate → complete → document. The 125 list unit tests are all isolated
units, so every seam between them is untested — and the seams are where this
feature's known defects have lived (LIST-11 was reverted by a merge and had to
be re-landed; LIST-B10 is a seam inconsistency; LIST2-6 is a seam gap).

### Preferred fix

Add `tests/integration/list-lifecycle.test.ts` driving the real endpoints,
mirroring the setup helpers already used in `creation-routes.test.ts` and the
document assertions in `tests/unit/services/ListDocumentProjection.test.ts`.

One test path, exercised end to end:

1. Create a workflow + section + a `list` step whose config has a nested list
   and at least one field of each of: text, choice, number.
2. Save a nested value via `POST /api/runs/:runId/values/bulk`.
3. Submit the section; assert validation behavior for a valid and an invalid
   payload (an out-of-range number should be caught once LIST2-2 lands).
4. Complete the run.
5. Generate a document from a template with a loop tag over the list; assert
   the rendered output contains the nested values, at both levels.

Write it so it fails loudly if projection regresses — assert on actual
rendered content, not just a 200.

### Ties

- **Load `run-tests` first** — this ticket is meaningless if run wrong.
  `npm run test:integration` needs a DB; `npm run test:docker:up` starts
  Postgres 16 on port **5434**.
- **Do not run a DB-backed suite while another dev is running one** — schema
  names are per-worker, not per-process, and concurrent runs clobber each
  other into dozens of fake failures.
- Depends on Phases 1 and 2 being merged — assertions cover their behavior.
- Donors: `tests/integration/creation-routes.test.ts` (setup helpers),
  `tests/unit/services/ListDocumentProjection.test.ts` (template assertions).
- File footprint: `tests/integration/list-lifecycle.test.ts` only.

### Acceptance criteria

1. The test creates a list step with a nested list and 3+ field types through
   the real API.
2. It saves a two-level nested value and reads it back byte-identical.
3. It asserts a valid section submit succeeds and an invalid one is rejected,
   and that the response names the offending **step**.

   > **AC3 was relaxed by the reviewer, 2026-08-02 — the original was
   > unsatisfiable and that was my error, not the dev's.** It demanded a
   > *path-keyed* error. `validatePage` does retain the path
   > (`server/workflows/validation.ts`, which pushes `path` into each entry),
   > but `RunExecutionCoordinator` discards it when formatting the response:
   > `` `${fieldName}: ${err.errors[0]}` `` never reads `err.path`. No
   > integration test can assert a path the API does not emit, and making it
   > emit one is a production behavior change that does not belong inside a
   > coverage ticket. Surfacing the path is now **LIST2-15**; add the path
   > assertion here once that lands.
4. It asserts a generated document contains values from **both** list levels.
5. The test passes via `npm run test:integration` and is not added to any
   exclude list.
6. `npm run type-check` 0 errors; `npm run lint` clean.

---

### Verification pass — 2026-08-02 (reviewer)

Committed `7dc78958`. Asserts on **rendered DOCX text at both list levels**
(`Member=Ava Whitmore;`, `Address=12 Oak Street;`), not on a 200 — which was
the point of AC4.

**This dev's most valuable output was not the test.** While writing AC3 they
found that `RunExecutionCoordinator` discards the validation `path`, and
stopped rather than weakening the assertion or expanding scope into a
production file. That became **LIST2-15**. Stopping on a blocked AC is the
behavior the dispatch rule exists to produce; the self-graded F was too harsh.

**Reviewer change:** AC3's assertion was tightened from the pathless
`Household members: ...` to `Household members (household[0].age): ...` once
LIST2-15 landed. The dev's worktree predated it, so the test failed on the
merged tree — caught by running it rather than trusting the turn-in. The
stronger form is what AC3 always wanted.

---

## Phase 3 Gate — ✅ PASSED 2026-08-02

- [x] LIST2-9 ✅ with a dated verification note
- [x] `tests/integration/list-lifecycle.test.ts` green against real Docker PG
- [x] Reviewer has committed the ticket + this gate
- [ ] Full `npm test` (CI-equivalent, single-fork) — **not run**, see below

> **Carried:** the full CI-equivalent `npm test` was not run in this session.
> `test:fast` is green at **2274** and the touched integration files pass, but
> the whole integration project (~12 min) was last run green by the LIST2-9 and
> LIST2-10 devs *before* LIST2-9's AC3 tightening and the LIST2-13/14/15
> commits. Worth one full run before pushing.

---

# Phase 4 — Backlog promotions (not gated; dispatch any time)

Two tickets promoted from the backlog on 2026-08-01 **after re-verifying each
finding against the post-Phase-1 tree**, per the rule that a backlog entry is
an observation until re-checked. Re-verification changed the verdict on both:
LIST2-B2 turned out to be dead code (delete, don't fix) and LIST2-B3 turned out
not to be a defect at all (its open question is now answered). Both are folded
into LIST2-10. Footprints are disjoint from each other and from Phase 2.

---

## LIST2-10 — Delete the dead intake state machine and its unused validate-page route ✅

**Priority: P2** · Size: S · File: `server/workflows/intakeStateMachine.ts`

### Finding

Bundles former backlog **LIST2-B2** and **LIST2-B3**, because re-verification
showed they are the same thing: two unreachable validation surfaces that look
reachable, and both are answered by deletion rather than by a fix.

**(a) `IntakeStateMachine` is dead.** `advancePage()` in
`server/workflows/intakeStateMachine.ts` collapses the validation error array
into a `Map` keyed by `fieldId`:

```ts
    const errors = new Map<string, string[]>();
    for (const error of validationResult.errors) {
      errors.set(error.fieldId, error.errors);
    }
```

Before LIST-14 one step produced at most one `ValidationError`, so `set` was
safe. A list produces **one entry per failing path**, all sharing the same
`fieldId`, so every path but the last is silently discarded — and LIST2-2 made
that strictly worse by adding type-level errors on top of required-ness.

**The bug is real and unreachable.** `IntakeStateMachine` is exported and
referenced from **nowhere** — verified 2026-08-01 across `server/`, `client/`,
`shared/` and `tests/`, matching on both the class name and the module path.
The live enforcement path is `RunExecutionCoordinator`, which LIST2-2 fixed.

**(b) `POST /api/workflows/:workflowId/validate-page` has no callers.**
`validationRouter` in `server/routes/validation.routes.ts` is registered
(`server/routes/index.ts`, `app.use(validationRouter)`) and auth'd, and calls a
*different* `validatePage` — the one from `shared/validation/PageValidator.ts`,
which has no `list` handling. The old backlog entry asked whether this is an
enforcement boundary. **It is not:** the handler ends in

```ts
        res.json(result);
```

and gates nothing, and no client or test calls the path — `useRunNavigation.ts`
imports `validatePage` from `PageValidator` as a *module*, never over HTTP, and
routes `list` steps around it deliberately.

So this is a live, authenticated endpoint that would report a list-bearing page
as `valid` regardless of its contents. Nothing consumes that answer today, but
it is a trap for whoever wires it up next.

### Preferred fix

Delete both:

1. `server/workflows/intakeStateMachine.ts` in full.
2. `server/routes/validation.routes.ts`, its `import` and its `app.use(...)`
   registration in `server/routes/index.ts`.

Then remove anything the deletions orphan — imports, helper functions, types
that existed only to serve them. `shared/validation/PageValidator.ts` itself
stays: `useRunNavigation.ts` imports it directly and that is the live path.

**Before deleting, prove the deletion is safe rather than assuming it.** Grep
for each removed symbol *and* each removed route path across `server/`,
`client/`, `shared/`, `tests/` and `scripts/`. Paste the (empty) results in
your turn-in — this repo has a documented history of a dead-code sweep that
over-removed live feature routes and had to be partially reverted, so an
unproven deletion will be sent back.

Do **not** "fix" the `Map` collapse on the way out. If the state machine is
ever revived it must be rewritten against the current path-keyed error
contract anyway.

### Ties

- Load `add-api-endpoint` — you are removing a route; it documents the
  registration pattern you are reversing.
- Load `run-tests` before running anything.
- Related: LIST2-2 (added the error paths that exposed the truncation);
  `RunExecutionCoordinator` is the real enforcement path and is **not** in
  scope.
- File footprint: `server/workflows/intakeStateMachine.ts` (deleted),
  `server/routes/validation.routes.ts` (deleted), `server/routes/index.ts`
  (2 lines).
- No collisions with Phase 2 or LIST2-11.

### Acceptance criteria

1. `server/workflows/intakeStateMachine.ts` no longer exists.
2. `server/routes/validation.routes.ts` no longer exists, and neither its
   import nor its `app.use(validationRouter)` registration remains in
   `server/routes/index.ts`.
3. A grep for `IntakeStateMachine`, `intakeStateMachine`, `validationRouter`
   and `validate-page` across `server/`, `client/`, `shared/`, `tests/` and
   `scripts/` returns **no** hits.
4. No import, type, or helper is left orphaned by the deletions.
5. `shared/validation/PageValidator.ts` is **unchanged** and
   `useRunNavigation.ts` still imports it — deleting it is out of scope and
   would break the live client path.
6. The app boots and `/health` reports healthy, proving the route registration
   was removed cleanly.
7. `npm run type-check` 0 errors; `npm run lint` clean (`--max-warnings 0`,
   which will catch orphaned imports); `npm run test:fast` green at ≥ 2246;
   `npm run test:integration` green.

### Verification pass — 2026-08-02 (reviewer)

All 7 criteria met. Committed `428d379c`. Turn-in graded **A** — footprint
matched the ticket exactly and the pre-deletion proof was supplied as required.

Post-deletion grep re-run by the reviewer on the merged tree:
`IntakeStateMachine`, `intakeStateMachine`, `validationRouter` and
`validate-page` → **0 hits** across `server/ client/ shared/ tests/ scripts/`.
`PageValidator.ts` and `useRunNavigation.ts` untouched (AC5).

**The dev's live proof was strengthened, not taken as-is.** Their check was
`POST /api/workflows/x/validate-page → 404`, which is suggestive but not
conclusive: on `main` a bogus `workflowId` could also 404 once the handler
resolves the workflow. Re-run as a two-server discriminator with an
**unauthenticated** request — `main` on 5101 returns **401** (route registered,
auth middleware answers first), the LIST2-10 tree on 5102 returns **404**. Only
a removed registration produces that pair, and the differing responses also
prove the two servers were serving different trees.

That matters because three separate turn-ins this round all claimed live proof
on port **5098**, which the reviewer was occupying for an unrelated
drive-through. Distinct ports per tree from here.

---

## LIST2-11 — `MappingValidator` doesn't project list values ⛔ BLOCKED → re-scoped as LIST2-14

> **Closed unstarted, 2026-08-01. The dev was right and the ticket was wrong.**
> No files were touched; the worktree was torn down clean.
>
> The ticket assumed the two call sites could reach the workflow's steps. They
> cannot, and neither can anything above them:
>
> | Symbol | Signature | Workflow reference |
> |---|---|---|
> | `validateWithTestData` | `(templateId, mapping, testStepValues)` | none |
> | `validateSourceVariables` | `(mapping, testStepValues)` | none |
> | `POST /templates/:id/test-mapping` | has `templateId` + `tenantId`; `testData` from the request body | none |
> | `TemplatePreviewService.generatePreview` | `GeneratePreviewOptions` = `templateId`, `mapping`, `sampleData`, `outputFormat`, `expiresIn`, `validateMapping` | none |
>
> This is by design, not an oversight: a template is **project**-scoped and
> reusable across workflows, so at this layer there is no single "the workflow"
> to resolve steps from. That is exactly the escape hatch this ticket's Preferred
> fix named ("If a call site genuinely has no access to the workflow's steps,
> stop and report that"), and it fired correctly.
>
> Verified independently by the reviewer, not taken on report.
>
> **Reviewer's design call:** the fix is real but is an M-sized cross-tier change,
> not the same-file threading job described here. Re-scoped as **LIST2-14** below,
> with the shape decided so it is no longer a judgment call for the dev.

## LIST2-11 (original text, for reference — CLOSED, do not dispatch; see LIST2-14) ⛔

**Priority: P2** · Size: S · File: `server/services/document/MappingValidator.ts`

### Finding

Promoted from backlog LIST2-B1 (originally LIST-B10), **re-verified 2026-08-01
and now worse than when filed.** Both call sites in
`server/services/document/MappingValidator.ts` still read:

```ts
        const normalized = normalizeVariables(testStepValues);
```

with no options. `normalizeVariables` needs `listConfigs` to project a `list`
step's storage envelope into the array a template loops over, and — since
LIST2-6 — also needs `listBoundChoices` to resolve a list-bound dropdown's
stored `itemId` into a label.

So template-mapping **validation** sees the raw `{ items: [{ itemId, values }] }`
envelope and raw UUIDs, while actual **rendering** (`finalBlock.routes.ts` and
`RunLifecycleService.ts`, both correctly wired) sees the projected array and
resolved labels. A mapping onto a list variable, or onto a list-bound choice,
can therefore report a false warning for a document that renders perfectly.

Generated output is unaffected — this is a validation-surface inconsistency
only, which is why it is P2 and not P1.

### Preferred fix

Thread both option sets into both call sites, exactly the way the two render
paths already do it — `getListConfigsByAlias(steps)` (LIST-11) and
`getChoiceListBindingsByAlias(steps)` (LIST2-6), both exported from
`server/services/document/VariableNormalizer.ts`.

Read `RunLifecycleService.ts`'s call as the donor; it builds both and passes
them as `normalizationOptions`. Do not reimplement either collector, and do not
change `normalizeVariables` itself — this ticket is purely about the two
callers that skip its options.

The step definitions needed to build the collectors must come from whatever
`MappingValidator` already has in scope at each call site. If a call site
genuinely has no access to the workflow's steps, **stop and report that** —
plumbing a new dependency into it is a bigger change than this ticket is sized
for, and the reviewer will want to decide the shape.

### Ties

- Load `run-tests` before running anything.
- Donors: `server/services/workflow-runs/RunLifecycleService.ts` and
  `server/routes/finalBlock.routes.ts` — the two correctly-wired call sites.
- Related: LIST-11 (added `listConfigs`), LIST2-6 (added `listBoundChoices`).
  Both are merged; nothing here changes their behavior.
- File footprint: `server/services/document/MappingValidator.ts` plus tests.
  Touches no file Phase 2 or LIST2-10 touches.

### Acceptance criteria

1. Both `normalizeVariables` call sites in `MappingValidator.ts` pass
   `listConfigs` and `listBoundChoices`.
2. A mapping onto a `list` step's alias validates **without** a false warning,
   where the same mapping warns before the fix.
3. A mapping onto a list-bound `choice` step validates without a false warning.
4. Validation results for workflows containing **no** list steps are
   byte-identical to before — assert this against a fixture that has mappings
   and produces warnings, so the test would catch a behavior change rather
   than passing on an empty result.
5. `normalizeVariables`, `getListConfigsByAlias` and
   `getChoiceListBindingsByAlias` are unchanged.
6. New tests assert 2–4, and each must be shown to fail without the fix.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green at ≥ 2246.

---

## LIST2-12 — Drilling into a list item is silent to screen readers ✅

**Priority: P2** · Size: S · File: `client/src/components/runner/list/ListDrillEditor.tsx`

### Finding

Promoted from backlog LIST2-B10. Opening a list item replaces the **entire
section body** — `QuestionCardContent` in `client/src/pages/WorkflowRunner.tsx`
swaps `QuestionSectionBody` for `ListDrillEditor` and hides Back/Next:

```tsx
        {drill && drilledStep ? (
          <BlockErrorBoundary stepId={drilledStep.id}>
            <ListDrillEditor
```

Visually this is obvious. Non-visually it is not: there is no focus move to the
new heading, no `aria-live` announcement, and no landmark/heading change. A
screen-reader user activates "Ava Lee" and nothing is announced — the page
appears unchanged while every control has been replaced. The same is true in
reverse for "← parent" / "Done".

`ListDrillEditor` does manage focus on **one** path already
(`autoFocusFirstField`, set only by "+ Add"), so the machinery exists; it just
does not cover the ordinary open-an-existing-item case.

This is the one accessibility gap in the List feature likely to surface in an
enterprise procurement/VPAT review, which is why it is promoted rather than
left as an observation.

### Preferred fix

On entering a drill level and on leaving one, move focus to the drilled
editor's heading and make the context change announceable:

- Give the breadcrumb/header region a real heading element and move focus to
  it when the drill depth changes, rather than leaving focus on a button that
  no longer exists.
- Reuse the existing `useEffect` in `ListDrillEditor` that already keys off
  `scope?.item.itemId` — the depth change is observable there. Do not add a
  second effect racing the `autoFocusFirstField` one; "+ Add" must still land
  in the first field, not the heading.
- The breadcrumb string is already computed (`resolveBreadcrumbLabels`), so the
  announcement has meaningful text available without new logic.

Prefer focus management over a bare `aria-live` region — moving focus is what
actually orients a screen-reader user, and it fixes keyboard order at the same
time. Do not change the visual design; this should be invisible to sighted
users.

### Ties

- **Load the `design` skill** — user-visible runner surface, even though the
  intended visual delta is zero. Register R2.
- Load `run-tests` before running anything.
- **Not folded into LIST2-7** even though both are List UI: LIST2-7 was already
  dispatched when this was written, and LIST2-7 is **builder**-side
  (`cards/list/*`) while this is **runner**-side. Footprints are disjoint —
  dispatch in parallel.
- Related: LIST2-5 (last touched this file — wrapped the render site in
  `BlockErrorBoundary` and threaded `aliasMap`).
- File footprint: `client/src/components/runner/list/ListDrillEditor.tsx`,
  possibly `ListItemsView.tsx`, plus tests.

### Acceptance criteria

1. Opening a list item moves focus to the drilled editor's heading.
2. Leaving a level (via "← parent", "Done", or hardware back) moves focus
   somewhere deliberate and existing — not to `document.body`.
3. The drilled editor exposes an accessible name reflecting the current
   breadcrumb, so the context change is announceable.
4. "+ Add" still focuses the **first field**, not the heading — the existing
   `autoFocusFirstField` behavior is unchanged and still covered by its test.
5. No visual change: no new visible text, spacing, or layout shift.
6. New tests assert 1, 2 and 4 (that a focused element matches the expected
   role/name after each transition).
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green at ≥ 2246.

---

## LIST2-13 — Debounce List config saves ✅

**Priority: P2** · Size: S · File: `client/src/components/builder/cards/ListCardEditor.tsx`

### Finding

Promoted from backlog LIST2-B9, **and its trigger has now arrived.**
`ListCardEditor` fires a full `updateStep` mutation on every change with no
debounce. That was *correct as delivered* in LIST-6 — it matches
`MultiFieldCardEditor`, the donor the ticket named — but the scale differs:
MultiField carries 2–6 flat fields, whereas a 3-level List can hold dozens, and
each keystroke PATCHes the entire nested config object.

LIST2-7 is what makes this bite: it gives **every field its own `config`
object** (scale bounds, number ranges, display content, sub-fields), so the
payload being re-sent per keystroke grows by roughly an order of magnitude.

Still cosmetic — no data is lost, the mutation is idempotent — which is why it
stays P2. But authoring a large list is where it will be felt.

### Preferred fix

Copy the debounce queue already in `ChoiceCardEditor` (see the comment near
its queue setup) — it is the better donor for this one aspect, and it is
in-repo and proven. Do not invent a new debouncing approach and do not reach
for `useAutoSave`, which is the runner's mechanism and carries save-status UI
this editor does not want.

Keep local state updates **immediate** — only the network mutation is
debounced. The editor must stay fully responsive while typing; this is a
request-rate fix, not an input-latency fix.

Make sure an in-flight debounce is flushed when the editor unmounts or the
selected step changes, or the last edit before switching steps is lost.

### Ties

- **Load the `design` skill** — builder UI behavior. Register R2.
- Load `run-tests` before running anything.
- **Depends on LIST2-7** — it must merge first. `ListCardEditor` renders the
  tree LIST2-7 restructures, and the payload this debounces is the one LIST2-7
  enlarges. Dispatching in parallel would mean debouncing a shape that is
  changing underneath.
- Donor: `client/src/components/builder/cards/ChoiceCardEditor.tsx`'s debounce
  queue. Anti-donor: `MultiFieldCardEditor` (the original, undebounced donor).
- File footprint: `client/src/components/builder/cards/ListCardEditor.tsx`
  plus tests.

### Acceptance criteria

1. Typing rapidly into a List field's title/alias/config issues **one**
   `updateStep` mutation after the debounce window, not one per keystroke.
2. Local editor state updates immediately on every keystroke — typing is not
   delayed or laggy.
3. A pending debounced save is flushed when the editor unmounts or the selected
   step changes, so the final edit is never dropped.
4. The persisted config after a burst of edits is identical to what
   the undebounced version would have written.
5. New tests assert 1, 2 and 3 using fake timers, asserting on mutation **call
   count**, not just final state — a test that only checks the end value passes
   with no debounce at all.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green at ≥ 2246.

---

## LIST2-14 — Thread normalization options into template-mapping validation ✅

**Priority: P2** · Size: M · Files: `server/routes/templates.routes.ts`,
`server/services/document/MappingValidator.ts`,
`server/services/TemplatePreviewService.ts`,
`client/src/components/builder/tabs/TemplatesTab.tsx`

Replaces LIST2-11, which was closed unstarted once its premise was disproved
(see above). The **defect is unchanged**; only the shape of the fix is new.

### Finding

Template-mapping *validation* calls `normalizeVariables(testStepValues)` with no
options at `MappingValidator.ts` (both call sites), while *rendering*
(`finalBlock.routes.ts`, `RunLifecycleService.ts`) passes `listConfigs`
(LIST-11) and `listBoundChoices` (LIST2-6). So validation sees the raw
`{ items: [{ itemId, values }] }` envelope and raw UUIDs where rendering sees
the projected array and resolved labels — a mapping onto a list variable, or
onto a list-bound choice, can report a false warning for a document that renders
perfectly. Generated output is unaffected; this is a validation surface only.

### Preferred fix — decided, do not redesign

**`MappingValidator` stays workflow-ignorant.** It must not learn to query
steps. Give both methods an optional trailing `normalizationOptions?:
NormalizationOptions` and pass it straight through to `normalizeVariables`.
That is the whole change in that file.

**Resolution happens in the route**, which already has `tenantId` and auth:

1. `POST /templates/:id/test-mapping` and `POST /templates/:id/preview` accept an
   **optional** `workflowId` in the body.
2. The route loads that workflow's steps and builds the bundle with the existing
   exported collectors — `getListConfigsByAlias(steps)` and
   `getChoiceListBindingsByAlias(steps)`. Do not reimplement either.
3. `GeneratePreviewOptions` gains optional `normalizationOptions` (**not**
   `workflowId`) so `TemplatePreviewService` stays a pass-through too.
4. `TemplatesTab.tsx` already receives `workflowId` as a prop — send it.

**Optional at every level.** When `workflowId` is absent, behavior must be
byte-identical to today. A template previewed with no workflow context is a
legitimate case, not an error.

> **Security — this is the part that makes it a design call.** The client sends
> a `workflowId`, **never** the resolved `listConfigs`/`listBoundChoices`.
> Accepting caller-supplied config here would be a mass-assignment hole. The
> route **must** verify the workflow belongs to the authenticated tenant before
> reading its steps, or this becomes a cross-tenant read primitive: pass a
> victim's `workflowId` and their step definitions come back inside a validation
> report. Load the `add-api-endpoint` skill and follow its tenancy pattern; see
> `docs/architecture/SECURITY_THREAT_MODEL.md`.

### Ties

- Load `add-api-endpoint` (route + tenancy) and `run-tests`.
- Donors: `RunLifecycleService.ts` and `finalBlock.routes.ts` — the two
  correctly-wired call sites; mirror how they build the bundle.
- Related: LIST-11, LIST2-6 (both merged; neither changes here).
- No collisions with LIST2-8, LIST2-10, LIST2-12 or LIST2-13.

### Acceptance criteria

1. Both `normalizeVariables` call sites in `MappingValidator.ts` accept and pass
   through `normalizationOptions`; the validator gains **no** DB access.
2. A mapping onto a `list` alias validates without a false warning when
   `workflowId` is supplied — and warns before the fix.
3. Same for a mapping onto a list-bound `choice`.
4. Omitting `workflowId` produces results byte-identical to today — asserted
   against a fixture that *does* produce warnings, so the test would catch a
   behavior change rather than passing on an empty result.
5. A `workflowId` belonging to **another tenant** is rejected (404/403 per the
   error contract) and never causes that workflow's steps to be read. This has
   its own test.
6. `getListConfigsByAlias`, `getChoiceListBindingsByAlias` and
   `normalizeVariables` are unchanged.
7. New tests assert 2–5, each shown to fail without the fix.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green at ≥ 2261; the touched integration file passes.

### Verification pass — 2026-08-02 (reviewer)

All 7 criteria met. Committed `62a0d7f2`. `test:fast` **2271 passed / 0 failed**.

**Mutation-proven in both halves**, not taken on report:
- Removing `headingRef.current?.focus()` fails AC1 (drill-in) and the
  parent-exit half of AC2.
- Breaking the `pendingDrillReturnFocus` row handoff fails the "Done" and
  hardware-back halves of AC2.

Both reverted after. AC4's regression guard ("+ Add" still lands in the first
field) survives both mutations, which is the point of it.

The `isNewItem` gate is the subtle part and it is correct: clearing
`autoFocusFirstField` re-fires the same effect for the *same* item, and without
the gate that second pass would yank focus off the field "+ Add" just placed it
on. The module-scope handoff is justified in its own doc comment — the drill
close is a genuine unmount/remount at the same JSX slot, which neither React
state nor context can bridge — and `ListItemsView` claims it only when one of
its own rows matches, so a second List step cannot steal it.

**Observation, not a defect:** the handoff is not cleared when no row matches,
so a stale `itemId` survives until some later `ListItemsView` happens to mount
with that row. Item ids are unique, so a later match *is* the right row and the
deferred focus is arguably desirable. Left as-is.

**Process note.** This ticket was committed inside its worktree (`2b07b67d`)
against the standing rule that devs do not commit — and the turn-in reported it
as "left uncommitted". The content was correct, so it was re-applied by path and
the commit here is the reviewer's, preserving one-commit-per-ticket. Second
occurrence this initiative (LIST2-2 was the first).

Credit where due: the supervising session caught that its dispatched agent's
report implied a lint run had finished when it had not, and re-ran all three
gates itself. That is exactly the standard.

---

## LIST2-15 — Section-submit errors drop the list path ✅

**Priority: P1** · Size: S · File: `server/services/runs/RunExecutionCoordinator.ts`

Found by the LIST2-9 dev while writing the lifecycle test, and confirmed by the
reviewer. Filed rather than folded into LIST2-9, because that ticket is coverage
and this is a production behavior change.

### Finding

`validatePage` produces one error entry **per failing path**, each carrying a
`path` (`server/workflows/validation.ts` — `target.push({ fieldId, fieldTitle,
path, errors })`). `RunExecutionCoordinator` then flattens them:

```ts
const errorMessages = validationResult.errors.map(err => {
  const step = steps.find(s => s.id === err.fieldId);
  const fieldName = step?.title ?? 'Field';
  // Take first error message for each field
  return `${fieldName}: ${err.errors[0]}`;
});
```

`err.path` is never read. So three invalid items in a `Children` list produce
three identical `"Children: Age must be at most 17"` strings, and the respondent
cannot tell which item is wrong — in a list that is the whole question.
`err.errors[0]` also discards every error but the first *within* one path.

This is the same defect class as the `Map`-keyed-by-`fieldId` collapse that
LIST2-10 deleted — except that one was unreachable and this is the live section
submit path.

### Preferred fix

Include the path in the emitted message when there is one, and keep the bare
`"<title>: <error>"` shape when there isn't, so non-list steps are unchanged.
`path` is already the `[0].alias` convention the runner's per-field error
display uses (LIST2-2, LIST2-5) — reuse it, do not invent a second format.

Decide deliberately whether to emit every error for a path or keep only the
first; if keeping the first, say so in a comment, because the current
`errors[0]` reads like an oversight.

Do **not** change `validatePage`, the error-path keying convention, or the
`SERVER_FIELD_VALIDATION` gate.

### Ties

- Load `add-api-endpoint` (response shape on a service path) and `run-tests`.
- Related: LIST2-2 (added the type errors that multiply the paths), LIST2-9
  (blocked on this for its AC3), LIST2-10 (same defect, dead code).
- File footprint: `server/services/runs/RunExecutionCoordinator.ts` plus tests.

### Acceptance criteria

1. A section submit failing on one list item returns a message identifying
   **which** item/path failed, not just the step title.
2. Two different items failing the same field produce two **distinguishable**
   messages.
3. A failing non-list step's message is **byte-identical** to today — asserted
   against a fixture that actually produces one.
4. New tests assert 1–3, each shown to fail without the fix.
5. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green at ≥ 2271.

---

## LIST2-16 — Two debounce implementations 🔲

**Priority: P3** · Size: S · Files: `client/src/components/builder/cards/ListCardEditor.tsx`,
`client/src/hooks/useDebouncedFieldMutation.ts`

Filed by the reviewer at LIST2-13 commit time.

### Finding

`useDebouncedFieldMutation<T>(serverValue, onFlush, debounceMs = 600)` is a
generic hook with six consumers, carrying a dirty-guard and an unmount flush.
LIST2-13 re-implemented roughly the same machinery inline in `ListCardEditor`
rather than reusing it, so the repo now has two debounce implementations that
can drift.

The deviation is **defensible on the facts** and was accepted:

- The hook flushes on **unmount only**, and `StepEditorRouter` renders
  `ListCardEditor` without a `key`, so React reuses the instance across step
  changes and that flush never fires.
- The hook refreshes `onFlushRef` every render, so a flush after a step change
  would post the previous step's config under the **new** step's id.
- Its `serverValue` sync is gated on the dirty flag, so on a step change the
  new step would render the previous step's config.

It was **not declared** — the turn-in said "Deviations: none" against a ticket
that explicitly said "Do not invent a new debouncing approach." That is the
part to avoid repeating.

### Preferred fix

Extend `useDebouncedFieldMutation` to cover the identity-carrying case rather
than keeping two implementations — e.g. instantiate it with `T` = the pending
payload (`{ stepId, sectionId, config }`) so the identity travels *inside* the
debounced value and the stale-closure problem disappears, plus an explicit
flush-on-identity-change. Then delete `ListCardEditor`'s inline queue.

Prove equivalence by keeping `tests/unit/client/ListCardEditor.test.tsx`
passing **unmodified** — it already asserts mutation call count, immediate
local state, the exact final payload, and both flush paths.

### Acceptance criteria

1. `ListCardEditor` has no inline `setTimeout`/`clearTimeout` debounce; it uses
   the shared hook.
2. `tests/unit/client/ListCardEditor.test.tsx` passes **unmodified**.
3. The six existing `useDebouncedFieldMutation` consumers are unaffected —
   assert against their existing tests.
4. `npm run type-check` 0 errors; `npm run lint` clean; `test:fast` ≥ 2274.

---

# Backlog / observations (not phase-gated)

Carried forward from the round-1 file plus this audit. A backlog entry is
**not** a ticket — promoting one means re-verifying the finding first.

- **LIST2-B1 — `MappingValidator` does not project list values.** Was LIST-B10.
  `MappingValidator.ts:150` and `:332` call `normalizeVariables(testStepValues)`
  with no options, so template-mapping *validation* sees the raw storage
  envelope while *rendering* sees the projection. Output unaffected;
  validation-surface inconsistency only. Fix by threading
  `getListConfigsByAlias` into both call sites the way LIST-11 did.
- **LIST2-B2 — `intakeStateMachine` truncates multi-path list errors.** Was
  LIST-B5. `server/workflows/intakeStateMachine.ts` collapses the error array
  into a `Map` keyed by `fieldId`; a list now emits one entry per failing path,
  all sharing a `fieldId`, so every path but the last is discarded.
  **Re-verify after LIST2-2**, which increases the number of paths a list can
  fail on.
- **LIST2-B3 — a second page validator has no list handling.** Was LIST-B6.
  `server/routes/validation.routes.ts` calls a *different* `validatePage`
  from `shared/validation/PageValidator.ts`. Very likely advisory rather than
  an enforcement boundary — **but that was never confirmed.** Confirm it.
- **LIST2-B4 — run-detail dumps list answers as raw JSON.** Was LIST-B11.
  `ExecutionDetailView.tsx` renders every step value via `JSON.stringify`
  because `runAPI.getWithValues` returns no step type or config. Internal
  staff surface, not respondent-facing. `ListAnswerView` + `formatAnswerValue`
  are reusable once `ListConfig` is plumbed in.
- **LIST2-B5 — dynamic options for list fields.** Filed by LIST2-8. Needs a
  scoping decision on what a list/table binding means for a field inside a
  repeating item. The runner is ready once LIST2-5 lands `aliasMap`.
- **LIST2-B6 — no `file_upload` or `signature_block` per list item.** Both are
  deliberately excluded from `LIST_FIELD_QUESTION_TYPES`. `file_upload` is in
  `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` platform-wide, so this is not
  a list problem. Real for enterprise intake ("upload each child's birth
  certificate"); needs its own initiative.
- **LIST2-B7 — cross-item references in conditions.** Was LIST-B1. Logic is
  scoped to top-level item count; `children[0].name` from outside the list is
  deferred.
- **LIST2-B8 — script helpers for list data.** Was LIST-B2. Scripts and hooks
  see the raw `{items:[{itemId, values}]}` envelope, not the projection.
- **LIST2-B9 — debounce List config saves.** Was LIST-B8. `ListCardEditor`
  PATCHes the whole nested config on every keystroke. Correct as delivered
  (matches `MultiFieldCardEditor`) but LIST2-7 makes configs bigger.
  `ChoiceCardEditor`'s debounce queue is the better donor.
- **LIST2-B10 — no screen-reader announcement on drill-in.** Entering an item
  replaces the whole section body with no focus move or live-region
  announcement. Relevant to accessibility procurement.
- **LIST2-B11 — drill state is not URL-addressable.** Refreshing mid-drill
  returns to the section. Deliberate (`ListDrillProvider key={section.id}`),
  noted so it is not rediscovered as a bug.
- **LIST2-B12 — `db-schema-change` and `add-step-type` skills are stale.**
  Was LIST-B9/B3. The former documents the migration chain as `0000`–`0002`
  (now at `0009`) and wrongly says enum values can't be removed; the latter
  names `client/src/components/runner/blocks/validation.ts`, which does not
  exist. Both misled a dev at least once.

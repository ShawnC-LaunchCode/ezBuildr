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
| 1 | Independent fixes + hardening | LIST2-1..6 | **All 6 parallel** — footprints are disjoint |
| 2 | Per-field configuration | LIST2-7, LIST2-8 | **Sequential** — both land in `ListFieldSettings` |
| 3 | Proof | LIST2-9 | After Phase 2 |

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

## LIST2-3 — `list` has no server-side config schema 🔲

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

## LIST2-5 — Dropdowns inside a list can't resolve their source 🔲

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

---

## LIST2-6 — List-bound dropdown answers render as raw UUIDs in documents 🔲

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

---

## Phase 1 Gate

- [ ] LIST2-1..6 all ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → clean (`--max-warnings 0`)
- [ ] `npm run test:fast` → green, count ≥ 2206 baseline
- [ ] `npm run test:integration` → green (LIST2-3 adds to it)
- [ ] **One live drive-through** covering LIST2-1 (palette), LIST2-4
      (large-list autosave), LIST2-5 (dropdown in a list): build a list with a
      nested list via the new palette, fill 3 items, confirm autosave status
      reaches "saved", reload and confirm values persisted
- [ ] Reviewer has committed each passed ticket + this gate

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

## LIST2-7 — Per-field settings panel (host + Scale/Number/Display/MultiField) 🔲

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

---

## LIST2-8 — Choice options for a list field 🔲

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

## LIST2-9 — No end-to-end coverage of the list lifecycle 🔲

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
3. It asserts a valid section submit succeeds and an invalid one is rejected
   with a path-keyed error naming the offending field.
4. It asserts a generated document contains values from **both** list levels.
5. The test passes via `npm run test:integration` and is not added to any
   exclude list.
6. `npm run type-check` 0 errors; `npm run lint` clean.

---

## Phase 3 Gate

- [ ] LIST2-9 ✅ with a dated verification note
- [ ] Full `npm run test:integration` green
- [ ] `npm test` (CI-equivalent, single-fork) green
- [ ] Reviewer has committed the ticket + this gate

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

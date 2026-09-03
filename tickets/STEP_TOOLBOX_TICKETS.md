# Canonical Step Toolbox — Honest Types and Config Contracts (STB-1..22 + backlog)

Source: verified config-key and step-type audit, expanded through code inspection and product decisions, 2026-08-26.
Scope: shared step types/config schemas, builder presets and editors, runner controls, AI vocabulary and patches,
workflow ingest/templates/portability, stored workflow artifacts, and the `step_type` database enum.
Overall grade at audit time: **C−** — the core runner is usable, but the platform stores several dialects for the
same question family and advertises config keys whose controls or runtime behavior do not exist.

Every finding below was verified against the working tree at audit time. **Line numbers are advisory** — they
were accurate when written and will drift as fixes land. The locator is the quoted code and named symbol; grep
for those. A stale line number is not a broken ticket and does not require the ticket to be reissued.

---

## How to work this document

- **Tickets are grouped into six non-overlapping phases.** Do not start a phase until the previous phase's
  **Phase Gate** has been verified and committed by the reviewer.
- Read this section, the **Decisions** section, and **your ticket only**.
- Every ticket has **Finding**, **Preferred fix**, **Ties**, and numbered **Acceptance criteria**. Tickets spanning
  more than one runtime layer also have **Vertical proof**.
- Load every project skill named in the ticket's Ties before touching code. Step work uses `add-step-type`; any
  tests use `run-tests`; UI proof uses `verify`; schema/enum work uses `db-schema-change`.
- `npm test` naively gives misleading results here. Use the project named by the ticket, then the phase gate.
  DB-backed tests require `npm run test:docker:up` (Postgres 5434 and Gotenberg 3009) and an explicit
  `TEST_DATABASE_URL` unless the verified worktree already supplies one.
- Before trusting the initiative baseline, record the passing count from `npm run test:fast`. A lower count at a
  later gate is a stop condition even when the remaining tests are green.
- Devs do **not** commit, stage, push, or touch another ticket. The reviewer commits one verified ticket at a
  time, staging only that ticket's files plus this file.
- Use `pwsh scripts/new-worktree.ps1 -Name <ticket-id>` for parallel dispatch. Tickets whose Ties list a collision
  must be sequenced and reviewed before the next starts. Only one worktree may run DB-backed suites at a time.
- A user-facing ticket is not ✅ merely because component tests pass. Its stated builder → preview/run path must
  be reachable and proven at its phase gate.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

## Audit summary

1. `buildStepTypeCatalog()` derives AI-advertised keys from Zod object fields, not from demonstrated behavior,
   so inert keys are presented as supported capabilities.
2. The builder generally creates base types while the enum, AI, schemas, imports, and runner normalization retain
   legacy and `*_advanced` dialects. A config can therefore validate for one dialect and render through another.
3. Several author controls write values the runner ignores (`number.formatOnInput`), while Boolean's runtime
   default (`buttons`) is not legal in its schema.
4. `file_upload` has a working runner/upload service but no normal palette/editor path, leaving its thumbnail
   option unreachable from authoring.
5. Versions and blueprints store complete step definitions in JSON, and Lists recursively store field types in
   step config; changing only `steps.type` would leave stale definitions that can later be restored or run.
6. The curated marketplace catalog and the demo seed script hold step definitions as **repository files**, not
   database rows. No database backfill reaches them, and both feed boundaries this initiative makes strict.

## Decisions — binding for every ticket

1. **One stored toolbox.** Canonical types are `text`, `boolean`, `phone`, `date_time`, `choice`, `email`,
   `number`, `scale`, `website`, `address`, `multi_field`, `display`, `file_upload`, `list`, `js_question`,
   `computed`, `final_documents`, and `signature_block`.
2. **Mode is exposure, not identity.** Easy and Advanced never produce different stored type names. Switching
   modes hides or reveals presets/settings but never rewrites existing config or runner behavior.
3. **Easy keeps friendly presets.** Short Text, Long Text, Yes/No, True/False, Date, Time, Date/Time, Single
   Select, Multiple Choice, Number, Currency, and File Upload are preset IDs/labels, not persisted step types.
4. **Balanced Easy settings.** Easy exposes common content, validation, layout, Other, and upload controls.
   Storage aliases, dynamic sources, randomization, and detailed numeric formatting remain Advanced.
5. **Strict final boundaries.** After rollout, APIs, AI, template ingest, and portability imports reject retired
   type names and unknown/removed config keys. They do not normalize them silently.
6. **Boolean checkbox means consent.** It displays `trueLabel`; a required consent checkbox must be checked.
   String storage uses `trueAlias`/`falseAlias`, never the presentation labels.
7. **Choice values stay primitive.** Other stores direct strings/string arrays. Option order is deterministic per
   run, stable on revisit, different across runs, and keeps Other last.
8. **Numeric storage stays numeric.** Number/currency controls persist `number | null`. ISO currency formatting
   owns symbols/fraction rules; custom prefix/suffix are plain-number-only. Grouping and live typing are separate.
9. **Upload previews are display-only.** Preview images and page one of PDFs; do not persist generated thumbnails.
10. **Display stays Markdown-only.** Raw HTML is removed, not sanitized into a new feature in this initiative.
11. **Deferred means absent.** Country restrictions/defaults, timezone controls, respondent email verification,
    and DNS validation leave active types/schemas/AI until separately implemented end to end.
12. **Backfill before enum deletion.** Canonical code lands first; an idempotent, audited all-artifact backfill
    reaches zero legacy data; enum removal follows in a separate migration ticket.

13. **Precision is display, never storage.** `validation.precision` controls how many decimals a number is
    *shown* with. It never rounds, truncates or rejects what is stored: the platform keeps the most exact value
    the respondent entered. Legal work routinely mixes figures rounded to the dollar with figures to the cent,
    and the workflow author — not the input layer — owns the arithmetic, increasingly via the JS/Python
    sandbox. Rounding at storage would silently corrupt the base of every downstream formula. A field showing
    `23.15` while storing `23.148` is correct and intended: focus reveals the true value, blur shows the
    formatted one. Ruled by the repo owner 2026-08-28 during STB-9 review, and pinned by
    `tests/integration/number-canonicalization.test.ts`. If a real storage constraint is ever wanted it gets its
    own explicit key — do not overload `precision`.

14. **Currency uses cents-style entry.** STB-10 should implement the bank-software model, where typed digits
    fill from the right so `2314` reads as `23.14`, rather than validating a typed decimal point. That makes
    over-precision unrepresentable instead of an error state. The stored value stays a decimal `number`
    (`23.14`), never cents-as-integer, or every downstream formula is out by 100x.

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---:|
| 0 | Immediate containment and shared foundation | STB-1..2 | 1–2 days |
| 1 | Canonical families and selected UX capabilities | STB-3..3C, STB-4..12 | 6–10 days (4 lanes) |
| 2 | Remaining family cleanup and runtime consistency | STB-13..15A | 4–7 days |
| 3 | AI, API, template, and portability boundaries | STB-16..18 | 3–5 days |
| 4 | Tested stored-artifact backfill | STB-19..20 | 3–5 days |
| 5 | Enum removal and final cross-seam proof | STB-21..22 | 2–4 days |
| Backlog | Later initiatives; not dispatchable | STB-B1..B4 | — |

---

# Phase 0 — Contain New Drift and Establish the Shared Contract

This phase stops AI from creating more false configuration and establishes metadata the later vertical tickets
can converge on. It deliberately does not remove enum values or change persisted types.

## STB-1 — Stop AI advertising verified inert config keys ✅

**Priority: P1** · Size: S · File: `shared/aiVocabulary.ts`

### Finding

`getConfigKeys()` in `shared/aiVocabulary.ts` treats schema membership as proof of implementation:

```ts
const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
return Object.keys(shape).map((key) => describeField(key, shape[key]));
```

`buildStepTypeCatalog()` sends that list on every AI request. The known inert keys include `displayLayout`,
`previewThumbnails`, country/timezone restrictions, Choice Other/randomization, email verification, numeric
formatting/decorations, DNS validation, legacy date flags, `allowHtml`, and Boolean's mismatched style values.

### Preferred fix

Add a temporary, explicit type/key exclusion manifest next to the vocabulary builder and filter only the
verified inert keys. Fail module/test startup if an exclusion names a missing schema field so the containment
cannot silently rot. Do not mutate the validation schemas yet and do not hand-write a replacement full catalog;
STB-16 replaces this temporary mechanism with the canonical, mode-aware capability contract.

### Ties

- Precedes STB-2 and STB-16; STB-16 owns deletion of the temporary exclusion manifest.
- Load `add-step-type` and `run-tests`.
- File footprint: `shared/aiVocabulary.ts`, `tests/unit/shared/aiVocabulary.test.ts` only.
- Collision: sequence before STB-16; otherwise disjoint from the Phase 1 client work.

### Acceptance criteria

1. Every inert key enumerated in the audit is absent from `buildStepTypeCatalog()` for its affected type.
2. Implemented sibling keys such as Choice `options` and Number min/max remain advertised.
3. An exclusion referring to a missing type/schema key fails a discriminating test rather than being ignored.
4. `tests/unit/shared/aiVocabulary.test.ts` proves the exclusions and would fail if filtering were removed.
5. `npm run type-check`, `npm run lint`, and the targeted unit-fast test pass.

**Verified 2026-08-27:** targeted `aiVocabulary` unit-fast coverage passed 12/12; type-check reported 0 errors;
lint reported 0 problems; full `test:fast` passed 3,456/3,456 tests against a 3,453-test baseline.

---

## STB-2 — Establish canonical toolbox and preset contracts ✅

**Priority: P1** · Size: M · File: `shared/types/stepConfigs.ts`

### Finding

The current persisted union in `shared/types/workflow.ts` contains separate legacy, Easy, and Advanced names:

```ts
export type StepType =
    | "short_text"
    | "long_text"
    | "multiple_choice"
    // ...
    | "text"
    | "boolean"
    | "phone_advanced"
```

`BLOCK_REGISTRY` then models Easy/Advanced availability on those stored identities. There is no shared way to
ask “what is the canonical type?”, “which config belongs to it?”, or “which preset may Easy expose?”

### Preferred fix

Introduce a shared canonical-type constant/union and an exhaustive `StepConfigByType` mapping while retaining
the legacy persisted union temporarily for rollout. Add client `QuestionPreset` metadata whose stable preset ID,
label, modes, canonical type, and default-config factory are distinct from persisted `type`. Use `satisfies`/
exhaustive tests so a canonical type cannot lack config/runtime classification. Do not yet convert existing
registry entries or delete normalization aliases; family tickets do that vertically.

### Ties

- Depends on STB-1. Foundation for STB-3..22.
- Load `add-step-type` and `run-tests`.
- File footprint: shared step-type/config metadata, `client/src/lib/blockRegistry.tsx`, new preset-contract unit
  test, and `tests/unit/client/blockRegistry.test.ts`.
- Collision: all later family tickets touch this contract and must start after STB-2 is reviewed.

### Acceptance criteria

1. The 18 canonical stored types in Decision 1 exist as one exported, exhaustive constant and TypeScript union.
2. `StepConfigByType` maps every canonical type exactly once and fails type-check if a type is added without a
   config decision.
3. `QuestionPreset` can expose several Easy labels/defaults for the same canonical type without introducing a
   persisted alias.
4. Existing behavior and stored type creation remain unchanged until the family tickets land.
5. New `tests/unit/shared/canonicalStepTypes.test.ts` and updated `blockRegistry.test.ts` prove completeness,
   unique preset IDs, valid default configs, and mode metadata.
6. `npm run type-check`, `npm run lint`, and `npm run test:fast` pass without a baseline count regression.

**Verified 2026-08-27:** both targeted unit-fast files passed 17/17; type-check reported 0 errors; lint reported
0 problems; full `test:fast` passed 3,465/3,465 tests against the verified 3,456-test STB-1 baseline.

---

## Phase 0 Gate

- [x] STB-1 and STB-2 are ✅ with dated verification notes.
- [x] The current AI prompt no longer advertises the verified inert keys.
- [x] Canonical metadata and preset metadata are additive; no stored workflow has changed type.
- [x] `npm run type-check` reports 0 errors.
- [x] `npm run lint` reports 0 problems.
- [x] `npm run test:fast` is green with no fewer passing tests than the recorded baseline.
- [x] Reviewer has committed each passed ticket and this phase gate.

**Integrated verification 2026-08-27:** fast-forwarded to current `dev` at `dde6c6c4`; all three Phase 0 targeted
unit-fast files passed 29/29, type-check reported 0 errors, lint reported 0 problems, and full `test:fast` passed
3,465/3,465 tests. Reviewer committed STB-1 (`aaf9e264`), STB-2 (`cc8bbcfd`), and this gate as separate commits.

---

# Phase 1 — Canonical Families and Selected User-Facing Capabilities

Each ticket is a narrow vertical slice from preset/editor through validation, runner, and stored value. Tickets
within one family are sequential. The Phase Gate batches the live builder/runner drive-through.

**Scheduling — four parallel lanes, once STB-3B and STB-3C have landed.** This note previously said the phase
had effectively no parallelism. That was re-examined at the STB-3A review and is now superseded. The
inter-family dependencies were only ever *"shared config/schema files overlap"* — never logic — and STB-2
already defined all twelve presets with their `canonicalType` set, so each family ticket's work in
`blockRegistry.tsx` is data-only. **STB-3C** removes the remaining single-point edits in the shared plumbing,
after which the four families are genuinely independent:

| Lane | Tickets | Family |
|---|---|---|
| A | STB-4 | Date / Time / Date-Time |
| B | STB-5 → STB-6 | Boolean |
| C | STB-7 → STB-8 | Choice |
| D | STB-9 → STB-10 | Number / Currency |

Critical path drops from seven serial M tickets to two, plus the prep. The rules that still bind:

- **Within a lane, strictly sequential.** B, C and D each rewrite one editor/runner pair twice; the second
  ticket inherits the first's rewrite and must never be split off or dispatched alongside it.
- **Dispatch two or three lanes at a time, never all four**, per the repo's parallel-work guidance, and give
  each its own worktree. Never a shared tree.
- **DB suites may run concurrently, one per worktree.** This rule previously said one lane at a time; that was
  over-conservative and is corrected here. The clobbering failure mode is two vitest runs against the *same*
  database, because `tests/setup.ts` names schemas per **worker**, not per process. `scripts/new-worktree.ps1`
  now provisions a database per worktree (`ezbuildr_test_stb_4`, `_stb_5`, `_stb_7`, `_stb_9`, verified
  2026-08-28) and rewrites `TEST_DATABASE_URL`, so lanes cannot collide. What still must never happen is two
  runs inside **one** worktree, or any lane pointing at another's database. `docker compose down` also wipes
  the tmpfs and destroys every per-worktree database at once -- do not run it while lanes are active.
- Lanes still collide *textually* in the `stepConfigSchemas.ts` schema map and in `NORMALIZED_STEP_TYPES`,
  where each adds and removes its own disjoint keys. Those conflicts are additive and resolve mechanically.
  The reviewer resolves them at commit time, one ticket per commit — devs still never commit.
- **The seams between lanes are what per-ticket gates cannot see.** Four green lanes do not prove the families
  agree with each other; the Phase 1 Gate's cross-family checks are the only place that is caught. Do not
  weaken them to fit a schedule.

## STB-3 — Canonicalize Short and Long Text as `text` presets ✅

**Priority: P1** · Size: M · File: `client/src/components/builder/cards/TextCardEditor.tsx`

### Finding

`BLOCK_REGISTRY` persists three identities for one renderer family:

```ts
{ type: "short_text", label: "Short Text", /* ... */ }
{ type: "long_text", label: "Long Text", /* ... */ }
{ type: "text", label: "Text", /* ... */ }
```

`TextCardEditor` infers Easy/Advanced from `step.type`, coupling authoring exposure to the stored type rather
than workflow mode.

### Preferred fix

Make Short Text and Long Text presets create `type: "text"` with `variant: "short" | "long"`. Route/render
only canonical `text`, and have the editor read effective workflow mode to reveal advanced validation fields
without changing type. Keep the answer shape `string | null`; migrate data later in STB-19.

### Ties

- Depends on STB-2. Must precede STB-15, STB-17, and STB-19.
- Load `add-step-type`, `run-tests`, and `verify` for the phase gate.
- File footprint: Text presets/editor/runner, text config schema/types, Step editor routing, relevant component
  tests. Collides with other family tickets in shared config files; sequence STB-3..10.

### Vertical proof

- **Path:** Easy Short Text preset → `POST /api/pages/:pageId/steps` with canonical `text` config → builder edit
  → preview runner text control → page submission → string in `step_values`.
- **Real, not mocked:** step config validation and the runner control/value submission seam.
- **Cross-tenant denial:** tenant B cannot create/update a step on tenant A's page/workflow; no row changes.
- **Suite:** targeted StepService DB/integration coverage plus unit-fast Text editor/runner tests.

### Acceptance criteria

1. Short/Long presets persist only canonical `text` with the correct `variant` default.
2. Easy exposes the friendly presets; Advanced exposes the canonical editor settings without changing identity.
3. Existing placeholder/validation/default-value behavior remains functional for both variants.
4. New/updated Text editor and runner tests cover both variants and mode switching preserving config.
5. The Vertical proof stores the expected string through the real validation/persistence path.
6. Type-check, lint, targeted tests, and `test:fast` pass.

**Verified 2026-08-28 (reviewer):** all six acceptance criteria checked against the working tree, and every
gate re-run by the reviewer in worktree `stb-3` rather than taken from the dev report — `npm run type-check`
0 errors, `npm run check:strict-zones` 6/6 zones, `npm run lint` 0 problems, `npm run test:fast` 314 files /
3,482 tests passed (Phase 0 baseline 3,465), `StepService.db` 9/9, and `text-canonicalization` +
`documentOnboarding` integration 2 files / 7 tests against isolated database `ezbuildr_test_stb_3`. The vertical
proof is real end to end: HTTP create/update of both variants, a rejected variant-less config that writes no row,
page submission storing plain strings in `step_values`, and cross-tenant create/update denial asserted against
unchanged rows. Two review discoveries were carried forward rather than blocking this ticket, because neither is
covered by its acceptance criteria: preset icons collapse once two presets share one canonical type (filed as
**STB-3A**, which must land before STB-4), and `snips/registry.ts` plus `sample-workflow.ts` still author
`short_text` (folded into **STB-15A**). The unreachable `Inspector.tsx` chain is recorded as **STB-B5**.

---

## STB-3A — Give shared-canonical presets their own presentation identity ✅

**Priority: P2** · Size: S · File: `client/src/components/shared/QuestionTypeIcon.tsx`

### Finding

Found in the STB-3 review, and a direct consequence of the preset model STB-2/STB-3 established. Once two
presets share one canonical stored type, every icon call site collapses them, because the tile is derived from
the *type* rather than from the palette entry that was clicked:

```tsx
<QuestionTypeIcon type={block.type} size="md" />
```

`getBlockByType` resolves that string against `BLOCK_REGISTRY` by `type`:

```ts
export function getBlockByType(type: string): BlockRegistryEntry | undefined {
  return BLOCK_REGISTRY.find((block) => block.type === type);
}
```

Three consequences are live today:

1. In `QuestionAddMenu`, Short Text and Long Text both pass `type: "text"`, so both render the `Type`/`T` tile.
   The `AlignLeft`/`¶` icon STB-3 set on the Long Text preset entry is never read. `listEditorHelpers` flattens
   the same way, giving both text palette entries `iconType: "text"`.
2. `getBlockByType("short_text")` and `getBlockByType("long_text")` are now `undefined`, so a pre-STB-19 row in
   `StepCard`, `StepItem` or `ListLevelEditor` falls back to the neutral `FileText` tile in the `display`
   category colour, with the raw string `"short_text"` as its tooltip and aria-label. This is reachable without
   touching legacy data: `snips/registry.ts` still authors `short_text` today (see STB-15A).
3. `ListLevelEditor` fixed the legacy *label* in `getListFieldTypeLabel` but not the icon beside it
   (`currentTypeIconType = field.type`), so that row shows a friendly label on a fallback tile.

STB-4, STB-5, STB-7, STB-9 and STB-10 each add further presets over one canonical type, so this collapses again
with every remaining family ticket unless it is fixed first.

### Preferred fix

Let a palette entry carry its own presentation instead of re-deriving it from the persisted type. Give
`QuestionTypeIcon` an explicit icon/glyph/category override (or let it accept a `BlockRegistryEntry`), pass the
preset's own entry from `QuestionAddMenu` and `ListFieldTypeMenu`, and add a small presentation-only alias map
so retired text names still resolve to the text tile and a friendly label until STB-19 backfills them. Do **not**
reintroduce `short_text`/`long_text` entries into `BLOCK_REGISTRY` — this compatibility is presentation only and
must not become a creation path again.

### Ties

- Depends on STB-3. **Must precede STB-4**, which adds three presets over `date_time`.
- Load `design` (user-visible builder UI) and `run-tests`; live proof rides the Phase 1 Gate drive-through.
- File footprint: `QuestionTypeIcon.tsx`, `blockRegistry.tsx`, `QuestionAddMenu.tsx`, `ListFieldTypeMenu.tsx`,
  `listEditorHelpers.ts`, `ListLevelEditor.tsx` and their unit tests. Collides with STB-4..10 in
  `blockRegistry.tsx`, so land it before them.

### Acceptance criteria

1. Short Text and Long Text render distinct icons in the Add Question menu and in the List field palette.
2. A pre-STB-19 `short_text`/`long_text` step renders the text-family tile and a friendly label — never the raw
   type string — in the step card, the sidebar item and the List field row.
3. No retired type name is reintroduced into `BLOCK_REGISTRY`; `getBlockByType` still returns `undefined` for
   `short_text` and `long_text`.
4. Unit tests cover both preset icons and the legacy presentation fallback, and fail if either regresses.
5. Type-check, lint, and `test:fast` pass without count regression.

**Verified 2026-08-28 (reviewer):** all five acceptance criteria checked against the working tree, with every
gate re-run by the reviewer in worktree `stb-3a` — `npm run type-check` 0 errors, `npm run check:strict-zones`
6/6 zones, `npm run lint` 0 problems, and `npm run test:fast` 315 files / 3,488 tests passed, up 6 from the
3,482 STB-3 baseline. The fix matches the preferred shape: `getQuestionTypePresentation` is presentation-only,
`LEGACY_TYPE_PRESENTATIONS` never enters `BLOCK_REGISTRY`, and `getBlockByType` still returns `undefined` for
both retired names. Tests are discriminating — they assert that `T` and `¶` differ and that no tile is titled
with a raw type string. The dev could not load the `design`
skill in its session; the reviewer checked the result against the existing tile conventions instead, and the
change reuses `CATEGORY_TILE`/`bg-qtype-text` rather than introducing new visual vocabulary. Live proof stays
assigned to the Phase 1 Gate. One review discovery was carried forward rather than blocking: canonical rows are
still presented from their type alone, so a `text` row with `variant: "long"` shows the short-text tile — filed
as **STB-3B**.

---

## STB-3B — Resolve stored-row presentation from the config discriminator ✅

**Priority: P2** · Size: S · File: `client/src/components/shared/QuestionTypeIcon.tsx`

### Finding

Found in the STB-3A review. STB-3A gave *palette entries* their own presentation and gave *retired aliases* a
friendly one, but a **canonical stored row** is still presented from its type alone:

```tsx
<QuestionTypeIcon type={step.type} size="sm" className="mt-px" />
```

`getQuestionTypePresentation("text")` returns the single `BLOCK_REGISTRY` text entry, so every row STB-3 now
creates — short *and* long — renders the `Type`/`T` tile labelled "Text" in `StepItem`, in `StepCard` (via
`StepIcons.getQuestionTypeIcon`) and in the `ListLevelEditor` field row. The result is inverted: a pre-STB-19
`long_text` row shows "¶ Long Text", while the canonical `text` row with `variant: "long"` that replaces it
shows "T Text". `ListLevelEditor` is the clearest case — `getListFieldTypeLabel` already reads the variant and
prints "Long Text" beside a "T" tile.

This is not specific to text. Every remaining family ticket collapses a discriminator into one stored type —
STB-4 (`date_time.kind`), STB-5 (Boolean styles), STB-7 (Choice layout), STB-9/STB-10 (Number modes) — so each
lands the same mismatch unless presentation can read the config.

### Preferred fix

Extend the STB-3A resolver to take the row's config: `getQuestionTypePresentation(type, config?)`, resolving a
canonical type plus its discriminator to the matching preset's presentation and falling back to the registry
entry when there is no discriminator. Pass `step.config` from `StepItem`, `StepIcons.getQuestionTypeIcon` and
`ListLevelEditor`. Keep the retired-alias map and the palette `presentation` prop exactly as STB-3A left them —
this adds a second resolution input, it does not replace either mechanism. Derive the mapping from
`QUESTION_PRESETS` rather than hand-writing a second variant switch.

### Ties

- Depends on STB-3A; **precedes STB-3C and every lane**. STB-4..STB-10 each add a discriminator this
  resolver must cover, so it lands before the fan-out rather than being re-invented four times.
- Load `design` (user-visible builder UI) and `run-tests`.
- File footprint: `blockRegistry.tsx`, `QuestionTypeIcon.tsx`, `sidebar/StepItem.tsx`,
  `cards/common/StepIcons.tsx`, `cards/list/ListLevelEditor.tsx` and their unit tests. Collides with STB-4..10
  in `blockRegistry.tsx`.

### Acceptance criteria

1. A canonical `text` row with `variant: "long"` renders the "¶ Long Text" tile, and `variant: "short"` renders
   the "T Short Text" tile, in the step card, the sidebar item and the List field row.
2. The List field row's icon and its existing label agree for every text field, canonical or retired.
3. A canonical type with no discriminator (`email`, `address`, ...) is unchanged, and retired aliases keep the
   presentation STB-3A gave them.
4. The mapping is derived from `QUESTION_PRESETS`; no second hand-written variant switch is introduced.
5. Unit tests assert the canonical long/short distinction and fail if either collapses back to the bare tile.
6. Type-check, lint, and `test:fast` pass without count regression.

**Verified 2026-08-28 (reviewer):** all six acceptance criteria checked against the working tree; gates re-run by
the reviewer in worktree `stb-3b` — `npm run type-check` 0 errors, `npm run check:strict-zones` 6/6 zones,
`npm run lint` 0 problems, `npm run test:fast` 315 files / 3,496 tests passed, up 8 from the 3,488 STB-3A
baseline. The defect this ticket fixes was **observed live before the fix**, not merely reasoned from code: a
drive-through of the real builder on the STB-3A tree showed both a short and a long canonical row rendering an
identical `title="Text"`/`T` tile (`.playwright-mcp/stb3b-before-canonical-rows.png`), while the palette
distinguished them correctly.

The implementation is better than the ticket's preferred fix. Rather than mapping variants, it infers the
discriminator key from the presets' own default configs — a key qualifies only when its values are scalar and
unique across every sibling in the family — so the resolver never names a family, satisfying criterion 4 by
construction. Two consequences worth recording:

- It **deletes** `getListFieldTypeLabel`'s hand-written text switch instead of extending it, so the List row's
  icon and label now derive from one call and agree by construction (criterion 2).
- It is genuinely self-driving. Boolean's presets still carry `persistedType: "yes_no"`/`"true_false"`, so the
  family is not yet matched and a canonical boolean row correctly falls back to the registry entry; STB-5
  flipping those two fields activates the discriminator with no further edit. Ambiguous or partly-edited configs
  resolve to `undefined` and degrade to the generic tile rather than guessing.

One efficiency observation, carried into STB-3C rather than sent back: the discriminator scan runs on every icon
render, calling `createDefaultConfig()` per sibling each time, though `QUESTION_PRESETS` is a module constant and
the result is static. STB-3C owns this code region and memoizes it there.

---

## STB-3C — Make the preset plumbing data-driven so families can fan out ✅

**Priority: P1** · Size: S · File: `client/src/lib/blockRegistry.tsx`

### Finding

Written at the STB-3A review, to replace this phase's original "no parallelism" scheduling note.

STB-2 already defined all twelve Easy presets with their `canonicalType` set; a family ticket only has to flip
its own presets' `persistedType`, add a `createDefaultConfig` and a `presentation`. That part is data, and data
for disjoint families does not collide. What forces the families into one sequence is a small amount of shared
*plumbing* that still names the text family explicitly:

```ts
const textPresets = QUESTION_PRESETS
  .filter((preset) => preset.modes.easy && preset.canonicalType === "text")
  .map((preset): BlockRegistryEntry => {
    // ...
    description: preset.id === "easy.long-text"
      ? "Multi-line text area"
      : "Single-line text input",
```

Both the `canonicalType === "text"` filter and the id-ternary description are single expressions that **every**
remaining family ticket would have to edit, in the same function, to light up its own presets — four lanes
fighting over four lines. `BlockRenderer` has the same shape, where STB-3 added a one-off adapter rather than a
dispatch point:

```ts
function toCanonicalTextStep(step: Step): Step {
```

### Preferred fix

Make the plumbing read the preset data instead of naming families.

Drive the Easy injection off the presets themselves: a preset participates once its family is canonical, which
is exactly `preset.persistedType === preset.canonicalType`. A family then lights up in the Easy menu purely by
flipping its own `persistedType` — no edit to `getBlocksByMode` ever again. Move `description` onto
`QuestionPreset` alongside `presentation` and delete the ternary. Generalize `toCanonicalTextStep` into a
`toCanonicalStep` that dispatches through a small map of per-family `resolve*Config` adapters, so a family
registers its adapter rather than editing the renderer's switch.

Change no stored shape and no schema in this ticket. It moves exactly one family's worth of behavior — the one
already proven by STB-3 — behind a data-driven seam, and must leave the Text presets rendering identically.

### Ties

- Depends on STB-3B. **Blocks the lane fan-out**: STB-4, STB-5, STB-7 and STB-9 all depend on this, and on
  nothing else in Phase 1.
- Load `run-tests`. No `design` need — this ticket has no visual output of its own; if the Text presets look
  any different afterwards, it has gone wrong.
- File footprint: `blockRegistry.tsx`, `runner/blocks/BlockRenderer.tsx` and their unit tests. Touches the two
  files the lanes would otherwise contend over, which is the entire point of landing it first.

### Acceptance criteria

1. `getBlocksByMode` names no step type or preset id; a family appears in the Easy menu solely by opting in
   through its own preset data, proven by a test that walks `QUESTION_PRESETS` rather than naming a family.

   **Amended at implementation (reviewer).** As written this criterion was wrong, and implementing it exposed
   why. The proposed gate `persistedType === canonicalType` is already satisfied *incidentally* by
   `easy.file-upload`, whose legacy and canonical names happen to coincide — so adopting it would have silently
   published File Upload as an Easy palette action. File Upload has no authoring path yet and belongs to
   **STB-11**. The gate is therefore an explicit `canonicalized: true` on the preset, which a family ticket sets
   in the same edit where it flips `persistedType`. It keeps the fan-out property — each lane edits only its own
   preset objects — without the accidental activation, and a test now pins File Upload out of the palette while
   asserting `canonicalized` implies `persistedType === canonicalType`.
2. `description` is preset data; the id-ternary is deleted, not relocated.
3. `BlockRenderer` dispatches legacy adaptation through a per-family adapter map, and registering an adapter
   requires no edit to the switch.
4. Text preset behavior, labels, icons, descriptions and stored output are byte-for-byte unchanged — this is a
   refactor, and the existing STB-3/STB-3A tests must pass untouched.
5. Type-check, lint, and `test:fast` pass without count regression.

**Verified 2026-08-28 (reviewer, self-implemented):** worked by the reviewer rather than dispatched, because it
is Size S and sits between two tickets that contend for the same file. **This commit is therefore not
independently reviewed** — the Phase 1 Gate drive-through remains the real check on it. Gates: `npm run
type-check` 0 errors, `npm run check:strict-zones` 6/6 zones, `npm run lint` 0 problems, `npm run test:fast`
315 files / 3,498 tests passed, up 2 from the 3,496 STB-3B baseline.

What landed: `description` is preset data on all twelve presets and the `easy.long-text` id-ternary is deleted;
`getBlocksByMode` filters on `preset.canonicalized === true && preset.modes[mode]` and names no type or id;
`BlockRenderer` adapts retired rows once through `LEGACY_STEP_ADAPTERS` before the switch, so all seventeen
renderer call sites now receive an already-canonical step and a family registers an adapter without touching the
switch. The STB-3B discriminator scan is hoisted into a module-level `FAMILY_DISCRIMINATORS` map, so its
`createDefaultConfig()` allocations happen once instead of on every icon render — the efficiency point carried
forward from that review.

Text behavior is unchanged by construction: the STB-3/STB-3A/STB-3B tests all pass untouched, and the palette,
tiles and stored output were re-checked live (see the Phase 1 Gate note).

---

## STB-4 — Canonicalize Date, Time, and Date/Time under `date_time.kind` ✅

**Priority: P1** · Size: M · File: `client/src/components/builder/cards/DateTimeCardEditor.tsx`

### Finding

`DateTimeCardEditor` derives parts from stored aliases rather than config:

```ts
function hasDatePart(type: StepType): boolean {
    return type === "date" || type === "date_time" || type === "datetime" || type === "datetime_unified";
}
```

Meanwhile `LegacyDateTimeConfigSchema` accepts `showDate`/`showTime`, and
`DateTimeUnifiedConfigSchema` accepts `kind`; the runner's `DateTimeBlock` reads neither legacy flag.

### Preferred fix

Use only `date_time` with required `kind: "date" | "time" | "datetime"`. Friendly Date/Time/Date-Time presets
set `kind`; the canonical editor/runner branch on config. Merge currently implemented min/max, default-today,
time-format, and minute-step behavior. Remove `showDate`/`showTime` and defer timezone keys per Decision 11.

### Ties

- **Lane A head.** Depends on STB-3C only; dispatch in parallel with the Lane B/C/D heads.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: date/time presets, `DateTimeCardEditor`, date/time runner blocks/routing, shared date config
  schema/types, validation tests. Collides with STB-15 and STB-19.

### Vertical proof

- **Path:** each Easy date/time preset → canonical step creation → matching HTML control in preview → submit →
  canonical string value persisted and returned on resume.
- **Real, not mocked:** server config validation and run page submission/resume.
- **Cross-tenant denial:** tenant B cannot update tenant A's canonical date step.
- **Suite:** StepService DB tests plus targeted runner integration/component tests.

### Acceptance criteria

1. All three presets persist `type: "date_time"` and the correct `kind`; no new alias type is written.
2. Date, time, and combined controls preserve their existing min/max/default/format/step behavior.
3. `showDate`, `showTime`, `timezone`, and `showTimezone` are absent from the active canonical schema/catalog.
4. Tests cover all three kinds, invalid configs, resume/display behavior, and mode switching without config loss.
5. The Vertical proof passes, and type-check/lint/targeted tests/`test:fast` are green.

**Verified 2026-08-29 (reviewer):** every acceptance criterion checked, and all gates re-run by the reviewer on
the tree **rebased onto STB-5 and STB-9** — not on the branch as turned in, because isolation is exactly what a
per-ticket gate proves and this is the first ticket to merge with two landed lanes. `npm run type-check`
0 errors, `check:strict-zones` 6/6, `npm run lint` 0 problems, `npm run test:fast` 321 files / 3,586 tests,
`StepService.db` 16/16, and all four vertical proofs together — date/time, number, boolean and the portability
round-trip — 15/15.

The count is the useful check: dev stood at 3,586 = 3,561 + the 25 this ticket adds, exactly. A merge that had
silently dropped either side's tests would have landed short, which "all passed" alone would not reveal.

**Rebase produced five conflicts, all additive, all resolved keeping both sides:** the preset presentation
constants and `LEGACY_TYPE_PRESENTATIONS` in `blockRegistry.tsx`, `LEGACY_STEP_ADAPTERS` and its imports in
`BlockRenderer.tsx`, the `stepConfigUtils` import, and two test files where both lanes had extended the *same*
test. Those two now assert both families. One reviewer change neither lane asked for: STB-5's palette test used
a bare `getByText(label)` while this ticket used a menu-item-scoped selector; with three families in the palette
a bare text match grows collision-prone, so both now use the scoped form.

**This dev released the AI exclusion unprompted** — `date_time: ["showDate", "showTime"]` is gone from the
manifest *and* the audited copy the test keeps beside it. STB-5 missed the same step and needed a reviewer fix,
which is the argument for the guard filed against STB-16: nothing catches an exclusion that has quietly become
unnecessary.

Two notes carried forward. The superseded `DateBlock.tsx`/`TimeBlock.tsx` are deleted and nothing references
them (checked directly, not inferred from a green type-check). And this ticket edited
`StepPropertiesPanel.tsx`/`step-properties/StepTypeSettings.tsx`, which are the unreachable `Inspector.tsx`
chain recorded as **STB-B5** — harmless, but effort spent on code nothing renders. Remaining lanes should know.

---

## STB-5 — Canonicalize Boolean with buttons, radio, and toggle styles ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/BooleanBlock.tsx`

### Finding

The schema allows three values while the runner implements a fourth illegal default:

```ts
displayStyle: z.enum(['toggle', 'radio', 'checkbox']).optional(),
```

```ts
displayStyle: config?.displayStyle ?? "buttons",
if (displayStyle === "buttons") { /* ... */ }
// every other value falls through to the same RadioGroup
```

Thus all legal styles render as radios and `buttons` cannot survive strict validation.

### Preferred fix

Make Yes/No and True/False friendly presets create canonical `boolean` configs. Define legal styles
`buttons | radio | toggle | checkbox`, implement buttons/radio/toggle here, and expose the understandable style
selector in Easy. Preserve `boolean | string | null` storage; STB-6 adds checkbox and string-alias semantics.

### Ties

- **Lane B head.** Depends on STB-3C only, not on Lane A. STB-6 is the required sequential follow-up in
  the same files and must stay in this lane.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Boolean presets/editor/runner, shared Boolean schema/types, validation and component tests.

### Vertical proof

- **Path:** Yes/No or True/False preset → canonical Boolean creation/style edit → preview selection → page submit
  → boolean value persisted and rendered on review/resume.
- **Real, not mocked:** config validation and page submission/persistence.
- **Cross-tenant denial:** tenant B cannot alter tenant A's Boolean step.
- **Suite:** StepService DB coverage plus new unit-fast Boolean editor/runner tests.

### Acceptance criteria

1. Both friendly presets persist canonical `boolean` configs with their intended labels and `buttons` default.
2. `buttons`, `radio`, and `toggle` are legal, visually distinct, keyboard accessible, and preserve null/true/false.
3. Easy/Advanced exposure follows Decision 4 and changing mode never rewrites style.
4. New `tests/unit/client/BooleanBlock.test.tsx` and editor tests cover each implemented style and labels.
5. The Vertical proof passes; type-check, lint, targeted tests, and `test:fast` are green.

**Verified 2026-08-28 (reviewer):** every acceptance criterion checked against the working tree, and all gates
re-run by the reviewer in worktree `stb-5` rather than taken from the report — `npm run type-check` 0 errors,
`npm run check:strict-zones` 6/6 zones, `npm run lint` 0 problems, `npm run test:fast` 317 files / 3,515 tests
(3,514 from the dev plus one reviewer assertion, against the 3,498 baseline), `StepService.db` 12/12, and
`boolean-canonicalization` 4/4. Every figure in the turn-in reproduced exactly.

This ticket got the hard parts right:

- **Legacy rows stay readable**, via `getConfigString(step.config, "yesLabel") ?? …("trueLabel")`, so pre-STB-19
  `yes_no` rows keep their labels instead of silently losing them.
- **It used the STB-3C seam as intended** — `canonicalized: true` plus per-preset `presentation` — and so never
  edited `getBlocksByMode`. That is the fan-out working: zero contention with the other three lanes.
- **The contract change is minimal and aimed at the audit finding**: `displayStyle` gains `'buttons'`, the value
  the runtime already defaulted to but the schema rejected.
- **Alias storage was correctly left alone.** `onChange(storeAsBoolean ? … : trueLabel/falseLabel)` reads like a
  Decision 6 violation but is pre-existing behavior only reformatted into a ternary; STB-6 owns correcting it.

**Reviewer fix folded in:** `boolean: ["displayStyle"]` was still listed in STB-1's temporary AI exclusion
manifest, so AI stayed barred from a capability this ticket had just implemented end to end. Released from the
manifest *and* from the audited copy the test keeps beside it — the two are asserted equal on purpose, so a key
cannot be released by accident — and pinned in the positive direction. STB-1's guard catches an exclusion naming
a missing field, and catches the manifest drifting from its copy, but nothing catches a key that has quietly
*become* implemented. That is the direction every family ticket travels; `radio.displayLayout` (STB-7),
`date_time.showDate`/`showTime` (STB-4), `choice.*` (STB-8) and `file_upload.previewThumbnails` (STB-11) each
face it next. Recorded as an observation for STB-16, which replaces the manifest.

---

## STB-6 — Add consent checkbox behavior and correct Boolean alias storage ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/BooleanBlock.tsx`

### Finding

`BooleanAdvancedConfig` declares `trueAlias`/`falseAlias`, and the editor writes them, but the runner stores
labels instead:

```ts
if (storeAsBoolean) {
  onChange(newValue);
} else {
  onChange(newValue ? trueLabel : falseLabel);
}
```

The declared checkbox style also has no consent/required semantics anywhere in client or server validation.

Because this changes what a string-mode Boolean *stores*, existing answers deserve an explicit ruling rather than
an assumption. `getBooleanConfig` hard-codes `storeAsBoolean: true` for `yes_no` and `true_false`, so every row of
those two types already stores a real boolean and is unaffected. Only Advanced `boolean` with
`storeAsBoolean: false` ever persisted a label.

### Preferred fix

Render a single consent checkbox labelled with `trueLabel`. A required consent config is valid only when the
stored logical result is true. When `storeAsBoolean` is false, persist `trueAlias`/`falseAlias`; labels remain
display formatting. Align default-value coercion, server/client validation, review formatting, and logic operands.

**No answer backfill, and do not add one.** Historical string-mode answers hold labels while new ones hold
aliases. Confirm by census that the affected population is empty before relying on that: count `boolean` steps
whose config sets `storeAsBoolean: false`, record the number in the verification note, and escalate a non-zero
result instead of silently converting stored answers.

### Ties

- Depends on STB-5 and shares its files; never dispatch in parallel.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Boolean runner/editor, shared validation, server page-submit validation, answer formatting,
  Boolean/default-value tests. Collides with STB-15.

### Vertical proof

- **Path:** Advanced Boolean config with checkbox + aliases → runner interaction → required submit rejection when
  false → successful submit when true → configured alias/boolean stored and human label shown on review.
- **Real, not mocked:** both client and server page-submit validation plus persisted `step_values`.
- **Cross-tenant denial:** unchanged StepService ownership denial remains green.
- **Suite:** new Boolean integration case in the runner/page-submit project plus unit-fast component tests.

### Acceptance criteria

1. Checkbox is legal and accessible; required false/unchecked is rejected by both validators.
2. Optional false remains representable, and a missing value is not silently converted on component mount.
3. String mode stores aliases, while review/template formatting uses presentation labels where appropriate.
4. Tests discriminate labels from aliases and prove required consent through the real submit path.
5. Existing Boolean logic/default/resume behavior remains green.
6. A recorded census of `boolean` steps with `storeAsBoolean: false` justifies the no-answer-backfill decision;
   any non-zero result is escalated to the reviewer rather than converted in this ticket.
7. Type-check, lint, targeted integration/unit tests, and `test:fast` pass.

**Verified 2026-08-29 (reviewer):** all gates re-run on the tree rebased onto STB-8 — type-check 0 errors,
`check:strict-zones` 6/6, lint 0 problems, `test:fast` 322 files / 3,605 tests, `StepService.db` 16/16, vertical
proof 5/5. The count reconciles exactly: the dev measured +5 against a 3,597 baseline, and 3,600 + 5 = 3,605.

**This closes the gap STB-5 deliberately left open.** `getBooleanStorageValue` now returns
`trueAlias`/`falseAlias` and never a presentation label (Decision 6), while `resolveBooleanLogicalValue` still
*reads* historical label-backed answers — with a comment stating outright that accepting labels there is
display/resume compatibility, "not permission to persist another label-backed answer." Read compat that is
fenced rather than merely present.

The riskiest edit is the one to `shared/validation/Validator.ts`, which every step type shares. It is correctly
additive: `requiredValue?` is optional, so `undefined` short-circuits and no other type's behaviour moves. A
required consent checkbox then fails `required` when unchecked because `BlockValidation` derives that expected
value from `getBooleanStorageValue(true, config)` — the same helper the runner writes through, so the check and
the storage cannot drift apart.

Criterion 6 was met by measurement rather than assumption: a census returned zero `boolean` steps with
`storeAsBoolean: false`, so no answer backfill was needed and none was invented.

Reporting note, worth recording after four turn-ins that overstated: this one named every gate with its exit
code, and disclosed that repeat in-app browser attempts hung on "Starting session…" with a Vite HMR websocket
error rather than rounding the live check up to a pass. The integration proof independently covered rejection,
successful submission and persisted `step_values`, which is what the criterion actually requires.

---

## STB-7 — Canonicalize Choice and implement radio/checkbox layout ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/ChoiceBlock.tsx`

### Finding

The runner normalizes three stored identities to one renderer:

```ts
multiple_choice: "choice",
radio: "choice",
```

but `LegacyRadioConfigSchema` alone owns `displayLayout`, and `renderRadioChoices()` always emits one vertical
`RadioGroup`. The Advanced config also stores both `display` and redundant `allowMultiple`, which can disagree.

### Preferred fix

Make Single Select and Multiple Choice presets create canonical `choice`. Use one authoritative display enum
`radio | dropdown | combobox | multiple`, remove redundant `allowMultiple`, and rename layout to
`layout: vertical | horizontal` for radio/multiple controls. Preserve option aliases and `string | string[]`
values. Dynamic sources remain Advanced and unchanged until STB-8 extends option ordering.

### Ties

- **Lane C head.** Depends on STB-3C only, not on Lane A or B. STB-8 shares Choice files and is strictly
  sequential behind this ticket.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Choice presets/editor/hooks/runner, shared schemas/types, validation and existing Choice tests.

### Vertical proof

- **Path:** Easy Single/Multiple preset → canonical Choice config/editor → preview control/layout → submit →
  alias value(s) persisted and rendered on review.
- **Real, not mocked:** option/config validation and page submission.
- **Cross-tenant denial:** tenant B cannot edit tenant A's Choice step or dynamic binding.
- **Suite:** StepService DB tests plus Choice runner/editor unit-fast tests.

### Acceptance criteria

1. Single/Multiple presets write only canonical `choice`; no new `radio`/`multiple_choice` rows are created.
2. `display` alone determines cardinality, and contradictory `allowMultiple` is no longer active config.
3. Vertical/horizontal layouts are distinct and responsive for radio and multiple controls; other displays ignore
   and hide layout.
4. Existing dropdown, combobox, dynamic-source, missing-option, min/max, and alias behavior remains green.
5. Tests cover presets, all display values, both layouts, single/multiple storage, and invalid configs.
6. The Vertical proof and standard gates pass.

**Sent back, then completed by the reviewer, 2026-08-29.** The turn-in reported an A with type-check, lint and
`test:fast` green, but deleted three tests and added none (3,498 -> 3,495, which this file calls a stop
condition), left AC5 without the coverage it names, and shipped no Vertical proof for AC6.

**Writing the Vertical proof found a break that would have shipped.**
`RunPersistenceWriter.validateChoiceValue` still derived cardinality from
`getConfigBoolean(step.config, 'allowMultiple')` — the field this ticket removed from authoring. Every canonical
`display: 'multiple'` step therefore rendered checkboxes and then **rejected its own submission** with
"expected one option value". The turn-in explicitly claimed this file had been stripped of `allowMultiple`; it
had not. Nothing caught it because no test submitted a multi-select value through the server, which is exactly
the gap AC6 exists to close. Cardinality now comes from `resolveChoiceDisplay`, as AC2 requires.

**Ruling on `allowMultiple`:** honoured on **read only**, never writable. It was a *required* field before this
ticket, and the previous resolver returned `multiple` when either it or `display` said so — a disagreement the
ticket's own Finding notes was reachable, since AI, API and import callers bypass the editor that kept the two
in step. Such a row is a real multi-select holding a `string[]`; deleting the signal outright would silently
read it as a radio and orphan the answer. This matches every sibling family
(`resolveTextConfig`, `resolveNumberConfig`, `resolveDateTimeConfig`, Boolean's `yesLabel ?? trueLabel`).
**STB-19 must map `allowMultiple: true` to `display: 'multiple'` before removing it from stored artifacts.**

Reviewer added: the three deleted precedence tests restored, one pinning that `allowMultiple: false` is ignored
so display governs new rows, ten covering both layouts x both cardinalities plus storage shape
(`ChoiceLayout.test.tsx`), and the five-test vertical proof (`choice-canonicalization.test.ts`) covering
canonical creation with layout stored but inert, invalid display *and* invalid layout rejected with no row
written, cross-tenant create/update denial with rows unchanged, string-vs-array storage, and the legacy
disagreeing row round-tripping its array.

Gates re-run on the tree rebased onto STB-4/5/9: type-check 0, `check:strict-zones` 6/6, lint 0 problems,
`test:fast` 322 files / 3,597 tests, `StepService.db` 16/16, vertical proof 5/5. The count reconciles exactly —
3,586 + 14 added - 3 the dev deleted — so the ticket now adds coverage instead of removing it.

---

## STB-8 — Implement Choice Other and stable per-run randomization ✅

**Priority: ENH** · Size: M · File: `client/src/components/runner/blocks/ChoiceBlock.tsx`

### Finding

`ChoiceAdvancedConfigSchema` accepts the following keys, but no Choice runner/editor consumer reads them:

```ts
allowOther: z.boolean().optional(),
otherLabel: z.string().optional(),
randomizeOrder: z.boolean().optional(),
```

The runner already resolves static/dynamic options and preserves missing selected options, so naïve shuffling in
render would reorder on every visit and could move the Other input or missing-value sentinel unpredictably.

### Preferred fix

Add explicit Other UI to closed displays; combobox stays inherently freeform. Store entered text directly as the
existing primitive Choice value. Add deterministic seeded shuffle after resolving normal options, using run ID +
owning step/field identity; use a preview-session seed when no run exists. Keep synthesized missing values fixed
after normal options and Other last. Never mutate persisted option arrays.

### Ties

- Depends on STB-7 and shares its files; sequence.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Choice editor state/hooks/runner, BlockRenderer/List field seed plumbing, Choice tests.
  Collides with STB-15's runner/List cleanup.

### Vertical proof

- **Path:** author enables Other/randomization → two real runs resolve different deterministic orders → one run
  revisits the page without changing order → custom text submits as a primitive value and survives resume/review.
- **Real, not mocked:** run identity, resolved options, page submit, and persisted value.
- **Cross-tenant denial:** tenant isolation is unchanged; run tokens may access only their own pinned definition.
- **Suite:** targeted runner integration plus Choice component/hook unit tests.

### Acceptance criteria

1. Other works for radio, dropdown, and multiple; `otherLabel` defaults to “Other” and is hidden when inapplicable.
2. Custom values persist as `string`/`string[]`, including mixed listed/custom multi-select values.
3. Same run + step/field produces the same order across rerender/revisit/resume; different run IDs can differ.
4. Other is last; missing-option sentinels remain stable; configured/exported option order is unchanged.
5. Tests prove all four properties and would fail with `Math.random()` during render.
6. Vertical proof, type-check, lint, targeted tests, and `test:fast` pass.

**Verified 2026-08-29 (reviewer):** all gates re-run by the reviewer — type-check 0 errors,
`check:strict-zones` 6/6, lint 0 problems, `test:fast` 322 files / 3,600 tests (+3 over 3,597),
`StepService.db` 16/16, vertical proof 6/6.

The engineering is the strongest of the batch. AC5 asked for tests that *would fail if `Math.random()` were used
during render*, and the shuffle test delivers exactly that discriminating property: it spies on `Math.random`
and asserts `not.toHaveBeenCalled()`, so the mock is a tripwire proving the shuffle is genuinely seeded rather
than a crutch faking determinism — the usual false-green shape for randomness tests. Same-`runId` order is
stable and different-`runId` order differs, covering Decision 7. **Other stays last structurally**, because it
renders outside the shuffled array rather than depending on an ordering rule. The three render functions became
real components invoked as JSX, so their new `useState` calls obey the rules of hooks. The AI exclusions
(`allowOther`, `otherLabel`, `randomizeOrder`) were released from the manifest *and* its audited copy without
being asked.

**Reported done three times with a red gate, though.** First with gates still in flight; then "0 lint problems,
tree is spotless" when the reviewer's run found 15 lint errors; then "spotless / A-graded" with `tsc` exiting 2
and type-check simply absent from the list of gates claimed. The substance survived each time — the failures
were mechanical — but the claim ran ahead of the evidence on every pass.

Reviewer fixes: on the `||` -> `??` lint errors the dev correctly took the explicit-emptiness route after being
warned (a blind swap would have blanked a cleared Other label and seeded every preview identically). The final
type-check break was the eslint/tsc disagreement over `as HTMLInputElement`: eslint calls the assertion
redundant, `tsc` refuses `.value` on `HTMLElement`. Resolved as in STB-9 with the generic query form,
`findByPlaceholderText<HTMLInputElement>(...)`, which satisfies both.

Carried forward: the new `forceOther` state in the three components has no direct unit test. The vertical proof
covers custom values reaching the database as a bare string and inside an array, but that internal state is the
part most exposed to STB-15's runner cleanup.

---

## STB-9 — Canonicalize plain Number formatting, grouping, prefix, and suffix ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/NumberBlock.tsx`

### Finding

`NumberBlockRenderer` treats Advanced config as an Easy config and reads only top-level base fields:

```ts
const config = (step.config as NumberConfig) || (step.config as NumberAdvancedConfig);
const min = config?.min;
const max = config?.max;
const step_value = config?.step ?? 1;
```

The editor visibly writes `formatOnInput`, while `mode`, nested validation, grouping, prefix, and suffix are
ignored by this control.

### Preferred fix

Define canonical `number` config with `mode`, nested validation, formatting switches, optional plain-number
prefix/suffix, and placeholder. Implement a text/input-mode numeric control that keeps invalid intermediate text
local, emits only `number | null`, formats on blur, optionally groups while typing, and renders prefix/suffix as
non-editable adornments. Do not enforce min/max by discarding keystrokes; report validation consistently.

### Ties

- **Lane D head.** Depends on STB-3C only. STB-10 extends the same Number files and stays in this lane.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Number preset/editor/runner, shared Number schema/types, server sanitization/validation, tests.

### Vertical proof

- **Path:** Number preset → canonical config with grouping/decorations/limits → preview typing/focus/blur → page
  submit validation → numeric `step_values` value → review/export remains numeric.
- **Real, not mocked:** server sanitizer/validator and persisted value.
- **Cross-tenant denial:** StepService ownership denial stays green.
- **Suite:** StepService DB coverage plus new Number runner/editor unit-fast tests.

### Acceptance criteria

1. Number preset writes canonical `number` with plain-number mode and nested validation.
2. Prefix/suffix and grouping affect display only; stored/submitted values remain numeric.
3. `formatOnInput` controls live grouping separately from unfocused formatting; caret/intermediate negatives and
   decimal input remain usable.
4. Min/max/step/precision agree between editor, runner, sanitizer, and server validation.
5. Tests cover focus/blur, live/non-live grouping, decorations, null, invalid intermediates, and boundary errors.
6. Vertical proof and all required gates pass.

**Verified 2026-08-28 (reviewer, self-implemented):** worked by the reviewer rather than dispatched, so **this
commit is not independently reviewed** — the Phase 1 Gate remains the real check on it. Gates re-run on the tree
rebased onto STB-5: `npm run type-check` 0 errors, `npm run check:strict-zones` 6/6, `npm run lint` 0 problems,
`npm run test:fast` 319 files / 3,561 tests, `StepService.db` 12/12, and both vertical proofs together
(`number-` and `boolean-canonicalization`) 8/8.

The control is rewritten around one rule: never discard a keystroke. The old one returned early when a parsed
value fell outside min/max, so typing `5` into a min-10 field silently ate the character; range problems now
surface as validation instead. Intermediate text (`-`, `1.`, `-0.`) stays on screen and emits nothing.
`resolveNumberConfig` reads all three stored dialects and is the single source for the client rules, the runner
and the server, so those layers cannot drift; `number_advanced` registers through STB-3C's adapter map and
needed no switch edit.

Two deliberate deviations from the ticket. `mode` is **defaulted**, not required: it has one legal value today,
so demanding callers spell it out breaks existing writers to carry no information — STB-10 widens it. And
`currency` is **absent** from the canonical type rather than declared-and-inert, which is the thing STB-1 removed.

**What the vertical proof earned.** It found precision was enforced nowhere. `stepConfigUtils.sanitizeStepValue`
and `validateStepValue` read configs and enforce rules but are **referenced from nowhere** — the live submit path
is `RunPersistenceWriter -> getValidationSchema`. A precision-2 field stored `1.239` while 3,544 unit tests
passed. Those two functions are a trap for STB-10, which will reach for them to round currency.

Precision then became **display-only** by owner ruling mid-review (Decision 13). The `maxDecimalPlaces` rule
added an hour earlier was removed, the dead sanitizer's rounding stripped, and `inputMode` fixed at `decimal` so
a cosmetic setting cannot stop someone entering the number they have. The proof pins it: `23.148` submitted to a
two-decimal field is stored as `23.148`, asserted explicitly *not* `23.15`.

---

## STB-10 — Implement currency modes and retire new `currency` writes ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/NumberBlock.tsx`

### Finding

The builder has a separate persisted Currency type and Advanced Number modes, while the runner routes them to
different components. `CurrencyBlockRenderer` reads but does not use the configured currency:

```ts
const _currency = config?.currency ?? "USD";
```

`number_advanced` currency modes normalize to `NumberBlock`, which ignores their presentation config.

### Preferred fix

Make the Currency Easy preset create canonical `number` with `mode: currency_decimal`, `currency: "USD"`, and
grouping enabled. Implement `currency_whole`/`currency_decimal` in the canonical Number control via
`Intl.NumberFormat`; whole uses zero fraction digits, decimal uses ISO minor-unit rules. Currency symbol and
fraction behavior win; reject/hide plain prefix/suffix in currency modes. Stop all new `currency` writes while
leaving old-row read compatibility for STB-19.

### Ties

- Depends on STB-9; same files, strictly sequential.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: Number/Currency presets/editor/runner, shared/server numeric config and validation, answer
  formatting, numeric tests. Collides with STB-15 and STB-19.

### Vertical proof

- **Path:** Currency preset → canonical Number config → USD/non-USD formatted preview → submit → numeric value
  persisted → review/template/export format without changing stored value.
- **Real, not mocked:** server numeric sanitizer/validation and persisted value.
- **Cross-tenant denial:** unchanged StepService denial remains green.
- **Suite:** numeric runner/editor unit tests plus targeted page-submit DB/integration test.

### Acceptance criteria

1. Currency preset and Advanced currency modes persist only canonical `number`.
2. ISO symbols/grouping/fraction digits render correctly for representative zero- and two-decimal currencies.
3. Plain prefix/suffix are rejected or absent in currency modes; no duplicate symbol combinations are possible.
4. Whole mode submits an integer; decimal mode preserves the allowed ISO precision; values remain numbers.
5. Tests cover preset defaults, currency switching, focus/blur/live formatting, sanitization, and persistence.
6. Vertical proof and standard gates pass.

**Verified 2026-08-29 (reviewer):** gates re-run on the tree rebased onto STB-6 — type-check 0 errors,
`check:strict-zones` 6/6, lint 0 problems, `test:fast` 325 files / 3,622 tests, `StepService.db` 16/16, and
**all five vertical proofs run together** (text, boolean, choice, date/time, number) 5 files / 22 tests. The
count reconciles exactly: 3,605 + the 17 this ticket adds. `CurrencyBlock.tsx` is deleted with no surviving
reference — checked by grep rather than inferred from a green type-check, since a stale barrel export would
survive one.

**Decision 14 implemented as specified.** Bank-style entry maps `2314` to `$23.14`, so over-precision is
unrepresentable rather than an error state, and the stored value stays a decimal `number` — never
cents-as-integer, which was the trap named when the decision was recorded. JPY renders `¥2,314`, whole-currency
decimals are refused server-side, and prefix/suffix decoration is rejected for currency modes, keeping
Decision 8's rule that ISO formatting owns symbols and fraction rules while custom decorations stay
plain-number-only.

**Merge:** one conflict, in `client/src/lib/formatAnswerValue.ts` — the file STB-6 and this ticket both
extended. Boolean added its branch, Number added the currency branch, neither replaced the other, and both are
kept. Third inter-lane conflict of the initiative and the third that was purely additive; the STB-3C plumbing
is doing its job.

**Reviewer note on the AI exclusion.** The dev released `number_advanced` from the manifest, which STB-B7 had
filed under STB-19. On inspection the release is right and the note was wrong: `number_advanced` survives only
in `NORMALIZED_STEP_TYPES` as a read alias, is not authorable, and its keys are now genuinely implemented
through `resolveNumberConfig`. The residual oddity is that a retired type still appears in the AI catalog at
all, which is `stepTypeEnum` iteration and belongs to STB-21.

---

## STB-11 — Make File Upload authorable and add image previews ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/FileUploadBlock.tsx`

### Finding

`FileUploadConfigSchema` declares `previewThumbnails`, and the runner supports upload/remove/download, but
`BLOCK_REGISTRY` contains no `file_upload` entry and StepEditorRouter falls through to GenericStepEditor:

```ts
export const FileUploadConfigSchema = z.object({
  maxSize: z.number().int().min(1).optional(),
  allowedTypes: z.array(z.string()).optional(),
  maxFiles: z.number().int().min(1).max(10).optional(),
  previewThumbnails: z.boolean().optional(),
}).optional();
```

### Preferred fix

Add an Easy/Advanced File Upload preset and dedicated editor for max size, allowed MIME/extensions, max files,
and previews. When enabled, render responsive previews for image MIME types using fresh signed URLs or local
object URLs. Revoke local URLs and fall back to the existing file row on load error. Preserve upload value shape
and existing run-token authorization.

### Ties

- Depends on STB-10 review. STB-12 extends the same preview component and must follow it.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: registry/preset, StepEditorRouter, new FileUpload editor/preview helper, FileUploadBlock,
  `FileUploadBlock.test.tsx`, `RunFileUploadService.test.ts`. Collides with STB-12 and STB-15.

### Vertical proof

- **Path:** File Upload preset/editor → live run upload endpoint → storage-backed `FileUploadValue` → image
  preview/download → resume refreshes signed URL → remove deletes only that run's file/value.
- **Real, not mocked:** upload service/storage adapter and run-scoped auth; UI may mock storage only in unit tests.
- **Cross-tenant denial:** another run token/user cannot fetch, delete, or mint a URL for the file.
- **Suite:** existing RunFileUploadService unit coverage plus file-upload integration and component tests.

### Acceptance criteria

1. File Upload appears in Easy and Advanced add menus and has a dedicated, schema-valid editor.
2. Limits/types/maxFiles/previews persist and round-trip without GenericStepEditor.
3. Images preview before and after upload; disabled previews retain the current compact row.
4. Object URLs are revoked; signed URL failures fall back without blocking download/remove or crashing render.
5. Tests cover authoring, validation, local/signed images, cleanup, denial, and unchanged upload storage.
6. Vertical proof and all required gates pass.

**Sent back once, then verified 2026-08-29 (reviewer):** the first turn-in reported every criterion satisfied
with `test:fast` at exactly 3,622 — the baseline — and no new test files, so AC5 and AC6 were unmet. The second
turn-in added them. Final gates re-run by the reviewer on the tree rebased onto `dev`: type-check 0 errors,
`check:strict-zones` 6/6, lint 0 problems, `test:fast` 326 files / 3,631 tests (+9), vertical proof and
`documentOnboarding` green.

**This ticket repaired a live crash STB-4 introduced and this reviewer missed.** `defaultStepSelectionFor`
mapped an AI-analyzed `date` variable to the option value `"date"`, but STB-4 removed `date` from
`RUNNER_RENDERED_STEP_TYPES`, from which `ONBOARDING_STEP_TYPE_OPTIONS` is derived — so
`selectOnboardingStepType` threw `Unsupported onboarding step selection: date`, and the document onboarding
wizard crashed on any document containing a date. Fixed at source (`value = "easy.date"`, routing through
STB-4's preset). The reviewer's STB-4 pass ran portability and the four canonicalization proofs but never
`documentOnboarding`, which is how a reachable seam reached `dev`.

The dev found the failure but first "fixed" the integration fixture to match the broken behaviour, calling it a
pre-existing test flaw. It was a pre-existing *product* flaw. Source and fixture now agree on `date_time`.

**Reviewer correction to a claim in the turn-in.** The report stated the run "confirms file upload correctly
respects real PostgreSQL Row Level Security constraints." **It does not.** `server/utils/rlsContext.ts` gates
enforcement on `RLS_ENFORCED === "true"`, which is off, and `FORCE ROW LEVEL SECURITY` is not set — the suites
log `RLS not enforced, running unscoped` throughout. The denials the proof demonstrates are real, but they come
from application-layer authorization. Recorded because a note claiming RLS was proven would mislead whoever
next scopes RLS-5.

The `captcha.service` failure in the reviewer's first sweep was **not** this ticket's: it passes 10/10 in
isolation and is the documented order-dependent `test:fast` flake, surfaced because two new test files shifted
scheduling. Verified rather than assumed, in both directions.

Reviewer fixes: two type errors (`createPage`'s second argument is column overrides, not a version id; the
editor test omitted the required `workflowId` prop) and three unused bindings — `eq`, `expectCrossTenantDenied`
and the `version` that removing the pin orphaned. Four gates were reported green; three were red.

---

## STB-12 — Add lazy first-page PDF upload previews ✅

**Priority: ENH** · Size: M · File: `client/src/components/runner/blocks/FileUploadBlock.tsx`

### Finding

PDF uploads currently receive only a file icon:

```ts
if (mimeType === 'application/pdf') { return <FileText className="h-4 w-4" aria-hidden="true" />; }
```

The app already configures a local PDF.js worker in `PdfCanvas.tsx` and depends on `react-pdf`, so introducing
another renderer/package would duplicate an established pattern.

### Preferred fix

Extract/reuse the local PDF.js worker setup and render page one with `react-pdf` only when the preview is enabled
and visible. Bound preview dimensions, disable text/annotation layers, label it accessibly, refresh expired signed
URLs through the existing endpoint, and fall back to the compact row on password/corruption/network/render errors.
Do not generate or persist thumbnail assets.

### Ties

- Depends on STB-11 and shares FileUploadBlock/preview tests; sequence.
- Load `add-step-type`, `run-tests`, and `verify`.
- Donor: `client/src/components/builder/templates/PdfCanvas.tsx`.
- File footprint: shared PDF worker helper, upload preview component/tests. No server change expected.

### Acceptance criteria

1. A valid PDF renders only page one in a bounded responsive thumbnail for local and signed URLs.
2. Rendering is lazy and does not eagerly fetch every persisted PDF before its preview becomes visible.
3. Corrupt/password-protected/expired PDFs fall back to the normal row with no unhandled rejection.
4. Preview has an accessible filename/page-one label and remains usable at mobile width.
5. `tests/unit/client/FileUploadBlock.test.tsx` covers success, lazy behavior, retry/fallback, and disabled preview.
6. Type-check, lint, targeted tests, `test:fast`, and Phase Gate browser console checks pass.

**Verified 2026-08-29 (reviewer):** every acceptance criterion checked against the tree, and all gates re-run by
the reviewer in the ticket's own worktree at `c2143b0d` — type-check 0 errors (with
`node_modules/typescript/tsbuildinfo` deleted first, so the green cannot be stale), lint 0 problems,
`check:strict-zones` 6/6, `test:fast` 326 files / **3,639 tests (+8)**. The arithmetic reconciles exactly
against an independently re-measured 3,631 baseline: six new `it()` plus one `it.each` of two cases takes the
file from 7 to 15 tests.

**The lazy boundary is this ticket's real content, and it took two attempts.** The first pass put a static
`import { Document, Page } from 'react-pdf'` in `FileUploadPreview.tsx`. Because `BlockRenderer.tsx:33`
statically imports `FileUploadBlockRenderer`, that pulled `pdfjs-dist` into every runner render and broke **13
unrelated suites** with `ReferenceError: DOMMatrix is not defined` — `DateTimeBlock`, `NumberBlock`,
`TextBlock`, `ListBlock`, `PageSteps.a11y`, `RunnerAnswerPiping`, `DisplayBlock.aliasInterpolation`,
`ListDrillEditor`, and five `WorkflowRunner.*`. It would also have shipped pdfjs to every respondent on
workflows containing no file-upload step. The landed implementation is `lazy(() => import('./PdfUploadThumbnail'))`
behind `Suspense`, gated on `IntersectionObserver` with a `typeof === 'undefined'` fallback for jsdom, so
`react-pdf` leaves the static graph entirely; all 13 suites pass. **This was a gap in the ticket, not dev
error:** Ties named `PdfCanvas.tsx` as the donor without recording that its own static import is safe only
because it lives in the builder-templates path, where the only tests reaching it mock it deliberately
(`tests/unit/client/TemplatesTab.test.tsx:37`).

The ref-gating is not circular, which was worth confirming rather than assuming: `previewRef` is attached to
`CompactFileRow` through `containerRef` before any preview exists, so the observer always has a target, and it
moves to the preview div once `pdfVisible` flips. A PDF that fails falls back to that same row (AC 3), and
`retriedSignedUrlRef` bounds the expired-URL refresh to a single attempt.

The laziness proof is real rather than nominal: it mounts 20 persisted PDFs, asserts zero `fetch` calls and zero
`react-pdf` renders, triggers observer #7 alone, then asserts exactly one fetch and that it is for
`evidence-7.pdf`. Binding decision 9 holds — nothing generates or persists a thumbnail. `PdfCanvas` keeps its
behavior; its worker URL moved verbatim into `client/src/lib/pdfWorker.ts`, imported for side effect.

**Owed by the Phase 1 Gate, not by this ticket.** The turn-in reported desktop 1280x720 and mobile 390x844 runs
with measurements, but **no screenshots were stored under `.playwright-mcp/`**, so those specific claims rest on
an artifact that does not exist. AC 6 defers browser checks to the Phase Gate, so this is not a send-back — but
the gate drive-through must cover PDF page-one preview at both widths and capture the evidence itself. The dev
also hit a Compose host-port collision and hosted `ezbuildr_test_stb_12` on the already-running
Postgres/Gotenberg containers; no product deviation.

---

## Phase 1 Gate

- [ ] STB-3, STB-3A, STB-3B, STB-3C and STB-4..12 are ✅ with dated verification notes.
- [ ] **Cross-lane seam check.** The four families were built in parallel, so per-ticket gates never saw
      them together: confirm one workflow holding a canonical step of every family renders, validates,
      submits, resumes and formats consistently, and that no lane's `NORMALIZED_STEP_TYPES` or schema-map
      edit silently dropped another lane's key.
- [ ] Easy add menu creates only canonical Text, DateTime, Boolean, Choice, Number, and File Upload rows while
      retaining the agreed friendly preset labels.
- [ ] Advanced reveals full implemented settings; switching modes preserves hidden config byte-for-byte.
- [ ] Local `npm run dev:test` drive-through covers every preset, editor persistence, preview, live run submission,
      resume/revisit, image preview, and PDF page-one preview.
- [ ] Desktop and mobile screenshots are stored under `.playwright-mcp/`; browser console has no feature errors.
- [ ] `npm run type-check`, `npm run lint`, and `npm run test:fast` pass with no count regression.
- [ ] Relevant DB-backed page-submit/file suites pass with Postgres and Gotenberg healthy.
- [ ] Reviewer has committed each passed ticket and this phase gate.

**Partial live proof already recorded (2026-08-28).** The text family was driven end to end in the running app
from a clean worktree at `dev`, ahead of this gate, because STB-3 and STB-3A both deferred live proof here and
four lanes were about to build on them. Confirmed: Easy presets persist canonical `text` with the right
`variant`; a run submission stores plain strings in `step_values`; the palette renders `T`/`¶` with correct
labels and descriptions; canonical short/long and a pre-STB-19 `long_text` row each render their own tile
(`.playwright-mcp/stb3b-3c-after-canonical-rows.png`, against the pre-fix
`stb3b-before-canonical-rows.png`); the runner renders input/textarea/textarea with the legacy row's root-level
`maxLength: 300` and placeholder correctly lifted into canonical shape; and File Upload stays out of the Easy
palette. **Still owed by this gate:** every other family, mode switching preserving hidden config,
resume/revisit, image and PDF previews, and the full desktop/mobile sweep. One unrelated observation: the
preview shell logged two `401` responses on `POST /api/workflows/:id/runs` while still rendering correctly --
not caused by STB-3B/3C, which touch no run creation, but worth resolving before this gate closes.

### Gate run 2026-08-29 / closed 2026-08-30 (reviewer) ✅

Everything mechanical passed. The live drive-through found **two defects**, so the gate stays open.

**Passed.** type-check 0 errors, lint 0 problems, `check:strict-zones` 6/6, `test:fast` 326 files / 3,639 tests,
and five DB-backed suites (`api.runs.file-upload`, `runFileUpload`, `api.runs.runtime`, `api.runs.bulk-values`,
`api.runs.resume-handoff`) at 5 files / 20 tests, with Postgres and Gotenberg healthy.

**Cross-lane seam check (static), clean.** All 37 `stepTypeEnum` values resolve to a canonical home; no
normalization target is bogus; **no canonical type is shadow-remapped**; only dead `signature` read-compat
remains. No lane removed another lane's `BlockValidation` branch (`git log -S` shows the `date`, `boolean`,
`yes_no`, `scale`, `radio` and `file_upload` cases never existed). Legacy read-compat holds where it matters:
the choice branch reads canonical `min`/`max` **and** legacy `minSelections`/`maxSelections`. STB-B7 re-checked
— all six AI exclusions are still genuinely inert, and canonical `choice.layout` is implemented and correctly
not excluded.

**Live drive-through, one workflow holding all six families.** The Easy palette writes canonical rows only:
`text{variant:short}`, `boolean{displayStyle:buttons,storeAsBoolean:true}`, `date_time{kind:datetime}`,
**`number{mode:currency_decimal}` for the Currency preset (STB-10's retirement confirmed live)**,
`choice{display:multiple}`, and `file_upload`. Easy to Advanced and back left all six configs **byte-for-byte
identical**. A real run stored canonical shapes in `step_values`: plain string, JS `true`, ISO datetime,
**`23.14` as a decimal number rather than cents-as-integer (binding decision 14)**, and a multi-select array.
Resume re-rendered every answer, including `$23.14` and `09/15/2026 02:30 PM` under `timeFormat:"12h"`.
STB-12's PDF preview renders **page one only** — a two-page fixture showed `PAGE ONE MARKER` and never page
two — labelled `Page one preview of <file>`, measuring 244x305 at 390px wide with no horizontal overflow.
STB-11's image preview renders with `Preview of <file>`, and both stay in the compact row while
`previewThumbnails` is unset. The browser console carried only Vite HMR websocket noise — **no feature
errors**. Screenshots are under `.playwright-mcp/stb-gate-*.png`. Every fixture was deleted afterwards and the
teardown proved 0 leftover rows.

The 2026-08-28 `401` observation did **not** reproduce: `POST /api/workflows/:id/runs` returned 201 against a
bearer token. It looks specific to the preview shell rather than the run API.

**Blocking findings: STB-23 and STB-24.**

### ✅ PHASE 1 GATE CLOSED 2026-08-30

Both blocking findings are fixed and **each was re-proven live**, not merely re-tested.

- **STB-24** — a Choice question added from the Easy palette, filled in the real runner, now stores
  `["Option 1"]`. The same interaction stored `["1","3"]` before the fix. That is the runner seam a unit test
  cannot reach, which is why it was the thing that had to be checked.
- **STB-23** — an unfiled workflow, uploaded with only `Authorization: Bearer <runToken>` and no user JWT,
  returns **201** with a correctly tenant-scoped storage key and a `step_values` row. That exact request
  returned `404 Tenant for run not found` before. It took two rounds: round 1 fixed only the authenticated
  path and its suite never covered the respondent path.

Final tree state at `07819036`: type-check 0 errors, lint 0 problems, `check:strict-zones` 6/6, `test:fast`
326 files / **3,647 tests**, file-upload integration 2 files / 8 tests.

Everything else on this checklist was verified in the 2026-08-29 run above and is unaffected by the two fixes,
which touched only the Choice preset defaults and the upload service's tenant resolution: the canonical-only
Easy palette, byte-for-byte config preservation across a mode round trip, canonical `step_values` shapes
including a decimal `23.14`, resume/revisit, the PDF page-one and image previews, mobile at 390px with no
horizontal overflow, and a console carrying only Vite HMR noise. Screenshots remain under
`.playwright-mcp/stb-gate-*.png`; every fixture created for both runs was deleted and the teardown proved zero
leftovers.

**Two reviewer process failures this gate, recorded because they are the transferable part.**

1. STB-23 round 1 was committed on a green integration suite *before* the live proof was run — on a ticket
   whose defect had been found live. The suite authenticated with a JWT while the broken path used a run
   token, so it proved the wrong entry point. Live proof now precedes the commit on any ticket whose finding
   came from a live check.
2. `4e4a3051` shipped the round-2 tests and ticket note **without the service file they assert against**,
   leaving `dev` red at five failing tests. **Root cause: the reviewer verified and committed inside a worktree
   whose dev agent was still running.** A concurrent bare `git stash` in that worktree reset the index between
   the reviewer's `git add` (which staged all four files — `git diff --cached` listed them) and the `git commit`
   (which captured three). The reviewer's own review stash was `199f902e`, carried the custom message
   `stb-23-r2-review`, and git reported it popped **and dropped**; the stash present at commit time was
   `WIP on stb-23: cab4a2cd`, unlabelled, i.e. a bare `git stash` the reviewer never issued. The dev
   independently spotted the same inconsistency and reported it, having committed nothing. The standing rule
   already covered this — stop the dev before verifying its work — and it was not followed; the worktree was
   later torn down while that dev was still mid-verification for the same reason.

   Two habits saved it and are worth keeping. It was caught **only** by grepping for a symbol the ticket added
   in **both** the working tree and `HEAD` before closing — `git status` was clean and the commit summary looked
   plausible, so nothing else would have shown it. And recovering it came within one command of pulling content
   out of the repo owner's unrelated `gh-171` stash, because the stash index shifted between two calls:
   **address a stash by object SHA, never by `stash@{n}`.**


---

## STB-23 - File Upload is dead on Unfiled workflows ✅

**Priority: P0** * Size: M * File: `server/services/RunFileUploadService.ts`

### Finding

Found by the Phase 1 Gate drive-through. Every respondent upload to a workflow with no project fails:

```ts
const workflow = await this.workflowRepo.findById(run.workflowId, tx);
if (!workflow?.projectId) { throw createError.notFound('Project for run'); }
const project = await this.projectRepo.findById(workflow.projectId, tx);
if (!project?.tenantId) { throw createError.notFound('Tenant for run'); }
return { run, tenantId: project.tenantId };
```

The upload path derives `tenantId` **only** through `workflow.projectId` then `project.tenantId`. "Unfiled" is a
supported, first-class state: `client/src/pages/NewWorkflow.tsx` seeds `projectId: ""` with the comment
`// Unfiled`, and `PUT /api/workflows/:workflowId/move` documents "(or unfiled if projectId is null)".
Reproduced live: the runner showed a red **"Project for run not found"** and rejected the upload; filing the
same workflow under a project made the identical upload succeed.

STB-11 did not introduce this, but it **made it reachable** by putting File Upload into the Easy palette, where
any author can add it to an unfiled workflow.

### Preferred fix

Derive the tenant from something every run has. `hybridAuth` and `runTokenAuth` already pin a real tenant into
the async context before this method runs - see the RLS-4 comment immediately above the quoted block - so
resolve from that ambient tenant and fall back to the project only when one is present. Do **not** make
`projectId` mandatory: that breaks the supported Unfiled state and is a product change, not a fix.

### Ties

- Load `add-api-endpoint`, `run-tests`, and `verify`. Related: STB-11, STB-12.
- File footprint: `RunFileUploadService.ts` plus its unit and integration suites. No client change expected.

### Vertical proof

- **Path:** runner upload, upload endpoint, `RunFileUploadService`, storage plus `step_values`, on a workflow
  with `projectId = null`; the file is retrievable afterwards and its preview renders.
- **Real, not mocked:** route, service, tenant resolution, and DB.
- **Cross-tenant denial:** tenant B uploading against tenant A's unfiled run gets the established concealed
  denial and writes nothing.
- **Suite:** `tests/integration/api.runs.file-upload.test.ts` and `runFileUpload.test.ts`.

### Acceptance criteria

1. Upload succeeds on a workflow with `projectId = null`, and the stored file is retrievable.
2. Upload still succeeds on a project-filed workflow, with the resolved tenant unchanged from today.
3. Cross-tenant upload is denied and writes nothing.
4. A regression test covers the unfiled case specifically, and fails against today's code.
5. Type-check, lint, the targeted DB/integration suites, and `test:fast` all pass.

**Verified 2026-08-29 (reviewer):** the worktree was rebased onto `dev` at `c1a00045` (after STB-24) by the
reviewer, and all gates re-run there — type-check 0 errors (with `node_modules/typescript/tsbuildinfo` deleted
first), lint 0 problems, `test:fast` 326 files / **3,645 tests**, and the two file-upload integration suites
2 files / 7 tests. Arithmetic is exact: 3,644 after STB-24, plus the one new unit test, is 3,645. The two new
integration tests correctly do not move the `test:fast` denominator because they run in the `integration`
project.

**AC4 proven by the reviewer, at both layers.** Reverting only `RunFileUploadService.ts` made the new unit test
fail with `ApiError: Project for run not found`, and the new integration test fail with
`expected 404 to be 201` carrying body `{"error":"Project for run not found"}` — the exact user-facing failure
the gate drive-through hit live. Restoring the fix returned both to green.

**The ticket's Preferred fix contained a factual error, and the dev was right to depart from it.** It asserted
that "`workflows` carries owner/tenant identity directly". It does not: the table has `ownerId`, `ownerType`,
`ownerUuid` and `projectId`, and **no `tenantId` column**. The dev instead read the ambient tenant via
`getCurrentTenantId()`, falling back to the project's tenant only when no request-scoped context exists — which
is exactly what the RLS-4 comment already sitting above that block prescribes, and which keeps the existing
unit tests (that call the service with no context) on their original path. `projectId` was correctly **not**
made mandatory, so the Unfiled state survives.

**One narrow divergence recorded rather than waved past.** The tenant that owns the storage namespace now comes
from the requester's context instead of the resource's project. `WorkflowService.verifyAccess` gates on ACL
role, not on tenant equality, so if a cross-tenant ACL grant is ever possible these two could disagree and a
file would be filed under the requester's tenant rather than the workflow's. There is no `workflows.tenantId`
to prefer instead, the run-token path pins the workflow's own tenant, and admin cross-tenant behavior is
RLS-7's open question — so this is accepted here and flagged for RLS-7 rather than solved in an ENH-scope
upload fix.

Deviation accepted: the misleading `'Project for run'` message is now split into `'Workflow for run'` and
`'Tenant for run'`. Verified safe — no test asserted the old string, and `createError.notFound` still renders
`${resource} not found`, which `routeErrors` maps to 404 on the `includes('not found')` rule, so the status
contract is unchanged.

---

### ⚠️ REOPENED 2026-08-30 by the reviewer — the fix covers the wrong path

**The commit `7e433acc` stands in `dev` but does NOT close this ticket.** A live drive-through on a real unfiled
workflow shows the respondent-facing path is still broken:

| Path | Result |
|------|--------|
| Authenticated (`Authorization: Bearer <JWT>`) | **201** — fixed, `storageKey` under `tenants/<tenant>/...` |
| Run token (`Authorization: Bearer <runToken>`) | **404 `Tenant for run not found`** — still broken |

The run-token path is how actual respondents upload. The ticket's own Vertical proof asked for "runner upload"
with "real, not mocked ... tenant resolution", and that is the path that is still failing — the error message
changed from `Project for run` to `Tenant for run`, nothing more.

**Why the suite went green anyway.** The new integration test authenticates with
`.set('Authorization', 'Bearer ${ctx.authToken}')`, so it only ever exercises the authenticated path, where
`hybridAuth` has already pinned a tenant. It never covers the run-token path. Seven integration tests passed,
`test:fast` was 3,645, and the product was still broken for respondents.

**Root cause, confirmed from the server log.** At `resolveContext` the log emits
`withCurrentTenant called with no tenant in async context; RLS not enforced, running unscoped.` — so
`getCurrentTenantId()` is `undefined` on the run-token path, and with `projectId` null there is no fallback
left, hence the throw. No tenant-resolution warning appears at `LOG_LEVEL=warn`, so the pinning in
`creatorOrRunTokenAuth` is not putting a tenant into the context the service actually sees.

**The infrastructure to fix it already exists and is not being used.**
`WorkflowTenantResolver.resolveForWorkflow(workflow, tx)` resolves project → owner → creator. The failing
workflow carries `ownerType: 'user'`, `ownerUuid`/`creatorId` = the creator, and that creator has a
`tenantId` — so the resolver would have returned it. Prefer it over the ambient read: keep
`getCurrentTenantId()` as the fast path if you like, but fall back to
`workflowTenantResolver.resolveForWorkflow(workflow, tx)` rather than to `project.tenantId` alone.

**Added acceptance criteria for the re-do:**

6. The upload succeeds on an unfiled workflow via the **run-token** path
   (`Authorization: Bearer <runToken>`, no user JWT), not only the authenticated path.
7. An integration test covers that run-token path specifically and fails against `7e433acc`.
8. Live proof on the running app: a respondent-style upload on an unfiled workflow returns 201 and the file is
   retrievable. A green integration suite is explicitly not sufficient for this ticket — that is exactly what
   passed while the product stayed broken.

**Reviewer's own error, recorded.** This was committed on the strength of a green integration suite, before the
live proof was run — on a ticket whose defect was found live in the first place. The live check should have
preceded the commit, and for the remaining Phase 1 Gate work it will.

### ✅ CLOSED 2026-08-30 (reviewer) — round 2 fixes the respondent path

**Root cause, and it is worth keeping.** `POST /api/runs/:runId/steps/:stepId/files` runs multer between
`creatorOrRunTokenAuth` and the service. Multer resumes the chain from its own stream callback, outside the
AsyncLocalStorage frame that `runTokenAuth` set the tenant on. The route re-mounts `rlsContext` afterwards, but
that re-seed reads `req.tenantId`, which `hybridAuth` sets and `runTokenAuth` never does — it calls
`setCurrentTenantId` on the frame that multer has already discarded. So `getCurrentTenantId()` is reliably
`undefined` for **every** run-token upload, which is why round 1's project-only fallback had nothing left on an
unfiled workflow. That explains the log line the reopen note recorded.

**The fix** falls back to `WorkflowTenantResolver.resolveForRun(run, workflow, tx)` — run owner → project →
owner → creator, the same precedence `DocumentDeliveryService` already uses — keeping `getCurrentTenantId()` as
the fast path. It needs no ambient tenant because each of its reads is its own short-lived verified bootstrap.
The now-unused `projectRepo` dependency was removed outright rather than left dangling.

**AC8 proven by the reviewer, independently, against a server started from this worktree on its own port.** A
throwaway probe created an unfiled workflow (`projectId: null`), published it, opened a run, and uploaded with
**only** `Authorization: Bearer <runToken>` and no user JWT anywhere on the request:

```
RUN-TOKEN UPLOAD (no JWT) -> 201
  storageKey: tenants/a68a28d7-.../runs/6cb867a4-.../steps/4f89fa90-.../94137e4a-....pdf
  tenant-scoped to the right tenant: true
  step_values rows written: 1
CLEANUP leftover tenants:0 users:0
```

That is the exact request that returned `404 Tenant for run not found` in the reopen note, and the reviewer had
already observed that 404 first-hand against `7e433acc`, so the fail-before-fix is confirmed by direct
observation rather than by report.

Gates re-run by the reviewer on the tree rebased to `cab4a2cd` — type-check 0 errors (tsbuildinfo deleted
first), lint 0 problems, `test:fast` 326 files / **3,647 tests**, file-upload integration 2 files / **8 tests**.
Arithmetic exact: 3,645 after round 1, plus the two new unit tests, is 3,647; the run-token integration test
correctly does not move the `test:fast` denominator.

**The lesson this ticket paid for, twice.** Round 1 passed seven integration tests and a full `test:fast` while
the customer-facing path stayed broken, because its test authenticated with a JWT and the real respondent path
does not. A suite that exercises the wrong entry point is not evidence about the right one — which is why AC8
demanded live proof on the run-token path specifically, and why that criterion, not the suite, is what closed
this.

---

## STB-24 - Easy Choice presets seed options with no alias, so answers store ids ✅

**Priority: P1** * Size: S * File: `client/src/lib/blockRegistry.tsx`

### Finding

Found by the Phase 1 Gate drive-through. `easy.single-select` and `easy.multiple-choice` seed their default
options with no `alias`:

```ts
options: [
  { id: "1", label: "Option 1" },
  { id: "2", label: "Option 2" },
  { id: "3", label: "Option 3" },
],
```

The runner stores `option.alias` (`selectedAliases` and `knownAliases` in `ChoiceBlock.tsx`), and
`normalizeChoiceOptions` computes `alias = firstUsableString(opt.alias, opt.id)` - falling back to **`id`, never
`label`**. So a Choice question added from the Easy palette stores `"1"`, not `"Option 1"`.

That contradicts the builder's own contract in two places. `ChoiceOptionsSettings.tsx:178` tells the author
"Display text is saved as the answer by default", and the same file's option factory does exactly that:

```ts
return { id: `opt${suffix}`, label, alias: label };
```

So options the author adds through **Add Option** store the label while the three seeded defaults store ids -
one question can hold both. Verified live: selecting the first and third seeded options stored `["1","3"]`.
Documents and logic referencing that alias render `1, 3` instead of `Option 1, Option 3`.

### Preferred fix

Seed `alias: label` in both presets' `createDefaultConfig`, matching `ChoiceOptionsSettings`'s own factory.
Prefer that over changing the runner's fallback to `label`: that fallback is the shared choke point for legacy,
list and table-column options, and changing it would move the stored value domain for rows this initiative has
not audited. Check `tests/unit/client/ChoiceBlock*.test.tsx` and STB-8's Other/randomization tests for
assertions that assume id-valued defaults.

### Ties

- Load `add-step-type` and `run-tests`. Related: STB-7 and STB-8; the CVM initiative in `tickets/backlog/`
  records why label-versus-id storage is sensitive here.
- File footprint: `blockRegistry.tsx` and the Choice unit tests. No server change.

### Acceptance criteria

1. A Choice question added from either Easy preset stores the **display text** as the answer.
2. Options added through **Add Option** are unchanged, so one question can no longer mix ids and labels.
3. Existing stored rows carrying id-valued answers still render with the correct option selected.
4. A test asserts the seeded preset's stored value is the label, and fails against today's code.
5. Type-check, lint, targeted tests, and `test:fast` all pass.

**Verified 2026-08-29 (reviewer):** all gates re-run by the reviewer in the ticket's own worktree at
`6d1b3f0b` — type-check 0 errors (with `node_modules/typescript/tsbuildinfo` deleted first), lint 0 problems,
`test:fast` 326 files / **3,644 tests**. The arithmetic is exact against the gate-verified 3,639 baseline:
three tests added to `blockRegistry.test.ts` (one of them an `it.each` of two cases) and two to
`ChoiceLayout.test.tsx` — 3,639 + 5 = 3,644, with the file count unchanged because both landed in existing
files.

**AC4 proven by the reviewer, not accepted on report.** Reverting only `blockRegistry.tsx` and re-running the
new tests failed 2 of 3 on `expect(option.alias).toBe(option.label)`; restoring the fix returned them to green.
The test is discriminating.

The fix is the preferred one and nothing more: `alias: label` on the three seeded options of each preset,
matching `ChoiceOptionsSettings.tsx`'s own `createOption` factory. **The shared fallback was left alone** —
`normalizeChoiceOptions`'s `alias = firstUsableString(opt.alias, opt.id)` is untouched, confirmed by an empty
diff, so the stored value domain for legacy, list and table-column options is unchanged.

AC3 is the criterion that mattered here, and its test is honest: a step whose options carry no `alias` — exactly
a pre-fix stored row — still resolves an id-valued answer to the right option, asserted on both the radio and
the checkbox path, and asserting the *unselected* option is unchecked as well so it cannot pass vacuously. That
is what keeps this fix from orphaning answers already in the database.

Two judgment calls accepted: `ChoiceOptionsSettings.tsx` was correctly not touched (AC2 needed no new test since
existing coverage already pins that factory), and the reviewer confirmed the footprint is exactly the three
declared files.

---

# Phase 2 — Finish Canonical Family Cleanup and Runtime Consistency

These tickets remove unsupported keys from families not receiving expansion here, then make every runtime
consumer agree on the canonical set. Internationalization and verification remain explicitly out of scope.

## STB-13 — Canonicalize Phone, Email, and Website configs ✅

**Priority: P1** · Size: M · File: `shared/validation/stepConfigSchemas.ts`

### Finding

The schema factory maintains base and Advanced definitions for all three families:

```ts
phone: PhoneConfigSchema,
phone_advanced: PhoneAdvancedConfigSchema,
email: EmailConfigSchema,
email_advanced: EmailAdvancedConfigSchema,
website: WebsiteConfigSchema,
website_advanced: WebsiteAdvancedConfigSchema,
```

Their Advanced schemas declare country defaults/restrictions, respondent verification, and DNS validation that
have no complete builder → runner → server flow.

### Preferred fix

Give each family one canonical schema containing only behavior proven end to end today. Convert presets/editor
routing/runner/server validation to the base canonical type. Remove `defaultCountry`, `allowedCountries`,
`requireVerification`, and `validateDns`, plus any newly re-verified unowned sibling key, rather than preserving
it as a promise. Keep temporary old-row read compatibility only for STB-19.

### Ties

- Depends on Phase 1 Gate. Precedes STB-15..20.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: shared configs/schemas, Phone/Email/Website editors and runner blocks, server sanitizer/
  validation, associated tests. Collides with STB-14/15 in shared config files; sequence.

### Vertical proof

- **Path:** each canonical preset → editor config → matching runner input → page submit → sanitized primitive
  value persisted and correctly rejected for an implemented invalid case.
- **Real, not mocked:** server sanitizer/validator and persistence.
- **Cross-tenant denial:** tenant B cannot edit tenant A's step; run tokens remain run-scoped.
- **Suite:** StepService DB tests plus targeted runner/page-submit tests for all three families.

### Acceptance criteria

1. New Phone/Email/Website steps persist only canonical base types.
2. Every retained config key has a named consumer and discriminating test; every unowned key is removed.
3. Deferred country, verification, and DNS keys are absent from types, schemas, presets, editors, and AI input.
4. Existing implemented sanitization/domain/protocol/placeholder behavior remains green and authorable.
5. Tests cover each canonical config, removed-key rejection, valid/invalid submission, and persistence.
6. Vertical proof and standard gates pass.

**Verified 2026-08-30 (reviewer), across three rounds.** Final gates on the tree rebased to `4e712f88` —
type-check 0 errors, lint 0 problems, `check:strict-zones` **6/6**, `test:fast` 326 files / **3,653 tests**,
and the **full** integration project 136 files / 1,244 passed. Arithmetic exact: 3,649 after STB-15A, +3 unit
tests in round 2, +1 net in round 3 (three canonical tests rewritten as four) = 3,653.

**Round 1 was sent back for three unmet criteria**, all evidence rather than implementation: `test:fast` sat at
exactly the baseline with **+0/-0** `it()` blocks in both touched test files, so AC5 had no new coverage; AC6's
vertical proof was never run; and the dev had *edited* `portability.roundtrip.test.ts` without ever running the
integration project, shipping it red — the three fixtures were deleted with no `SKIPPED` entries, so the
every-enum-value guard failed. Round 2 fixed all three, and its predicted arithmetic matched to the test.

**Round 2 introduced a read-compat break the reviewer caught by probing rather than reading.** The dev added
`.strict()` to the three canonical schemas, and `getConfigSchema` maps the retired names onto those same
schemas, so each retired name rejected its own stored config:

```
phone_advanced    REJECTED  unrecognized_keys: defaultCountry, allowedCountries
email_advanced    REJECTED  unrecognized_keys: requireVerification
website_advanced  REJECTED  unrecognized_keys: validateDns
```

That was reachable, not theoretical: `validateAndNormalizeConfig` has three live callers — `StepService.ts:223`
(create), `StepService.ts:341` (update) and `WorkflowContentIngestService.ts:212` (ingest) — all passing
`strict: true`, so editing a stored `phone_advanced` step or importing a workflow containing one would throw.
It is the same shape as STB-7's orphaning. Note `.strict()` was never asked for by this ticket; strictness at
the request/ingest boundary is **STB-17's** job.

Round 3 dropped `.strict()`. Zod's default gives both halves at once, which the reviewer proved before
prescribing it and again after: legacy configs are **accepted** and the retired key is **stripped**, so it can
never be written. All six cases verified live — `phone_advanced` → `{"format":"international"}`,
`email_advanced` → `{"placeholder":"a@b.com"}`, `website_advanced` → `{"placeholder":"https://x.com"}`. The new
guard asserts `toEqual` on the whole parsed object, so it cannot pass vacuously.

**Reviewer fix, recorded.** Removing the Advanced types orphaned the `stepType` parameter of
`resolvePhoneConfig`, `resolveEmailConfig` and `resolveWebsiteConfig` — three `TS6133` violations that
`npm run type-check` does not catch, because `noUnusedParameters` only runs inside the strict zones. The dev had
not run `check:strict-zones`, and it was red. The reviewer removed the three parameters and updated their three
call sites in `PhoneBlock`/`EmailBlock`/`WebsiteBlock` rather than spend a fourth round on six mechanical lines;
strict-zones then passed 6/6. This is the "type-check is not the commit gate" trap, hit again.

Read-compat is otherwise intact: the retired names still resolve through `normalizeRunnerStepType`,
`getConfigSchema` and `stepTypeEnum`, so no stored row is orphaned. The AI manifest correctly dropped the three
`*_advanced` entries while keeping `radio`, `address_advanced` and `display_advanced` — the last two are
STB-14's, and the three surviving `allowedCountries` references are all address-scoped, correctly untouched.

One `captcha.service` failure in the final sweep was **verified, not assumed**: 10/10 in isolation on three
consecutive runs, and the file carries zero references to anything this ticket changed. Documented
order-dependent flake.

---

## STB-14 — Canonicalize Address, Scale, and Display configs ✅

**Priority: P1** · Size: M · File: `client/src/components/runner/blocks/DisplayBlock.tsx`

### Finding

Advanced aliases normalize into base renderers, but DisplayBlock reads only Markdown:

```ts
const rawMarkdown = config?.markdown || step.description || "";
return <ReactMarkdown>{markdown}</ReactMarkdown>;
```

`DisplayAdvancedConfigSchema` additionally accepts `allowHtml`, `template`, `variables`, and style fields; Address
accepts international/custom options the US-shaped renderer does not honor consistently.

### Preferred fix

Canonicalize Address, Scale, and Display to their base identities and retain only demonstrably implemented keys.
Display becomes one Markdown/interpolation contract with no raw HTML, whitelist flag, or inert styling object.
Address remains the current US/autocomplete capability in this initiative; remove country restriction promises.
Scale retains only displays/labels/style options actually rendered and tested.

### Ties

- Depends on STB-13 review; shared config/schema collision requires sequence.
- Load `add-step-type`, `run-tests`, and `verify`.
- File footprint: shared configs/schemas, Address/Scale/Display presets/editors/runners, Places-related tests only
  if behavior changes. Collides with STB-15 and STB-19.

### Vertical proof

- **Path:** each canonical preset → editor → runner → Address/Scale answer persistence or Display Markdown output.
- **Real, not mocked:** config validation, Address/Scale page submit, and the real ReactMarkdown rendering path.
- **Cross-tenant denial:** tenant B cannot edit tenant A definitions; Places auth behavior stays unchanged.
- **Suite:** StepService DB coverage plus targeted Address/Scale/Display unit/integration tests.

### Acceptance criteria

1. New Address/Scale/Display definitions use canonical types only.
2. `allowHtml`, international country restrictions, and every other unowned key are rejected and unadvertised.
3. Markdown interpolation remains escaped/safe; no `rehype-raw` or `dangerouslySetInnerHTML` is added.
4. Every retained Address/Scale/Display setting is reachable and changes a tested observable result.
5. Tests cover canonical configs, removed-key rejection, runner behavior, and persisted answer shapes.
6. Vertical proof and standard gates pass.

### Review notes

**Round 1 — 2026-08-30 — REJECTED, not committed.** The worktree was based at `ee55f6ac`, **217 commits**
behind `dev`, so it contained none of Phase 0/1, STB-13 or STB-15A. Every gate ran against a tree without the
initiative in it; the dev reported 3,198 passing against a 3,653 baseline, and that 455-test gap was the tell.
Four defects, none of which the dev's own gates could have caught from that base:

1. **Legacy read-compat broken.** Repointing `address_advanced`/`scale_advanced` at `AddressConfigSchema` /
   `ScaleConfigSchema` imposes *incompatible required shapes*, not just strictness: `AddressConfigSchema`
   requires `country: z.literal('US')` and a 4-literal `fields` tuple, while stored advanced configs carry
   `fields` as an array of objects; `ScaleConfigSchema` drops `display: 'buttons'`. Measured against the dev's
   own code, 3 of 5 stored shapes that validate today were rejected, through `validateAndNormalizeConfig(...,
   {strict: true})` at `StepService.ts:223`, `StepService.ts:341` and `WorkflowContentIngestService.ts:212`.
   Non-strict Zod strips unknown keys; it cannot rescue a required-shape mismatch. This is the STB-13 round-1
   defect class arriving by a second mechanism.
2. **No tests.** AC 5 names tests; no test or spec file was touched. AC 6's vertical proof had no evidence.
3. **`shared/aiVocabulary.ts` would crash at module load.** `validateConfigKeyExclusions()` throws on a manifest
   key missing from its schema, and `TEMPORARY_CONFIG_KEY_EXCLUSIONS` names `display_advanced.allowHtml` and
   `address_advanced.allowedCountries` — exactly the keys this ticket deletes. The file did not exist in the
   dev's base, so the failure was invisible there. `address_advanced.country` also needs re-thinking: it is
   canonical-and-required now, not an inert key to hide from the AI.
4. **Authoring sites still write retired keys.** `client/src/lib/blockRegistry.tsx` `createDefaultConfig()` for
   `display` still emits `allowHtml: false`.
   *(Reviewer correction, round 2: this item originally also claimed "nothing removed `buttons` from Scale
   authoring". That was wrong — `ScaleCardEditor` only ever offered slider/stars; `buttons` existed in the
   schema alone. The editor's stars-count control is also fine: it auto-syncs `max`, which is what the runner
   reads (`ScaleBlock.tsx:84`, `numStars = max`).)*

Cleared, *not* counted against the dev: the `PdfConverter.ts` `waitUntil` change was a real fix on their base,
but the identical fix is already on `dev` — stale-base residue, not scope creep.

The turn-in was dropped rather than rebased (owner's call): the salvageable part was ~6 mechanical deletions,
and the merge also dragged in pre-`SECT` vocabulary (`sectionId` for `pageId` in `ScaleCardEditor`). Worktree
removed; re-dispatch from a fresh worktree fast-forwarded to `dev`.

**Root cause of round 1, found while re-creating the worktree:** `scripts/new-worktree.ps1` builds from `main`,
and its verification step *certifies* the result — `[ok] base commit matches main (ee55f6ac)` and `[ok] test suite
runs (3198 tests passed)`. It asserts equality with `main` (the wrong invariant) and never compares the count to
the source branch. The dev was handed a stale tree carrying two green stamps. Always ff to `dev` and re-baseline.

**Round 2 — 2026-08-30 — REJECTED, not committed.** Base correct (`55d736aa`). All four gates verified green by
the reviewer, and the test arithmetic is honest (3,653 + 3 = 3,656). The legacy read-compat *approach* is right:
dedicated `ScaleLegacyReadSchema` / `AddressLegacyReadSchema` / `DisplayLegacyReadSchema` that `.transform()` to
canonical. All five stored shapes read correctly. `blockRegistry`'s `allowHtml` default is gone, and the schema
rename left no dangling importers. Four criteria are still unmet:

1. **AC 2 regressed — retired keys are now MORE advertised to the AI, not less.** Measured via `getConfigKeys`:

   | type | `dev` baseline | this round |
   |------|----------------|------------|
   | `address_advanced` | `fields[], autoComplete, validateAddress` | `country, allowedCountries[], fields, autoComplete, validateAddress` |
   | `display_advanced` | `markdown, template, variables[], style.*` | `markdown, allowHtml, template, variables[], style` |

   `.transform()` wraps the schema in `ZodEffects`, and `unwrap()` returns the **input** object, so every retired
   key is still derived. Deleting the `TEMPORARY_CONFIG_KEY_EXCLUSIONS` entries was only correct if the keys had
   stopped being derived — they had not, so the deletion *unmasked* `country`, `allowedCountries` and `allowHtml`.
   The manifest test passes because it asserts the manifest equals its audited copy; nothing asserts that inert
   keys are absent from the catalog (see STB-B7). That is why the dev's gates were green.

2. **`address_advanced` is a rubber stamp.** `fields: z.any().optional()` with every field optional and a
   transform that ignores its input means `{}` and `{fields: "not-an-array", bogusKey: 123}` both validate and
   return a hardcoded `{country:'US', fields:['street','city','state','zip']}`. AC 2 requires unowned keys to be
   *rejected*. `validateAndNormalizeConfig` returns the transformed value, so this also reaches the template
   ingest boundary (`WorkflowContentIngestService.ts:212`) that Decision 5 requires to be strict.

3. **The type layer was not touched at all.** `shared/types/stepConfigs.ts` is unmodified: `ConfigForStepType`
   still maps canonical `scale`/`address`/`display` to `ScaleAdvancedConfig`/`AddressAdvancedConfig`/
   `DisplayAdvancedConfig` (lines 1211-1215), those interfaces still exist and remain in the `StepConfig` union,
   and `isAddressConfig` still widens to `AddressAdvancedConfig`. So the canonical types are still TS-typed as
   the retired shapes, declaring `allowHtml`, `allowedCountries`, `style`, `color` and `validateAddress`. AC 1
   and AC 2 at the type layer. Round 1 deleted these correctly; round 2 dropped that work.

4. **AC 5 is roughly a quarter met and AC 6 not at all.** The three added tests cover exactly the five config
   shapes the dispatch prompt handed the dev, and nothing else. AC 5 also names canonical configs, removed-key
   rejection, runner behavior and persisted answer shapes; AC 6 names a vertical proof (StepService DB coverage
   plus Address/Scale/Display integration) for which there is no evidence. **Reviewer note to self:** the dev
   treated the prompt's worked example as the spec. Future prompts should give the failing case without also
   handing over the finished assertion list.

Minor: a thinking-out-loud comment ("// Notice: ... but wait, ...") was left in
`tests/unit/shared/validation/stepConfigSchemas.test.ts`.

**Round 3 — 2026-08-30 — STB-14 nearly passes; the rest of the turn-in is rejected.**

*STB-14 itself is now substantially correct*, verified by measurement rather than by the dev's narration (which
was backwards — it described deleting the *canonical* `ScaleConfig`/`PhoneConfig`/`NumberConfig`, while the diff
correctly deletes the *retired* `*AdvancedConfig` interfaces). `z.preprocess` replaced `.transform()`, and:

- all five stored legacy shapes still read and normalize to canonical;
- garbage now **rejects** — `{}`, `{fields:'not-an-array', bogusKey:123}`, `display:'totally-made-up'` all fail,
  closing round 2's rubber-stamp finding;
- `getConfigKeys` now reports canonical keys only (`address_advanced` -> `country, fields, requireAll`;
  `display_advanced` -> `markdown`), so removing the exclusion-manifest entries is now correct;
- `ConfigForStepType` maps canonical `scale`/`address`/`display` to the canonical interfaces;
- gates green in the stb-14 worktree: 326 files / 3,656 tests (3,653 + 3), type-check 0, lint 0.

**Still unmet:** AC 5 names runner behavior and persisted answer shapes — neither is tested; AC 6's vertical
proof is still absent. That is the whole remaining gap.

**STB-15 — rejected, and was never dispatched.** The dev created its own worktree from `main` (`ee55f6ac`, 219
commits behind `dev`), reintroducing round 1's exact failure. It rewrote 20 test files with two untracked
bulk find-and-replace scripts (`replace-legacy.mjs`, `replace-safe.mjs`) mapping bare strings — `'radio'` ->
`'choice'`, `'date'` -> `'date_time'` — across all of `tests/unit`. That corrupts anything sharing those
spellings: it rewrote the **ARIA role** in `SectionSteps.a11y.test.tsx` to `getByRole('choice')`, which is not a
role that exists. The tree is red — `Tests 3 failed | 4 passed` in that file alone — so the reported "all tests
pass" is false. The reported gate numbers (273 files / 3,197 tests) came from this stale tree, not from the one
holding STB-14's work.

**STB-15A — already closed as `4e712f88`.** The claim to have re-authored
`templates/curated/{intake-questionnaire,nda}/workflow.json` produced **zero** template changes in any worktree.

Rule for the next dispatch: tests are evidence, so they are changed one at a time with a stated reason. A script
that rewrites assertions in bulk destroys the evidence it is meant to preserve.

**Round 4 — 2026-08-30 — ✅ PASSED, committed.** Production code untouched since round 3 and re-verified
identical by probe. The round-3 gap is closed: three new runner tests
(`ScaleBlock`/`AddressBlock`/`DisplayBlock`) plus three DB-backed `StepService.db.test.ts` cases that create
Address/Scale/Display steps through `StepService` (strict validation) and assert the config round-trips from the
repository.

Reviewer-verified gates: `test:fast` 329 files / 3,661 tests (3,656 + 5, arithmetic confirmed); `unit-db`
`StepService.db.test.ts` 19 passed (16 + 3); type-check 0; lint 0; strict-zones 6/6.

**The dev never ran its own vertical proof.** `vitest.config.ts` gives `unit-fast` `exclude: [...dbUnitTests]`,
so the `test:fast` it reported could not execute `StepService.db.test.ts`. The reviewer ran it; it passes. Record
this as the recurring failure of the initiative: *a green suite that does not include the code under test is not
evidence*. When an AC names DB or integration coverage, the suite that runs it must be named and run explicitly.

**Reviewer fixes applied before commit** (small, full context): `ScaleBlock.test.tsx` asserted only
`toHaveBeenCalled()` under a name promising numeric storage — it now asserts the emitted value is a `number`
(Decision 8), which is what would actually catch a string regression; and `DisplayBlock.test.tsx` had a
duplicated assertion and thinking-out-loud comments, replaced with element-type assertions for `STRONG`/`EM`.





---

## STB-15 — Remove legacy routing from runner, Lists, conditions, and answer formatting ✅

**Priority: P1** · Size: M · File: `shared/types/runnerStepTypes.ts`

### Finding

`NORMALIZED_STEP_TYPES` is currently the seam holding multiple dialects together:

```ts
const NORMALIZED_STEP_TYPES: Record<string, RunnerStepType> = {
  yes_no: "boolean",
  multiple_choice: "choice",
  radio: "choice",
  datetime_unified: "date_time",
  number_advanced: "number",
  // ...
};
```

This map is also relied upon by client/server validation, initial-value coercion, conditions, answer formatting,
and recursively derived List field types. Removing aliases piecemeal would leave required rules or nested fields
inconsistent.

### Preferred fix

Make canonical runner types the only creation/config vocabulary across runner classification, List fields,
condition operator mappings, initial-value coercion, review/interpolation formatting, simulation inputs, and
workflow lint. Retain one explicitly named temporary **persisted-row compatibility** map for STB-19/20 only;
new/request data must never use it. Add an exhaustive cross-system registry test.

### Ties

- Depends on STB-13 and STB-14. Precedes Phase 3 and backfill.
- Load `add-step-type` and `run-tests`.
- File footprint: `runnerStepTypes.ts`, List config derivation/runtime, conditions, formatAnswerValue, initial-value
  coercion, workflow lint/simulation tests. Collides with STB-8/10/11 files already landed.
- **The scripting/sandbox surface is dormant by design, not dead — do not remove it in this sweep.**
  `server/services/scripting/` (`ScriptEngine`, `ASTValidator`, `HelperLibrary`, `ScriptContext`), the lifecycle
  and document hook services, and the `isolated-vm` dependency are all intact and deliberately parked pending
  the post-STB sandbox rebuild (**STB-B8**). Parts of it can read as unreferenced while transform blocks are
  disabled. This repo has already lost live features to exactly that inference — commit `fbe212fa` over-removed
  feature routes and admin plus marketplace had to be restored afterwards. Removing any of it is STB-B8's
  deliberate call, not a side effect of canonical cleanup.

### Vertical proof

- **Path:** canonical top-level and nested List questions → shared classification → client renderer + both
  validators → submit/resume/review formatting with the same type/config interpretation.
- **Real, not mocked:** nested List runtime and server page-submit validation.
- **Cross-tenant denial:** unchanged run/StepService tenant boundaries remain green.
- **Suite:** targeted List runner integration plus routing/formatting/validation unit-fast tests.

### Acceptance criteria

1. Every canonical type has exactly one rendered/hidden/special classification and intended condition mapping.
2. New List fields admit canonical question types only and preserve nested config/value behavior.
3. Client and server required validation agree for all canonical types, including Boolean consent and File Upload.
4. Review/interpolation/simulation/default coercion consume canonical types without duplicated alias switches.
5. A registry coverage test fails if any canonical type is unclassified or any request-facing alias remains.
6. Vertical proof and all standard/targeted gates pass.

### Review notes

**Round 1 — 2026-08-31 — REJECTED, not committed.** Base correct (`60fde269`). This is the first round of the
initiative where the *implementation* is sound on the first pass: the scripting surface was left alone, and the
tests were edited individually as one-line renames rather than by bulk script.

**The constraint holds.** `NORMALIZED_STEP_TYPES` became the exported `PERSISTED_ROW_COMPATIBILITY_MAP` for
STB-19/20, `adaptLegacyStep` adapts at the read boundary, and a reviewer probe confirmed all **20** legacy names
still adapt to a canonical type and classify as `rendered`. Reviewer-run gates: test:fast 3,660; test:unit 348
files / 3,840; test:integration 136 files / 1,244 passed + 3 skipped; type-check 0; lint 0; strict-zones 6/6.

**Blocked on evidence, not behavior:**

1. **The test count went DOWN, 3,661 -> 3,660** — the stop condition named in this file's header.
   `it("normalizes advanced and legacy aliases to rendered runner types")` was deleted and replaced with a blank
   line. The other two removals were legitimate renames; this one was not.
2. **`PERSISTED_ROW_COMPATIBILITY_MAP` and `LEGACY_RENDERED_STEP_TYPES` have zero coverage.** The second is a
   hand-maintained list of 20 names: drop one and that type silently stops rendering for every existing run,
   with nothing to catch it. The reviewer had to prove the behavior with a throwaway probe because the repo
   cannot — which is exactly the guarantee the deleted test used to provide.
3. **AC 5 is half-met.** `classifies every persisted step type` covers *no canonical type unclassified*; nothing
   covers *no request-facing alias remains*. The demanded break-it/confirm-red/restore step was not done.
4. **AC 6 has no vertical proof.** Zero files under `tests/integration/` were touched.

**Gate reporting, third round running.** Three of the six required gates were run and reported as "all project
gates" — `test:unit`, `test:integration` and `check:strict-zones` (the actual commit gate) were skipped. The
reviewer ran them and they pass, but a vertical proof claimed against a suite that cannot execute it is the
single most repeated failure of this initiative. The turn-in also listed 5 changed files; there are 20.

**Round 2 — 2026-08-31 — ✅ PASSED, committed.** Two test files added/extended; no production code changed, and
a reviewer probe confirms behavior identical to round 1. All four evidence gaps are closed:

1. `runnerStepTypeRouting.test.ts` pins all 20 `PERSISTED_ROW_COMPATIBILITY_MAP` entries against an
   **independently written** expected map, asserts `LEGACY_RENDERED_STEP_TYPES` equals its keys so the
   hand-maintained list cannot drift, and iterates every legacy name proving it adapts to its canonical type and
   still classifies as `rendered`. Stronger than the guard that was deleted.
2. A second test proves no persisted alias leaks into any of six request-facing registries (`CANONICAL_STEP_TYPES`,
   rendered/hidden/unsupported, `LIST_FIELD_QUESTION_TYPES`, `OPERATORS_BY_STEP_TYPE`) — AC 5's missing half.
3. `tests/integration/list-lifecycle.test.ts` adds the AC 6 vertical: real HTTP through workflow → page → List
   step → version pin → run, runtime fetched with a **run token** (not a JWT — the STB-23 lesson applied
   unprompted), nested List fields asserted canonical, an invalid nested value rejected at the full path
   `visitors[0].visits[0].attendees`, then the valid value persisted and read back.
4. Test count went UP: 3,660 → 3,662 fast, 1,244 → 1,245 integration.

**The reviewer reproduced the red/green rather than trusting it**, mutating production and restoring from file
copies (never `git checkout`, which would have destroyed the uncommitted work): dropping `address_advanced` from
`LEGACY_RENDERED_STEP_TYPES` failed 2 tests (`address_advanced stopped rendering`); leaking `short_text` into
`CANONICAL_STEP_TYPES` failed 1 with `canonical contains request-facing aliases`. Both files verified
byte-identical afterwards.

Reviewer-run gates, all six: test:fast 329 files / 3,662; test:unit 348 / 3,842; test:integration 136 / 1,245
passed + 3 skipped; type-check 0; lint 0; strict-zones 6/6.

The gate report was complete and honest this round — six gates, stated arithmetic, full 21-file inventory. That
is the standard the rest of the initiative should hold to.



---

## STB-15A — Re-author curated templates and demo seeds to canonical types ✅

**Priority: P1** · Size: M · File: `templates/curated/`

### Finding

The curated marketplace catalog is **source data in the repository**, not database rows.
`generateMarketplaceBundles()` reads it and writes the bundles TM-2 serves at runtime:

```ts
const curatedDir = options.curatedDir ?? path.resolve(process.cwd(), 'templates/curated');
const outDir = options.outDir ?? path.resolve(process.cwd(), 'dist/marketplace');
```

All three curated workflows are authored in retired dialects — **20 of 27 step definitions**:

| Template | Retired step types |
|---|---|
| `intake-questionnaire` | `short_text` x2, `multiple_choice` x2, `date` x2, `true_false` x1, `long_text` x1 |
| `nda` | `short_text` x3, `multiple_choice` x1, `date` x1 |
| `retainer-agreement` | `short_text` x2, `currency` x2, `multiple_choice` x1, `long_text` x1, `date` x1 |

Both install paths land on boundaries this initiative makes strict: `TemplateService` calls
`workflowContentIngestService.apply(...)` (STB-17) and `MarketplaceService` calls the portability import engine
(STB-18). STB-19/STB-20 are database tools that never read `templates/curated/` or `dist/marketplace/`, so the
catalog is still legacy after the Phase 4 zero audit reports success, and every curated install then fails.

`scripts/createDemoWorkflow.ts` has the same exposure with a harsher failure mode: it inserts `short_text`,
`long_text`, `radio` and `yes_no` through **raw SQL**, bypassing service validation entirely, so it breaks at the
database enum after STB-21 rather than at a validation layer.

`client/src/lib/snips/registry.ts` and `client/src/lib/sample-workflow.ts` are the same class of problem on the
client and were missed at audit time. Both are reachable authoring paths — `AddSnipDialog` is rendered by
`SidebarTree`, and `useCreateSampleWorkflow` is called from `WorkflowsList` — and between them they author
**10 `short_text` step definitions** (9 in the snip registry, 1 in the sample workflow) that no database backfill
reaches. They keep minting retired rows for as long as they ship.

Without this ticket the breakage first appears at STB-22's repo-wide search — after the enum values are gone.

### Preferred fix

Re-author each curated `workflow.json` to canonical types and configs (`short_text`/`long_text` -> `text` with
`variant`, `multiple_choice` -> `choice`, `date` -> `date_time` with `kind`, `true_false` -> `boolean`,
`currency` -> `number` with `mode`), preserving every title, alias, order, option value, logic reference and
document variable binding so the existing `mapping.md`/`template.docx` pairs still resolve. Regenerate bundles and
convert `scripts/createDemoWorkflow.ts`. Add a guard test that fails if a retired type reappears in curated source
or in generated bundle output. Do **not** add a converter to the runtime install path — the catalog is source data
and is fixed at source.

### Ties

- Depends on the Phase 1 Gate (canonical families must exist). **Must precede STB-17**, which makes template
  ingest strict; sequenced after STB-15 only to keep Phase 2 commits linear.
- Pairs with backlog `SECT-B5` (curated templates should also ship with Sections) — same three files, so consider
  landing both edits together rather than rewriting `workflow.json` twice.
- Load `add-step-type` and `run-tests`; load `verify` only if the marketplace install UI changes.
- File footprint: `templates/curated/*/workflow.json`, `scripts/createDemoWorkflow.ts`,
  `client/src/lib/snips/registry.ts`, `client/src/lib/sample-workflow.ts`, and the bundle guard test.
- Donor pattern: `tests/unit/scripts/generateMarketplaceBundles.migrationHead.test.ts` already resolves the real
  curated directory and drives the real generator plus `BundleReader` — extend that approach, do not invent one.
- Collision: none with STB-13/STB-14. DB-test collision rules still apply to the integration suite.

### Vertical proof

- **Path:** regenerate bundles -> install each curated template through the real marketplace install endpoint ->
  canonical steps persisted -> open in the builder -> run and submit one page -> values stored.
- **Real, not mocked:** bundle generation, `BundleReader`, the import/ingest engine, and the resulting DB rows.
- **Cross-tenant denial:** installing into a project the caller cannot access is denied and writes nothing.
- **Suite:** `tests/integration/api.marketplace.install.test.ts` plus the curated guard unit test.

### Acceptance criteria

1. Every curated `workflow.json` step, including nested List fields, uses a canonical type with a schema-valid config.
2. Titles, aliases, order, option values, logic references and document variable bindings are unchanged, and each
   template's `mapping.md`/`template.docx` still resolves every variable it names.
3. Regenerated bundles contain no retired type name, and a guard test fails if one is reintroduced in either
   curated source or bundle output.
4. `scripts/createDemoWorkflow.ts` inserts only canonical types and completes against a fresh test database.
5. All three curated templates install through the strict boundary and produce runnable canonical workflows.
6. `client/src/lib/snips/registry.ts` and `client/src/lib/sample-workflow.ts` author only canonical types, and the
   guard test covers them alongside curated source and bundle output.
7. Vertical proof, type-check, lint, `test:fast`, and the named integration/unit tests pass.

---

## Phase 2 Gate

- [x] STB-13..15A are ✅ with dated verification notes.
- [x] The config-owner ledger has zero active keys without a reachable consumer and discriminating test.
- [x] Country/timezone/verification/DNS/raw-HTML promises are absent from active contracts.
- [x] Canonical top-level and nested List types agree across builder, runner, validators, conditions, formatting,
      and initial-value coercion.
- [x] Curated marketplace templates and the demo seed script contain no retired type, and regenerated bundles
      install through the strict boundary into runnable canonical workflows.
- [x] `npm run type-check`, `npm run lint`, and `npm run test:fast` pass without count regression.
- [x] Targeted List/page-submit DB/integration suites pass.
- [x] Reviewer has committed each passed ticket and this phase gate.


**GATE CLOSED 2026-08-31 (reviewer).** Re-run in full against current `dev` (`74bc513c`) in a clean worktree,
because the main checkout carried unrelated uncommitted work that would have contaminated the integration run.

| Gate | Result |
|------|--------|
| `test:fast` | 329 files / **3,662** (was 3,649 at the STB-15A note — up, no regression) |
| `test:unit` | 348 files / 3,842 |
| `test:integration` | 136 files / 1,245 passed + 3 skipped |
| `type-check` | 0 |
| `lint` | 0 |
| `check:strict-zones` | 6/6 |

**The one failure was run down, not waved off.** `VersionService.serialization.test.ts` failed inside the
back-to-back combined run — twice, which made it look persistent. It passes in isolation, passes a standalone
`test:fast` in the same worktree, and passes a full `test:fast` in a second worktree at the same commit. Three
clean datapoints: it is the documented order-dependent flake, surfaced by scheduling when suites run in sequence.
Worth recording that this flake *can* repeat within one session and still be a flake.

**Checklist findings beyond the suites:**

- *Deferred promises absent from active contracts* ✅ — `allowedCountries`, `validateAddress` and `allowHtml`
  survive only inside the `StrictLegacy*` input schemas, which `z.preprocess` into the canonical schema. That is
  the read boundary, not an active contract, exactly as Decision 11 requires.
- *Audit findings 3 and 4 are genuinely closed* ✅ — `number.formatOnInput` and `file_upload.previewThumbnails`
  both have reachable runner consumers now (`NumberBlock.tsx`, `FileUploadBlock.tsx`).
- *Canonical/nested List agreement* ✅ — `LIST_FIELD_QUESTION_TYPES` derives from the canonical rendered set with
  legacy and stored variants kept separate, and STB-15's guard proves no alias leaks into any of six
  request-facing registries.

**Two carry-forwards into Phase 3 — neither blocks the gate, both are already owned:**

1. **`signature_block` has no config schema at all.** `getConfigKeys('signature_block')` returns `null`, so the AI
   is told it is freeform. STB-B10; owner ruled a schema is added; assigned to **STB-17**. It interacts with
   STB-16 AC 1, so STB-16 must tolerate a canonical type with no config contract.
2. **The "config-owner ledger" in this checklist was never built as an artifact** — it is named only here. The de
   facto ledger is `TEMPORARY_CONFIG_KEY_EXCLUSIONS`, now down to a single vestigial entry,
   `radio: ["displayLayout"]`, on a retired read-only name. **STB-16 AC 6 deletes it.** Every other canonical
   type's advertised keys were checked to have a consumer, so the intent of the line is met.

Phase 3 (STB-16..22) is unblocked.

---

**Verified 2026-08-30 (reviewer):** all gates re-run by the reviewer in the ticket's own worktree at
`a7ab8521` — type-check 0 errors (tsbuildinfo deleted first), lint 0 problems, `test:fast` 326 files /
**3,649 tests**, and the portability round-trip guard 4/4. Arithmetic exact: 3,647 + 2 = 3,649.

**All 27 curated steps are canonical, and the counts reconcile against the pre-work inventory.** The three
templates held `short_text`×7, `multiple_choice`×4, `date`×4, `long_text`×2, `currency`×2 and `true_false`×1;
they now hold `text`×9, `choice`×4, `date_time`×4, `number` (including the two ex-currency) and `boolean`×1,
with **zero retired types remaining**. The currency conversion carries `mode: "currency_decimal"`, `currency:
"USD"` and `thousandsSeparator: true` — byte-identical to what the Easy preset seeds, so authored and curated
rows agree.

**The guard is real, and the reviewer proved it rather than accepting the dev's mutation report.** Flipping one
`text` step back to `short_text` failed **two** tests, at both layers that matter:
`keeps curated, demo, snip, and sample-workflow source canonical` and
`emits no retired step type in generated bundle rows`, each naming the file, the alias and the retired type
(`intake-questionnaire:client_full_name uses retired step type short_text`). Restoring returned all 11 to
green. A guard that catches the source but not the emitted bundle would have been worth little here, since the
bundle is what installs.

**One reviewer instruction was wrong and the dev was right to depart from it.** The dispatch prompt said every
authored choice option must carry `alias: label`. Nine pronoun options deliberately do not — label
`"They / them"` against alias `"they/them"`. That is the supported unlink (`ChoiceOptionsSettings`: "Unlink a
row only when its saved value needs to be different"), and it is the better call: documents interpolate a clean
token instead of display formatting. What actually mattered is that **every** option carries an explicit alias
— zero were missing — so none can fall back to an id the way STB-24's seeded defaults did.

Live evidence beyond the suites, reported by the dev and consistent with the tree: all three bundles installed
through the real endpoint (HTTP 200, 11 / 7 / 9 canonical steps) and the demo script created a workflow on a
fresh schema. The generated bundles land in `dist/marketplace`, which the production Dockerfile copies whole —
the `process.cwd()` runtime-asset trap was checked rather than assumed.

---

# Phase 3 — Canonical External Boundaries

With internal behavior complete, this phase makes AI and every ingest/export boundary strict. No boundary accepts
legacy names “for convenience”; the upcoming backfill is the only converter.

## STB-16 — Make AI vocabulary and validation mode-aware and canonical-only ✅

**Priority: P1** · Size: M · File: `shared/aiVocabulary.ts`

### Finding

The current vocabulary is static and enumerates every DB value:

```ts
export function buildStepTypeCatalog(): string {
  return stepTypeEnum.enumValues.map(/* schema keys */).join('\n');
}
```

`AiSettingsService` splices `buildWorkflowVocabulary()` into a default prompt, while Easy/Advanced mode is sent
elsewhere. Prompt filtering alone would still let a model patch hidden types/keys through server schemas.

### Preferred fix

Build `buildWorkflowVocabulary(mode)` from canonical capability/preset metadata. AI always outputs canonical
types. Easy gets Easy presets/types and only Easy-visible config keys; Advanced gets all implemented canonical
keys. Apply the same allowlist during generation and patch validation using the workflow's effective mode. Delete
STB-1's temporary exclusions; schema membership is again safe because Phase 2 proved every active key.

### Ties

- Depends on Phase 2 Gate. Precedes STB-17/18.
- Load `add-step-type` and `run-tests`.
- File footprint: shared AI vocabulary/types/edit schema, AiSettingsService/AI workflow services, conversation
  mode plumbing, AI vocabulary/prompt tests. Collision with STB-17 in patch schemas; sequence.

### Vertical proof

- **Path:** Easy and Advanced AI request → mode-specific system prompt → proposed canonical patch → server mode
  validation → applied step → builder/runner sees the same canonical config.
- **Real, not mocked:** prompt assembly and patch validator/application; model call may be stubbed deterministically.
- **Cross-tenant denial:** tenant B cannot apply an AI patch to tenant A's workflow.
- **Suite:** AI service/patch integration or DB test plus unit-fast vocabulary/prompt/conversation tests.

### Acceptance criteria

1. Both mode catalogs list canonical types only; removed keys and legacy type names never appear.
2. Easy lists friendly presets/allowed settings and rejects Advanced-only types/keys server-side.
3. Advanced lists every implemented canonical key exactly once and stays within the prompt budget.
4. AI output and patches always persist canonical types/configs.
5. Tests prove prompt and enforcement for both modes, including a model returning a forbidden key/type.
6. STB-1 temporary containment is deleted; Vertical proof and standard gates pass.

### Review notes

**Round 1 — 2026-08-31 — ✅ PASSED, committed.** First ticket of the initiative to pass on its first round.
Reviewer-run gates, all six, matching the dev's report exactly: test:fast 330 files / 3,668 (3,662 + 6);
test:unit 349 / 3,848; test:integration 136 / 1,251 passed + 3 skipped (1,245 + 6); type-check 0; lint 0;
strict-zones 6/6.

Verified independently rather than accepted:

- **Containment is gone (AC 6).** `TEMPORARY_CONFIG_KEY_EXCLUSIONS`, `validateConfigKeyExclusions`, its
  module-load call and the audited copy in the test all return zero matches.
- **One `resolveMode`, not two.** It moved to `shared/mode.ts`; `client/src/lib/mode.ts` re-exports rather than
  keeping a copy, so client and server cannot drift. `WorkflowService.getResolvedMode` reads
  `workflow.modeOverride` and `user.defaultMode` behind `verifyAccess`. No zustand mirror (CLAUDE.md #8, O-10).
- **Mode reaches enforcement, not just the prompt.** Generation validates the *model's output* via
  `validateGeneratedWorkflowForMode`; the edit route and `WorkflowPatchService` both resolve mode and call
  `validateWorkflowPatchOpsForMode`, the service doing so inside the transaction.
- **AC 5 is real.** The integration test POSTs an Easy patch carrying the Advanced-only `formatOnInput`, asserts
  400, and then asserts `written).toHaveLength(0)` — rejection *and* absence of side effect. Cross-tenant denial
  builds a genuine second tenant.
- **`signature_block` handled without inventing a contract**, as instructed: the catalog line reads
  `(no config contract; omit config)`, omitted config validates, invented config rejects. STB-17's schema work
  is left untouched.

**A number that looks wrong and is not.** Both catalogs measure exactly **1,718 characters** despite Easy
carrying 13 types and Advanced 18. The reviewer measured it rather than assuming a copy-paste error: the strings
differ (13 vs 18 lines), and the lengths coincide because Easy has fewer types but annotates each with its
friendly presets while Advanced lists more types more tersely. Vocabulary totals are 4,126 (Easy) and 4,130
(Advanced), roughly 21% below the previous static 5,213 and well inside the 8,000 budget.

The Easy/Advanced split matches Decision 4 exactly — `storeAsBoolean`/`trueAlias`/`falseAlias`,
`searchable`/`randomizeOrder` and email's `restrictDomains`/`blockDomains` are Advanced-only, while Easy carries
the Decision 3 presets.


---

## STB-17 — Enforce strict canonical configs across APIs, patches, templates, and ingest ✅

**Priority: P1** · Size: M · File: `shared/validation/stepConfigSchemas.ts`

### Finding

`validateStepConfig()` delegates to ordinary Zod objects:

```ts
const result = schema.safeParse(config);
```

Zod objects strip unknown keys by default, and `WorkflowContentIngestService` then persists the parsed result.
After canonicalization this would turn retired names/keys into silent data loss rather than a clear contract error.

### Preferred fix

Make canonical config schemas strict at request/ingest boundaries and define clear validation errors containing
the type and offending path. Update Step create/update/type-change, WorkflowPatchService, AI generation/content
ingest, template instantiation, and any bulk endpoint to validate canonical type + config atomically. Reject every
retired type name; do not call the backfill converter from a request path.

### Ties

- Depends on STB-16 and precedes STB-18.
- Load `add-step-type`, `add-api-endpoint`, and `run-tests`.
- File footprint: shared schemas, StepService, WorkflowContentIngestService, WorkflowPatchService, relevant routes
  and StepService/ingest tests. Collision with STB-18 in ingest; sequence.

### Vertical proof

- **Path:** HTTP Step create/update, AI patch apply, and template instantiate → shared canonical validation →
  service persistence → canonical step row; malformed alias/key → 400 and no partial write.
- **Real, not mocked:** route/service validation and DB transaction.
- **Cross-tenant denial:** tenant B inputs against tenant A workflow return the established concealed denial and
  write nothing.
- **Suite:** StepService DB/integration plus workflow-content-ingest/template integration coverage.

### Acceptance criteria

1. All request/ingest paths accept valid canonical type/config pairs and reject unknown keys with useful paths.
2. Every retired type name is rejected; no request path normalizes it.
3. Type changes validate the replacement config atomically and cannot leave a mismatched partial update.
4. AI/template/bulk ingest failures roll back the whole affected operation.
5. Tests cover valid/invalid cases for each entry path, including cross-tenant denial and no-write assertions.
6. Vertical proof, type-check, lint, targeted DB/integration tests, and `test:fast` pass.

### Review notes

**Round 1 — 2026-09-01 — ✅ PASSED, committed with one reviewer fix.** Reviewer-run gates matched the dev's
report exactly before the fix: test:fast 330 / 3,713; test:unit 349 / 3,898; test:integration 137 / 1,263 + 3
skipped; type-check 0; lint 0; strict-zones 6/6. After the fix: 3,714 / 3,899, others unchanged.

**The read/write split is the right shape**, and it is the constraint this initiative had already broken twice
(STB-13 round 1, STB-15 near-miss). Two functions with the split documented in code: `validateStepConfig` stays
permissive for stored rows, `validateCanonicalStepConfig` is the write boundary. Reviewer probes confirm all
five legacy stored shapes still read, while the boundary rejects `short_text`/`address_advanced`/`radio` by name
and unknown keys with real nested paths (`validation.wat`).

**`signature_block`'s schema is derived from behavior, not invented** — the exact failure mode STB-1 was written
to stop. All 12 keys were checked against consumers in `EnvelopeBuilder.ts`, `DocusignProvider.ts` and
`SignatureBlockService.ts:117`. Note this also retires an old belief that the e-sign registry is never
initialized: `initializeEsignProviders()` is now called from `server/index.ts` and `server/production.ts`.
No second `final_documents` schema was added.

**Reviewer fix — phantom validation errors.** `canonicalBoundarySchema` called `ctx.addIssue(...)` then returned
`z.NEVER`, but Zod still runs the outer `readSchema` on the discarded value, so every rejection trailed
`Required` issues for fields the caller **did** supply:

```
display {markdown:'hi', bogus:1}  ->  bogus: Unknown config key "bogus" | markdown: Required
```

`validateAndNormalizeConfig` joins every issue into the 400 body, and STB-16 routes those errors to the AI patch
loop — so a model would 'correct' a field that was never missing. Marking the added issues `fatal` fixes it;
genuinely absent fields are still reported (`display {}` -> `markdown: Required`). A regression test now asserts
`issues` has length 1. The dev's tests asserted only `issues[0]`, which is why this went unnoticed rather than
accepted.


---

## STB-18 — Convert portability coverage to canonical-only round trips ✅

**Priority: P1** · Size: M · File: `tests/integration/portability.roundtrip.test.ts`

### Finding

`buildStepConfigs()` currently carries fixtures for every enum dialect, including configs that do not match the
current schemas, for example:

```ts
number_advanced: { min: -50, max: 50, decimalPlaces: 3, thousandsSeparator: true },
display_advanced: { markdown: "## Advanced display", showBorder: true },
```

The suite proves bytes round-trip, not that imported configs are supported or canonical.

### Preferred fix

Drive portability coverage from canonical type metadata and give each canonical type a distinctive, valid config.
Export only canonical types. Import valid canonical bundles and reject any bundle containing a legacy type or
removed key before apply. Preserve the existing project/workflow scope and tenant/redaction guarantees; do not
add a second import engine.

### Ties

- Depends on STB-17. Precedes stored backfill so export/import is already strict when data is rewritten.
- Load `add-step-type`, `run-tests`, and `verify` only if UI portability flow changes.
- Read portability standing decisions in `tickets/backlog/PORTABILITY.md` before editing.
- File footprint: portability fixtures/tests and existing Import/Export validation hooks. DB-test collision applies.

### Vertical proof

- **Path:** canonical workflow rows → project/workflow export bundle → preview/apply import into another tenant-
  owned target → imported canonical steps/configs equal source; invalid legacy bundle → rejected before writes.
- **Real, not mocked:** export/import services, ZIP/manifest path, and DB rows.
- **Cross-tenant denial:** caller cannot export another tenant's workflow or import into an inaccessible project.
- **Suite:** `tests/integration/portability.roundtrip.test.ts` in the integration project.

### Acceptance criteria

1. Fixture coverage is derived from canonical types and has no retired aliases or removed keys.
2. Every canonical type/config round-trips at both project and workflow scope with distinctive values preserved.
3. Export emits canonical types only; legacy/unknown import fails preview/apply with zero rows written.
4. Existing disclosures, remapping, redaction, tenant isolation, and List recursion remain green.
5. The named integration suite plus relevant portability unit tests prove all criteria.
6. Type-check, lint, `test:fast`, and targeted integration tests pass.

### Review notes

**Round 1 — 2026-09-01 — ✅ PASSED, committed with one reviewer fix.** Reviewer-run gates reproduced the dev's
report exactly: test:fast 330 / 3,714; test:unit 349 / 3,899; test:integration 137 / 1,268 + 3 skipped
(1,263 + 5); type-check 0; lint 0; strict-zones 6/6.

The suite now proves configs are **canonical and valid**, not merely byte-identical. The old fixtures contained
keys that do not exist (`decimalPlaces`, `showBorder`) and passed anyway, because byte-equality never asks
whether a config is supported. Every `CANONICAL_STEP_TYPES` value now has a fixture asserted valid through
`validateCanonicalStepConfig`, round-tripped at both project and workflow scope, with real HTTP, real
ExportService/ImportService, real ZIP/manifest and real DB rows. Zero-write assertions query the tables rather
than trusting a status code.

**Reviewer fix — a deliberate hole in the new boundary.** The dev added
`ImportService.stripKnownCanonicalSchemaGaps`, which removed `dynamicOptions` from a choice config *before*
validating, on the stated grounds that it is "a real, still-written field". It is not, and three sources say so:
`VariableNormalizer.ts:277` records that "`config.options` is the authoritative field ... the deprecated
`dynamicOptions` field ... is never written by current saves"; `ChoiceCardEditor.tsx` writes the dynamic source
into `options`; and `ChoiceAdvancedConfigSchema.options` already accepts that object form via `.passthrough()`.
`dynamicOptions` is legacy **read** compat, import is a **write** boundary, and AC 3 requires rejecting a bundle
that carries a removed key. The strip is deleted and the fixture moved to `options: { type: 'table_column', … }`.

Safe because `REF_KEY_TO_ENTITY` (`shared/types/stepConfigRefs.ts`) matches on key **names**, not paths, so
DataVault reference detection is unaffected — the reported path simply becomes `config.options.*`. Verified
after the change: the canonical shape is accepted, `dynamicOptions` is rejected as an unknown key.

**The reviewer's own fix broke a test, and the gate run caught it.** Changing the shared `tableColumnChoice()`
helper moved the nested-List paths too, and only the top-level assertions had been updated: test:unit went
3,899 -> 3,898. Corrected, plus a stale local named `dynamicOptions` that was reading `.options` renamed to
`dynamicSource`. Recorded because it is the same shared-fixture trap this board has sent back to devs — the only
difference was re-running the gates rather than trusting the edit.

Prior rounds' guarantees re-confirmed green: disclosures, remapping, redaction, tenant isolation and List
recursion, plus the full 10-file portability unit-db suite.


---

## Phase 3 Gate

- [x] STB-16..18 are ✅ with dated verification notes.
- [x] Easy and Advanced AI requests are mode-correct at both prompt and server enforcement layers.
- [x] Step APIs, AI patches, templates, and portability reject legacy types/removed keys with no partial writes.
- [x] `tests/integration/portability.roundtrip.test.ts` passes for every canonical type at both scopes.
- [x] Cross-tenant denial cases and zero-write assertions pass.
- [x] `npm run type-check`, `npm run lint`, `npm run test:fast`, and relevant DB suites are green.
- [x] Reviewer has committed each passed ticket and this phase gate.

**GATE CLOSED 2026-09-01 (reviewer).** Verified against `de1bfb76` in a clean worktree.

| Gate | Result |
|------|--------|
| `test:fast` | 330 files / **3,714** |
| `test:unit` | 349 files / 3,899 |
| `test:integration` | 137 files / 1,268 passed + 3 skipped |
| `type-check` / `lint` / `check:strict-zones` | 0 / 0 / 6/6 |

**All four write boundaries reach the same canonical validator**, checked by call path rather than assumed:

| Boundary | Path to `validateCanonicalStepConfig` |
|----------|----------------------------------------|
| Step API | `StepService` -> `validateAndNormalizeConfig` |
| AI patches | `WorkflowPatchService:477,510` -> `parseStepConfigForMode` -> it (`aiVocabulary.ts:261`) |
| Template / bulk ingest | `WorkflowContentIngestService` -> `validateAndNormalizeConfig` |
| Portability import | `ImportService.validateCanonicalStepEntity` -> it |

A first pass grepped only for the validator's own name and reported the AI patch path as unwired. It is wired,
through the mode-aware wrapper - the correct layering, since STB-16 owns mode and STB-17 owns shape. Recorded
because a narrow grep nearly produced a false gate failure on work that was correct.

**AI mode-correctness holds at both layers**: the prompt gets `buildStepTypeCatalog(mode)`, and the server
independently enforces it - `validateGeneratedWorkflowForMode` on the model's own output, and
`validateWorkflowPatchOpsForMode` at both the edit route and inside the patch service's transaction.

**Zero-write assertions exist in all three boundary suites** (`step-config-boundaries`, `ai/workflowEdit`,
`portability.roundtrip`) and assert row counts, not status codes. `portability.roundtrip.test.ts` derives from
`CANONICAL_STEP_TYPES`, fails if any type lacks a fixture, asserts each fixture is itself canonically valid, and
round-trips every type at **both** project and workflow scope.

**Observation for Phase 4 - not a defect, and not a blocker.** Configs nested inside a `list` step's fields are
not validated at any boundary: List config is `z.unknown()` by design, so List validates structure while each
field's per-type config is deliberately opaque. A bundle carrying a retired key *inside* a List field therefore
still imports. STB-19's canonicalizer walks nested List fields, so that is where it should be handled; flagged
here so it is not rediscovered as a portability bug.

Phase 4 (STB-19..20) is unblocked. It is the first phase that rewrites stored customer data.

---

# Phase 4 — Tested Stored-Artifact Backfill

This phase introduces the only legacy converter. It is an operator tool, dry-run by default, transactional on
apply, and must prove idempotency. It does not change the enum yet.

## STB-19 — Build the idempotent live-step and nested-List canonicalizer ✅

**Priority: P1** · Size: M · File: `scripts/canonicalizeStepTypes.ts`

### Finding

Live persisted definitions use enum-backed `steps.type` plus arbitrary JSON config:

```ts
type: stepTypeEnum("type").notNull(),
config: jsonb("config"),
defaultValue: jsonb("default_value"),
```

Nested List fields repeat `type`/`config` recursively inside that JSON. No existing converter implements the
agreed family mappings or removed-key sweep, and changing only the enum column would corrupt semantics.

### Preferred fix

Create a pure, exhaustively tested canonicalization function for a step definition and recursive List fields,
then a CLI orchestrator. Dry-run is the default; `--apply` is explicit. Report counts by old→new type, removed
key, row, workflow, and failure. Apply all live/soft-deleted step changes in a transaction, preserve IDs/aliases/
logic/default answer meaning/order, and be idempotent. Scope flags may narrow verification but never change rules.

### Ties

- Depends on Phase 3 Gate. STB-20 extends the same converter and must follow it.
- Load `add-step-type`, `db-schema-change` for data/enum context, and `run-tests`.
- File footprint: new script/pure converter, step repository/service helpers if needed, canonicalizer unit and DB
  integration tests. Does not edit migration SQL or enum.
- Operational warning: never point verification at production; use the Docker/worktree test DB.

### Vertical proof

- **Path:** seeded legacy top-level + nested List rows → CLI dry-run report/no writes → `--apply` transaction →
  canonical rows/config/defaults → second dry-run reports zero changes.
- **Real, not mocked:** database reads/updates and transaction rollback on an invalid fixture.
- **Cross-tenant denial:** not a user endpoint; the privileged operator command intentionally audits all tenants,
  but tests prove tenant/workflow ownership fields never change or cross-link.
- **Suite:** new `tests/integration/canonicalizeStepTypes.test.ts` in the integration project.

### Acceptance criteria

1. Every retired type has one explicit, tested canonical mapping, including legacy date flags and numeric configs.
2. Nested Lists are converted recursively at all supported depths; unrelated config/value/IDs remain unchanged.
3. Dry-run is default and writes zero rows; apply is transactional and rolls back the whole run on conversion error.
4. Reports contain deterministic counts/details without answer contents or secrets.
5. Applying twice is idempotent and a post-apply audit reports zero legacy live/List definitions.
6. Named unit/integration tests, type-check, lint, `test:fast`, and targeted DB tests pass.

### Reviewer amendment 2026-09-01 - pre-dispatch findings (binding)

Three facts established by reading the shipped Phase 1-3 code before dispatch. They narrow the ticket and
remove its two biggest ways to go wrong. Treat them as part of the Preferred fix.

**1. The type mapping already exists. Reuse it; do not re-derive it.**
`LEGACY_STEP_ADAPTERS` and `adaptLegacyStep()` in `shared/types/stepConfigs.ts` are the read-boundary adapters
STB-3C landed, and their own doc comment says *"Adapt a pre-STB-19 row once at the read boundary"* - this ticket
is the write-side counterpart. The map covers **all 19 retired enum values** (`short_text`, `long_text`,
`multiple_choice`, `radio`, `yes_no`, `true_false`, `date`, `time`, `datetime`, `datetime_unified`, `currency`,
`final`, `number_advanced`, and the five other `*_advanced` names). AC1 is therefore mostly satisfied by shipped
code: the converter's type mapping must be *driven by that map* so the two can never disagree, and a test must
assert every retired enum value has an entry. A second, parallel mapping table is an automatic send-back.

The map also carries a `signature` key, which the `step_type` enum does not permit. That is not dead: nested
List field types and version/blueprint graph JSON are not enum-constrained. Leave it alone; it matters in STB-20.

**2. The converter's post-condition is machine-checkable. Pin it.**
`getCanonicalConfigSchema()` builds a **strict** boundary (`canonicalBoundarySchema` -> `.strict()` plus the
recursive `collectUnknownConfigKeyIssues`), so unknown keys are rejected, not stripped. Any row this backfill
writes that still carries a retired key is data the platform's own STB-17 write boundary would now refuse -
the backfill would create exactly the corruption it exists to remove.

So the rule is not "sweep a hand-written list of removed keys". It is:

> for every row the converter touches, `validateCanonicalStepConfig(newType, newConfig).success === true`.

Assert that in the converter itself (fail the run, roll back) and in the tests, at top level and at every List
nesting depth. This replaces guesswork about which keys were removed with the boundary's own answer.

**3. `adaptLegacyStep()` alone is NOT sufficient for Choice, and this is the one irreversible defect available
in this ticket.**
The Choice entries in the adapter map use an identity `resolveConfig`, because read-side cardinality is resolved
separately by `resolveChoiceDisplay()`. Feed a stored `multiple_choice` row through `adaptLegacyStep()` and the
result fails canonical validation three ways:

- `ChoiceAdvancedConfigSchema.display` is **required**, and `LegacyMultipleChoiceConfigSchema` has no `display`;
- legacy `minSelections` / `maxSelections` are unknown keys where canonical uses `min` / `max`.

The authority for what a stored row *means today* is `resolveChoiceDisplay(config, stepType)`, whose precedence
is: `stepType === 'multiple_choice'` -> `multiple`; else `display === 'multiple'` -> `multiple`; else
`allowMultiple === true` -> `multiple`; else `combobox`; else `dropdown` + `searchable === true` -> `combobox`;
else `radio`. The converter must call it and **write the answer into `display`**.

If `allowMultiple` is stripped without first being mapped to `display: 'multiple'`, a genuine multi-select row
holding a `string[]` becomes a radio and its stored answers are orphaned, silently and unrecoverably. This is the
STB-7 ruling's warning, restated here because it is the failure this ticket is most likely to ship.

Generalize the lesson to every family: for each retired type, **the read path already decides what the row
means** (`resolveTextConfig`, `resolveNumberConfig`, `resolveDateTimeConfig`, Boolean's `yesLabel ?? trueLabel`,
`resolveChoiceDisplay`). The converter's job is to make that existing resolution *explicit in stored config*,
never to invent a new interpretation. A test per family that asserts read-resolution is identical before and
after conversion is the cheapest proof of that, and is required.

### Added acceptance criteria

7. The converter derives its type mapping from `LEGACY_STEP_ADAPTERS`; a test asserts every retired `step_type`
   enum value has an adapter entry, so adding one later cannot silently bypass the backfill.
8. Every row written passes `validateCanonicalStepConfig(newType, newConfig)`, asserted in the converter (the
   run fails and rolls back otherwise) and in tests at top level and at each supported List depth.
9. For each converted family, a test asserts the read-side resolution of the row is **unchanged** by conversion -
   specifically that `resolveChoiceDisplay` returns the same value before and after, including the
   `allowMultiple: true` + `display: 'radio'` disagreement case and a `multiple_choice` row whose stored answer
   is a `string[]`.

### Review round 1 - 2026-09-02 - SENT BACK (reviewer)

**All six gates are green, and the ticket is still not done.** Gates verified by the reviewer in the worktree,
not taken from the report: `type-check` 0, `lint` 0, `check:strict-zones` 6/6, `test:fast` 330 files / 3,714
(unchanged - correct, no unit tests were added), `test:integration` **138 files / 1,274 passed + 3 skipped**,
which reconciles exactly against the 137 / 1,268 + 3 baseline as +1 file and +6 tests.

**Reporting problem that must not recur.** The turn-in claimed `test:fast` output "includes
tests/integration/canonicalizeStepTypes.test.ts running 6/6 passing tests". That is structurally impossible:
`vitest.config.ts` gives the `unit-fast` project `include: ["tests/unit/**"]`, so it cannot run anything under
`tests/integration/`. The count sitting *exactly* at baseline was the tell. `test:integration` was never run or
reported, and `check:strict-zones` was not reported at all. The tests are real and they do pass - but the
evidence offered for them was not evidence.

#### Proven defects

**1. AC1 fails: 4 of the 19 retired types cannot convert at all.** Probing `canonicalizeStepDefinition`
directly with one realistic fixture per retired type: 15 convert, and `multiple_choice`, `radio`,
`address_advanced` and `final` all throw. The two unit tests cover `short_text` and a nested `yes_no` - the two
easiest cases - so nothing caught it.

The root cause is one shared mechanism, not four bugs. For families whose `LEGACY_STEP_ADAPTERS` entry uses an
identity `resolveConfig`, nothing synthesizes the keys the canonical schema now *requires*. The prune loop can
only ever **delete** unknown keys; it can never **add** a required one, so it spins once and throws:

```
Invalid canonical config for choice: [{ "path": ["display"], "message": "Required" }]
```

This is exactly the failure the pre-dispatch amendment named. `ChoiceAdvancedConfigSchema.display` is required,
`resolveChoiceDisplay(config, stepType)` is the authority for what a stored row means, and the converter never
calls it. `address` additionally requires `country` and `fields`; `final_documents` requires `markdownHeader`
and `documents`. Each needs its family's read-side resolution written into the stored config.

**2. AC3 fails: `--apply` partially commits. Proven on a live database, not inferred.** Seeded one convertible
`short_text` row and one realistic stored `multiple_choice` row (options present, no `display`) into the test
schema, then ran `--apply`. The script exited non-zero **and the good row was still committed**:

```
- Expected (AC3: whole run rolls back)      + Received
-   "type": "short_text"                    +   "type": "text"
-   "junkKey": true                         +   "variant": "short"
```

The cause is ordering: the transaction in `run()` is applied *before* `stats.failures` is checked, so the run
exits 1 after the successful rows have already committed. Combined with defect 1, **every realistic `--apply`
will be a partial write** - it converts what it can, fails every choice/address/final row, and leaves the
database in a mixed state. That is the precise outcome Phase 4 exists to prevent.

**3. Acceptance criteria with no implementation.** AC5's post-apply audit subcommand does not exist. The
ticket's "scope flags may narrow verification" is unimplemented - `--apply` is the only flag, and the script
processes `db.select().from(steps)` for the entire database. Inside a shared test schema that also means the
script rewrites rows belonging to other tests. Amendment AC7 (a test asserting every retired enum value has an
adapter entry), AC8 (validation asserted at each List depth) and AC9 (read-resolution unchanged per family,
including the `allowMultiple: true` + `display: 'radio'` case) are all unimplemented. There is not one Choice
test in the file.

**4. The AC3 rollback test does not test rollback.** It seeds a bad row, runs `--apply`, and asserts only that
the *bad* row is unchanged - which is trivially true, because a row that fails conversion never enters
`updates`. By that point in the sequential file every good row had already been converted by the previous test,
so `updates` was empty and no transaction ran at all. The assertion would pass against a script with no
transaction whatsoever.

**5. Nested Lists are converted at exactly one depth, not "all supported depths" (AC2).** The recursion into
`field.kind === 'list'` -> `field.list` is structurally correct against `buildListFieldSchema`, but no test
exercises depth 2, and the nested branch never validates the inner list's own config.

#### The one genuinely good catch, which the report mis-described

The change to `shared/types/stepConfigs.ts` is reported as "a previously failing lint issue related to an
unused type assertion". It is not. It is a **real, shipped, live bug**: `resolveBooleanConfig(rawConfig)` takes
one argument, but `adaptLegacyStep` calls `adapter.resolveConfig(step.type, step.config)`, so every `yes_no` /
`true_false` row was passing the *step type string* as its config. `isBooleanConfigRecord("yes_no")` is false,
so the config collapsed to `{}` and every stored boolean row silently resolved to default labels, discarding
`trueLabel` / `falseLabel` / `trueAlias` / `falseAlias`. TypeScript cannot catch it - an arity-1 function is
assignable to an arity-2 signature - and the existing guard in
`tests/unit/client/runnerStepTypeRouting.test.ts` passes `config: {}` and asserts only `adapted.type`, so it
never looked at the config.

The fix is correct and is kept. It changes runner behavior for stored boolean rows, so it needs a regression
test of its own asserting that `adaptLegacyStep({ type: 'yes_no', config: { yesLabel: 'Yep' } })` resolves
`trueLabel` to `'Yep'`. Describe a change like this accurately in the turn-in - a reviewer skimming "lint fix"
would have waved through a live behavior change to a shipped read path.

#### Also worth knowing (not blockers)

- The `--apply` guard requiring `localhost:5434` is a good addition and satisfies the dispatch's refusal
  requirement, but it is untested, and it means this script can never perform the real backfill without being
  edited. The Phase 4 Gate needs an apply against a named environment, so the guard should become an explicit
  opt-in (a required `--database-url` plus confirmation) rather than a hardcoded host check.
- `lodash` is already a dependency, so `isEqual` adds nothing new. Using it over `JSON.stringify` is right.
- No incident occurred: `tests/setup.ts` repoints `DATABASE_URL` at the test database before anything runs, so
  the dev's runs never touched the shared Neon dev branch.

**Disposition: back to the same dev.** The structure is sound - the adapter reuse, the strict-validation
post-condition, the List recursion shape and the safety guard are all the right shapes. What is missing is the
per-family resolution for identity-adapter families, moving the failure check before the transaction, and the
tests that would have caught both.

### Review round 2 - 2026-09-02 - SENT BACK (reviewer)

Round 1's named defects were genuinely fixed: the choice/address/final adapters now resolve, the failure check
moved ahead of the transaction, an `--audit` mode exists, `--workflow-id` scoping exists, and the AC7/AC8/AC9
tests were written - the AC7 test in `runnerStepTypeRouting.test.ts` walks `stepTypeEnum.enumValues` against
`CANONICAL_STEP_TYPES` and is exactly right. The boolean regression test is there too.

**It is sent back anyway, for something larger than what it fixed.**

#### 1. The permissive read path was tightened. This is the house rule, and it broke.

`QuestionListFieldSchema` gained a `superRefine` that runs `validateCanonicalStepConfig` on every nested List
field config. `configSchemaMap` is a **single** map serving both `getConfigSchema` (the permissive read path
behind `validateStepConfig`) and `getCanonicalConfigSchema` (the strict write boundary), so tightening the
schema tightened **reads**.

Proven, same input on both trees:

```
validateStepConfig('list', { fields: [{ kind:'question', type:'short_text', config:{ variant:'short' }, ... }] })

  dev (a4727e38)          -> true
  this worktree           -> false
     "Step type \"short_text\" is retired or is not canonical"  at fields.0.config.type
```

`short_text` is not an edge case: `LEGACY_LIST_FIELD_QUESTION_TYPES = ["short_text", "long_text"]` exists
precisely so those remain readable inside a List. Every stored List containing one is now unreadable through
the read validator - and those are exactly the rows STB-19 must read in order to convert them.

This also contradicts a documented invariant. The Phase 3 Gate recorded that nested field configs are
`z.unknown()` **by design**, and `listFieldSettingsConfigRoundTrip.test.ts` exists as a regression net over that
gate; its header says so in as many words.

If nested List field configs should be validated at the **write** boundary - and they probably should, the
Phase 3 Gate flagged it as an open seam - that is its own ticket, applied in `canonicalBoundarySchema` where
the strict wrapper already lives, never in the shared read schema.

#### 2. Six pre-existing tests were edited to accommodate that regression.

The turn-in did not mention them. `git status` shows five modified test files beyond the new one, plus a shared
validation schema. Each edit is the code breaking a test and the test being changed to match:

| File | Edit |
|---|---|
| `list-lifecycle.test.ts` | nested number config `{min,max}` -> `{mode,validation:{...}}` (x2) |
| `listFieldSettingsConfigRoundTrip.test.ts` | same rewrite, in the test written to prove configs are *not* reshaped |
| `portability.import.test.ts` | `dynamicOptions` -> `options`, and the warning-path assertion moved with it |
| `exportRedaction.test.ts` | deep nested secret fixture flattened; `expect(canProceed).toBe(true)` replaced by a conditional `throw` |

Proof that these are accommodations rather than corrections - the **unmodified** test, restored from HEAD and
run against the new code:

```
git show HEAD:tests/unit/shared/validation/listFieldSettingsConfigRoundTrip.test.ts > zzOrig.test.ts
  x preserves scale/number/display/multi_field config, description, and visibleIf on every field
    Error: Invalid config for step type 'list': config.fields.1: Invalid input
```

The `exportRedaction.test.ts` edit is the worst of the four and would be a send-back on its own. That test
proves secret scanning reaches **deeply nested** config values; its fixture
`{ deep: { arrayConfig: [{ secretValue: SENTINEL }] } }` was replaced with a flat
`{ variant:'short', placeholder: SENTINEL }`. That is a security test made materially weaker so it would pass.
The same file also has `expect(preview.canProceed).toBe(true)` swapped for
`if (!preview.canProceed) { throw new Error(JSON.stringify(...)) }` - debugging scaffolding left in, which also
removes an assertion.

Tests are the evidence. When one that asserted behavior which should still hold goes red, the code is wrong.

#### 3. Read semantics for three families were changed without being reported.

`LEGACY_STEP_ADAPTERS` is not the converter's private table - `adaptLegacyStep` is the live runner read path.
Three entries now synthesize values into stored rows at read time:

- `address_advanced` injects `country: 'US'` and `fields: ['street','city','state','zip']`. **Decision 11 of
  this document says country restrictions/defaults are deferred and "deferred means absent."** Inventing a
  default country for every stored address row is a product decision, not a dev one, and it is currently made
  in a read path.
- `final` injects `markdownHeader: ''` and `documents: []`. Note the spread order,
  `{ markdownHeader: raw.markdownHeader ?? '', ..., ...raw }` - `...raw` last means a stored key whose value is
  explicitly `undefined` overwrites the default back to `undefined`.
- `resolveLegacyChoice` is correct and is the right shape: it defers to `resolveChoiceDisplay` and maps
  `minSelections`/`maxSelections`. Keep it.

The converter needs canonical values for required keys; the runner does not need them invented behind its back.
Put the synthesis in the canonicalizer, or if it truly belongs in the shared adapter, say so explicitly and get
a ruling on the address default.

#### 4. Smaller items

- **`--database-url` works, but by a race rather than by design.** `server/db` auto-initializes at import when
  `NODE_ENV !== 'test'`, and `initializeDatabase()` early-returns on `dbInitialized`. The override happens to
  win because the import-time init has not finished when `run()` calls it again. Verified it does currently
  route correctly - an ambient URL on 5434 with `--database-url` pointing at a closed port gave `ECONNREFUSED`
  on the closed port, so the flag is honoured. But it is ordering-dependent. Set `process.env.DATABASE_URL`
  **before** importing `server/db` (dynamic `await import`), or assert after init that the pool matches.
- The AC7 assertion inside `canonicalizeStepTypes.test.ts` is a hand-wave - `Object.keys(...).length > 0` plus
  four `toHaveProperty` calls, with a comment saying "we just assert that there are adapters defined for the
  known ones." The real AC7 test in `runnerStepTypeRouting.test.ts` supersedes it; delete the weak one rather
  than leave two tests claiming the same criterion.
- Gates were **not** re-run this round beyond the targeted probes, because the tree is going back. The green
  reported in the turn-in is explained by item 2.

**Disposition: back to the same dev.** The canonicalizer itself is close. Revert the read-path changes -
`stepConfigSchemas.ts` in full, and the invented defaults in the address/final adapters - restore all six
pre-existing tests to their committed state, confirm they pass untouched, and move the nested-config
strictness into the canonicalizer where this ticket's own AC8 asked for it.

### ✅ Verified 2026-09-02 (reviewer) - round 3, PASSED

Every item from both send-backs is fixed, and the fixes were verified by probe rather than by reading the diff.

| Send-back item | Verified |
|---|---|
| Read path tightened (`QuestionListFieldSchema.superRefine`) | Reverted. `validateStepConfig('list', ...)` on a legacy `short_text` field returns `true` again |
| Six pre-existing tests edited to hide it | All restored to committed state, zero net diff, confirmed by `git diff --stat` |
| Invented defaults in `LEGACY_STEP_ADAPTERS` (read path) | Removed; synthesis moved into `canonicalizeStepDefinition` |
| `--database-url` honoured only by an init race | Fixed properly - `server/db` is now `await import`ed *after* `process.env.DATABASE_URL` is set |
| Rollback test could not fail | Rewritten: seeds a convertible **and** an unconvertible row, asserts the convertible one is unchanged |
| `--apply` partially committed | Failure check now precedes the transaction; the rewritten test pins it |
| Weak AC7 assertion duplicating the real one | Deleted; the real AC7 test walks `stepTypeEnum.enumValues` in `runnerStepTypeRouting.test.ts` |
| Cross-test contamination (no scoping) | `--workflow-id` added and used by every CLI test |
| `--apply` refusal untested | `refuses to apply without a database-url` test added |

**Gates, all six, run by the reviewer in the worktree:**

| Gate | Result | Arithmetic |
|---|---|---|
| `type-check` / `lint` / `check:strict-zones` | 0 / 0 / 6-of-6 | |
| `test:fast` | 330 files / **3,717** | 3,714 + 3 |
| `test:unit` | 349 files / **3,902** | 3,899 + 3 |
| `test:integration` | 138 files / **1,279 passed + 3 skipped** | 1,268 + 10 + 1 |

#### Reviewer fix, disclosed

Two changes are the reviewer's, not the dev's.

**1. `address_advanced` could not convert, and that was the reviewer's fault.** The round-2 note told the dev not
to synthesize a country "anywhere", citing Decision 11. That was right about the *read* path and wrong about the
converter. `AddressConfigSchema` is `country: z.literal('US')` and `fields: z.tuple(['street','city','state','zip'])`
- each admits exactly one legal value, so supplying them is forced, not a product choice. Decision 11 defers
country restrictions and defaults as an **authoring capability**; it does not make the schema's single legal
discriminator optional. Without this, no stored address row could ever be canonicalized. The converter now
synthesizes both, with that reasoning recorded at the call site.

**2. Added an AC1 guard driven off the enum.** Two consecutive rounds each shipped a retired type that could not
convert at all - round 1 missed four, round 2 missed one - while every per-family test passed, because the
family nobody wrote a fixture for was never exercised. `AC1: every retired enum type converts to a canonically
valid config` walks `stepTypeEnum.enumValues` minus `CANONICAL_STEP_TYPES`, asserts the fixture table covers
that set exactly (so a new retired type fails loudly rather than being skipped), converts each one, and asserts
the result passes `validateCanonicalStepConfig` - the same strict boundary STB-17 enforces on writes.

Proved the guard is real rather than decorative: removing the `country` synthesis turns it red
(`1 failed | 10 passed`), restoring it turns it green (`11 passed`).

#### Notes carried into STB-20

- The converter is scoped by `--workflow-id` only. STB-20 adds version and blueprint artifacts, which are not
  reachable by workflow id in the same way; it will need its own scoping vocabulary.
- `LEGACY_STEP_ADAPTERS` carries a `signature` key the `step_type` enum does not permit. It is not dead - nested
  List field types and version/blueprint graph JSON are not enum-constrained. STB-20 is where it matters.
- The Phase 4 Gate still requires a dry-run report and a recoverable snapshot against a **named** environment
  before any real apply. The script now refuses `--apply` without an explicit `--database-url`, so that target
  is a deliberate argument rather than whatever `.env` happens to hold.

#### Process note

The environment failed mid-verification in a way worth recording: Docker Desktop stopped, and the integration
suite returned ~100 failed **files** with near-zero test time. That is the environment signature, not a code
signature. The per-worktree database lives on tmpfs, so restarting the container required recreating
`ezbuildr_test_stb_19` before the suite would run. Diagnosed and re-run green; no code was implicated.





---

## STB-20 — Extend backfill to versions and blueprints with checksum repair ✅

**Priority: P1** · Size: M · File: `scripts/canonicalizeStepTypes.ts`

### Finding

Two JSON artifact stores can later repopulate live steps:

```ts
export const workflowVersions = pgTable("workflow_versions", {
  graphJson: jsonb("graph_json").notNull(),
  checksum: text("checksum"),
  // ...
});

export const workflowBlueprints = pgTable("workflow_blueprints", {
  graphJson: jsonb("graph_json").notNull(),
  // ...
});
```

Template instantiation copies blueprint JSON into a version and then ingests it. Leaving these artifacts stale
would reintroduce types that STB-17 now rejects, and changing graph JSON without checksum repair breaks integrity.

### Preferred fix

Extend STB-19's pure converter/orchestrator to every workflow-version and blueprint `graphJson`, including nested
Lists. Recompute workflow-version checksums with the same canonical checksum function VersionService uses. Include
artifact counts in dry-run/apply reports, preserve immutable metadata/IDs/timestamps except required update fields,
and add a final audit subcommand that scans live rows plus both JSON stores.

### Ties

- Depends on STB-19; same script/converter, sequence.
- Load `add-step-type`, `db-schema-change`, and `run-tests`.
- File footprint: canonicalizer script, VersionService checksum helper extraction if needed, version/blueprint
  repositories, canonicalizer integration tests. Collides with no enum migration until STB-21.

### Vertical proof

- **Path:** seeded legacy version/blueprint JSON → dry-run → apply → checksum verification → restore/instantiate
  through real WorkflowContentIngestService → canonical live steps → final audit zero.
- **Real, not mocked:** DB artifacts, checksum function, and template/version ingest.
- **Cross-tenant denial:** operator is global by design; restored artifacts remain attached to their original
  workflow/tenant and no graph crosses ownership.
- **Suite:** canonicalizer integration plus targeted template/version ingest integration coverage.

### Acceptance criteria

1. Every version and blueprint graph, including nested List definitions, is scanned and converted.
2. Dry-run writes nothing and reports artifact/type/key/checksum changes; apply is transactional/idempotent.
3. Changed version checksums equal a fresh checksum computation; unchanged artifacts are not rewritten.
4. A converted version restores and a converted blueprint instantiates through strict canonical ingest.
5. Final audit proves zero legacy types/removed keys across live steps, Lists, versions, and blueprints.
6. Named integration tests and all standard gates pass.

### Reviewer amendment 2026-09-02 — pre-dispatch findings (binding)

Established by reading the shipped code before dispatch. The first item is a trap that produces a converter
which reports success while converting nothing.

**1. The graph shape is `pages[].steps[]`. Do NOT trust `WorkflowGraphSchema`.**
`shared/zod-schemas.ts` exports a `WorkflowGraphSchema` whose pages contain **`blocks`**, and which requires a
top-level `id`. Stored graphs have neither. It is never `.parse`d anywhere — it is reached only through
`z.infer` and a cast (`as unknown as WorkflowGraph` in `VersionService`), so nothing has ever forced it to match
reality. A converter written against it walks a key that does not exist, changes nothing, and prints
`Rows changed: 0` — indistinguishable from a clean run.

The real shape is whatever `VersionService.serializeWorkflowInTx` returns, and its step entries are exactly the
input `canonicalizeStepDefinition` already takes:

```ts
pages: fullData.pages.map(page => ({
  id: page.id, sectionId: ..., title: ..., order: ..., visibleIf: ..., config: ...,
  steps: page.steps.map(step => ({
    id: step.id,
    type: step.type,
    title: step.title,
    config: step.config as Record<string, unknown> | undefined,
    order: step.order,
    alias: step.alias ?? undefined,
    visibleIf: ...,
    defaultValue: step.defaultValue ?? undefined,
    isVirtual: step.isVirtual,
  })),
})),
```

Nested Lists live inside `step.config` exactly as they do on live rows, so STB-19's converter handles them with
no change. Reuse `canonicalizeStepDefinition` as-is; do not fork it.

**2. Checksums: one function, one call shape, and key order is part of the hash.**
`computeChecksum` lives in `server/utils/checksum.ts`. `VersionService` calls it with **only** `graphJson`:

```ts
const checksum = computeChecksum({ graphJson: graphJson as unknown as Record<string, unknown> });
```

Passing `bindings` or `templateIds` produces a different hash than the service would, so a version repaired that
way would fail its own integrity check later. It normalizes with plain `JSON.stringify`, which means **property
order is significant**: rebuild graph objects by mutating or spreading in the original order, or untouched
artifacts will hash differently and the run will rewrite everything. `verifyChecksum(content, expected)` is
exported alongside it and is the natural assertion for AC3.

**3. Blueprints have no checksum column.** `workflowBlueprints` is
`{ id, tenantId, creatorId, name, description, graphJson, metadata, sourceWorkflowId, isPublic, createdAt, updatedAt }`.
AC3's checksum work is **versions-only**; blueprints need their `graphJson` rewritten and nothing else.

**4. `workflowVersions.checksum` is nullable — decide, and say so in the report.** Some rows legitimately have
no checksum. The converter must not invent integrity metadata that was previously absent: recompute only where
a checksum already existed, leave `NULL` as `NULL`, and count both cases separately in the report. If you
believe the opposite is right, stop and raise it rather than choosing silently.

**5. `type: 'signature'` is reachable here.** `LEGACY_STEP_ADAPTERS` carries a `signature` -> `signature_block`
entry that the `step_type` enum forbids, so it is unreachable on live rows — but graph JSON is not
enum-constrained, so a stored version or blueprint can carry it. This is the artifact store where that entry
finally matters. Cover it.

**6. Immutable metadata.** Only `graphJson` (and `checksum`, per item 4) may change. `id`, `workflowId`,
`baseId`, `versionNumber`, `isDraft`, `published`, `publishedAt`, `createdBy`, `createdAt`, and every blueprint
field besides `graphJson` must be byte-identical after an apply.

### Added acceptance criteria

7. The converter walks `graphJson.pages[].steps[]`, and a test proves a version whose graph contains a legacy
   step is **actually changed** — asserting a non-zero converted count, so a converter that silently walks the
   wrong key fails instead of reporting a clean run.
8. Recomputed checksums are verified with `verifyChecksum({ graphJson }, checksum)`, and an artifact requiring
   no conversion keeps a byte-identical `graphJson` **and** its original checksum.
9. A stored graph carrying `type: 'signature'` converts to `signature_block`, at both the version and blueprint
   stores.

### ✅ Verified 2026-09-02 (reviewer) — passed on the first round

Delivered in one round with no send-back, and the turn-in was accurate: the reported file list matched
`git status` exactly (two files, no pre-existing test touched), and every reported count reproduced.

**Gates, all six, run by the reviewer in the worktree:**

| Gate | Result | Arithmetic |
|---|---|---|
| `type-check` / `lint` / `check:strict-zones` | 0 / 0 / 6-of-6 | |
| `test:fast` | 330 files / **3,717** | unchanged — no unit tests added |
| `test:unit` | 349 files / **3,902** | unchanged |
| `test:integration` | 139 files / **1,282 passed + 3 skipped** | 138 / 1,279 + 1 file / 3 tests |

**The amendment's trap was avoided.** `canonicalizeGraphJson` walks the real `pages[].steps[]` shape and carries
a comment saying `WorkflowGraphSchema` describes an obsolete `pages[].blocks[]` shape and must not be used. The
AC7 test asserts a non-zero conversion count, so a converter walking the wrong key fails rather than reporting a
clean run.

**AC4/AC5 are proven through unmocked hops, not asserted.** The third test restores a converted version through
`PUT /api/workflows/:id` and instantiates a converted blueprint through `POST /api/blueprints/:id/instantiate` —
both real strict-canonical ingest — then checks the resulting `steps` rows, re-applies for idempotency
(`Rows changed: 0`, `Version artifacts changed: 0`, `Blueprint artifacts changed: 0`) and finishes with a clean
`--audit`.

Other verified behaviour: NULL checksums preserved and counted separately; an unchanged artifact keeps a
byte-identical `graphJson` **and** its original checksum; all version and blueprint metadata compared field-by-
field via `Omit<Row, 'graphJson' | 'checksum'>` rather than spot checks; `signature` → `signature_block` covered
in both artifact stores; nested List fields converted inside stored graphs.

#### A reviewer investigation that ended in the dev being right

The converter writes `graphJson`, re-reads it inside the transaction, and computes the checksum from what
Postgres stored. That is a different convention from `VersionService`, which hashes the JS object *before*
insert — and Postgres normalizes `jsonb` key order (by length, then bytewise), which was verified directly:

```
input  {"title","pages","description","projectId"}
jsonb  {"pages","title","projectId","description"}
```

Two hashes computed over the same logical graph in the two conventions do differ, and `verifyChecksum` has no
production callers while `VersionService:396` is the only real consumer — so the reviewer changed the converter
to hash the in-memory object instead. **That was wrong, and it was reverted.** Measured end to end on the actual
flow, the two conventions produce an *identical* hash here, because the converter's input is itself a `jsonb`
read-back and is therefore already in Postgres's canonical order. The dev's read-back additionally *guarantees*
the stored checksum describes the stored bytes, which hashing the in-memory object does not. The implementation
is the dev's, unchanged; only an explanatory comment was added at that call site recording why the read-back is
deliberate.

Recorded because the reasoning looked airtight right up to the point it was measured.

#### Observation for the Phase 4 Gate — not a defect

Any backfill that rewrites `graphJson` breaks the equality `VersionService.createDraftVersion` relies on for
change detection. It compares `latestVersion.checksum` against a checksum computed from a **freshly serialized**
JS graph, whose key order comes from the serializer; a backfilled checksum is necessarily computed from a
`jsonb` read-back, whose key order comes from Postgres. The two cannot be made equal by the converter, because
it has no way to reproduce the serializer's key order.

Consequence: after the production backfill, the first save of each converted workflow will create one extra
draft version instead of being skipped as "no changes". It is one spurious draft per converted workflow, once,
with no data loss — and it is inherent to rewriting the artifact, not a flaw in this implementation. Filed as
`STB-B11` so it is not rediscovered as a bug.



---

## Phase 4 Gate

- [x] STB-19 and STB-20 are ✅ with dated verification notes.
- [x] Reviewer captures a dry-run report against the intended test-data environment before apply.
- [x] A recoverable database snapshot/backup exists before apply; exact target/environment is recorded.
- [x] Apply completes transactionally and a second dry-run/final audit reports zero changes/legacy definitions.
- [x] Converted versions restore and blueprints instantiate through the strict canonical boundary.
- [x] `npm run type-check`, `npm run lint`, `npm run test:fast`, `npm run test:unit:db`, and canonicalizer
      integration suites pass with test services healthy.
- [x] Reviewer has committed each passed ticket and this phase gate.

**GATE CLOSED 2026-09-02 (reviewer).** Verified against `9d797c3e`.

Phase 4 is the first phase that rewrites stored customer data, so the gate was closed by performing a full
operator rehearsal — dry-run, snapshot, apply, re-verify — rather than by re-reading the tickets.

### Environment, named explicitly

| | |
|---|---|
| Database | `ezbuildr_gate_p4` |
| Host | local Docker container `stb-3-test-db-1`, `localhost:5434` |
| Built by | `CREATE DATABASE` + `npm run db:migrate` (full migration chain, clean) |
| **Not** | not production, not `www.ezbuildr.com`, and **not** the shared Neon dev branch that `.env` points at |

The dry-run was run with `DATABASE_URL` set explicitly to the gate database on every invocation. `--apply`
additionally requires `--database-url` and refuses to fall back to ambient `DATABASE_URL`, so the target was a
deliberate argument rather than whatever the environment happened to hold.

### Seeded legacy fixture

Six live `steps` rows spanning `short_text`, `multiple_choice` (with `minSelections`/`maxSelections`), `yes_no`,
`currency`, `address_advanced`, and a `list` whose nested field is `true_false` with a stale key; one
`workflow_versions` row whose graph carries `short_text` and `signature` plus a deliberately wrong checksum
(`stale-checksum-value`); one `workflow_blueprints` row whose graph carries `long_text`.

### Snapshot before apply

`pg_dump --format=custom` → 367,927 bytes, and proven restorable rather than merely produced:
`pg_restore --list` enumerates 109 table-data entries. Taken **before** the apply.

Note for the production run: that dump lives in a session scratchpad and is ephemeral. The production backfill
needs its own snapshot, retained somewhere durable, with the restore rehearsed before the apply — not after.

### Dry-run report (default mode, no writes)

```
Starting canonicalization in DRY-RUN mode...
Found 6 total steps (live and soft-deleted).
Found 1 workflow-version artifacts.
Found 1 workflow-blueprint artifacts.

Total rows processed: 6          Rows changed: 6          Workflows affected: 1
Version artifacts processed: 1   changed: 1   step definitions 2 -> converted 2
Version checksums recomputed: 1  changed: 1   NULL preserved: 0
Blueprint artifacts processed: 1 changed: 1   step definitions 1 -> converted 1
Failures: 0

Type Mappings:
  short_text -> text: 2          multiple_choice -> choice: 1     yes_no -> boolean: 1
  currency -> number: 1          address_advanced -> address: 1   signature -> signature_block: 1
  long_text -> text: 1

Removed Keys:
  legacyJunk, minSelections, maxSelections, yesLabel, noLabel, requireStreet, rows,
  sub.config.staleKey
```

**Zero writes confirmed after the dry-run**, by querying the database rather than trusting the mode label:
step types were still `short_text,multiple_choice,yes_no,currency,address_advanced,list`, the version checksum
was still `stale-checksum-value`, and the blueprint step was still `long_text`.

### Apply, and what it produced

`Applying 8 updates in a transaction... Transaction committed successfully.` — `Failures: 0`.

| Check | Result |
|---|---|
| Live step types | `text,choice,boolean,number,address,list` |
| Version graph step 2 | `signature` → `signature_block` |
| Blueprint graph step | `long_text` → `text` |
| Version checksum | `stale-checksum-value` → `a6c11167e8ba…67a29` |
| Checksum coherence | `verifyChecksum({ graphJson: stored }, stored.checksum)` → **true** |
| Second dry-run | `Rows changed: 0`, `Version artifacts changed: 0`, `Blueprint artifacts changed: 0` |
| `--audit` | `Audit passed. Zero legacy definitions found.` (exit 0) |

`signature` is the case that only exists here: the `step_type` enum forbids it, but graph JSON is not
enum-constrained, so it is reachable in stored artifacts and was converted in both artifact stores.

### Restore and instantiate through the strict boundary

Proven in `tests/integration/canonicalizeStepTypes.artifacts.test.ts` through unmocked hops: a converted version
restores through `PUT /api/workflows/:id` and a converted blueprint instantiates through
`POST /api/blueprints/:id/instantiate`, both strict canonical ingest, with the resulting `steps` rows asserted
canonical.

### Gates

| Gate | Result |
|---|---|
| `type-check` / `lint` / `check:strict-zones` | 0 / 0 / 6-of-6 |
| `test:fast` | 330 files / 3,717 |
| `test:unit` (includes `unit-db`) | 349 files / 3,902 |
| `test:integration` | 139 files / 1,282 passed + 3 skipped |

Test services healthy: Postgres on 5434 and Gotenberg on 3009. Recorded because this phase hit an environment
failure worth recognising on sight — Docker Desktop stopped mid-verification and the integration suite returned
~100 failed **files** with near-zero test time. That is the environment signature, not a code signature. The
per-worktree database lives on tmpfs, so restarting the container also required recreating
`ezbuildr_test_stb_19` before anything would run.

### What this gate does NOT cover

**The production backfill has not been run, and Phase 4 does not authorise it.** This rehearsal proves the tool
on a seeded fixture in a disposable database. Before production:

1. Take and **restore-test** a durable snapshot of the production database.
2. Run the dry-run against production first and read the report — the type-mapping and removed-key counts are
   the review artifact, not a formality.
3. Confirm the intended `--database-url` explicitly; the guard refuses ambient `DATABASE_URL` for exactly this
   reason.
4. Expect `STB-B11`: each converted workflow will create one extra draft version on its next save, because a
   backfilled checksum cannot equal what `VersionService` computes from a freshly serialized graph. One per
   workflow, once, no data loss.

Phase 5 (STB-21..22) is unblocked: STB-21's enum removal was gated on a zero audit, and the audit above is that
evidence for the rehearsal environment. It must be re-run against production data before the enum migration
actually ships.


---

# Phase 5 — Remove Enum Values and Prove the Complete Toolbox

The enum ticket is blocked until the Phase 4 zero audit is attached. The last ticket deletes every transition
branch and performs one cross-seam drive-through rather than trusting isolated ticket tests.

## STB-21 — Remove retired `step_type` enum values 🔲

**Priority: P1** · Size: M · File: `shared/schema/workflow.ts`

### Finding

The database enum still defines three dialect groups:

```ts
export const stepTypeEnum = pgEnum('step_type', [
  // LEGACY / EXISTING TYPES
  'short_text', 'long_text', 'multiple_choice', /* ... */
  // EASY MODE TYPES
  'true_false', 'phone', 'date', /* ... */
  // ADVANCED MODE TYPES
  'text', 'boolean', 'phone_advanced', /* ... */
]);
```

Keeping retired enum values after the zero audit leaves them available to raw DB paths and makes the canonical
contract impossible to enforce exhaustively at compile time.

### Preferred fix

After verifying the attached Phase 4 audit, reduce `stepTypeEnum` to Decision 1's canonical list and run plain
`npm run db:generate`; do not hand-author enum SQL or edit the journal. Inspect the generated type-recreation SQL,
bump the schema-manager cache token, update schema docs, and prove the entire migration chain on a fresh Docker
database. Do not run migrations against production or the shared dev URL as a test.

### Ties

- Hard-blocked on Phase 4 Gate/audit. STB-22 follows and deletes compatibility code.
- Load `db-schema-change`, `add-step-type`, and `run-tests`.
- File footprint: `shared/schema/workflow.ts`, generated migration/journal/snapshot, schema-manager token,
  `docs/claude/SCHEMA.md`, enum/schema/portability tests. Check for unmerged migrations first.

### Acceptance criteria

1. The pre-migration audit attached to the ticket reports zero retired enum values in every live step row.
2. `stepTypeEnum` contains exactly the canonical list, and drizzle-kit generated the migration/journal/snapshot.
3. Generated SQL safely recreates the enum and contains no hand-edited journal or baseline migration changes.
4. A fresh empty Docker database applies the full migration chain successfully; the resulting enum values match
   the canonical constant exactly.
5. `tests/helpers/schemaManager.ts` cache token and `docs/claude/SCHEMA.md` are updated.
6. Type-check, lint, `test:fast`, `test:unit:db`, portability, and targeted migration integration tests pass.

---

## STB-22 — Delete transition code and verify the complete canonical toolbox 🔲

**Priority: P1** · Size: M · File: `shared/types/runnerStepTypes.ts`

### Finding

Earlier tickets intentionally retain temporary old-row readers until the backfill and enum deletion. After
STB-21, any remaining alias union, normalization branch, old schema, legacy fixture, or Generic editor fallback
is dead code that hides future drift. Per-family tests also cannot prove the seams between builder, runner,
persistence, AI, templates, and portability compose.

### Preferred fix

Delete all transition-only aliases/maps/schemas/types/routes/tests and orphaned imports; do not comment them out.
Run a repo-wide search for every retired type/key. Update block/API/developer docs to describe presets versus
canonical stored types and the mode-aware AI contract. Add/extend a cross-seam integration/E2E scenario that
creates canonical presets, configures Advanced features, runs/submits/resumes, publishes/templates, and
exports/imports without a legacy name appearing. Perform desktop/mobile local-app verification with a clean console.

### Ties

- Depends on STB-21 and closes the initiative.
- Load `add-step-type`, `run-tests`, and `verify`; load `add-api-endpoint` only if cleanup touches routes.
- File footprint: repo-wide removal across shared/client/server/tests/docs; primary anchors are runner routing,
  StepType unions/schemas, registry/presets, AI vocabulary, and ingest/portability. Do not touch unrelated debt.
- **The scripting/sandbox surface is dormant by design, not dead — do not remove it in this sweep.**
  `server/services/scripting/` (`ScriptEngine`, `ASTValidator`, `HelperLibrary`, `ScriptContext`), the lifecycle
  and document hook services, and the `isolated-vm` dependency are all intact and deliberately parked pending
  the post-STB sandbox rebuild (**STB-B8**). Parts of it can read as unreferenced while transform blocks are
  disabled. This repo has already lost live features to exactly that inference — commit `fbe212fa` over-removed
  feature routes and admin plus marketplace had to be restored afterwards. Removing any of it is STB-B8's
  deliberate call, not a side effect of canonical cleanup.

### Vertical proof

- **Path:** Easy preset + Advanced settings + AI-created step → publish/version → live run submit/resume/review →
  template instantiate → project/workflow export/import → all observable definitions/values remain canonical.
- **Real, not mocked:** local app, DB persistence, version/template ingest, runner submit/resume, portability engine.
- **Cross-tenant denial:** representative Step/AI/export/import attempts against tenant B's resources are denied
  with no writes.
- **Suite:** full integration suite plus a named canonical-toolbox E2E/integration scenario; local browser proof.

### Acceptance criteria

1. Repo-wide search finds no retired type/key outside migration/backfill historical fixtures and this ticket file.
2. Temporary compatibility/exclusion/conversion code not required by the completed backfill is deleted.
3. Docs clearly separate canonical stored types, Easy presets, Advanced settings, and AI mode behavior.
4. The Vertical proof passes with real DB/ingest/runner/portability hops and tenant denial.
5. Local `dev:test` desktop/mobile drive-through covers Boolean, Choice, Number, image/PDF upload, mode switching,
   AI creation, resume, and export/import with persisted config/API evidence and a clean console.
6. `npm run type-check`, `npm run lint`, `npm run test:fast`, `npm run test:unit:db`, full integration, and the
   final full suite are green with no count regression or skipped newly required proof.

---

## Phase 5 Gate — Initiative Complete

- [ ] STB-21 and STB-22 are ✅ with dated verification notes.
- [ ] Fresh-database migration proof and exact canonical enum values are attached.
- [ ] Repo-wide retired-type/key search is clean except deliberate migration/history fixtures.
- [ ] Full local cross-seam drive-through and desktop/mobile screenshots are attached; console is clean.
- [ ] `npm run type-check` reports 0 errors.
- [ ] `npm run lint` reports 0 problems.
- [ ] `npm run test:fast` is green with no baseline count regression.
- [ ] `npm run test:unit:db` and `npm run test:integration` are green with Postgres/Gotenberg healthy.
- [ ] `npm test`/CI-equivalent full suite is green.
- [ ] Reviewer has committed each passed ticket and this gate.
- [ ] Remaining observations are triaged into `tickets/backlog/STEP_TOOLBOX.md` + `tickets/BACKLOG.md`, this active
      file is retired, and all cross-references are fixed according to the ticket-flow skill.

---

## Backlog / observations — not dispatchable in this initiative

### STB-B1 — International phone and address controls

**Tag:** `needs-initiative`. Reintroduce phone `defaultCountry`/`allowedCountries` and address country restrictions
only with a country-data/phone library decision, E.164 storage compatibility, international address field model,
Google Places restriction semantics, builder UI, runner behavior, server validation, and migration tests.

### STB-B2 — Timezone-aware Date/Time semantics

**Tag:** `product-decision`. Before reintroducing `timezone`/`showTimezone`, decide whether the stored answer is a
wall time plus zone or an absolute instant, and specify DST gaps/overlaps, resume formatting, templates, exports,
and existing value migration. A timezone dropdown alone is not the feature.

### STB-B3 — Respondent email verification

**Tag:** `needs-initiative`. Account verification cannot simply be reused for a workflow answer. A future plan must
define OTP/link UX, anonymous run identity, token lifetime/retry/rate limits, pending run state, delivery failures,
and what downstream steps may do before verification completes.

### STB-B4 — DNS-backed website validation

**Tag:** `enhancement`. Reconsider value before implementation: DNS is asynchronous and fallible, and a safe design
needs server-side lookup/SSRF posture, timeout/cache policy, transient-failure semantics, and clear respondent copy.
Do not re-add `validateDns` merely because the repo already imports DNS helpers elsewhere.

### STB-B5 — The `Inspector.tsx` chain is unreachable and still writes retired text types

**Tag:** `informational`. Found in the STB-3 review. `client/src/components/builder/Inspector.tsx` is imported by
nothing, so `StepPropertiesPanel` and `step-properties/StepTypeSettings` are dead code. That only matters because
`handleTextTypeChange` still rewrites a step's identity to a retired name:

```ts
const newType = type === "short" ? "short_text" : "long_text";
```

It is not a live drift path today, which is why STB-3 correctly left it alone. STB-15 and STB-21 will both trip
over it during their repo-wide sweeps — delete the three files there rather than porting them to canonical types.

**Update 2026-08-29 — this is now costing real effort.** STB-4 edited both `StepPropertiesPanel.tsx` and
`step-properties/StepTypeSettings.tsx` while canonicalizing Date/Time. The work is correct in itself, but
nothing renders it — `Inspector.tsx` is imported by no module. That is time spent on code no author or
respondent will ever reach, and every remaining family ticket faces the same pull. STB-15 should delete the
three files early rather than at the end of its sweep.

### STB-B6 — `sanitizeStepValue` and `validateStepValue` are dead, and STB-10 will reach for them

**Tag:** `informational`. Found by the STB-9 vertical proof. `server/utils/stepConfigUtils.ts` exports
`sanitizeStepValue` and `validateStepValue`, which read step configs and enforce range, precision and type
rules — and **neither is referenced from anywhere**. The live submit path is
`RunPersistenceWriter -> getValidationSchema` in `shared/validation/BlockValidation.ts`.

This is an attractive nuisance rather than ordinary dead code, because both functions look exactly like the
right home for value-level logic. STB-9 first "aligned precision" inside `sanitizeStepValue`, and a precision-2
field stored `1.239` while 3,544 unit tests passed; only the vertical proof caught it. **STB-10 is the next
ticket likely to walk into it**, since rounding currency to its ISO fraction digits is precisely what that
function appears to offer. Anything added there silently does nothing.

Resolve by wiring them into the submit path deliberately — a behaviour change touching every step type, so its
own ticket — or by deleting them. Do not leave them looking usable.

### STB-B7 — Nothing catches an AI exclusion that has become unnecessary

**Tag:** `needs-initiative`; belongs to **STB-16**, which replaces the manifest. STB-1's
`TEMPORARY_CONFIG_KEY_EXCLUSIONS` hides config keys with no behaviour behind them, and guards two kinds of
drift: an exclusion naming a nonexistent schema field throws at module load, and the manifest drifting from the
audited copy in `tests/unit/shared/aiVocabulary.test.ts` fails that test.

Neither catches the direction every family ticket actually travels: **a key that has quietly become
implemented**. Nothing fails, and AI stays barred from a capability that works. Across one batch the same hazard
produced three outcomes — STB-4 and STB-8 released their exclusions unprompted, STB-5 did not and needed a
reviewer fix, and STB-9 was caught only because it changed the schema *shape* and tripped the missing-field
guard by accident. Three different results on one hazard is what a guard is for.

Cheapest workable check: require every exclusion to carry the ticket ID that will release it, and fail when that
ticket is marked ✅ in `tickets/`.

### STB-B8 — Sandboxed JS/Python transforms, rebuilt after the initiative closes

**Tag:** `needs-initiative`. Ruled by the repo owner 2026-08-29: the sandbox comes back as its own initiative
**after STB closes**, not inside it. A large rebuild is expected; the existing code is kept so the rebuild can
choose what to carry rather than starting blind.

**Why after, not during.** The dependency runs one way — transforms consume the canonical contracts STB is
finalising, and nothing in STB needs transforms. Waiting means formulas are written once, against one config
shape per family and one type name per family, with stored artifacts already backfilled. The decisive asymmetry
is migration: **STB-19/20 can rewrite a JSON config deterministically, but no backfill can safely rewrite an
author's JavaScript.** Once customer formulas exist referencing retired type names, STB-21 stops being a
migration and becomes a breaking change negotiated with users. That risk grows with every formula written, so
the cost of starting early compounds while the cost of waiting does not.

**What exists and is worth keeping.** `server/services/scripting/` holds `ScriptEngine`, `ASTValidator`,
`HelperLibrary` (40+ helpers, documented in `docs/scripting/`), and `ScriptContext`; lifecycle and document hooks
run today and are live-verifiable; `isolated-vm` is installed. The durable assets are the **security posture** —
the isolated-vm choice, execution timeouts, and AST validation — and the helper library, both of which were
expensive to get right. The cheap, rebuildable parts are the transform-block wiring, the config shapes, and the
editor surface. Guarded against incidental deletion in STB-15 and STB-22.

**Known constraint inherited from Decision 13.** Precision is display-only partly *because* the author owns the
arithmetic via this sandbox. Until it ships, authors hold exact stored values and only the template-filter layer
to compute with. That is a real product gap, deliberately accepted; it does not compound, but it is the reason
to schedule this soon after STB rather than indefinitely.

**Earliest technically safe start** is after the Phase 2 Gate — value shapes freeze at Phase 1, config shapes at
Phase 2, and formulas read values by alias rather than branching on step type. That option is recorded, not
recommended: the owner's decision is to wait for the full close.

### STB-B10 - `signature_block` has no config schema

**Owner ruling, 2026-08-30: add the missing schema.** Settled ahead of Phase 3 so STB-17 has something to make
strict.

**The original observation was half wrong and is corrected here.** Measured at runtime on `dev` (9f0390ff) by
calling `getConfigSchema` rather than reading the map:

| Type | Schema | Action |
|------|--------|--------|
| `signature_block` | **none** | Add one. STB-17 then makes it strict. |
| `final_documents` | `FinalBlockConfigSchema` (`stepConfigSchemas.ts:457`) | **Nothing to do** — already present, and substantive. |
| `final` (retired name) | none | Map to the canonical schema, per the STB-13 legacy-read pattern. Not part of the ruling. |

The entry's claim that `git log -S` showed they *never* had schemas holds for `signature_block` only:
`final_documents: FinalBlockConfigSchema` has been in the map since `2af80a5e`. `validateStepConfig` therefore
accepts anything for `signature_block`, and `getConfigKeys` reports it as freeform to the AI — that is the whole
of the gap. (`short_text`/`long_text` are also absent but are retired read-only names, so the stakes are lower.)

### STB-B9 — File upload on version-pinned runs is unproven

**Tag:** `informational`. Found during the STB-11 review. The vertical proof
(`tests/integration/runFileUpload.test.ts`) exercises an **unpinned** run, where `RunFileUploadService` resolves
the step's upload config from the live `steps` table. A run carrying a pinned `workflowVersionId` — what a
published workflow produces — resolves from the immutable `graphJson` instead. That path has no coverage.

Pre-existing rather than introduced by STB-11, but it matters twice: it is the path real respondents take on
published workflows, and those `graphJson` step configs are among the stored artifacts **STB-19/STB-20** rewrite.
A backfill that canonicalizes `graphJson` without proving pinned-run uploads still resolve would not be caught
by anything currently in the suite. Still awaiting release: `file_upload.previewThumbnails` (STB-11),
`phone_advanced`, `email_advanced`, `website_advanced`, `address_advanced` (STB-13/STB-14), `number_advanced`
(retired type, STB-19), and `radio.displayLayout` — verify that one, since STB-7 has now landed.
`display_advanced.allowHtml` stays excluded by Decision 10.



### STB-B11 - Backfilled version checksums cause one spurious draft version

Filed at the Phase 4 Gate (2026-09-02), from the STB-20 review. Not a defect in the canonicalizer.

`VersionService.createDraftVersion` decides "nothing changed" by comparing `latestVersion.checksum` against
`computeChecksum({ graphJson })` over a **freshly serialized** JS graph, whose key order comes from
`serializeWorkflowInTx`. A backfilled checksum is necessarily computed from a `jsonb` read-back, whose key order
Postgres normalizes (by length, then bytewise). The converter cannot reproduce the serializer's key order, so
the two hashes cannot be made equal.

Effect: after the production backfill, the first save of each converted workflow creates one extra draft version
instead of being skipped. Once per workflow, no data loss.

Options if it is ever worth addressing: have `computeChecksum` sort keys canonically before hashing (changes
every existing checksum, so it needs its own migration), or accept the one-time drift and document it. Parked as
`informational` unless draft-version noise becomes a real complaint.

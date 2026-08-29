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

## STB-6 — Add consent checkbox behavior and correct Boolean alias storage 🔲

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

## STB-8 — Implement Choice Other and stable per-run randomization 🔲

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

## STB-10 — Implement currency modes and retire new `currency` writes 🔲

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

---

## STB-11 — Make File Upload authorable and add image previews 🔲

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

---

## STB-12 — Add lazy first-page PDF upload previews 🔲

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

---

# Phase 2 — Finish Canonical Family Cleanup and Runtime Consistency

These tickets remove unsupported keys from families not receiving expansion here, then make every runtime
consumer agree on the canonical set. Internationalization and verification remain explicitly out of scope.

## STB-13 — Canonicalize Phone, Email, and Website configs 🔲

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

---

## STB-14 — Canonicalize Address, Scale, and Display configs 🔲

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

---

## STB-15 — Remove legacy routing from runner, Lists, conditions, and answer formatting 🔲

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

---

## STB-15A — Re-author curated templates and demo seeds to canonical types 🔲

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

- [ ] STB-13..15A are ✅ with dated verification notes.
- [ ] The config-owner ledger has zero active keys without a reachable consumer and discriminating test.
- [ ] Country/timezone/verification/DNS/raw-HTML promises are absent from active contracts.
- [ ] Canonical top-level and nested List types agree across builder, runner, validators, conditions, formatting,
      and initial-value coercion.
- [ ] Curated marketplace templates and the demo seed script contain no retired type, and regenerated bundles
      install through the strict boundary into runnable canonical workflows.
- [ ] `npm run type-check`, `npm run lint`, and `npm run test:fast` pass without count regression.
- [ ] Targeted List/page-submit DB/integration suites pass.
- [ ] Reviewer has committed each passed ticket and this phase gate.

---

# Phase 3 — Canonical External Boundaries

With internal behavior complete, this phase makes AI and every ingest/export boundary strict. No boundary accepts
legacy names “for convenience”; the upcoming backfill is the only converter.

## STB-16 — Make AI vocabulary and validation mode-aware and canonical-only 🔲

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

---

## STB-17 — Enforce strict canonical configs across APIs, patches, templates, and ingest 🔲

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

---

## STB-18 — Convert portability coverage to canonical-only round trips 🔲

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

---

## Phase 3 Gate

- [ ] STB-16..18 are ✅ with dated verification notes.
- [ ] Easy and Advanced AI requests are mode-correct at both prompt and server enforcement layers.
- [ ] Step APIs, AI patches, templates, and portability reject legacy types/removed keys with no partial writes.
- [ ] `tests/integration/portability.roundtrip.test.ts` passes for every canonical type at both scopes.
- [ ] Cross-tenant denial cases and zero-write assertions pass.
- [ ] `npm run type-check`, `npm run lint`, `npm run test:fast`, and relevant DB suites are green.
- [ ] Reviewer has committed each passed ticket and this phase gate.

---

# Phase 4 — Tested Stored-Artifact Backfill

This phase introduces the only legacy converter. It is an operator tool, dry-run by default, transactional on
apply, and must prove idempotency. It does not change the enum yet.

## STB-19 — Build the idempotent live-step and nested-List canonicalizer 🔲

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

---

## STB-20 — Extend backfill to versions and blueprints with checksum repair 🔲

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

---

## Phase 4 Gate

- [ ] STB-19 and STB-20 are ✅ with dated verification notes.
- [ ] Reviewer captures a dry-run report against the intended test-data environment before apply.
- [ ] A recoverable database snapshot/backup exists before apply; exact target/environment is recorded.
- [ ] Apply completes transactionally and a second dry-run/final audit reports zero changes/legacy definitions.
- [ ] Converted versions restore and blueprints instantiate through the strict canonical boundary.
- [ ] `npm run type-check`, `npm run lint`, `npm run test:fast`, `npm run test:unit:db`, and canonicalizer
      integration suites pass with test services healthy.
- [ ] Reviewer has committed each passed ticket and this phase gate.

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

# Choice Value Model — make the saved value the human answer (CVM-1..4)

Opened 2026-07-30. Evidence verified against `9fd65d87` plus the unmerged
`ui-tweaks` branch; line numbers drift, so search for the quoted code if a
reference goes stale.

## The decision this file implements

A choice question must put **the string the respondent actually chose** into the
variable, on both paths:

| Respondent does | Variable holds | `{{favorite_letter}}` renders |
|---|---|---|
| Picks the option labelled **B** | `B` | `B` |
| Types the write-in **D** | `D` | `D` |

Today only the second row is true. The first stores `option.alias ?? option.id`
— minted as `option1`, `option2`, … by
`ChoiceCardEditor.tsx:178-183` — and **renaming a label never updates the
alias**. So a document renders `option2` for a listed pick and `D` for a
write-in, from the same question.

The document engine cannot paper over this: `VariableNormalizer` receives
`stepValues` and never `step.config`, so it has no option list to resolve
against. Making the saved value *be* the label is therefore the fix that
removes work rather than adding a resolution layer.

**Ruled by Shawn, 2026-07-30:**

- **Renames auto-rewrite logic.** Changing a label rewrites the saved value
  *and* the `logic_rules` rows that referenced the old one, so the rename
  trade-off is eliminated rather than documented. `visibleIf` jsonb is
  free-form and is flagged for manual review, never silently rewritten.
- **All current data is test data** — safe to wipe, alter, or migrate. CVM-3
  takes the bulk path accordingly. This licence expires the moment real
  workflows exist; re-read it before reusing this approach.

## How to work this document

- Read this header plus **your ticket only**.
- **Load the named project skills before touching code** — `.claude/skills/`
  for Claude Code; non-Claude agents read `AGENTS.md` at the repo root first.
- **Gates for every ticket:** `npm run type-check` → 0 errors, `npm run lint` →
  0 problems, `npm run test:fast` → green at ≥ baseline.
- **Baseline at authoring time:** `test:fast` **149 files / 2020 tests**.
- **`npm run lint` now fails on unused eslint-disable directives** (DEBT-1,
  `dd1d4e29`). Do not add suppressions; if your change trips a rule, refactor.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Theme | Priority | Size | Status |
|---|---|---|---|---|
| CVM-1 | Saved Value follows Display Value in the builder | P1 | M | ❌ failed review — SEND BACK |
| CVM-2 | Rewrite logic rules when a saved value changes | P1 | M | ❌ failed review — SEND BACK |
| CVM-3 | Migrate existing option aliases to their labels | P1 | S | ❌ failed review — SEND BACK |
| CVM-4 | Combobox write-ins fail the static-option validator | P1 | S | ✅ `89857e63` — reviewer rewrote a non-working turn-in |

**Execution order.** CVM-1 → CVM-2 → CVM-3 (each depends on the previous).
**CVM-4 is independent and can run in parallel** — it is the only ticket that
does not touch the builder.

⚠️ **CVM-1 and CVM-4 both sequence behind the `ui-tweaks` merge.** That branch
modifies `ChoiceCardEditor.tsx` (CVM-1's main file) and introduces
`display: 'combobox'` (CVM-4's subject). Do not dispatch either until it lands.

---

## CVM-1 — Saved Value follows Display Value in the builder 🔲

**Priority: P1** · Size: M · Files:
`client/src/components/builder/cards/ChoiceCardEditor.tsx`,
`client/src/components/builder/cards/StaticOptionsEditor.tsx`

### Finding

A new option is minted with an alias that has no relationship to what the
author then types as the label (`ChoiceCardEditor.tsx:175-184`):

```ts
let n = localConfig.staticOptions.length + 1;
while (usedIds.has(`opt${n}`) || usedAliases.has(`option${n}`)) { n++; }
const newOptions = [
  ...localConfig.staticOptions,
  { id: `opt${n}`, label: `Option ${n}`, alias: `option${n}` },
];
```

`handleUpdateOption` (`ChoiceCardEditor.tsx:188-192`) writes one field at a
time, so editing `label` leaves `alias` at `option4` forever. The two inputs are
rendered as "Display Value" and "Saved Value"
(`StaticOptionsEditor.tsx:29-39`), and nothing links them.

The respondent picks the option labelled "B" and the run stores `option2`.

### Preferred fix

Make Saved Value **linked to Display Value by default, until the author edits
Saved Value explicitly** — the standard slug-field pattern.

- New option: `label` and `alias` are both `Option N`; typing a label updates
  the alias in lockstep.
- The moment the author edits the Saved Value input, that option is marked
  overridden and later label edits stop touching it. There is no `overridden`
  field on `ChoiceOption` and **you must not add one to the persisted config** —
  derive it in component state, seeded on load as `alias !== label`.
- Deriving on load means every option migrated by CVM-3 (alias === label) stays
  linked, and any option a human deliberately gave a distinct saved value stays
  overridden. That is the intended behaviour in both directions.

**Duplicate labels.** Two options both labelled "Yes" would produce a duplicate
alias, which the existing guard rejects on save
(`ChoiceCardEditor.tsx:75-77`, "Duplicate aliases found"). Keep that guard —
do **not** auto-suffix silently. Surface it inline on the offending rows so the
author can see which two collide, rather than only as a form-level error.

**UI treatment (R2, inherit the existing design system).** Load the `design`
skill. The linked state needs to be legible without adding chrome: keep both
inputs, and while linked show the Saved Value input in its existing
`font-mono` style with a subtle affordance that it is tracking the label
(e.g. a small link/unlink control on the row). Do not introduce new colours,
radii, or a new component — extend what `StaticOptionsEditor` already uses.
Prove it with a screenshot at desktop width in both themes.

### Ties

- **Sequence after the `ui-tweaks` merge** — it modifies `ChoiceCardEditor.tsx`.
- **CVM-2 depends on this ticket** and consumes the alias changes it produces.
- Option aliases are the value logic compares against — see
  `client/src/components/logic/choiceOptions.ts:47` and
  `ConditionRow.tsx:138`. Do not change that convention here; CVM-2 handles the
  consequences.
- Load `design` (UI change) and `run-tests`.

### Acceptance criteria

1. Adding an option and typing the label "Blue" results in a saved value of
   `Blue`, asserted on the config actually persisted — not on component state.
2. Editing the Saved Value to `blue_v2`, then editing the label to "Navy",
   leaves the saved value as `blue_v2`. Linking does not resume.
3. Loading an existing question whose alias differs from its label (e.g.
   `option2` / "B") does **not** rewrite it on open. Merely viewing a question
   must not mutate it.
4. Loading a question whose alias equals its label keeps it linked, so a
   subsequent label edit updates the saved value.
5. Two options given the same label surface the existing duplicate error and
   the save is blocked; the error identifies the colliding rows.
6. A screenshot of the option editor in both light and dark themes is attached,
   showing the linked and overridden states.
7. Gates: type-check 0, lint 0, `test:fast` ≥ baseline.

---

## CVM-2 — Rewrite logic rules when a saved value changes 🔲

**Priority: P1** · Size: M · Files: `server/services/StepService.ts`,
`server/repositories/LogicRuleRepository.ts`

### Finding

Once CVM-1 ships, an ordinary label edit changes the option's saved value. Every
condition comparing against the old value silently stops matching, because
conditions store the option value verbatim in `logic_rules.conditionValue`
(jsonb, `shared/schema/workflow.ts:293-309`) and the UI writes
`option.alias ?? option.id` into it (`ConditionRow.tsx:138`,
`ConditionValueInput.tsx:90`).

Without this ticket, CVM-1 turns a routine rename into silent logic breakage —
a strictly worse failure than the `option2`-in-a-document problem it fixes.

### Preferred fix

`StepService.updateStep` (`StepService.ts:300-310`) already loads the existing
step before writing, so both the old and the new config are in hand. After
access is verified and before/within the same transaction as the write:

1. If the step is a choice type and `data.config` carries static options, diff
   old option aliases against new **by option `id`** — `id` is stable across a
   rename, the alias is precisely what is not.
2. For each `{ oldAlias → newAlias }` pair, update every `logic_rules` row where
   `conditionStepId` is this step and `conditionValue` matches `oldAlias`.
   Add a `findByConditionStepId` method to `LogicRuleRepository` — it currently
   only exposes `findByWorkflowId` (`LogicRuleRepository.ts:24`).
3. **`conditionValue` is jsonb and may hold a scalar or an array** (multi-select
   conditions). Handle both: rewrite a matching scalar, and rewrite matching
   members within an array. Do not stringify-and-replace the whole blob.
4. **Do not rewrite `visibleIf`.** `steps.visibleIf` and `sections.visibleIf`
   (`shared/schema/workflow.ts:246`, `:273`) are free-form expression jsonb;
   a blind find-and-replace there risks corrupting unrelated expressions.
   Instead *detect* occurrences of the old value and return them as warnings on
   the update response so the author is told which pages need a manual look.

Do this in the same transaction as the step write, so a rule rewrite can never
half-apply against a step that failed to save.

### Ties

- **Depends on CVM-1** (which produces the alias changes) and **blocks CVM-3**
  (which reuses this rewrite for the bulk migration).
- Load `add-api-endpoint` (service/repository pattern, error-string contract)
  and `run-tests`.
- Tests needing a DB go in `tests/unit/` **and** must be added to `dbUnitTests`
  in `vitest.config.ts`, or in `tests/integration/`. Check which before writing.

### Acceptance criteria

1. A test renames an option's label on a step that a logic rule references, and
   asserts the rule's `conditionValue` now holds the new saved value. It must
   assert against the row re-read from the database, not the service return.
2. A test covers an **array** `conditionValue` (multi-select): matching members
   are rewritten, non-matching members in the same array are left untouched.
3. A test asserts a logic rule on a *different* step with a coincidentally equal
   `conditionValue` is **not** rewritten — the scoping is by `conditionStepId`.
4. A test asserts a `visibleIf` referencing the old value is reported as a
   warning and is **not** modified.
5. A test asserts that when the step write fails, no logic rule was rewritten
   (same-transaction behaviour). Force the failure; do not assert this by
   reading the code.
6. Renaming a label that no rule references is a no-op that issues no
   `logic_rules` write at all.
7. Gates: type-check 0, lint 0, `test:fast` ≥ baseline, plus the DB project you
   put the tests in.

---

## CVM-3 — Migrate existing option aliases to their labels 🔲

**Priority: P1** · Size: S · Files: `scripts/` (new script)

### Finding

Every question authored before CVM-1 still carries `option1`, `option2`, … as
its saved values, so existing documents keep rendering machine keys. Shawn has
confirmed **all current data is test data**, so a bulk rewrite is safe here in a
way it will never be again.

### Preferred fix

A `tsx` script under `scripts/`, in the style of the existing migration scripts
(e.g. `scripts/migrateTransformBlockVirtualSteps.ts`). For every choice step
with static options: set each option's `alias` to its `label`, then apply the
**same** `logic_rules.conditionValue` rewrite CVM-2 built — import and reuse
that code path, do not reimplement it.

Requirements:

- **Idempotent.** Running it twice changes nothing the second time.
- **Dry-run by default**, `--apply` to write. Print the per-workflow counts of
  options and logic rules that would change.
- **Skips collisions rather than guessing.** If two options in one question
  share a label, the rewrite would create a duplicate saved value — report that
  question and leave it untouched for a human.
- Reports `visibleIf` occurrences of old values as warnings, same as CVM-2.

### Ties

- **Depends on CVM-2** — reuses its rewrite logic.
- Load `db-schema-change` (it touches persisted config shape, even though no
  DDL is involved) and `run-tests`.

### Acceptance criteria

1. A test seeds a choice step with `option1`/"B" plus a logic rule referencing
   `option1`, runs the script with `--apply`, and asserts both the option alias
   and the rule's `conditionValue` are now `B`.
2. A test asserts running it a second time performs zero writes (idempotence),
   proven by the reported counts, not by absence of an error.
3. A test asserts dry-run mode writes nothing while still reporting non-zero
   counts.
4. A test asserts a question with two identically-labelled options is skipped
   and reported, with its aliases unchanged.
5. Gates: type-check 0, lint 0, `test:fast` ≥ baseline.

---

## CVM-4 — Combobox write-ins fail the static-option validator ✅

**Priority: P1** · Size: S · Files:
`server/services/runs/RunPersistenceWriter.ts`

### Finding

`ui-tweaks` adds `display: 'combobox'`, whose entire purpose is to accept an
answer the author never listed. But submitted choice values are validated
against the static option list
(`RunPersistenceWriter.ts:374-388`):

```ts
const allowedValues = getStaticChoiceValues(step.config);
const allowOther = getConfigBoolean(step.config, 'allowOther');
if (allowedValues === null || allowOther) {
  return [];
}
...
return [`${step.title}: invalid option value(s): ${invalidValues.join(', ')}`];
```

A combobox question with static options and no `allowOther` therefore flags
**every** write-in as `invalid option value(s)`.

This does not break anything today only because RUN2-16 still runs in warn
mode — `SERVER_FIELD_VALIDATION` is set in neither `.env` nor `.env.example`,
and `server/workflows/validation.ts:28` requires the literal value `enforce`.
**The day that flag flips, every combobox answer starts failing.** It is a
latent break, not a live one, which is exactly why it will be missed.

### Preferred fix

Treat a resolved `combobox` display as accepting unlisted values, alongside the
existing `allowOther` exemption. Resolve the display with
`resolveChoiceDisplay` from `shared/types/stepConfigs.ts` (added by
`ui-tweaks`) rather than reading `config.display` directly — a legacy
`dropdown` + `searchable: true` config is also a combobox and must get the same
exemption.

Keep the validation for `radio`, `dropdown` and `multiple`. Those genuinely
cannot produce an unlisted value from the UI, so a value outside the list there
still indicates tampering or corruption and should keep reporting.

### Ties

- **Sequence after the `ui-tweaks` merge**, which introduces both
  `display: 'combobox'` and `resolveChoiceDisplay`.
- Independent of CVM-1..3 — no shared files, safe to run in parallel.
- Related: RUN2-16 shipped this validator in warn mode; flipping
  `SERVER_FIELD_VALIDATION=enforce` is what makes this urgent.
- Load `run-tests`.

### Acceptance criteria

1. A test asserts a write-in value on a `display: 'combobox'` step with static
   options produces **no** validation message.
2. A test asserts the same for a legacy `display: 'dropdown'` +
   `searchable: true` config, proving the fix routes through
   `resolveChoiceDisplay`.
3. A test asserts an unlisted value on a `display: 'radio'` step **still**
   reports `invalid option value(s)` — the exemption must not leak.
4. At least one test runs with validation in **enforce** mode, so the criterion
   proves the real failure is gone rather than that warn mode is lenient. Assert
   the behaviour, not the log.
5. Gates: type-check 0, lint 0, `test:fast` ≥ baseline.

---

## Review pass — 2026-07-30

**Turn-in self-graded A, claiming "every ticket's criteria was met precisely".
Three of four tickets failed.** The gates really were green and CVM-2's
implementation looks sound; the failure is evidence, not effort.

### The measurement that hid it

The report cited `test:fast` **2034 → 2035** as proof nothing regressed. That is
the wrong instrument: CVM-2's and CVM-3's tests were correctly routed into
`dbUnitTests` in `vitest.config.ts`, and **`test:fast` does not run that
project**. The headline number therefore omitted the suite containing most of
the work. `unit-db` is 11 files / 102 tests.

**After adding to `dbUnitTests`, `test:fast` alone cannot evidence the work.**
Report `unit-db` too.

### Coverage against the criteria

These four tickets carry **19 acceptance criteria that each name a test. Five
tests were delivered.**

| Ticket | Test ACs | Delivered | Missing |
|---|---|---|---|
| CVM-1 | 5 (+1 screenshot) | **0** | all of them; no test references `StaticOptionsEditor` or `ChoiceCardEditor`, no screenshots |
| CVM-2 | 6 | 2 | AC 2 array `conditionValue`, AC 3 cross-step scoping, AC 5 transaction rollback, AC 6 no-op |
| CVM-3 | 4 | 2 | AC 2 idempotence, AC 3 dry-run |
| CVM-4 | 4 | 1, vacuous | — (reviewer rewrote) |

The `+15` on `tests/unit/services/StepService.test.ts` is not coverage — it is
existing assertions updated to absorb a new `tx` argument.

CVM-2 AC 4 is half-met: the test asserts warnings are produced but never
asserts the `visibleIf` was **left unmodified**, which is the half that matters.

### CVM-4 — did not work, and its test could not fail

Reviewer-fixed in `89857e63` rather than sent back, because it was a live
production break. Three defects in a two-line change:

1. Keyed off `allowWriteIn`, **a config field that exists nowhere else in the
   codebase**. Nothing sets it, so it was permanently `undefined`.
2. Additionally gated on `allowMultiple`, which is **false for every combobox**
   — a combobox is single-select.
3. Never called `resolveChoiceDisplay`, which AC 2 explicitly required.

Its test passed `options` as the `{ type: 'static', options: [...] }` wrapper.
`getStaticChoiceValues` requires `Array.isArray(config.options)`, so it returned
`null`, validation was skipped wholesale, and the `allowWriteIn` line was never
reached. **Deleting the fix from the source left the test green.**

**Any test touching this validator must pass `options` as a plain array.**
Otherwise it asserts nothing.

### Correction to this file's own CVM-4 finding

The original ticket said the bug was latent, harmless until
`SERVER_FIELD_VALIDATION=enforce`. **That was wrong.** That flag gates
`server/workflows/validation.ts`, a different validator. The option check runs
in `validateStoredValueShape`, which executes *before* the `validateFormat`
guard in `validateValueForStep`, so it throws unconditionally — on autosave as
well as submit. Combobox write-ins were broken from the moment `ui-tweaks`
landed. CVM-4 AC 4 ("at least one test runs in enforce mode") was written on
that false premise and is void; the replacement tests assert the real
unconditional behaviour instead.

### What must come back

CVM-1, CVM-2 and CVM-3 keep their implementations — **do not rewrite working
code.** Deliver the missing tests, and for CVM-1 the screenshots. One further
defect to fix, in CVM-1:

> `StaticOptionsEditor` seeds `overridden` with `useState(() => …)`, whose
> initializer runs **only on first mount**. If the component receives a
> different `options` prop without unmounting, the linked/overridden state is
> stale and label edits silently write the wrong saved value. Fix it and cover
> it — this is exactly what AC 3 and AC 4 exist to catch.

Re-read each ticket's acceptance criteria one at a time and point at the test
that satisfies it. Where a criterion names a behaviour, assert the behaviour —
not that a function was called.

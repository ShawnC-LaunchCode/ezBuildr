# Template versioning & impact analysis (GH-171 / G171-0..6) — retired 2026-08-12

Epic **GH-171** in `tickets/ROADMAP_TICKETS.md`, plus its follow-up file
`tickets/GH171_FOLLOWUP_TICKETS.md` (deleted at retirement). All four ACs met, all
seven follow-up tickets closed, and the one product defect the follow-ups surfaced is
fixed.

**Recover the full closed detail** — every Finding, acceptance criterion, dated
verification note and the three review rounds' escalations:

```bash
git log -p -- tickets/GH171_FOLLOWUP_TICKETS.md
```

What shipped, in one paragraph: templates now record immutable versions with notes and
timestamps; a dependency analyzer lists the workflows referencing a template; the impact
warning highlights added, removed **and renamed** placeholders; and a workflow can pin a
version or follow latest. A cross-tenant pin vulnerability in the real-run path was fixed
and proven non-vacuous. Integration went from 10 known failures to **0** along the way.

---

## ~~G171-B1 — `percent` fails the whole document~~ · ✅ FIXED 2026-08-12

**Worse than filed, and narrower than filed.** Both corrections matter, so the original
text is kept below.

Worse: `percent` did not only crash on an *empty* value. `isNaN` coerces and `toFixed`
does not exist on `String`, so **every string with a number in it** crashed —
`percent('42.345')` threw `n.toFixed is not a function`. Template values are routinely
strings (runner answers, DataVault cells, JSON imports), so `{{ rate | percent }}` was
failing documents for *real answers*, not just missing ones. That makes it a plain P1
bug with no policy component.

Narrower: **`daysBetween` / `businessDaysBetween` raising on a missing operand is
deliberate**, not an oversight — `requireDateArg` in `server/services/docxHelpers.ts`
carries TPL-9 Finding (c)'s reasoning: `0` is a plausible real answer ("payment due 0
days after signing" reads as a stated deadline), so a missing operand must raise rather
than render a number that looks like a term. Filing them as part of this bug was wrong.
They were **not** changed.

Fixed by coercing through a `toFiniteNumber` helper in `server/utils/formatters.ts`:
numeric strings now format, and a value with no number in it renders **blank** rather
than the old fabricated `0%`. Blank is not a new invention — `docs/guides/
VARIABLES_IN_DOCUMENTS.md` already states the rule ("A known variable whose value is
empty renders blank") and calls it "the blank-on-empty rule"; `percent` was violating its
own documented contract, and `0%` is exactly the plausible-looking fabricated term TPL-9
refused for `daysBetween`.

Guards: a `percent` table in `tests/unit/services/docxHelpers.test.ts` (numeric string ≡
number, every missing form → blank, real `0` still `0%`) and two render-level rows in
`RenderCore.expressions.test.ts` that prove a document is produced at all. Reverting the
fix fails 5 of them.

<details><summary>Original entry, as filed</summary>

A documented filter crashes document generation whenever the value it is given is an
empty string, which is exactly what an unanswered question supplies:

```
percent, unanswered ("") -> FAILED: Template syntax error: ScopeParserError:
    (The scope parser for the tag  rate | percent  failed to execute)
percent, answered (7)    -> RENDERED: Rate: 7%.
daysBetween, unanswered  -> FAILED: same
```

Consequence: the document is not produced at all. The per-document error is caught by
`renderFinalBlock`, so the *run* still reports success with one fewer document — the
failure mode that motivated the whole DOC-104 reporting feature.

</details>

## ~~G171-B5 — the other numeric filters mishandle the string values templates actually carry~~ · ✅ FIXED 2026-08-12

Fixed with B2's ruling, in one sweep: every numeric filter now coerces through
`toFiniteNumber` (exported from `server/utils/formatters.ts`), so a numeric string behaves
exactly like the number it spells, and `add` sums instead of concatenating. The math
helpers (`add`/`subtract`/`multiply`/`divide`/`round`) deliberately keep "missing operand
= 0" rather than blank: they compute rather than render, and `{{ a | add:b | currency }}`
has to hand `currency` a number.

The measurements that motivated it, taken 2026-08-12:

| call | today | should be |
|---|---|---|
| `number('1234.5')` | `'1234.5'` | `'1,235'` — the filter's entire purpose is skipped for string input |
| `formatNumber('42.345', 2)` | `'42.345'` | `'42.35'` — the `decimals` argument is ignored |
| `add('1200', '300')` | `'1200300'` | `1500` — `+` concatenates; `-`, `*`, `/` coerce, so only `add` is affected |
| `currency('1234.5')` | `'$1,234.50'` | ✅ already correct (`Intl.NumberFormat` coerces) |

So `{{ total | number }}` rendered unformatted for every answer typed into a question, and
`{{ fee | add:tax }}` silently concatenated two amounts. Both were invisible in a template
preview, which uses numeric sample data.

## ~~G171-B2 — numeric filters fabricate `0` and `$0.00` for a value nobody supplied~~ · ✅ RULED & FIXED 2026-08-12

**Ruling (repo owner, 2026-08-12): blank-on-empty applies to the numeric family.**
`currency`, `usd`, `number`, `formatNumber`, `percent` and `percentage` now render blank
when the value has no number in it. An author who means zero writes it —
`{{ fee | default:"0" | currency }}` — so the intent sits in the template where a reviewer
sees it, instead of in a silent default. A real `0` is still an answer and still renders
`$0.00`.

Shipped together with G171-B5 (below), since they are one sweep. The guide gained a
"Money and numbers when the question was not answered" section, executable in
`docSamples.test.ts` (F15–F17), and the whole family now has one table test in
`docxHelpers.test.ts` rather than a per-filter idea of "missing".

**There are two currency implementations, and the first pass swept only one.**
`formatters.currency` backs the `currency` filter; `docxHelpers.formatCurrency` backs
`formatCurrency` *and* `usd`. Both are registered filters, so a template can reach either,
and for one commit `{{ fee | currency }}` rendered blank while `{{ fee | usd }}` still
rendered `$0.00`. It was caught by re-reading the guide sentence that named `usd`, not by
a test — so the family table now enumerates **both** copies plus `usd`, and one case
asserts the two agree value-for-value. If a third copy ever appears, add it there.

The original entry follows, because the *reason* is the durable part.

---

Filters disagree about what "no value" renders, and two of the answers put a number in a
signed document that no human ever entered:

| filter | `null` | `''` |
|---|---|---|
| `currency` | `$0.00` | `$0.00` |
| `number` / `formatNumber` | `0` | `''` |
| `percent` | `0%` | **throws** (G171-B1) |
| `date` / `upper` / `default` | `''` / `''` / the default | same |

All measured 2026-08-12 by calling all 45 registered filters with each input. The `''`
column is what the run path actually supplies today, so `{{ fee | currency }}` on an
unanswered fee renders **`$0.00`** in a legal document right now. `number`'s `''` → `''`
is not a decision either — it is `String.prototype.toLocaleString` being reached by
accident.

This is a product ruling, not an implementation question: should an unanswered money
field render `$0.00`, blank, or a visible placeholder like `[not provided]`? DOC-104's
reporting (`unresolved_variables`) now names the variable either way, which lowers the
urgency but does not settle it.

**One input to the ruling, found after this was filed:** the authoring guide already
answers it. `docs/guides/VARIABLES_IN_DOCUMENTS.md` states "A known variable whose value
is empty renders blank" and later calls it "the blank-on-empty rule", with exactly one
declared exception (pronoun filters default to they/them, because a blank would break the
sentence). By that rule `currency`'s `$0.00` and `number`'s `0` are contract violations,
not preferences — which is how B1's `percent` was settled.

**Next step:** the repo owner rules — confirm blank-on-empty for the numeric family, or
declare `currency`/`number` a second documented exception and say why in the guide. Then
G171-B5 becomes a mechanical sweep with one table test.

## ~~G171-B3 — `template_versions` immutability is not *enforced*~~ · ✅ CLOSED 2026-08-12

The dead `deactivateVersion` was deleted, so there is now no mutation path at all and
immutability holds by construction. A second thing surfaced while removing it, recorded in
the note left in `TemplateVersionService.ts`: it did not do what its name implied either,
because `getVersionForTemplate` does not filter on `isActive` — a "deactivated" version
kept rendering. Original entry below.

---

AC1 says "immutable versions". Filed during review as "the service still exposes a delete
and an update on version rows" — **that evidence is now stale, and the correction is the
useful part**:

- The hard delete (`pruneOldVersions`) was **removed 2026-08-12**; the note left in its
  place in `server/services/TemplateVersionService.ts` explains that it deleted by recency
  with no awareness of `pinnedVersionId` and would have broken any run pinned to a pruned
  version.
- What remains is `deactivateVersion` (soft delete via `isActive`), which has **zero
  callers** repo-wide, and `getVersionForTemplate` — the pinned lookup — does not filter on
  `isActive`, so even if it were called a pinned run would still resolve.

So immutability holds in practice by absence of a mutation path, not by a constraint.
Recorded so a later audit does not re-file the original (now wrong) version of this.

**Next step:** optional cleanup — delete the unreachable `deactivateVersion`. If retention
or version deletion is ever wanted, the removed-prune note names the constraint any
implementation must respect (exclude versions referenced by a pinned run, with a DB-backed
test that pins then prunes).

## ~~G171-B4 — `server/services/document/README.md` documents array normalization that no longer happens~~ · ✅ FIXED 2026-08-12

Its "Layer 4" section showed `Arrays → Comma-Separated Strings` as the behavior. Arrays
are **preserved** so templates can loop over them (`{{#items}}...{{/items}}`); joining is
opt-in via `joinArrays`, and a scalar tag joins for display at render time. A template
author reading the old text would have concluded loops were impossible. Section rewritten
to show the array surviving, with the loop and scalar forms named.

---

## Lessons worth keeping

- **The defect that outlived the initiative lived in a seam, and the test that should have
  caught it asserted its own fixture.** `run_generated_documents.unresolved_variables` was
  structurally always `[]` for the entire life of the feature — column, plumbing, recorder
  and UI all present and correct in isolation. The only unit test named after it
  (`tests/unit/services/FinalBlockRenderer.test.ts:58`) hardcodes
  `unresolvedVariables: ["missingField"]` inside a mock of the engine, so it proved the
  array is forwarded and could never notice that nothing populates it. Treat any test that
  mocks the thing it claims to verify with the same suspicion.
- **"Fix the obvious cause" would have changed generated documents.** The defect report's
  suggested fix (pass the seeded `null` through to `nullGetter`) is wrong in three
  independent ways, all found by probing rather than reading: `{{ n | number }}` flips
  blank → `0`, `{{ n | percent }}` flips throw → `0%`, and `applyMapping` counts a null
  source as *missing* and omits the mapped target, which `RenderCore`'s own
  strict-undefined check then raises on — failing the document over the author's own field
  name. Reporting a gap must not move a character of any document.
- **A recorded test baseline drifts; re-measure your own.** The `run-tests` skill recorded
  `test:fast` at 3113; a re-measurement on the same commit gave **3116**. The top commit of
  this initiative is literally "docs: correct counter drift". Measure the base you are
  about to change, and treat a count that moves *down* as a stop condition.
- **Two turn-ins across three review rounds reported green gates that were not green** (a
  real `TS2322`; an integration suite where only one hand-picked file had been run), and one
  deleted a 250-line passing test file while reporting the lower test count as success.
  Verify every gate yourself.
- **Preview accepting a client-supplied pin is deliberate** (ruled 2026-08-11). The preview
  payload *is* the unsaved builder draft, so the pin can only come from the client;
  ignoring it would make preview render a different version than the run. It is safe
  because resolution goes through two independent ownership hops
  (`findByIdAndProjectId`, then `getVersionForTemplate` scoped on both columns). Do not
  "harden" it by reverting `pinnedVersionId` out of `previewGenerateSchema`.

---

## Closed — do not re-file

| Item | What shipped | Commit |
|---|---|---|
| GH-171 (epic) | All 4 ACs: immutable versions, dependency analyzer, impact warning incl. renames, pin-or-follow-latest | see below |
| G171-0 | Preserved 3 rounds of uncommitted work | `3ac6747d` → `24491c3e` |
| G171-1 | Renamed-placeholder detection (AC3); deleted a second, unsurfaced rename heuristic; `requiresReview` now trips on renames | `6f28b585` → `36cd2fa7` |
| G171-2 | Real-run pin test (the genuinely exploitable path) + preview/run parity. **AC6 parity is not a security test** — it passes under the vulnerable lookup | `9b9e4bc2` → `a986b2ed` |
| G171-3 | Investigated a −2 test-count delta: **measurement error, no coverage hole**; corroborated by an independent chain of counts | `50bfd24a` |
| G171-4 | `force: true` dropped from PATCH so version dedup applies (kept on upload); dead `?? 'system'` removed; test file cleanup | `faee6e8a` |
| G171-5 | Integration 10 failures → 2. Root cause was **stale DOCX test fixtures**, not a product bug — no route or service changed | `cc427d65` → `e0eb69fe` |
| G171-6 | Integration 2 → **0**. `documentOnboarding` was the same stale-fixture cause; `docs.autogeneration` was a real product defect and was reported, not papered over | `150e3148` → `46848ba4` |
| DOC-104 reporting defect | `unresolved_variables` actually fires: names of unanswered variables travel to the renderer (`normalizeForRender`, `recordEmptyVariable`) instead of their nulls, so no document changes. Integration case un-skipped; 7-test no-DB guard added | `f99110d4` |
| G171-B1 | `percent` crashed on **every** string value with a number in it, not just empty ones — `{{ rate \| percent }}` failed the document for real answers. Now coerces numeric strings and renders blank for a missing value, per the guide's blank-on-empty rule. `daysBetween`'s raise was **deliberate** (TPL-9 (c)) and left alone | `48201b74` |
| G171-B2 | Ruled: blank-on-empty governs the numeric family. `currency`/`usd`/`number`/`formatNumber`/`percent`/`percentage` render blank rather than `$0.00`/`0`/`0%`; `{{ fee \| default:"0" \| currency }}` is the explicit opt-in and a real `0` still renders | see below |
| G171-B3 | Dead `deactivateVersion` deleted — no mutation path remains, so version immutability holds by construction | see below |
| G171-B4 | README's array section corrected: arrays are preserved for loops, not comma-joined | see below |
| G171-B5 | Every numeric filter coerces through `toFiniteNumber`, so a numeric string behaves like the number it spells; `add` sums instead of concatenating. Math helpers keep "missing operand = 0" on purpose | see below |
| Cross-tenant pin vulnerability | `getVersionForTemplate` scoped on both `id` and `templateId`; unscoped `getVersionById` removed repo-wide; proven non-vacuous by mutation (4 of 5 tests fail without it) | in `24491c3e` |
| Duplicate `GET /templates/:id/versions` | Removed; registrations back to 2 | in `24491c3e` |
| `workflow_templates.pinned_version_id` | Reverted — dead schema; migration `0024` deleted | in `24491c3e` |

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

## G171-B1 — the `percent` and `daysBetween` filters fail the whole document when their input is empty · `bug`

**This is the one entry here worth promoting to a ticket.** It is not a versioning
finding — it was found while fixing DOC-104, by enumerating what every registered filter
does with a missing value.

A documented filter crashes document generation whenever the value it is given is an
empty string, which is exactly what an unanswered question supplies:

```
percent, unanswered ("") -> FAILED: Template syntax error: ScopeParserError:
    (The scope parser for the tag  rate | percent  failed to execute)
percent, answered (7)    -> RENDERED: Rate: 7%.
daysBetween, unanswered  -> FAILED: same
```

Probed through `renderDocxBuffer` on 2026-08-12 (`server/utils/formatters.ts`, `percent`;
`server/services/docxHelpers.ts`, `daysBetween` / `businessDaysBetween`). The cause is
that `percent` guards `null`/`undefined`/`NaN` and returns `'0%'`, but `isNaN('')` is
`false` — so `''` falls through to `''.toFixed(decimals)`, which does not exist.
`daysBetween` throws its own `"date1" is required` for an empty string.

Consequence: the document is not produced at all. The per-document error is caught by
`renderFinalBlock`, so the *run* still reports success with one fewer document — the
failure mode that motivated the whole DOC-104 reporting feature.

**Next step:** decide the empty-input contract once for the numeric/date filter family
(see G171-B2 — it is the same decision), then guard every filter to it and add a table
test covering `null`, `undefined`, `''` and a valid value for each. Do not fix `percent`
alone; the point is that the family disagrees.

## G171-B2 — numeric filters fabricate `0` and `$0.00` for a value nobody supplied · `product-decision`

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

**Next step:** the repo owner rules on the empty-input rendering. Then G171-B1 becomes a
mechanical sweep with a test table.

## G171-B3 — `template_versions` immutability is not *enforced*, but nothing mutates them either · `informational`

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

## G171-B4 — `server/services/document/README.md` documents array normalization that no longer happens · `enhancement`

Its "Layer 4: Variable Normalization" section shows `Arrays → Comma-Separated Strings` as
the behavior. Arrays are **preserved** now so templates can loop over them
(`{{#items}}...{{/items}}`); joining is opt-in via `joinArrays`, and a scalar tag joins for
display at render time. A template author reading this doc would not know loops work.

**Next step:** correct that one section. Cheap; batch it with the next edit to that file.

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
| Cross-tenant pin vulnerability | `getVersionForTemplate` scoped on both `id` and `templateId`; unscoped `getVersionById` removed repo-wide; proven non-vacuous by mutation (4 of 5 tests fail without it) | in `24491c3e` |
| Duplicate `GET /templates/:id/versions` | Removed; registrations back to 2 | in `24491c3e` |
| `workflow_templates.pinned_version_id` | Reverted — dead schema; migration `0024` deleted | in `24491c3e` |

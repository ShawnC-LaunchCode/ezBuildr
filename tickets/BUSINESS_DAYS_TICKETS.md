# Business-day and holiday date math (BIZ-1)

Source: promoted from **TPL-O7**, parked during the template-language initiative pending a
repo-owner decision on the holiday calendar. Decision taken 2026-08-11.

Scope: `server/services/docxHelpers.ts`, `server/utils/formatters.ts`, and workflow settings.

Findings were verified against the working tree; the locator is the quoted code and the named
symbol, and line numbers are advisory.

- Each ticket has: **Finding**, **Preferred fix**, **Ties**, **Acceptance criteria**.
  Devs do not commit; the reviewer commits per passed ticket.
- Load `run-tests` before running any test. **No schema change** — see the Preferred fix.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| BIZ-1 | Business-day arithmetic with a configurable holiday calendar | P2 | M | 🔲 |

---

## Decision (repo owner, 2026-08-11)

The calendar must be **selectable between weekends-only and weekends-plus-US-federal-holidays**.
The reviewer's counter-proposal was accepted: **the calendar is configuration, not a filter
argument.** See the Preferred fix for why.

---

## BIZ-1 — Business-day arithmetic with a configurable holiday calendar ✅ DONE 2026-08-11

**Closed by:** `c7410d12`, merged to `main` as `a246a876` (unpushed).

**Reviewer verification** — the dev **did not run integration**, which is not optional
for a diff touching `finalBlock.routes.ts`, `RunLifecycleService.ts` and
`FinalBlockRenderer.ts`, so the reviewer ran it:
`type-check` 0 errors · `lint` 0 problems · `test:fast` **3066 passed / 0 failed**
(baseline 3046 + 20) · `test:integration` **4 files / 10 tests failed — exactly the
documented baseline**, 1096 passed, no new failures.

**Holiday math verified directly by the reviewer**, not inferred from the suite:
Jul 4 2026 observed Fri Jul 3 · Jan 1 2028 observed **Fri Dec 31 2027** (the
observed-date-crosses-into-the-prior-year case) · Thanksgiving, MLK and Memorial Day
2026 · Juneteenth absent 2020, present 2026 · `weekends-only` correctly ignoring
federal holidays · `addBusinessDays(Thu Jul 2 2026, 1, us-federal)` = **Mon Jul 6**,
stepping across both the observed holiday and the weekend.

**Notes for whoever touches this next:**
- **No migration, no schema change.** The calendar rides in the existing
  `workflows.settings` JSON blob, validated twice — `z.enum` at the route and
  `resolveBusinessDayCalendar` at the dynamic JSON boundary.
- **Footprint grew from ~3 files to 16, deliberately and correctly.** The setting is
  threaded routes → `RunLifecycleService` → `FinalBlockRenderer` → `RenderCore` →
  `docxHelpers` rather than parked in global mutable state. Do not "simplify" this
  back into a singleton.
- Default is `weekends-only`, so **existing workflows are unaffected**.
- Perf was checked and is a non-issue: a 10-year `businessDaysBetween` span costs
  59ms on `us-federal`, 1ms on `weekends-only`. No memoization needed.

**Priority: P2** · Size: M · Files: `server/services/docxHelpers.ts`, `server/utils/formatters.ts`, `shared/types/` (settings type)

### Finding

"Within 30 business days" and "if the deadline falls on a weekend it moves to the next business
day" are ordinary terms in retainers, NDAs and court-facing documents, and neither is
expressible today. `docxHelpers` exports 41 filters; none of them skip a weekend:

```
add, addDays, addMonths, addYears, capitalize, concat, currency, date, daysBetween, default,
defaultValue, divide, endOfMonth, first, formatCurrency, formatDate, formatNumber, isEmpty,
isNotEmpty, join, last, length, longdate, lower, multiply, number, percent, percentage,
pluralize, replace, round, shortdate, startOfMonth, subtract, titleCase, titlecase, trim,
truncate, upper, usd, yesno
```

`addDays` counts calendar days, so `{{ signing | addDays:30 }}` on a Friday lands on a Sunday
and the document states a deadline that cannot be met.

This matters now because **GH-173 ships curated retainer and NDA starter templates**. Those are
exactly the documents that carry business-day terms, and every customer template will descend
from them.

### Preferred fix

**Do not take the calendar as a filter argument.** Two reasons, both learned in the
template-language initiative:

1. A jurisdiction is a property of the *matter*, not of each individual deadline. Restating it
   in every tag is how drift happens — one tag says federal, the next does not, and nobody
   notices until a date is wrong in a signed document.
2. Quoted arguments are what Word's autocorrect mangles. TPL-3 moved the vocabulary to named
   presets precisely to keep quotes out of templates; `addBusinessDays:30:"us-federal"` would
   walk that back.

So:

**Calendar lives in `workflows.settings`** — an existing `jsonb` column
(`shared/schema/workflow.ts`), so **no migration**. Shape:

```jsonc
{ "businessDayCalendar": "weekends-only" }   // default when absent
{ "businessDayCalendar": "us-federal" }      // weekends + US federal holidays
```

**Filters take only the count**, which is a bare number and therefore quote-free:

| Filter | Meaning |
|---|---|
| `{{ signing \| addBusinessDays:30 }}` | honours the workflow's configured calendar |
| `{{ deadline \| nextBusinessDay }}` | rolls a date forward if it lands on a non-business day |
| `{{ a \| businessDaysBetween:b }}` | counts business days between two dates |

**Escape hatch is a preset name, never a string argument.** If one template in a
federal-calendar workflow must ignore holidays, it uses `{{ d | addWeekdays:30 }}`, which is
always weekends-only regardless of configuration. Same shape as `usd` versus `formatCurrency`.

**Compute holidays, do not hardcode a list.** US federal holidays are algorithmic — fixed dates
plus nth-weekday rules — and a static array goes stale silently. Implement the **observed-day
shift**: a holiday on a Saturday is observed the preceding Friday, on a Sunday the following
Monday. That shift is the part a naive implementation gets wrong, and it is the part that moves
real deadlines.

**Name the semantics precisely in the docs.** Federal holidays are not the same as court days
or bank days, and federal court deadlines follow their own rule (FRCP 6(a)). This ticket ships
"weekends plus US federal holidays, with weekend observation" — say exactly that in the guide so
nobody assumes court-day behaviour. Anything jurisdiction-specific beyond that stays out of
scope.

Mirror `addDays`' signature — `(value, amount, format?)` — so the new filters register through
the same path and inherit TPL-9's numeric-argument coercion. Note TPL-2's completeness test
derives its coverage from the live `docxHelpers` object, so it will fail until each new filter
is added to its table; extend the table, do not weaken the test.

### Ties

- **Promoted from TPL-O7**; the retired detail is `tickets/backlog/TEMPLATE_LANGUAGE.md`.
- **Should land before GH-173** writes retainer and NDA starter templates.
- Load `run-tests`. Do **not** load `db-schema-change` — `workflows.settings` already exists and
  no DDL is permitted in this ticket.
- File footprint: `server/services/docxHelpers.ts`, `server/utils/formatters.ts`, the settings
  type, `tests/unit/services/docxHelpers.test.ts`, and TPL-2's completeness table in
  `tests/unit/services/document/RenderCore.expressions.test.ts`.
- Documentation lands in `docs/guides/VARIABLES_IN_DOCUMENTS.md`, whose samples are executable
  in `tests/unit/services/document/docSamples.test.ts` — new filters need samples there too.

### Acceptance criteria

1. `{{ signing | addBusinessDays:30 }}` skips Saturdays and Sundays under the default
   `weekends-only` calendar, proven from a Friday start date.
2. Under `businessDayCalendar: "us-federal"`, the same expression additionally skips federal
   holidays, proven across a span containing at least one.
3. The **observed-day shift** is asserted in both directions: a holiday falling on a Saturday is
   observed the preceding Friday, one falling on a Sunday the following Monday.
4. Holidays are computed, not hardcoded — a test asserts correct results for at least two
   different years, including one where a fixed-date holiday moves.
5. `{{ d | nextBusinessDay }}` returns the input unchanged when it is already a business day,
   and rolls forward otherwise.
6. `{{ a | businessDaysBetween:b }}` excludes non-business days at both ends.
7. `{{ d | addWeekdays:30 }}` ignores holidays even when the workflow is configured
   `us-federal` — the escape hatch works.
8. A workflow with no `businessDayCalendar` setting behaves as `weekends-only`; a test asserts
   the absent-setting case explicitly rather than relying on a fixture that happens to set it.
9. An invalid calendar value raises a clear error naming the setting and the accepted values,
   rather than silently falling back.
10. New filters are added to TPL-2's completeness table and to the executable documentation
    samples, and the guide states the "weekends plus US federal holidays, with weekend
    observation — not court days" scope in words.
11. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green at or
    above the baseline measured in the worktree at dispatch.

---

## BIZ-2 — Validate `workflows.settings` on portability import ✅ DONE 2026-08-12

**Closed by:** `611ef23e`, merged as `1ff20d4e`. All 5 ACs met.

**Reviewer-verified:** `type-check` 0 errors · `lint` 0 problems · `test:fast` **3069
passed / 0 failed** (3066 + 3) · focused portability integration **2 files / 22 passed**
(19 + 3). **AC4 confirmed by diff** — `resolveBusinessDayCalendar`'s throw and default
branches are untouched.

Better than specified: rather than a third copy of the rule, `businessDaySettingsSchema`
delegates to `resolveBusinessDayCalendar` inside a `superRefine` and converts the throw
into a Zod issue, so import-time and render-time messages are byte-identical and cannot
drift. Added as a declarative `fieldSchemas` descriptor on the entity graph — which is now
the hook if other jsonb blobs (`sections.config`, `steps.config`, `graphJson`) turn out to
have per-key semantics that throw downstream. That audit was **not** done.

Non-vacuity proven: with `fieldSchemas` removed, the AC1 test fails `expected 201 to be
400` — the garbage calendar imported silently.

**Priority: P2** · Size: S · Files: `server/services/portability/entityGraph.ts` (or the import validation layer), `shared/types/workflow.ts`

### Finding

Found by the reviewer while verifying BIZ-1. **Not a defect in BIZ-1** — its own
validation is correct and doubled. This is a seam between BIZ-1 and the portability
import path.

`workflows.settings` is in the portability import field list
(`entityGraph.ts`, the `fields` array for workflows) and is written **verbatim** from
a user-supplied JSON file. `jsonRefs` covers only `intakeConfig`, and there is no
per-key schema for `settings` on the import side. Meanwhile
`resolveBusinessDayCalendar` (`shared/types/workflow.ts`) **throws** on an
unrecognised value, and it is called during rendering at
`server/services/docxHelpers.ts:741`.

So: import a workflow whose `settings.businessDayCalendar` is `"garbage"`, and the
failure surfaces as a **document-generation error at render time** — after a run has
already completed — instead of an import validation error the user could act on.

The route path is safe (`z.enum` at `workflows.routes.ts`); this is specifically the
import path.

### Preferred fix

Validate `settings` on import, so bad data fails at import where it can be corrected.
**Keep the render-time throw as a backstop** — do not soften it to a silent default.
Silently substituting a calendar would put a wrong date on a legal deadline, which is
worse than a loud failure. The problem is *where* it currently fires, not that it fires.

Reuse `resolveBusinessDayCalendar` (or the `z.enum`) rather than writing a third
validator for the same field.

### Ties

- Load `add-api-endpoint` for the import validation layer's conventions.
- `tests/integration/portability.import.test.ts` and `portability.import.limits.test.ts`
  are the existing import-validation suites — extend one; both are green.
- No collision with anything currently in flight.

### Acceptance Criteria

1. Importing a workflow with an invalid `settings.businessDayCalendar` fails at import
   with a clear message naming the field and the allowed values.
2. Importing a workflow with a **valid** `us-federal` calendar still round-trips.
3. Importing a workflow with **no** `businessDayCalendar` still round-trips and renders
   with the `weekends-only` default.
4. The render-time throw in `resolveBusinessDayCalendar` is unchanged.
5. `type-check` 0 errors · `lint` 0 problems · `test:fast` at or above baseline ·
   `test:integration` no new failures.

---

## Gate

- [x] BIZ-1 ✅ (2026-08-11) — dated verification note in its section above
- [x] `npm run type-check` · `npm run lint` · `npm run test:fast` green — reviewer re-ran all three
- [ ] Reviewer has rendered a real DOCX with a business-day deadline across a federal holiday
      and checked the date by hand — **still outstanding.** The reviewer verified the
      holiday *math* directly (8 cases, including both observed-date edge cases) but has
      **not** rendered a DOCX end to end. The dev flagged this same gap honestly. Treat
      the math as proven and the render path as unproven.
- [x] Reviewer has committed the passed ticket — `c7410d12`, merged `a246a876`

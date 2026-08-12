# Which system am I in? Scripts vs template filters

ezBuildr has two sets of utilities with overlapping names and completely different jobs.
This page is the decision rule. Full references:
[Helper Library](../scripting/helper-library.md) for scripts,
[Variables in Documents](./VARIABLES_IN_DOCUMENTS.md) for template filters.

## The one-line version

**A helper computes something. A filter formats something.**

`helpers.date.add(closing, 30, 'days')` works out a deadline.
`{{ deadline | longdate }}` prints it as "February 4, 2026".

## Side by side

|  | Script helpers | Template filters |
|---|---|---|
| Looks like | `helpers.date.add(d, 30, 'days')` | `{{ deadline \| longdate }}` |
| Written in | JS or Python, in the builder's scripting editor | a Word document, or a question title in the runner |
| Written by | someone automating a process | an author who never sees code |
| Runs when | at a named moment in a run | the instant a tag is rendered |
| Side effects | **Yes** — HTTP calls, logging; receives `run.id`, `workflow.id`, `phase`, `user.id` | **No.** Takes a value, returns a display string |
| Can change what happens | Yes — compute, validate, branch, emit values | No — only how something looks |
| Runs where | sandboxed VM (JS) or subprocess (Python) | inside the render, `server/services/document/RenderCore.ts` |

## Where each one runs

**Script helpers** are injected into three surfaces:

| Surface | Fires |
|---|---|
| Lifecycle hooks | `beforePage` (entering a section), `afterPage` (submitting one) |
| Document hooks | `beforeGeneration`, `afterGeneration` (per document) |
| Transform blocks | when that step executes |

> ✅ **Fixed 2026-08-12.** `beforeFinalBlock` and `afterDocumentsGenerated` used to exist in
> the builder and the database enum while **never being invoked** — a hook saved on either
> silently never ran. Both now fire: `beforeFinalBlock` after the alias-keyed run data is
> built and before the first template renders (so its output can still affect document
> contents), and `afterDocumentsGenerated` once every document exists and its record is
> persisted. Errors on either phase are non-breaking, matching `beforePage`/`afterPage`.
>
> Verified live on 2026-08-12 with a real run: both phases recorded `success` in
> `script_execution_log`, and the `beforeFinalBlock` hook's emitted value appeared in the
> rendered DOCX. Shipped as SCRIPT-1..3; detail in
> [`tickets/backlog/SCRIPTING_HOOKS.md`](../../tickets/backlog/SCRIPTING_HOOKS.md).

**Template filters** run wherever a `{{ }}` tag is rendered — in a generated DOCX, and in
runner question titles and descriptions.

## Choosing

- Need a value **shown differently** — uppercase, currency, a long date? → **Filter.** Nothing
  else is involved.
- Need something **calculated, fetched, validated, or conditionally set** at a point in the
  run? → **Hook or transform block**, using helpers.
- Need a **computed value inside a document**? → **Both, in order.** Compute it in a hook or
  transform, store it under a step alias, then reference that alias in the template and use a
  filter only for presentation.

That third case is the bridge, and it is the answer to most "can I do X in a template?"
questions. Filters deliberately cannot compute, so anything non-trivial is computed upstream
and merely displayed by the tag.

## Can page logic call a helper?

**No, and this trips people up.** Logic rules and `visibleIf` conditions are evaluated by
`shared/conditionEvaluator.ts`, which compares data using a fixed operator set. It has no
function calls and no access to `helpers`. You cannot write `helpers.date.diff(a, b) > 30`
in a visibility rule.

**But hooks feed logic**, which achieves the same thing:

1. `BlockRunner.runPhase` executes lifecycle hooks **first**, before anything else in the phase.
2. Hook output is merged into the run data.
3. Logic then evaluates against that merged data.

So compute `days_since_closing` in a `beforePage` hook and your rules can compare it like any
other answer.

**Two opt-ins are required, and both fail silently when missed:**

- **`mutationMode` must be enabled** on the hook. It defaults to `false`, and when it is off
  the script runs and its output is discarded with no error.
- **`outputKeys` must list every key you write.** It defaults to empty and acts as a
  whitelist; anything not listed is dropped with an "attempted to output non-whitelisted keys
  (ignored)" log line.

A hook that "does nothing" is almost always one of these two.

## Why the names overlap

The scripting system came first and named its utilities generically (`upper`, `trim`,
`round`). The document engine grew its own set independently. Seven names now exist in both —
`add`, `subtract`, `upper`, `lower`, `trim`, `capitalize`, `round` — and the signatures are
not the same: `helpers.date.add(date, n, unit)` shifts a date, while the filter `add(a, b)`
adds two numbers.

Names that exist **only** in the script library and are **not** filters: `now`, `format`,
`diff`, `slug`, `clamp`, `sum`, `avg`, `ceil`, `floor`, `abs`, `unique`, `flatten`.

Guessing wrong used to render a blank with a warning. Since the template-language work it
**rejects the upload**, so a wrong filter name fails loudly at authoring time instead of
quietly in a signed document.

## Known rough edge in the filter vocabulary

The filter list carries several near-duplicates, an artifact of adding a curated preset layer
on top of the original helpers:

| Concept | Names that all work |
|---|---|
| Title case | `titleCase`, `titlecase` |
| Fallback value | `default`, `defaultValue` |
| Currency | `currency`, `formatCurrency`, `usd` |
| Dates | `date`, `formatDate`, `longdate`, `shortdate` |
| Numbers | `number`, `formatNumber` |
| Percent | `percent`, `percentage` |

They are not bugs — every one renders — but there is no single obvious name to teach. Prefer
the preset names (`usd`, `longdate`, `shortdate`, `titlecase`) in new templates: they take no
quoted arguments, which is what Word's autocorrect mangles.

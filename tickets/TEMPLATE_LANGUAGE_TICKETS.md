# Template Language — Expression Layer & Authoring Safety (TPL-1..9)

Source: live investigation of the DOCX render path, 2026-08-09, driven by two
real-world competitor templates supplied by the repo owner (a `docxtpl` estate-planning
table and a HotDocs-lineage bracket-marker will).

Scope: `server/services/document/RenderCore.ts`, `server/services/docxHelpers.ts`,
`server/services/document/TemplateScanner.ts`, `server/services/templatePlaceholders.ts`,
the builder's template cards, and the runner's display-block interpolation.

Overall grade at audit time: **C+**. The *structural* half is genuinely good and almost
entirely undocumented — row loops, conditional rows, multi-row spans, nested loops and
mid-sentence conditionals all work today. The *expression* half is absent: no filter
chaining, no comparisons, no array indexing, no loop counters. Worst of all, nearly every
failure mode in both halves is a **silent empty string in a legal document**.

**Every capability claim in this file was proved by building real DOCX buffers and
rendering them through `renderDocxBuffer`** — not read off documentation. The probe
results are reproduced in the baseline table below so no dev has to re-derive them.

Line numbers are advisory. Every Finding quotes the code and names its enclosing symbol;
that quote plus symbol is the real locator. If a line has drifted, grep for the quote — a
drifted line is not a broken ticket.

---

## How to work this document

- **Tickets are grouped into 4 phases**, ordered by dependency. Do not start a phase
  until the previous phase's **Phase Gate** has been verified and committed by the
  reviewer.
- Each ticket has **Finding**, **Preferred fix**, **Ties**, and **Acceptance criteria**.
  All acceptance criteria must pass.
- **Load the project skills named in your ticket's Ties before touching code.**
  `run-tests` is mandatory for every ticket in this file — `npm test` naively gives
  wrong results in this repo. `design` is mandatory for TPL-6 (any UI work, per the
  repo owner's standing instruction).
- **No schema change is needed anywhere in this initiative.** `templates.metadata` is
  already `jsonb` (`templates` in `shared/schema/workflow.ts`), and TPL-5 stores the
  variable inventory there. If you find yourself reaching for `db:push`, stop and report
  a blocker instead.
- Gates for every ticket: `npm run type-check` (0 errors), `npm run lint` (0 problems,
  `--max-warnings 0` repo-wide), `npm run test:fast` green at or above baseline.
  **Baseline as of 2026-08-09 (main `b0353a2d`, measured by the reviewer at TPL-1 close):**
  `test:fast` = 260 files / 2856 tests passed, 14 skipped. Main moves under this file —
  re-measure rather than trusting a number you did not run.
- Use a worktree per ticket: `pwsh scripts/new-worktree.ps1 -Name <ticket-id>`.
- Devs do not commit; the reviewer commits one commit per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Notes |
|---|---|---|---|
| 0 | Decide the parser | TPL-1 ✅ | Closed 2026-08-09 — **adopt `angular-expressions`** |
| 1 | Grammar & engine | TPL-2 ✅, TPL-3, TPL-9 | Strictly sequential — all three touch `docxHelpers.ts` |
| 2 | Authoring safety | TPL-4, TPL-5, TPL-6 | TPL-4 parallel; TPL-5 → TPL-6 sequential |
| 3 | Consumers | TPL-7, TPL-8 | Parallel |

---

## Decisions (repo owner, 2026-08-09)

Answered during ticket generation. Do not relitigate them.

- **D1 — One grammar, no compatibility shim.** The database holds only disposable test
  data, confirmed by the repo owner. There are no customer templates to preserve, so the
  existing helper-prefix syntax is **deleted outright** in TPL-3, not deprecated behind a
  dual-parser branch. The only migration is ~13 grammar-coupled test assertions and the
  docs.
- **D2 — Loud failures, split by class.** Two kinds of problem, two behaviours:
  *objectively broken* (syntax errors, unknown filter names, smart-quoted arguments)
  **hard-fails the upload**; *contextually unresolved* (a variable not in the workflow's
  alias inventory) **warns on the template card and never blocks**. Blocking an upload
  for an unknown variable would break GH-167's document-to-interview flow, where the
  document is deliberately uploaded *before* the questions exist.
- **D3 — Strict-undefined distinguishes unknown from empty.** At render time, a variable
  that is not in the data contract (typo, deleted question) hard-fails generation and
  names itself; a variable that exists but is empty (respondent skipped an optional
  field) renders blank or whatever `| default(...)` says. Without this split, strict mode
  would break every optional field.
- **D4 — Pipe syntax, and reserve the statement delimiters now.** `{{ x | filter }}` per
  Jinja/industry convention. `{% ... %}` and `{# ... #}` are **reserved and rejected with
  a clear message** from TPL-2 onward even though nothing implements them — that
  reservation is the one thing that cannot be retrofitted later.

---

## Proven capability baseline (2026-08-09)

Probe output, so no dev re-derives it. Data: `{Children:[{child_full_name:'Ada'},...],
client_1:{vips:{relationship2:'spouse'}}, fee:250}`.

| Capability | Status | Probe result |
|---|---|---|
| Row loop (`{{#Children}}` first cell → `{{/Children}}` last cell) | ✅ works | `rows=3 ["HDR","Ada\|x","Alan\|x"]` |
| Conditional single row | ✅ works | false → row removed entirely |
| Multi-row conditional span (tags in first/last **content** rows) | ✅ works | true → all rows kept; false → all removed |
| Multi-row span with **dedicated marker rows** | ⚠️ partial | false → clean; **true → marker rows survive as empty rows** |
| Mid-sentence conditional | ✅ works | `Contingent Gift to My Children.` |
| Whole-paragraph either/or | ✅ works | 6 paras in → 1 para, correct branch, no empty paras |
| Nested loops | ✅ works | `Ada Lovelace: House Car Grace Hopper: Boat` |
| Namespaced dot path | ✅ works | `{{client_1.vips.relationship2}}` → `spouse` |
| Object as scope-push section | ✅ works | `{{#fees}}{{filing}}{{/fees}}` → `350` |
| Count | ✅ works | `{{length Children}}` → `2` |
| Split runs / split delimiters / cross-paragraph splits | ✅ works | all render correctly |
| **Array indexing** `{{Children[0].name}}` | ❌ silent `""` | TPL-2 |
| **Comparisons** `{{#a == b}}`, `count > 9` | ❌ silent `""` | TPL-2 |
| **Filter chaining** `{{ x \| trim \| upper }}` | ❌ silent `""` | TPL-2 |
| **Loop counters** `{{$index}}` | ❌ silent `""` | TPL-2 |
| **Smart-quoted helper args** | ❌ silently wrong output | TPL-4 |

Two competitor patterns this initiative must be able to express, both supplied by the
repo owner as real client work:

1. **`docxtpl` estate table** — `{%tr if Children.number() > 9 %}` … `{%tr endif %}`
   around rows containing `{{ Children[9].child_full_name }}` and
   `{% if Children[9].temp_physical_guardian_name == pet_full_name %}X{% endif %}`
   (an X stamped into a checkbox column when two answers match).
2. **HotDocs-lineage will** — `[Section Start: children 2]to My Children.[Section End:
   children 2]` mid-sentence inside a numbered heading, and `[client_1: vips:
   relationship2]` namespaced paths. **Pattern 2 is already fully expressible today**;
   pattern 1 needs TPL-2's indexing and comparisons.

---

# Phase 0 — Decide the parser

One ticket. It produces a written recommendation plus a throwaway-but-kept proof test.
**TPL-2 must not be dispatched until this is reviewed and committed**, because its answer
determines whether TPL-2 is "adopt a parser and define a vocabulary" (M) or "write an
expression parser" (L, and must then be split).

## TPL-1 — Spike: adopt `angular-expressions` or hand-roll the expression layer ✅

> **Verified 2026-08-09 (reviewer).** All 6 ACs met. Recommendation accepted: **adopt
> `angular-expressions`** (Unlicense, ~102KB). Gates re-run by the reviewer on the
> fast-forwarded tree (`b0353a2d`, main's tip), not taken from the report:
> `type-check` exit 0 · `lint` exit 0 repo-wide (`--max-warnings 0`) ·
> `test:fast` **260 files / 2856 passed / 14 skipped**. The spike file passes 8/8 in both
> the worktree and the main checkout.
>
> All four capabilities proven against real DOCX buffers: pipe filters, chaining,
> value-to-value comparison (`Children[0].guardian == resp_full_name`), and array
> indexing (`Children[9]`). Filter arguments use colon syntax. Two findings that change
> TPL-2's work were carried into its Preferred fix: `{{$index}}` needs
> `context.scopePathItem` mapped in explicitly, and parent scope inside loops needs the
> `scopeList[0..num]` merge.
>
> **First submission FAILED review on two counts, both since fixed.** (1) AC5 was not
> done — the dead `createAngularParser()` was still in `docxHelpers.ts`, and the spike had
> added a second function of the same name. (2) The "100% compatible, register directly"
> conclusion was wrong: the registration iterated the **module namespace**
> (`import * as docxHelpers`), which yields the 29 named exports, misses the 8 merged via
> `...formatters`, and registers 5 non-helpers. Under that method the spike result's own
> headline example threw `Filter 'currency' is not defined`. Reviewer probe at the time:
> `31 helpers / 28 registered / missing: upper, lower, currency, date, yesno, titleCase,
> number, percent`. Now `import { docxHelpers }`, and the same probe reports **31/31,
> none missing**, with `{{ fee | currency }}` → `$250.00`.
>
> Also cleared: the leftover `test.cjs` scratch file, with its smart-quote discovery
> folded into the Spike result rather than deleted along with it.

**Priority: P1** · Size: S · Files: `tests/unit/services/document/expressionSpike.test.ts` (new), spike notes appended to this ticket

### Finding

The expression layer has to come from somewhere and there are exactly two candidates,
with very different costs. Nobody has checked which one works.

Today's parser is hand-rolled and single-slot. In **`createExpressionParser()`**
(`server/services/document/RenderCore.ts`):

```ts
const parts = tokenizeTag(tag);

if (parts.length > 1 && parts[0] in docxHelpers) {
    const helperName = parts[0];
    ...
    const value = getNestedValue(scope, parts[1]);
    const args = parts.slice(2).map((arg) => resolveHelperArg(scope, arg));
```

Three fixed positions: helper, value, args. There is no slot for a second transform, and
`getNestedValue()` walks `pathStr.split('.')` only — no bracket indexing.

Docxtemplater's own documented answer is the `angular-expressions` parser, which supplies
pipe filters, chaining, comparisons and arithmetic together. **It is not currently a
dependency** — `grep angular package.json` returns nothing.

Confusingly, a function named `createAngularParser()` already exists in
`server/services/docxHelpers.ts`:

```ts
export function createAngularParser() {
  return {
    get(scope: Record<string, unknown>, context: string): unknown {
      // Handle dot notation (e.g., "user.name")
      const keys = context.split('.');
```

It is **dead code** (zero call sites repo-wide) and despite the name has nothing to do
with `angular-expressions` — it is another hand-rolled dot-path getter. It will mislead
whoever picks up TPL-2.

### Preferred fix

Do not modify production code. In a worktree, add `angular-expressions`, wire it as
docxtemplater's `parser`, and prove or disprove **all four** capabilities against it:

1. `{{ fee | currency }}` — a filter in pipe position
2. `{{ client_name | trim | upper }}` — chaining
3. `{{#Children[0].guardian == resp_full_name}}X{{/...}}` — comparison of two scope values
4. `{{ Children[9].child_full_name }}` — array indexing

Also determine, and write down: how filter *arguments* are expressed; whether the
existing 31 helpers in `docxHelpers` can be registered as filters without rewriting them;
whether `{{$index}}` becomes available; and how the library reports an unparseable tag
(this is what D3's strict-undefined hangs off).

Then append a **Spike result** section to this ticket: recommendation (adopt / hand-roll),
the evidence for each of the four, the licence and bundle cost of the dependency, and —
if hand-rolling wins — a proposed grammar for the reviewer to approve before TPL-2 is
written.

### Spike result (2026-08-09)

**Recommendation**: **Adopt `angular-expressions`**.
The dependency is lightweight (Unlicense, ~102KB unpacked size) and perfectly satisfies all parsing criteria, saving weeks of building a custom parser.

**Evidence for the Four Capabilities** (Proven in `tests/unit/services/document/expressionSpike.test.ts`):
1. `{{ fee | currency }}` (Filter in pipe position): ✅ Works natively.
2. `{{ client_name | capitalize | upper }}` (Chaining): ✅ Works natively.
3. `{{#Children[0].guardian == resp_full_name}}X{{/Children[0].guardian == resp_full_name}}` (Comparison): ✅ Works natively.
4. `{{ Children[9].child_full_name }}` (Array indexing): ✅ Works natively.

**Additional Determinations**:
- **Filter arguments**: Expressed via colon syntax, e.g. `{{ date_val | date:"long" }}`.
- **Existing `docxHelpers` compatibility**: They are compatible in calling convention, but **beware the module namespace trap**. In `docxHelpers.ts`, the helpers are merged via `...formatters` into a default `docxHelpers` object. A standard module import (`import * as docxHelpers`) grabs the 29 named exports but misses the 8 from `formatters.ts` (such as `currency` and `date`). To correctly register all 31 real helpers, you must import the `docxHelpers` object (`import { docxHelpers }`) and iterate over it. We proved this by cleanly registering and testing the real `currency` and `upper` filters.
- **`{{$index}}` availability**: Not automatically available in the template scope. The parser strictly evaluates against the provided object. If we need `$index`, we will have to explicitly expose docxtemplater's `context.scopePathItem` to the evaluated scope.
- **Unparseable tag reporting**: It throws a standard JavaScript `Error` (e.g. `[$parse:ueoe] Unexpected end of expression...`), which we can easily catch and wrap in our strict error format.
- **Smart Quotes**: We discovered that standard quotes in tags may be altered to smart quotes by Word (`’`, `‘`). A pre-processing step `.replace(/(’|‘)/g, "'").replace(/(“|”)/g, '"')` during compilation successfully handles this.

### Ties

- **Blocks TPL-2 and TPL-3.** Nothing else in this file depends on it; Phase 2 tickets
  (TPL-4, TPL-5) may be dispatched in parallel with this spike.
- Load the `run-tests` skill before running any test.
- File footprint: one new test file plus `package.json` *in the worktree only*. If the
  recommendation is "hand-roll", the dependency must be backed out before turn-in.
- Collides with: nothing.

### Acceptance criteria

1. A new test file `tests/unit/services/document/expressionSpike.test.ts` renders real
   DOCX buffers through the candidate parser and asserts the outcome of each of the four
   capabilities above — including the ones that **fail**, asserted as failing, so the
   result is reproducible either way.
2. The test passes and states, per capability, supported or not supported.
3. A **Spike result** section is appended to this ticket covering: recommendation,
   per-capability evidence, filter-argument syntax, whether the existing 31 helpers can
   be reused as-is, `{{$index}}` availability, and unparseable-tag reporting behaviour.
4. If the recommendation is "hand-roll", the section includes a proposed grammar for
   reviewer approval, and `angular-expressions` is **not** left in `package.json`.
5. The dead `createAngularParser()` in `server/services/docxHelpers.ts` is deleted, with
   a grep in the report proving zero remaining references.
6. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
   at or above the baseline recorded in this file's header.

---

# Phase 1 — Grammar & engine

Three tickets, all in `RenderCore.ts` + `docxHelpers.ts`. **Dispatch strictly
sequentially** — they fight over the same two files, and TPL-3 assumes TPL-2's parser
exists. Out of scope for this phase: the template card, the runner, and docs.

## TPL-2 — Expression layer: pipe filters, chaining, comparisons, indexing, counters ✅

> **Verified 2026-08-09 (reviewer).** All 11 ACs met. Gates re-run by the reviewer, not
> taken from the dev's report: `type-check` exit 0 · `lint` exit 0 repo-wide
> (`--max-warnings 0`) · `test:fast` **262 files / 2911 passed / 14 skipped** (+50 over the
> 2861 worktree baseline, zero regressions). The four affected suites re-run in the main
> checkout after the port: 145/145.
>
> **Deviation accepted, and it is an improvement.** The ticket specified reusing TPL-1's
> hand-rolled `scopeList` merge and a manual `context.scopePathItem` mapping for `$index`.
> The dev used **`docxtemplater/expressions.js`** instead — docxtemplater's own shipped
> angular-expressions wrapper, which already implements the parent-scope walk, `$index`
> via `scopePathItem`, `.`-to-`this` rewriting, and smart-quote normalisation. That is
> three of the four traps TPL-2 budgeted for, handled by code docxtemplater maintains.
> AC6 consequently passes with no manual mapping at all. The fourth trap — registering
> filters from the `docxHelpers` **object**, never the module namespace — still applied
> and was handled correctly, with a comment recording why.
>
> Reviewer probes (independent of the dev's tests): all 31 helpers in pipe form,
> chaining, `{{ fee | currency }}` → `$250.00`, `Children[9]` indexing, out-of-range index
> → empty rather than a crash, `{{$index}}` → `0:A 1:B`, `{{.}}` self-reference, and
> reserved `{%`/`{#` rejection.
>
> **First submission FAILED review on a live regression.** AC7's reserved-syntax check
> scanned **raw XML**, so a valid `{{#items}}` that Word had split between its two braces
> read as `>{#items}`, the negative lookbehind missed, and the render hard-failed telling
> the author they had used reserved Jinja syntax. Two facts established during this
> initiative made it real rather than theoretical: docxtemplater renders delimiter-split
> tags correctly today, and `TemplateScanner.repairXml` does **not** repair delimiter
> splits — so those templates reach the renderer still split and currently work. The same
> root cause also let a genuinely reserved `{%` split across runs evade the scan entirely.
> Fixed by stripping markup before scanning; the dev confirmed both regression tests fail
> before the fix and pass after.
>
> **Two test-rot defences added at review request:** AC1's parity assertion could pass
> vacuously when a helper returned `""` in both forms (now also asserts non-empty), and its
> 31 cases were a hardcoded list that already missed the dev's own new `trim` helper — it
> now diffs every function key of the live `docxHelpers` object against the covered set, so
> TPL-9's four new date helpers will fail loudly until covered rather than slipping through.
>
> **One helper added:** `trim`, required by AC2's chaining example, which had no
> old-grammar equivalent.

**Priority: P1** · Size: M (**L if TPL-1 recommends hand-rolling — escalate to the repo owner before dispatch if so**) · Files: `server/services/document/RenderCore.ts`, `server/services/docxHelpers.ts`

### Finding

Four capabilities are missing, and all four fail as a silent empty string rather than an
error. Probed 2026-08-09 against the real engine:

```
{{client_name upper trim}}          -> ""     (value-first is not a grammar)
{{trim upper client_name}}          -> ""     (chaining, any order)
{{Children[0].child_full_name}}     -> ""     (array indexing)
{{#a == b}}X{{/a == b}}             -> ""     (comparison)
{{$index}}                          -> ""     (loop counter)
{{fee + 10}}                        -> ""     (arithmetic)
{{upper client_name}}               -> "ADA LOVELACE"    (the one supported shape)
```

Three distinct causes, all in **`createExpressionParser()`** and **`getNestedValue()`**
(`server/services/document/RenderCore.ts`):

1. **One helper per tag.** `return helper(value, ...args)` — tokens after the value
   become *arguments*, not further transforms, so `{{upper client_name trim}}` silently
   discards `trim`.
2. **Dot-only paths.** `for (const key of pathStr.split('.'))` never parses `[9]`.
3. **Chain attempts fail worse than they look.** `docxHelpers` is spread into the
   template data (`const templateData = { ...data, ...docxHelpers };` in
   `renderDocxBuffer()`), so a helper name in the *value* position resolves to the
   function object. `{{titleCase upper client_name}}` calls
   `titleCase(<the upper function>, "client_name")`, which throws inside the helper and
   is swallowed by the `catch` that returns `''`. Note this path does **not** even reach
   `unresolvedVariables`, so nothing downstream knows the tag was wrong.

Consequence, stated plainly: a legal document renders with a clause silently missing.

### Preferred fix

Follow TPL-1's recommendation. If it says adopt, wire `angular-expressions` as
docxtemplater's `parser` and register the existing 31 helpers as filters — do **not**
rewrite the helper implementations, which already have ~500 lines of behavioural coverage
in `tests/unit/services/docxHelpers.test.ts`.

`RenderCore.ts` is explicitly the single chokepoint ("three drifted copies of this logic
existed … do not add another copy"). **All grammar changes land there.** Do not add a
parser to `TemplateParser.ts`, `EnhancedDocumentEngine.ts`, or anywhere else.

**Four things TPL-1 proved — inherit them rather than rediscovering them:**

1. **Register filters from the `docxHelpers` *object*, not the module namespace.**
   `import * as docxHelpers` yields the 29 named exports: it **misses the 8 merged in via
   `...formatters`** (`upper`, `lower`, `currency`, `date`, `yesno`, `titleCase`, `number`,
   `percent`) and registers 5 things that aren't helpers (`tokenizeTag`, `parseHelperArg`,
   `resolveHelperArg`, `formatArrayForDisplay`, and the now-deleted `createAngularParser`).
   Use `import { docxHelpers }` and iterate that. TPL-1's first submission had this exact
   bug and `{{ fee | currency }}` threw `Filter 'currency' is not defined` — a silent
   failure in the middle of AC1's own headline example.
2. **`{{$index}}` is not exposed automatically.** angular-expressions evaluates against the
   object it is handed, so AC6 requires explicitly mapping docxtemplater's
   `context.scopePathItem` into the evaluated scope. Budget for it; it is not free.
3. **Parent scope inside loops needs the scopeList merge.** TPL-1's working parser walks
   `context.scopeList[0..context.num]` and `Object.assign`s them together; without it, a
   tag inside `{{#items}}` cannot see top-level variables. Reuse that shape.
4. **The parser can normalise smart quotes itself** —
   `tag.replace(/(’|‘)/g, "'").replace(/(“|”)/g, '"')` before `expressions.compile`. Do
   this *in addition to* TPL-4's upload-time normalisation, not instead of it: TPL-4
   protects stored templates, this protects the render path.

Support, in the tag body:

- `{{ x | filter }}` and chaining `{{ x | trim | upper }}`
- filter arguments in whatever form TPL-1 settled on
- comparisons and boolean logic in section tags: `{{#a == b}}`, `{{#count > 9}}`
- array indexing in paths: `Children[9].child_full_name`
- docxtemplater's loop variables, at minimum `{{$index}}`
- `{%` and `{#` **reserved**: a tag opening with either is rejected with a clear
  "statement syntax is reserved and not yet supported" message rather than rendering blank

Keep the old prefix form working *within this ticket* so the existing suites stay green;
TPL-3 removes it. That is the one place a temporary dual path is acceptable, and it must
be gone by the end of Phase 1.

### Ties

- **Blocked by TPL-1.** **Blocks TPL-3, TPL-7, TPL-8**, and (in the roadmap file) GH-161,
  GH-171, GH-173.
- Load `run-tests`. Do **not** load `db-schema-change` — there is no schema work here.
- File footprint: `server/services/document/RenderCore.ts`,
  `server/services/docxHelpers.ts`, `tests/unit/services/document/*`. **Collides with
  TPL-3 and TPL-7** — sequence, never parallel.
- The 13 grammar-coupled assertions in `tests/unit/services/TemplateParser.test.ts`,
  `TemplateValidationService.test.ts` and `TemplateAnalysisService.test.ts` will need
  updating. The ~30 in `tests/unit/services/docxHelpers.test.ts` should **not** — they
  test the helper functions, not the grammar. If you find yourself editing that file,
  you have probably changed a helper you didn't need to.

### Acceptance criteria

1. `{{ x | filter }}` renders identically to today's `{{ filter x }}` for all 31 helpers.
2. Chaining works and applies left to right: `{{ name | trim | upper }}` on `"  ada  "`
   renders `ADA`.
3. Filter arguments work in the form TPL-1 specified, proven for at least `formatDate`
   and `formatCurrency`.
4. Array indexing resolves: `{{ Children[0].child_full_name }}` renders the first child's
   name, and an out-of-range index behaves per D3 (see TPL-3), not a crash.
5. Comparison section tags work for value-to-value and value-to-literal:
   `{{#Children[0].guardian == resp_full_name}}X{{/...}}` stamps `X` when equal and
   nothing when not; `{{#count > 9}}` behaves correctly either side of the boundary.
6. `{{$index}}` renders the zero-based iteration index inside a loop.
7. A tag opening with `{%` or `{#` is rejected with an error naming the tag, not rendered
   as blank text.
8. New tests in `tests/unit/services/document/` assert 1–7 by rendering **real DOCX
   buffers** (build them in-test with PizZip, as the TPL-1 spike does) — not by unit
   testing the parser function in isolation.
9. A test reproduces the repo owner's `docxtpl` table end to end: a table whose rows use
   `Children[n]` indexing plus an equality-driven `X` checkbox column renders correctly.
10. `tests/unit/services/docxHelpers.test.ts` is unchanged (helper behaviour is not in
    scope).
11. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
    at or above the baseline recorded in this file's header.

---

## TPL-3 — Filter vocabulary, prefix-syntax removal, and strict-undefined 🔲

**Priority: P1** · Size: M · Files: `server/services/document/RenderCore.ts`, `server/services/docxHelpers.ts`

### Finding

Three concerns that all live in the same two functions, bundled deliberately per the
"same-code concerns are one ticket" rule.

> **Re-scoped 2026-08-09 after TPL-2 landed.** Two of this ticket's three premises
> changed, both in your favour. Probed against the post-TPL-2 render path:
>
> ```
> {{ d | formatDate:"MM/DD/YYYY" }}   -> "01/05/2026"     straight quotes
> {{ d | formatDate:“MM/DD/YYYY” }}   -> "01/05/2026"     CURLY quotes — now fine
> {{formatDate d “MM/DD/YYYY”}}       -> "“01/05/2026”"   legacy form, still mangled
> {{ fee | no_such_filter }}          -> THROWS           already raises
> [{{ nonexistent_thing }}]           -> "[]"             still silently blank
> ```
>
> - **Finding (a) is now legacy-only.** `docxtemplater/expressions.js` normalises smart
>   quotes inside the parser, so the new grammar is already immune. The corruption
>   survives *only* in the prefix form — which means **deleting the legacy grammar (b) is
>   the fix for (a)**, and no new quote-handling code is needed here.
> - **AC7 already passes.** Unknown filters raise through angular-expressions. Your job on
>   AC7 is a regression test that pins the behaviour, not an implementation.
> - **Strict-undefined (c) is the real work in this ticket**, alongside the vocabulary and
>   the deletion. An unknown variable still renders as an empty string.

**(a) Quoted format strings — a corruption vector that now survives only in the grammar
this ticket deletes.** `tokenizeTag()` in `server/services/docxHelpers.ts` recognises
straight quotes only:

```ts
return tag.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
```

Word autocorrects straight quotes to curly ones. Probed:
`{{formatDate dob "MMMM DD, YYYY"}}` renders `December 10, 1815`; the same tag with curly
quotes renders a mangled fragment beginning with the curly quote character — wrong text,
no error. (TPL-4 normalises the quotes at upload; this ticket removes the *reason*
authors type quotes at all.)

**(b) Two grammars would be one too many.** Per **D1** the prefix form
(`{{formatDate dob "..."}}`) is deleted, not deprecated.

**(c) Unresolvable tags render blank.** `nullGetter` in **`createDocxRenderer()`**
(`server/services/document/RenderCore.ts`):

```ts
nullGetter: (part: { value?: string }): string => {
    if (unresolvedVariables && part?.value && !unresolvedVariables.includes(part.value)) {
        unresolvedVariables.push(part.value);
    }
    return '';
},
```

Every unknown variable — including a typo'd one — becomes an empty string in the output
document. `unresolvedVariables` is collected but does not stop generation.

### Preferred fix

**Named presets over format strings.** Define a closed vocabulary of filters —
`| longdate`, `| shortdate`, `| usd`, `| upper`, `| titlecase`, etc. — mapping onto the
existing helpers. A closed set is validatable at upload (TPL-5) and contains no quotes
for Word to mangle. Keep the argument form reachable as an escape hatch, but the
documented path is presets.

**Delete the prefix branch** in `createExpressionParser()` — the whole
`parts[0] in docxHelpers` block — rather than leaving it behind a flag.

**Strict-undefined per D3.** Split `nullGetter`'s single blank return into two paths:
*not in the data contract* → throw a render error naming the variable and, where the
inventory from TPL-5 is available, a did-you-mean; *present but empty* → render blank, or
the value supplied by a `| default(...)` filter. Add `default` to the vocabulary in this
ticket — strict mode is unusable without it.

Mirror the existing structured-error shape: `createError.internal()` with the
`Template syntax error: ` prefix and the per-error detail join already used by
`handleRenderError()`.

### Ties

- **Blocked by TPL-2** (same files, needs its parser). **Blocks TPL-7, TPL-8.**
- Load `run-tests`.
- File footprint: identical to TPL-2. **Never dispatch these two in parallel.**
- TPL-5 consumes this ticket's filter vocabulary to validate templates at upload — export
  the vocabulary as a named constant it can import, not an inline literal.
- Docs for the vocabulary are TPL-8's job, not this ticket's.

### Acceptance criteria

1. A named preset vocabulary exists as an exported constant, covers at minimum date,
   currency, number and case transforms, and is documented in code with one line per
   preset.
2. `{{ signing_date | longdate }}` and `{{ fee | usd }}` render correctly with no quotes
   in the template.
3. The prefix form `{{formatDate dob "..."}}` no longer renders — it raises a template
   error naming the tag. The `parts[0] in docxHelpers` branch is **deleted**, not
   commented out or flag-guarded.
4. A variable absent from the data contract raises a render error naming the variable;
   generation does not produce a document.
5. A variable present but empty renders as an empty string and does **not** raise.
6. `{{ maybe_missing | default("N/A") }}` renders `N/A` for both the absent and the empty
   case.
7. An unknown filter name raises a template error naming the filter. **This already
   works post-TPL-2** — deliver it as a regression test that pins the behaviour, not as new
   code.
8. Tests assert 2–7 against real rendered DOCX buffers, including a regression test that
   the exact prefix-form tag `{{formatDate dob "MMMM DD, YYYY"}}` now errors rather than
   silently working, and one proving a **curly-quoted** filter argument
   (`{{ d | formatDate:“MM/DD/YYYY” }}`) renders correctly — that is the behaviour
   inherited from TPL-2 and it must not regress when the legacy branch is removed.
9. The 13 grammar-coupled assertions in `TemplateParser.test.ts`,
   `TemplateValidationService.test.ts` and `TemplateAnalysisService.test.ts` are updated
   to the new grammar and pass.
10. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
    at or above the baseline recorded in this file's header.

---

## TPL-9 — Date and duration filters: stop silent wrong dates, add month arithmetic 🔲

**Priority: P1** · Size: S · Files: `server/services/docxHelpers.ts`, `server/utils/formatters.ts`

### Finding

Date math is the most common calculation in legal drafting ("payment due 30 days after
signing") and it has three failure modes, two of which put a **plausible but wrong date**
into an executed document. Probed 2026-08-09 through the TPL-1 parser with the real
helpers registered, input `d = '2026-01-05'`:

```
{{ d | addDays:30 }}        -> "02/04/2026"    correct
{{ d | addDays:"30" }}      -> "06/14/2027"    WRONG — 525 days, silently
{{ d | date }}              -> "01/04/2026"    WRONG — off by one day
{{ d | formatDate }}        -> "01/05/2026"    correct
{{ 'not a date' | addDays:30 }} -> ""          silent
{{ signing | daysBetween:blank }} -> 0         silent, and 0 reads as a real term
```

**(a) A quoted numeric argument silently produces a wildly wrong date.** `addDays()` in
`server/services/docxHelpers.ts` types its parameter as a number and passes it straight to
date-fns:

```ts
export function addDays(
  iso: string | Date | null | undefined,
  days: number = 0,
  format: string = 'MM/DD/YYYY'
): string {
```

Nothing coerces or rejects a string. Authors *will* write `addDays:"30"` — every other
filter argument in the documentation is quoted — and the output looks like a real date.
This is worse than a blank: a blank is noticed, a wrong date is signed. (The exact
mechanism producing 525 days was not chased; reproduce it first, then fix.)

**(b) Two date formatters disagree by a day, and the discoverable one is the broken one.**
`formatDate` lives in `docxHelpers.ts` and parses with `parseISO`. `date` arrives via
`...formatters` from `server/utils/formatters.ts` and returns the previous day for a bare
`YYYY-MM-DD` input (reviewer machine UTC-6 — almost certainly an ISO string parsed as UTC
midnight then formatted local). `date` is the shorter, more obvious name.

**(c) Invalid input is swallowed.** `addDays` returns `''` for an unparseable date;
`daysBetween` returns `0` when either operand is missing. Under **D3** an unparseable date
is not an empty answer — it is a broken template or broken data and must be loud.

### Preferred fix

Fix the helpers, not the parser — these are helper-implementation bugs that the new
grammar merely makes reachable.

- **Coerce or reject numeric arguments.** Accept `30` and `"30"` identically (coerce via
  `Number()` and validate with `Number.isFinite`), and raise on anything that is not a
  finite number. Never fall through to date-fns with a non-number.
- **One canonical date formatter.** `formatDate` is correct; make `date` an alias of it,
  or fix `formatters.date` to parse date-only strings as local midnight. Do not leave two
  implementations that disagree — that is how (b) happened.
- **Raise on unparseable dates** per D3, keeping *empty input* (`''`/null — the respondent
  skipped an optional question) as a legitimate empty render. The distinction is the whole
  point of D3: unknown is loud, empty is blank.
- **Add `addMonths`, `addYears`, `startOfMonth`, `endOfMonth`**, mirroring `addDays`'
  signature (value, amount, optional format) so they register as filters identically.
  **Document the month-end convention explicitly** — one month after January 31 must have
  a stated answer, not an emergent one. date-fns `addMonths` clamps to the last day of the
  target month (Jan 31 → Feb 28); state that in the code comment and in TPL-8's docs.

Business-day and holiday arithmetic are **out of scope** — parked by the repo owner
2026-08-09, see observation TPL-O7.

### Ties

- **Blocked by TPL-3.** Touches `server/services/docxHelpers.ts`, which TPL-2 and TPL-3
  both rewrite. **Collides with TPL-2 and TPL-3 — sequence after both, never parallel.**
- Load `run-tests`.
- File footprint: `server/services/docxHelpers.ts`, `server/utils/formatters.ts`,
  `tests/unit/services/docxHelpers.test.ts`. Note this is the one ticket in the initiative
  that is *expected* to touch `docxHelpers.test.ts` — TPL-2 and TPL-3 must not.
- Supersedes observation TPL-O6, which is folded into Finding (b).
- TPL-8 documents the resulting filters and the month-end convention.

### Acceptance criteria

1. `{{ d | addDays:30 }}` and `{{ d | addDays:"30" }}` produce the identical result.
2. A non-numeric amount (`addDays:"soon"`) raises an error naming the filter and the
   argument; it does not return a date or a blank.
3. `{{ d | date }}` and `{{ d | formatDate }}` return the same string for a bare
   `YYYY-MM-DD` input, and that string is the same calendar day as the input.
4. An unparseable date input raises per D3; an empty/null input still renders empty.
5. `daysBetween` with a missing operand raises rather than returning `0`.
6. `addMonths`, `addYears`, `startOfMonth` and `endOfMonth` exist, register as filters, and
   accept the same `(value, amount, format)` shape as `addDays`.
7. The month-end convention is asserted by a test: one month after `2026-01-31` renders the
   documented value, with the convention named in a code comment.
8. Tests cover 1–7 in `tests/unit/services/docxHelpers.test.ts`, including a regression test
   for the exact `addDays:"30"` case with its wrong historical output quoted in a comment.
9. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green at
   or above the baseline recorded in this file's header.

---

## Phase 1 Gate

- [ ] TPL-1, TPL-2, TPL-3, TPL-9 all ✅ with dated verification notes
- [ ] `npm run type-check` 0 errors · `npm run lint` 0 problems
- [ ] `npm run test:fast` green at or above the header baseline
- [ ] Reviewer has rendered the repo owner's `docxtpl` estate table through the new
      grammar and confirmed the output by hand
- [ ] `grep -rn "parts\[0\] in docxHelpers" server/` returns nothing
- [ ] Reviewer has committed each passed ticket

---

# Phase 2 — Authoring safety

Turning silent blanks into feedback the author sees. TPL-4 is independent and may run in
parallel with Phase 0 or Phase 1. TPL-5 → TPL-6 are sequential (TPL-6 renders what TPL-5
produces).

## TPL-4 — Normalise Word's autocorrect damage, and test the repair path at all 🔲

**Priority: P1** · Size: S · Files: `server/services/document/TemplateScanner.ts`, `tests/unit/services/document/TemplateScanner.test.ts` (new)

### Finding

**(a) Smart quotes are not normalised.** `normalizeXml()` in **`class TemplateScanner`**
(`server/services/document/TemplateScanner.ts`) handles three invisible characters and no
punctuation:

```ts
return xml
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\uFEFF/g, '') // BOM
    .replace(/\u00A0/g, ' '); // Non-breaking space -> regular space
```

Word's autocorrect turns a straight double quote into U+201C/U+201D and a straight
apostrophe into U+2018/U+2019 as the author types. The result renders wrong text with no error (see TPL-3 Finding (a)).

**(b) `repairXml()` strips any tag inside a placeholder, including structural ones.**

```ts
newXml = newXml.replace(/({{[^}]*?)(<[^>]+>)(.*?}})/g, '$1$3');
```

Probed: a placeholder split across two table cells had its `</w:tc><w:tc>` removed, so
**two cells silently became one**. Rare — it needs a genuinely malformed template — but
silent when it happens.

**(c) There is no unit test for any of this.** `tests/unit/` contains no
`TemplateScanner` file; the only coverage is incidental, through integration tests that
never exercise the split-tag path. The repair runs on every upload
(`templateScanner.scanAndFix(fileBuffer)` in `server/routes/templates.routes.ts`, two
call sites), so it is high-traffic untested code.

### Preferred fix

Extend `normalizeXml()` to map curly quotes back to straight ones. **Scope the
replacement to placeholder bodies** — a global replace would rewrite the author's prose
quotes, which in a legal document is a content change, not a repair. Match `{{ ... }}`
spans first, normalise inside them only.

For (b), narrow the split-tag regex to run-level tags (`<w:t>`, `<w:r>`, `<w:rPr>`,
`<w:proofErr>`, `<w:bookmarkStart/End>` and similar inline elements) rather than `<[^>]+>`.
When a placeholder spans a *structural* boundary (`</w:tc>`, `</w:tr>`, `</w:p>`), leave
the XML alone and report it in `ScanResult.errors` so the upload fails loudly per D2 —
that template is malformed and the author must fix it in Word.

Note the existing paragraph-split behaviour is intentional and must be preserved: a
placeholder split across `</w:p><w:p>` currently repairs cleanly and renders correctly.
Only cell/row boundaries are the problem.

### Ties

- Independent. **May be dispatched in parallel with TPL-1, TPL-2 or TPL-3** — it touches
  neither `RenderCore.ts` nor `docxHelpers.ts`.
- Load `run-tests`.
- File footprint: `server/services/document/TemplateScanner.ts` plus one new unit test
  file. Collides with nothing in this initiative.
- TPL-3 removes the *need* for quoted arguments; this ticket protects the templates that
  still contain them and any prose quotes near placeholders. Both are wanted.

### Acceptance criteria

1. A placeholder containing curly quotes is normalised to straight quotes before
   validation and storage.
2. Curly quotes in ordinary document prose, outside any `{{ }}`, are left untouched.
3. A placeholder split across `<w:t>`/`<w:r>` boundaries still repairs and renders, as it
   does today.
4. A placeholder split across `</w:p><w:p>` still repairs and renders, as it does today.
5. A placeholder spanning a table-cell or row boundary is **not** silently repaired: the
   cells survive intact and `ScanResult.isValid` is false with an error naming the
   problem.
6. New `tests/unit/services/document/TemplateScanner.test.ts` covers 1–5 by constructing
   the XML fixtures directly and asserting on `repairXml()`/`scanAndFix()` output.
7. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
   at or above the baseline recorded in this file's header.

---

## TPL-5 — Persist a template variable inventory and classify its problems 🔲

**Priority: P1** · Size: M · Files: `server/services/templatePlaceholders.ts`, `server/services/document/TemplateValidationService.ts` (or a new sibling service), `server/routes/templates.routes.ts`

### Finding

Nothing tells an author that a template references a variable their interview does not
have. The extraction half already exists — **`extractPlaceholdersDetailed()`** in
`server/services/templatePlaceholders.ts` parses through docxtemplater rather than a
regex, so it sees tags correctly even when Word has split them across runs:

```ts
  doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
  });
```

But the result is computed on demand and thrown away, and it is never compared against
the workflow's alias inventory. The upload path already has a report channel it does not
use for this — `scanAndFix()` returns `ScanResult { fixed, buffer, repairs, isValid,
errors }` at both call sites in `server/routes/templates.routes.ts`.

### Preferred fix

**Parse once, diff on read.** At upload, extract the placeholder inventory and persist it
to the existing `metadata` jsonb column on `templates`
(the `metadata` column on the `templates` table in `shared/schema/workflow.ts`)
— **no migration**. On read, compute the card's status as a set diff of that stored
inventory against the workflow's current alias inventory. Renaming a step alias then costs
a set intersection, not a zip parse, which is what makes "recheck on every change"
affordable.

Classify each problem per **D2**:

| Class | Examples | Behaviour |
|---|---|---|
| Objectively broken | unclosed section, mismatched tags, unknown filter name, reserved `{%`/`{#` | **Hard-fail the upload** |
| Contextually unresolved | variable not in the workflow's alias inventory | **Warn only** — never block |
| Informational | alias defined but never referenced by the template | Surface, not an error |

Import the filter vocabulary from TPL-3 rather than re-listing it. Follow the 3-tier
pattern (route → service → repository) and the error-string contract — load the
`add-api-endpoint` skill; `classifyRouteError` is the standard here.

Include a did-you-mean for unresolved variables (nearest alias by edit distance); it is
what makes the warning actionable rather than nagging.

### Ties

- **Blocked by TPL-3** for the filter vocabulary. Everything else in it is independent, so
  it may start in parallel with Phase 1 and integrate the vocabulary at the end — but it
  cannot be *closed* before TPL-3.
- **Blocks TPL-6**, which renders this ticket's output.
- Load `add-api-endpoint` **and** `run-tests`. Do **not** load `db-schema-change` — the
  `metadata` column already exists and no DDL is permitted in this ticket.
- File footprint: `server/services/templatePlaceholders.ts`, one service file,
  `server/routes/templates.routes.ts`, plus tests. Collides with nothing in Phase 1.

### Acceptance criteria

1. On upload, the extracted placeholder inventory is persisted under `templates.metadata`
   with no schema change.
2. A service method returns, for a template + workflow pair: total variable count, the
   list of unresolved variables with did-you-mean suggestions, the list of objectively
   broken problems, and the list of aliases the template never references.
3. Recomputing that result after a step alias is renamed reflects the new name **without**
   re-parsing the DOCX (assert the parse function is not called).
4. An upload containing an unknown filter name, a reserved `{%`/`{#` tag, or unbalanced
   sections is **rejected** with an error naming the offending tag.
5. An upload referencing variables that do not exist in the workflow **succeeds**, and the
   unresolved names appear in the result of AC2. A test asserts explicitly that this case
   does not throw — it is GH-167's document-first flow.
6. Errors surface through `classifyRouteError` per the repo's error-string contract.
7. Tests cover 1–6, including a template with zero problems asserting empty problem lists
   **and** a non-zero variable count (an all-empty assertion must not be satisfiable by a
   broken extractor).
8. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
   at or above the baseline recorded in this file's header.

---

## TPL-6 — Surface variable health on the template card 🔲

**Priority: P2** · Size: M · Files: `client/src/components/builder/templates/`

### Finding

TPL-5 computes a template's variable health and nothing shows it. Today a template card
gives the author no signal that the document references `cleint_name` and will render a
blank where the client's name should be.

### Preferred fix

Extend the existing template card in `client/src/components/builder/templates/` — do not
build a new panel. Show a compact summary on the card face
(`24 variables · 3 unmapped · 1 error`) with a drill-in listing each problem, its
class per D2, and the did-you-mean suggestion where TPL-5 supplied one.

**Load the `design` skill before writing any UI** — this is the repo owner's standing
instruction for all visual work, and it is not optional on this ticket.

Server state is owned by its TanStack Query hook. Per convention 8 in `CLAUDE.md`, do
**not** mirror any of this into a zustand store — `tests/unit/client/store.deadSetters.test.ts`
guards that boundary and neither `tsc` nor ESLint can.

Error and warning states must be visually distinct: a hard error (blocked upload) and a
warning (unresolved variable) are different actions for the author, and rendering them
identically re-creates the problem this initiative exists to fix.

### Ties

- **Blocked by TPL-5.**
- Load `design` (mandatory), `run-tests`.
- File footprint: `client/src/components/builder/templates/` and its tests. Collides with
  nothing else in this initiative; **may run in parallel with TPL-7 and TPL-8**.
- Existing coverage to extend rather than duplicate: `tests/unit/client/TemplatesTab.test.tsx`.

### Acceptance criteria

1. The template card shows total variable count and problem counts for a template with
   problems.
2. A template with no problems shows the variable count and no error affordance.
3. Drill-in lists each problem with its class and, for unresolved variables, the
   did-you-mean suggestion.
4. Hard errors and warnings are visually and semantically distinct (distinct roles/labels,
   not colour alone — the repo is WCAG 2.2 AA per GH-159).
5. The view reflects an alias rename without a page reload (query invalidation, no
   zustand mirror).
6. Component tests cover 1–5.
7. Live proof per the `verify` skill: screenshots of a template card with problems and one
   without, on the running dev app. RTL tests are not live proof.
8. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
   at or above the baseline recorded in this file's header.

---

## Phase 2 Gate

- [ ] TPL-4, TPL-5, TPL-6 all ✅ with dated verification notes
- [ ] Reviewer has uploaded a deliberately broken template to the running app and
      confirmed: the upload is rejected for a syntax error, accepted with warnings for an
      unknown variable, and the card reflects both
- [ ] `npm run type-check` · `npm run lint` · `npm run test:fast` green
- [ ] Reviewer has committed each passed ticket

---

# Phase 3 — Consumers

## TPL-7 — Answer piping in the runner (delivers roadmap GH-161) 🔲

**Priority: P2** · Size: M · Files: `client/src/components/runner/`

### Finding

Answer recall exists in exactly one place and covers one of the three surfaces GH-161
asks for. **`interpolateVariables()`** in
`client/src/components/runner/blocks/DisplayBlock.tsx`:

```ts
return text.replace(/\{\{([^}]+)\}\}/g, (_match: string, variableName: string) => {
    const key = variableName.trim();
    const resolvedStepId = aliasMap?.[key];
    const value = resolvedStepId !== undefined ? context[resolvedStepId] : context[key];

    if (value === undefined || value === null) {
      return ""; // Replace missing variables with empty string
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }
```

Three gaps visible in that block alone: it is display-blocks only (question titles render
raw — `{step.title}` in `client/src/components/runner/blocks/BlockRenderer.tsx`), it has
no filter support, and a structured value (address, choice, list) renders as **raw JSON**
in front of the respondent.

The `aliasMap` plumbing already exists and works — built in
`client/src/components/runner/SectionSteps.tsx` and threaded through `BlockRenderer`.

### Preferred fix

Extend piping to question titles and descriptions using the **same grammar TPL-2/TPL-3
define** — one language across documents and runner, which is the whole point of the
initiative. Reuse the existing `aliasMap` rather than building a second resolution path.

For structured values, use the shared `formatAnswerValue` and dispatch through
`normalizeRunnerStepType` — GH-162 made these canonical and its first submission was
**rejected** for hand-rolling local formatting that broke on List-nested values. Do not
repeat that.

**Escape by default.** Piped answers are respondent-supplied text landing in runner
markup; escaping must be structural (escape at the interpolation boundary, opt out
explicitly) rather than a sanitizer call at each render site. Note `rehype-raw` is
deliberately not enabled on the markdown path — see the standing warning in
`client/src/components/runner/sections/FinalDocumentsSection.tsx`. Do not enable it.

Missing references follow D3's spirit: blank, or a `| default(...)` fallback. A missing
answer must never break the runner mid-interview — this is the one place strict-undefined
does **not** apply, because the respondent has not answered yet by design.

### Ties

- **Blocked by TPL-2 and TPL-3** (the grammar).
- **Delivers roadmap ticket GH-161** in `tickets/ROADMAP_TICKETS.md`. GH-161 is not
  separately dispatchable and closes when this ticket closes.
- Load `design` (visible UI), `run-tests`.
- File footprint: `client/src/components/runner/`. Collides with nothing else here; may
  run in parallel with TPL-6 and TPL-8.

### Acceptance criteria

1. Question titles, descriptions and display blocks all interpolate `{{alias}}`.
2. Piped text updates reactively when a referenced earlier answer changes.
3. Filters work in the runner with the same syntax and vocabulary as in documents,
   proven for at least a case transform and a currency/date preset.
4. Structured values (address, multiple choice, list item) render human-readable labels
   via `formatAnswerValue`/`normalizeRunnerStepType`, including values nested inside a
   List — not raw JSON.
5. An unanswered or missing reference renders blank, or the `| default(...)` value; it
   never throws and never blocks the interview.
6. Interpolated answer text is escaped: a respondent answer containing markup is rendered
   as literal text. A test asserts this with a script-tag-shaped answer.
7. Tests cover 1–6, including the List-nested case from AC4.
8. Live proof per the `verify` skill: a run where a later question title recalls an
   earlier answer, screenshotted, including the reactive update after editing the earlier
   answer.
9. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green
   at or above the baseline recorded in this file's header.

---

## TPL-8 — Document the template language, including what already worked 🔲

**Priority: P2** · Size: S · Files: `docs/guides/VARIABLES_IN_DOCUMENTS.md`, `server/services/document/README.md`

### Finding

`docs/guides/VARIABLES_IN_DOCUMENTS.md` carries **130 of the 150 occurrences** of the old
prefix syntax repo-wide. After TPL-3 every one of them documents a grammar that raises an
error.

Worse, the capabilities that **already work** are undocumented, so nobody uses them.
Proved working 2026-08-09 and absent from the guide: table row loops, conditional single
rows, multi-row conditional spans, nested loops, mid-sentence conditional text, and
object scope-push sections. A competitor template the repo owner supplied hand-builds ten
indexed rows because the author had no way to know row loops exist.

### Preferred fix

Rewrite the guide around the new grammar, and add a **structural** section covering the
constructs above, each with a copy-pasteable Word recipe (which cell the opening tag goes
in, which cell closes it).

Document the one authoring trap found in probing: a multi-row conditional written with
**dedicated marker rows** leaves those rows behind as empty rows when the condition is
true. The supported form puts the tags in the first and last **content** rows, which
works correctly in both directions. Say so explicitly — it is not discoverable.

Also document the filter vocabulary from TPL-3, the strict-undefined behaviour from D3
(and how `| default(...)` opts out of it), and the reserved `{%`/`{#` delimiters so
authors migrating from `docxtpl` get a clear message instead of a mystery.

### Ties

- **Blocked by TPL-2 and TPL-3** (documents their grammar). Independent of everything
  else; may run in parallel with TPL-6 and TPL-7.
- File footprint: docs only. Collides with nothing.
- `CLAUDE.md`'s documentation index lists the guide — check whether its one-line
  description still holds after the rewrite.

### Acceptance criteria

1. Zero occurrences of the removed prefix syntax remain in `docs/`
   (`grep -rn` proof in the turn-in report).
2. Every filter in TPL-3's vocabulary is documented with an example.
3. A "structural constructs" section documents row loops, conditional rows, multi-row
   spans, nested loops, mid-sentence conditionals and scope-push sections, each with the
   exact cell placement.
4. The marker-row trap is documented with both the broken and the supported form.
5. Strict-undefined behaviour and `| default(...)` are documented.
6. Reserved `{%`/`{#` delimiters are documented with the error authors will see.
7. Every code sample in the guide actually renders. This is enforced by a test, not by
   inspection: a new `tests/unit/services/document/docSamples.test.ts` holds each documented
   sample alongside its expected output and renders it through `renderDocxBuffer`. A sample
   that stops working then fails the suite instead of rotting silently in the docs.
8. The structural recipes from AC3 are among the samples covered by AC7's test — including
   the marker-row trap, asserted in both its broken and supported form.
9. `npm run type-check` 0 errors · `npm run lint` 0 problems · `npm run test:fast` green at
   or above the baseline recorded in this file's header.

---

## Phase 3 Gate

- [ ] TPL-7, TPL-8 ✅ with dated verification notes
- [ ] Roadmap GH-161 flipped to ✅ referencing TPL-7, and the Phase 4 counters **recounted**
      from the ticket headings (not incremented — see the GH-155 closure note for why)
- [ ] Full `npm run test:fast` green at or above the header baseline
- [ ] Reviewer has committed each passed ticket

---

## Backlog / observations

Not tickets. Found during the 2026-08-09 investigation. Promote only with the repo
owner's say-so.

- **TPL-O1 (enhancement) — object key/value iteration.** `{{#fees}}` pushes scope; it
  does not iterate an object's unknown keys. "One table row per fee, whatever fees exist"
  needs a data-layer transform to `[{key, value}]` in `VariableNormalizer`, not a grammar
  change. No current template needs it.
- **TPL-O2 (informational) — `{{^inverted}}` sections work** and are undocumented. TPL-8
  may fold them into the structural section; not worth its own ticket.
- **TPL-O3 (enhancement) — clause library.** The competitor templates suggest authors
  want reusable clause blocks. Jinja would solve this with `{% include %}`/macros;
  docxtemplater's subtemplate module is commercial. The better answer here is probably a
  *content* feature (a clause picker in the builder) rather than template inheritance.
  Needs its own initiative if wanted.
- **TPL-O4 (enhancement) — legal drafting filters.** GH-173 wants legal hierarchical
  numbering, party singular/plural agreement and pronoun agreement. These are natural
  filters in TPL-3's vocabulary once it exists, and GH-173 should implement them there
  rather than as a separate mechanism.
- **TPL-O6 — CONFIRMED and promoted into TPL-9** (2026-08-09). `{{ d | date }}` returns
  the previous calendar day where `{{ d | formatDate }}` is correct. No longer an
  observation; see TPL-9 Finding (b).
- **TPL-O7 (product-decision) — business-day and holiday date math.** Parked by the repo
  owner 2026-08-09 when TPL-9 was scoped. "30 business days", and deadlines that roll off a
  weekend or holiday, are common legal terms and are unexpressible today (`addBusinessDays`
  does not exist). Deliberately **not** in TPL-9: business-day arithmetic is only correct
  against a holiday calendar, and that is jurisdiction-specific — US federal, per-state, or
  non-US for foreign clients. Three options when promoted: weekends-only (honest, simple,
  documents its own limit), a fixed US federal list, or a per-workspace configurable
  calendar. Needs a repo-owner decision on which before it is sized; the calendar choice,
  not the arithmetic, is the whole cost.
- **TPL-O5 (test-coverage) — no test renders a template through the full upload → store →
  generate path** with a real workflow's answers. Every test in this initiative builds
  buffers in-memory. An integration test covering the real path would have caught the
  smart-quote bug years earlier.

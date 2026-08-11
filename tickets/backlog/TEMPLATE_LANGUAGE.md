# Template Language (TPL) — retired 2026-08-10

Initiative ran 2026-08-09 → 2026-08-10. **11 of 11 tickets closed.** `test:fast` went
2814 → 3031. Full detail of any closed ticket: `git log -p -- tickets/TEMPLATE_LANGUAGE_TICKETS.md`.

One grammar now serves both DOCX templates and runner answer-piping, parsed in a single place
(`server/services/document/RenderCore.ts`). Authoring guide:
`docs/guides/VARIABLES_IN_DOCUMENTS.md`, whose examples are executable in
`tests/unit/services/document/docSamples.test.ts`. Which-system-am-I-in guide:
`docs/guides/SCRIPTING_VS_TEMPLATE_FILTERS.md`.

## Closed — do not re-file

| Ticket | What shipped |
|---|---|
| TPL-1 | Spike: adopt `angular-expressions` over hand-rolling; deleted the dead `createAngularParser` |
| TPL-2 | Expression layer — pipe filters, chaining, comparisons in section tags, array indexing, `{{$index}}`; reserved `{%`/`{#` |
| TPL-3 | Named preset vocabulary, deleted the legacy prefix grammar, strict-undefined |
| TPL-4 | Scanner stops mangling cell-spanning placeholders; first unit tests that file ever had |
| TPL-5 | Placeholder inventory persisted to `templates.metadata`; problems classified per D2 |
| TPL-6 | Variable health on the template card — counts, did-you-mean, errors distinct from warnings |
| TPL-7 | Runner answer piping on the shared grammar (**closed roadmap GH-161**) |
| TPL-8 | Guide rewritten; 33 documented samples made executable |
| TPL-9 | Date filters — `addDays:"30"` fixed, two date formatters reconciled, month/year arithmetic |
| TPL-10 | `RunDataService` seeds every alias as `null` so strict mode can tell unanswered from unknown |
| TPL-11 | Static extractor taught the pipe grammar |

## Decisions (repo owner) — settled, do not relitigate

- **D1** One grammar, no compatibility shim. The DB held only disposable test data, so the
  prefix form was deleted outright rather than deprecated.
- **D2** Loud failures split by class: objectively broken (syntax, unknown filter, reserved
  delimiters) hard-fails the upload; an unresolved *variable* only warns, because uploading a
  document before the interview exists is GH-167's supported flow.
- **D3** Strict-undefined distinguishes *unknown* (raises) from *known but empty* (renders blank).
- **D4** Pipe syntax with colon-form arguments; `{%` and `{#` reserved now though unimplemented.

## Open observations

- **TPL-O7 — business-day and holiday date math.** `product-decision`. "30 business days" and
  deadlines that roll off a weekend are unexpressible. The arithmetic is trivial; the holiday
  calendar is the entire cost and it is jurisdictional. Three options: weekends-only (honest,
  documents its own limit), a fixed US federal list, or a per-workspace calendar. **Worth
  answering before GH-173 writes retainer and NDA templates**, which is exactly where the term
  appears.
- **TPL-O1 — object key/value iteration.** `enhancement`. `{{#fees}}` pushes scope; it does not
  iterate an object's unknown keys. "One row per fee, whatever fees exist" needs a transform to
  `[{key, value}]` in `VariableNormalizer`, not a grammar change. No current template needs it.
- **TPL-O3 — clause library.** `needs-initiative`. Competitor templates suggest authors want
  reusable clause blocks. Jinja solves this with `{% include %}`/macros; docxtemplater's
  subtemplate module is commercial. The better answer is probably a *content* feature (a clause
  picker in the builder) rather than template inheritance.
- **TPL-O5 — no integration test covers upload → store → generate** with a real workflow's
  answers. Every test in the initiative builds buffers in memory. Such a test would have caught
  the smart-quote bug years earlier.
- **Filter vocabulary has near-duplicates.** `informational`. Layering presets over the original
  helpers left `titleCase`/`titlecase`, `default`/`defaultValue`, three currency spellings and
  four date spellings. All render; there is just no single obvious name to teach. Documented in
  `SCRIPTING_VS_TEMPLATE_FILTERS.md` with a recommendation to prefer the preset names.

## Lessons worth carrying

- **Every defect in this initiative lived at a seam between tickets**, and each one passed its
  own ticket's gates. TPL-2 shipped a grammar and silently broke the static extractor (→ TPL-11).
  TPL-3 shipped strict mode and would have broken document generation for every unanswered
  optional field (→ TPL-10). Both were found by probing *adjacent* code after the ticket passed,
  not by the ticket's own criteria. Budget reviewer time for that, not just for the ACs.
- **Re-scope a ticket against what actually shipped before dispatching it.** TPL-3 and TPL-4
  each had premises invalidated by the ticket before them — smart-quote handling and
  unknown-filter rejection both became free. Probing first saved building things twice.
- **Verify by rendering, never by reasoning.** Several "obvious" docxtemplater behaviours went
  the other way when actually tested. Build a real DOCX with PizZip and run it through
  `renderDocxBuffer`.
- **A quoted baseline is not a result.** One submission reported the worktree's creation-time
  test count as its passing count. That is indistinguishable from a suite that never ran the
  new tests. Always paste the number your own run printed.
- **The board conflicted on merge twice, and both times that was the good outcome** — the same
  shape silently auto-merged into a wrong count during GH-155. Recount from the ticket
  headings; never hand-increment.

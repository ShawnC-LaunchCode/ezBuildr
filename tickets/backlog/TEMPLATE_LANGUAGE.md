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
- **TPL-O8 — author-set download names for generated documents.** `enhancement` · filed
  2026-09-15 by owner request · est. Size M. Today a respondent downloads
  `4c1df78d-f13d-…-<alias>-<uuid>.pdf`. The ask: when adding a template to the Final Documents
  step, the author types a name that reads workflow variables, e.g.
  `Advanced Healthcare Directive - {{ client_last_name }} - {{ today | formatDate:"M-D-YY" }}`
  → `Advanced Healthcare Directive - Cooley - 9-15-26.pdf`.

  **Where the ugly name comes from** (anchors are quotes; line numbers drift).
  `EnhancedDocumentEngine.generateFinalBlockDocuments` passes
  `` outputName: options.runId ? `${options.runId}_${doc.alias}` : doc.alias ``, and
  `DocumentEngine.generate` appends `` -${crypto.randomUUID()} ``. That one string is then
  used for five different jobs at once:
  1. **Display.** `RunCompletionView.tsx` (`{doc.fileName}`), `FinalDocumentsPage.tsx`,
     `ExecutionDetailView.tsx` and the builder `RunsTab.tsx`.
  2. **Lookup key.** `GET /api/runs/:runId/final-documents/:filename/download`
     (`finalBlock.routes.ts`) finds the row with `docs.find(d => d.fileName === sanitizedFilename)`.
  3. **Storage key.** `` `runs/${runId}/documents/${filename}` `` (`FinalBlockRenderer.prepareResponseDocuments`).
  4. **Saved name.** The route's `Content-Disposition`, and the client's `link.download = fileName`
     in `downloadRunDocument` (`client/src/lib/vault-api.ts`).
  5. **Other copies.** ZIP entries (`createArchive`, `path.basename`) and every delivery
     adapter's `fileName: doc.fileName` (email, webhook, cloud storage).

  **Preferred shape.**
  - **Keep the internal filename unique and ugly.** It is a key, so do not make it pretty. Add a
    separate nullable `display_name` column on `run_generated_documents`.
    - Jobs 1, 4 and 5 read `displayName ?? fileName`; jobs 2 and 3 keep the unique name.
    - `Content-Disposition` needs RFC 5987 `filename*=UTF-8''…`, because names now carry
      spaces and non-ASCII. `admin.routes.ts` already does this.
  - **Config.** Add an optional `downloadName` on each `FinalBlockConfig.documents[]` entry,
    in both `shared/types/stepConfigs.ts` and `FinalBlockConfigSchema`.
    - Put it on the entry, **not** on `templates`: one template is reused across workflows whose
      aliases differ, and the name reads *this* workflow's variables.
  - **Render through `RenderCore`.** CLAUDE.md convention #9: one grammar. Do not write a second
    mini-parser for names. Feed it the same normalized data the document body sees.
    - Validate the name at save time with the static extractor, the same way a template upload
      is scanned (D2).
    - At run time, a render failure falls back to the default name and logs a warning. It must
      **never** fail the document.
  - **`today` does not exist.** A grep for it across `server/` finds nothing. Add it to the data
    that both the name and the document body see, because templates want it too.
  - **Sanitize the rendered name.**
    - Replace `\ / : * ? " < > |`. This means `M/D/YY` would break, so the guide should show dashes.
    - Collapse runs of whitespace and separators, so a skipped optional answer does not leave
      `Directive -  - 9-15-26`.
    - Cap the length, then append the extension.
  - **Collisions.** Two entries that render the same name in one run get ` (2)`. `ZipBundler`
    already de-dupes, so pass it the display name.
  - **Default when the name is blank.** Use `templates.name`, not the UUID.
    - This is a cheap first slice on its own: it fixes the name for every existing workflow,
      and nobody has to configure anything.

  **Open questions (owner):**
  - **Q1: which timezone is `today` in?** Nothing in `shared/schema` stores a timezone. The
    server runs in UTC, so a Central-time evening run on 9-15 would be named 9-16.
    Recommendation: capture the respondent's browser timezone when the run completes, because
    it is their date. Related: `STB-B2` (backlog/STEP_TOOLBOX.md).
  - **Q2: do delivery destinations use the display name too?** Recommendation: yes. An emailed
    attachment called `<uuid>.pdf` is the same bug in a different place.
  - **Before promoting, confirm `formatDate` accepts `M-D-YY` tokens.**

  **Ties:** skills `db-schema-change` (new column), `add-api-endpoint` (download route),
  `design` (the name field in the Final Documents inspector, plus the four display surfaces),
  `run-tests`. Guide: `docs/guides/VARIABLES_IN_DOCUMENTS.md` needs a naming section and
  a runnable sample in `docSamples.test.ts`.
  **Vertical proof:** set the name in the builder, run the workflow, complete it, then check
  three things: the completion page text, the saved file's name, and the ZIP entry name. Keep
  the renderer, route and storage unmocked.
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

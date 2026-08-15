# Legal Drafting Primitives & Curated Templates (LD)

**Status:** open · **Written:** 2026-08-12
**Parent ticket:** GH-173 in `tickets/ROADMAP_TICKETS.md` (🔲 — do **not** close it until LD-1 *and* LD-2 are done)
**Ticket prefix:** `LD-1..2`

---

## Why this board exists

GH-173 is a Size-M roadmap epic with three broad acceptance criteria: drafting helpers,
three curated starter templates, and sample DOCX files with mappings. That is not one
dispatchable unit of work — it is a server-side filter task and a content/fixture task
with a hard dependency between them. Parting it out here keeps one commit per ticket
and stops a dev from having to guess where to start.

**Do not dispatch LD-2 before LD-1 lands.** The curated templates are written *in* the
vocabulary LD-1 adds; authoring them first means rewriting them.

---

## Already done — do not rebuild

**GH-173 AC1 names "date calculation helpers". Those exist as of 2026-08-11 (BIZ-1).**
`addBusinessDays`, `nextBusinessDay`, `businessDaysBetween` and `addWeekdays` are
registered filters, with a workflow-level `businessDayCalendar` setting
(`weekends-only` default, `us-federal` option) and algorithmic federal-holiday
observation. Detail: [`tickets/backlog/BUSINESS_DAYS.md`](backlog/BUSINESS_DAYS.md) (the BIZ
initiative retired 2026-08-12). **Use them; do not write new date math.**

Outstanding on that work: no one has rendered a real DOCX with a business-day deadline
across a federal holiday. If LD-2 builds a retainer template with a deadline, that
doubles as the missing proof — say so in the turn-in.

---

## The four grammar rules that will bite you

From CLAUDE.md convention 9. Each was paid for once already; do not rediscover them.

1. **Register filters from the `docxHelpers` object** (`server/services/docxHelpers.ts:678`),
   never via `import * as`. The module namespace misses the 8 merged in through
   `...formatters` at line 680 (`currency`, `date`, `upper`, …).
2. **An unknown *top-level* variable raises; a known-but-empty one renders blank.**
   `RunDataService` seeds every alias as `null` so a skipped optional question is not
   mistaken for a typo. Filters must tolerate `null`/`undefined` inputs and render blank
   rather than throwing.
3. **`{%` and `{#` are reserved and rejected**, and that scan runs on markup-stripped
   text because Word splits tags across runs.
4. **Filter arguments are colon-form** — `| default:"N/A"`. Parenthesised does not parse.

`docs/guides/VARIABLES_IN_DOCUMENTS.md` is the authoring guide and its examples are
**executable** in `tests/unit/services/document/docSamples.test.ts`. Update both together
or the doc test fails.

---

## LD-1 — Legal drafting primitive filters ✅ DONE 2026-08-12

**Closed by:** `0f1531f6`, merged as `cf59fa36`. **LD-2 is now UNBLOCKED.**

**Gates were run by the reviewer, not the implementer** — the dev session was terminated
by an org spend limit immediately before its gate run, so the code arrived complete but
unverified. Verified here: `type-check` 0 errors · `lint` 0 problems · `test:fast`
**3113 passed / 0 failed** (baseline 3066 + 47 new tests).

All 7 ACs met. Notes for LD-2 and beyond:
- Filters live in `server/services/draftingPrimitives.ts`, spread onto the `docxHelpers`
  object (`...draftingPrimitives`) exactly as `formatters` is.
- **Numbering is a pure function of explicit ordinals** — no hidden counter, so a skipped
  conditional section cannot silently renumber a contract. Do not add statefulness.
- **Pronouns: explicit values only, `they/them` default.** Verified by reading the source,
  not just the test: no gendered-name list, no honorific table, no first-name guess
  anywhere. AC3's proof holds the name constant and varies only the explicit value.
  **Do not add an inference path in LD-2 or later.**
- Reachability through `RenderCore` is proven with real pipe tags
  (`v | legalNumber:b:c` → `1.1.1`), not direct function calls.

**Priority: P2** · Size: M · Files: `server/services/docxHelpers.ts`, `server/utils/formatters.ts` (if shared), `docs/guides/VARIABLES_IN_DOCUMENTS.md`, `tests/unit/services/docxHelpers.test.ts`, `tests/unit/services/document/docSamples.test.ts`

### Finding

GH-173 AC1 asks for legal hierarchical numbering, party singular/plural agreement, and
pronoun agreement. Observation TPL-O4 settled the *how*: these must be **filters in the
shipped template vocabulary**, not a separate mechanism. There is one grammar and
`RenderCore` owns it.

None of the three exists today.

### Preferred fix

Add three filter families to the `docxHelpers` object:

**(a) Legal hierarchical numbering.** Section/subsection numbering in the conventional
legal styles — `1.`, `1.1`, `1.1.1`, and the lettered/roman variants `(a)`, `(i)`,
`(A)`. Decide and **document** whether numbering is stateful across a document or a
pure function of an explicit level+index, and prefer the pure function: a stateful
counter inside a filter is invisible to the author and breaks when a conditional
section is skipped.

**(b) Party plurality agreement.** Given a party count or a list, select the correct
form: `party/parties`, `is/are`, `its/their`, `has/have`. Colon-form args, e.g.
`{{ parties | plural:"party":"parties" }}`, plus a convenience for the common verb
pairs. Must handle 0 and 1 distinctly if the drafting convention differs.

**(c) Pronoun agreement.** ⚠️ **Read this before designing it.**

**Never infer pronouns from a name, a title, or any other proxy.** A name does not
indicate anyone's pronouns, and a wrong guess misgenders a real client in a document
that gets signed. The filter must take pronouns from an **explicit** value — a question
answer or an explicit party field — and **default to they/them** when absent. Do not add
a "guess from first name" path, a gendered-name list, or an honorific heuristic, even as
a fallback. If the data is missing, they/them is correct and safe.

Given an explicit pronoun set, the filter supplies the agreeing forms
(subject/object/possessive/reflexive) and the matching verb agreement for they/them
(`they are`, not `they is`).

### Ties

- Load `add-step-type` **only** if you decide a new question type is needed to capture
  pronouns; prefer reusing an existing text/choice question and documenting the
  convention. Do not add a step type casually — it touches ~10 files.
- The four grammar rules above.
- **File footprint collides with LD-2** (`VARIABLES_IN_DOCUMENTS.md`, `docSamples.test.ts`)
  — LD-2 is sequenced after this, so no concurrency problem.
- No overlap with G171-6 or BIZ-2.

### Acceptance Criteria

1. Hierarchical numbering filters render `1.1.1`, `(a)`, `(i)` and `(A)` styles, with the
   stateful-vs-pure decision **documented in the guide**, and pure preferred.
2. Plurality filters agree `party/parties` and at least `is/are`, `its/their`, `has/have`,
   with 0/1/many all covered by tests.
3. Pronoun filters take an **explicit** pronoun value and **default to they/them** when it
   is absent or empty. A test asserts the default. **A test asserts that no name-based
   inference occurs** — same name, two different explicit pronoun values, two different
   outputs.
4. Every new filter renders **blank rather than throwing** on `null`/`undefined` input
   (rule 2 above), proven by a test per filter family.
5. All filters registered on the `docxHelpers` object and reachable through `RenderCore`
   — proven by a `RenderCore` test rendering a real template string, not just a unit call.
6. `docs/guides/VARIABLES_IN_DOCUMENTS.md` documents each filter with a colon-form
   example, and the corresponding examples are executable in `docSamples.test.ts`.
7. `type-check` 0 errors · `lint` 0 problems · `test:fast` above the dispatch baseline ·
   `test:integration` no new failures (baseline at dispatch: **2 files / 2 tests failed**).

---

## LD-2 — Curated starter templates with sample DOCX and mappings ✅ DONE 2026-08-15

**Verified by the reviewer, independently of the dev's report.** The dev session stopped
without turning in gates, so every gate below was re-run by the reviewer in the `ld-2`
worktree, and the two most falsifiable criteria were checked from scratch rather than read
off the submission.

- `type-check` **0 errors** · `eslint --max-warnings 0` on the new test **exit 0**
- `test:fast` **274 files / 3209 passed / 0 failed** (dispatch baseline 3198 → +11, exactly
  the new tests)
- `test:integration` **112 files / 1116 passed / 0 failed**

⚠️ **Process note worth keeping.** The dev's integration run and the reviewer's overlapped
on the *same* worktree database, which is the documented clobbering hazard — so neither
result was authoritative. The number above is from a **third run, executed alone against a
freshly recreated `ezbuildr_test_ld_2`**. Concurrent DB-backed suites manufacture failures
rather than false greens, so the agreement between all three runs is reassuring, but only
the isolated run is evidence.

**Independently re-verified, not taken on trust:**
- **AC4's holiday arithmetic.** 2026-09-04 is a Friday and 2026-09-07 is the Monday of Labor
  Day — both confirmed by direct date computation. +2 business days on `us-federal` therefore
  lands on Wednesday 2026-09-09, skipping the weekend *and* the holiday. The suite also
  renders the same data under `weekends-only` and asserts Sep 8, a discriminating check that
  the calendar setting drives the skip rather than the arithmetic.
- **AC3's "shipped vocabulary only".** All ten filters used across the three templates
  (`pronounSubject`, `pronounVerb`, `pronounPossessive`, `capitalize`, `longdate`,
  `addBusinessDays`, `usd`, `plural`, `isAre`, `hasHave`) resolve to real registered helpers
  in `draftingPrimitives.ts` / `docxHelpers.ts` / `formatters.ts`. No bespoke mechanism.
- **Scope guard.** `git status` shows changes confined to `templates/` and one test file —
  nothing under `server/` or `client/`, so no route, service or state machine was added.
  `workflows.intakeConfig` was confirmed live: a `notNull` jsonb column with real route and
  service consumers.
- **A real rendered document was produced and read**, not just asserted in a test — output
  includes the holiday-crossing deadline ("September 9, 2026"), `$450.00`/`$5,000.00`
  currency, correct plural/has-have agreement, and the they/them default producing
  "They acknowledge … their obligations" rather than "They acknowledges".

This also closes the **BIZ board's outstanding gate item** — a real DOCX rendering a
business-day deadline across a federal holiday.

**Disclosed deviation (accepted):** the dev staged files with `git add` mid-flight, against
the no-staging rule, then caught it and ran `git restore --staged`. Reviewer confirmed the
tree was untracked-only before committing. No commit was made by the dev.

**Follow-up observation, not a defect:** the retainer renders "2 additional attorneys" where
legal drafting convention would spell small numbers ("Two"). A `spellNumber`-style filter is
a reasonable future addition; filed as an observation rather than a send-back.

**Priority: P2** · Size: M · **Unblocked — LD-1 landed `cf59fa36`.** · Files: `templates/curated/**` (location decided and documented in its README), `tests/unit/services/document/curatedTemplates.test.ts`

### 🚫 Scope guard — "Intake Questionnaire" is CONTENT, not the old intake pipeline

**Do not resurrect the `/intake/*` pipeline.** It was deliberately removed by O-12, and
`intakeStateMachine` was deleted as dead code in LIST2-10. Neither comes back here, and a
submission that reintroduces either fails this ticket.

The "Intake Questionnaire" deliverable is a **curated starter workflow** — a set of
questions plus a sample DOCX and variable mappings, authored in the existing template
vocabulary. It is data, not a mechanism. It adds **no routes, no state machine, and no new
runtime path**. Workflows already carry a live `intakeConfig` field; if the template needs
intake behaviour, it uses that existing field.

Related dead code you may trip over — **report, do not adopt**: `createAnonymousRun` in
`RunService` is the removed pipeline's orphaned helper (filed as RM-2 in
`tickets/BACKLOG.md`), and vestigial `/intake` rate-limiter registrations still sit at
`server/index.ts:48` and `server/production.ts:56` pointing at a route tree that no longer
exists.

### Finding

GH-173 AC2/AC3: ship an NDA, a Retainer Agreement, and an Intake Questionnaire as
curated starter templates, each with a sample DOCX and pre-configured variable mappings.

Every customer template will descend from these three, so the grammar they are written
in becomes the de facto house style. That is why they wait for LD-1.

### Preferred fix

Author the three templates using **only** the shipped vocabulary — including LD-1's
drafting primitives and BIZ-1's business-day filters. The retainer's payment or response
deadline should use `addBusinessDays` with the `us-federal` calendar, which also supplies
the real-DOCX holiday proof still outstanding on the BIZ board.

Decide where curated content lives and **write the decision down**; a starter template is
data, and burying it in a component is how it becomes uneditable.

### Ties

- **Depends on LD-1.** Do not start until it is merged.
- Shares `VARIABLES_IN_DOCUMENTS.md` and `docSamples.test.ts` with LD-1.
- Load `verify` — this ticket should end with a rendered document a human has looked at.

### Acceptance Criteria

1. Three curated templates exist: NDA, Retainer Agreement, Intake Questionnaire — as
   authored content only. **No new route, state machine, or runtime path is added**, and
   neither the removed `/intake/*` pipeline nor `intakeStateMachine` is reintroduced.
2. Each ships a sample `.docx` with pre-configured variable mappings that resolve against
   a real run.
3. Templates use only the shipped vocabulary — **no bespoke drafting mechanism**.
4. At least one template exercises a business-day deadline across a federal holiday, and
   the rendered date is **checked by hand** and the check recorded. This closes the
   outstanding BIZ gate item.
5. Where curated content lives is documented.
6. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

---

## Gate

- [x] LD-1 ✅ with a dated verification note — 2026-08-12, `0f1531f6` / `cf59fa36`
- [x] LD-2 ✅ with a dated verification note — 2026-08-15, gates re-run by the reviewer
- [ ] **A human has opened at least one rendered curated document and read it** —
      ⚠️ **the one item neither the dev nor the reviewer can satisfy.** Both read the
      rendered *prose* (extracted from `word/document.xml`) and it is correct, but no
      person has opened the file. A rendered retainer was produced for this purpose:
      render it with `renderDocxBuffer` against
      `templates/curated/retainer-agreement/template.docx` using the sample data in
      `tests/unit/services/document/curatedTemplates.test.ts`
- [x] `pronoun` filters proven to have no name-inference path — established at LD-1 by
      reading the source, and re-evidenced here: the retainer holds the client name constant
      (`Grace Hopper`) with `client_pronoun: null` and renders the they/them default
      ("They acknowledge … their obligations"), so no name-derived inference occurs
- [ ] GH-173 flipped to ✅ in `tickets/ROADMAP_TICKETS.md`, **and the phase/overall
      counters recounted** — recount the phase rows, do not increment (the counters have
      drifted twice from per-ticket increments). **Deliberately not done yet:** the human-read
      item above is still open, and GH-173 should not be closed before its own gate is
- [x] Reviewer has committed each passed ticket

# Legal Drafting Primitives & Curated Templates (LD) — retired 2026-08-18

Initiative ran 2026-08-12 → 2026-08-18. **2 of 2 tickets closed, gate fully satisfied.**
Full detail of any closed ticket: `git log -p -- tickets/LEGAL_DRAFTING_TICKETS.md`.

Shipped the legal drafting filter vocabulary (`server/services/draftingPrimitives.ts`,
spread onto the `docxHelpers` object) and three curated starter templates at
`templates/curated/<slug>/{workflow.json,mapping.md,template.docx}`.

**The parent epic GH-173 was deliberately NOT closed by this board.** Its remaining
acceptance criteria were delivery, not authoring — the curated templates shipped inert, with
no consumer in `server/` or `client/`. That work became the **TM board**, which shipped and
**retired 2026-08-18** → [`TEMPLATE_MARKETPLACE.md`](TEMPLATE_MARKETPLACE.md).

**Resolved 2026-08-18: GH-173 is never getting "flipped".** The Roadmap epics board retired
into [`ROADMAP.md`](ROADMAP.md) before TM closed, so no file or counter remained; the repo
owner ruled the item dropped. `BACKLOG.md` records GH-173 as *"substantially delivered by the
LD and TM boards"*, and the epic stays parked as `needs-initiative` for anything beyond that.

## Closed — do not re-file

| Ticket | What shipped | Commit |
|---|---|---|
| LD-1 | Legal drafting primitive filters — hierarchical numbering (`1.1.1`, `(a)`, `(i)`, `(A)`), party plurality agreement (`plural`, `isAre`, `hasHave`), pronoun agreement with a they/them default | `0f1531f6` → `cf59fa36` |
| LD-2 | Three curated starter templates — NDA, Retainer Agreement, Intake Questionnaire — each with sample DOCX and variable mappings, authored in shipped vocabulary only | 2026-08-15 |

**Gate closed 2026-08-18:** the repo owner opened a rendered curated document and read it.
That was the one criterion neither dev nor reviewer could satisfy — both had only read the
prose extracted from `word/document.xml`.

## Settled rulings — do not relitigate

- **Pronouns come from an explicit value, and never from inference.** No gendered-name list,
  no honorific heuristic, no first-name guess — not even as a fallback. Absent an explicit
  value the filter renders **they/them**, with matching verb agreement (`they are`, not
  `they is`). Verified at LD-1 by reading the source rather than the tests, and re-evidenced
  at LD-2: the retainer holds the client name constant (`Grace Hopper`) with
  `client_pronoun: null` and renders "They acknowledge … their obligations".
  **A future ticket proposing name-based inference as a convenience should be rejected on
  sight** — a wrong guess misgenders a real client in a document that gets signed.
- **Legal numbering is a pure function of explicit ordinals.** No hidden counter, no
  statefulness across a document. This is what stops a skipped conditional section silently
  renumbering a contract. Do not add statefulness.
- **Curated content lives at `templates/curated/<slug>/`**, documented in that directory's
  README. A starter template is data; burying it in a component is how it becomes uneditable.

## Open observations

- **LD-O1 — no number-spelling filter.** `enhancement`. The retainer renders
  "2 additional attorneys" where legal drafting convention spells small numbers
  ("Two additional attorneys"). A `spellNumber`-style filter is a reasonable addition to the
  drafting primitives — pure function, same shape as the existing ones, no grammar change.
  Filed as an observation at LD-2 review rather than a send-back; nothing is broken.
- **LD-O2 — vestigial `/intake` rate-limiter registrations.** `informational`, P3.
  `app.use('/intake', globalLimiter)` still sits at `server/index.ts:48` and
  `server/production.ts:56`, pointing at a route tree that no longer exists — O-12 removed
  the `/intake/*` pipeline and there is no `IntakeService` and no router mounted there
  (re-verified 2026-08-18). Harmless in itself, but the **security comment above it is
  actively misleading**: it claims the limiter covers "`/intake/*` (incl. file upload and
  slug enumeration)", describing protection of a surface that does not exist. Fix the comment
  with the registration. Distinct from `RM-2` (`RunService.createAnonymousRun`), which is the
  same pipeline's other orphan and is already indexed separately.

## Cross-checks done at retirement — do not re-derive

- **`createAnonymousRun` is already `RM-2`**, filed at the roadmap merge 2026-08-06. LD-2's
  scope guard mentioned it as a "report, do not adopt" hazard; it is **not** re-filed here.
- **LD-2 did not close the BIZ gate**, despite its turn-in note saying so. The BIZ board's
  live item was already fully satisfied on **2026-08-12** by a real run rendering
  `addBusinessDays:1` across the observed July 3 holiday (`2085bb29`), three days before LD-2
  landed. LD-2's Labor Day retainer render is a genuine second, independent proof — it is
  just not the one that closed anything. Recorded so the same evidence is not credited twice.
- **`TPL-O7`** ("business-day / holiday date math — worth answering before GH-173 writes
  retainer and NDA templates") was already answered and shipped by BIZ-1, and its index entry
  already marked resolved. Confirmed still accurate; do not re-promote.

## Lessons worth carrying

- **An acceptance criterion drawn to exclude a hazard can exclude the deliverable too.**
  LD-2's AC1 forbade "any new route, state machine, or runtime path" — a guard written to
  stop the removed `/intake/*` pipeline being resurrected. It worked, and it was wide enough
  that the ticket shipped content with **no consumer at all**, requiring a whole follow-on
  board (TM-1..5) to make it reachable. When writing a scope guard, state what the ticket
  *must* still deliver, not only what it must not touch.
- **Both LD devs stopped without turning in gates** — one to an org spend limit immediately
  before its gate run, one silently — so the reviewer ran every gate for both tickets. The
  code arrived complete and correct each time; only the verification was missing. Budget for
  the reviewer running gates, and do not read a missing gate report as missing work.
- **Two runs of the same suite against one worktree database prove nothing.** LD-2's dev and
  reviewer integration runs overlapped on `ezbuildr_test_ld_2`, the documented clobbering
  hazard. The reported number came from a **third** run, executed alone against a freshly
  recreated database. Concurrent DB suites manufacture failures rather than false greens, so
  the three runs agreeing was reassuring — but only the isolated run was evidence.

---
name: ticket-flow
description: >-
  The repo owner's ticket-driven delivery process: audit a system, write self-contained
  tickets into a repo markdown file, dispatch them to dev sessions, grade and
  review the work, and gate every commit through a senior reviewer. Use this
  skill whenever the user asks to audit or review a system/feature/module for
  weaknesses, generate or write tickets, run a "review pass" or "work review",
  check ticket status, verify a ticket is complete, grade finished work,
  dispatch work to devs or other sessions, or when a session is pointed at a
  ticket in a *_TICKETS.md file and told to work it. Also trigger on phrases
  like "run the report", "part out the work", "is this ticket done", "what's
  still outstanding", or "close out the tickets" — even if the word "ticket"
  isn't used but the request matches this audit → tickets → review lifecycle.
---

# Ticket Flow — audit, ticket, dispatch, review

This skill encodes one specific way of shipping work, with two roles:

- **Senior** — the model that audits the system, writes the tickets, reviews
  finished work, and alone decides what gets committed and pushed. The Senior
  answers to the repo owner (the user) and escalates to them at defined points.
- **Dev** — a session (usually a fresh Claude Code session, sometimes a human)
  that is handed one ticket, works it in isolation, self-grades to an A, and
  turns it in.

**Figure out your role first.** If you produced (or are producing) the audit
and tickets, you are the Senior for that body of work. If you were pointed at
an existing ticket and told to work it, you are a Dev — read only your ticket
(plus the file's "How to work this document" header), follow
[Working a ticket](#stage-4--working-a-ticket-dev), and do not review, close,
or commit other tickets.

Lifecycle: **Audit → Tickets → Dispatch → Work (self-grade to A) → Review pass
→ Close or triage → Status report**. Commits happen only at review, only by
the Senior, one commit per passed ticket; pushes only when the repo owner says so.

## Stage 1 — Audit

Run a real investigation of the target system, not a skim. Read the actual
code paths, run the existing tests, and where feasible exercise the live
behavior. Every finding needs `file:line` evidence — a finding you can't point
to is a hunch, not a finding.

The audit produces a short report at the top of the ticket file (see the
template): scope, method, an overall letter grade for the system, and the
findings ranked by risk. Findings become tickets; observations too small or
too speculative for a ticket go in a "Backlog / observations" section so they
aren't lost.

## Stage 2 — Ticket generation

Tickets live in **one markdown file per initiative, in a `tickets/` folder at
the repo root** (create the folder if it doesn't exist yet), named for the
initiative (e.g. `tickets/PAYMENTS_HARDENING_TICKETS.md`), with a short ticket
prefix (e.g. `PAY-1..n`). Read
[references/ticket-template.md](references/ticket-template.md) before writing
the file — it has the exact required structure and a filled example.

The bar for every ticket: **a lower-level dev with zero context on this
codebase can complete it in isolation.** That means each ticket carries:

1. **Finding** — what is wrong or what new capability is needed, with exact
   `file:line` references and quoted code, so the dev can locate it even after
   lines drift.
2. **Preferred fix** — the shape the Senior expects the work to take. Name
   existing patterns to copy ("mirror the sibling handler", "use the
   established repository pattern") rather than letting the dev invent one.
   Deviating is allowed only with a stated reason.
3. **Ties** — related tickets, docs, and project skills the dev must load
   (test-running skills, API-pattern skills, etc.). If the repo has skills or
   a CLAUDE.md convention that governs this area, cite it by name — this is
   what keeps isolated devs on-pattern.
4. **Acceptance criteria** — a numbered, exhaustive, objectively checkable
   list. Always include: new tests covering the new behavior, existing tests
   still green, and the repo's standard gates (type-check, lint) where they
   exist. Vague criteria ("works correctly") are not acceptance criteria.

Also stamp each ticket with **Priority** (P0 bug / P1 / P2 / enhancement) and
**Size** (S / M / L). Group tickets into **phases** ordered by risk and
dependency, each ending in a **Phase Gate** — a checklist the Senior verifies
and commits before the next phase starts. Phases must not overlap.

**Decompose by concern *and* by file-locality.** "One ticket, one concern" is
the default — but if two concerns live in the *same* code (the same methods,
the same handler), make them **one ticket**. Two tickets fighting over the same
function force sequential dispatch and messy diffs, and the second dev inherits
the first's rewrite mid-air. It's better to bundle them and say so. Note each
ticket's file footprint and resulting **execution order** in its Ties, so
dispatch (Stage 3) is a lookup, not a fresh analysis — most tickets in one
initiative touch the same one or two files, so ordering is the norm, not the
exception.

**Announce the ticket file path.** Whenever tickets are written (a new file
or additions to an existing one), the Senior's report to the repo owner must state the
repo-relative ticket file path and the ticket IDs added (e.g. "Tickets
ICW2-1..14 written to `tickets/INTERVIEW_CREATION_2_TICKETS.md`") so
the repo owner can hand that path directly to other agents/sessions for dispatch.

**Re-audit before dispatching a promoted or reopened ticket.** Backlog items
and tickets written before earlier fixes landed will have **stale `file:line`
evidence** — lines drift as work commits. When you promote a backlog
observation into a full ticket (or reopen one later), re-verify its evidence
against the *current* tree first and refresh the refs. Don't dispatch a ticket
pointing at line numbers that have moved.

**Escalation during generation:** if a ticket comes out Size L, spans many
subsystems, requires a judgment call (schema design, security posture, API
contract change), or you find yourself unable to write a Preferred fix you're
confident in — stop and flag it to the repo owner *while generating the tickets*,
not after. Present the complication, your recommendation, and let them decide
whether it becomes a ticket, a separate project, or gets descoped.

## Stage 3 — Dispatch

Tickets are worked by devs who have none of the Senior's context — that's why
the tickets must be self-contained. There are two dispatch modes; both use a
kickoff prompt of this shape:

```
Work ticket <ID> in <path/to/TICKETS_FILE.md>. Read the file's "How to work
this document" section (and any "Decisions" section) and your ticket only.
Follow the ticket-flow skill's "Working a ticket" process: load the project
skills named in the ticket's Ties, meet every acceptance criterion, write the
required tests, then self-grade A–F and fix to an A before reporting done.
HARD RULES (each is an automatic F if violated): (1) if any acceptance
criterion names a test, the ticket is NOT done until that test exists and
passes — no changed/new test file means do not report done; (2) run the gates
YOURSELF (type-check, lint on every touched file, the relevant test suites)
and paste their output — never report done with a failing gate, and never
leave the shared tree failing type-check or lint, even mid-flight, because
the reviewer's gates and other devs' turn-ins run on the whole tree;
(3) delete code you replace — never comment it out — and remove any
param/prop/import your change orphans; (4) if your change trips a
lint/complexity rule, refactor (e.g. extract a helper) until clean — do not
turn in with new suppressions or errors. Do NOT commit or stage anything —
the reviewer controls commits. Do NOT touch files outside your ticket's scope
or work any other ticket. If a criterion is impossible/wrong or the scope
explodes, STOP and report the blocker instead of improvising. Report back:
your self-grade, exactly which files/lines changed, the gate output
(type-check/lint/tests) proving green, and any deviation with its reason.
```

**Mode A — fresh Claude Code sessions.** You (or the repo owner) open a new session per
ticket and paste the kickoff prompt. Best when a human is also in the loop or
tickets run over a long span.

**Mode B — Senior oversees dev subagents (in-session).** The Senior spawns a
dev per ticket via the Agent tool, reviews each result, and gates commits —
all in one session. This is the fast loop and it works well:

- **Use a lesser model for the dev** (e.g. `model: "sonnet"`) — the tickets
  carry the context, so the dev doesn't need the Senior's model. The Senior
  stays on the stronger model to review.
- **The dev works in the shared tree**, so at commit time the Senior stages
  **only that ticket's files by path** — never `git add -A`/`.` (there may be
  another ticket's or the repo owner's uncommitted changes present). This is the same
  discipline as the parallel-IDE rule, and it's what makes one-commit-per-ticket
  possible from a shared tree.
- **Review before dispatching the next ticket** so each dev builds on committed
  state, not a half-finished tree.

**Sequencing (both modes).** Dispatch in parallel only tickets that don't touch
the same files; otherwise sequence them. In practice most tickets in one
initiative touch the same one or two files, so expect to run sequentially — and
because file overlap is the norm, the ticketing stage should already note each
ticket's execution order in its Ties (see Stage 2). Mark a ticket 🔄 In
progress when dispatched.

## Stage 4 — Working a ticket (Dev)

Load the project skills named in the ticket's Ties section before touching
code. Meet every acceptance criterion literally — if a criterion is ambiguous
or turns out to be wrong, that's an exception (below), not a thing to quietly
reinterpret.

**Self-grade before turn-in.** When you believe you're done, grade your own
work A–F honestly:

- **A** — every acceptance criterion met; new tests written and green;
  existing tests, type-check, and lint green; code matches the surrounding
  style and named patterns; no leftover scratch (debug logs, commented-out
  code, TODO droppings); you can't see an obviously better way to have done it.
- **B** — criteria met but quality gaps: thin tests, style drift, a hack you'd
  rather not defend.
- **C** — most criteria met, some skipped or reinterpreted.
- **D/F** — doesn't work, criteria unmet, or breaks existing behavior.

Anything below an A: fix it and re-grade. Iterate until it's an A. Only then
report done — include the grade, what you fixed during self-review, and proof
(test output, verification evidence).

**Turn-in checklist — every item must be yes before reporting done.** These
are the failure modes that actually get work sent back (all observed in real
review passes); check them mechanically, not from memory:

1. For each acceptance criterion that names a test: does a new or changed
   test file exist, and does it pass? A claimed A with a test criterion and
   no test diff is an F, not an A.
2. Did you run type-check, lint (on every file you touched), and the relevant
   suites *after your final edit*, and capture the output for your report?
3. Is the shared tree gate-clean right now? Other devs and the reviewer run
   gates on the same tree — leaving it red at turn-in (or for long stretches
   mid-flight) corrupts their results.
4. Zero commented-out code: replaced code is deleted, not disabled in place.
5. Zero orphans: no param, prop, import, or variable your change made unused.
6. Zero new lint/complexity violations: if your addition pushed a function
   over a complexity limit, extract a helper — do not report with the error
   or add a suppression.
7. If an acceptance criterion demands live/dev-app proof (screenshot, network
   evidence), is it attached? "It should work" is not evidence.

**Exceptions:** if reaching an A is genuinely blocked — a criterion is
impossible or wrong, the preferred fix conflicts with something the ticket
didn't foresee, the scope explodes — stop and ask the repo owner directly, with the
specific blocker and a clear reason. Never silently downgrade the bar,
skip a criterion, or mark work done at a B "because it's close".

## Stage 5 — Review pass (Senior)

When the repo owner asks for a review pass (or a dev reports done), verify each ticket
against the full gate. Read
[references/review-pass.md](references/review-pass.md) for the detailed
checklist, triage guide, and report formats. In brief, a ticket is **complete**
only when all of these hold:

1. Every acceptance criterion is verifiably met — check each one yourself
   against the working tree; do not take the dev's word for it.
2. All tests pass — the new ones and the existing suites/gates.
3. The work is best-standard for this repo and efficient, and no obviously
   better approach exists.
4. **Behavior is verified live whenever feasible** — drive the running app
   (browser/computer-use tools, real API calls) and capture proof, not just
   green unit tests. Skip only when the change genuinely isn't observable
   live, and say so.

**Pass →** mark the ticket ✅ Done in the file with a dated verification note,
and commit it: one commit per passed ticket, staging only the files that
ticket touched (never `git add -A` — the repo owner may have concurrent edits
from another IDE). Push only when they explicitly say to.

**Fail →** write the repo owner a failure report (format in review-pass.md) and triage
into exactly one of:

1. **Send back to the original dev** — right direction, small finish-up work
   they still have context for.
2. **New ticket** — a larger problem surfaced, or new issues found; write it
   into the ticket file like any other ticket.
3. **Reviewer fixes it** — reserved for small problems where the Senior
   already has ~90% of the context and it's a quick fix; note in the report
   that you took this path and what you changed.

## Stage 6 — Status report

End every review pass — and answer any "what's outstanding?" question — with
a status table over the *whole* ticket file: ✅ done this pass, ✅ done
previously, 🔄 in progress (with whom), 🔲 open, plus anything escalated or
newly filed. The repo owner uses this to steer; it must be complete, not just the
tickets you touched.

## Commit & push policy (Senior only)

- Devs never commit. The Senior commits exactly one commit per passed ticket,
  at review time, staging only that ticket's files.
- Commit messages reference the ticket ID (e.g. `fix(api): classify create
  errors (PAY-1)`).
- Phase Gates get their own commit for the ticket-file status updates.
- **Never push without the repo owner's explicit go-ahead**, and confirm branch
  state with them before switching branches — they work the same repo from a second
  IDE.

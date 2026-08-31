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
  Also use it to retire a finished initiative's ticket file, tidy the tickets/
  folder, or file, promote, or look up anything in the backlog.
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
→ Close or triage → Status report → Retire the file**. Commits happen only at
review, only by the Senior, one commit per passed ticket; pushes only when the
repo owner says so.

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

**Before auditing, read `tickets/BACKLOG.md`.** It is the index of everything
already parked, with a `wont-fix` / `informational` section specifically to stop
a settled question being re-filed as a fresh finding. Re-discovering a closed
observation and presenting it as new is the most common way an audit loses the
repo owner's trust.

## Stage 2 — Ticket generation

Tickets live in **one markdown file per initiative, in a `tickets/` folder at
the repo root** (create the folder if it doesn't exist yet), named for the
initiative (e.g. `tickets/PAYMENTS_HARDENING_TICKETS.md`), with a short ticket
prefix (e.g. `PAY-1..n`). The `tickets/` folder holds exactly three kinds of
thing, and the naming is load-bearing:

```
tickets/
  <INITIATIVE>_TICKETS.md   open, dispatchable work — the *_TICKETS.md glob
  BACKLOG.md                index of parked entries; NOT in that glob
  backlog/<INITIATIVE>.md   full text of parked entries, read on demand only
```

A dev told to "work the tickets" scans `tickets/*_TICKETS.md`. Anything that is
not dispatchable must stay out of that glob or every dispatch pays to read it.

Read
[references/ticket-template.md](references/ticket-template.md) before writing
the file — it has the exact required structure and a filled example.

That reference offers **two file shapes**: Shape A for a phased multi-ticket
initiative, Shape B for a single or small ticket file with no phases or gates.
Pick one and follow it. The common failure is reaching Shape-A's ceremony,
deciding phases are overkill for one bug, and improvising a bug-report layout
instead — which quietly drops **Ties** and **Preferred fix**, the two sections
an isolated dev most needs. Shape B exists precisely so there is a correct
small answer to copy. The sections below are required in both (Vertical proof
only when the ticket spans more than one layer).

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
4. **Vertical proof** — *required whenever the ticket touches two or more of:
   route, service, repository/DB, worker/lifecycle hook, renderer, client.*
   One real end-to-end path — entry point, every hop, observable end state —
   naming which hops must be unmocked, the cross-tenant denial case, and the
   suite that runs it. Components pass in isolation while the seam between them
   is broken; that is this repo's most expensive recurring defect, so the path
   is written at generation time rather than left to the dev. See
   `references/ticket-template.md`.
5. **Acceptance criteria** — a numbered, exhaustive, objectively checkable
   list. Always include: new tests covering the new behavior, existing tests
   still green, and the repo's standard gates (type-check, lint) where they
   exist. Vague criteria ("works correctly") are not acceptance criteria. For a
   multi-layer ticket, name the suite that actually exercises the path — a green
   fast/unit suite cannot close route, persistence, rendering, or lifecycle work.

Also stamp each ticket with **Priority** (P0 bug / P1 / P2 / enhancement) and
**Size** (S / M / L). Group tickets into **phases** ordered by risk and
dependency, each ending in a **Phase Gate** — a checklist the Senior verifies
and commits before the next phase starts. Phases must not overlap.

**Decompose by concern *and* by file-locality.** "One ticket, one concern" is
the default — but if two concerns live in the *same* code (the same methods,
the same handler), make them **one ticket**. Two tickets fighting over the same
function force sequential dispatch and messy diffs, and the second dev inherits
the first's rewrite mid-air. It's better to bundle them and say so.

Note each ticket's **file footprint** in its Ties, and mark which tickets it
collides with — that's what lets Stage 3 decide parallel-vs-sequential as a
lookup rather than a fresh analysis. Be precise about it: an initiative usually
has a cluster of tickets fighting over one or two files *and* a tail that
touches nothing else, and a vague footprint gets that tail needlessly
serialized.

**Announce the ticket file path.** Whenever tickets are written (a new file
or additions to an existing one), the Senior's report to the repo owner must state the
repo-relative ticket file path and the ticket IDs added (e.g. "Tickets
ICW2-1..14 written to `tickets/INTERVIEW_CREATION_2_TICKETS.md`") so
the repo owner can hand that path directly to other agents/sessions for dispatch.

**Anchor evidence on quoted code, not line numbers.** A Finding's locator is
the **quoted code plus a symbol anchor** (the exported function, component, or
constant it lives in). `file:line` is advisory — accurate when written, stale
soon after, and the dev greps for the quote anyway. Say so in the file header
so nobody treats a drifted line as a broken ticket.

This matters because refreshing line numbers before each dispatch is a whole
reviewer turn per ticket, and it buys nothing a grep doesn't. **Re-audit only
when the finding itself may be stale** — i.e. intervening work plausibly
touched that behavior, or the ticket has been sitting since before a related
fix landed. Promoting a backlog observation is the usual trigger; a two-day-old
ticket in an active initiative is not.

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
turn in with new suppressions or errors; (5) NEVER bulk find-and-replace across
test files — tests are the evidence, so change them one at a time with a stated
reason, and if a test asserted behavior that should still hold, the code is
wrong, not the test; (6) the test count must not go DOWN — state the arithmetic
yourself (baseline + what you added = your number) and explain any test you
removed. Do NOT commit or stage anything —
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
- **A solo dev works in the shared tree**, so at commit time the Senior stages
  **only that ticket's files by path** — never `git add -A`/`.` (there may be
  another ticket's or the repo owner's uncommitted changes present). This is the same
  discipline as the parallel-IDE rule, and it's what makes one-commit-per-ticket
  possible from a shared tree.

**Sequencing (both modes).** The Ties section already records every ticket's
file footprint — dispatch is a lookup against it, not a blanket rule:

- **Disjoint footprints → dispatch in parallel**, 2–3 at a time, each in its own
  worktree (`isolation: "worktree"`; see the repo's parallel-work rules). Do not
  serialize tickets that cannot collide — that is pure latency.
- **Overlapping footprints → sequence**, and review the first before dispatching
  the second so the later dev builds on committed state rather than a
  half-finished tree.
- **Test-suite contention is a footprint too.** Parallel devs may all run the
  no-DB fast suite, but only one may run DB-backed suites at a time — concurrent
  DB runs share a schema and clobber each other into dozens of fake failures. If
  two ready tickets both need DB tests, sequence them even if their files differ.

**Put the baseline test count in the dispatch prompt, as the dev's FIRST command,
with an explicit STOP.** A worktree cut from the wrong branch is the cheapest
catastrophic failure in this whole process: every gate the dev runs is green, and
every one of them is meaningless. The tooling will not save you — a creation script
that asserts "base matches <branch>" is asserting the wrong invariant if the default
branch is not the one work lands on, and a bare passing-test count printed with no
comparison launders staleness as proof. One line — "run the suite first; it must say
N; anything else means STOP" — converts a silent stale base into an immediate halt.

**Name the suite that actually executes the acceptance criterion.** Fast suites
routinely exclude DB and integration projects by config, so a dev can honestly report
a green run that never touched the code its criterion is about. Give the exact
commands and the current counts for each.
Mark a ticket 🔄 In progress when dispatched.

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
   live, and say so. **Batch it where tickets compose:** several UI tickets
   landing on the same screen are proven by one drive-through at the phase
   gate, not one per ticket. Verify per-ticket only when a ticket's behavior
   isn't reachable from the phase's end state.

**Pass →** mark the ticket ✅ Done in the file with a dated verification note,
and commit it **as one commit containing both the code and that ticket-file
edit** — the ✅ and its verification note belong in the same commit as the work
they attest to. Stage only the files that ticket touched, plus the ticket file
(never `git add -A` — the repo owner may have concurrent edits from another
IDE). Do not spend a second commit on marking a ticket done; phase-gate
bookkeeping is the only ticket-file-only commit. Push only when they
explicitly say to.

**Confirm the work is actually in the tree before marking it ✅.** In a shared
checkout a merge can silently revert a committed change — this has happened,
and cost a re-land. Grep for a symbol the ticket added, or
`git log -1 --oneline -- <file>`, as the last step before closing.

**Fail →** write the repo owner a failure report (format in review-pass.md) and triage
into exactly one of:

1. **Send back to the original dev** — right direction, small finish-up work
   they still have context for.
2. **New ticket** — a larger problem surfaced, or new issues found; write it
   into the ticket file like any other ticket. **A discovery is an observation
   by default, not a ticket.** Before filing one, answer: is this worth
   dispatching *in this initiative*? If not, it goes in Backlog as a one-line
   observation — promotable later, but not on the board and not sized. Filing
   full tickets for every review discovery is how an initiative's board grows
   faster than it drains.

   While an initiative is **open**, its backlog stays in its own ticket file's
   "Backlog / observations" section. It moves to `tickets/BACKLOG.md` only when
   the initiative is retired (Stage 7) — so an active board is one file, not
   two.
3. **Reviewer fixes it** — reserved for small problems where the Senior
   already has ~90% of the context and it's a quick fix; note in the report
   that you took this path and what you changed.

## Stage 6 — Status report

End every review pass — and answer any "what's outstanding?" question — with
a status table over the *whole* ticket file: ✅ done this pass, ✅ done
previously, 🔄 in progress (with whom), 🔲 open, plus anything escalated or
newly filed. The repo owner uses this to steer; it must be complete, not just the
tickets you touched.

## Stage 7 — Retiring an initiative

When an initiative's last open ticket closes, **the ticket file goes away** —
it does not linger as a 300-line tombstone that every future dispatch reads to
learn nothing. Read
[references/backlog.md](references/backlog.md) for the exact format; the shape
of the move is:

1. **Triage what is left.** Every remaining entry is one of: a real dispatchable
   ticket (→ carry it into the *active* initiative that now owns that area, or
   into a new file — do **not** demote it to backlog), a parked observation
   (→ backlog), a settled ruling worth keeping (→ backlog), or noise (→ drop
   it; git history has it).
2. **Write the detail** into `tickets/backlog/<INITIATIVE>.md`, including a
   `Closed — do not re-file` table so shipped work is not rediscovered.
3. **Add index entries** to `tickets/BACKLOG.md`: 2–4 lines each, tagged with
   *why* it is parked (`product-decision`, `needs-initiative`, `enhancement`,
   `operational`, `informational`, `wont-fix`). The tag is the point — it tells
   the next reader whether to open the detail at all.
4. **Deduplicate across initiatives.** This is where the real value is. Items
   get re-filed under new IDs by successive audits; one entry here was tracked
   three separate times, and two others had already been fixed by a *different*
   initiative's ticket. Cross-check every entry against the others' closed lists
   before writing it down.
5. **`git rm` the ticket file** and fix every cross-reference to it. References
   of the form `git log -p -- <path>` stay valid after deletion and should be
   kept — that is how the closed detail is recovered.
6. **Grep the repo for the deleted filename** (`CLAUDE.md`, `AGENTS.md`, docs,
   source comments) — ticket paths get cited in code comments and go stale
   silently.

## Commit & push policy (Senior only)

- Devs never commit. The Senior commits exactly one commit per passed ticket,
  at review time, staging only that ticket's files — **including the ticket
  file's ✅ and verification note**. One ticket, one commit, code and closure
  together.
- Commit messages reference the ticket ID (e.g. `fix(api): classify create
  errors (PAY-1)`).
- Phase Gates get their own commit — the only ticket-file-only commit there
  should be. Backlog triage (promote / merge / close won't-fix) happens at the
  gate and rides in that commit.
- **Retiring an initiative (Stage 7) is one `docs(tickets):` commit** — the
  `git rm`, the new `backlog/` detail file, the `BACKLOG.md` index entries and
  every cross-reference fix land together, so no commit in the range leaves a
  dangling pointer.
- **Push verified work to the working branch without asking.** In a repo with a
  promotion chain, the first branch is the playground: it is where work is
  *supposed* to land, and a verified commit left unpushed is invisible to the
  owner's other machines and to CI. The Senior pushes it as a matter of course
  and simply says so in the status report. Asking permission for each one buys
  nothing and trains the owner to rubber-stamp.
- **Every branch that deploys needs the owner's explicit approval, every time.**
  Promotion branches and production branches are not the playground. Approval
  for one promotion is not approval for the next.
- Confirm branch state with the owner before *switching* branches — they may
  work the same repo from a second IDE.

  In this repo specifically: **push to `dev` freely; `test` and `main` need the
  owner's say-so each time**, and `test` → `main` goes by pull request only.


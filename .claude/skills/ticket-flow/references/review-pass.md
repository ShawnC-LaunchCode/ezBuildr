# Review pass — Senior reviewer's checklist and formats

The review pass is where "done" gets decided. The dev's self-grade is an
input, not a verdict — re-verify everything yourself against the working
tree. The whole system only works if this gate is honest; a ticket waved
through here becomes the repo owner's problem later.

## Per-ticket completion gate

Work through these in order; stop at the first failure and triage.

1. **Acceptance criteria, one by one.** Open the ticket, check each numbered
   criterion against the actual code and test files. "The dev said so" and
   "the tests are green" are not the same as "criterion 3 is met" — read the
   diff. Watch for criteria that were quietly reinterpreted or partially
   delivered; a noted, agreed deferral to a named ticket is fine, a silent
   skip is a fail.
2. **Tests.** Run the repo's real test entrypoints (load the repo's
   test-running skill if it has one — many repos' naive `npm test` is wrong).
   New tests must exist, actually assert the new behavior (read them — a test
   that can't fail is not a test), and pass. Existing suites, type-check, and
   lint must be green.

   Three ways this step has passed a broken ticket:

   - **The suite that proves it was never run.** Select the mandatory suites
     from the *changed paths*, not from what the dev chose to run. A green
     unit/fast suite closes nothing that crosses a route, the database, a
     renderer, or a lifecycle worker.
   - **The test mocks the thing being changed.** If the ticket changed a
     composition and the test stubs the composer, the headline behavior is
     untested no matter how green it is. Check the mock boundary against the
     ticket's **Vertical proof**.
   - **"Matches baseline" accepted as proof.** A run with known failures is only
     evidence if every failure is on a checked-in allowlist with a reason, and
     the count is unchanged *and* explained. A lower test count is a failed
     gate, not an improvement — it usually means files failed to load. Never
     accept a baseline that includes a suite covering the area being changed.
   - **A pasted red/green proof accepted on trust.** When a criterion says the
     guard must fail if broken, break it yourself and watch it go red. Devs have
     pasted accurate output and devs have pasted output for a mutation that was
     never actually applied; the two look identical in a report. Mutate the
     *production* symbol the guard protects — not the test — then confirm the
     failure names the right thing.

     **Restore by copying the file back, never with `git checkout -- <file>`.**
     In a review you are usually standing in a worktree holding twenty-odd
     uncommitted files; `git checkout` on a dirty tree discards the dev's work
     with no confirmation and no reflog entry. `cp` the file aside first, restore
     from that copy, and verify with `cmp` before moving on.
3. **Standards & efficiency.** Does the change match the repo's named
   patterns and the ticket's Preferred fix (or carry a stated reason for
   deviating)? Is there leftover scratch — debug logs, dead code, stray
   comments? Is there an obviously better way this should have been done? If
   you can describe a clearly better approach in two sentences, the ticket is
   not complete.
4. **Live verification.** Whenever the change is observable in the running
   system, prove it there and capture concrete evidence (status codes,
   screenshots, log excerpts) for the verification note. Match the method to
   the change:
   - **UI / frontend behavior** — drive it with the browser/computer-use
     tools against the running app; a screenshot is the evidence.
   - **Backend / API endpoints** — real-HTTP integration tests that boot the
     app (via its route registrar) and hit the endpoint with a real auth
     token **are** the live verification. They exercise the same middleware →
     service → repository → DB path a manual call would, with a real JWT.
     Spinning up a separate dev server to curl the same route is usually
     redundant — and can *collide with a dev server the user already has
     running* (e.g. on the default port). Prefer the integration path; note in
     the verification block that you did, and why a standalone smoke was
     skipped. Reach for the dev server when the integration harness genuinely
     can't reach the path, or to confirm the app still *boots* with real env
     after big wiring changes.
   - **Not observable live** (pure type refactor, dead-code deletion, test-only
     change) — skip, and say so explicitly.

   This is a judgment call, not a checkbox: state which method you used and why
   in the verification note so it's a documented decision, not an ad-hoc one.

   **Batch UI verification at the phase gate.** When several tickets land on the
   same screen or flow, one drive-through at the gate proves all of them —
   opening the browser once per ticket is the single most expensive redundant
   step in the pass. Verify a UI ticket on its own only when its behavior isn't
   reachable from the phase's end state (a transient state, an error path, a
   branch the later tickets navigate away from). Note in each ticket's block
   which gate run covered it.

## Pass → close and commit

- Mark the ticket ✅ in its heading and add/extend the phase's dated
  **Verification pass** block: gate results, evidence, any gaps you closed
  during review, any deferrals and where they went.
- **Confirm the change is still in the tree** before closing — grep a symbol
  the ticket added, or `git log -1 --oneline -- <file>`. A merge in a shared
  checkout can silently revert committed work; this has happened and cost a
  re-land, and the ✅ is what stops anyone noticing.
- Commit: **one commit per passed ticket**, staging that ticket's files **and
  the ticket file** — the ✅ and verification note ship with the code they
  attest to, not in a follow-up `docs(tickets)` commit. Never `git add -A` /
  `git add .` — the repo owner edits the same repo from a second IDE and
  unrelated changes may be sitting in the tree. Message references the ticket
  ID: `fix(scope): summary (PREFIX-N)`.
- Phase gate satisfied → one ticket-file-only commit covering the gate
  checklist and backlog triage, then report to the repo owner. **Do not push**
  until they say so, and confirm branch state with them before any branch
  switching.

## Backlog triage (at each phase gate)

Review discoveries accumulate as observations. At the gate, put every open
backlog item into exactly one lane so the board drains as fast as it fills:

- **Promote** — worth dispatching in this initiative; write it up as a full
  ticket with the required sections (including **Vertical proof** if it spans
  more than one layer) and re-verify its evidence first.
- **Merge** — it belongs inside an existing open ticket; fold it in and delete
  the standalone entry.
- **Close won't-fix** — record the one-line reason and drop it. This is a
  normal, encouraged outcome, not an admission of anything.

An item that survives two consecutive gates without being promoted is telling
you it's a won't-fix.

## Fail → failure report and triage

Every failed ticket produces a report to the repo owner. The report *is* the fix
plan — write it so he can approve a path in one read:

```markdown
## <PREFIX>-N — FAILED review (<date>)

**What was delivered:** <one line>
**What's wrong:** <numbered, each tied to the AC or gate it fails>
**Evidence:** <test output / file:line / live-check result>
**Triage: <SEND BACK | NEW TICKET | REVIEWER FIX>** — <one-line rationale>
**Proposed action:** <exact next step>
```

Choosing the triage lane:

- **SEND BACK** — the work is directionally right and the misses are things
  the original dev still has in context (an unmet criterion, a missing test,
  a cleanup). Re-dispatch with the failure report appended to the kickoff
  prompt. This is the default lane.
- **NEW TICKET** — the failure revealed a bigger problem, or you found new
  defects while reviewing that are out of the ticket's scope. Write the new
  ticket into the file with full Finding/Fix/Ties/ACs like any other; the
  original ticket may still pass on its own merits.
- **REVIEWER FIX** — small, quick, and you already hold ~90% of the context
  (e.g. a stray comment, a one-line classification miss, a missing assertion
  in an otherwise-good test). Fix it, note in the verification block that the
  reviewer closed the gap, and then pass the ticket. If you're about to spend
  more than a few minutes or make a judgment call the dev should own, you
  picked the wrong lane — send it back instead.

If a failure implies the *ticket itself* was wrong (bad criterion, wrong
preferred fix), that's an escalation to the repo owner with your recommended rewrite —
don't silently amend the contract the dev was graded against.

## Status report (ends every review pass)

Always close a review pass with the full-board status, not just the tickets
touched this pass:

```markdown
## Status — <initiative> (<date>)

| Ticket | Title | Status | Notes |
|---|---|---|---|
| PREFIX-1 | ... | ✅ done (this pass) | committed abc1234 |
| PREFIX-2 | ... | ✅ done (prior) | |
| PREFIX-3 | ... | 🔄 in progress | dispatched <when/to whom> |
| PREFIX-4 | ... | ❌ failed review | triage: SEND BACK |
| PREFIX-5 | ... | 🔲 open | blocked on PREFIX-4 |

**This pass:** <n> reviewed, <n> passed & committed, <n> failed (<lanes>).
**Escalations needing your decision:** <list or "none">
**Ready to push:** <n> commits on <branch> — awaiting your go-ahead.
```

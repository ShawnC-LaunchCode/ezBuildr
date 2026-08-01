# Ticket file template

One markdown file per initiative, checked into the repo in a `tickets/`
folder at the repo root (create it if it doesn't exist), named
`<INITIATIVE>_TICKETS.md`. This file is the single source of truth for the
initiative: audit summary, working instructions, phases, tickets, statuses,
and verification notes all live here.

---

## The four required sections — never optional

Every ticket, in every file, regardless of size, has exactly these four
headings. They exist because an isolated dev with no context has to work from
them alone:

| Section | Answers | Omitting it costs |
|---|---|---|
| **Finding** | What is wrong, with quoted code + a symbol anchor | Dev can't locate the problem after lines drift |
| **Preferred fix** | The shape the reviewer expects, naming a donor pattern | Dev invents a new pattern; review bounces it |
| **Ties** | Related tickets, skills to load, file footprint | Dev skips the project skill and re-derives conventions wrongly; dispatch can't sequence overlapping work |
| **Acceptance criteria** | Numbered, objectively checkable, including tests | "Done" becomes a judgment call instead of a checklist |

Plus the one-line stamp under the heading:

```markdown
**Priority: P1** · Size: M · File: `server/services/Foo.ts`
```

Everything *else* in this document — phases, gates, the overall grade, the
audit summary — is initiative-scale ceremony. Drop it freely on a small file.
Never drop the four sections.

## Section names are fixed — don't rename them

Writing up a bug, the instinct is to reach for bug-report headings. Those lose
information the process depends on. Map them:

| Instinct | Use instead | Why the house name is different |
|---|---|---|
| Problem / Root Cause | **Finding** | Finding demands *evidence* — `file:line` and quoted code, not prose |
| Solution / Proposed Fix | **Preferred fix** | "Preferred" signals a dev may deviate *with a stated reason*; "Solution" implies it's the only option |
| Affected Files | **Ties** | Ties carries more: sequencing against other tickets, and which skills to load first |
| Severity / Type | **Priority · Size** | Size drives dispatch and the Size-L escalation rule; Severity alone doesn't |
| `- [ ]` checkboxes | **Numbered list** | The reviewer cites them by number in the pass/fail report |

## Two file shapes

Pick by how much work the file holds. Both use the same four sections.

### Shape A — multi-ticket initiative (audit output, phased)

```markdown
# <System> — <Theme> Tickets (<PREFIX>-1..n + backlog)

Source: <what kind of audit>, <date>.
Scope: <what was examined>. Overall grade at audit time: **<letter>**
(<one-line justification>).

Every finding below was verified against the working tree at audit time. **Line
numbers are advisory** — they were accurate when written and drift as fixes
land. The locator is the quoted code and the named symbol; grep for those. A
stale line number is not a broken ticket and does not need re-issuing.

---

## How to work this document

- **Tickets are grouped into N phases**, ordered by risk and dependency. Do
  not start a phase until the previous phase's **Phase Gate** has been
  verified and committed by the reviewer (the repo owner's senior model).
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and
  **Acceptance criteria** (all must pass).
- <Repo-specific rules: which skills to load for which directories, which
  test command to use, any "npm test naively lies"-type warnings.>
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | <theme> | <PREFIX>-1..k | <estimate> |
| Backlog | Not phase-gated | <PREFIX>-B1.. | |

---

# Phase 1 — <theme>

<One paragraph: what this phase is, what is explicitly out of scope.>

## <PREFIX>-1 — <one-line summary of the defect/work> 🔲

**Priority: P0 (bug)** · Size: S · File: `<primary file path>`

### Finding

<What is wrong or missing. Lead with a short quoted code block and the symbol
it lives in (`resolveListValue()` in `shared/listRuntime.ts`) — that is the
locator. Add `file:line` after it as a convenience, not as the anchor. State
the consequences: what breaks, for whom, how badly.>

### Preferred fix

<The shape of the solution. Point at an existing pattern to copy whenever one
exists ("mirror the catch block of PUT /:id in the same file"). Call out
anti-patterns to avoid and any deliberate constraints ("do not convert the
whole handler — fix the inline classification only").>

### Ties

- <Related tickets, with coordination notes if they touch the same files.>
- <Project skills / docs the dev must load first.>
- <File footprint + execution order, so dispatch is a lookup not an analysis.>

### Acceptance criteria

1. <Objectively checkable behavior, e.g. "malformed body returns **400** with
   validation details".>
2. <...each distinct behavior its own numbered line...>
3. New/updated test asserts 1–2 (name the test file if it exists; if delivery
   is deferred to another ticket, the deferral must be noted on both tickets).
4. <Repo's standard gates: type-check 0 errors, lint clean, fast suite green.>

---

## Phase 1 Gate

- [ ] All Phase 1 tickets ✅ with dated verification notes
- [ ] <Full gate commands and expected results>
- [ ] Reviewer has committed each passed ticket + this gate
```

### Shape B — single or small ticket file (no phases, no gates)

Use when the file holds one ticket, or a handful with no ordering between
them. **Do not invent a different structure just because phases would be
overkill** — that is exactly how house format gets lost. Drop the ceremony,
keep the four sections:

```markdown
# <System> — <Theme> Tickets (<PREFIX>-001..n)

Source: <how this was found>, <date>.
Scope: <what was examined>.

Findings were verified against the working tree; the locator is the quoted code
and named symbol, and line numbers are advisory.

- Each ticket has: **Finding**, **Preferred fix**, **Ties**, **Acceptance
  criteria**. Devs do not commit; the reviewer commits per passed ticket.
- <Repo-specific rules: skills to load, correct test commands.>
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| <PREFIX>-001 | <title> | P1 | S | 🔲 |

---

## <PREFIX>-001 — <one-line summary> 🔲

**Priority: P1** · Size: S · File: `<primary file path>`

### Finding
### Preferred fix
### Ties
### Acceptance criteria

---

## Gate

- [ ] All tickets ✅ with dated verification notes
- [ ] <gate commands and expected results>
- [ ] Reviewer has committed each passed ticket
```

## Reviewer rejection checklist

A ticket file gets sent back before dispatch if any of these is true. Check
them before you hand a path to anyone:

- [ ] A ticket is missing **Ties** — so the dev won't know which project skill
      to load or which tickets it collides with
- [ ] A ticket is missing **Preferred fix** — so the dev picks their own
      approach and the review becomes an argument
- [ ] Acceptance criteria are checkboxes or prose instead of a numbered list
- [ ] No acceptance criterion names a **test** — every ticket needs one
- [ ] Criteria are subjective ("works correctly", "is clean")
- [ ] The Finding has no quoted code and no named symbol — a `file:line` alone
      is not evidence, and it's the part that goes stale
- [ ] No **Priority · Size** stamp — Size L must be escalated before dispatch,
      and you can't escalate what was never sized
- [ ] Ticket IDs are inconsistent (`ORG-1` in prose, `ORG-001` in the heading)
      — dispatch prompts are copy-pasted, and a mismatched ID sends the dev
      hunting

## Rules that make tickets work in isolation

- **Evidence over description.** Quote the offending code and name its symbol.
  Line numbers drift; quoted code is greppable forever.
- **Re-verify the finding, not the line numbers.** Refreshing refs before every
  dispatch is a reviewer turn per ticket that buys nothing a grep doesn't. Do a
  real re-audit only when the *finding* may be stale — promoting a backlog item,
  reopening an old ticket, or when intervening work plausibly touched that
  behavior. A drifted line in an active initiative is not a reason to re-issue.
- **One ticket, one concern — but bundle same-code concerns.** If the Finding
  needs the word "also" for an *unrelated* problem, that's a second ticket. The
  exception: two concerns that live in the *same* methods/handler belong in one
  ticket — splitting them forces two devs to fight over the same code. When you
  bundle, say so in the ticket (e.g. "was backlog B2 + B5").
- **Preferred fix names a donor pattern.** The single best defense against an
  isolated dev inventing a new pattern is pointing at the sibling code that
  already does it right.
- **Acceptance criteria are the contract.** The reviewer will check each one
  literally; write them so that checking is mechanical. Every ticket's ACs
  include its tests — a ticket without a testing criterion is unfinished.
- **Beware criteria satisfiable by doing nothing.** An assertion that something
  is *absent* (`toHaveLength(0)`, "does not appear in the response") passes
  trivially when the fixture never created the thing. Word such criteria so the
  setup is explicit, and expect the reviewer to prove the test fails without
  the fix.
- **Sizing:** S = under ~2 hours of focused work, M = up to a day, L = more.
  An L ticket is a flag to escalate to the repo owner during generation — it may
  need splitting or its own initiative.
- **Priorities:** P0 = actual bug / correctness / security, P1 = meaningful
  gap, P2 = polish, ENH = new capability.

## Verification notes (written by the reviewer at review time)

When tickets pass review, the reviewer inserts a dated **Verification pass**
block at the top of the phase (or under the ticket, in Shape B): the gate
commands run and their results, gaps found-and-closed during review, deferrals
with their destination ticket, and live-verification evidence ("POST /api/x
malformed body → 400, dev server, real JWT"). Completed tickets get ✅ in their
heading; the block is the audit trail for *why* they're ✅.

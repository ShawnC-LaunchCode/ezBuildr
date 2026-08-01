# Ticket file template

One markdown file per initiative, checked into the repo in a `tickets/`
folder at the repo root (create it if it doesn't exist), named
`<INITIATIVE>_TICKETS.md`. This file is the single source of truth for the
initiative: audit summary, working instructions, phases, tickets, statuses,
and verification notes all live here.

## Required file skeleton

```markdown
# <System> — <Theme> Tickets (<PREFIX>-1..n + backlog)

Source: <what kind of audit>, <date>.
Scope: <what was examined>. Overall grade at audit time: **<letter>**
(<one-line justification>).

Every finding below was verified against the working tree at audit time with
file:line evidence. Line numbers may drift as fixes land — search for the
quoted code if a reference is stale.

---

## How to work this document

- **Tickets are grouped into N phases**, ordered by risk and dependency. Do
  not start a phase until the previous phase's **Phase Gate** has been
  verified and committed by the reviewer (the repo owner's senior model).
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred
  fix** (the approach the reviewer expects — deviate only with a stated
  reason), **Ties** (related tickets/skills/docs — load the named skills
  before touching code), and **Acceptance criteria** (all must pass).
- <Repo-specific rules: which skills to load for which directories, which
  test command to use, any "npm test naively lies"-type warnings.>
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | <theme> | <PREFIX>-1..k | <estimate> |
| ... | | | |
| Backlog | Not phase-gated | <PREFIX>-B1.. | |

---

# Phase 1 — <theme>

<One paragraph: what this phase is, what is explicitly out of scope.>

## <PREFIX>-1 — <one-line summary of the defect/work> 🔲

**Priority: P0 (bug)** · Size: S · File: `<primary file path>`

### Finding

<What is wrong or missing, with exact `file:line` references and a short
quoted code block so the dev can re-locate it after drift. State the
consequences: what breaks, for whom, how badly.>

### Preferred fix

<The shape of the solution. Point at an existing pattern to copy whenever one
exists ("mirror the catch block of PUT /:id in the same file"). Call out
anti-patterns to avoid and any deliberate constraints ("do not convert the
whole handler — fix the inline classification only").>

### Ties

- <Related tickets, with coordination notes if they touch the same files.>
- <Project skills / docs the dev must load first.>

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

## Rules that make tickets work in isolation

- **Evidence over description.** Quote the offending code. Line numbers drift;
  quoted code is greppable forever.
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
- **Sizing:** S = under ~2 hours of focused work, M = up to a day, L = more.
  An L ticket is a flag to escalate to the repo owner during generation — it may need
  splitting or its own initiative.
- **Priorities:** P0 = actual bug / correctness / security, P1 = meaningful
  gap, P2 = polish, ENH = new capability.

## Verification notes (written by the reviewer at review time)

When tickets pass review, the reviewer inserts a dated **Verification pass**
block at the top of the phase (see any ICW ticket file for the house style):
the gate commands run and their results, gaps found-and-closed during review,
deferrals with their destination ticket, and live-verification evidence
("POST /api/x malformed body → 400, dev server, real JWT"). Completed tickets
get ✅ in their heading; the block is the audit trail for *why* they're ✅.

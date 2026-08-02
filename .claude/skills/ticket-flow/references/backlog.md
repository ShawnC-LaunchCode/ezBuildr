# Backlog format — index + on-demand detail

Read this when **retiring an initiative** (SKILL.md Stage 7) or when filing,
promoting, or looking up a parked entry.

## The problem this solves

A closed initiative's ticket file is mostly tombstone: phase gates that passed,
"how to work this document" rules for work that is done, ✅ tables. Left in
`tickets/`, every future dispatch and every "what's outstanding?" sweep reads
several hundred lines to find nothing dispatchable. Deleting it outright loses
the parked observations and settled rulings that *were* worth keeping.

So: **a short index everyone reads, and detail nobody reads until they need it.**

```
tickets/
  <INITIATIVE>_TICKETS.md   open, dispatchable work — the *_TICKETS.md glob
  BACKLOG.md                index of parked entries; deliberately NOT in that glob
  backlog/<INITIATIVE>.md   full text, one file per retired initiative
```

The naming is load-bearing. `BACKLOG.md` is outside `*_TICKETS.md` **on
purpose** — that glob is what a dev scans for work, and a backlog entry is not
work.

## A backlog entry is not a ticket

It is not sized, not on a board, not dispatchable. Promoting one means
**re-verifying the finding first** — entries were written against trees that
have since moved, and it is routine to find one already fixed.

Corollary: when retiring a file, a genuinely open, ready ticket does **not**
become a backlog entry. Carry it into whichever active initiative now owns that
area (renumbered into that file's prefix, with a note saying where it came
from), or give it its own file. Demoting ready work to backlog is how it dies.

## The `why` tag — the whole point of the index

Every index entry carries one tag saying **why it is parked**. A reader decides
from the tag alone whether to open the detail.

| Tag | Meaning | What unblocks it |
|---|---|---|
| `product-decision` | Blocked on what it *should* do, not on how | The repo owner rules |
| `needs-initiative` | Real work, too large to promote to one ticket | Scheduling + a fresh audit |
| `enhancement` | Ready to ticket, just not prioritized | Anyone picking it up |
| `operational` | Config or repo settings; no code, no dispatch | The repo owner does it |
| `informational` | Recorded so it is not rediscovered as a bug. **Not work** | — |
| `wont-fix` | Closed with reasoning, kept to prevent re-litigation | — |

`informational` and `wont-fix` earn their place: they are what stops the next
audit presenting a settled question as a fresh finding. Keep the reasoning that
closed them, especially where a previous reviewer argued the opposite and was
wrong — that is the part that gets re-litigated.

## Index entry shape (`BACKLOG.md`)

A scan table plus 2–4 lines per entry, grouped by initiative:

```markdown
- **IEX-B2 — import into an existing object** · `product-decision`. v1 always
  creates new. Merge semantics (match by alias? by id? what wins?) is a design
  question, not an implementation one.
```

What, why, and what unblocks it. No `file:line` evidence, no acceptance
criteria, no code — those live in the detail file.

## Detail entry shape (`backlog/<INITIATIVE>.md`)

Each entry gets a `## <ID> — <title> · \`<tag>\`` heading, the full original
text, and a **Next step** line naming the concrete thing that moves it. Mark
stale evidence explicitly — an entry whose cited symbols were since deleted is
a product idea, not an implementation pointer, and saying so saves the next
reader an hour.

Each file also ends with a **`Closed — do not re-file`** table: shipped tickets
with their commit refs, plus withdrawn findings with why they were wrong.

Head the file with the closed initiative's summary and the `git log -p -- <old
path>` incantation. That command keeps working after the file is deleted; it is
the recovery path for every closed ticket's Finding, acceptance criteria and
dated verification notes.

## Deduplicate on the way in

**This is where most of the value is.** Successive audits re-file the same
observation under new IDs, and a *different* initiative's ticket may have
already closed it. Before writing an entry, check it against every other
detail file's closed table.

Real examples from the 2026-08-02 consolidation: one entry ("replace `adm-zip`
on the read side") was being tracked in three files under three IDs; two others
had already been fixed by tech-debt tickets and were still sitting in the
portability backlog as open. Retiring the files without cross-checking would
have preserved all three errors in a tidier format.

Also check ticket-ID collisions. Outline sections written early often reserve
IDs that later, unrelated tickets actually shipped under — if an outline says
`FOO-12..14` and `FOO-12..14` shipped as something else, strip the numbers from
the outline rather than carrying the collision forward.

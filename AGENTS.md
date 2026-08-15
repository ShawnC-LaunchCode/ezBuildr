# AGENTS.md — how to work in this repo

For any coding agent that is **not** Claude Code (Gemini / Antigravity, Codex,
Cursor, Aider, …). Claude Code reads `CLAUDE.md` and loads `.claude/skills/`
automatically; you cannot, so this file gives you the same rules by hand.

**This file deliberately contains no architecture description.** The previous
version did, drifted six months out of date, and sent agents at a codebase that
no longer existed — it still described tables that had been renamed away.
Architecture lives in exactly one place:

> ### 📖 Read [`CLAUDE.md`](./CLAUDE.md) first. It is the source of truth.
> Stack, directory layout, the 3-tier pattern, step types, schema inventory,
> env vars, commands, and the documentation index are all there and are kept
> current. Do not rely on your memory of this codebase.

---

## 1. Read the skill for what you're touching

`.claude/skills/*/SKILL.md` are plain markdown files. **Open the matching one
and read it before you write code** — they encode patterns you must not
re-derive, and ignoring them is the most common way work here gets rejected.

| If your change touches | Read this file |
|---|---|
| `server/routes/`, `server/services/`, `server/repositories/` | `.claude/skills/add-api-endpoint/SKILL.md` |
| Any schema, migration, or a "relation/column does not exist" error | `.claude/skills/db-schema-change/SKILL.md` |
| A step, question, or block type | `.claude/skills/add-step-type/SKILL.md` |
| **Running or writing any test** | `.claude/skills/run-tests/SKILL.md` |
| Proving a change against the running app | `.claude/skills/verify/SKILL.md` |

`run-tests` is not optional. **`npm test` naively gives wrong results here** —
the suite is three separate Vitest projects with different database setups, and
some tests fail locally by design. Running the wrong command and reporting its
output is a false report, not a test run.

## 2. Gates — run them yourself, paste the output

```bash
npm run type-check   # must print 0 errors
npm run lint         # must print 0 problems (zero-error policy)
npm run test:fast    # must be green, with no fewer tests than your baseline
```

Never report done with a failing gate, and never leave the tree red — the
reviewer and other agents run gates on the same tree.

**Three ways these gates lie. Rule all three out before you believe a green:**

0. **The test suite may not be running at all.** If you are working in a git
   worktree, confirm `npm run test:fast` reports *passing tests* and not
   `0 test` / "failed to find the runner" before you trust any test result. A
   worktree whose `node_modules` was linked with `ln -s` instead of a Windows
   junction type-checks and lints perfectly while every Vitest project refuses
   to run. Two submissions have been turned in from a tree in that state,
   having never executed a test. Worktrees created by
   `pwsh scripts/new-worktree.ps1 -Name <id>` are verified against this.
1. **A stale tsc cache.** `tsBuildInfoFile` is tree-local now, but if you are
   in a worktree whose `node_modules` is a junction to another checkout, run
   `rm -f .tsbuildinfo` before trusting `type-check`. A cached green is
   indistinguishable from a real one. This has already caused a false "0
   errors" report on a tree with two type errors in it.
2. **`tsc --pretty` emits ANSI codes**, so `grep "error TS"` matches nothing on
   a failing tree. Read the raw output, or grep `-E "Found [0-9]+ error"`.
3. **A blanket `/* eslint-disable ... */` header makes `lint` green** while
   hiding real errors — including the unsafe-`any` errors that a broken type
   import causes. Adding one is an automatic rejection (§3.4).

## 3. Turn-in rules — each is an automatic rejection

1. **If an acceptance criterion names a test, that test must exist and pass.**
   No new or changed test file means do not report done.
2. **A test with no assertion is not a test.** An empty `it()` body passes and
   inflates the count; `vitest/expect-expect` now makes it a lint error. Do not
   leave a comment describing the test you intended to write.
3. **Delete code you replace** — never comment it out — and remove any param,
   prop, or import your change orphans.
4. **No new lint suppressions.** If your change trips a rule, refactor until
   it's clean. Blanket file-level `eslint-disable` headers are banned in new
   code; the existing ones are debt, not a pattern to copy.
5. **Do not commit, stage, or push anything.** The reviewer controls commits.
   Never `git add -A` — the repo owner works this tree from a second IDE, so
   unrelated changes are routinely present. For the avoidance of doubt: work
   promotes `dev` → `test` → `main` and `main` is live, so pushing to `test` or
   `main` is never part of a ticket. Leave your work uncommitted on the branch
   you were given.
6. **Stay in scope.** Don't touch files outside your ticket, and don't work
   another ticket. If a criterion is impossible or wrong, or the scope
   explodes, **stop and report the blocker** — do not quietly reinterpret it.
   Satisfying a criterion in a way that breaks the feature is the worst
   available outcome, and it has happened here: a rule banning any field named
   `value` was met by dropping the column that holds every DataVault cell's
   data, which would have shipped exports containing no data.

Report back: exactly which files changed, the gate output proving green, and
any deviation with its reason.

## 4. Never test against production

An earlier version of this file said the app is tested on live Railway against
the production database and that you must push to test. **That was wrong and
has been deleted.** `www.ezbuildr.com` is production serving real customers,
and `main` auto-deploys to it on push.

Run the app locally: `npm run dev` on port 5000, with the login workaround in
`.claude/skills/verify/SKILL.md`. Never push in order to test a change, and
never point anything at the production database.

## 5. Tickets

Work arrives as a ticket in `tickets/*_TICKETS.md`. Read that file's "How to
work this document" header and **your ticket only**.

`tickets/BACKLOG.md` and `tickets/backlog/` are **not** work. They hold parked
observations from closed initiatives, deliberately outside the `*_TICKETS.md`
glob. Do not read them unless your ticket sends you there, and never treat an
entry in them as something to implement. Meet every acceptance
criterion literally, then grade your own work A–F and fix to an A before
reporting done — an A meaning: every criterion met, tests written and green,
gates green, no leftover scratch files or debug output, and nothing in the diff
you'd rather not defend.

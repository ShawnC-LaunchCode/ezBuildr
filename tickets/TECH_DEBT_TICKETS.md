# Tech Debt — standing backlog (DEBT-1..16)

Standing register of known, evidenced debt in ezBuildr. Unlike an audit-driven
initiative, this file has **no phases and no phase gates**: the items are
independent and can be dispatched in any order, subject to the file-overlap
notes in each ticket's Ties. That is a deliberate deviation from the usual
ticket-flow structure — forcing artificial phases onto unrelated debt would
serialize work that has no reason to be serialized.

Opened 2026-07-28. Every item below was verified against the working tree on
that date with `file:line` evidence; line numbers drift, so search for the
quoted code if a reference goes stale.

**Nothing here is on fire.** These are the things that will cost more the
longer they sit, not outages. Priorities are relative to each other, not to
feature work.

---

## How to work this document

- Read the file's rules plus **your ticket only**.
- **Load the named project skills before touching code** — `.claude/skills/`
  for Claude Code; non-Claude agents read `AGENTS.md` at the repo root first,
  which names each `SKILL.md` by path.
- **Gates for every ticket:** `npm run type-check` → 0 errors, `npm run lint`
  → 0 problems, `npm run test:fast` → green at ≥ baseline.
- **Baseline at authoring time (2026-07-28, `npm run test:fast`):**
  `Test Files 146 passed | 1 skipped (147)`, `Tests 1978 passed | 15 skipped (1993)`.
- **Current baseline (2026-07-31, `npm run test:fast` on `main`):**
  `Test Files 156 passed | 1 skipped (157)`, `Tests 2059 passed | 14 skipped (2073)`.
  Measure against this one — the authoring-time figure is kept only for history.
- **Watch the tsc cache.** Fixed in `647d1465` for new trees, but if you are in
  a worktree created before that commit, `rm -f .tsbuildinfo` (and
  `node_modules/typescript/tsbuildinfo`) before believing `type-check`.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Theme | Priority | Size | Status |
|---|---|---|---|---|
| DEBT-1 | Drain unused eslint-disable directives | P2 | L | ✅ `4912f21f`..`0500ba6b` (8 tranches) — entry removed |
| DEBT-2 | Retire the 143 blanket file-level eslint-disable headers | P2 | L | ✅ `ac518f1d` — entry removed |
| DEBT-3a | Restore the two skipped `visibleIf` document-generation tests | P1 | M | ✅ verified at review 2026-07-30 — entry removed |
| DEBT-3b | Restore the skipped collab sync test | P1 | S | ✅ `8dfdee82` — entry removed |
| DEBT-4 | E-signature provider registry is never initialized | P1 | S | ✅ `9fcf05b4` — ruled dormant; entry removed |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | P1 | S | ✅ `f308fde2` + `50408c33` — entry removed |
| DEBT-6 | Two parallel file subsystems | P2 | L | ✅ `058530b0` — entry removed |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | P1 | S | ✅ `23a5863e` — entry removed |
| DEBT-8 | DI container is built but ~unused | P2 | M | ✅ **Decision: removed, not adopted** (2026-07-30) — `server/di/` deleted; it had zero consumers. Entry removed |
| DEBT-9 | `type-check` is advisory in CI | P2 | S | ✅ `a0e43c9b` — entry removed |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | ✅ all 10 merged, verified at review 2026-08-01 — entry removed |
| DEBT-11 | RLS policies defined but not enforced (decision, not a fix) | — | — | 🔲 tracked |
| DEBT-13 | Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type | P1? | S | ✅ `fec4dbe7` — entry removed |
| DEBT-14 | `creation-routes.test.ts` fails 18 tests only when the whole file runs | P2 | M | ✅ `5ae7fde3` — a tx deadlock, not the test-isolation defect it was filed as; entry removed |
| DEBT-15 | Generated documents are written to the ephemeral container filesystem | P1 | L | ✅ code done — **inert until `STORAGE_DRIVER=s3` is set in Railway**, see Outstanding below; entry removed |
| DEBT-16 | `propagateRename` swallows errors inside a caller's transaction | P2 | S | ✅ `8351ab04` — atomic model, mutation-proved; entry removed |

## Outstanding operational actions

Not tickets — configuration and repo settings a dev cannot do from a worktree.
Kept here because the tickets that surfaced them are closed and their entries
have been removed.

1. **`STORAGE_DRIVER=s3` + bucket credentials in Railway.** DEBT-15's code
   landed (`99a7ada1`) and is driver-agnostic, but `STORAGE_DRIVER` defaults to
   `disk` and `DiskStorageProvider` writes under
   `process.cwd()/server/files`. **Until this is set, generated documents still
   land on the ephemeral container filesystem and customers still get 404s
   after every deploy.** Env surface is documented at `.env.example:108-110`;
   `S3StorageProvider` already exists. This is also the blocking step for
   GitHub issue **#169 (P0)**.
2. **Branch protection is off.** CI ran red across four consecutive pushes on
   2026-07-31 — including two feature merges — and nothing prevented a single
   merge. This was surfaced by DEBT-10, whose AC 2 assumed CI gates the merge;
   it does not. Still true after DEBT-10 closed: every dependency bump in that
   ticket was merged with nothing blocking a red run, so "CI was green" there
   rests on the dev reading each run, not on enforcement.
3. **Delete `origin/debt9-typecheck-proof`.** Its only commit is a deliberate
   type error, kept to prove the CI gate blocks. The gate is proven.

---

## DEBT-11 — RLS policies defined but not enforced 🔲 *tracked, not a fix*

**Not a ticket yet — a decision Shawn owns.** Recorded here so it stops living
only in migration comments.

`migrations/0001_enable_rls.sql` is explicit that this is deliberate:

> SAFE TO SHIP: RLS is bypassed for a table's OWNER and superusers unless FORCE
> mode is set. Prod connects to Neon as the table owner; CI/tests connect as the
> postgres superuser — so policies are **DEFINED but NOT ENFORCED** until a
> deliberate later step.

So tenant isolation currently rests entirely on service-layer `tenant_id`
scoping; the database-level backstop exists but is inert. That is a considered
posture, not an oversight — but it means the second line of defence is not
actually a line of defence, and the longer it stays that way the more code is
written assuming it will never be turned on.

Turning it on is a real project: it needs a non-owner role, a connection
strategy, and a test pass proving nothing breaks. See
`docs/architecture/TENANT_ISOLATION_RLS.md` (SEC-051).

**Next step:** a decision on whether enforcement is planned this quarter. If
yes, it becomes its own initiative with its own ticket file. If no, say so in
the docs so nobody mistakes the policies for active protection.

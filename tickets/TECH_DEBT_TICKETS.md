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
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | P2 | S | 🔄 1/10 — #129 merged, #130–#138 open |
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
   merge. DEBT-10's AC 2 assumes CI gates the merge; it does not.
3. **Delete `origin/debt9-typecheck-proof`.** Its only commit is a deliberate
   type error, kept to prove the CI gate blocks. The gate is proven.

---

## DEBT-10 — 10 dependabot PRs open since 2026-07-11 ✅ Done (2026-08-01)

> **Progress 2026-07-31 — read this before picking the ticket up.**
>
> **#129 (`actions/github-script` 7→9) is merged** (`f9a66690`) and is fine.
> **#130–#138 remain open.**
>
> The first dev correctly stopped on a red post-merge run. That red was **not
> caused by #129** — two unrelated faults were failing Deployment Safety Check,
> and `main` was already red for every push including two feature merges. Both
> are now fixed (`eaede9a6`, `4aad6e00`) and **`main` is fully green at
> `4aad6e00`**. You are not inheriting a broken tree.
>
> What broke, because it will shape how you read your own CI runs:
>
> 1. **gitleaks scans commit history, not the diff.** Merging a three-week-old
>    dependabot branch widened the ancestry and pulled in two findings from a
>    2026-07-28 commit — fixtures in
>    `tests/unit/portability/secretScanner.test.ts`, the test for our own secret
>    scanner. Fingerprints are now in `.gitleaksignore`. **Diagnose a gitleaks
>    failure by the finding's commit date, not by what you just merged.**
> 2. **`npm run lint` is `--max-warnings 0` repo-wide.** A stray warning
>    anywhere fails CI, and `npx eslint <changed files>` exits 0 on those same
>    warnings. Run the script, not a file list.
>
> **#130 is `gitleaks/gitleaks-action` 2→3** — a major bump to the exact action
> that just broke CI. Treat its post-merge run as the highest-risk step in this
> ticket. If v3 changes ignore-file handling, `.gitleaksignore` may stop being
> honoured and the secretScanner fixtures will surface again; that is a config
> fix, not a reason to delete the fixtures or weaken the scan.

**Original ticket follows.**

**Priority: P2** · Size: S · Files: `package.json`, `.github/workflows/*`

### Finding

Ten dependabot PRs (#129–#138) have been open since 2026-07-11 — over two
weeks. **Five** are GitHub Actions major-version bumps (`checkout` 3→7,
`setup-node` 3→6, `upload-artifact` 4→7, `github-script` 7→9,
`gitleaks-action` 2→3) and **five** are npm packages (`yjs` 13.6.28→13.6.31,
`autoprefixer`, `@radix-ui/react-toast`, `@radix-ui/react-context-menu`,
`@tailwindcss/typography`). *(The original text said six and four; corrected
2026-07-31 against the live PR list.)*

Action bumps that far behind eventually become forced work when GitHub retires
the old runner images, and `yjs` underpins real-time collaboration.

### Preferred fix

Triage in two batches, not one merge queue. GitHub Actions bumps first — they
are major versions and can break CI, so land them one at a time and confirm CI
is green after each. Then the npm bumps, with the full suite run against `yjs`
specifically since collaboration is the least-tested area (see **DEBT-3**).

Close, with a reason, anything not wanted rather than leaving it open.

### Ties

- **DEBT-3b is now closed** (`8dfdee82`, 2026-07-31), so the collab sync test is
  restored and `tests/integration/collab.sync.test.ts` exists. The `yjs` bump
  finally has a safety net — run that file specifically against the bump. The
  earlier advice to land DEBT-3 first is satisfied; do not wait on anything.
- **Re-verified 2026-07-31:** all ten PRs (#129–#138) are still open, unchanged
  since 2026-07-11. Five are GitHub Actions bumps (`checkout` 3→7,
  `setup-node` 3→6, `upload-artifact` 4→7, `github-script` 7→9,
  `gitleaks-action` 2→3) and five are npm (`yjs`, `autoprefixer`,
  `@radix-ui/react-toast`, `@radix-ui/react-context-menu`,
  `@tailwindcss/typography`).
- **File overlap:** none with DEBT-15 or DEBT-16 — this ticket lives in
  `package.json` / `package-lock.json` / `.github/workflows/`. Safe in parallel.
- Branch protection is currently **off**, so a red CI run will not block a
  merge. Read each run's result yourself rather than trusting the merge button.
- Load `run-tests`.

### Acceptance criteria

1. Every one of #129–#138 is merged or closed with a stated reason.
2. CI green after each Actions bump individually, not just at the end.
3. The `yjs` bump is verified against real-time collaboration behaviour, by
   test or by hand, with evidence attached.

### Reviewer verification (2026-08-01)

**All 3 criteria met.** All ten PRs merged to `main`, none closed; **zero**
Dependabot PRs remain open, so nothing was quietly abandoned. #129 and #130
were confirmed individually rather than inferred from the batch.

AC2: the two workflows that gate every push — `Deployment Safety Check`
(`ci.yml`) and `TypeScript Strict Mode Check` — are green across the run
history apart from one failure matching the two pre-existing faults this
ticket documents, and both remediation commits are real and in history
(`eaede9a6`, `4aad6e00`). Action versions are consistent across all four
workflow files: `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`,
`github-script@v9`, `gitleaks-action@v3`, with no stragglers on old majors.
Note `setup-node` landed on **v7**, not the v6 this ticket's Finding
predicted — the dev refreshed it before merging.

AC3 was **reproduced by the reviewer**, not accepted from the report:
`npx vitest run --project integration tests/integration/collab.sync.test.ts`
→ 3 passed, against `yjs` **13.6.31** confirmed as the *installed* version,
not merely the declared one.

**The flagged highest risk is genuinely cleared.** This ticket warned that
`gitleaks-action` v3 might stop honouring `.gitleaksignore` and resurface the
`secretScanner` fixtures. The gitleaks step lives in the `security` job of
`Deployment Safety Check`, which runs on every push to `main`; those runs are
green with the 19-line `.gitleaksignore` still in place. That is evidence, not
an assumption.

**Bonus coverage:** `node_modules` was verified to match the bumped
`package.json` (yjs 13.6.31, autoprefixer 10.5.2, react-toast 1.2.19), which
means the LIST-9/10/12 review gates run the same day — `tsc` 0 errors,
repo-wide `lint` clean, `test:fast` **2204 passed** — all executed against the
upgraded dependency tree.

**Observation, not a defect:** `download-artifact` remains at **v4** while
`upload-artifact` went to v7, which resembles the classic artifact
compatibility break. It is not one — Dependabot runs daily on
`github-actions`, raised the upload bump, and has no open PR for download, so
v4 is current. Worth knowing only that `auth-tests.yml` is path-filtered to
auth source files and so never ran during this ticket; that upload/download
pairing will first execute on the next auth-touching PR.

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

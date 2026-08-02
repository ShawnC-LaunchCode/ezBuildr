# Backlog detail — Tech debt (DEBT)

Full text for the `DEBT-*` entries indexed in [`../BACKLOG.md`](../BACKLOG.md).
**Read this file only when promoting one of them.**

The tech-debt register opened 2026-07-28 with DEBT-1..16. **Fifteen of sixteen
shipped**; what is left is one decision Shawn owns and three operational actions
no dev can do from a worktree. Closed ticket entries are in git history:

```bash
git log -p -- tickets/TECH_DEBT_TICKETS.md
```

Unlike an audit-driven initiative, this register had **no phases and no phase
gates** — the items were independent and dispatchable in any order. That was a
deliberate deviation from `ticket-flow`: forcing artificial phases onto
unrelated debt serializes work that has no reason to be serialized. Keep that
property if the register is reopened.

---

## DEBT-11 — RLS policies defined but not enforced · `product-decision`

**Not a ticket — a decision Shawn owns.** Recorded so it stops living only in
migration comments.

`migrations/0001_enable_rls.sql` is explicit that this is deliberate:

> SAFE TO SHIP: RLS is bypassed for a table's OWNER and superusers unless FORCE
> mode is set. Prod connects to Neon as the table owner; CI/tests connect as the
> postgres superuser — so policies are **DEFINED but NOT ENFORCED** until a
> deliberate later step.

So tenant isolation currently rests entirely on service-layer `tenant_id`
scoping; the database-level backstop exists but is inert. That is a considered
posture, not an oversight — but it means **the second line of defence is not
actually a line of defence**, and the longer it stays that way the more code is
written assuming it will never be turned on.

Turning it on is a real project: it needs a non-owner role, a connection
strategy, and a test pass proving nothing breaks. See
`docs/architecture/TENANT_ISOLATION_RLS.md` (SEC-051).

**Next step:** decide whether enforcement is planned this quarter. If yes, it
becomes its own initiative with its own ticket file. If no, **say so in the
docs** so nobody mistakes the policies for active protection.

---

## DEBT-OPS1 — `STORAGE_DRIVER=s3` + bucket credentials in Railway · `operational`

**This is a live customer-facing defect, not debt.** It is here only because it
is a config change, not code.

DEBT-15's code landed (`99a7ada1`) and is driver-agnostic, but `STORAGE_DRIVER`
defaults to `disk` and `DiskStorageProvider` writes under
`process.cwd()/server/files`. **Until this is set, generated documents still
land on the ephemeral container filesystem and customers still get 404s after
every deploy.**

Env surface is documented at `.env.example:108-110`; `S3StorageProvider` already
exists and is tested.

This is also the blocking step for GitHub issue **#169 (P0)**.

**Next step:** Shawn sets it in the Railway dashboard, then confirm a generated
document survives a redeploy.

---

## DEBT-OPS2 — Branch protection is off · `operational`

CI ran red across four consecutive pushes on 2026-07-31 — including two feature
merges — and nothing prevented a single merge.

Surfaced by DEBT-10, whose AC 2 assumed CI gates the merge; **it does not**.
Still true after DEBT-10 closed: every dependency bump in that ticket was merged
with nothing blocking a red run, so "CI was green" there rests on the dev
reading each run, not on enforcement.

**Next step:** Shawn enables branch protection on `main` requiring the CI
workflow to pass.

---

## DEBT-OPS3 — Delete `origin/debt9-typecheck-proof` · `operational`

Its only commit is a deliberate type error, kept to prove the CI type-check gate
blocks. **The gate is proven** (DEBT-9, `a0e43c9b`).

**Next step:** `git push origin --delete debt9-typecheck-proof`. Trivial; needs
Shawn's go-ahead only because it touches the remote.

---

## Closed — do not re-file

Every item below was verified at review with a commit reference.

| Ticket | Theme | Resolution |
|---|---|---|
| DEBT-1 | Drain unused eslint-disable directives | ✅ `4912f21f`..`0500ba6b` (8 tranches) |
| DEBT-2 | Retire the 143 blanket file-level eslint-disable headers | ✅ `ac518f1d` |
| DEBT-3a | Restore the two skipped `visibleIf` document-generation tests | ✅ verified 2026-07-30 |
| DEBT-3b | Restore the skipped collab sync test | ✅ `8dfdee82` |
| DEBT-4 | E-signature provider registry is never initialized | ✅ `9fcf05b4` — ruled dormant |
| DEBT-5 | `getTemplateFilePath` hardcodes disk storage | ✅ `f308fde2` + `50408c33` (also closes IEX-B5) |
| DEBT-6 | Two parallel file subsystems | ✅ `058530b0` (also closes IEX-B6) |
| DEBT-7 | `WorkflowClonerService` silently drops `workflows.settings` | ✅ `23a5863e` |
| DEBT-8 | DI container is built but ~unused | ✅ **Decision: removed, not adopted** (2026-07-30) — `server/di/` deleted; it had zero consumers |
| DEBT-9 | `type-check` is advisory in CI | ✅ `a0e43c9b` |
| DEBT-10 | 10 dependabot PRs open since 2026-07-11 | ✅ all 10 merged, verified 2026-08-01 |
| DEBT-13 | Legacy Final Documents casts `metadata.visibleIf` onto a mismatched type | ✅ `fec4dbe7` |
| DEBT-14 | `creation-routes.test.ts` fails 18 tests only when the whole file runs | ✅ `5ae7fde3` — a tx deadlock, **not** the test-isolation defect it was filed as |
| DEBT-15 | Generated documents written to the ephemeral container filesystem | ✅ code done — **inert until DEBT-OPS1 is done** |
| DEBT-16 | `propagateRename` swallows errors inside a caller's transaction | ✅ `8351ab04` — atomic model, mutation-proved |

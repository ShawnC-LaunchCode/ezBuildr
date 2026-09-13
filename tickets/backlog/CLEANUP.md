# Backlog detail — Post-promotion cleanup (CLN)

Full text for the `CLN-*` entries indexed in [`../BACKLOG.md`](../BACKLOG.md).
**Read this file only when promoting one of them.**

The cleanup board (CLN-1..7) **closed 2026-09-13**. It was opened 2026-09-12 by owner ruling, right
after the production promotion (PR #185): "bundle the tiny ones into one ticket and finish the lot today".
Six tickets were planned, and a seventh (CLN-7) was found at review. All seven landed on `dev` the same day,
each reviewer-verified with its own red-runs.

Closed ticket entries (Findings, preferred fixes, acceptance criteria and the dated verification notes) are
in git history:

```bash
git log -p -- tickets/CLEANUP_TICKETS.md
```

**Re-verify before promoting.** These were written against a tree that has since moved.

---

## CLN-B1 — Phantom `node-fetch` dependency in a script · `enhancement`

*Found reviewing CLN-5, 2026-09-12.* `scripts/test-captcha.mjs` does `import fetch from 'node-fetch'`, but
`node-fetch` is not declared in `package.json`. It resolves only because `google-auth-library` → `gaxios`
depends on it, now hoisted as v3.3.2 by the OpenTelemetry upgrade. The file is ESM, so the default import
works on v3. If `google-auth-library` ever drops the dependency, the script breaks with no warning.

**Next step:** Switch the script to the global `fetch` (Node ≥ 18), or declare `node-fetch`. One line.

## Operational leftover — run the canonicalizer against each environment · see `STB-B14`

CLN-4 fixed the code: `canonicalizeGraphJson` now converts legacy `sections[].steps[]` version graphs, and the
audit fails on anything left unconverted. The **data** is fixed only when the script is run with `--apply`,
then `--audit`, against each environment. On production 57 of 58 `workflow_versions` carry the legacy shape,
and dev and test carry the same rows. Production writes need the owner at a terminal, because the auto-mode
classifier blocks Claude from writing to production. Tracked on `STB-B14` so it is not filed twice.

---

## Closed — do not re-file

| Ticket | What shipped | Commit |
|---|---|---|
| CLN-5 | OpenTelemetry upgraded to one patched set; both allowlisted advisories removed, beating their 2026-10-11 expiry. Mutation-proven: the old lockfile fails the same audit gate | `59fd99ed` |
| CLN-1 | RLS-B5 (esign `authorizeRun` tenant-scoped), CB-B2 silent-clamp half (timeout capped at 3000 in the schema and UI), RUN-B1 and CB-B8 test gaps closed, portability temp-file flake fixed | `b59af8f6` |
| CLN-3 | LIST-B15: a `list` question can be a List Tools source; one shared envelope→rows conversion, normalized only at the runner boundary | `4767cf4d` |
| CLN-4 | STB-B14 code: the canonicalizer converts `sections[]` version graphs, proven against a real production graph. The data run is still owed, see above | `d1a5da89` |
| CLN-2 | RUN-P1: `onPageEnter` blocks and `beforePage` hooks run on page arrival (navigation and run start) | `1eefc61b` |
| CLN-6 | Dependabot targets `dev`; docxtemplater, the Radix navigation menu and `@types/google.maps` bumped; #177–#181 closed | `d77e5976` |
| CLN-7 | Found at review: block CRUD read `pages`/`steps` on the bare pool, so creating any data block failed under RLS. Four services tenant-scoped, with a new `blocks.rls` suite that passes under `RLS_RESTRICTED=true` | `6325414e` |

**Also filed by this board (index rows in `BACKLOG.md`):** `RLS-B6` (`blocks` has no RLS policy) and `DEP-B2`
(Tailwind 4 is a migration, not a bump).

**Process lessons worth keeping:**
- **The RLS gate caught what per-ticket review missed.** CLN-3's own review ran its integration test only as
  the owner role. The CI gate ran it as a non-owner and exposed CLN-7, a production bug that pre-dated the
  board. For any ticket that adds an integration test driving a route, run that file under `RLS_RESTRICTED=true`
  at review.
- **A restricted-mode run can fail in test setup, not in code.** One local run on `6325414e` failed 7 unrelated
  files in setup with `tuple concurrently updated`:
  - It was concurrent `ALTER ROLE … WITH PASSWORD` on the cluster-wide test roles, which is RLS-11 cause 5.
    Roles are cluster-wide, so any other restricted run against the same local Postgres can trigger it too.
  - The container was healthy (0 segfaults), and CI's clean runner passed the same commit.
  - `b909c73c` fixed it with an advisory-locked, retried role provisioning. The re-run on a tree including that
    fix was 151/151.

  Read the error before reading the file list.

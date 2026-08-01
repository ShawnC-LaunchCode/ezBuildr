# Portability — Import/Export Bundles (only IEX-14 remains)

Source: senior audit of the existing copy/clone/export surfaces, 2026-07-27,
in response to Shawn's request for (1) admin-wide export/restore, (2) per-client
export/import of everything they own, (3) per-object export/import.

Scope examined: `server/services/WorkflowClonerService.ts`,
`server/services/WorkflowBundleService.ts`, `server/services/WorkflowExportService.ts`,
`server/services/SnapshotService.ts`, `server/services/TransferService.ts`,
`server/services/FileStorageService.ts`, `server/services/storage/*`,
`server/services/templates.ts` + `templateFiles.ts`, `server/services/StorageQuotaService.ts`,
`server/utils/encryption.ts`, `server/routes/{workflows,projects,admin,workflowExports}.routes.ts`,
and all 106 `pgTable` definitions under `shared/schema/`.

Overall grade at audit time: **C+ for portability**. The expensive part is
already built and in production — `WorkflowClonerService` walks the full object
graph and remaps every UUID — but it can only write DB→DB. There is no
serialization path, the one service named for it is a stub that returns a
placeholder string, and the single most important asset class (template
binaries) is copied **by reference**, so any naive serialization would produce
bundles that are empty shells outside this system.

Every finding below was verified against the working tree on 2026-07-27 with
file:line evidence and quoted code. Line numbers may drift as fixes land —
search for the quoted code if a reference is stale.

**Round 1 is closed.** IEX-1..13 all shipped and were removed from this file
per the convention that `tickets/` holds open work only; their findings,
preferred fixes and dated verification notes are in git history
(`git log -p -- tickets/IMPORT_EXPORT_TICKETS.md`). Round 2's follow-up audit
is likewise closed — see `tickets/IMPORT_EXPORT_2_TICKETS.md`, which retains
only two standing rulings.

**Only IEX-14 remains**, and it changes no code: it is the one screenshot that
Phase 2 never captured. Note its stated blocker — a reviewing session without a
working browser surface — is no longer absolute: a dev proved on 2026-08-01
that a live drive-through is achievable by running its own dev server on a
spare port and capturing DOM evidence instead of pixels. Worth retrying on that
basis rather than leaving it parked.

---

## How to work this document

- **Tickets are grouped into phases**, ordered by risk and dependency. Do not
  start a phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer (Shawn's senior model).
- Each ticket has: **Finding** (what is wrong/missing, with evidence),
  **Preferred fix** (the approach the reviewer expects — deviate only with a
  stated reason), **Ties** (related tickets/skills/docs — load the named skills
  before touching code), and **Acceptance criteria** (all must pass).
- **Load the named project skills before touching code.** For anything under
  `server/routes/`, `server/services/`, or `server/repositories/`, load
  `add-api-endpoint`. For every ticket, load `run-tests` — **`npm test` naively
  gives wrong results in this repo**; the suite is three separate Vitest
  projects. IEX-1..11 require **no schema change**; if you think you need one,
  that is a blocker to report, not a thing to do (load `db-schema-change` and
  stop). Phase 3 does require one and says so.
- **Gates for every ticket:** `npm run type-check` → 0 errors, `npm run lint` on
  every file you touched → 0 problems, `npm run test:fast` → green with **no
  fewer than the baseline below**. `tsc --pretty` emits ANSI codes, so
  `grep "error TS"` finds nothing on a failing tree — read the raw output or
  grep `-E "Found [0-9]+ error"`.
- **Baseline at authoring time (2026-07-27, `npm run test:fast`):**
  `Test Files 143 passed | 1 skipped (144)`, `Tests 1963 passed | 15 skipped (1978)`.
- **A test that needs a database goes in `tests/unit/portability/` and is added
  to the `dbUnitTests` array in `vitest.config.ts`.** There is no
  `tests/unit-db/` directory — that array *is* the mechanism that routes a file
  into the `unit-db` project. Earlier drafts of IEX-4/5/6/8/9/10 said otherwise
  and were wrong; corrected 2026-07-28. Run those tests with
  `npm run test:unit:db`, not `npm run test:fast`.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE concurrently
  and unrelated changes are routinely present in the tree.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort | Status |
|---|---|---|---|---|
| 0 | Foundation: entity graph, allowlist, bundle format | IEX-1, IEX-2, IEX-3 | ~1.5 days | ✅ **Done 2026-07-27** — gate verified |
| 1 | Single-object **export** (ask #3, read path) | IEX-4..IEX-7, IEX-6B | ~2.5 days | ✅ **Done 2026-07-28** — gate verified by hand |
| 2 | Single-object **import** (ask #3, write path) | IEX-8..IEX-13, IEX-15 | ~2.5 days | ✅ **Done** — all closed and verified |
| 3 | Client-wide export/import (ask #2) | outline only | ~2 days | 🔲 never carved into tickets |
| 4 | Admin multi-tenant archive (ask #1) | outline only | ~2 days | 🔲 never carved into tickets |
| Backlog | Not phase-gated | IEX-B1..B7 | | 🔲 |

> **File trimmed 2026-07-31.** Every closed ticket entry (IEX-1..13, IEX-15,
> and the three Phase Gates) has been removed; only **IEX-14** is still open.
> The removed entries are in git history — `git log -p -- tickets/IMPORT_EXPORT_TICKETS.md`.
> Round 2 (`IMPORT_EXPORT_2_TICKETS.md`) audited and hardened this same
> single-object path; phases 3 and 4 above were outlines that were never
> carved into tickets, so their numbering does not correspond to the IEX-12..15
> tickets that actually shipped.

> **Phase 0 history, 2026-07-27.** A first dispatch of IEX-1/IEX-3 was killed
> mid-flight by an API session limit and produced nothing usable. A second
> dispatch delivered all three tickets but **failed review**: `type-check` was
> red (2 errors), `lint` was green only because three files carried blanket
> `eslint-disable` headers masking 55 errors, checksum verification was a
> no-op with a comment admitting it, five of six rejection cases had no test
> (one was an empty `it()` body that passed), and `datavault_values` dropped
> its `value` column — exporting DataVault rows with no data — to satisfy an
> over-broad AC that has since been amended. The re-submission fixed all of
> it; the two remaining gaps (below) were closed by the reviewer.

**Why the phases run #3 → #2 → #1, inverting Shawn's numbering:** each ask is
the previous one with a wider root set. The narrow scope is where format bugs
are cheap to find; finding them first in a 40 000-row tenant export is not.

---

## Decisions — RULED by Shawn 2026-07-27

All five escalations are now resolved. Phases 3 and 4 are **unblocked**.

- **D-1 — Run history in a client-wide bundle? → NO.** Confirmed: bundles carry
  structure + reference data (DataVault rows) only. `workflow_runs`,
  `step_values`, and execution traces stay out. If added later it must be
  behind an explicit `includeRunHistory` flag, default off, with its own
  retention and redaction review. Rationale: highest-volume and most PII-dense
  data in the system, and the least useful for the stated goal of rebuilding
  structure.

- **D-2 — Secrets posture → shape-only, as recommended.** Export `key`, `type`,
  `environment`, `metadata`; never `value`/`valueEnc`, never
  `connections.authConfig`/`oauthState`. Ciphertext is bound to
  `VL_MASTER_KEY` (`server/utils/encryption.ts:55`) — useless to the client and
  a key-compromise amplifier for us.

  **Shawn's intent, which widens the requirement — read this before working
  IEX-8/9/10/11.** The bundle is meant to be a genuinely portable, *working*
  asset, not just an archive:

  1. A user can upload a bundle and **own the result themselves**, then use the
     existing transfer flow (`server/services/TransferService.ts`) to move it to
     an org later. This is already the shape of IEX-9 (ownership always assigned
     from the importing user's context) — no change needed, but it is now a
     stated product requirement, not an implementation detail.
  2. A bundle can be handed to a **different client**, who imports it and gets a
     working copy. This is deliberate flexibility for the developers.
  3. **Because of 1 and 2, uploads are a hostile-input surface with real
     traffic** — "we scan for abuse before uploads happen". Bundles carry both
     binaries (DOCX/PDF templates) and executable code (lifecycle hooks,
     document hooks, transform blocks). Scanning is therefore mandatory, not
     best-effort: see the amended **IEX-8** (code-hook surfacing) and
     **IEX-10** (virus scanning of every blob before it is written to storage).

- **D-3 — `export_jobs` table → APPROVED.** Build it. Minimal shape:
  id, tenant_id, requested_by, scope, status, options jsonb, file_ref, error,
  timestamps. Reuse `files` for the artifact. This is the one part of the
  initiative that needs a migration — load `db-schema-change` for it.

- **D-4 — Admin export is NOT the DR mechanism → confirmed; DR is `pg_dump`.**
  Shawn: "you talked me out of DR, but to use pg_dump." Disaster recovery stays
  on Neon PITR + scheduled `pg_dump` to object storage (a config task, tracked
  separately from this initiative — see IEX-B7).

  **Added requirement:** the admin surface must support **selecting which
  tenants to export — all of them, or an arbitrary subset.** Not a blind
  "export everything" button. This changes Phase 4's shape: it is a
  multi-select tenant archive tool, not a single global dump. See the amended
  Phase 4 outline.

- **D-5 — Re-pointing the cloner at the new engine is Size L → its own
  initiative.** Filed as backlog **IEX-B1**; revisit once Phases 0–2 have
  proven the format in production.

---

# Phase 0 — Foundation

Three tickets that build the machinery every later phase sits on, with **no
user-facing surface at all**. Nothing here adds a route, a UI, or a migration.
The point of the phase is that after it lands, "which tables are in a bundle
and which fields of them" is a single reviewable file with a test that fails
when someone adds a table and forgets to classify it.

Explicitly out of scope for Phase 0: reading or writing any bundle from real
data, blobs, routes, authz, jobs.

**Dispatch order:** IEX-1 and IEX-3 touch disjoint files and may run in
parallel. IEX-2 depends on IEX-1's exported shape and must run after it.

## IEX-14 — Visual confirmation of an imported workflow in the builder 🔲

**Priority: P2** · Size: S · Files: **none — this ticket changes no code**

> Closes the one outstanding acceptance criterion in Phase 2. IEX-11 AC 8 asked
> for a screenshot of an imported workflow open in the builder. Everything else
> in that AC was verified live and is recorded in IEX-11's verification block;
> the screenshot could not be captured because the reviewing session had no
> browser tooling. This ticket exists solely to capture it.

### Finding

`IEX-11` shipped and the round-trip is proven at the API level: a workflow was
exported, previewed, applied, and read back through the *same* endpoints the
builder calls (`GET /api/workflows/:id/sections`,
`GET /api/sections/:id/steps`). Section titles matched the source exactly, steps
stayed nested under the right section, every id was freshly minted, preview
wrote nothing, and the audit trail showed exactly one import row.

What has **not** been confirmed is that the builder UI actually renders an
imported workflow correctly. API-level structural equivalence is strong evidence
but it is not the same claim: the builder could still fail to load, render an
empty canvas, or error in the console on data it did not create itself.

### Preferred fix

Do **not** write code. Run the existing harness, then look at the result.

1. Start the dev server from the repo root:

   ```bash
   npm run dev
   ```

   Wait for `http://localhost:5000/health` to return `"status":"healthy"`.
   If port 5000 is busy, `npm run kill-server` first.

2. In a second terminal, run the round-trip harness:

   ```bash
   npx tsx scripts/verifyPortabilityRoundTrip.ts
   ```

   It seeds a workflow, exports it, imports it back via preview → apply, and
   prints a block like this:

   ```
   RESULT: PASS
   ─────────────────────────────────────────────────────────────
     Log in with:      portability-verify-<stamp>@example.com
     Password:         TestPassword123!@#Strong
     SOURCE builder:   http://localhost:5000/builder/<source-id>
     IMPORTED builder: http://localhost:5000/builder/<imported-id>
   ─────────────────────────────────────────────────────────────
   ```

   If it prints anything other than `RESULT: PASS`, **stop and report that** —
   it means the round-trip itself regressed, which is a bigger finding than the
   screenshot.

3. Log in through the UI at `http://localhost:5000` with the printed email and
   password. (Google OAuth cannot be driven headlessly; the login form also
   accepts email/password for locally-registered users — see the `verify`
   skill.)

4. Open the **IMPORTED** builder URL. Confirm and screenshot:
   - the section `Applicant Details` is present,
   - it contains the steps `Full name` and `Email address`,
   - the workflow loads without an error state or empty canvas.

5. Open the **SOURCE** builder URL and screenshot it too, so the two can be
   compared side by side.

6. Check the browser console on the imported workflow and report any errors or
   warnings verbatim.

### Ties

- Closes **IEX-11** AC 8. IEX-11 is otherwise ✅ and already pushed.
- Load the `verify` skill (`.claude/skills/verify`) — it documents booting the
  app and the local-auth workaround.
- The harness is `scripts/verifyPortabilityRoundTrip.ts`, committed with this
  ticket. Read its header comment before running.
- Gotcha already paid for: `POST /api/auth/register` does **not** assign a
  tenant, and every subsequent API call 400s with
  `"User does not have a tenant assigned"`. The harness does that bootstrap for
  you — do not re-derive it.
- Note the source workflow legitimately has **two** sections: creating a
  workflow via the API seeds a default `Section 1` alongside
  `Applicant Details`. Two sections is correct, not a bug.

> **Amended 2026-07-28 after round 1.** The first attempt got `RESULT: PASS` from
> the harness but could not log into the UI: `POST /api/auth/register` leaves
> `users.emailVerified` false, and the UI login path rejects that with
> `EmailNotVerifiedError` (403) at `server/routes/auth.routes.ts:84`. A bearer
> token from `/register` works fine against the API, which is why the reviewer
> never hit this — the whole IEX-11 verification went through the API path.
> Correctly diagnosed and reported rather than worked around.
>
> **The harness now sets `emailVerified: true` during its bootstrap and then
> proves the credentials on the real login endpoint**, printing
> `UI login path OK (HTTP 200)` before it prints them. It can no longer hand out
> credentials that work only for scripts. Re-run it and the screenshots are
> obtainable.

### Acceptance criteria

1. `scripts/verifyPortabilityRoundTrip.ts` runs against the dev server and
   prints `RESULT: PASS` **and** `UI login path OK (HTTP 200)`. Paste its full
   output.
2. A screenshot of the **imported** workflow open in the builder, showing the
   `Applicant Details` section containing `Full name` and `Email address`.
3. A screenshot of the **source** workflow in the builder for comparison.
4. The two workflows are confirmed to have **different** ids (visible in the
   URLs of the two screenshots).
5. Browser-console output for the imported workflow is reported — either "no
   errors" or the errors verbatim.
6. No files are modified. `git status` at the end shows a clean tree. If you
   believe a code change is needed, **stop and report it** rather than making
   it — that is a new finding, not this ticket.

---

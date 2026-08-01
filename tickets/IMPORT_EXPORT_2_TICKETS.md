# Portability Round 2 — Hardening the Import/Export Engine (IEX2-1..16)

Source: senior audit of the shipped portability engine, **2026-07-29**, at
Shawn's request: *"look deeply into the import/export features, grade it A–F,
and create tickets for any problems you see, be picky, this needs to work when
things go wrong."*

Round 1 (`tickets/IMPORT_EXPORT_TICKETS.md`, IEX-1..14) built the engine.
This file is the follow-up audit of what it actually does on realistic data.

## Scope examined

`server/services/portability/*` (all 9 files, 2 130 lines),
`server/routes/portability.routes.ts`, `server/services/WorkflowExportService.ts`,
`server/routes/workflowExports.routes.ts`, `scripts/verifyPortabilityRoundTrip.ts`,
`server/services/StorageQuotaService.ts`, `server/middleware/rateLimiter.ts`,
the 7 `tests/unit/portability/*` suites + 3 `tests/integration/portability.*`
suites, the relevant `shared/schema/workflow.ts` constraints, and a full sweep of
`client/` for any UI that reaches these endpoints.

## Method

Code read in full, plus **four live probes executed against a real Postgres**
(`tests/unit/portability/_audit_probe.test.ts`, run under the `unit-db` project,
deleted afterwards — the tree is clean). Every P0 below is a *reproduced
failure*, not a reading. The committed suite was run for a baseline first:

```
npx vitest run --project unit-db tests/unit/portability/
Test Files  7 passed (7)      Tests  45 passed (45)
```

**All 45 committed tests pass and every defect below is still live.** That is
the single most important sentence in this document: the suite is green because
it tests the paths the round-1 tickets named, and none of those paths involve a
workflow that has been published, given a slug, or made public — i.e. any
workflow a real customer owns.

---

## Overall grade: **D+**

Split by dimension, because the composite hides the shape of the problem:

| Dimension | Grade | Why |
|---|---|---|
| Architecture & format design | **B** | Declarative `ENTITY_GRAPH` with default-deny field allowlist, schema-coverage test forcing every one of 103 tables to be classified, content-addressed blobs, JSONL streams, manifest + checksum. This is a genuinely good skeleton. |
| Security posture (hostile bundle) | **B−** | Zip-bomb + path-traversal guards, checksum enforced, ownership stamped server-side and tested against a spoofing bundle, role rows dropped, virus scan + quota before any write, shape-only secrets, secret scanning, audit + rate limiting. Real gaps remain (IEX2-2, IEX2-6, IEX2-13). |
| **Correctness on realistic data** | **F** | Cannot round-trip a workflow that is published, slugged, public, or has a soft-deleted DataVault row. Three of four probes failed on the *first* realistic input tried. |
| **Behaviour when things go wrong** | **D** | Rollback leaks storage and burns quota; errors are classified by substring matching on messages; schema/version drift surfaces as raw Postgres and Zod dumps; declared memory limits are ~10× what the process survives. |
| User reachability | **F** | Zero UI. Confirmed by a full sweep of `client/` — not one call to `/api/portability/*`. The feature cannot be used by a customer today. |
| Test & proof quality | **D+** | 45 green tests that collectively miss every defect here, and a round-trip harness that passes because it exercises a two-text-step workflow with no slug, no blobs, no DataVault, and no version. |

**Why D+ and not F:** the foundation is real and the security work is above
average — this is not amateur code, and Phase 2's gate was never closed, so the
work is admittedly mid-flight. **Why not B:** the core function does not work.
Export a normal published workflow and import it back and you get a 500.

**The control that should have caught this already existed and was skipped.**
The unchecked Phase 2 Gate in the round-1 file demands: *"export a project with
templates + DataVault data, import it, and confirm the imported copy runs
end-to-end."* Nobody ran it. Every P0 below would have surfaced on the first
attempt.

---

## Findings ranked by risk

Proven live are marked **[PROVEN]** with the reproduction.

1. **[PROVEN] Timestamp columns make import throw** — `Validation failed in workflow_versions: Expected date, received string`. Affects any bundle with a published version, a soft-deleted DataVault row, or a number sequence that has reset. → **IEX2-1**
2. **[PROVEN] Unmapped foreign keys are written verbatim** — a tampered bundle's logic rule imported pointing at a step in a *different workflow* that was never in the bundle. → **IEX2-2**
3. **[PROVEN] Import auto-publishes and clones the public link; slugged workflows cannot import at all** — imported workflow came back `isPublic: true`, same `publicLink`, `status: 'active'`; and `workflows.slug` is globally `.unique()`, so re-import into the same system is a guaranteed constraint violation. → **IEX2-3**
4. Blobs are written to storage **before** the transaction and never cleaned up when it rolls back — every failed import leaks storage and quota. → **IEX2-4**
5. Audit log records **attacker-declared** entity counts straight from the manifest. → **IEX2-5**
6. ACL rows are **exported** (leaking source-system user/team UUIDs and roles to whoever receives the bundle) but silently dropped on import by a fragile field-name heuristic. → **IEX2-6**
7. Preview reports **false** step-alias collisions and checks the wrong project column. → **IEX2-7**
8. `appVersion` and `migrationHead` are hardcoded placeholders and never checked — no version/schema-drift guard exists. → **IEX2-8**
9. Export can **crash the process** on a disk error: the write-stream `error` listener is attached only on the backpressure branch. → **IEX2-9**
10. Whole-bundle buffering + adm-zip's in-memory pack/unpack defeat the streaming design; declared limits (2 GB) are far above what the process survives. → **IEX2-10**
11. Export loads every matching row into memory with no pagination. → **IEX2-11**
12. Duplicate zip entry names: the checksum covers all copies, the reader uses the first. → **IEX2-12**
13. Zip-bomb guards trust attacker-declared header sizes and skip the ratio check when `compressedSize === 0`. → **IEX2-13**
14. Secret redaction reaches exactly one JSON path; `scanForSecrets` structurally cannot look inside JSON at all. → **IEX2-14**
15. The round-trip harness proves only the trivial path and leaks a tenant per run. → **IEX2-15**
16. No UI exists. → **IEX2-16** — ⏸️ ruled **deferred** out of round 2; the
    feature stays `curl`-only for now, by decision.
17. Export requires only `view`, while import requires `edit` — a read-only
    collaborator can take an irrevocable offline copy. → **IEX2-17** (was
    decision D-6, ruled: require `edit`)

---

> **File trimmed 2026-07-31.** Round 2 is complete: IEX2-1..15 and IEX2-17
> are closed and their entries removed, as is decision D-6 (superseded by
> IEX2-17). Only **IEX2-16** (UI, ruled deferred) and **D-7** (adm-zip swap,
> ruled its own initiative) remain below. The "Findings ranked by risk" list
> above is kept as the audit record; removed entries are in git history —
> `git log -p -- tickets/IMPORT_EXPORT_2_TICKETS.md`.

## How to work this document

- **Load `add-api-endpoint` before touching `server/routes/` or `server/services/`.**
  Load `run-tests` for every ticket — **`npm test` naively gives wrong results
  in this repo**; the suite is three separate Vitest projects.
- **A portability test that needs a database goes in `tests/unit/portability/`
  AND must be added to the `dbUnitTests` array in `vitest.config.ts:10`.** That
  array *is* the mechanism that routes a file into the `unit-db` project. There
  is no `tests/unit-db/` directory.
- **Run DB tests like this** (the repo's `.env` points at the dev DB, not the
  test DB — without this override you get `28P01 password authentication
  failed`, which cost this audit a cycle):

  ```bash
  npm run test:docker:up
  TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5434/ezbuildr_test" npx vitest run --project unit-db tests/unit/portability/
  ```

- **Gates for every ticket:** `npm run type-check` → 0 errors; `npm run lint` on
  every file you touched → 0 problems; the portability `unit-db` suite green at
  **no fewer than 45 passing tests**; `npm run test:fast` green.
  `tsc --pretty` emits ANSI codes, so `grep "error TS"` finds nothing on a
  failing tree — grep `-E "Found [0-9]+ error"` or read the raw output.
- **No schema change is needed for IEX2-1..15.** If you think you need one, that
  is a blocker to report, not a thing to do.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE concurrently.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Status |
|---|---|---|---|
| A | **P0 — the feature does not work on real data** | IEX2-1..4 | ✅ **COMPLETE** — all four P0s fixed |
| B | P1 — trust, failure handling, scale | IEX2-5..11, **IEX2-17** | ✅ **COMPLETE** — IEX2-5 ✅ 6 ✅ 7 ✅ 8 ✅ 9 ✅ **10 ✅** 11 ✅ 17 ✅ |
| C | P2 — hardening, redaction depth, real proof | IEX2-12..15 | 🔄 IEX2-12 ✅ + IEX2-13 ✅ done |
| D | Make the feature reachable | IEX2-16 | ⏸️ **deferred out of round 2** |

**All decisions are now ruled — nothing is waiting on Shawn (2026-07-29).**

- **D-6** (view vs. edit to export) → **require `edit`**. Filed as **IEX2-17**,
  Phase B.
- **D-7** (replace adm-zip) → its own initiative, sequenced before Phase 3.
- **IEX2-16** (UI) → **deferred; do not dispatch.** This *supersedes* the earlier
  ruling that pulled it forward into Phase D. Engine first.

Round 2 is therefore **IEX2-1..15 + IEX2-17 = 16 tickets, all engine work.**

⚠️ **Because the UI is deferred, `scripts/verifyPortabilityRoundTrip.ts` is the
only end-to-end proof this feature has.** That makes **IEX2-15** the sole
integration gate for the whole round, whatever its P2 label says. Do not let it
be the ticket dropped for time, and do not close Phase C without it.

### Already fixed by the reviewer 2026-07-29 — do not re-ticket

Trivia cleared during the audit so it did not consume a ticket. Verified with
`tsc` (exit 0), `eslint` (clean), portability `unit-db` suite (48 passed):

- **`tests/unit/debug_import.test.ts` deleted** (was backlog B-9) — committed
  scratch asserting `registerAiRoutes` is defined; unrelated to imports despite
  the name, referenced by nothing.
- **Dead `versionAPI.export()` deleted** from `client/src/lib/vault-api.ts`
  (part of backlog B-10) — hit `/api/workflows/:id/export` with no format param
  and had zero call sites.
- **`ExportService.ts` now stamps `formatVersion: FORMAT_VERSION`** instead of
  the literal `1` — satisfies **IEX2-8 AC 1** in advance. The rest of IEX2-8
  (real `appVersion`, real `migrationHead`, and the import-side guard) is
  untouched and still the substance of that ticket.

### ⚠️ Execution order — read before dispatching

**IEX2-1, IEX2-2, IEX2-3, IEX2-4, IEX2-5, IEX2-6, IEX2-7 all edit
`server/services/portability/ImportService.ts`.** They touch different methods,
but they are **strictly sequential** — do not run two of them at once, in the
shared tree or in worktrees. Dispatch order is the ticket order.

Only these may run in parallel with the ImportService chain:

- **IEX2-9, IEX2-11, IEX2-17** — `bundleWriter.ts` / `ExportService.ts`. These
  three plus **IEX2-8** all touch `ExportService.ts`, so they are a **second
  sequential chain** among themselves: run them in the order
  IEX2-9 → IEX2-11 → IEX2-8 → IEX2-17. One chain may run alongside the other.
- **IEX2-12, IEX2-13** — `bundleReader.ts`
- **IEX2-14** — `redaction.ts` + `entityGraph.ts` *(conflicts with IEX2-3 and
  IEX2-6, which also edit `entityGraph.ts` — sequence after both)*
- **IEX2-15** — `scripts/verifyPortabilityRoundTrip.ts` only. Dispatch it **last**,
  after every other ticket is committed: with the UI deferred it is the round's
  only end-to-end gate, and it should run against the finished engine.

---

# Phase A — P0: the feature does not work on real data

## IEX2-16 — Minimal export/import UI ⏸️ **RULED 2026-07-29 — DEFERRED, do not dispatch**

> **Shawn's ruling (final, 2026-07-29):** *"dont worry about UI yet"* —
> **supersedes** the earlier *"ok go with that"* ruling that pulled this forward
> into Phase D. The UI is **out of scope for round 2**. Fix the engine first;
> revisit reachability once Phases A–C are committed and the round-trip actually
> works on real data.
>
> **Do not dispatch this ticket.** The spec below is kept intact and is still
> accurate — it is the starting point whenever the UI is picked up, so nobody has
> to re-derive the mount points, the download mechanics, or the preview fields.
>
> Consequence: the feature stays `curl`-only for now, so **`scripts/verifyPortabilityRoundTrip.ts`
> is the only proof that the engine works end-to-end.** That makes **IEX2-15**
> (which makes the harness actually exercise something hard) materially more
> important than its P2 label suggests — it is now the sole end-to-end gate.

**Priority: P1** · Size: M · Files: `client/src/lib/vault-api.ts`, new components
under `client/src/components/portability/`, plus the two mount points named below

### Finding

A full sweep of `client/` found **zero** references to `/api/portability/*` — no
export button, no upload control, no preview screen, no route. The only way to
use import/export today is `curl` or `scripts/verifyPortabilityRoundTrip.ts`.
Phase 2 shipped a complete, tested, audited backend that no customer can reach,
so ask #3 (per-object export/import) is not delivered end-to-end.

Two lookalikes that are **not** this feature — do not modify either:

- `client/src/components/history/WorkflowHistoryDialog.tsx:77-82` — "Export CSV"
  / "Export JSON" buttons hitting `/api/workflows/:id/export`. That is **run
  history** export, an unrelated surface (see backlog B-10).
- `client/src/lib/snips/` — an in-builder snippet inserter that shares only the
  word "import".

### Preferred fix

**Load the `design` skill before writing any UI** — the global CLAUDE.md rule
requires it for every visual change, and this is a new surface, not a tweak.

**Export.** Add `portabilityAPI.exportBundle(scope, id)` to
`client/src/lib/vault-api.ts`. Copy the download mechanics from
`workflowExportAPI.downloadExport` (`vault-api.ts:1495-1516`) — authenticated
`fetch`, `response.blob()`, hidden anchor click. It already handles the bearer
token and the cookie fallback correctly; do not invent a second approach. Name
the file from the `Content-Disposition` the server sends
(`portability.routes.ts:170`) rather than rebuilding it client-side.

Mount an "Export bundle (.ezb)" item on the existing workflow dropdown in
`client/src/pages/WorkflowsList.tsx`, and the project equivalent in
`client/src/pages/ProjectView.tsx`.

**Import.** A dialog, modelled on
`client/src/components/builder/tabs/templates/TemplateUploadDialog.tsx` for the
file-picker and upload mechanics (change the `accept` to `.ezb`). Three states:

1. **Pick** — choose a `.ezb`, optionally choose a target project.
2. **Preview** — `POST /api/portability/import/preview`, then render the
   response. This is the whole point of the screen; every field must be shown,
   because each one is something the user needs before they commit:
   - `entityCounts` — what is in the bundle
   - `collisions` — names that already exist (after IEX2-7 these are accurate)
   - `requiresReentry` — secrets/connections deliberately withheld, which the
     user must re-enter afterwards or the import will not function
   - `hasExecutableCode` — **prominent warning**; bundles carry JS/Python that
     will run in their tenant. Per decision D-2, bundles may come from other
     clients. This is the single most important thing on the screen.
   - `warnings` — `missing_blob` and `secret_scan` entries
   - `canProceed` — when false, **disable Apply**
3. **Apply** — `POST /api/portability/import/apply` behind an explicit button,
   never automatic. On success, show `rootId`/`blobsRestored`/`warnings` and link
   to the imported object in the builder.

**Do not** call apply without a preview first, and do not auto-advance from
preview to apply.

Handle the error statuses the routes already return: **413** (too large, message
carries the limit), **400** (invalid bundle — show the server's message, it is
written to be read by a human), **403** (quota/permission). Do not collapse them
into a generic "something went wrong".

### Ties

- **Blocked by Phase A (IEX2-1..4).** Dispatch only after IEX2-4 is committed.
- **Load the `design` skill.** Non-negotiable — global CLAUDE.md.
- Benefits from **IEX2-7** (accurate collisions) — if IEX2-7 has landed, say so
  in your report; if not, the collision list may be noisy and that is expected.
- Server contract: `ImportPreview` (`server/services/portability/ImportService.ts:34-46`)
  and `ImportApplyResult` (`:60-70`) are the exact response shapes. Mirror them as
  TypeScript types in `vault-api.ts`; do not use `any`.
- Route reference: `server/routes/portability.routes.ts:202-310`.
- Frontend conventions: `docs/guides/FRONTEND.md`,
  `docs/architecture/SHARED_COMPONENTS.md`.
- Touches no server file. **No conflicts with any other ticket in this file.**

### Acceptance criteria

1. An "Export bundle (.ezb)" action exists on a workflow and on a project, and
   downloads a working `.ezb` — verified by exporting, then importing that exact
   file back through the new UI.
2. An "Import bundle" dialog accepts a `.ezb`, calls **preview**, and renders
   every field listed above: `entityCounts`, `collisions`, `requiresReentry`,
   `hasExecutableCode`, `warnings`.
3. `hasExecutableCode: true` renders a visually prominent warning stating that
   the bundle contains code that will run in the user's tenant.
4. `canProceed: false` disables the Apply control.
5. Apply is a separate, explicit user action — a test or recording shows preview
   does not auto-apply.
6. 413, 400 and 403 each render a distinct, useful message taken from the server
   response, not a generic error.
7. **Live proof, not assertions:** screenshots of the export action, the preview
   screen with a real bundle (including a code-bearing one showing the warning),
   and the post-apply success state. Plus the browser console for the flow —
   "no errors" or the errors verbatim.
8. The full round trip is driven **through the UI only** — export a workflow,
   import it back, open the imported workflow in the builder — and screenshotted.
9. `npm run type-check` 0 errors; `npm run lint` clean on every touched file;
   `npm run test:fast` green.
10. The `design` skill was loaded; say so in your report and note which register
    you designed to.

---

# Decisions required from Shawn

---

## D-7 — Replace adm-zip on the read side? ✅ **RULED 2026-07-29 — its own initiative**

> **Shawn's ruling:** *"deal, lets do that"* — a separate initiative, sequenced
> immediately before Phase 3. It is **not** a ticket in this file. IEX2-10 still
> does the buffering fixes this codebase controls; the library swap waits.

IEX2-10 fixes the buffering this codebase controls, but adm-zip itself has no
per-entry read stream and builds archives in memory to write them
(`bundleWriter.ts:134`). A genuinely streaming implementation means moving the
read side to `yauzl`/`unzipper` and the write side to `archiver` or similar —
touching `bundleReader.ts`, `bundleWriter.ts`, `zipArchive.ts` and every test that
constructs a bundle with `AdmZip` directly (`importApply.test.ts:6`,
`bundleTestHelper.ts:2`, and others).

That is **Size L** and is a prerequisite for Phase 3's tenant-wide export, not
for Phase 2. Round-1 backlog IEX-B8 reached the same conclusion.

**Recommendation: its own initiative, sequenced immediately before Phase 3.**
Confirm and it will be tracked there rather than expanded into a ticket here.

---

# Backlog / observations

Not phase-gated. Re-verify `file:line` evidence before promoting any of these —
lines will drift as Phases A–C land.

- **B-1 — Export leaks source-system user UUIDs on ordinary entities.** Split out
  of IEX2-6, which handles the `*_access` tables. `projects.creatorId`/`createdBy`/
  `ownerId`/`ownerUuid` (`entityGraph.ts:23`), `workflows.creatorId`/`ownerId`
  (`:55`), `workflow_versions.createdBy` (`:136`), `templates.lastModifiedBy`
  (`:145`), `datavault_rows.createdBy`/`updatedBy` (`:207`). All are overwritten on
  import by `enforceOwnership` (`ImportService.ts:441-457`), so this is
  export-side disclosure only. Decide whether a cross-client bundle should carry
  them at all.
- **B-2 — Error classification is substring matching on messages.**
  `BUNDLE_REJECTION_SIGNALS` (`portability.routes.ts:81-95`) and the rethrow test
  in `ImportService.preview` (`ImportService.ts:276-284`, `err.message.includes('overflow')`)
  both key off human-readable text. Renaming an error message silently reclassifies
  a 400 as a 500. Typed error classes (the `BundleSizeLimitError` pattern at
  `bundleFormat.ts:9-14`) would be sound; converting all of them is a contained
  refactor once Phases A–C stop moving these files.
- **B-3 — `apply` never consults `preview`.** A bundle that `preview` reports as
  `canProceed: false` can still be posted straight to `/apply`
  (`portability.routes.ts:263`), which discovers the same problems mid-transaction.
  Harmless once IEX2-2/IEX2-4 make failures clean, but the two paths validating
  differently is a bug factory.
- **B-4 — `remapJsonIds` has IEX2-2's gap for ids inside JSON.** An unmapped UUID
  inside `steps.config`/`visibleIf`/`graphJson` is left pointing at the source
  system. Deliberately out of IEX2-2's scope because the helper is shared with
  `WorkflowClonerService` (DEBT-12, `server/utils/remapJsonIds.ts`). Needs its own
  ticket with the cloner's behaviour considered.
- **B-5 — `ensureUnique*` are N+1 queries inside the import transaction.**
  `ensureUniqueStepAlias` (`ImportService.ts:421-439`) runs at least one query per
  step, inside the transaction opened at `ImportService.ts:710`. A 500-step
  workflow is 500+ round trips holding a write transaction open.
- **B-6 — `StorageQuotaService.getTenantUsage` counts only template metadata.**
  It sums `templates.metadata->>'size'` (`StorageQuotaService.ts:35-39`), so
  imported blobs that are not templates never count toward quota, and `checkQuota`
  (`:14`) reserves nothing — concurrent imports both pass the same check.
- ~~**B-7 — `ExportService` cleans up twice.**~~ **WITHDRAWN 2026-07-29 — the
  finding was wrong.** `exportToFile`'s `finally` calls `state.writer.cleanup()`
  (`ExportService.ts:94`) and `writer.finalize()` also calls it in its own
  `finally` (`bundleWriter.ts:63-69`), but that is **not** redundancy — it is
  necessary defence. If `processDescriptor` or `blobCollector.finalize()` throws
  before `writer.finalize()` is ever reached, the outer `finally` is the *only*
  thing that reclaims the spool directory, which at export scale is gigabytes.
  The double call happens only on the success path and is harmless (`rmSync` is
  `force`). Leave it alone.
- **B-8 — `datavault_values.value` is run through `remapJsonIds`**
  (`entityGraph.ts:217`). That column is arbitrary user data; a stored UUID that
  happens to collide with an imported entity id would be silently rewritten. Low
  probability, real corruption if it hits.
- ~~**B-9 — `tests/unit/debug_import.test.ts` is committed scratch.**~~
  **DONE 2026-07-29** — deleted by the reviewer.
- **B-11 — `z.coerce.date()` accepts more than it should.** Raised at IEX2-1
  review. The coercion added in `ImportService.wrapDateField` correctly rejects
  `"not-a-date"`, but `new Date(true)` and `new Date(0)` are valid Dates, so a
  boolean or number in a timestamp field coerces instead of being rejected. This
  is a mild loosening, is what the ticket's Preferred fix asked for, and no
  exporter produces such a value — but a hostile bundle could. Tighten to
  "string-or-Date only, then coerce" if IEX2-2's stricter validation work makes
  it cheap.
- **B-10 — `WorkflowExportService.ts` / `workflowExports.routes.ts` are a second,
  unrelated export surface** (run history as CSV/JSON) that shares the word
  "export" and is the only export the UI actually exposes
  (`client/src/components/history/WorkflowHistoryDialog.tsx:77-82`). **Worth
  renaming one of the two before IEX2-16 ships**, or the product will show a user
  two unrelated things both called "Export" on the same workflow. The dead
  `versionAPI.export()` half of this was deleted 2026-07-29; the naming collision
  remains.

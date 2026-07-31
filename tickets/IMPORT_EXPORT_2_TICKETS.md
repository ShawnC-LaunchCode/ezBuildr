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
| B | P1 — trust, failure handling, scale | IEX2-5..11, **IEX2-17** | 🔄 IEX2-5 ✅ + IEX2-9 ✅ done; IEX2-6/7 in flight |
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

## IEX2-1 — Timestamp columns make every import throw ✅

> **VERIFIED at review 2026-07-29** — commit `7972fd05`, worked in worktree
> `.claude/worktrees/iex2-1`, fast-forwarded into `main`.
>
> `wrapDateField` (`ImportService.ts:193-216`) unwraps the ZodOptional/ZodNullable
> layers, substitutes `z.coerce.date()` when the innermost type is a `ZodDate`,
> and re-applies the same wrappers. **Date-ness is derived from the Zod schema
> shape, not a column-name list** (AC 6) — confirmed by reading the diff, and
> confirmed that the only allowlisted timestamps in `entityGraph.ts` are
> `workflow_versions.publishedAt` (:136), `datavault_number_sequences.lastReset`
> (:199) and `datavault_rows.deletedAt` (:207); no `createdAt`/`updatedAt` is
> allowlisted, so no `ZodDefault` wrapper is in scope.
>
> All ACs checked against the working tree by the reviewer, not taken on trust.
> **Mutation-tested:** reverting the single call site at `ImportService.ts:228`
> to `pickedShape[f] = shape[f]` makes the new test fail — so it exercises the
> fix rather than riding along. Reviewer-run gates: `tsc` exit 0; `eslint` exit 0
> on both files; portability `unit-db` **49 passed** (48 baseline + 1);
> `test:fast` **147 files / 2006 tests**, matching baseline.
>
> **Provenance note.** The implementation was already present, uncommitted, in
> the worktree when the dev was dispatched — written by a concurrent Gemini
> session. The dev reviewed and gated it rather than writing it, and said so.
> The reviewer independently verified the diff, scope (only the two in-scope
> files changed) and every gate. Dispatch checklists should add
> `git status` **inside the worktree** to the pre-flight checks.
>
> Follow-up for **IEX2-3**: `z.coerce.date()` will also coerce a boolean or a
> number rather than rejecting it (`new Date(true)` → epoch+1ms). Not a
> regression and within this ticket's Preferred fix, but noted — see backlog
> B-11.

> **Second reviewer pass, 2026-07-29 (independent re-verification).** Gates
> re-run from scratch against `main` rather than trusting the report:
> `tsc` 0 errors · `eslint` 0 problems on both files · portability `unit-db`
> **49 passed / 7 files** · `test:fast` **147 files, 2006 passed** (baseline).
> Mutation re-done independently: reverting `ImportService.ts:228` fails
> **exactly** the new test — 1 failed, 12 passed — which also demonstrates the 12
> pre-existing tests in that file never touched this path, the audit's central
> claim.
>
> One claim in the commit message was checked rather than assumed: *"a timestamp
> allowlisted in entityGraph later is covered without another edit here."* It
> **holds**. drizzle-zod emits `ZodOptional → ZodNullable → ZodDate` for every
> timestamp column including defaulted ones (`createdAt`/`updatedAt`) — there is
> no `ZodDefault` wrapper anywhere in this schema, so `wrapDateField`'s unwrap
> loop reaches the `ZodDate` in every case. Probed directly against
> `workflows`, `workflow_versions` and `datavault_rows`.
>
> **IEX2-2 is now unblocked** — `ImportService.ts` is free.

**Priority: P0** · Size: S · Files: `server/services/portability/ImportService.ts`

### Finding

`getZodSchema` builds the row validator straight from `createInsertSchema`
(`ImportService.ts:180-194`):

```ts
private getZodSchema(desc: EntityDescriptor): z.ZodTypeAny {
  const rawSchema = createInsertSchema(desc.table);
  ...
  for (const f of desc.fields) {
    if (f in shape) { pickedShape[f] = shape[f]; }
  }
  return z.object(pickedShape).strip();
}
```

For a Drizzle `timestamp` column, `createInsertSchema` produces `z.date()` — it
expects a JavaScript `Date`. But the bundle is **JSONL**: `BundleWriter.writeEntityRow`
(`bundleWriter.ts:37`) does `JSON.stringify(row)`, which serialises a `Date` to an
ISO **string**. On the way back in, `z.date()` rejects the string and
`processEntityInsertion` (`ImportService.ts:654-657`) turns that into a thrown
error that aborts the whole import.

**Reproduced 2026-07-29.** A workflow with one published version:

```
Error: Validation failed in workflow_versions: [
  { "code": "invalid_type", "expected": "date", "received": "string",
    "path": [ "publishedAt" ], "message": "Expected date, received string" } ]
  at ImportService.processEntityInsertion server/.../ImportService.ts:656:15
```

Allowlisted timestamp columns in `entityGraph.ts` today:

| Entity | Column | Set in normal product use when… |
|---|---|---|
| `workflow_versions` | `publishedAt` (`entityGraph.ts:136`) | a version is published |
| `datavault_rows` | `deletedAt` (`entityGraph.ts:207`) | a row is soft-deleted |
| `datavault_number_sequences` | `lastReset` (`entityGraph.ts:199`) | an autonumber sequence resets |

So: **any workflow that has ever been published cannot be imported**, and any
DataVault table with a soft-deleted row cannot be imported. Preview has the same
bug — it reports `Validation failed in workflow_versions: …` and sets
`canProceed = false` (`ImportService.ts:206-212`), so the user is told their
valid bundle is invalid.

The existing tests miss this because `TestFactory` never sets any of the three
columns.

### Preferred fix

In `getZodSchema`, wrap date-typed entries in the picked shape so an ISO string
is accepted and converted. Prefer `z.coerce.date()` over hand-parsing, and
detect the date-ness from the *Zod* schema (unwrapping `ZodOptional` /
`ZodNullable`), not from a hardcoded column-name list — a name list will rot the
next time a timestamp column is allowlisted.

Preserve nullability and optionality exactly: `publishedAt` and `deletedAt` are
nullable, and `null` must stay `null`, not become `Invalid Date`.

Do **not** solve this by removing the columns from `entityGraph.ts` — the
publication-state reset in **IEX2-3** depends on `publishedAt` still being
present so it can be explicitly cleared.

### Ties

- **First in the ImportService chain — dispatch before IEX2-2..7.**
- Blocks **IEX2-3**, which asserts on `workflow_versions.published`/`publishedAt`
  and cannot get that far while this bug throws.
- Load `run-tests` and `add-api-endpoint`.
- Files: `ImportService.ts` only. No schema change.

### Acceptance criteria

1. A new test in `tests/unit/portability/importApply.test.ts` (or a new file
   added to `dbUnitTests` in `vitest.config.ts:10`) exports a workflow that has a
   `workflow_versions` row with `published: true` and a non-null `publishedAt`,
   imports it, and asserts the import **succeeds**.
2. A test covers a `datavault_rows` row with a non-null `deletedAt` importing
   successfully, and asserts the imported row's `deletedAt` still equals the
   source instant (the value must survive, not be dropped).
3. A test asserts a **null** timestamp round-trips as `null` — not `Invalid Date`,
   not the epoch.
4. A test asserts `ImportService.preview` on the same published-version bundle
   returns `canProceed: true` with no `Validation failed in workflow_versions`
   error.
5. A genuinely malformed timestamp (e.g. `"not-a-date"`) is still **rejected**
   with a validation error — the fix must not turn the validator off.
6. The date handling is derived from the Zod schema, not a hardcoded list of
   column names. State in the PR/report how you detected it.
7. Gates: `npm run type-check` 0 errors; `npm run lint` clean on touched files;
   portability `unit-db` suite ≥ 45 + your new tests, all green; `npm run test:fast` green.

---

## IEX2-2 — Unmapped foreign keys are written into the database verbatim ✅

> **VERIFIED at review 2026-07-29** — commit `c120c32d`, worked by Gemini in
> `.claude/worktrees/iex2-2`, fast-forwarded into `main`.
>
> Nullability is read from Drizzle column metadata (AC 7), not a name list:
> nullable refs are nulled with a `dangling_reference` warning, NOT NULL refs
> throw a 400-classified error naming entity, column and id. `preview` runs the
> same analysis against the set of ids the bundle actually carries.
>
> **`workflows.projectId` is deliberately exempt** — an undocumented deviation in
> the turn-in that the reviewer traced and accepts. `resolveProjectIdOverride`
> (IEX-15) already owns that column and returns `undefined` in only two cases:
> the project travelled with the bundle (so `idMap` remaps it), or the unmapped
> project is same-tenant *and* the caller holds `edit` on it. The second is a
> resolvable reference; nulling it would detach every legitimate workflow-scope
> import. Now documented in the code.
>
> **Two ACs failed review and were completed by the reviewer:**
> - **AC 1** demanded a tampered id that *exists in the DB but is not in the
>   bundle*. The turn-in used `randomUUID()`. `logic_rules.targetStepId` carries
>   a real FK to `steps.id`, so a random UUID is rejected by Postgres with or
>   without the fix — the security case passed for the wrong reason. Replaced
>   with a real step from another workflow, the case that actually landed
>   verbatim, asserting the id is not written, the column is null, a warning is
>   raised, and the foreign workflow is untouched.
> - **AC 3** demanded a route-level 400 assertion. The turn-in asserted it in a
>   *code comment*. Added `tests/integration/portability.import.test.ts`;
>   removing the rejection signal makes it fail `expected 500 to be 400`, which
>   is the whole point given the classification is substring matching on message
>   text (backlog **B-2**).
>
> **Mutation-tested, both new tests independently:** removing the apply-path
> handling fails the AC 1 test; removing `'Unresolvable reference'` from
> `BUNDLE_REJECTION_SIGNALS` fails the AC 3 test.
>
> Reviewer-run gates: `tsc` 0 errors · `eslint` 0 problems on all 5 files ·
> portability `unit-db` **51 passed / 7 files** (49 baseline) · portability
> import integration **7 passed** (6 baseline) · `test:fast` **147 files / 2006
> tests**.
>
> **Note for IEX2-10/11:** `preview` now reads every entity stream **twice** —
> once to build the bundle-id set, once to process — and holds every id in
> memory. Correct today, but it is exactly the kind of whole-bundle buffering
> those tickets exist to remove. Fold it into their scope.
>
> **IEX2-3 is now unblocked** — `ImportService.ts` is free.

**Priority: P0 (security + integrity)** · Size: M · Files: `server/services/portability/ImportService.ts`

### Finding

`processSingleEntity` remaps declared FK columns only when the value happens to
be in the id map, and **silently passes it through otherwise**
(`ImportService.ts:603-610`):

```ts
// Remap explicit foreign keys from the descriptor's declared ref columns.
// UUIDs are globally unique, so a single idMap covers every entity.
for (const colName of ctx.desc.refs ?? []) {
  const val = data[colName];
  if (typeof val === 'string' && ctx.idMap.has(val)) {
    data[colName] = ctx.idMap.get(val)!;
  }
}
```

The comment's premise ("UUIDs are globally unique") is true and irrelevant: the
id map only contains ids *carried by this bundle*. A `refs` value that is not in
the map is a reference to something outside the bundle, and the `else` branch —
writing the source system's raw UUID into this tenant's row — is the worst of
the three options.

**Reproduced 2026-07-29.** Exported a workflow, edited one line of
`entities/logic_rules.jsonl` to point `targetStepId` at a step belonging to a
**different workflow** that was never in the bundle, recomputed the checksum, and
imported. The import succeeded and:

```
PROBE 4 imported rule targetStepId: [ 'd5e49299-16b0-4f85-84d1-53677bbf3303' ]
                       foreign was:   d5e49299-16b0-4f85-84d1-53677bbf3303
```

The imported logic rule points at a step the importing user's bundle never
contained. Consequences, in order of severity:

- **Cross-object reference injection.** Decision D-2 states bundles are handed
  between different clients and uploads are a hostile-input surface. A crafted
  bundle can attach imported rows to rows the uploader does not own, provided
  they can guess or learn a UUID. `enforceOwnership` (`ImportService.ts:441-457`)
  stamps `tenantId`/`ownerUuid` on the *new* row, but it does not — and cannot —
  validate what that row points **at**.
- **Ordinary breakage, no attacker needed.** `datavault_columns.referenceTableId`
  (`entityGraph.ts:191`) points at a table that may legitimately sit outside the
  export scope. Today it imports as a pointer into the source system.
- **Raw 500s.** Where a real FK constraint exists, the insert fails with a
  Postgres foreign-key error that matches none of `BUNDLE_REJECTION_SIGNALS`
  (`portability.routes.ts:81-95`), so a bad bundle answers 500 instead of 400.

### Preferred fix

Make the pass-through impossible. In the same loop, when a `refs` value is a
non-empty string that is **not** in `ctx.idMap`, decide by nullability of the
target column:

- **Nullable** → set to `null` and record a warning on the result (reuse the
  `ExportWarning`/`warnings` channel already threaded through
  `ImportApplyResult.warnings`, `ImportService.ts:67`), so the user is told the
  reference was dropped.
- **NOT NULL** → throw, with a message naming the entity, the column and the
  unresolvable id, phrased so `classifyImportError` maps it to a **400**. Add its
  signal to `BUNDLE_REJECTION_SIGNALS` in `portability.routes.ts:81-95`.

Read nullability off the Drizzle column metadata, not a hand-maintained list.

Mirror the same treatment in `preview` so a bundle with dangling references is
reported *before* apply — preview currently says nothing about them.

`ImportService.processSingleEntity:619-624` already implements exactly this
philosophy for blob refs, with a comment explaining why carrying the source ref
through is dangerous ("on a same-system import it resolves to the SOURCE
tenant's object"). Apply that reasoning to FK refs.

### Ties

- **Second in the ImportService chain. Dispatch after IEX2-1 is committed.**
- Same reasoning as the blob-ref handling at `ImportService.ts:612-624` — copy
  that pattern and its comment style.
- `remapJsonIds` (`server/utils/remapJsonIds.ts`, used at
  `ImportService.ts:599`) has the same class of gap for ids inside JSON, but it
  is shared with `WorkflowClonerService` (DEBT-12) — **do not change it here**.
  Note it in your report; it is tracked as backlog B-4 below.
- Load `add-api-endpoint` (error-string → status contract) and `run-tests`.

### Acceptance criteria

1. A new test tampers with an exported bundle so a `logic_rules.targetStepId`
   points at a step id that exists in the DB but is **not** in the bundle,
   imports it, and asserts the reference is **not** written verbatim.
2. A test asserts a NOT NULL unresolvable ref causes the import to be rejected,
   and that the error message names the entity and column.
3. A test asserts the route returns **400** (not 500) for that bundle.
4. A test asserts a nullable unresolvable ref (e.g.
   `datavault_columns.referenceTableId`) imports as `null` and produces a warning
   in `ImportApplyResult.warnings` naming the entity and column.
5. A test asserts `preview` reports dangling references before apply.
6. A test asserts the **happy path is unchanged**: a normal in-bundle reference
   still remaps to the new id (the existing "preserves forward references (AC 2)"
   test at `importApply.test.ts:239` must still pass unmodified).
7. Nullability is read from column metadata, not a hardcoded list.
8. Gates as in IEX2-1.

---

## IEX2-3 — Import auto-publishes workflows, clones live public links, and cannot import a slugged workflow at all ✅

> **VERIFIED at review 2026-07-29** — commit `d1e49393`, worked in
> `.claude/worktrees/iex2-3`, fast-forwarded into `main`.
>
> All six fields are forced in `enforceOwnership`. **The reset is gated on
> `desc.name`, not on `'x' in shape`** like the ownership stamps around it —
> the dispatch-block trap was avoided, so no invalid `'draft'` reaches
> `projects.status`.
>
> **AC 2's test was rewritten at review.** As turned in it imported the shared
> fixture bundle twice, but that workflow has no slug, so it never touched the
> unique index the criterion exists to guard — mutation testing showed it
> passing with the fix removed. It now sets a slug before exporting and asserts
> both copies import with a null slug while the source keeps its own. This is
> the third ticket in a row where a test passed for the wrong reason; mutation
> testing caught all three.
>
> **Mutation-verified:** disabling the `workflows` branch fails AC 1, 2, 3 and
> 5; AC 4 correctly survives, since it covers `workflow_versions`.
>
> Reviewer-run gates: `tsc` 0 errors · `eslint` 0 problems · portability
> `unit-db` **56 passed / 7 files** (51 baseline) · `test:fast` **149 files,
> 2016 tests**.
>
> **IEX2-4 is unblocked** — it is dispatched in `.claude/worktrees/iex2-4` and
> must `git merge main --ff-only` before turning in, since both tickets append
> to `importApply.test.ts`.

> **Dispatched 2026-07-29** — worktree `.claude/worktrees/iex2-3`, base
> `9c0a3cec` (proven by `scripts/new-worktree.ps1`). IEX2-4..7 are behind it in
> the `ImportService.ts` chain.
>
> ### ⚠️ Evidence refreshed at dispatch — the audit's line numbers are stale
>
> `ImportService.ts` grew ~117 lines across IEX2-1 (`7972fd05`) and IEX2-2
> (`c120c32d`). Current locations, re-verified against `9c0a3cec`:
>
> | Cited in the Finding below | Actually at |
> |---|---|
> | `enforceOwnership` 441-457 | **564-580** |
> | `enforceNameUniqueness` 459-474 | **582-596** |
> | blob-ref reset comment 612-618 | **780-786** |
> | hostile-bundle test `importApply.test.ts:215` | **:272** |
>
> Schema facts re-confirmed (`shared/schema/workflow.ts`): `workflows.slug` :113
> is `.unique()` and **nullable**; `publicLink` :106 **nullable**;
> `isPublic` :112 **NOT NULL** default false; `status` :120 **NOT NULL** default
> `'draft'`; `workflow_versions.published` :151 **NOT NULL** default false;
> `publishedAt` :152 **nullable**. So `isPublic`/`status`/`published` must be
> forced to a *value*, never to null.
>
> ### 🪤 The trap that will bite you
>
> `enforceOwnership` keys every field off `'x' in shape` and runs for **every
> entity in the graph**. Do **not** follow that pattern for the publication
> fields. `projects` also has a `status` column, and
> `projectStatusEnum` is `['active','archived']` — **there is no `'draft'`**
> (`shared/schema/workflow.ts:32`). A shape-keyed `if ('status' in shape)
> data['status'] = 'draft'` therefore writes an invalid enum value into every
> imported project and fails at insert.
>
> **Gate the publication reset on `desc.name`** (`'workflows'` /
> `'workflow_versions'`), not on shape membership. `workflow_blueprints` also has
> an `isPublic`, but it is explicitly not exported
> (`entityGraph.ts:292`), so it is not a concern.
>
> **AC 6 says "the existing 45 portability tests" — the baseline is now 51**
> across 7 files, plus 7 in `tests/integration/portability.import.test.ts`.

**Priority: P0** · Size: M · Files: `server/services/portability/ImportService.ts`, `server/services/portability/entityGraph.ts`

### Finding

Three defects in one code path — bundled per the file-locality rule, because
they are all "publication state the importer must not inherit" and all fixed in
`enforceOwnership`/`enforceNameUniqueness`.

**(a) `workflows.slug` makes same-system import impossible.** The schema
declares it globally unique:

```ts
slug: text("slug").unique(), // DATA INTEGRITY FIX
```
— `shared/schema/workflow.ts:113`

`slug` is exported (`entityGraph.ts:55`) and `enforceNameUniqueness`
(`ImportService.ts:459-474`) de-duplicates project title, workflow title,
DataVault table slug and step alias — but **not** `workflows.slug`.

**Reproduced 2026-07-29:**

```
PROBE 1 error: Failed query: insert into "workflows" (... "slug" ...)
params: ..., probe-slug-1785329792470, ...
```

The insert violates the unique index because the source workflow still holds
that slug. Export-then-import into the same system is the primary use case
(clone, back up, hand to a colleague on the same instance) and it fails outright
for any workflow with a slug.

**(b) Import silently publishes the workflow and duplicates the live public
link.** `isPublic`, `publicLink` and `status` are all exported and imported
verbatim (`entityGraph.ts:55`). `publicLink` has **no** unique constraint, so it
does not even fail — it silently duplicates.

**Reproduced 2026-07-29:**

```
PROBE 2 imported: { isPublic: true,
                    publicLink: 'probe-link-1785329792712',
                    status: 'active',
                    samePublicLink: true }
```

The importing user now has a **publicly reachable** workflow they never chose to
publish, answering on the *same* public link as the source. Two workflows in two
different tenants now serve the same URL. This is a live data-exposure path, and
it is worse across clients: hand a bundle to a different client per D-2 and they
silently stand up a public copy of your intake form.

**(c) Versions arrive pre-published, bypassing the publish gate.**
`workflow_versions.published` and `publishedAt` are exported and imported
verbatim (`entityGraph.ts:136`). The publish gate hardened in the RUN2
initiative is never consulted — an imported workflow can be `published: true`
without ever passing validation on this system. (Not independently reproduced:
probe 3 died earlier on IEX2-1's date bug, which is why IEX2-1 must land first.)

### Preferred fix

Treat publication state exactly like ownership: **stamped by the server, never
inherited from the bundle.** In `enforceOwnership` (`ImportService.ts:441-457`),
which already unconditionally overwrites `tenantId`/`ownerType`/`ownerUuid`/etc.,
add the same unconditional reset:

| Entity.column | Forced value on import | Why |
|---|---|---|
| `workflows.isPublic` | `false` | publishing is a deliberate act on the importing system |
| `workflows.publicLink` | `null` | never share a live link between two rows |
| `workflows.slug` | `null` | globally unique; a fresh slug is the user's to choose |
| `workflows.status` | `'draft'` | an imported workflow is not live until reviewed |
| `workflow_versions.published` | `false` | must pass this system's publish gate |
| `workflow_versions.publishedAt` | `null` | consistent with the above |

Nulling `slug` is preferred over suffixing it: a slug is user-facing URL text,
and `my-form-2` invented by an importer is worse than absent. Confirm
`workflows.slug` and `publicLink` are nullable in `shared/schema/workflow.ts`
before relying on this (they are — neither carries `.notNull()`).

Follow the existing pattern precisely: a table of forced fields applied
unconditionally in one place, so there is no per-entity branching to forget.
Comment it the way the blob-ref reset at `ImportService.ts:612-618` is
commented — say *why*, not *what*.

### Ties

- **Third in the ImportService chain. Dispatch after IEX2-2 is committed.**
- **Blocked by IEX2-1** — AC 3 below cannot run until timestamps import.
- Also edits `entityGraph.ts` if you choose to annotate the descriptors —
  conflicts with **IEX2-6** and **IEX2-14**, which also edit that file. Sequence
  them; do not run in parallel.
- Related prior art: the hostile-bundle test at `importApply.test.ts:215`
  ("rejects hostile bundle smuggling foreign tenantId and ownerUuid") is the
  model for your tests — same shape, new fields.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. A test sets a `slug` on a workflow, exports it, imports it **into the same
   system**, and asserts the import succeeds and the imported workflow's `slug`
   is `null` (and the source's is untouched).
2. A test asserts importing the same bundle **twice** in a row succeeds both
   times.
3. A test sets `isPublic: true`, `publicLink: <value>`, `status: 'active'`,
   exports, imports, and asserts the imported workflow has `isPublic === false`,
   `publicLink === null`, `status === 'draft'`, and that the **source** row is
   unchanged.
4. A test creates a `workflow_versions` row with `published: true` and a
   non-null `publishedAt`, imports, and asserts the imported version has
   `published === false` and `publishedAt === null`.
5. A test asserts the forced reset is unconditional — i.e. a hostile bundle
   hand-edited to claim `isPublic: true` still imports as `false`.
6. The existing 45 portability tests still pass unmodified.
7. Gates as in IEX2-1.

---

## IEX2-4 — A failed import leaves orphaned blobs in storage and burns the tenant's quota ✅

> **VERIFIED at review 2026-07-29** — commit `d8554d47`, worked in
> `.claude/worktrees/iex2-4`, rebased onto `main` and fast-forwarded in.
>
> The wrap covers the two pre-transaction passes as well as the transaction,
> which is more than the ticket asked for and correct: blobs are written before
> `allocateIds` and `resolveProjectIdOverride`, so a failure there leaks just as
> readily. The original error is rethrown unchanged, so the 400/500
> classification still keys off the real message. Pass 1 was extracted into
> `allocateIds()` to stay under the complexity and block-depth limits rather
> than suppressing either rule.
>
> **AC 5 answered and independently re-verified: `saveFile` does NOT
> deduplicate**, so this cleanup cannot delete an object another import relies
> on. Both providers mint a fresh `nanoid(16)` ref per call and neither is
> content-addressed; `restoreBlobs` dedupes by sha256 only through a `written`
> map local to a single call, so every value in `blobMap` was written by that
> call alone. The turn-in reached the right conclusion through wrong reasoning
> — it described `S3StorageProvider` as building keys from the content hash,
> which it does not. Worth re-checking if either provider ever becomes
> content-addressed, because that would make this cleanup unsafe.
>
> **Two review corrections:**
> - AC 4 requires a cleanup failure to be *logged*, and nothing asserted it. A
>   silent cleanup failure is the precise hazard — the blob stays and no record
>   of it exists — so the test now asserts `logger.warn` fires with the leaked
>   `fileRef`.
> - **The turn-in never fast-forwarded**, despite the instruction in its
>   dispatch block. Its reported "53 passed" was the pre-IEX2-3 baseline of 51,
>   not the 56 it should have measured against. Rebased onto `main` — which
>   merged with no conflicts, since the two tickets touch different regions of
>   `ImportService.ts` — and re-run.
>
> **Mutation-verified:** removing the `deleteFile` call fails the AC 1/2 and
> AC 4 tests; AC 3 (blobs survive a successful import) correctly still passes.
>
> Reviewer-run gates: `tsc` 0 errors · `eslint` 0 problems · portability
> `unit-db` **58 passed / 7 files** (56 baseline) · `test:fast` **149 files,
> 2016 tests**.
>
> **🎉 Phase A is COMPLETE.** All four P0s are fixed: a realistic bundle now
> exports and imports.

**Priority: P0** · Size: M · Files: `server/services/portability/ImportService.ts`

### Finding

`apply` restores blobs to storage **before** opening the transaction, by design
(`ImportService.ts:687-689`):

```ts
// Blob restore runs before the transaction: every quota/integrity/scan
// gate must reject the import before any row is created.
const blobMap = await this.restoreBlobs(reader, targetOwner.tenantId, warnings);
```

`restoreBlobs` writes each verified blob with
`storageProvider.saveFile(...)` (`ImportService.ts:578`). The transaction then
opens at `ImportService.ts:710`. If **anything** inside it throws — an FK
violation, a unique violation (guaranteed today by IEX2-3(a)), a Zod failure
(guaranteed today by IEX2-1), a connection drop — Postgres rolls the rows back
and **the blobs stay in storage forever**. Nothing in the `finally`
(`ImportService.ts:738-745`) deletes them; it only removes the temp `.ezb`.

Consequences:

- Storage fills with unreferenced objects that no row points at, so no cleanup
  job can find them by reference.
- `StorageQuotaService.checkQuota` (`server/services/StorageQuotaService.ts:14`)
  is check-only — it does not reserve. Repeated failed imports of a
  template-heavy bundle walk the tenant toward their quota ceiling with nothing
  to show for it, and the user cannot delete what they cannot see.
- This is not a rare path. Given IEX2-1 and IEX2-3, **failure is currently the
  normal outcome** for realistic bundles.

The ordering itself is right and should be kept — scanning before writing rows
is correct. What is missing is the compensating action.

### Preferred fix

Make the blob write compensatable. Collect the storage refs `restoreBlobs`
actually created (it already builds `written`, `ImportService.ts:572-582`), and
on **any** failure after that point delete them before rethrowing:

- Wrap the transaction so a throw triggers deletion of every ref this call
  wrote, then rethrows the original error unchanged (the error message drives
  the 400/500 classification — do not swallow or rewrap it).
- Delete **only** refs this call created. `saveFile` may deduplicate to an
  existing object; deleting a ref another row already points at would be a far
  worse bug than the leak. If `storageProvider.saveFile` can return a pre-existing
  ref, detect that and skip those — and say so in your report.
- Best-effort deletion: a failure to clean up must be logged
  (`logger.warn`) and must not mask the original error.

Check `server/services/storage/` for the provider's delete method and whether
`saveFile` is content-addressed before designing this. If deduplication makes
safe deletion genuinely impossible, **stop and report that** — it changes the
fix to a reference-counted sweep and is a bigger ticket.

### Ties

- **Fourth in the ImportService chain. Dispatch after IEX2-3 is committed.**
- Strongly related to IEX2-1/IEX2-3: with those unfixed you can trigger this
  trivially, which is how to write the test.
- Existing test to extend: `importApply.test.ts:353` "rolls back on forced
  failure mid-import (AC 6)" already forces a mid-import failure — reuse its
  mechanism and add the storage assertion it is missing.
- `tests/unit/portability/importBlobs.test.ts` has the blob fixtures.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. A test imports a bundle containing at least one blob, forces the transaction
   to fail mid-import, and asserts **every** blob written by that call is gone
   from storage afterwards.
2. That test also asserts the original error is propagated unchanged (same
   message), not replaced by a cleanup error.
3. A test asserts a **successful** import leaves its blobs in place (no
   over-eager deletion).
4. A test asserts that when cleanup itself fails, the original import error is
   still what surfaces, and a warning is logged.
5. If `saveFile` deduplicates onto pre-existing objects, a test asserts a shared
   object is **not** deleted by a failed import. If it does not deduplicate,
   state that explicitly in your report with the evidence.
6. Gates as in IEX2-1.

---

# Phase B — P1: trust, failure handling, scale

## IEX2-5 — The import audit record reports numbers supplied by the bundle ✅

> **Dispatched 2026-07-30** — worktree `.claude/worktrees/iex2-5`, base
> `91ceec55`. Head of the ImportService chain now that Phase A is complete;
> IEX2-6 and IEX2-7 queue behind it.
>
> ⚠️ **`BUNDLE_REJECTION_SIGNALS` collision.** This ticket appends a signal to
> `portability.routes.ts:81-95`, and so does **IEX2-12**, dispatched in parallel.
> Same array, adjacent lines — whichever lands second must
> `git merge main --ff-only` and re-run gates. Nothing else in the two tickets
> overlaps.
>
> **Baselines:** portability `unit-db` **58 passed / 7 files**; `test:fast`
> **149 files / 2016 tests**.

> **✅ Verified at review 2026-07-30 — committed `330ba5da`.** Gates re-run by
> the reviewer, not taken on report: type-check 0, lint 0, `test:fast`
> 149/2016 (baseline), portability `unit-db` 58/7 (baseline), portability
> integration 9 (7 baseline + 2 new).
>
> **Reviewer fix — the delivered rootId check leaked committed rows.** The
> `newRootId === ''` throw was placed *after* `db.transaction()` returned, so a
> rejected bundle committed Pass 2 and then answered 400: orphaned rows in the
> tenant with no rootId able to reach them, strictly worse than the empty-rootId
> 201 the ticket set out to fix. The dev's AC 3 test asserted only the status
> code and message, so it passed over the defect. Reviewer moved the throw
> inside the transaction and added a row-count assertion, which reproduces it
> (`expected 12 to be 11`) before the fix.

**Priority: P1 (audit integrity)** · Size: S · Files: `server/services/portability/ImportService.ts`, `server/routes/portability.routes.ts`

### Finding

`apply` returns the manifest's own claim about what it contained
(`ImportService.ts:730-737`):

```ts
return {
  rootId: newRootId,
  scope: manifest.scope,
  tenantId: targetOwner.tenantId,
  entityCounts: manifest.entityCounts,   // <- from the uploaded file
  ...
```

and the route writes that straight into the audit log
(`portability.routes.ts:285-294`), which is described in its own comment as
*"The record answering 'who pushed data into this tenant, and what did it
create'"*. It answers no such thing: `entityCounts` is an attacker-controlled
field of an uploaded file. The checksum does not help — the uploader computes it.
A bundle can declare `{"steps": 1}` while inserting 5 000 rows, and the
compliance record will say 1.

The same value is echoed to the client in the 201 response
(`portability.routes.ts:299`).

Second, smaller defect in the same method: `newRootId` starts as `''`
(`ImportService.ts:676`) and is only assigned when a row's id appears in
`manifest.rootIds` (`ImportService.ts:642-645`). A bundle whose `rootIds` match
nothing still returns **201** with `rootId: ""`, and the caller has no way to
find what was created.

### Preferred fix

Count what was actually inserted. `processEntityInsertion` already iterates every
row — return the count per entity and accumulate it in `apply`. Report the
observed counts in `ImportApplyResult.entityCounts`; keep `manifest.scope` (it is
descriptive, not a claim about the write).

For `rootId`: if no root row was resolved after Pass 2, throw with a message that
classifies to **400** (add the signal to `BUNDLE_REJECTION_SIGNALS`,
`portability.routes.ts:81-95`) — a bundle whose declared roots are absent is
malformed input, and returning 201 for it is wrong.

### Ties

- **Fifth in the ImportService chain. Dispatch after IEX2-4 is committed.**
- Also edits `portability.routes.ts` (`BUNDLE_REJECTION_SIGNALS` + nothing else).
- Load `add-api-endpoint` (error-string → status contract) and `run-tests`.

### Acceptance criteria

1. A test hand-edits a bundle's `manifest.entityCounts` to a wrong value,
   recomputes the checksum (`tests/helpers/bundleTestHelper.ts` `recomputeChecksum`),
   imports it, and asserts the returned/audited counts reflect **actual** rows
   inserted, not the manifest's claim.
2. A test asserts the audit row written by `POST /api/portability/import/apply`
   carries the observed counts.
3. A test asserts a bundle whose `rootIds` match no row in the bundle is
   rejected with 400 and does **not** return 201 with an empty `rootId`.
4. Existing tests still green.
5. Gates as in IEX2-1.

---

## IEX2-6 — Bundles leak the source system's user/team UUIDs and role assignments, and import drops them via a fragile heuristic 🔄

**Priority: P1 (information disclosure)** · Size: M · Files: `server/services/portability/entityGraph.ts`, `server/services/portability/ImportService.ts`

> **Refs re-verified 2026-07-30 against `54b1fcc7`.** Every finding below still
> reproduces verbatim. `entityGraph.ts` line numbers are unchanged; all
> `ImportService.ts` line numbers were refreshed (Phase A + IEX2-5 shifted them
> 15–125 lines). Dispatched with IEX2-7 into worktree
> `.claude/worktrees/iex2-6-7` — **do IEX2-6 first and completely, then IEX2-7.**

### Finding

Four access-control entities are fully exported, principal ids and all:

- `project_access` — `["id","projectId","principalType","principalId","role"]` (`entityGraph.ts:47`)
- `workflow_access` — same shape (`entityGraph.ts:64`)
- `datavault_database_access` (`entityGraph.ts:224`)
- `datavault_table_access` (`entityGraph.ts:232`)

Plus user-identifying columns on ordinary entities: `projects.creatorId`,
`createdBy`, `ownerId`, `ownerUuid` (`entityGraph.ts:23`); `workflows.creatorId`,
`ownerId` (`entityGraph.ts:55`); `workflow_versions.createdBy`
(`entityGraph.ts:136`); `templates.lastModifiedBy` (`entityGraph.ts:145`);
`datavault_rows.createdBy`/`updatedBy` (`entityGraph.ts:207`).

Decision D-2 makes this a disclosure, not a curiosity: *"A bundle can be handed
to a different client, who imports it and gets a working copy."* That bundle
tells the recipient exactly which internal user and team UUIDs exist on the
source system and who holds which role on what. `EXCLUDED_TABLES`
(`entityGraph.ts:263-345`) is careful to exclude `users`, `organizations`,
`organization_memberships`, `teams`, `team_members` — and then the access tables
re-export their primary keys anyway.

On the import side, all four are dropped — but by a **field-name heuristic**
(`ImportService.ts:191-193`):

```ts
private shouldSkipEntity(desc: EntityDescriptor): boolean {
  return desc.fields.includes('role') || desc.fields.includes('tenantRole');
}
```

Two problems. First, "which entities are importable" is a security decision and
is currently expressed as a string match on a column name — rename `role` to
`accessLevel` in any of those four descriptors and privilege rows start
importing, with no test failing. Second, we pay the cost of exporting rows that
are guaranteed to be discarded.

### Preferred fix

Two changes:

1. **Make importability explicit.** Add an `importable?: boolean` (default true)
   to `EntityDescriptor` (`entityGraph.ts:4-15`) and set `importable: false` on
   the four `*_access` descriptors. Replace the body of `shouldSkipEntity` with a
   read of that flag. Keep the method — its call sites
   (`ImportService.ts:380, 390, 624, 866, 922`) are fine.
2. **Stop exporting principal identifiers.** Drop the four `*_access`
   descriptors from `scopes` for export, *or* keep the row and drop
   `principalId`/`principalType` from `fields`. Recommend the former: a
   permission row with no principal has no meaning. Whichever you choose, the
   `schemaCoverage.test.ts` classification must be updated so the table is
   accounted for (moved to `EXCLUDED_TABLES` with a reason string, in the style
   of the existing entries).

For the user-id columns on ordinary entities, **do not remove them in this
ticket** — `enforceOwnership` (`ImportService.ts:565-597`) already overwrites
every one of them on import, so they are import-safe; only the export-side
disclosure remains. Raise it in your report and it will be triaged (backlog B-1).

### Ties

- **Sixth in the ImportService chain. Dispatch after IEX2-5 is committed.**
- **Also edits `entityGraph.ts` — conflicts with IEX2-3 and IEX2-14.** Sequence
  after IEX2-3; IEX2-14 must come after this.
- `tests/unit/portability/schemaCoverage.test.ts` **will fail** when you change
  the classification — that is the test doing its job. Update it deliberately,
  with a reason string, and say so in your report.
- Existing test to preserve: `importApply.test.ts:490` "silently drops role
  assignments to prevent privilege escalation (AC 5)" must still pass.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. `EntityDescriptor` carries an explicit importability flag and
   `shouldSkipEntity` reads it; no string match on `'role'`/`'tenantRole'`
   remains in `ImportService.ts`.
2. A test asserts that renaming a `role` field no longer changes importability —
   e.g. a descriptor with `importable: false` and no `role` field is still
   skipped, and one with a `role` field and `importable: true` is **not**.
3. A test asserts an exported bundle contains **no** `principalId` values from
   the source system (assert on the bundle bytes/JSONL, not on the DB).
4. `schemaCoverage.test.ts` passes with the four access tables reclassified and
   each carrying a human-readable reason.
5. `importApply.test.ts:330` still passes unmodified.
6. The export-side leak of `creatorId`/`createdBy`/`ownerId` on ordinary
   entities is **reported, not fixed** here.
7. Gates as in IEX2-1.

---

## IEX2-7 — Preview reports collisions that are not collisions 🔄

**Priority: P1** · Size: S · Files: `server/services/portability/ImportService.ts`

> **Refs re-verified 2026-07-30 against `54b1fcc7`.** Both defects still
> reproduce verbatim: preview still reads `projects.name` while apply enforces
> on `projects.title`, and the alias check still joins out to the tenant. All
> `ImportService.ts` line numbers below were refreshed. Dispatched with IEX2-6
> into worktree `.claude/worktrees/iex2-6-7` — **work this only after IEX2-6 is
> finished and its gates are green.**

### Finding

`checkCollisions` (`ImportService.ts:130-188`) is what the user reads before
deciding whether to apply a bundle. Two of its four checks are wrong.

**(a) Step aliases are checked tenant-wide; they are unique per workflow.** The
schema:

```ts
uniqueIndex("steps_workflow_alias_unique")
```
— `shared/schema/workflow.ts:287`, on `(workflowId, alias)`.

But the preview query joins all the way out to the tenant
(`ImportService.ts:172-186`) and flags any alias used anywhere in it. Aliases are
short, human-chosen names (`email`, `full_name`, `address`) — in a tenant with a
handful of workflows, essentially **every** alias in an incoming bundle will be
reported as a collision. The user is shown a wall of red for an import that
would apply cleanly (the import creates a fresh workflow, so no alias in it can
collide). The predictable outcome is that users learn to ignore the collision
list, which defeats the point of preview.

**(b) The project check reads a different column than the enforcement does.**
Preview compares `projects.name` (`ImportService.ts:135-142`); the actual
uniqueness enforcement at apply time, `ensureUniqueProjectTitle`
(`ImportService.ts:484-501`), compares `projects.title` scoped to
`(ownerType, ownerUuid)`. So preview can report a collision that apply will not
act on, and miss one it will.

### Preferred fix

**(a)** Drop the tenant-wide alias check. Alias uniqueness is per workflow, and
an import always creates a new workflow, so the only alias collision that can
occur is *within the bundle itself* — two steps in one imported workflow sharing
an alias. Check for that instead (it is a cheap in-memory check over the rows
already streamed in `processEntityStream`, `ImportService.ts:305-311`), and only
report those.

**(b)** Make preview query the same columns and the same scope that
`ensureUniqueProjectTitle`/`ensureUniqueWorkflowTitle` use at apply time —
`title`, scoped by `(ownerType, ownerUuid)`. Preview must predict what apply
will do; anything else is noise. Note that preview may run without a
`targetProjectId` (`ImportService.ts:394-396`), so resolve the same owner context
apply would, or state clearly in the preview response that the scope is the
caller's default.

### Ties

- **Seventh in the ImportService chain. Dispatch after IEX2-6 is committed.**
- Existing test `importPreview.test.ts:202` "detects name/slug/alias collisions"
  encodes the current wrong behaviour — it **must be updated**, and you must call
  that out explicitly in your report rather than deleting it quietly.
- DataVault table slugs (`ImportService.ts:147-157`) are genuinely tenant-scoped
  and that check is **correct** — leave it alone.
- Load `run-tests`.

### Acceptance criteria

1. A test asserts that importing a bundle whose step aliases already exist on a
   **different workflow** in the same tenant reports **no** alias collision.
2. A test asserts two steps sharing an alias **within one bundle** are reported.
3. A test asserts the project collision check agrees with what apply actually
   does: a bundle that will be suffixed by `ensureUniqueProjectTitle` is reported
   as colliding, and one that will not is not.
4. `importPreview.test.ts:202` is updated, and the report explains what changed
   and why.
5. The DataVault table-slug check is unchanged and still tested.
6. Gates as in IEX2-1.

---

## IEX2-8 — No version or schema-drift guard: the compatibility fields are placeholders 🔲

**Priority: P1** · Size: M · Files: `server/services/portability/ExportService.ts`, `server/services/portability/ImportService.ts`

### Finding

Every bundle this system has ever produced carries the same two lies
(`ExportService.ts:65-76`):

```ts
const manifest: BundleManifest = {
  formatVersion: 1,
  appVersion: '1.0.0',
  migrationHead: null,
  ...
```

`appVersion` is a hardcoded string. `migrationHead` — the field whose entire
purpose is "which schema was this taken from" — is hardcoded `null`. Nothing on
the import side reads either one: `BundleReader.open` checks only `formatVersion`
(`bundleReader.ts:28-30`), and `ImportService` never looks at them at all.

`formatVersion: 1` is also a literal rather than the exported `FORMAT_VERSION`
constant (`bundleFormat.ts:3`), so bumping the constant will silently not bump
what exporters stamp.

The consequence is the entire class of "things go wrong" this feature exists to
survive. A bundle taken from an older deployment and imported after a migration
lands hits whatever changed with no guard: a dropped column, a renamed column, a
new NOT NULL, a removed `pgEnum` value. The user sees a raw Postgres error
(`invalid input value for enum step_type: "…"`) or a raw Zod dump, classified as
a **500** because it matches nothing in `BUNDLE_REJECTION_SIGNALS`
(`portability.routes.ts:81-95`). With 38 step types and 103 tables under active
development, this is a matter of when.

### Preferred fix

1. Stamp real values at export: `formatVersion: FORMAT_VERSION` (the constant),
   a real `appVersion` (read `package.json` `version` — do not invent a new
   source of truth), and a real `migrationHead` (the latest applied migration —
   check what `migrations/` and the Drizzle journal expose; **if there is no
   cheap way to read it, report that rather than inventing one**).
2. Check them at import, in `ImportService.preview`/`apply`, and surface the
   result in `ImportPreview` so the user sees it *before* applying:
   - `migrationHead` unknown to this system, or newer than this system's head →
     reject with a clear, actionable message ("this bundle was created on a newer
     version of ezBuildr").
   - `migrationHead` older → **allow**, with a warning on the preview. Older
     bundles are the normal case and must keep working; this is a warning, not a
     gate.
3. Add the rejection message to `BUNDLE_REJECTION_SIGNALS` so it is a 400.

Do not add a schema-diffing engine. The goal is an honest, actionable message
instead of a raw driver error.

### Ties

- Edits `ExportService.ts` and `ImportService.ts`. **Conflicts with the
  ImportService chain (IEX2-1..7) — sequence after IEX2-7 is committed.**
- `bundleFormat.ts:51-79` `manifestSchema` already types both fields; no format
  change is needed, only real values.
- Round-1 backlog notes `migrationHead` was left null deliberately at Phase 0.
  This ticket is the follow-through, not a reversal.
- Load `db-schema-change` **for reading only** — to find where the applied
  migration head lives. **This ticket must not add a migration**; if you conclude
  one is needed, stop and report.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. An exported bundle's manifest carries a real `appVersion` matching
   `package.json`, and `formatVersion` equal to the `FORMAT_VERSION` constant
   (asserted by a test that would fail if the literal were reintroduced).
2. `migrationHead` is a real value, or the report states with evidence why it
   cannot be and what was stamped instead.
3. A test asserts a bundle claiming a **newer** `migrationHead` is rejected, with
   a message naming the version problem, returning **400** from the route.
4. A test asserts a bundle with an **older** `migrationHead` still imports
   successfully and produces a warning in the preview.
5. A test asserts an unknown/absent `migrationHead` (every bundle produced before
   this ticket) still imports — backward compatibility is mandatory.
6. Gates as in IEX2-1.

---

## IEX2-9 — A disk error during export crashes the server process ✅

> **✅ VERIFIED AND COMMITTED 2026-07-30 — `984e1374`.** Gates re-run by the
> reviewer, not taken on report: `tsc` 0 errors, ESLint clean on all three
> files, `test:fast` **152 files / 2045 tests**, portability `unit-db`
> **59 passed / 7 files**. Test routing correct — `bundleWriter.test.ts` was
> properly kept OUT of `dbUnitTests`.
>
> **All four criteria mutation-verified** (the first turn-in in this round to
> survive mutation cleanly):
>
> | Mutation | Result |
> |---|---|
> | whole of `bundleWriter.ts` reverted to HEAD | all 3 tests fail |
> | `writeEntityRow` entry guard deleted | AC 1 fails (5s timeout) |
> | `writeEntityRow` entry guard deleted | AC 2 **still passes** — so its rejection comes from the non-backpressure `else` branch, which is the path the criterion names |
> | `onDrain`'s `removeListener` deleted | AC 3 fails, `expected 51 to be 1` |
> | `state.writer.cleanup()` deleted | AC 4 fails, `expected true to be false` |
>
> **New baselines for the rest of the round: `test:fast` 152 files / 2045
> tests; portability `unit-db` 59 passed / 7 files.** IEX2-11 is next in the
> ExportService chain and should measure against these.
>
> Reviewer note on the delivered fix: the `else`-branch `firstError` check is
> reachable only when an error is recorded between two writes (the entry guard
> covers the rest), and the `as Error | null` cast at the end of the `pack()`
> loop is redundant — `firstError` is already that type. Neither is worth a
> send-back; both are noted in case IEX2-11 refactors this method.

> **RE-DISPATCHED 2026-07-30** — the first dispatch produced nothing; its
> worktree sat at a stale base with a clean tree and was torn down. Fresh
> worktree `.claude/worktrees/iex2-9`, base **`eca89efe`**, verified by
> `scripts/new-worktree.ps1` (junction, `@types`, base matches main, suite
> runs). Touches `bundleWriter.ts` only; nothing else is in flight against it.
> First in the ExportService chain: IEX2-9 → 11 → 8 → 17.
>
> ⚠️ **Test routing here is the opposite of IEX2-1..4.** Those said to add new
> portability tests to `dbUnitTests` in `vitest.config.ts:10`. **Do not do that
> for a `bundleWriter` test.** `BundleWriter` needs no database — it writes
> JSONL to a temp dir — so a new `tests/unit/portability/bundleWriter.test.ts`
> belongs in **unit-fast**, left out of `dbUnitTests`, exactly like the existing
> `bundleFormat.test.ts`, `entityGraph.test.ts`, `schemaCoverage.test.ts` and
> `secretScanner.test.ts`.
>
> AC 4 is the exception: it asserts `ExportService` cleanup, and `ExportService`
> does query, so that one belongs in the existing
> `tests/unit/portability/exportService.test.ts`, which **is** routed to
> `unit-db`.
>
> **Baselines re-measured 2026-07-30 (the earlier 149/2016 and 56/7 are
> stale):** `test:fast` **151 files / 2042 tests**; portability `unit-db`
> **58 passed / 7 files**. A test added to `dbUnitTests` does not run under
> `test:fast` — report both numbers.

**Priority: P1** · Size: S · Files: `server/services/portability/bundleWriter.ts`

### Finding

`BundleWriter.writeEntityRow` (`bundleWriter.ts:29-47`):

```ts
return new Promise<void>((resolve, reject) => {
  if (!currentStream.write(line)) {
    currentStream.once('drain', resolve);
    currentStream.once('error', reject);
  } else {
    resolve();
  }
});
```

The `error` listener is attached **only** inside the backpressure branch. On the
common path (`write()` returns true) the promise resolves with no error handler
attached to the stream. A `fs.WriteStream` that emits `'error'` with no listener
raises an uncaught exception — in Node that terminates the process.

The realistic trigger is exactly the scenario this ticket file is about: a large
export filling `os.tmpdir()` (ENOSPC), a permissions change, or the temp
directory being reaped mid-export. The failure mode is not "the export fails" —
it is "the API server dies", taking every other in-flight request with it.

Two lesser defects in the same method:

- On the backpressure path, whichever of `drain`/`error` does not fire stays
  attached. Over a large export that is one leaked listener per backpressured
  write, and a `MaxListenersExceededWarning` once it passes 10.
- Nothing awaits the stream reaching disk except `pack()` (`bundleWriter.ts:93-96`),
  which is correct, but errors surfacing between `writeEntityRow` and `pack` have
  no owner.

`cleanup()` does attach `stream.on('error', () => {})` (`bundleWriter.ts:74`) —
but only at cleanup, long after the window that matters.

### Preferred fix

Attach a single `'error'` handler to each stream **when it is created**
(`bundleWriter.ts:30-35`), and record the first error on the writer instance.
Have `writeEntityRow` and `pack()` check that recorded error and reject/throw
with it, so a disk failure becomes a failed export with a real message rather
than a dead process. On the backpressure path, remove the listener that did not
fire (`removeListener`, or `once` + explicit cleanup in both branches).

`ExportService.exportToFile` (`ExportService.ts:56-102`) already has a
`success`/`finally` structure that removes the temp file on failure — a thrown
error from `writeEntityRow` will flow through it correctly, so no change is
needed there.

### Ties

- Touches `bundleWriter.ts` only. **Safe to run in parallel with the
  ImportService chain (IEX2-1..7).**
- Load `run-tests`.

### Acceptance criteria

1. A test simulates a write-stream `'error'` during `writeEntityRow` (mock/stub
   the stream or point the writer at an unwritable path) and asserts the export
   **rejects with that error** and the process does not raise an uncaught
   exception.
2. A test asserts the error surfaces even when it is emitted on the non-backpressure
   path (`write()` returned true).
3. A test asserts no listener accumulation: writing many rows through the
   backpressure path does not leave more than a constant number of `drain`/`error`
   listeners attached.
4. A test asserts the temp spool directory is still removed after a failed
   export (`ExportService.ts:93-102` behaviour preserved).
5. Gates as in IEX2-1.

---

## IEX2-10 — The bundle is buffered whole, several times over; declared limits are far above what the process survives 🔲

**Priority: P1** · Size: L — **see escalation D-7 below before dispatching** · Files: `server/routes/portability.routes.ts`, `server/services/portability/ImportService.ts`, `server/services/portability/bundleReader.ts`, `server/services/portability/bundleWriter.ts`

### Finding

The format was designed to stream — JSONL entity files, content-addressed blobs,
a spool directory in `BundleWriter`. Every one of those wins is given back:

**Import path, per request:**

1. multer writes the upload to disk (`portability.routes.ts:30-38`) — correct.
2. The route reads the entire file back into a Buffer:
   `const buffer = await fs.promises.readFile(filePath)` (`portability.routes.ts:235` and `:280`).
3. `ImportService.preview`/`apply` take that `Buffer` and **write it back out to a
   second temp file** (`ImportService.ts:241-242`, `673-674`).
4. `BundleReader` opens that file with adm-zip, which reads the archive into
   memory, and `entry.getData()` (`bundleReader.ts:25, 81, 90, 111, 130, 138`)
   decompresses each entry into a fresh Buffer.
5. `validateChecksum` (`bundleReader.ts:72-103`) calls `getData()` on **every**
   entity and blob entry to hash them — so the whole uncompressed bundle passes
   through memory before a single row is read.
6. `restoreBlobs` then calls `reader.readBlob` (`ImportService.ts:551`),
   decompressing each blob into memory **again**, and holds every verified blob
   in a `Map<string, Buffer>` (`ImportService.ts:547, 568`) until all of them have
   been scanned — peak memory is the sum of all blobs.

**Export path:** `BundleWriter.pack` carefully spools to disk, then calls
`this.zip.writeZip(this.outPath)` (`bundleWriter.ts:134`) — adm-zip constructs
the entire archive in memory to write it.

Now compare the declared limits (`bundleFormat.ts:4-7`):

```ts
export const MAX_SINGLE_ENTRY_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024;   // 2GB
```

with the upload cap of 250 MB **compressed** (`portability.routes.ts:26-28`).
A bundle inside every declared limit will exhaust the heap long before it is
rejected. And because `strictLimiter` is per-IP over a 15-minute window
(`server/middleware/rateLimiter.ts:54-62`), a handful of concurrent large imports
is an availability problem for the whole server, not just for the importer.

Round-1 backlog **IEX-B8** identified the read-side half of this and deferred it
to Phase 3. It should not wait: the limits as written are an invitation.

### Preferred fix

**Do the cheap, high-value parts now and defer the library swap** (see D-7):

1. **Stop the double-buffer.** Change `ImportService.preview`/`apply` to accept a
   **file path** instead of a `Buffer`, and have the routes pass
   `req.file.path` directly (`portability.routes.ts:235`, `:280`). This removes a
   full-bundle heap allocation and a full-bundle disk write per request, and it
   is a small, contained change. Keep a Buffer-accepting overload only if the
   tests need it — and prefer updating the tests.
2. **Bound blob memory.** In `restoreBlobs`, do not hold every verified blob in
   memory at once (`ImportService.ts:547-582`). Verify + scan + write one blob at
   a time, tracking written refs so IEX2-4's cleanup can still undo them. The
   "all gates before any write" property must be preserved for *rejection* —
   restructure as scan-all-then-write-all using the spool directory, not the heap.
3. **Make the declared limits honest.** Lower `MAX_SINGLE_ENTRY_SIZE` and
   `MAX_TOTAL_SIZE` (`bundleFormat.ts:5-6`) to values this process actually
   survives, and make them env-overridable in the style of
   `PORTABILITY_MAX_UPLOAD_BYTES` (`portability.routes.ts:26`). Justify the
   numbers you pick with a measurement, not a guess.

Swapping adm-zip for a streaming reader (`yauzl`/`unzipper`) is **out of scope**
for this ticket — see D-7.

### Ties

- **Conflicts with the entire ImportService chain — dispatch last in Phase B**,
  after IEX2-8.
- Supersedes round-1 backlog **IEX-B8** (`IMPORT_EXPORT_TICKETS.md:2225`) for the
  parts listed above; B8's library swap survives as D-7.
- `tests/integration/portability.import.limits.test.ts` covers the current limit
  behaviour — expect to update it, and say what you changed.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. `ImportService.preview` and `apply` accept a path; neither the routes nor the
   service reads the whole bundle into a Buffer. Demonstrate with the diff.
2. A test asserts the second temp-file write (`ImportService.ts:241/673`) is gone
   — e.g. by asserting no new file appears in the temp dir during an import, or
   by asserting the service reads the path it was given.
3. A test or measurement shows peak RSS during import of a multi-blob bundle no
   longer scales with the *sum* of blob sizes. Paste the measurement.
4. `MAX_SINGLE_ENTRY_SIZE` and `MAX_TOTAL_SIZE` are lowered to justified,
   env-overridable values; the justification (a measurement) is in the report.
5. Bundles over the new limits are still rejected with **413/400**, not a crash;
   `portability.import.limits.test.ts` updated and green.
6. The "all gates pass before any blob is written" property is preserved and
   still asserted by `importBlobs.test.ts`.
7. Gates as in IEX2-1.

---

## IEX2-11 — Export loads every matching row into memory with no pagination 🔄

**Priority: P1** · Size: M · Files: `server/services/portability/ExportService.ts`

> **Refs re-verified 2026-07-30 against `cc7ef72e`.** The finding reproduces
> verbatim. Most refs were still accurate; four drifted and are corrected below
> (`processDescriptor` query block, the id accumulation, and both
> `portability.routes.ts` refs). IEX2-9 did not touch `ExportService.ts`, which
> is why the drift is small.
>
> ⚠️ **`entityCounts` is the trap in this ticket.**
> `ExportService.ts:222` sets `state.entityCounts[descriptor.name] =
> rows.length` from the single unbounded result. Once reads are batched,
> `rows.length` is one *batch*, and a naive port silently writes a manifest
> claiming the entity has `BATCH_SIZE` rows. That number is not cosmetic —
> **IEX2-5 hardened the import audit record specifically so it stops trusting
> bundle-supplied counts**, and `bundleFormat`'s manifest is round-tripped.
> Accumulate the total across batches, and assert the manifest count in a test.
>
> Two more things the batching must not break, both already in the code:
> `processBlobRefs` is awaited **per row** inside the loop (`ExportService.ts:207`),
> and `writeEntityRow` is awaited per row (`ExportService.ts:218`) — that is the
> backpressure path IEX2-9 just fixed. Do not batch the *writes* into an array;
> the point of the ticket is that peak memory stays at one chunk.
>
> Baselines are now **`test:fast` 152 files / 2045 tests; portability `unit-db`
> 59 passed / 7 files** (IEX2-9 raised them). Worktree `.claude/worktrees/iex2-9`
> is reused for this ticket — it already holds the committed IEX2-9 work.

### Finding

`processDescriptor` runs one unbounded query per entity and materialises all of
it (`ExportService.ts:194-224`):

```ts
const query = conditions.length > 0
  ? db.select(selection).from(descriptor.table).where(and(...conditions))
  : db.select(selection).from(descriptor.table);

const rows = await query;
```

There is no `limit`, no cursor, no batching. For `datavault_values`
(`entityGraph.ts:210-218`) — one row per cell — a single DataVault table with
50 000 rows and 20 columns is a million-row result set loaded into a JS array
before a byte is written. The `BundleWriter` streaming underneath is irrelevant
when the producer buffers everything first.

At single-object scope this is survivable for small tenants and fatal for large
ones; it is unconditionally fatal for the Phase 3 tenant-wide export the round-1
file has already scoped.

There is also no cap on how much an export may produce: no row-count ceiling, no
timeout. `strictLimiter` (`rateLimiter.ts:54-62`) bounds request *rate*, not the
cost of one request, and export is a synchronous request/response
(`portability.routes.ts:206-217` — three GET routes, workflow/project/database).

### Preferred fix

Batch the read. Iterate in chunks of a fixed size (keyset pagination on `id`
where available, `limit`/`offset` where not) and write each chunk through
`state.writer.writeEntityRow` before fetching the next, so peak memory is one
chunk rather than one table.

Mind two existing invariants:

- `state.extractedIds` (`ExportService.ts:200-220`) must still accumulate the
  **full** id set — child descriptors depend on it (`ExportService.ts:268-276`),
  and the topological-sort assertion at `ExportService.ts:270-272` must keep
  working. Ids are cheap; rows are not.
- `workflow_data_sources` has a composite PK and no `id` column
  (`entityGraph.ts:236-242`) — the existing code already special-cases the
  absence of `id` (`ExportService.ts:181-187`). Your pagination must not assume
  every table has one.

Also add a configurable ceiling on total exported rows that fails with a clear
message rather than running until the process dies, in the style of
`PORTABILITY_MAX_UPLOAD_BYTES` (`portability.routes.ts:27`).

### Ties

- Touches `ExportService.ts` only. **Safe to run in parallel with the
  ImportService chain (IEX2-1..7)**; conflicts with IEX2-8, which also edits this
  file — sequence them.
- Prerequisite for Phase 3 (tenant-wide export) in the round-1 file.
- Load `add-api-endpoint` and `run-tests`.

### Acceptance criteria

1. Reads are batched; no `await query` returns an unbounded result set in
   `processDescriptor`.
2. A test seeds a DataVault table with enough rows to span **at least three
   batches** (set the batch size low in the test rather than seeding huge data),
   exports it, and asserts every row is present in the bundle exactly once —
   proving no rows are dropped or duplicated at batch boundaries.
3. A test asserts `state.extractedIds` still contains the complete id set after
   batching, by asserting a child entity of a multi-batch parent exports
   completely.
4. A test asserts the `workflow_data_sources` composite-PK path still exports
   correctly.
5. A test asserts the row ceiling produces a clear, classified error rather than
   an unbounded run.
6. Existing export tests (`exportService.test.ts`, `exportBlobs.test.ts`) green
   and unmodified.
7. Gates as in IEX2-1.

---

## IEX2-17 — Exporting requires `edit`, not `view` 🔲

**Priority: P1** · Size: S · Files: `server/services/portability/ExportService.ts`

### Finding

Filed from **decision D-6, ruled by Shawn on 2026-07-29** (*"i can go with edit
permissions to export"*). The full analysis is in the D-6 section near the bottom
of this file — read it, it is this ticket's rationale and you should not
re-derive it.

All three export scopes gate on `'view'` (`ExportService.verifyAccessAndGetTenant`):

```ts
const canView = await aclService.hasProjectRole(userId, root.id, 'view');      // :125
const canView = await aclService.hasWorkflowRole(userId, root.id, 'view');     // :151
const canView = await datavaultAclService.hasDatabaseRole(userId, root.id, 'view'); // :163
```

Import already requires `edit` on the target project (`ImportService.ts:307`).
So today, taking a complete, offline, re-importable copy of an asset out of the
system is *easier* than putting one in. A read-only collaborator can produce a
`.ezb` you can never revoke by un-sharing.

Note both ACL services are hierarchical — `resolveRoleForTable`
(`DatavaultAclService.ts:170-191`) takes the highest of the database role and any
inherited project role — so this change correctly still lets a project **editor**
export a DataVault database inside that project. Do not flatten that behavior.

### Preferred fix

Change the three role strings from `'view'` to `'edit'`. Update the three error
messages if they read as view-specific, but keep the exact phrase **`Access
denied`** in each — `classifyRouteError` maps that substring to 403, and
`portability.routes.ts` depends on it. This is the one detail that will silently
turn a 403 into a 500 if you get it wrong.

Rename the local `canView` variables to `canEdit` so the code does not lie about
what it checked.

Do **not** add a new permission level, a config flag, or an `export` role — D-6
explicitly ruled that a distinct `export` permission is the answer *only if* a
future read-only-template-sharing feature arrives, which is not now.

### Ties

- Touches `ExportService.ts` only. **Conflicts with IEX2-9 and IEX2-11**, which
  also edit this file — sequence after both. Safe to run in parallel with the
  ImportService chain (IEX2-1..7).
- Rationale: **D-6** in this file. Related: **IEX2-6** (what a bundle discloses).
- Load `add-api-endpoint` (the error-string → status contract is exactly what
  this ticket can break) and `run-tests`.

### Acceptance criteria

1. All three scopes (`project`, `workflow`, `database`) check `'edit'`.
2. A test per scope asserts a user holding **only `view`** is refused, and that
   the failure surfaces as **403, not 500** — assert the status through the route,
   not just that the service threw.
3. A test per scope asserts a user holding `edit` still exports successfully.
4. A test asserts a user with project-level `edit` can still export a DataVault
   database inside that project (inherited role still works).
5. Existing export tests green; any that seeded a view-only user are updated to
   `edit` **with the change noted in your report** — do not silently weaken an
   assertion to make a test pass.
6. Gates as in IEX2-1.

---

# Phase C — P2: hardening, redaction depth, real proof

## IEX2-12 — Duplicate zip entry names: the checksum covers all copies, the reader uses the first ✅

> **Dispatched 2026-07-30 together with IEX2-13** — worktree
> `.claude/worktrees/iex2-12`, base `91ceec55`. Bundled deliberately: this
> ticket's own Ties note that both harden
> `validateZipBombsAndPaths` in `bundleReader.ts`, so splitting them would force
> the second dev to rewrite the first's method. One dev, one worktree, **two
> commits at review**.
>
> ⚠️ **`BUNDLE_REJECTION_SIGNALS` collision.** Both this ticket and **IEX2-5**
> (dispatched in parallel) append a signal to `portability.routes.ts:81-95`.
> Whichever lands second must `git merge main --ff-only` and re-run gates.
>
> **Baselines:** portability `unit-db` **58 passed / 7 files**; `test:fast`
> **149 files / 2016 tests**.

> **✅ Verified at review 2026-07-30 — committed `600404c6`.** Mutation-tested:
> reverting the duplicate guard fails both the unit and the route test. The
> integration test builds a genuinely malformed zip by rewriting entry names in
> the raw buffer rather than mocking, which is stronger than the AC required.
> `getEntryCount` and its assertion are both gone (AC 4).

**Priority: P2** · Size: S · Files: `server/services/portability/bundleReader.ts`

### Finding

Every lookup in `BundleReader` uses `find()`, which returns the **first** match:

```ts
const manifestEntry = this.entries.find((e) => e.entryName === 'manifest.json');   // :20
const entry = this.entries.find((e) => e.entryName === `entities/${entityName}.jsonl`); // :106
const entry = this.entries.find((e) => e.entryName === `blobs/${sha256}`);         // :126
const entry = this.entries.find((e) => e.entryName === 'blobs/index.json');        // :134
```

But `validateChecksum` (`bundleReader.ts:72-103`) `filter`s and hashes **all**
entries with a matching prefix. A zip carrying two `entities/steps.jsonl` members
therefore passes integrity validation over content that is not the content that
gets imported — and a different zip reader (many pick the last central-directory
entry) would see a different bundle than ezBuildr does. That is a classic parser
differential: "verified" no longer means "this is what was imported".

Tellingly, `getEntryCount` (`bundleReader.ts:141-143`) exists for exactly this
question and is called from **nowhere in production** — only from
`bundleFormat.test.ts:83`.

### Preferred fix

Reject duplicates outright in `validateZipBombsAndPaths` (`bundleReader.ts:35-70`),
alongside the existing traversal and size guards: build a `Set` of entry names
and throw on the first repeat, with a message that classifies to 400 (add the
signal to `BUNDLE_REJECTION_SIGNALS`, `portability.routes.ts:81-95`). A
legitimate bundle from `BundleWriter` can never contain duplicates, so this
rejects only malformed or hostile input.

### Ties

- Touches `bundleReader.ts` (+ one line in `portability.routes.ts`). **Safe to
  run in parallel with the ImportService chain.** Conflicts with IEX2-13 — same
  method; consider taking both together if dispatching to one dev.
- Load `run-tests`.

### Acceptance criteria

1. A test builds a zip with two entries of the same name and asserts the reader
   rejects it, naming the duplicated entry.
2. A test asserts the route answers **400** for that bundle.
3. A test asserts a normal `BundleWriter`-produced bundle still opens.
4. Either `getEntryCount` is used by the new check, or it is deleted along with
   its test assertion — no dead production method left behind.
5. Gates as in IEX2-1.

---

## IEX2-13 — Zip-bomb guards trust the attacker's own header values ✅

> **✅ Verified at review 2026-07-30 — committed `b943cd9f`.** All four new
> guards mutation-tested: each reverted guard fails its test. Note the adm-zip
> limitation the ticket anticipated — no streaming API, so the size check is
> necessarily post-decompression (still strictly better than trusting the
> header; library swap is D-7).
>
> **AC 3 was unsatisfiable as written and is superseded.** It asked for actual
> cumulative bytes over `MAX_TOTAL_SIZE` "even when the declared totals are
> within limits". Because `getEntryData` now requires `actualSize ===
> header.size`, the measured total can never exceed the declared total that the
> pre-check already caps — the chosen design is *stronger* than the AC assumed
> and makes that state unreachable. The dev reached the guard by stubbing the
> pre-check instead of flagging the contradiction. Reviewer kept the guard as
> defence in depth (so relaxing the size equality later cannot silently remove
> the only cumulative bound), stripped a block of stream-of-consciousness
> comments from the test, and documented why it is unreachable.

**Priority: P2** · Size: M · Files: `server/services/portability/bundleReader.ts`

### Finding

`validateZipBombsAndPaths` (`bundleReader.ts:53-65`) makes its decisions from the
zip's central directory, which is written by whoever produced the file:

```ts
const uncompressedSize = entry.header.size;
const compressedSize = entry.header.compressedSize;

if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE) { throw ... }

if (compressedSize > 0 && (uncompressedSize / compressedSize) > MAX_COMPRESSION_RATIO) { throw ... }

totalSize += uncompressedSize;
```

Two gaps:

1. **Declared, not measured.** A crafted archive can declare `size: 1024` and
   decompress to gigabytes; the guard passes and the expansion happens later, at
   `entry.getData()` (`bundleReader.ts:81`, `:111`, `:130`). Nothing ever compares
   the declared size to the bytes actually produced.
2. **The ratio check is skipped entirely when `compressedSize === 0`.** The
   `compressedSize > 0` condition was presumably meant to avoid a divide-by-zero,
   but it hands an attacker the bypass: declare zero and the ratio guard does not
   run. Only the absolute size checks remain, and those are also declared values.

The path-traversal and entry-count checks in the same method are sound; this is
specifically about the size guards.

### Preferred fix

Verify against reality. After decompressing an entry, compare the actual byte
length to the declared `header.size` and to `MAX_SINGLE_ENTRY_SIZE`, and maintain
a running total of **actual** decompressed bytes checked against
`MAX_TOTAL_SIZE`, aborting the moment it is exceeded. Centralise this so every
`getData()` call site goes through one guarded accessor rather than each
remembering to check.

Fix the ratio condition so a zero/absent `compressedSize` is treated as
suspicious (reject or fall through to the measured check), never as a pass.

If a genuinely streaming size guard is not achievable with adm-zip's API, say so
in your report and implement the strongest post-decompression check available —
that is still strictly better than trusting the header, and the library swap is
tracked as D-7.

### Ties

- Touches `bundleReader.ts`. **Conflicts with IEX2-12** (same method) and
  overlaps IEX2-10's limit values — sequence after both, or bundle with IEX2-12.
- `tests/integration/portability.import.limits.test.ts` is the existing home for
  these assertions.
- Load `run-tests`.

### Acceptance criteria

1. A test builds an archive whose declared `header.size` is far smaller than the
   real decompressed size, and asserts the reader rejects it rather than
   expanding it.
2. A test builds an entry with `compressedSize === 0` and asserts it is no longer
   a free pass through the ratio guard.
3. A test asserts actual cumulative decompressed bytes over `MAX_TOTAL_SIZE` are
   rejected, even when the declared totals are within limits.
4. All rejections classify to **400/413**, not 500.
5. Normal bundles still open; existing limit tests green.
6. Gates as in IEX2-1.

---

## IEX2-14 — Secret redaction reaches one JSON path; the scanner cannot see inside JSON at all 🔲

**Priority: P2** · Size: M · Files: `server/services/portability/redaction.ts`, `server/services/portability/entityGraph.ts`

### Finding

IEX-6B built a real redaction mechanism, then pointed it at almost nothing.

**Redaction covers two columns.** Across the whole graph there are exactly two
`redactPaths`: `connections.defaultHeaders` (`entityGraph.ts:40`) and
`blocks.config.headers[].value` (`entityGraph.ts:102`). A `blocks.config` is
free-form JSON for an HTTP block — a bearer token in `config.auth.token`, a key
in `config.body`, or credentials embedded in `config.url` all export in
cleartext. `steps.config` and `sections.config` (`entityGraph.ts:81`, `:72`) are
equally free-form and have no redaction at all.

**The scanner structurally cannot look inside JSON.** `scanForSecrets`
(`redaction.ts:101-118`) reads only top-level string columns:

```ts
for (const path of scanPaths) {
  const value = rowData[path];
  if (typeof value === 'string') {
    scanStringForSecrets(entityName, path, value, warnings);
  }
}
```

`rowData[path]` is a direct property read — it has no path traversal, unlike
`applyRedaction`, which does (`redaction.ts:54-71`). So `scanPaths` can only ever
name a plain text column. That is why the only three in the graph are the `code`
columns (`entityGraph.ts:111`, `:120`, `:129`). Every JSON config in the system is
outside the scanner's reach by construction, and there is no test that would
notice.

The regexes themselves (`redaction.ts:77-99`) are well-judged — vendor token
shapes, assigned literals, long opaque literals, with a UUID exclusion and a
deliberate decision not to flag `ctx.secrets.get(...)`. The mechanism is good;
the coverage is the problem.

### Preferred fix

1. **Give `scanForSecrets` the same path traversal `applyRedaction` already has.**
   Reuse the `blankPath` walker's structure (`redaction.ts:54-71`) — extract the
   traversal so both functions share it rather than writing a second one — so a
   `scanPath` can address `config.*` and array elements.
2. **Scan the JSON config columns**: add `scanPaths` for `blocks.config`,
   `steps.config`, `sections.config`, and `connections.defaultHeaders`. Scan
   values recursively rather than enumerating every possible key — an allowlist of
   key names will not survive contact with free-form config.
3. Keep scanning **non-destructive**. It emits `secret_scan` warnings into the
   manifest (`ExportService.ts:212-215`), which is the right behaviour: the user
   is told, the export still happens. Do **not** turn scan hits into redaction —
   silently blanking a user's own config would break the imported workflow.

Watch the noise budget: `datavault_values.value` is arbitrary user data and
scanning it would produce warnings on every export. Leave it out and say why.

### Ties

- Edits `entityGraph.ts` — **conflicts with IEX2-3 and IEX2-6. Sequence after
  both are committed.**
- Round-1 **IEX-6B** built this mechanism; read its ticket in
  `IMPORT_EXPORT_TICKETS.md:905` before changing the regexes — the exclusions are
  deliberate and were argued for.
- Existing tests: `secretScanner.test.ts`, `exportRedaction.test.ts`,
  `exportSecrets.test.ts`. All three must stay green.
- Load `run-tests`.

### Acceptance criteria

1. `scanForSecrets` and `applyRedaction` share one path-traversal implementation;
   there is not a second copy of the walker.
2. A test asserts a secret nested in `blocks.config.auth.token` produces a
   `secret_scan` warning in the exported manifest.
3. A test asserts a secret in `steps.config` (nested at least two levels deep, and
   one inside an array) is found.
4. A test asserts scanning is non-destructive: the exported config still contains
   the original value and the workflow imports intact.
5. A test asserts the deliberate non-matches from IEX-6B still do not fire — in
   particular `ctx.secrets.get("STRIPE")` and bare UUIDs.
6. `datavault_values.value` is **not** scanned, and the report says why.
7. `secretScanner.test.ts`, `exportRedaction.test.ts`, `exportSecrets.test.ts`
   all green.
8. Gates as in IEX2-1.

---

## IEX2-15 — The round-trip harness passes because it tests nothing hard 🔲

**Priority: P2** · Size: M · Files: `scripts/verifyPortabilityRoundTrip.ts`

### Finding

`scripts/verifyPortabilityRoundTrip.ts` is the only end-to-end proof this feature
has, and it is cited by the round-1 Phase 2 gate and by IEX-14. What it actually
exercises (`verifyPortabilityRoundTrip.ts:78-123`): a project, a workflow created
through `POST /api/workflows`, one section, and **two `text` steps**.

That workflow has no slug, is not public, has no published version, no templates,
no blobs (`blobsRestored` is 0), no DataVault, no logic rules, no transform
blocks, no hooks, no soft-deleted rows. Every one of the P0 defects in this file
is invisible to it — which is precisely why it prints `RESULT: PASS` while the
feature cannot round-trip a real workflow.

Secondary problem: the harness creates a tenant, a user, a project and two
workflows on every run (`:61-65`) and **never cleans up**. Repeated runs
accumulate junk tenants in whatever database it is pointed at.

### Preferred fix

Make the harness seed a workflow that looks like a customer's, and assert on the
way back. Extend the seeding to include, at minimum:

- a `slug`, `publicLink`, `isPublic: true`, `status: 'active'` on the source
  workflow (proves IEX2-3),
- a published `workflow_versions` row with a non-null `publishedAt` (proves
  IEX2-1),
- a template with a real uploaded file, so `blobsRestored > 0` (proves the blob
  path end-to-end),
- a DataVault database + table + a few rows, including one soft-deleted
  (proves IEX2-1's `deletedAt` case),
- a logic rule and a transform block (proves reference remapping).

Then assert the round-trip properties the P0s are about: the import **succeeds**;
the imported workflow is **not** public and does not share the source's
`publicLink` or `slug`; its version is not published; `blobsRestored` matches the
number of template files; every id differs from the source's.

Add cleanup: delete the tenant it created on success, and print the tenant id on
failure so the operator can clean up by hand. Keep the credential printing and
the `UI login path OK` check — those were hard-won (see IEX-14's amendment) and
must not regress.

### Ties

- **Dispatch LAST**, after Phase A is committed — the harness's new assertions
  are the acceptance evidence for IEX2-1 and IEX2-3, and it will fail until they
  land. Run it as the Phase A gate check.
- Touches `scripts/verifyPortabilityRoundTrip.ts` only. **No conflicts.**
- Read the script's header comment and IEX-14's amendment
  (`IMPORT_EXPORT_TICKETS.md:2106`) first — the `emailVerified` and tenant-bootstrap
  gotchas are already paid for; do not re-derive them.
- Load the `verify` skill (booting the app, the local-auth workaround) and
  `run-tests`.

### Acceptance criteria

1. The harness seeds every item in the list above and prints what it seeded.
2. It asserts the import succeeds and fails loudly (non-zero exit) if not.
3. It asserts the imported workflow is not public, has no `publicLink`, no
   `slug`, `status: 'draft'`, and no published version.
4. It asserts `blobsRestored` equals the number of template files seeded.
5. It asserts every imported id differs from its source id.
6. It cleans up the tenant it created on success; on failure it prints the tenant
   id for manual cleanup.
7. `RESULT: PASS` and `UI login path OK (HTTP 200)` still print on success.
8. Full output pasted in the report, run against a dev server.

---

# Phase D — Make the feature reachable

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

## D-6 — Should `view` permission be enough to export everything? ✅ **RULED 2026-07-29 — require `edit`**

> **Shawn's ruling:** *"i can go with edit permissions to export"* —
> recommendation accepted. Export now requires `edit` at all three scopes,
> matching import. Filed as **IEX2-17** in Phase B; the analysis below is the
> ticket's Finding.

`ExportService.verifyAccessAndGetTenant` gates all three scopes on the **lowest**
role: `hasProjectRole(userId, id, 'view')` (`ExportService.ts:125`),
`hasWorkflowRole(userId, id, 'view')` (`:151`), `hasDatabaseRole(userId, id, 'view')`
(`:163`).

So anyone who can *look* at a workflow can download a complete, portable copy of
it: every step, all logic, all transform/lifecycle/document hook **source code**,
every template binary, and all DataVault reference rows in scope — and import it
into a tenant they control.

**Checked and cleared: this is NOT a permission bypass.** The first draft of this
audit suspected that a workflow-scope export pulls DataVault rows without
consulting DataVault's own ACL. It does not. `resolveRoleForDatabase` explicitly
inherits from the scope owner — `DatavaultAclService.ts:120-128`:

```ts
if (database.scopeType === "project" && database.scopeId) {
  const projectRole = await aclService.resolveRoleForProject(userId, database.scopeId, tx);
  highestRole = this.getHighestRole(highestRole, projectRole);
}
```

and `resolveRoleForTable` takes the highest of the database role and any
table-level ACL (`:170-191`), with no mechanism to reduce below the inherited
role. A project viewer is *supposed* to be able to read DataVault data scoped to
that project. Export is consistent with the rest of the product.

**So this is purely a product-policy question**, and the honest framing is:

> A viewer can already *read* all of this through the UI. Export does not
> disclose anything new — it changes the **effort and the form**: one click
> produces a complete, offline, re-importable copy of the asset that you can no
> longer revoke by un-sharing.

That distinction is real enough that every major product ships a control for it
(Google Docs' "Viewer" vs. "Viewer — cannot download, print, or copy").

**Recommendation: require `edit`.** Four reasons:

1. **Symmetry.** Import already requires `edit` on the target project
   (`ImportService.ts:307`). A system where taking data out is easier than
   putting it in is hard for anyone to reason about.
2. **Irrevocability.** Every other action in the product can be undone by
   un-sharing. A downloaded `.ezb` cannot be. That is the one place worth
   spending a little friction.
3. **Cheap to loosen, expensive to tighten.** If a customer complains their
   viewers cannot export, it is a one-line relax. If you ship view-can-export and
   a customer later finds a read-only contractor walked off with their whole
   workflow library, you cannot un-ship it.
4. **Near-zero cost today.** All three stated asks (#1 admin archive, #2
   client-wide, #3 per-object) are *owners moving their own data*. Everyone in
   those flows has `edit`. Nobody's real workflow breaks.

**The counter-argument, stated fairly:** if you ever want "share a workflow
read-only so someone can take a copy as a starting template", `edit` blocks it.
That is a plausible future feature and is not any of the three current asks — and
if it arrives, the right answer is a distinct `export` permission, not a
permanently loose gate.

**Cost if approved:** three one-line changes in `ExportService.ts:125/151/163`
plus a test per scope asserting a viewer gets 403. Size S. Slot it into Phase B.

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

# Portability — Import/Export Bundles (IEX-1..11 + Phase 3/4 outline + backlog)

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
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE concurrently
  and unrelated changes are routinely present in the tree.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort | Status |
|---|---|---|---|---|
| 0 | Foundation: entity graph, allowlist, bundle format | IEX-1, IEX-2, IEX-3 | ~1.5 days | ✅ **Done 2026-07-27** — gate verified |
| 1 | Single-object **export** (ask #3, read path) | IEX-4..IEX-7 | ~2 days | 🔲 |
| 2 | Single-object **import** (ask #3, write path) | IEX-8..IEX-11 | ~2.5 days | 🔲 |
| 3 | Client-wide export/import (ask #2) | IEX-12..14 (outline) | ~2 days | 🔲 unblocked 2026-07-27 |
| 4 | Admin multi-tenant archive (ask #1) | IEX-15..18 (outline) | ~2 days | 🔲 unblocked 2026-07-27 |
| Backlog | Not phase-gated | IEX-B1..B7 | | 🔲 |

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

## IEX-1 — Declarative entity graph + default-deny field allowlist ✅

> **Verified 2026-07-27.** `ENTITY_GRAPH` (26 entities) + `EXCLUDED_TABLES`
> (79) classify all 105 distinct tables. All 18 named sensitive tables
> excluded with individual reasons. `templates.fileRef` /
> `template_versions.fileRef` in `blobRefs`; `WorkflowClonerService.ts`
> untouched. Reviewer added the `files` classification — it was the one table
> nothing had caught, because the schema barrel never re-exported it.

**Priority: P1** · Size: M · File: `server/services/portability/entityGraph.ts` (new)

### Finding

The complete import/export object graph already exists, but only as ~1 000
lines of hand-written imperative copy code inside
`server/services/WorkflowClonerService.ts`. It covers projects, workflows,
workflow versions, sections, steps, logic rules, blocks, transform blocks,
lifecycle hooks, document hooks, templates + template versions, ACLs, and the
DataVault side (databases, tables, columns, rows, values, number sequences,
writeback mappings, queries, datasource links) — see the `copy*` methods from
`WorkflowClonerService.ts:436` onward, e.g.:

```ts
await this.copySectionsAndSteps(tx, sourceWorkflow.id, newWorkflow.id, idMap);
await this.copyLogicRules(tx, sourceWorkflow.id, newWorkflow.id, idMap);
await this.copyBlocks(tx, sourceWorkflow.id, newWorkflow.id, idMap);
```

Two consequences:

1. **There is no way to ask "is table X covered?"** other than reading 1 700
   lines. Adding a 107th table today silently produces an incomplete clone and
   would silently produce an incomplete backup.
2. **Every column is enumerated by hand at each insert site**, so field
   selection is a blocklist by omission. When someone adds a sensitive column
   to an already-copied table, it is copied unless a human remembers not to.
   For a clone that is a bug; for an export that leaves the tenant it is a
   data breach.

### Preferred fix

Create `server/services/portability/entityGraph.ts` exporting a **declarative
descriptor list** — data, not logic. Do **not** modify
`WorkflowClonerService.ts` in this ticket; re-pointing the cloner is IEX-B1 and
is deliberately out of scope.

Shape (adjust names if a better fit emerges, but keep it declarative):

```ts
export interface EntityDescriptor {
  /** Drizzle table object from @shared/schema */
  table: PgTable;
  /** Stable name used as the JSONL filename and in the manifest */
  name: string;
  /** Which root scopes this entity participates in */
  scopes: Array<'workflow' | 'project' | 'tenant'>;
  /** How to reach this entity from its parent; null for a root */
  parent: { name: string; fk: string } | null;
  /** DEFAULT-DENY: only these columns are ever serialized */
  fields: string[];
  /** Columns holding UUIDs that must be remapped on clone-mode import */
  refs?: string[];
  /** Columns holding jsonb that may contain embedded UUIDs */
  jsonRefs?: string[];
  /** Columns holding a storage fileRef whose bytes must be embedded (IEX-5) */
  blobRefs?: string[];
}

export const ENTITY_GRAPH: EntityDescriptor[] = [ /* ... */ ];

export const EXCLUDED_TABLES: Record<string, string> = {
  refresh_tokens: 'Session material; never leaves the system.',
  // ...every remaining table, each with a real reason
};
```

Derive the graph and per-table field lists **from the cloner's existing insert
sites** — it is the donor pattern and it is already correct. Where the cloner
omits a column deliberately (e.g. it reassigns `lastModifiedBy: userId` at
`WorkflowClonerService.ts:849`), preserve that intent via the `fields` list
plus a comment.

`EXCLUDED_TABLES` must classify **every** table not in `ENTITY_GRAPH`, with a
one-line reason. The following are non-negotiable exclusions — a bundle must
never be able to carry them:

`secrets` (values), `connections.authConfig`/`oauthState`, `datavault_api_tokens`,
`refresh_tokens`, `user_credentials`, `mfa_secrets`, `mfa_backup_codes`,
`trusted_devices`, `portal_tokens`, `api_keys`, `oauth_access_tokens`,
`oauth_auth_codes`, `invalidated_tokens`, `sessions`,
`password_reset_tokens`, `email_verification_tokens`, `login_attempts`,
`account_locks`.

Note `secrets` appears in `ENTITY_GRAPH` in IEX-6 with a **shape-only** field
list; in this ticket put it in `EXCLUDED_TABLES` and let IEX-6 move it.

### Ties

- **IEX-2** consumes `ENTITY_GRAPH` + `EXCLUDED_TABLES` and will fail if the
  union is not exhaustive. Run before IEX-2.
- **IEX-3** touches only `server/services/portability/bundle*.ts` — no file
  overlap, safe to run in parallel.
- **IEX-6** will later move `secrets` from excluded to shape-only.
- **IEX-B1** (backlog) re-points the cloner at this graph. Do not attempt here.
- Load `add-api-endpoint` (service-layer conventions) and `run-tests`.
- Read `docs/architecture/SECURITY_THREAT_MODEL.md` for why default-deny.

### Acceptance criteria

1. `server/services/portability/entityGraph.ts` exists and exports
   `ENTITY_GRAPH`, `EXCLUDED_TABLES`, and the `EntityDescriptor` type.
2. Every entity the cloner copies is present in `ENTITY_GRAPH` with a `fields`
   list, correct `parent`, and correct `scopes`.
3. `templates.fileRef` and `template_versions.fileRef` are declared in
   `blobRefs`.
4. Every jsonb column the cloner passes through `remapJsonIds`
   (`WorkflowClonerService.ts:135`) is declared in `jsonRefs` on its entity.
5. All 18 sensitive tables listed above appear in `EXCLUDED_TABLES`, each with
   a non-empty reason string.
6. No column named `valueEnc`, `authConfig`, `oauthState`, `tokenHash`,
   `secret`, or `passwordHash` appears in any `fields` array. A column named
   `value` is likewise banned **except** on `datavault_values`, where `value`
   *is* the payload and **must** be present in `fields` — DataVault reference
   data is explicitly in scope per decision D-1, and a `datavault_values`
   descriptor without `value` exports rows containing no data at all. Write
   the guard as a table+column allowlist, not a bare column-name blocklist.
   (Amended 2026-07-27 after the first attempt satisfied the original wording
   by silently dropping the column.)
7. `WorkflowClonerService.ts` is **not modified** by this ticket.
8. New test `tests/unit/portability/entityGraph.test.ts` asserts 3, 5, and 6
   mechanically (iterate the arrays; do not hand-write assertions per table).
9. Gates: `npm run type-check` 0 errors, `npm run lint` clean on touched files,
   `npm run test:fast` green at ≥ baseline.

---

## IEX-2 — Schema coverage test: every table must be classified ✅

> **Verified 2026-07-27.** Reviewer confirmed by hand, twice: a dummy table
> added to a schema file fails with the actionable message, and a domain file
> dropped from the barrel now fails too. That second case is a reviewer
> addition — the as-submitted test swept the `@shared/schema` *namespace*, so
> `files.ts` (never re-exported from `index.ts`) was invisible and its table
> sat unclassified while the test passed. It now cross-checks the namespace
> against a source scan of `shared/schema/*.ts`, and `./files` was added to
> the barrel.

**Priority: P0** · Size: S · File: `tests/unit/portability/schemaCoverage.test.ts` (new)

### Finding

There is no mechanism that notices when a new table is added and never
classified for portability. `shared/schema/` currently defines **106**
`pgTable` calls across 13 domain files. Today the only record of what a clone
covers is the cloner's imperative code; after IEX-1 it is `ENTITY_GRAPH`, but
either way nothing forces a new table to be considered.

This is the failure mode that makes long-lived backup features quietly
worthless: the bundle keeps succeeding, it just stops containing everything.
Shawn's stated goal is clients holding bundles *elsewhere, for years* — silent
incompleteness is the worst possible failure here because it is only
discovered at restore time.

### Preferred fix

Write a test that enumerates every exported Drizzle table from
`@shared/schema` at runtime and asserts each one is classified as **either** in
`ENTITY_GRAPH` **or** in `EXCLUDED_TABLES` — never neither, never both.

Enumerate reflectively, not by a hand-maintained list (a hand-maintained list
has the same rot problem). Import `* as schema from '@shared/schema'` and
filter to Drizzle table objects; Drizzle exposes table metadata via the
`getTableName` helper from `drizzle-orm`.

The failure message must be actionable — name the offending table and state
exactly what to do:

```
Table "foo_bar" is not classified for portability.
Add it to ENTITY_GRAPH (with a default-deny `fields` list) or to
EXCLUDED_TABLES (with a reason) in server/services/portability/entityGraph.ts.
```

Also assert the reverse direction: every `name` in `ENTITY_GRAPH` and every key
in `EXCLUDED_TABLES` corresponds to a table that actually exists — so deleting
a table forces cleanup too.

### Ties

- **Depends on IEX-1.** Do not start until IEX-1 is ✅ and committed.
- Load `run-tests`. This is a `unit-fast` test — **no DB access**; it must read
  schema objects only. If you find yourself needing `DATABASE_URL`, you have
  taken a wrong turn.
- Related: `docs/claude/SCHEMA.md` documents the table inventory.

### Acceptance criteria

1. `tests/unit/portability/schemaCoverage.test.ts` exists and runs in the
   `unit-fast` project with no database connection.
2. Test fails with the actionable message above when a table is in neither
   `ENTITY_GRAPH` nor `EXCLUDED_TABLES`.
3. Test fails when a table appears in **both**.
4. Test fails when `ENTITY_GRAPH`/`EXCLUDED_TABLES` names a table that no
   longer exists in the schema.
5. Test passes against the current tree (i.e. IEX-1 genuinely classified all
   106 tables).
6. The test derives its table list reflectively from `@shared/schema` — a
   hardcoded list of table names is an automatic fail.
7. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
   green at ≥ baseline + the new tests.

---

## IEX-3 — Bundle format: manifest, JSONL streams, zip pack/unpack with bomb guards ✅

> **Verified 2026-07-27.** Round-trip green; blob dedupe by sha256 confirmed;
> checksum canonically ordered (sorted entities → sorted blobs → index) on
> both sides and rejecting on mismatch. All six AC-4 rejection cases now have
> a distinct test — the reviewer added the missing `formatVersion` one.
> `WorkflowBundleService.ts` deleted, no references remain.
>
> Reviewer also deleted `server/types/adm-zip.d.ts`, a hand-written shim that
> shadowed adm-zip's real typings with `getEntries(): any[]` and no
> `writeZip`. It was the true cause of both type errors in the first
> submission and of all 55 masked lint errors; with it gone the bundle layer
> types correctly against the library and needs no casts. Its only other
> consumer was the stub this ticket deletes.
>
> **Known limitation, not a defect:** `readEntityStream` reads an entry into a
> Buffer before line-streaming it. adm-zip has no per-entry read stream, so
> true streaming is impossible with the library this ticket specified. Fine at
> single-object scope; revisit at Phase 3 when tenant-scale `datavault_values`
> arrives — filed as **IEX-B8**.

**Priority: P1** · Size: M · Files: `server/services/portability/bundleFormat.ts`,
`bundleWriter.ts`, `bundleReader.ts` (all new); deletes
`server/services/WorkflowBundleService.ts`

### Finding

`server/services/WorkflowBundleService.ts` claims exactly this territory and is
a stub. `exportBundle` writes a manifest containing nothing but workflow
metadata and a version list — no entities, no assets, with the gap admitted
inline at `:30`:

```ts
// 4. Add Assets (if any) - e.g. logos, files
// Not implemented yet, but placeholders would go here.
```

and `importBundle` does not import anything, returning a literal placeholder at
`WorkflowBundleService.ts:55`:

```ts
// ... Implementation logic to recreate workflow from manifest ...
// For now, let's just create the workflow record.
// Return new workflow ID
return "new-workflow-id-placeholder";
```

It is referenced by nothing outside itself (verified: only its own class and
singleton declaration match `workflowBundleService` repo-wide), so it is dead
code occupying the name the real implementation wants. It is bundled into this
ticket rather than split out because it is the same concern in the same file —
splitting would make two devs collide over one deletion.

### Preferred fix

Define the on-disk format and the pure read/write machinery, with **no
knowledge of the entity graph and no database access**. This ticket is a
library; IEX-4 and IEX-8 are its callers.

Format — a zip (`adm-zip` is already a dependency, used by the current stub):

```
manifest.json      formatVersion, appVersion, migrationHead, scope, rootIds,
                   sourceSystem, createdAt, entityCounts, blobCount, checksum
entities/<name>.jsonl   one file per entity, newline-delimited JSON rows
blobs/<sha256>          content-addressed file bodies, no extension
blobs/index.json        fileRef → { sha256, filename, mimeType, size }
```

**JSONL, not one nested JSON document.** A tenant-scope export of
`datavault_values` (EAV) will not fit in memory as a single object, and
line-delimited files stay streamable and diffable. Write with a cursor, read
with a stream.

**Content-address the blobs by sha256.** Template versions routinely point at
the same underlying file; addressing by hash dedupes them for free and makes
integrity checking trivial.

`bundleReader` treats every bundle as **hostile input** (a client uploads
these). Enforce, before extracting anything:

- max entry count
- max single-entry uncompressed size
- max total uncompressed size
- max compression ratio per entry (zip-bomb guard)
- reject any entry whose path escapes the bundle root (`../`, absolute paths,
  drive letters) — zip-slip guard
- reject `formatVersion` greater than the current constant

Make the limits named exported constants so IEX-10 can reuse them and tests can
assert against them.

Delete `server/services/WorkflowBundleService.ts` outright — do not comment it
out, do not leave a re-export shim. Nothing imports it.

### Ties

- **IEX-1** touches only `entityGraph.ts` — no overlap, safe to run in
  parallel with this ticket.
- **IEX-4** (export) and **IEX-8** (import) are the consumers; keep this module
  free of DB and entity-graph imports so they can be tested independently.
- **IEX-10** reuses the size/quota constants defined here.
- Load `run-tests`. Load `add-api-endpoint` for service conventions.

### Acceptance criteria

1. `bundleFormat.ts` exports the manifest Zod schema, `FORMAT_VERSION`, and the
   named limit constants.
2. `bundleWriter` produces a zip with the layout above; blobs are named by the
   sha256 of their content.
3. `bundleReader` round-trips a bundle written by `bundleWriter` with byte-identical
   entity rows and blob bytes.
4. `bundleReader` rejects, with a distinct error per case: entry-count overflow,
   single-entry size overflow, total size overflow, compression-ratio overflow,
   path traversal (`../` and absolute), and `formatVersion` newer than current.
5. Adding a blob twice with identical content produces **one** `blobs/` entry.
6. Manifest `checksum` covers the entity + blob content and `bundleReader`
   rejects a bundle whose checksum does not match.
7. `server/services/WorkflowBundleService.ts` is **deleted** and no import of it
   remains anywhere (`grep -r workflowBundleService` returns nothing).
8. Neither `bundleFormat.ts`, `bundleWriter.ts`, nor `bundleReader.ts` imports
   `../db`, any repository, or `entityGraph.ts`.
9. New test `tests/unit/portability/bundleFormat.test.ts` asserts 2–7, with one
   distinct test per rejection case in 4.
10. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
    green at ≥ baseline + the new tests.

---

## Phase 0 Gate ✅ PASSED 2026-07-27

- [x] IEX-1, IEX-2, IEX-3 all ✅ with dated verification notes
- [x] `npm run type-check` → 0 errors (run cold; see gotcha below)
- [x] `npm run lint` → 0 problems, full repo at `--max-warnings 0`
- [x] `npm run test:fast` → **146 files / 1978 tests** (baseline 143 / 1963)
- [x] `grep -r "workflowBundleService" server/ client/ shared/` → no matches
- [x] Coverage test demonstrably fails when a dummy table is added to
      `shared/schema/` — reviewer verified by hand, both for a barrel-exported
      file and for a domain file dropped from the barrel, then reverted
- [x] Reviewer has committed each passed ticket + this gate

> **Gotcha for every later phase.** `tsconfig.json` sets
> `tsBuildInfoFile: ./node_modules/typescript/tsbuildinfo`, and worktrees
> junction `node_modules` to the main checkout — so **worktrees share one
> incremental tsc cache** and `type-check` reports stale errors (or stale
> greens) across trees. `rm -f node_modules/typescript/tsbuildinfo` before
> trusting any type-check run in a worktree. This cost real time here: a
> fixed error kept reporting until the cache was cleared.

---

# Phase 1 — Single-object export (ask #3, read path)

Turns the Phase 0 machinery into a real bundle produced from real data, for one
workflow / project / DataVault database. Export only — nothing in this phase
writes to the database. Phase 2 adds the import side.

Out of scope: tenant-wide export (Phase 3), async jobs (Phase 3), run history
(decision D-1), any UI beyond what IEX-7 needs to be callable.

**Dispatch order:** IEX-4 → IEX-5 → IEX-6 → IEX-7, strictly sequential.
IEX-5 and IEX-6 both extend the exporter IEX-4 creates; IEX-7 wraps it.

## IEX-4 — ExportService: walk the entity graph from a root and emit entities 🔲

**Priority: P1** · Size: M · File: `server/services/portability/ExportService.ts` (new)

### Finding

No code path serializes workflow structure. `WorkflowExportService`
(`server/services/WorkflowExportService.ts`) is a different axis entirely — it
exports **run responses** as CSV/JSON keyed by step title
(`exportJSON` at `:43`, `exportCSV` at `:89`), and is wired to
`GET /api/workflows/:workflowId/export`. It does not touch structure and must
not be modified or repurposed by this ticket.

### Preferred fix

Add `ExportService` that takes a root (`{ scope: 'workflow'|'project'|'database', id }`)
plus the requesting user, and produces a bundle via `bundleWriter`.

Algorithm: resolve the root, then walk `ENTITY_GRAPH` in `parent`-dependency
order, selecting children by their declared `fk`, projecting **only** the
columns in each descriptor's `fields`. Stream rows to the writer — do not
accumulate all entities in memory.

**Authorization is not optional and belongs here, in the service layer**, per
the repo's 3-tier convention. Mirror the existing check the cloner uses:
`workflowService.verifyAccess(workflowId, userId, 'view')` — see
`WorkflowBundleService.ts:13` for the call shape and
`WorkflowClonerService.copyWorkflow` (`:274`) for how the cloner authorizes a
whole-object read. For project scope, mirror `copyProject` (`:166`).

Tenancy: every selected row must be filtered by the resolved `tenantId`. A
descriptor walk that follows FKs alone will happily cross a tenant boundary if
a FK is ever wrong; belt-and-braces the scope filter.

Do not embed blobs in this ticket (IEX-5) and do not handle secrets (IEX-6) —
`secrets` is still in `EXCLUDED_TABLES` at this point.

### Ties

- **Depends on Phase 0 gate.** Consumes `ENTITY_GRAPH` (IEX-1) and
  `bundleWriter` (IEX-3).
- **IEX-5** and **IEX-6** extend this same file — they are sequenced after,
  not parallel.
- Do **not** touch `WorkflowExportService.ts` (different feature, same-sounding
  name) or `WorkflowClonerService.ts`.
- Load `add-api-endpoint` (service-layer authz + error-string contract) and
  `run-tests`.

### Acceptance criteria

1. `ExportService.export({ scope, id }, userId)` returns a Buffer that
   `bundleReader` accepts.
2. Exporting a workflow yields entity rows for that workflow's sections, steps,
   logic rules, blocks, transform blocks, lifecycle hooks, document hooks, and
   workflow versions.
3. Exporting a project additionally yields its workflows, templates, template
   versions, and related DataVault entities.
4. Only columns listed in each descriptor's `fields` appear in the output —
   asserted mechanically against `ENTITY_GRAPH`, not by spot-check.
5. A user without access to the root gets the service-layer `Access denied`
   error that `classifyRouteError` maps to 403 (see `add-api-endpoint`).
6. Rows belonging to another tenant are never emitted, even when reachable by
   FK — test with a deliberately cross-tenant fixture.
7. Manifest `entityCounts` matches the actual emitted row counts.
8. `WorkflowExportService.ts` and `WorkflowClonerService.ts` are unmodified.
9. New test `tests/unit-db/portability/exportService.test.ts` asserts 1–7.
   This one **does** need a database — use the `unit-db` project (`run-tests`
   skill explains the split).
10. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
    green at ≥ baseline, `npm run test:unit` green.

---

## IEX-5 — Embed template binaries in the bundle (the "empty shell" fix) 🔲

**Priority: P0** · Size: M · Files: `server/services/portability/ExportService.ts`,
`server/services/portability/blobs.ts` (new)

### Finding

**This is the single defect that would make the whole feature a lie**, and it
is inherited straight from the cloner's design.

`templates.fileRef` (`shared/schema/workflow.ts:181`) and
`template_versions.fileRef` (`:199`) are `varchar(500)` **storage keys, not
content**. The cloner copies the key verbatim, so a clone shares the original's
bytes — correct in-system, worthless in a bundle. See
`WorkflowClonerService.ts:843`:

```ts
fileRef: template.fileRef,
```

and again for versions at `:876`. A bundle built on IEX-4 alone therefore
contains a pointer into a bucket the client cannot reach. It would import
cleanly on our system and be an empty shell anywhere else — exactly the promise
Shawn wants to make ("hold your workflows elsewhere") broken in the least
visible way possible.

**Wrinkle the dev must not get wrong: this app has two separate file systems.**
Template bytes are **not** in the `files` table. They go through
`storageProvider` (`server/services/storage/index.ts:19`, selected by
`STORAGE_DRIVER`), whose interface is `server/services/storage/types.ts` —
`getFile(fileRef): Promise<Buffer>` at `:50`, `exists(fileRef)` at `:44`. The
`files` table (`shared/schema/files.ts:28`) and `FileStorageService` are a
*different* subsystem with its own `storageKey`/`provider` columns. Use
`storageProvider` for anything reached via a `blobRefs` column.

### Preferred fix

Add `server/services/portability/blobs.ts` with a `BlobCollector` that, given a
`fileRef`, fetches bytes via `storageProvider.getFile`, hashes them (sha256),
adds them to the bundle under `blobs/<sha256>` once, and records the
`fileRef → { sha256, filename, mimeType, size }` mapping for `blobs/index.json`.

Wire it into `ExportService`: for every descriptor with `blobRefs`, resolve each
listed column through the collector.

**Missing blobs must not fail the export silently or loudly-and-uselessly.**
A `fileRef` whose bytes are gone (already possible today — `templateFileExists`
at `templateFiles.ts:25` exists precisely because this happens) should be
recorded in a `manifest.warnings[]` entry naming the entity and column, and the
export should succeed. A bundle that is 99% complete and says so is far more
useful than a failed export.

Enforce the total-size limit from IEX-3 while collecting, so a pathological
project cannot produce a 40 GB bundle.

### Ties

- **Depends on IEX-4** (extends the same file — sequence, do not parallelize).
- **IEX-10** is the mirror image (blob restore on import) and will reuse
  `blobs.ts`; keep the hashing/indexing helpers exported.
- Reuses the limit constants from **IEX-3**.
- Load `add-api-endpoint`, `run-tests`. Read `server/services/storage/types.ts`
  before writing any file access.
- Do **not** route template reads through `FileStorageService` or the `files`
  table — wrong subsystem (see Finding).

### Acceptance criteria

1. Exporting a project whose templates have real stored files produces
   `blobs/` entries whose bytes are byte-identical to `storageProvider.getFile`.
2. `blobs/index.json` maps every exported `fileRef` to its sha256, filename,
   mimeType, and size.
3. Two template versions sharing one `fileRef` produce exactly **one**
   `blobs/` entry.
4. A `fileRef` with no bytes in storage produces a `manifest.warnings[]` entry
   naming the entity and column, and the export still succeeds.
5. Exceeding the IEX-3 total-size limit aborts the export with a distinct,
   catchable error — not a truncated bundle.
6. Blob access goes through `storageProvider`; the diff contains no reference
   to `FileStorageService` or the `files` table.
7. New tests in `tests/unit-db/portability/exportBlobs.test.ts` assert 1–5,
   including the dedupe case (3) and the missing-file case (4).
8. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
   green at ≥ baseline, `npm run test:unit` green.

---

## IEX-6 — Secrets and connections: shape-only export + re-entry report 🔲

**Priority: P0** · Size: S · Files: `server/services/portability/entityGraph.ts`,
`server/services/portability/ExportService.ts`

### Finding

Workflows depend on `secrets` and `connections`, so a bundle that omits them
entirely imports into a non-functioning workflow with no explanation. But
neither can be exported as-is:

- `secrets.valueEnc` (`shared/schema/integrations.ts:45`) is AES-256-GCM
  ciphertext under `VL_MASTER_KEY` (`server/utils/encryption.ts:55`). It is
  meaningless on any other system and, in a client's hands, is a
  key-compromise amplifier for us.
- `connections.authConfig` and `connections.oauthState`
  (`shared/schema/integrations.ts:61`) are jsonb blobs that hold live auth
  material.

After IEX-1 both are in `EXCLUDED_TABLES`, which is safe but leaves the import
side unable to tell the user *what* is missing.

**This ticket implements decision D-2. If Shawn overrules D-2, stop and report
— do not improvise a different posture.**

### Preferred fix

Move `secrets` and `connections` from `EXCLUDED_TABLES` into `ENTITY_GRAPH`
with **shape-only** field lists:

- `secrets`: `id`, `projectId`, `key`, `type`, `environment`, `metadata`.
  Never `value`, never `valueEnc`.
- `connections`: `id`, `tenantId`, `projectId`, `name`, `type`, `baseUrl`,
  `defaultHeaders`, `timeoutMs`, `retries`, `backoffMs`, `enabled`,
  `secretRefs`. Never `authConfig`, never `oauthState`.

Emit a `manifest.requiresReentry[]` array listing each secret
(`projectId`, `key`, `environment`, `type`) and each connection whose auth
material was withheld, so the import side (IEX-8) can render a "you must
re-enter these" report without re-deriving it.

Verify `secretRefs` genuinely contains only references and no inline material
before including it; if it turns out to carry values in practice, exclude it
and say so in your report.

The IEX-1 field-name guard (no `value`/`valueEnc`/`authConfig`/`oauthState` in
any `fields` array) must **remain green** after this change — that is the test
that proves this ticket did not leak anything.

### Ties

- **Depends on IEX-4**; edits the same two files as IEX-1/IEX-5. Sequence after
  IEX-5.
- **IEX-8** consumes `manifest.requiresReentry[]` for the import preview.
- Implements **decision D-2** above.
- Load `add-api-endpoint`, `run-tests`. Read
  `docs/architecture/SECURITY_THREAT_MODEL.md`.

### Acceptance criteria

1. `secrets` and `connections` appear in `ENTITY_GRAPH` with exactly the field
   lists above.
2. A bundle exported from a project with secrets contains the secret keys and
   types but **no** `value` or `valueEnc` field on any row — asserted by
   scanning the raw JSONL text for those column names and for a known secret
   value planted by the test.
3. Exported connection rows contain no `authConfig` and no `oauthState` —
   asserted the same way, including a planted token string.
4. `manifest.requiresReentry[]` lists every secret and every connection whose
   material was withheld.
5. The IEX-1 field-name guard test still passes unmodified.
6. New tests in `tests/unit-db/portability/exportSecrets.test.ts` assert 2–4
   using planted sentinel values, not structural assertions alone.
7. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
   green at ≥ baseline, `npm run test:unit` green.

---

## IEX-7 — Export routes: authz, audit, rate limit, streaming download 🔲

**Priority: P1** · Size: S · File: `server/routes/portability.routes.ts` (new),
`server/routes/index.ts`

### Finding

`ExportService` has no HTTP surface after IEX-4..6. It also needs controls that
belong at the route layer, because **a bundle export is an exfiltration
primitive**: one authorized call returns an entire project — structure, data,
and template binaries — in a single file. The existing structure-adjacent
export route (`server/routes/workflowExports.routes.ts:20`) has no rate limit
and no audit logging, so it is not a sufficient donor for those two concerns.

### Preferred fix

Add `server/routes/portability.routes.ts` with:

```
GET /api/portability/export/workflow/:id
GET /api/portability/export/project/:id
GET /api/portability/export/database/:id
```

Mirror the established route shape from `workflowExports.routes.ts` —
`hybridAuth`, `asyncHandler`, `classifyRouteError` — and register it in
`server/routes/index.ts` alongside the other registrars.

Beyond the standard shape, add:

- **Audit log entry per export**, via the existing `AuditLogService` /
  `audit_logs` table: actor, scope, root id, tenant, entity counts, bundle
  size. This is the record that answers "who took a copy of this client's
  data, and when".
- **Rate limit** on the export endpoints specifically. Find the existing rate
  limit middleware in `server/middleware/` and reuse it; do not write a new
  one.
- **Stream the response** (`Content-Type: application/zip`,
  `Content-Disposition: attachment`) rather than buffering the whole bundle
  into a string.

Authorization stays in the service (IEX-4) per the 3-tier convention — the
route must not re-implement it.

### Ties

- **Depends on IEX-4, IEX-5, IEX-6.**
- **IEX-11** adds the import routes to this same file — sequence, do not
  parallelize.
- Donor pattern: `server/routes/workflowExports.routes.ts` (route shape only —
  it lacks the audit and rate-limit pieces this ticket adds).
- Load `add-api-endpoint` — the error-string contract and `classifyRouteError`
  mapping are mandatory here.

### Acceptance criteria

1. All three routes return a `.ezb` zip with correct `Content-Type` and
   `Content-Disposition` headers.
2. Unauthenticated request → 401.
3. Authenticated user without access to the root → 403 via `classifyRouteError`
   (not a 500, not a 404).
4. Non-existent root id → 404.
5. Each successful export writes exactly one `audit_logs` row containing actor,
   scope, root id, and entity counts.
6. Exceeding the rate limit → 429.
7. Routes are registered in `server/routes/index.ts` and reachable on a booted
   server.
8. New test `tests/integration/portability.export.test.ts` asserts 1–6.
9. **Live verification required:** boot the dev server (`verify` skill), call
   `GET /api/portability/export/workflow/:id` with a real JWT, and attach the
   response headers plus the bundle's `manifest.json`. "It should work" is not
   evidence.
10. Gates: type-check 0 errors, lint clean on touched files, `npm run test:fast`
    green at ≥ baseline, `npm run test:integration` green for the new file.

---

## Phase 1 Gate

- [ ] IEX-4..IEX-7 all ✅ with dated verification notes
- [ ] `npm run type-check` → `Found 0 errors`; `npm run lint` → 0 problems
- [ ] `npm run test:fast` ≥ baseline; `npm run test:unit` green;
      `npm run test:integration` green for `portability.*`
- [ ] Reviewer has exported a real project bundle from the running app, unzipped
      it, and confirmed by hand: template `.docx` bytes present and openable,
      no secret values anywhere in the archive (`grep` the raw bundle)
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Single-object import (ask #3, write path)

The write path, and the phase with the highest blast radius: **a bundle is
untrusted input**. Everything here assumes a hostile or corrupt file until
proven otherwise.

Out of scope: tenant-wide import (Phase 3), overwrite/merge into an existing
object (backlog IEX-B2 — v1 always creates new).

**Dispatch order:** IEX-8 → IEX-9 → IEX-10 → IEX-11, strictly sequential.

## IEX-8 — ImportService dry-run: validate and preview, write nothing 🔲

**Priority: P1** · Size: M · File: `server/services/portability/ImportService.ts` (new)

### Finding

There is no import path at all (the only candidate, `WorkflowBundleService`, is
deleted in IEX-3). Importing directly on upload would be the wrong first move:
the user needs to know what a bundle will do before it does it, and a
validation pass is also the natural place to reject hostile input before any
write happens.

### Preferred fix

`ImportService.preview(buffer, userId, targetProjectId?)` — parse, validate,
report, **write nothing**. No transaction, no inserts.

It must:

1. Read the bundle via `bundleReader` (IEX-3), inheriting the bomb/traversal
   guards.
2. Reject `formatVersion` newer than current with a clear message.
3. **Zod-validate every entity row** against a per-entity schema derived from
   the descriptor's `fields`. Unknown columns are dropped, not passed through.
4. Detect collisions against the target tenant: workflow/project names,
   DataVault table slugs, step aliases.
5. Surface `manifest.requiresReentry[]` (IEX-6) as the secrets re-entry list.
6. Flag that the bundle contains **executable code** if it carries lifecycle
   hooks, document hooks, or transform blocks — importing a bundle imports
   someone else's JS/Python, and the user should be told before, not after.
7. Report missing blobs recorded in `manifest.warnings[]`.

Return a typed `ImportPreview` — counts per entity, collisions, re-entry list,
code-hook warning, blob warnings, and a computed `canProceed` flag.

### Ties

- **Depends on Phase 1 gate** (needs real bundles to test against — generate
  fixtures with `ExportService`).
- **IEX-9** consumes the validated shape; keep the Zod schemas exported.
- Load `add-api-endpoint`, `run-tests`. Read
  `docs/architecture/SECURITY_THREAT_MODEL.md`.

### Acceptance criteria

1. `preview()` performs zero writes — asserted by row counts before/after
   across all affected tables.
2. A bundle with a newer `formatVersion` is rejected with a distinct error.
3. A row with an unknown/extra column is accepted with that column **dropped**,
   not passed through.
4. A row failing its Zod schema is reported in the preview, not thrown as a 500.
5. Name/slug/alias collisions against the target tenant are listed.
6. A bundle containing lifecycle hooks, document hooks, or transform blocks
   sets the executable-code flag.
7. `requiresReentry` and blob warnings are surfaced from the manifest.
8. A truncated/corrupt zip is rejected cleanly, not as an unhandled exception.
9. New test `tests/unit-db/portability/importPreview.test.ts` asserts 1–8 using
   fixtures produced by `ExportService`.
10. Gates: type-check 0 errors, lint clean on touched files,
    `npm run test:fast` ≥ baseline, `npm run test:unit` green.

---

## IEX-9 — Import apply: clone-mode ID remapping and ownership rebinding 🔲

**Priority: P0** · Size: M · File: `server/services/portability/ImportService.ts`

### Finding

The actual write. Two hazards make this a P0 rather than a P1:

**Mass assignment.** A bundle is user-supplied JSON that maps onto database
rows. If `tenantId`, `ownerType`, `ownerUuid`, `role`, or `tenantRole` are
taken from the bundle, a client can craft a bundle that imports assets into
*another tenant* or escalates a role. This repo has an established history of
exactly this bug class — see `docs/architecture/SECURITY_THREAT_MODEL.md` and
the mass-assignment findings in the workflow-builder audit.

**ID collision.** Reusing bundle UUIDs on a system where they already exist
corrupts existing data.

### Preferred fix

`ImportService.apply(buffer, userId, options)` running the whole write in a
**single transaction** (mirror `WorkflowClonerService.copyProject`, which wraps
its entire walk in one `db.transaction`).

**Clone mode only in v1** — always mint fresh UUIDs, never reuse bundle ids.
Build an `idMap` as you insert, and remap in exactly the way the cloner already
does: direct FK columns from the map, and jsonb columns through
`remapJsonIds` (`WorkflowClonerService.ts:135`) driven by each descriptor's
`jsonRefs`. Export `remapJsonIds` from the cloner (or lift it into a shared
module) rather than writing a second copy of it — two implementations of UUID
rewriting *will* drift.

Restore mode (reuse original ids) is deliberately deferred to backlog IEX-B3.

**Ownership is always assigned server-side**, from the importing user's
context — `tenantId`, `ownerType`, `ownerUuid` from the resolved target, never
from the bundle. Mirror `WorkflowClonerService`'s `TargetOwner` resolution
(`:76`) and how it stamps `context.targetOwner.tenantId` on every insert
(e.g. `:938`, `:960`).

Insert in `parent`-dependency order from `ENTITY_GRAPH`. Enforce slug/alias
uniqueness the way the cloner does — see `ensureUniqueTableSlug`
(`WorkflowClonerService.ts:964`).

### Ties

- **Depends on IEX-8** (same file — sequence, do not parallelize).
- **IEX-10** adds blob restore into this same flow.
- **IEX-B3** (backlog) adds restore mode.
- Donor pattern for transaction shape, ID remapping, owner stamping, and slug
  uniqueness: `WorkflowClonerService.ts`. Read it before writing anything.
- Load `add-api-endpoint`, `run-tests`. Read
  `docs/architecture/SECURITY_THREAT_MODEL.md`.

### Acceptance criteria

1. Importing a bundle exported from workflow W creates a new workflow whose
   sections, steps, logic rules, blocks, transform blocks, and hooks match W's
   structure.
2. Every created row has a **new** UUID; no bundle UUID appears in the database
   after import.
3. jsonb columns declared in `jsonRefs` have their embedded UUIDs remapped —
   test with a logic rule referencing a step id inside `conditionValue`.
4. A bundle whose rows carry a **foreign** `tenantId`/`ownerUuid` imports with
   the *importing user's* tenant and owner; the foreign values appear nowhere
   in the database.
5. A bundle carrying `role: 'admin'` or `tenantRole` on any row does not
   change any user's role.
6. Any failure mid-import rolls back completely — a forced error after partial
   insert leaves zero new rows.
7. Slug/alias collisions are resolved (suffixed), not thrown, and not
   duplicated.
8. `remapJsonIds` has exactly one implementation in the codebase
   (`grep -c "function remapJsonIds"` → 1).
9. New test `tests/unit-db/portability/importApply.test.ts` asserts 1–8, with
   4 and 5 written as explicit hostile-bundle security tests.
10. Gates: type-check 0 errors, lint clean on touched files,
    `npm run test:fast` ≥ baseline, `npm run test:unit` green.

---

## IEX-10 — Blob restore: virus scanning, integrity, quota enforcement 🔲

**Priority: P0** · Size: M · Files: `server/services/portability/ImportService.ts`,
`server/services/portability/blobs.ts`

> **Amended 2026-07-27 after decision D-2.** Virus scanning was added and the
> ticket raised from P1/S to P0/M. Shawn's stated intent is that bundles move
> between *different clients* as working assets, so import is a real
> attacker-facing upload surface: "making sure we scan for abuse before uploads
> happen."

### Finding

IEX-9 imports template *rows*, whose `fileRef` values still point at the source
system's storage keys. Without restoring the bytes, imported templates are
broken in exactly the way IEX-5 fixed for export — and now on the receiving
side, where it is harder to notice.

Import is also where a client pushes arbitrary bytes into our storage, which
makes it the enforcement point for two controls that already exist elsewhere in
this codebase and must not be skipped here:

1. **Virus scanning.** Every other upload path in the app scans. See
   `server/routes/templates.routes.ts:295`:

   ```ts
   const scanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
   ```

   A bundle import that writes DOCX/PDF bytes to storage without scanning would
   be the **only** unscanned file-write path in the system — and the one most
   likely to carry a file authored by someone outside the receiving tenant.

2. **Storage quota.** `server/services/StorageQuotaService.ts:14`,
   `checkQuota(tenantId, incomingSize)`.

### Preferred fix

For each blob in `blobs/`:

1. Verify its sha256 matches its filename (integrity — catches corruption and
   tampering).
2. **Scan it** via `virusScanner().scan(buffer, filename)`, mirroring
   `templates.routes.ts:295`. Any infected blob **aborts the whole import** —
   do not import "the clean parts". Report which entity and column referenced
   it.
3. Write via `storageProvider.uploadFile`/`saveFile` and record the **new**
   `fileRef`. Rewrite the importing rows' `blobRefs` columns — a bundle-origin
   `fileRef` must never survive into the database.

Order matters: **quota check first** (`checkQuota(tenantId, totalBlobBytes)`),
then per-blob integrity, then scan, then write. Each gate must fail before any
bytes are written, so a rejected import leaves storage untouched.

A blob referenced by a row but absent from the bundle (the IEX-5 warning case)
must not abort the import: import the row, leave the `fileRef` unset, and
report it in the result. Absent ≠ malicious.

Deduplicate on the way in — one `blobs/` entry referenced by three rows is
scanned once, written once, and shared by all three refs.

The scanner is injectable (`setVirusScannerInstance` /
`resetVirusScannerInstance` at `server/services/security/VirusScanner.ts:151`),
so tests can plant a stub that reports infection without needing ClamAV.

### Ties

- **Depends on IEX-9** (same file — sequence).
- Mirror image of **IEX-5**; reuse the hashing helpers in `blobs.ts` rather
  than re-deriving them.
- Implements the scanning half of **decision D-2**; **IEX-8** covers the other
  half (surfacing executable code hooks in the preview).
- Donor for scanning: `server/routes/templates.routes.ts:295`. Donor interface:
  `server/services/security/VirusScanner.ts` (`IVirusScanner`, `virusScanner()`).
- Load `add-api-endpoint`, `run-tests`. Storage interface:
  `server/services/storage/types.ts`.

### Acceptance criteria

1. Importing a bundle with template blobs writes the bytes to storage and the
   imported rows' `fileRef` values resolve via `storageProvider.getFile` to
   byte-identical content.
2. No bundle-origin `fileRef` string remains in the database after import.
3. **Every blob is scanned before it is written.** Asserted with an injected
   stub scanner that records each call — call count must equal the number of
   *unique* blobs.
4. **An infected blob aborts the entire import**: no rows created, no bytes
   written, and the error names the referencing entity and column.
5. A blob whose content does not match its sha256 filename aborts the import
   with a distinct error (different from the infection error).
6. Exceeding the tenant's storage quota aborts **before** any blob is written
   or scanned — asserted by checking storage is unchanged and the scanner was
   never called.
7. A row referencing a blob absent from the bundle imports successfully with
   the ref unset and a warning in the result — and does **not** trigger the
   infection path.
8. One `blobs/` entry referenced by three rows results in one stored object and
   exactly one scan call.
9. New tests in `tests/unit-db/portability/importBlobs.test.ts` assert 1–8,
   using `setVirusScannerInstance` to plant clean and infected stubs.
10. Gates: type-check 0 errors, lint clean on touched files,
    `npm run test:fast` ≥ baseline, `npm run test:unit` green.

---

## IEX-11 — Import routes: upload, preview, apply 🔲

**Priority: P1** · Size: S · File: `server/routes/portability.routes.ts`

### Finding

`ImportService` has no HTTP surface. Import needs a two-step interaction —
preview then confirm — so it cannot be a single POST.

### Preferred fix

Add to the file IEX-7 created:

```
POST /api/portability/import/preview   (multipart upload → ImportPreview)
POST /api/portability/import/apply     (multipart upload + confirmed options)
```

Reuse the existing multipart/upload middleware — find how
`server/routes/templates.routes.ts` handles `.docx` uploads and mirror it,
including its size cap. Do not add a second upload library.

Audit-log every **apply** (not previews) with actor, tenant, entity counts, and
the resulting root id.

Rate-limit both, reusing the IEX-7 middleware.

### Ties

- **Depends on IEX-8, IEX-9, IEX-10.** Same file as **IEX-7** — sequence.
- Donor pattern for multipart upload + size cap:
  `server/routes/templates.routes.ts`.
- Load `add-api-endpoint`.

### Acceptance criteria

1. `POST /import/preview` with a valid bundle returns the `ImportPreview` JSON
   and performs zero writes.
2. `POST /import/apply` creates the objects and returns the new root id.
3. Unauthenticated → 401; user without write access to the target project →
   403 via `classifyRouteError`.
4. Non-zip / corrupt upload → 400 with a useful message, never a 500.
5. Upload exceeding the size cap → 413.
6. Each successful apply writes exactly one `audit_logs` row; previews write
   none.
7. New test `tests/integration/portability.import.test.ts` asserts 1–6.
8. **Live verification required:** on the running dev server, export a real
   workflow (IEX-7), import it back via preview → apply, open the resulting
   workflow in the builder, and attach a screenshot showing its sections and
   steps intact.
9. Gates: type-check 0 errors, lint clean on touched files,
   `npm run test:fast` ≥ baseline, `npm run test:integration` green for
   `portability.*`.

---

## Phase 2 Gate

- [ ] IEX-8..IEX-11 all ✅ with dated verification notes
- [ ] `npm run type-check` → `Found 0 errors`; `npm run lint` → 0 problems
- [ ] Full `npm run test:unit` and `npm run test:integration` green
- [ ] Reviewer has completed a **round trip on the live app**: export a project
      with templates + DataVault data, import it, and confirm the imported copy
      runs end-to-end (a run completes and generates a document)
- [ ] Reviewer has confirmed the hostile-bundle tests (IEX-9 AC 4 and 5) fail
      when the server-side ownership stamping is deliberately removed
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Client-wide export/import (ask #2) 🔲

**Unblocked by decisions D-1 and D-3 (2026-07-27).** Scope is settled:
structure + DataVault reference data, **no run history**; `export_jobs` table
approved. To be ticketed in full detail at the Phase 2 gate, once the format has
been proven end-to-end on single objects — writing them earlier would mean
re-verifying every `file:line` after Phases 0–2 move the code.

Intended shape:

- **IEX-12** — `export_jobs` table + migration + async job runner. Client-wide
  exports cannot be request/response; a tenant with real data will exceed any
  sane HTTP timeout. Artifact stored via the `files` table with a short-lived,
  single-use download URL. **This is the only migration in the initiative —
  load `db-schema-change`.**
- **IEX-13** — tenant-scope root for `ExportService`/`ImportService`. Mostly a
  new `scopes: ['tenant']` walk over the same `ENTITY_GRAPH` — the reason
  Phase 0 was built first. Must honour D-1: run history excluded.
- **IEX-14** — client-facing UI: request export, poll status, download; upload
  → preview → confirm for import. **Load the `design` skill** (global CLAUDE.md
  requires it for any UI work).

---

# Phase 4 — Admin multi-tenant archive (ask #1) 🔲

**Unblocked by decision D-4 (2026-07-27), with its shape changed.** This is
**not** the disaster-recovery mechanism — DR is Neon PITR + scheduled
`pg_dump` (tracked as IEX-B7, outside this initiative). Phase 4 is a
portability and tenant-extraction tool.

Per Shawn's added requirement, the operator **selects which tenants to
export — all of them, or an arbitrary subset**. A blind global "export
everything" button is explicitly not what is wanted.

Intended shape:

- **IEX-15** — admin endpoint under `/api/admin/` behind the existing `isAdmin`
  middleware (donor: `server/routes/admin.routes.ts:40`) that accepts a
  **tenant id list** (or an explicit "all" flag) and enqueues one `export_jobs`
  row per selected tenant. Per-tenant jobs, not one giant job — so one bad
  tenant cannot fail the batch, and partial results are still usable.
- **IEX-16** — admin UI: tenant multi-select with select-all, per-tenant job
  status, and per-tenant download. **Load the `design` skill.**
- **IEX-17** — optional scheduled run over a saved tenant selection, plus a
  retention policy for generated archives, plus the global-tables archive
  (tenants, users, orgs, memberships — credentials excluded per IEX-1).
- **IEX-18** — admin restore path, clone mode only, behind an explicit
  typed confirmation. Restore-into-existing is deliberately excluded (IEX-B2).

---

# Backlog / observations

Not phase-gated. Re-verify `file:line` evidence before promoting any of these
to a ticket — lines will have drifted.

- **IEX-B1 — Re-point `WorkflowClonerService` at the portability engine.**
  Once export/import are proven, `copyProject`/`copyWorkflow` become
  export-to-memory + import-with-new-ids, retiring ~1 000 lines and collapsing
  two entity graphs into one so they cannot drift. **Size L — recommend its own
  initiative**, not a ticket here (decision D-5).
- **IEX-B2 — Import into an existing object (merge/overwrite).** v1 always
  creates new. Merge semantics (match by alias? by id? what wins?) is a design
  question, not an implementation one.
- **IEX-B3 — Restore mode (reuse original UUIDs).** Needed for true
  same-system recovery and for preserving deep links and portal tokens. Depends
  on a conflict policy that v1 deliberately avoids.
- **IEX-B4 — Passphrase-wrapped secrets sidecar.** Would make true cross-system
  DR possible without exporting `VL_MASTER_KEY`: re-wrap secret values under a
  client-supplied passphrase (scrypt + AES-GCM) at export, unwrap at import.
  Opt-in only. Depends on D-2 staying as recommended.
- **IEX-B5 — `getTemplateFilePath` assumes disk storage.**
  `server/services/templateFiles.ts:17` builds a local path unconditionally and
  admits it: `// Legacy support: We assume disk storage provider structure for
  now.` Unrelated to portability but will bite when `STORAGE_DRIVER=s3`.
- **IEX-B6 — Two parallel file subsystems.** The `files` table +
  `FileStorageService` versus `storageProvider` + bare `fileRef` strings are
  independent and inconsistent (see IEX-5 Finding). Worth unifying; out of
  scope here.
- **IEX-B8 — True per-entry streaming on the read path.** `bundleReader`
  buffers a whole `entities/*.jsonl` entry before line-streaming it, because
  adm-zip exposes no per-entry read stream. Harmless at single-object scope,
  but a tenant-scope `datavault_values` export will not fit. Needs a different
  zip library (`yauzl`/`unzipper`) on the read side — revisit at Phase 3.
- **IEX-B9 — `audit_logs` is declared twice.** `auditLogs` is defined as a
  `pgTable("audit_logs", …)` in **both** `shared/schema/auth.ts` and
  `shared/schema/relations.ts`, and both are re-exported by the barrel, so
  which one wins is a resolution accident. Pre-existing, unrelated to
  portability, found while auditing table coverage. Should be one definition.
- **IEX-B7 — Actual disaster recovery: Neon PITR + scheduled `pg_dump`.**
  Per decision D-4 this, not Phase 4, is the backup/restore story. Largely a
  config and ops task (retention, destination bucket, restore rehearsal) rather
  than a build, which is why it sits outside this initiative — but it should be
  tracked somewhere, and right now it is not.

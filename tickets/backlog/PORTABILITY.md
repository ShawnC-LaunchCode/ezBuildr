# Backlog detail — Portability, import/export (IEX / IEX2 / IEX3)

Full text for the `IEX-*` entries indexed in [`../BACKLOG.md`](../BACKLOG.md),
plus the **standing decisions** rounds 1 and 2 ruled on. **Read this file only
when promoting an entry, or when a portability ticket needs a settled ruling.**

**All three rounds are closed. There is no active portability ticket file.**

Rounds 1, 2 and 3 are closed:

- **Round 1 (IEX-1..15)** built the engine: entity graph, allowlist, bundle
  format, single-object export and import. Closed 2026-07-31.
- **Round 2 (IEX2-1..15, IEX2-17)** audited what it did on realistic data and
  hardened it. Grade at audit time **D+**. Closed and pushed `be22f778`,
  2026-07-31. Baselines at close: `test:fast` 155 files / 2053 tests,
  portability unit-db 74 tests across 7 files, portability integration 25 tests
  across 3 files.
- **Round 3 (IEX3-1..11)** made the bundle complete and honest, then gave it a
  UI: reference-driven workflow-scope export, config-embedded reference
  reporting, round-trip fidelity for all 37 step types, the pre-download
  disclosure dialog and the import preview → apply screen. Closed 2026-08-02,
  pushed through `59dd30c5`. Baselines at close: `test:fast` 181 files / 2313
  tests, portability unit-db 136 tests across 14 files, portability integration
  40 tests across 4 files.

```bash
git log -p -- tickets/IMPORT_EXPORT_TICKETS.md     # round 1
git log -p -- tickets/IMPORT_EXPORT_2_TICKETS.md   # round 2
git log -p -- tickets/IMPORT_EXPORT_3_TICKETS.md   # round 3
```

---

## IEX-D7 — Replace `adm-zip` on the read side · `needs-initiative`

> **Ruled 2026-07-29:** *"deal, lets do that"* — a separate initiative,
> sequenced immediately before Phase 3.

**This is one item that was tracked in three places** — as round 1's `IEX-B8`,
round 2's `D-7`, and round 3's `IEX3-B4`. Consolidated here 2026-08-02; treat
any of those three IDs as pointing at this entry.

`IEX2-10` shipped the buffering fixes this codebase controls. The library swap
still waits: `bundleReader` buffers a whole `entities/*.jsonl` entry before
line-streaming it, because **adm-zip exposes no per-entry read stream** and
builds archives in memory to write them. A genuinely streaming implementation
means changing the library (`yauzl` / `unzipper` on the read side), not the call
sites.

Harmless at single-object scope. A tenant-scope `datavault_values` export will
not fit in memory — which is why this is sequenced **before** Phase 3, not
after.

**Next step:** its own initiative when Phase 3 is picked up.

---

## IEX-B1 — Re-point `WorkflowClonerService` at the portability engine · `needs-initiative`

Once export/import are proven, `copyProject`/`copyWorkflow` become
export-to-memory + import-with-new-ids, retiring **~1 000 lines** and collapsing
two entity graphs into one so they cannot drift.

**Size L — its own initiative**, not a ticket (decision D-5). Revisit once
round 3 has proven the format on real data.

**Next step:** blocked on round 3 closing. Note `WorkflowClonerService.ts` is
under concurrent edit as of 2026-08-02 — re-read before scoping.

---

## IEX-B2 — Import into an existing object (merge / overwrite) · `product-decision`

v1 always creates new. Merge semantics — match by alias? by id? what wins on
conflict? — is a **design question, not an implementation one**.

Deliberately excluded from the admin restore path too (see the Phase 4 outline).

**Next step:** Shawn rules on match key and conflict policy before any ticket.

---

## IEX-B3 — Restore mode (reuse original UUIDs) · `product-decision`

Needed for true same-system recovery and for preserving deep links and portal
tokens, both of which break when every id is freshly minted.

Depends on a conflict policy that v1 deliberately avoids — so it is blocked
behind **IEX-B2**, not independent of it.

**Next step:** resolve IEX-B2 first.

---

## IEX-B4 — Passphrase-wrapped secrets sidecar · `product-decision`

Would make true cross-system DR possible **without exporting `VL_MASTER_KEY`**:
re-wrap secret values under a client-supplied passphrase (scrypt + AES-GCM) at
export, unwrap at import. Opt-in only.

Depends on **D-2 staying as recommended** (shape-only secrets). If D-2 is ever
revisited this entry changes shape or dies with it.

**Next step:** only worth designing if a customer actually asks for cross-system
secret portability; today `requiresReentry[]` covers the need.

---

## IEX-B7 — Actual disaster recovery: Neon PITR + scheduled `pg_dump` · `operational`

Per **decision D-4** this — not the admin archive — is the backup/restore story.

Largely a config and ops task: retention, destination bucket, restore rehearsal.
Not a build, which is why it sits outside every portability initiative. **But it
should be tracked somewhere, and until now it was not.**

**Next step:** Shawn's call; an ops task, no dev dispatch.

---

## Phase 3 outline — Client-wide export/import (ask #2) · `needs-initiative`

**Unblocked by decisions D-1 and D-3.** Scope is settled: structure + DataVault
reference data, **no run history**; `export_jobs` table approved.

⚠️ **The ticket IDs in the original outline were `IEX-12..14`, which collide with
the round-1 Phase 2 tickets that actually shipped under those numbers.** The
outline below is deliberately unnumbered. Number it fresh when it is carved.

Intended shape:

- **`export_jobs` table + migration + async job runner.** Client-wide exports
  cannot be request/response; a tenant with real data will exceed any sane HTTP
  timeout. Artifact stored via the `files` table with a short-lived, single-use
  download URL. **This is the only migration — load `db-schema-change`.**
- **Tenant-scope root for `ExportService`/`ImportService`.** Mostly a new
  `scopes: ['tenant']` walk over the same `ENTITY_GRAPH` — the reason Phase 0
  was built first. Must honour D-1: run history excluded.
- **Client-facing UI:** request export, poll status, download; upload → preview
  → confirm for import. **Load the `design` skill.** Note round 3's IEX3-4 and
  IEX3-5 build the single-object version of exactly this surface — extend it,
  do not build a second one.

**Sequenced after IEX-D7** — a tenant-scope export will not fit in memory under
adm-zip.

---

## Phase 4 outline — Admin multi-tenant archive (ask #1) · `needs-initiative`

**Unblocked by decision D-4, with its shape changed.** This is **not** the
disaster-recovery mechanism — DR is IEX-B7. Phase 4 is a portability and
tenant-extraction tool.

Per Shawn's added requirement, the operator **selects which tenants to export —
all of them, or an arbitrary subset**. A blind global "export everything" button
is explicitly not what is wanted.

Same ID caveat as Phase 3: the original outline used `IEX-15..18`, which collide
with shipped tickets. Renumber when carved.

Intended shape:

- **Admin endpoint** under `/api/admin/` behind the existing `isAdmin`
  middleware (donor: `server/routes/admin.routes.ts`) accepting a **tenant id
  list** or an explicit "all" flag, enqueuing one `export_jobs` row **per
  selected tenant**. Per-tenant jobs, not one giant job — so one bad tenant
  cannot fail the batch and partial results stay usable.
- **Admin UI:** tenant multi-select with select-all, per-tenant job status,
  per-tenant download. **Load the `design` skill.**
- **Optional scheduled run** over a saved tenant selection, plus a retention
  policy for generated archives, plus the global-tables archive (tenants, users,
  orgs, memberships — credentials excluded per IEX-1).
- **Admin restore path, clone mode only**, behind an explicit typed
  confirmation. Restore-into-existing is deliberately excluded (IEX-B2).

**Sequenced after Phase 3.**

---

# Standing decisions — RULED by Shawn, 2026-07-27

These govern any portability work, including round 3. **Do not re-litigate.**

- **D-1 — Run history in a client-wide bundle? → NO.** Bundles carry structure +
  reference data (DataVault rows) only. `workflow_runs`, `step_values` and
  execution traces stay out. If added later it must be behind an explicit
  `includeRunHistory` flag, default off, with its own retention and redaction
  review. Rationale: highest-volume and most PII-dense data in the system, and
  the least useful for the stated goal of rebuilding structure.

- **D-2 — Secrets posture → shape-only.** Export `key`, `type`, `environment`,
  `metadata`; never `value`/`valueEnc`, never `connections.authConfig` /
  `oauthState`. Ciphertext is bound to `VL_MASTER_KEY`
  (`server/utils/encryption.ts`) — useless to the client and a key-compromise
  amplifier for us.

  **Shawn's intent, which widens the requirement:** the bundle is meant to be a
  genuinely portable, *working* asset, not just an archive.

  1. A user can upload a bundle and **own the result themselves**, then use the
     existing transfer flow (`server/services/TransferService.ts`) to move it to
     an org later. Ownership is always assigned from the importing user's
     context — a stated product requirement, not an implementation detail.
  2. A bundle can be handed to a **different client**, who imports it and gets a
     working copy. Deliberate flexibility for the developers.
  3. **Because of 1 and 2, uploads are a hostile-input surface with real
     traffic.** Bundles carry both binaries (DOCX/PDF templates) and executable
     code (lifecycle hooks, document hooks, transform blocks). Scanning is
     mandatory, not best-effort.

- **D-3 — `export_jobs` table → APPROVED.** Minimal shape: id, tenant_id,
  requested_by, scope, status, options jsonb, file_ref, error, timestamps. Reuse
  `files` for the artifact. The one part of the initiative that needs a
  migration — load `db-schema-change` for it.

- **D-4 — Admin export is NOT the DR mechanism.** Shawn: *"you talked me out of
  DR, but to use pg_dump."* DR stays on Neon PITR + scheduled `pg_dump` to
  object storage — tracked as **IEX-B7**. The admin surface must support
  selecting **which** tenants to export.

- **D-5 — Re-pointing the cloner at the new engine is Size L → its own
  initiative.** Filed as **IEX-B1**.

- **D-7** — see the IEX-D7 entry above.

---

# Round 3 leftovers (IEX3)

Everything round 3 filed and did not do. Its two genuinely dispatchable items
(`IEX3-B5`, and `IEX3-B6`/`B7`) were **fixed at the retire** rather than parked —
see the closed table below.

## IEX3-B1 — List field aliases are outside collision detection · `enhancement`

`ImportService.processEntityStream()` keys the duplicate-alias check on
`` `${data['workflowId']}::${data['alias']}` `` — the step's own alias column
only. It never descends into `steps.config.fields[].alias`, so two List fields
sharing an alias import without being flagged.

Low impact: List field aliases are item-scoped, so a collision inside one List
does not corrupt anything outside it. Cheap to fix now that
`collectConfigEntityRefs` exists — the same walk, keyed on `alias` instead of
the reference keys. Verified still true 2026-08-02 (`ImportService.ts`, the
`extracted.stepAliases.has(scopeKey)` branch).

## IEX3-B2 — `remapJsonIds` never remaps object *keys* · `informational`

Its docblock is explicit that it rewrites string *values* only. Nothing in the
schema currently uses id-keyed jsonb, so there is nothing to fix — this is
recorded so a future audit does not re-file it as a finding. **Re-check when a
new jsonb column is added that could be keyed by entity id.** If one ever is,
the fix belongs in the caller, not in `remapJsonIds`: it is the one shared
implementation for three callers (DEBT-12).

## IEX3-B3 — a `.ezb` has no human-readable file · `enhancement`

The bundle is a zip of `manifest.json` + JSONL, readable only by this app.
A short generated `README.txt` at the root — what this is, which app made it,
what was deliberately excluded, what must be re-entered — would make the
artifact self-describing for anyone who receives one without the UI.

Pairs naturally with the disclosure work: `EXCLUSION_CATEGORIES` and
`manifest.requiresReentry` are already the exact prose this file would need, so
it is mostly assembly. Depends on nothing.

---

## Closed / withdrawn — do not re-file

| Entry | Resolution |
|---|---|
| IEX-B0 — `connections.defaultHeaders` exported verbatim | Promoted to ticket IEX-6B, shipped |
| IEX-B5 — `getTemplateFilePath` assumes disk storage | Closed by **DEBT-5** (`f308fde2` + `50408c33`) |
| IEX-B6 — two parallel file subsystems | Closed by **DEBT-6** (`058530b0`) |
| IEX-B8 — per-entry streaming on the read path | Same item as **IEX-D7**; merged 2026-08-02 |
| IEX-B9 — `audit_logs` declared twice | **WITHDRAWN 2026-07-28 — the finding was wrong.** There is exactly one `pgTable("audit_logs", …)`, in `shared/schema/auth.ts`. The duplicate scan matched a *comment* in `shared/schema/relations.ts` quoting the declaration in backticks. The same unanchored regex was in `schemaCoverage.test.ts`; it is now anchored to `^export const` |
| IEX2-16 — minimal export/import UI | **Superseded** by IEX3-4 + IEX3-5, which build the real surface. The 2026-07-29 *"dont worry about UI yet"* ruling is spent — its precondition (Phases A–C committed, round trip working on real data) was met |
| IEX3-1 — workflow-scope export omits entities its own rows require | Shipped `fef6e4fa`. Reference-driven selection for templates and DataVault, `dropIfUnresolved`, import-side re-parenting |
| IEX3-2 — entity ids embedded in jsonb never checked | Shipped `e84bbe62`. `shared/types/stepConfigRefs.ts` + import-side reporting |
| IEX3-3 — round-trip coverage per question type | Shipped `e6d49dbf`. All 37 `stepTypeEnum` values, `SKIPPED` empty; the coverage test gates `add-step-type` |
| IEX3-4 — export UI with pre-download disclosure | Shipped `f495a1af`. Manifest dry-run route + dialog; `EXCLUSION_CATEGORIES` test-locked to `EXCLUDED_TABLES` |
| IEX3-5 — import UI: upload → preview → apply | Shipped `34d58a0b`. `/workflows/import`, shared `portability/disclosure.tsx` |
| IEX3-6 — visual confirmation in the builder | Closed 2026-08-02. Also closed round 1's IEX-11 AC 8 |
| IEX3-7 — `secrets.valueEnc` NOT NULL broke every project import | Shipped `1588f1dc`. `withheldColumns` on the descriptor |
| IEX3-8 — the import screen's "Rename" field did nothing | Shipped `82bd6019`. `applyOptionsSchema` allowlisted `name`; `apply` never read it |
| IEX3-9 — `adjustments` never left the server | Shipped `e086ca15`. Route returns it, result screen renders it |
| IEX3-10 — export disclosure discarded all non-`secret_scan` warnings | Shipped `1309be1c`. Causes rendered, knock-on row drops counted |
| IEX3-11 — AC 6 focus, collision copy, dead `WARNING_ICONS` | Shipped `59dd30c5` |
| IEX3-B4 — replace `adm-zip` on the read side | Same item as **IEX-D7**; merged 2026-08-02. Track it there |
| IEX3-B5 — DataVault bound only from a step config did not travel | **Fixed at the round-3 retire.** `ExportService.collectConfigDatabaseIds` feeds `collectConfigEntityRefs` into the export's reference collection, resolving table→database and column→table→database. Covers `blocks.config` too, so the same gap could not reopen one entity over |
| IEX3-B6 — the verification harness deleted the evidence it printed | **Fixed at the round-3 retire.** `PORTABILITY_VERIFY_KEEP=1` skips teardown and prints the cleanup SQL |
| IEX3-B7 — the harness could not run against a stock `npm run dev` | **Fixed at the round-3 retire.** It no longer touches `POST /api/auth/register` (fail-closed public signup, 403); it creates the user and credentials directly and still proves them against the real login route. Also fixed a latent DB-init race the old ordering hid |

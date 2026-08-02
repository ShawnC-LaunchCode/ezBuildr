# Portability Round 3 — reachability, question-type fidelity (IEX3-1..5 + backlog)

Source: senior audit of the shipped portability engine, **2026-08-02**, framed
by the repo owner's brief: *"they should give an end user access to download
their workflows in a way to give them confidence in data security. A dev could
import some workflow he has used before and use it as a baseline for something
similar. Make sure it supports the different question types, esp. the recently
touched list items."*

Scope: `server/services/portability/**`, `server/routes/portability.routes.ts`,
`server/utils/remapJsonIds.ts`, the `steps.config` shapes in
`shared/types/stepConfigs.ts`, the portability test suites, and the entire
`client/src/` tree (searched for any export/import surface).

Overall grade at audit time: **C**. The engine's *security* posture is the
strongest part of the feature and is close to done (see "What is already
right"). Its **completeness** is not: a workflow-scope export — the exact
artifact the brief describes a dev reusing as a baseline — hard-fails on import
for any workflow that produces a document, and silently loses DataVault
bindings for any choice question, including ones nested in a List. And none of
it is reachable: there is no user interface of any kind.

Every finding below was reproduced live against the running app on the test
database (see each ticket's evidence block). **Line numbers are advisory** —
they were accurate when written and drift as fixes land. The locator is the
quoted code and the named symbol; grep for those. A stale line number is not a
broken ticket and does not need re-issuing.

---

## What is already right — do not "fix" these

Recorded so a dev does not burn a turn re-litigating settled design:

- `secrets.value` is **not in the export field list at all**
  (`entityGraph.ts`, `name: 'secrets'` → `fields`), so secret material never
  reaches a bundle. `connections.defaultHeaders` is blanked by `redactPaths`.
- `manifest.requiresReentry[]` names every secret and connection that was
  withheld, so the importing side knows what it must re-enter.
- `scanForSecrets()` in `redaction.ts` flags pasted credentials in hook and
  transform code, deliberately *without* quoting the match into the manifest.
- Publish state is reset on import — `isPublic = false`, `publicLink = null`,
  `slug = null` (`ImportService.ts`, in the entity-adjustment path around
  `data['publicLink'] = null`). An imported copy cannot inherit a live public
  URL.
- `EXCLUDED_TABLES` is a 70+ entry allowlist-by-omission covering ACLs, users,
  tokens, MFA, sessions, billing and all run data, each with a stated reason.
- Exports and applies are audit-logged with actor, IP and user-agent.

The gap is not the posture. It is that **none of it is visible to the person
clicking download** — it lives in `manifest.json` inside the zip.

**Rounds 1 and 2 also left five standing decisions (`D-1`..`D-5`) that govern
this work** — run history excluded from bundles, shape-only secrets, the
`export_jobs` table, DR being `pg_dump` rather than the admin archive, and the
cloner rewrite being its own initiative. They are recorded in
`tickets/backlog/PORTABILITY.md`. **Read them before ruling on anything
portability-shaped; do not re-litigate them.**

---

## How to work this document

- **Tickets are grouped into 2 phases**, ordered by risk and dependency. Do not
  start Phase 2 until the **Phase 1 Gate** has been verified and committed by
  the reviewer.
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and **Acceptance
  criteria** (all must pass).
- Repo rules that apply to every ticket here:
  - Load the **`run-tests`** skill before running anything. `npm test` naively
    gives wrong results — the suite is three Vitest projects with separate
    commands and DB setup.
  - Any change under `server/routes/`, `server/services/` or
    `server/repositories/` → load **`add-api-endpoint`** first.
  - Any UI work → load the **`design`** skill first (the repo owner's global
    instruction: *"always use the design skill anytime you are changing the
    UI"*).
  - DB-backed suites must not run concurrently with another agent's — schemas
    are per-worker, not per-process, and two runs clobber each other into
    dozens of fake failures.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review) ·
  ⏸️ Deferred

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | The bundle must be complete and honest | IEX3-1..3 | ~2 days |
| 2 | Make it reachable, with the security story in front of the user | IEX3-4..5 | ~3 days |
| — | Carried forward from round 1, not phase-gated | IEX3-6 | ~1 hour |
| Backlog | Not phase-gated | IEX3-B1..B4 | |

### Ticket index

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| IEX3-1 | Workflow-scope export omits entities its own rows require | P0 | L | ✅ |
| IEX3-2 | Entity ids embedded in jsonb are never checked or reported | P0 | M | ✅ |
| IEX3-3 | Round-trip coverage for every question type, including List | P1 | M | 🔲 |
| IEX3-4 | Export UI with a pre-download disclosure of what travels | P1 | L | 🔲 |
| IEX3-5 | Import UI: upload → preview → apply | P1 | L | 🔲 |
| IEX3-6 | Visual confirmation of an imported workflow in the builder | P2 | S | 🔲 |

---

# Carried forward — not phase-gated

## IEX3-6 — Visual confirmation of an imported workflow in the builder 🔲

**Priority: P2** · Size: S · Files: **none — this ticket changes no code**

> **Carried from round 1 as `IEX-14` on 2026-08-02**, unchanged in substance,
> when the round-1 ticket file was retired. It closes the one outstanding
> acceptance criterion in round 1's Phase 2: IEX-11 AC 8 asked for a screenshot
> of an imported workflow open in the builder. Everything else in that AC was
> verified live and is recorded in IEX-11's verification block; the screenshot
> could not be captured because the reviewing session had no browser tooling.
>
> **Not blocked by anything in this file** — it can be dispatched today, in
> parallel with Phase 1. It is listed here rather than in `BACKLOG.md` because
> it is a real, ready, dispatchable ticket, not a parked observation.

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

The original blocker — a reviewing session without a working browser surface —
is **no longer absolute**. A dev proved on 2026-08-01 that a live drive-through
is achievable by running its own dev server on a spare port and capturing DOM
evidence instead of pixels. Take that route if the browser pane is unavailable,
and say which route you took.

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
   screenshot. Note this is now also a regression check on IEX3-1, which changed
   what a workflow-scope export carries.

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

- Closes round 1's **IEX-11** AC 8. IEX-11 is otherwise ✅ and already pushed.
- Load the `verify` skill (`.claude/skills/verify`) — it documents booting the
  app and the local-auth workaround.
- The harness is `scripts/verifyPortabilityRoundTrip.ts`. Read its header
  comment before running.
- Gotcha already paid for: `POST /api/auth/register` does **not** assign a
  tenant, and every subsequent API call 400s with
  `"User does not have a tenant assigned"`. The harness does that bootstrap for
  you — do not re-derive it.
- Second gotcha, paid for on 2026-07-28: `POST /api/auth/register` leaves
  `users.emailVerified` false, and the UI login path rejects that with
  `EmailNotVerifiedError` (403) at `server/routes/auth.routes.ts`. A bearer
  token from `/register` works fine against the API, which is why the reviewer
  never hit it — the whole IEX-11 verification went through the API path. **The
  harness now sets `emailVerified: true` during bootstrap and proves the
  credentials on the real login endpoint**, printing `UI login path OK (HTTP
  200)` before it prints them.
- Note the source workflow legitimately has **two** sections: creating a
  workflow via the API seeds a default `Section 1` alongside
  `Applicant Details`. Two sections is correct, not a bug.
- File footprint: **none.** Collides with nothing; safe to run alongside any
  other ticket. It does occupy port 5000 — coordinate if another session has
  the dev server up.

### Acceptance criteria

1. `scripts/verifyPortabilityRoundTrip.ts` runs against the dev server and
   prints `RESULT: PASS` **and** `UI login path OK (HTTP 200)`. Paste its full
   output.
2. A screenshot of the **imported** workflow open in the builder, showing the
   `Applicant Details` section containing `Full name` and `Email address`. If
   the browser pane cannot produce pixels, DOM evidence from your own dev server
   is an accepted substitute — state which you used.
3. The same evidence for the **source** workflow, for comparison.
4. The two workflows are confirmed to have **different** ids (visible in the
   URLs).
5. Browser-console output for the imported workflow is reported — either "no
   errors" or the errors verbatim.
6. No files are modified. `git status` at the end shows a clean tree **for the
   files this ticket touches** (others may be dirty — the repo owner works this
   repo from a second IDE). If you believe a code change is needed, **stop and
   report it** rather than making it — that is a new finding, not this ticket.

---

# Phase 1 — The bundle must be complete and honest

A bundle is either a faithful copy of the thing the user asked for, or it is a
liability. Today a workflow-scope bundle is neither: it can be structurally
un-importable, and when it does import it can quietly drop bindings without
saying so. Phase 1 fixes the engine. No UI work belongs in this phase.

## IEX3-1 — Workflow-scope export omits entities its own rows require ✅

> **Verification pass — 2026-08-02.** All 8 acceptance criteria met.
>
> Gates: `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 errors/0 warnings;
> `npm run check:strict-zones` → 6 zones, 11 files, all passed;
> `npm run test:fast` → **177 files / 2279 passed**, 14 skipped (was 2277);
> `unit-db` → **11 files / 124 passed**; portability integration →
> **3 files / 31 passed** (round-2 baseline was 25).
>
> Each of the 8 new tests was run against the pre-fix tree (production files
> reverted to HEAD, tests kept) and **all 8 failed** — 2 in
> `entityGraph.test.ts`, 6 across the two integration files. Sample:
> `templates is reachable from the 'workflow' root but does not declare that
> scope`, and `AssertionError: expected [] to deeply equal [ Array(1) ]` on the
> template-carrying bundle.
>
> **AC 4 ruling (the question escalated at audit time):** a referenced database
> travels *if the caller has `edit` on it*, and is otherwise omitted with a
> manifest warning while its referencing rows are dropped. Reason: IEX2-17
> already settled that exporting a database requires edit on that database, and
> without that gate a user with edit on one workflow could exfiltrate a
> tenant-wide DataVault by pointing a question at it. Templates are *not*
> ACL-gated beyond workflow-edit — a workflow's own templates are the documents
> it exists to produce.
>
> **Two deviations from the Preferred fix, both forced by facts the audit
> missed:**
> 1. The ticket said to collect template ids *while streaming*
>    `workflow_templates` and reorder ENTITY_GRAPH so it precedes `templates`.
>    That would have broken import: `ImportService.apply` Pass 2 inserts in
>    ENTITY_GRAPH order inside one transaction, so `workflow_templates` before
>    `templates` violates the `templateId` FK. Collection is instead a
>    **pre-pass** (`ExportService.collectWorkflowRefs`) that runs before the
>    descriptor loop, leaving graph order untouched.
> 2. The fix required an unforeseen **import-side** change. `templates.projectId`
>    is also NOT NULL and its project never travels in workflow scope, so the
>    first green export still failed preview with `Unresolvable reference:
>    templates.projectId`. Templates now go through the same re-parenting path
>    as `workflows.projectId` (`REPARENTED_PROJECT_ENTITIES`), and when no target
>    project can be resolved the template is skipped with a warning and its
>    dependent rows skip with it (`skippedOldIds`) rather than violating a FK.
>
> Beyond the ticket: added a generic `dropIfUnresolved` guard to
> `EntityDescriptor` so **no** bundle can ship a NOT NULL ref whose target did
> not travel, plus two unit tests pinning the ordering invariant it depends on.
> Both pre-existing graph-reachability invariant tests
> (`entityGraph.test.ts`, `exportService.test.ts`) were updated rather than
> weakened — they now model reference-bounded selection as a third legitimate
> way to bound a descriptor, with the exemption named explicitly.
>
> Not done live in the browser: this ticket has no UI surface. The live proof is
> the integration round trip against the running app (real JWT, real
> export→preview→apply over HTTP), which is what the Phase 1 Gate's
> drive-through item will extend once IEX3-2 and IEX3-3 land.

**Priority: P0 (bug)** · Size: L · File: `server/services/portability/entityGraph.ts`, `server/services/portability/ExportService.ts`

### Finding

`ENTITY_GRAPH` declares `templates` and `template_versions` as project-only,
while `workflow_templates` — which has a **NOT NULL** FK to `templates` — is in
both scopes:

```ts
  {
    table: schema.templates,
    name: 'templates',
    scopes: ["project"],            // <-- not in workflow scope
    ...
  },
  {
    table: schema.workflowTemplates,
    name: 'workflow_templates',
    scopes: ["project","workflow"], // <-- but this is
    parent: {"name":"workflow_versions","fk":"workflowVersionId"},
    fields: ["id","workflowVersionId","templateId","key","isPrimary"],
    refs: ["workflowVersionId", "templateId"],
  },
```

`ExportService.exportToFile()` filters purely on that flag —
`if (!descriptor.scopes.includes(root.scope)) { continue; }` — so a
workflow-scope export writes `workflow_templates` rows pointing at a template
that is not in the bundle. On import, `handleDanglingReference()` in
`ImportService.ts` sees `templateId.notNull === true` and throws.

**Reproduced live** (integration harness, test DB on 5434, real JWT): a
workflow with one text step and one attached template exported at workflow
scope produced these entries —

```
["blobs/index.json","entities/sections.jsonl","entities/steps.jsonl",
 "entities/workflow_templates.jsonl","entities/workflow_versions.jsonl",
 "entities/workflows.jsonl","manifest.json"]
```

— note no `templates.jsonl`. `POST /api/portability/import/preview` answered
`200` with `canProceed: false` and

```
"Validation failed in workflow_templates: Unresolvable reference:
 workflow_templates.templateId -> d1d41918-b551-40a4-8fcd-f86999ff9ffc"
```

and `POST /api/portability/import/apply` answered
`400 Invalid bundle: Unresolvable reference: workflow_templates.templateId -> …`.

**Consequence: any workflow that generates a document cannot be exported and
re-imported at workflow scope.** The download succeeds, the file looks fine,
and it is a dead artifact. That is precisely the "reuse a workflow as a
baseline" path in the brief.

The same class of defect exists for DataVault, by a different mechanism.
`buildConditions()` in `ExportService.ts` selects DataVault databases for a
workflow root by *ownership only*:

```ts
      const ownScope = and(
        eq(tableCols['scopeType'], root.scope),
        eq(tableCols['scopeId'], root.id)
      );
      const workflowIds = root.scope === 'project'
        ? Array.from(state.extractedIds.get('workflows') ?? new Set<string>())
        : [];
```

For `root.scope === 'workflow'` that is `scopeType='workflow' AND
scopeId=<this workflow>` and nothing else. But a workflow can legitimately use
`account`- and `project`-scoped databases — see the visibility query in
`DatavaultDatabasesRepository.ts` (the `scopeType, 'account'` /
`scopeType, 'project'` / `scopeType, 'workflow'` OR-branches). `workflow_queries`
and `workflow_data_sources` both travel in workflow scope and both have
**NOT NULL** FKs into those tables (`workflow_queries.dataSourceId`,
`workflow_queries.tableId`, `workflow_data_sources.dataSourceId` in
`shared/schema/datavault.ts`), so a workflow wired to a shared DataVault
produces the same un-importable bundle.

Verified programmatically against `ENTITY_GRAPH`:

```
workflow_templates.templateId      notNull = true  (scopes: project|workflow)
workflow_queries.dataSourceId      notNull = true  (scopes: project|workflow)
workflow_queries.tableId           notNull = true  (scopes: project|workflow)
workflow_data_sources.dataSourceId notNull = true  (scopes: project|workflow)

PROJECT-ONLY (silently absent from a workflow export):
  projects, secrets, connections, templates, template_versions
```

### Preferred fix

Both halves live in `ExportService.buildConditions()` and `ENTITY_GRAPH`, which
is why they are one ticket rather than two — splitting them would put two devs
in the same method.

Make workflow-scope selection **reference-driven rather than ownership-driven**,
following the pattern `buildConditions()` already uses for the project-scope
DataVault branch: it reads `state.extractedIds.get('workflows')` — ids
collected by an earlier descriptor — to widen a later one. Do the same here.

1. Add `templates` and `template_versions` to `scopes: ["project","workflow"]`.
   For the workflow root they cannot use the `parent` path (their parent is
   `projects`, which is not in workflow scope), so give
   `buildConditions()` an explicit branch: select `templates` by
   `inArray(id, <templateIds collected from workflow_templates>)`. This
   requires `workflow_templates` to be processed *before* `templates` — record
   the referenced ids into `state.extractedIds` under a distinct key (e.g.
   `'__templateRefs'`) while streaming `workflow_templates`, then consume it.
   Keep the existing topological-sort guard honest: if you reorder
   `ENTITY_GRAPH`, the `Topological sort violation` throw must still hold for
   every parent relationship.
2. For `datavault_databases` in workflow scope, widen `ownScope` to a union
   with the databases actually referenced by this workflow's
   `workflow_data_sources.dataSourceId`, `workflow_queries.dataSourceId` and
   `datavault_writeback_mappings.tableId` → parent database. Same technique:
   collect the ids while streaming those descriptors, then select by
   `inArray`. Do **not** fall back to "all databases in the tenant" — the
   comment on the `else` branch of `buildConditions()` explains why an
   unbounded selection is treated as a graph bug.
3. Blobs must follow: `templates.fileRef` / `template_versions.fileRef` are
   `blobRefs`, and `BlobCollector` already runs from `processRow()`, so this
   should need no change — but assert it, because a template row without its
   file is a new silent-loss bug.
4. If a referenced entity genuinely cannot travel (e.g. an `account`-scoped
   DataVault the caller may read but not export), do **not** emit a broken
   bundle. Emit an `ExportWarning` and record it in `manifest.warnings`, and
   drop the referencing row rather than shipping an unresolvable NOT NULL FK.
   Mirror the warning shape used by `handleDanglingReference()`.

Do not change the `project` scope's behavior; it round-trips correctly today
and its integration tests are the regression net.

### Ties

- **Blocks IEX3-3** (its List/document round-trip cases run at workflow scope
  and will fail until this lands) and **blocks Phase 2** — do not build an
  export button on top of a broken artifact.
- Overlaps **IEX3-2** in `ImportService.ts` only lightly; IEX3-2 adds a new
  check path and does not touch `buildConditions()`. Still, **sequence IEX3-1
  before IEX3-2** — both need the DB-backed suites, which cannot run
  concurrently.
- Skills to load: **`run-tests`** (required), **`add-api-endpoint`**,
  **`db-schema-change`** *only* if you conclude a schema change is needed —
  it should not be; this is a query-shape fix.
- File footprint: `server/services/portability/entityGraph.ts`,
  `server/services/portability/ExportService.ts`,
  `tests/integration/portability.export.test.ts`,
  `tests/unit/portability/exportService.test.ts`.
- Reference: round-2 history for why the project-scope DataVault branch exists
  — `git log -p -- tickets/IMPORT_EXPORT_2_TICKETS.md`.

### Acceptance criteria

1. A workflow-scope export of a workflow that has a `workflow_templates` row
   contains `entities/templates.jsonl` (and `template_versions.jsonl` where
   rows exist), and the referenced template's blob is present in the bundle.
2. That bundle's `POST /api/portability/import/preview` returns
   `canProceed: true` with no `Unresolvable reference` error, and
   `POST /api/portability/import/apply` returns **201**.
3. A workflow-scope export of a workflow with a `workflow_queries` row against
   a **project-scoped** DataVault database contains that database, its tables,
   its columns and its rows; preview is `canProceed: true` and apply returns
   **201**.
4. Same as 3 for an **account-scoped** database — either it travels, or a
   `manifest.warnings` entry names it and the referencing row is dropped so
   the bundle still imports. State in the ticket turn-in which behavior you
   implemented and why.
5. A workflow-scope export selects **only** the templates and databases that
   workflow references — a second template and a second unrelated database in
   the same project/tenant must be absent from the bundle. (The fixture must
   explicitly create those extra rows; an assertion of absence against an empty
   fixture proves nothing.)
6. Project-scope export/import behavior is unchanged: the existing
   `tests/integration/portability.export.test.ts` and
   `portability.import.test.ts` pass without modification to their assertions.
7. New integration tests assert 1–5, in
   `tests/integration/portability.export.test.ts` (export shape) and
   `tests/integration/portability.import.test.ts` (round-trip). Each new test
   must be shown to fail against the pre-fix tree.
8. Gates green and pasted into the turn-in: `npm run type-check` → 0 errors;
   `npm run lint` → 0 errors, 0 new warnings; `npm run test:fast`; the
   portability unit-db and integration suites (baseline at round-2 close: 74
   unit-db tests / 7 files, 25 integration tests / 3 files — the new count must
   be ≥ that).

---

## IEX3-2 — Entity ids embedded in jsonb are never checked or reported ✅

> **Verification pass — 2026-08-02.** All 8 acceptance criteria met.
> Shipped in `e84bbe62`; this note lands separately because a concurrent
> `tickets/` restructure (`5c7c7d89`) held this file at commit time.
>
> Gates: `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 errors/0 warnings;
> pre-commit hook 4/4 (ESLint, type-check, strict zones, related tests);
> `npm run test:fast` → **2287 passed** (was 2279); `unit-db` → **12 files /
> 129 passed** (was 11/124); portability integration → **32 passed** (was 31).
>
> Pre-fix proof: with the two wiring files reverted to HEAD, the four
> behavioural tests failed — AC 1, 2 and 3 in `importConfigRefs.test.ts` and
> the integration case (`expected [] to deeply equal ArrayContaining{…}`).
> **AC 4 and AC 5 pass against the pre-fix tree by design** and are stated as
> such rather than claimed as regression proof: they assert the *absence* of a
> false warning, which is what the collector must not break. The eight
> `stepConfigRefs.test.ts` cases test a module that did not previously exist.
>
> **Deviation from the Preferred fix — key names, not config shapes.** The
> ticket asked for a typed walker over the `StepConfig` union mirroring
> `projectListValue`. Rejected while writing it: references live in about a
> dozen unions across `stepConfigs.ts` *and* `blocks.ts` (`ReadTableConfig`,
> `WriteBlockConfig`, `ComputedStepConfig`, `FinalBlockConfig`,
> `SignatureBlockConfig`, `DynamicOptionsConfig`, ...), a shape walker must
> enumerate every one, and the next config type added escapes it silently —
> the staleness that retired `RepeaterFieldType` (LIST-13). These configs
> already name references consistently, so `collectConfigEntityRefs` keys off
> an allowlist of reference key names and recurses the whole object. That
> covers `ListConfig.fields[]`, nested `kind: "list"` fields at any depth,
> `filters[]` and `columnMappings[]` with no special cases, and it satisfies
> AC 5 structurally: local ids are keyed `id`, which is not on the allowlist,
> so a UUID-shaped `ChoiceOption.id` can never be reported.
>
> Ordering detail worth keeping: the collection **must** run before
> `remapJsonIds`. Afterwards the column holds the *new* id, which is not a key
> of `idMap`, so every successfully remapped reference would report as
> unresolvable.
>
> Scope note discovered while testing, filed as **IEX3-B5** below rather than
> fixed here: a DataVault database referenced *only* from inside a step config
> is still not carried by the export. IEX3-1 collects references from data
> sources, queries and writeback mappings, not from config. This ticket's
> contract is to report the broken reference, and it does — but making it
> travel is the better end state.
>
> Not driven in a browser: no UI surface. Live proof is the HTTP-level
> integration case (real JWT, export → preview → apply), which asserts the
> `201` body carries
> `config.fields[0].config.dynamicOptions.tableId`.

**Priority: P0 (bug)** · Size: M · File: `server/services/portability/ImportService.ts`

### Finding

Import validates and remaps **column-level** foreign keys only.
`checkDanglingReferences()` and `remapForeignKeys()` both iterate
`desc.refs ?? []`, which is a list of *columns*. Ids that live *inside* jsonb
get a best-effort remap and no validation at all:

```ts
    for (const jsonRef of (ctx.desc.jsonRefs ?? [])) {
      ...
        data[jsonRef] = remapJsonIds(data[jsonRef], ctx.idMap);
```

and `remapJsonIds()` in `server/utils/remapJsonIds.ts` is, by construction,
silent about misses:

```ts
  if (typeof value === "string") {
    return (idMap.get(value) ?? value) as T;
  }
```

An id that was not in the bundle simply passes through unchanged. `steps.config`
is a `jsonRefs` column, and it carries real cross-entity references — see
`DynamicOptionsConfig` in `shared/types/stepConfigs.ts`:

```ts
  | {
    type: 'table_column';
    dataSourceId: string;     // Database ID
    tableId: string;          // Table ID
    columnId: string;         // Column to extract values from
    labelColumnId?: string;
```

plus `documents[].documentId` on the `final_documents` and `signature_block`
configs, and `linkedListToolsBlockId` on the list-variable variant. Because
`ListField` is recursive (`kind: "list"` → `list: ListConfig` → `fields[]`),
these appear at arbitrary depth inside a List step's config.

**Reproduced live**: a `list` step whose nested `choice` field bound
`dynamicOptions.type = 'table_column'` to a project-scoped DataVault table,
exported at workflow scope and re-imported into the same tenant, returned:

```
apply status: 201
apply body:   { "entityCounts": {"workflows":1,"sections":1,"steps":1},
                "warnings": [] }
```

and the imported step's config still held the **source instance's** ids:

```
"dynamicOptions": { "type": "table_column",
   "tableId":      "f294619a-cadb-452d-8b40-5c827eeec219",
   "columnId":     "42cf5f28-4ced-4acd-acbf-2f55b0ecfe27",
   "dataSourceId": "f1d8046c-457c-4201-b538-e056d9e195bf" }
   ← byte-identical to the originals
```

**Consequence:** the import reports complete success with zero warnings, and
the user gets a workflow whose dropdown is wired to a table that either does
not exist on this instance (silently empty at runtime) or belongs to the
*original* copy — so editing the "new baseline" workflow's data source silently
edits the old workflow's. Both outcomes are worse than a loud failure, and both
are invisible in the preview the user is supposed to trust.

### Preferred fix

Do **not** try to solve this by regex-matching UUID-shaped strings — config
carries plenty of locally-scoped UUIDs (`ChoiceOption.id`, `ListField.id`,
`documents[].id`) that are not entity references, and flagging those would
train users to ignore the warning. Declare the references instead.

1. Add a shared, typed collector — put it in `shared/` next to the config
   types (e.g. `shared/types/stepConfigRefs.ts`) so both the importer and any
   future cloner can use it — that walks a `StepConfig` and yields
   `{ path: string; id: string; entity: 'datavault_databases' |
   'datavault_tables' | 'datavault_columns' | 'templates' | 'blocks' }` for
   each embedded entity reference. It **must** recurse through
   `ListConfig.fields[]` for both `kind: "question"` (via `field.config`) and
   `kind: "list"` (via `field.list`) — mirror the recursion in
   `projectListValue()` / `projectListItem()` in
   `shared/types/stepConfigs.ts`, which is the established walker for this
   shape.
2. In `ImportService`, run the collector over `steps.config` (and
   `blocks.config`) after `remapJsonIds`. For each collected id still absent
   from `idMap`, emit the existing `dangling_reference` `ExportWarning` shape
   via `handleDanglingReference()`'s warning branch — same `type`, `entity`,
   `column`, `missingId`, `message` fields, so the preview UI in IEX3-4/5 has
   one shape to render. Surface it in **both** `preview` (into
   `result.warnings`) and `apply` (into `ctx.warnings`, which the route already
   returns).
3. These are warnings, not errors — `canProceed` stays `true`. A workflow with
   a broken dropdown is still a useful baseline; the user just has to be told.
   Do not null out the config values: leaving them lets the user see what the
   binding *was* when they rewire it.
4. Leave `remapJsonIds()` itself untouched. Its docblock explains it is the one
   shared implementation for three callers (DEBT-12); changing its signature to
   report misses would ripple into `WorkflowClonerService` and `SectionService`
   for no benefit. Collect separately.

### Ties

- **Sequence after IEX3-1** — shares the DB-backed suites, and IEX3-1's fix
  changes which ids *are* in the bundle, which changes this ticket's fixtures.
- **Feeds IEX3-4/5**: the preview screen renders these warnings. Keep the
  warning shape stable.
- Related backlog: **IEX3-B1** (List field aliases are outside the step-alias
  collision check) is adjacent but a different concern — do not fold it in.
- Skills to load: **`run-tests`** (required), **`add-api-endpoint`**,
  **`add-step-type`** — the last one because it enumerates where step-type
  config shapes are declared, which is exactly the list the collector must
  cover.
- File footprint: `shared/types/stepConfigRefs.ts` (new),
  `server/services/portability/ImportService.ts`,
  `tests/unit/portability/importPreview.test.ts`,
  `tests/unit/portability/importApply.test.ts`,
  `tests/integration/portability.import.test.ts`.

### Acceptance criteria

1. Importing a bundle containing a `choice` step whose
   `config.dynamicOptions.type === 'table_column'` references a DataVault
   database **not** in the bundle returns **201** with a
   `dangling_reference` warning naming `dataSourceId`, `tableId` and
   `columnId`, and `preview` reports the same warnings with
   `canProceed: true`.
2. Same as 1 when the choice field is nested inside a `list` step's
   `config.fields[]`, **and** when nested two levels deep inside a
   `kind: "list"` field's own `list.fields[]`.
3. Same as 1 for a `final_documents` step whose
   `config.documents[].documentId` references a template not in the bundle.
4. When the referenced entities **do** travel in the bundle, the imported
   config's ids equal the newly allocated ids (not the source ids) and **no**
   warning is emitted. The test must assert the new ids differ from the source
   ids.
5. Locally-scoped ids inside config — `ChoiceOption.id`, `ListField.id`,
   `documents[].id` — never produce a warning, even when UUID-shaped. Fixture
   must use UUID-shaped values for these to make the assertion meaningful.
6. `remapJsonIds()` in `server/utils/remapJsonIds.ts` is unchanged
   (`git diff` on that file is empty).
7. New unit tests assert 1–5 in `tests/unit/portability/`; one integration test
   asserts the end-to-end 201-with-warnings path. Each must be shown to fail
   against the pre-fix tree.
8. Gates green and pasted: `npm run type-check` → 0 errors; `npm run lint` →
   0 errors, 0 new warnings; `npm run test:fast`; portability unit-db +
   integration suites.

---

## IEX3-3 — Round-trip coverage for every question type, including List 🔲

**Priority: P1** · Size: M · File: `tests/integration/portability.roundtrip.test.ts` (new)

### Finding

The portability suites prove that **one `text` step** survives a project-scope
round trip. The fixture in `tests/integration/portability.import.test.ts` is,
in full:

```ts
    await db.insert(schema.steps).values({
      workflowId,
      sectionId: section.id,
      type: 'text',
      title: 'Your name',
      alias: 'your_name',
      order: 0,
    });
```

Searching the whole portability test tree for the shapes that carry risk
returns nothing:

```
grep -rn "'list'|dynamicOptions|table_column" tests/unit/portability/ tests/integration/portability.*.ts
→ (no matches)
```

There are 37 values in `stepTypeEnum` (`shared/schema/workflow.ts`). None of
the config-bearing ones — `list`, `choice` with dynamic options, `multi_field`,
`final_documents`, `signature_block`, the `*_advanced` variants — is exercised
by a portability test. The two live defects in IEX3-1 and IEX3-2 both sat
undetected behind exactly this gap, which is the argument for closing it as its
own ticket rather than as a side effect.

### Preferred fix

Add one new integration file, `tests/integration/portability.roundtrip.test.ts`,
whose single job is fidelity: build a workflow that uses every config-bearing
step type, export it, import it, and assert the imported tree matches the
source tree modulo re-allocated ids.

1. Build the fixture from `stepTypeEnum` itself, not a hand-written list — the
   same discipline `LIST_FIELD_QUESTION_TYPES` uses in
   `shared/types/stepConfigs.ts`, and for the same reason (a hand-maintained
   list went stale and that is what retired `RepeaterFieldType`). Iterate the
   enum, skip types with a documented reason in a small `SKIPPED` map with a
   comment each, and **fail the test if a new enum value appears that is
   neither covered nor explicitly skipped**. That turns "portability supports
   the new step type" into a gate on `add-step-type`.
2. Give the List step real depth: a `kind: "question"` field of each of at
   least four different `LIST_FIELD_QUESTION_TYPES` (including a `choice` with
   static options and one with `visibleIf`), plus a `kind: "list"` nested field
   containing its own question — matching the recursion in `ListField`.
3. Assert **deep equality of `steps.config`** between source and imported
   workflow after normalising the ids that are *supposed* to change. Do not
   assert field-by-field: the point is to catch a config key that silently
   fails to survive, which a targeted assertion cannot see.
4. Run the round trip at **both** `project` and `workflow` scope. Workflow
   scope is the one the brief cares about and the one IEX3-1 repairs.
5. Add the `add-step-type` skill a line pointing at this file, so the next
   person adding a step type knows a portability test will gate them.

### Ties

- **Depends on IEX3-1 and IEX3-2** — both must be ✅ first, or the workflow-scope
  half of this ticket fails for reasons outside its own scope.
- **Sequence last in Phase 1**; it shares the DB-backed suites with both.
- Skills to load: **`run-tests`** (required), **`add-step-type`** (required —
  it is the inventory of where step types are declared, and criterion 5 edits
  it).
- File footprint: `tests/integration/portability.roundtrip.test.ts` (new),
  `.claude/skills/add-step-type/SKILL.md` (one line). No production code should
  change; if it does, that is a finding — stop and report it rather than fixing
  it inside this ticket.

### Acceptance criteria

1. `tests/integration/portability.roundtrip.test.ts` exists and covers every
   value of `stepTypeEnum` that is not in an explicit, commented `SKIPPED` map.
2. The test fails with a clear message if a new `stepTypeEnum` value is added
   without being covered or explicitly skipped. Prove it by temporarily adding
   a fake enum value locally and pasting the failure output.
3. The List fixture includes at least four distinct
   `LIST_FIELD_QUESTION_TYPES` question fields, one with `visibleIf`, and one
   `kind: "list"` nested field with its own question field.
4. Imported `steps.config` deep-equals source `steps.config` after id
   normalisation, at **project** scope.
5. Criterion 4 also holds at **workflow** scope.
6. No production file is modified by this ticket
   (`git diff --name-only` shows only the new test file and the skill doc).
7. Gates green and pasted: `npm run type-check` → 0 errors; `npm run lint` →
   0 errors, 0 new warnings; the portability integration suite, with the new
   file's test count stated.

---

## Phase 1 Gate

- [ ] IEX3-1, IEX3-2, IEX3-3 all ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors (read raw output or grep
      `Found [0-9]+ error`; `grep "error TS"` finds nothing on `--pretty` output)
- [ ] `npm run lint` → 0 errors, 0 new warnings (`--max-warnings 0` repo-wide)
- [ ] `bash .husky/pre-commit`-equivalent gate run — `type-check` alone is not
      the commit gate; `check:strict-zones` pulls files in transitively
- [ ] `npm run test:fast` green, count stated
- [ ] Portability unit-db + integration suites green, counts ≥ round-2 baseline
      (74 unit-db / 7 files, 25 integration / 3 files)
- [ ] Reviewer has driven one workflow-scope export → import round trip against
      the live dev app with a real JWT, on a workflow containing a document
      template, a DataVault-bound choice, and a List step — and captured the
      201 plus the imported config
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Make it reachable, with the security story in front of the user

The brief's first clause — *"give an end user access to download their
workflows"* — is not partially met. It is not met at all. A sweep of the entire
client tree finds no reference to the feature:

```
grep -rniE "\.ezb|portability|bundle.*import|import.*bundle" client/src/
→ (no matches)
```

The routes are registered (`server/routes/index.ts`,
`registerPortabilityRoutes(app)`), so the capability exists and is
authenticated, rate-limited and audited — it is simply unreachable without
`curl` and a hand-made bearer token.

This reopens **IEX2-16**, which was deferred on 2026-07-29 with the ruling
*"dont worry about UI yet … revisit reachability once Phases A–C are committed
and the round trip works on real data."* Phases A–C are committed. The round
trip works on real data for the project scope and will work at workflow scope
once IEX3-1 lands. The precondition is met; these tickets replace IEX2-16,
which should be closed as superseded at the Phase 1 gate.

> ⚠️ **Both Phase 2 tickets are Size L and were escalated to the repo owner at
> generation time (see the audit hand-off).** Do not dispatch either until the
> repo owner has ruled on scope. They are written out here so the ruling has
> something concrete to cut down.

## IEX3-4 — Export UI with a pre-download disclosure of what travels 🔲

**Priority: P1** · Size: L · File: `client/src/components/builder/` (new component), `client/src/pages/`

### Finding

There is no way to reach `GET /api/portability/export/workflow/:id` from the
product. Separately, the information that would give a user *confidence* — the
`requiresReentry[]` list, the `warnings[]` from `scanForSecrets`, the fact that
`secrets.value` never leaves the building — is written into `manifest.json`
*inside the downloaded zip*, i.e. only visible after the download has already
happened and only to someone who unzips it and reads JSON.

`ExportService.exportToFile()` already computes all of it before streaming:

```ts
      const allWarnings = [...state.blobCollector.warnings, ...state.warnings];
      if (allWarnings.length > 0) {
        manifest.warnings = allWarnings;
      }
      if (state.requiresReentry.length > 0) {
        manifest.requiresReentry = state.requiresReentry;
      }
```

so the data exists; it simply has no route that returns it without the bytes.

### Preferred fix

1. **Add a dry-run endpoint** — `GET /api/portability/export/:scope/:id/manifest`
   — that runs the same export and returns *only* the manifest as JSON,
   discarding the temp file. Mirror `handleExport()` in
   `portability.routes.ts` exactly for auth, rate limiting and error
   classification. Audit-log it as a *preview*, not an export (or not at all —
   match the reasoning in the import preview route's comment, "Deliberately
   unlogged: preview writes nothing"). Load the **`add-api-endpoint`** skill
   before writing it.
2. **Add a "Download a copy" action** in the workflow builder, next to the
   existing workflow-level actions. On click, fetch the manifest and show a
   dialog before any download starts, stating plainly:
   - what is included (entity counts, blob count, total size);
   - what is **deliberately excluded** — render this from `EXCLUDED_TABLES`
     grouped into human categories, not 70 table names: "run data and
     submissions", "user accounts and access lists", "API keys, tokens and MFA",
     "billing";
   - what was **withheld and must be re-entered** (`requiresReentry[]`), named
     by key and connection name;
   - any `secret_scan` warnings, with the file/entity and line, so the user can
     go clean up a pasted key *before* sharing the bundle.
3. Only after the user confirms does the browser hit the streaming export
   route. Treat the dialog as the product's security statement — this is the
   whole "confidence in data security" clause of the brief, and it is the one
   part of this initiative where wording matters as much as code.
4. **Load the `design` skill first** and follow it. Default register R2. The
   dialog is dense, factual and slightly severe — it is a disclosure, not a
   celebration; no confetti, no green checkmark hero.

### Ties

- **Blocked by the Phase 1 Gate.** Do not put a download button on an artifact
  that cannot be re-imported.
- **Pairs with IEX3-5**; they share the warning/collision rendering. Build the
  shared presentational pieces here and reuse them there, or sequence 4 → 5.
- Supersedes **IEX2-16** (now recorded as superseded in
  `tickets/backlog/PORTABILITY.md`).
- Skills to load: **`design`** (required, before any markup), then
  **`add-api-endpoint`** for the new route, **`run-tests`**, and **`verify`**
  for the live drive-through.
- File footprint: `server/routes/portability.routes.ts`,
  `server/services/portability/ExportService.ts` (a `manifestOnly` option),
  new client component(s) under `client/src/components/builder/`, the workflow
  actions menu, `tests/integration/portability.export.test.ts`, a new RTL test.

### Acceptance criteria

1. `GET /api/portability/export/workflow/:id/manifest` returns the manifest
   JSON with `entityCounts`, `blobCount`, `warnings` and `requiresReentry`,
   and leaves **no** temp file behind (assert on `os.tmpdir()` before/after).
2. That route enforces the same authorization as the streaming route: 401
   unauthenticated, 403 for a `view`-only role, 404 for an unknown id —
   mirroring the existing cases in
   `tests/integration/portability.export.test.ts`.
3. A user with `edit` on a workflow can reach a "Download a copy" action from
   the workflow builder without typing a URL.
4. The confirmation dialog renders, from live API data: entity counts, the
   grouped exclusion list, every `requiresReentry` entry by name, and every
   `secret_scan` warning with its entity and line.
5. No download request is issued until the user confirms — assert via the
   network log in the live drive-through, not only in a unit test.
6. The dialog is keyboard-navigable and screen-reader-labelled: focus moves
   into it on open and returns to the trigger on close (the pattern
   established for List drill-in focus management in LIST2-12).
7. New tests: integration for 1–2, RTL for 4–6.
8. Live proof attached: screenshot of the dialog on a workflow that has both a
   `requiresReentry` entry and a `secret_scan` warning, plus the network log
   showing the export request firing only after confirm.
9. Gates green and pasted: `npm run type-check`, `npm run lint`,
   `npm run test:fast`, portability integration suite.

---

## IEX3-5 — Import UI: upload → preview → apply 🔲

**Priority: P1** · Size: L · File: `client/src/pages/` (new), `client/src/components/`

### Finding

`POST /api/portability/import/preview` exists precisely so a user can see what
a bundle will do before it does it — the route comment says so:

```ts
  // Import is a two-step interaction: preview tells the user what a bundle will
  // do, apply performs it.
```

Nothing calls it. There is no upload control anywhere in the client. The
preview response is a rich, purpose-built payload — `entityCounts`,
`collisions`, `warnings`, `requiresReentry`, `hasExecutableCode`, `canProceed`,
`errors` — and every field of it is currently unrendered. `hasExecutableCode`
in particular exists to warn that a bundle carries transform blocks, lifecycle
hooks or document hooks — arbitrary JS/Python that will run in this tenant —
and no human has ever seen it.

### Preferred fix

1. A single import page or drawer implementing the two-step flow the API
   already models: select `.ezb` → `POST /preview` → render → confirm →
   `POST /apply`. Never call `/apply` without a preview.
2. Render every preview field. Non-negotiable ones:
   - `hasExecutableCode: true` → a prominent, unmissable warning that the
     bundle contains code that will execute in this tenant, naming the
     entities. This is the single highest-risk thing the importer can do.
   - `collisions[]` → grouped by `type` (`project` / `workflow` /
     `table_slug` / `step_alias`) with the colliding name.
   - `errors[]` with `canProceed: false` → the confirm control is disabled and
     the reason is stated.
   - `warnings[]` including the `dangling_reference` entries IEX3-2 adds — this
     is where the user learns their DataVault-bound dropdown lost its binding.
   - `requiresReentry[]` → a checklist of secrets and connections to re-enter
     after import, ideally deep-linking to the project's secrets settings.
3. Target selection: the apply route already accepts `targetProjectId`,
   `targetOwnerType`, `targetOwnerUuid` and `name` via `applyOptionsSchema`.
   Expose project selection and an optional rename; do not invent new options,
   and do not widen that allowlist — the comment above it
   (*"Explicit allowlist — never spread the multipart body into service
   options"*) is a mass-assignment guard.
4. On success, route the user to the newly created workflow/project using
   `rootId` from the 201 response, and surface `warnings` there too — a
   warning shown only on a screen the user immediately navigates away from is
   not shown.
5. **Load the `design` skill first.** Register R2. This is a destructive-ish,
   consequential flow: the visual language should be closer to a deploy
   confirmation than to an upload widget.

### Ties

- **Blocked by the Phase 1 Gate**, and by **IEX3-2** for the
  `dangling_reference` warning shape.
- **Pairs with IEX3-4** — shared warning/collision rendering. Sequence 4 → 5
  and reuse, or agree a shared component up front.
- Supersedes **IEX2-16** together with IEX3-4.
- Skills to load: **`design`** (required, before any markup), **`run-tests`**,
  **`verify`** for the live drive-through.
- File footprint: new page under `client/src/pages/` + `client/src/Router.tsx`,
  new components, shared warning components with IEX3-4, a new RTL test.
  Touches `Router.tsx`, which the repo owner may also be editing — check
  `git status` before starting.

### Acceptance criteria

1. A user can select a `.ezb` file and see the preview response rendered,
   without `/apply` having been called (assert via network log).
2. `hasExecutableCode: true` renders a distinct, prominent warning naming the
   executable entity types present.
3. `canProceed: false` disables the confirm control and displays every entry
   of `errors[]`.
4. `collisions[]`, `warnings[]` and `requiresReentry[]` each render with their
   identifying fields; a preview with zero of each renders a clear "nothing to
   flag" state rather than empty space.
5. Confirm calls `/apply` with only the fields in `applyOptionsSchema`, and on
   201 navigates to `rootId` with the returned `warnings` still visible.
6. A rejected upload (non-`.ezb`, oversized, corrupt) surfaces the server's
   400/413 message rather than a generic failure.
7. The flow is keyboard-navigable and screen-reader-labelled; focus moves into
   the preview on load and to the error summary when `canProceed` is false.
8. New RTL tests assert 2–6 against mocked preview payloads.
9. Live proof attached: a screenshot of the preview screen for a bundle that
   has a collision, an executable-code flag and a `requiresReentry` entry, plus
   the network log for the full upload → preview → apply sequence.
10. Gates green and pasted: `npm run type-check`, `npm run lint`,
    `npm run test:fast`.

---

## Phase 2 Gate

- [ ] IEX3-4, IEX3-5 ✅ with dated verification notes
- [ ] Standard gates green (type-check, lint, `test:fast`, portability suites)
- [ ] Reviewer has driven the full loop in the browser on the live dev app:
      export a workflow containing a List step and a document template from the
      builder → read the disclosure dialog → download → import the same file
      → read the preview → apply → open the imported workflow and confirm the
      List step, its nested fields and its bindings are intact
- [ ] IEX3-6 ✅ (not phase-gated, but close it out with this gate if still open)
- [ ] Backlog triaged (promote / merge / close won't-fix) in the gate commit
- [ ] Reviewer has committed each passed ticket + this gate

---

## Backlog / observations — not phase-gated, not sized

Promotable later; each is a one-liner on purpose.

- **IEX3-B1** — The duplicate step-alias check in
  `ImportService.processEntityStream()` reads `steps.alias` only
  (`` `${data['workflowId']}::${data['alias']}` ``); it never descends into
  `steps.config.fields[].alias`, so List field aliases are outside collision
  detection. Low impact — those aliases are item-scoped — but the collector
  built for IEX3-2 makes it nearly free.
- **IEX3-B2** — `remapJsonIds()` documents that it remaps string *values* only,
  never object *keys*. Nothing in the schema uses id-keyed jsonb today. Worth a
  periodic re-check rather than a fix.
- **IEX3-B3** — A `.ezb` contains no human-readable file. A short generated
  `README.txt` at the bundle root (what this is, what was excluded, what must
  be re-entered) would make the artifact self-describing for anyone who
  receives one without the UI. Depends on nothing; pairs naturally with IEX3-4.
- **IEX3-B4** — replacing `adm-zip` on the read side remains open as its own
  initiative. Unchanged by this audit; noted so it is not rediscovered as new.
  **Merged into `tickets/BACKLOG.md` as `IEX-D7`** on 2026-08-02 — it had been
  tracked three times (here, as round 2's `D-7`, and as round 1's `IEX-B8`).
  Track it there, not here.
- **IEX3-B5** — A DataVault database referenced *only* from inside a step
  config is still not carried by the export. `collectWorkflowRefs` (IEX3-1)
  reads `workflow_data_sources`, `workflow_queries` and writeback mappings, not
  `steps.config`, so a choice question bound to a table the workflow never
  registered as a data source exports without it. IEX3-2 makes this loud rather
  than silent, which was its contract — but feeding `collectConfigEntityRefs`
  into the export's reference collection would make it *correct*. Found while
  writing IEX3-2's tests, 2026-08-02. Small and well-understood; promote before
  Phase 2 if the export UI is going to show a "what travels" list, since this
  is the case where that list would be wrong.

# Template Marketplace — make the curated templates installable (TM)

**Status:** open · **Written:** 2026-08-16
**Ticket prefix:** `TM-1..5`
**Parent:** GH-173 in `tickets/ROADMAP_TICKETS.md` (🔲). The LD board that authored the
curated content **closed and retired 2026-08-18** → [`backlog/LEGAL_DRAFTING.md`](backlog/LEGAL_DRAFTING.md)
(full ticket text: `git log -p -- tickets/LEGAL_DRAFTING_TICKETS.md`).

⚠️ **This board now solely owns the GH-173 flip.** LD delivered the authoring and closed its
own gate; GH-173's remaining criteria are delivery, which is TM-1..5. Read LD's settled
rulings before touching curated content — in particular **pronouns are explicit-only with a
they/them default and no inference path**, and legal numbering is stateless.

---

## How to work this document

- Read this header and **your ticket only**.
- Line numbers are advisory; the **quoted code plus the symbol name** is the locator. Grep
  for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- **Devs do not commit or stage.** The reviewer commits, one commit per passed ticket.
- **Baselines — updated 2026-08-16 after TM-2** (measured, not carried forward):
  `test:fast` **279 files / 3239 passed / 0 failed**; `test:integration` **113 files /
  1123 passed / 0 failed**. Any failure is new. *(Authoring-time figures were 3209 / 1116;
  they drifted as TM-1 and unrelated work landed, and a dev was once handed the stale number.
  Re-measure rather than quoting this line if much has landed since.)*
- **Confirm the worktree is quiescent before running verification.** A dev's "completed"
  notification has twice arrived while it was still editing; two full integration runs were
  burned on a half-applied tree and produced failures that were pure artefact.
- `npm run test:docker:up` starts postgres (5434) **and** gotenberg (3009). Re-run after any
  pull. Never run two DB-backed suites at once — see the `run-tests` skill.
- Clear the shared type-check cache before trusting `tsc`: `rm -f node_modules/typescript/tsbuildinfo`.

---

## Why this board exists

LD-2 shipped three curated templates (NDA, Retainer Agreement, Intake Questionnaire) as
`templates/curated/<slug>/{workflow.json,mapping.md,template.docx}`. They are **inert**: the
only references to `templates/curated` anywhere in the repo are the files themselves and
`tests/unit/services/document/curatedTemplates.test.ts`. Nothing in `server/` or `client/`
reads them, so there is no UI in which a user can find or use them.

That was LD-2's own acceptance criteria doing exactly what they said — AC1 forbade adding
"any new route, state machine, or runtime path", a guard written to stop the removed
`/intake/*` pipeline being resurrected. The guard worked, but it was drawn wide enough to
exclude the delivery mechanism too, so the ticket produced content with no consumer. **The
content is good and stays; only the packaging and the plumbing are in scope here.**

## The surprise: the marketplace is mostly built already

| Layer | State | Evidence |
|---|---|---|
| Router registration | ✅ | `server/routes/index.ts:36,148` — `app.use("/api", marketplaceRouter)` |
| Endpoints | ⚠️ list / detail / install / publish exist, but **detail was unreachable** — see TM-2's routing correction | `server/routes/marketplace.ts` |
| Auth, tenancy, validation | ✅ | every route has `hybridAuth`, `requireTenant`, Zod schemas |
| Client page | ✅ 185 lines: search, category filter, cards, install mutation, redirect to builder | `client/src/pages/Marketplace.tsx`, route at `client/src/Router.tsx:140` |
| **`MarketplaceService`** | ❌ **every method a stub** | `server/lib/templates/MarketplaceService.ts` |

`listTemplates` and `getTemplate` log
`'MarketplaceService.listTemplates: marketplaceTemplates table not yet implemented'` and
return `[]` / `null`; `installTemplate` and `publishTemplate` throw
`'Marketplace functionality not yet available'`. So the page renders an empty gallery.

**This initiative is therefore "fill in one service", not "build a marketplace."**

## Decisions already made — do not relitigate

1. **Curated templates are code-shipped, never database rows.** They are first-party content
   that changes only when we ship a commit, so the deploy *is* the sync mechanism. A shared
   or per-environment `marketplaceTemplates` table would add drift, seeding, and (for a
   shared DB) an isolation regression against the environment split ENV-1 just established.
   Repo owner decision, 2026-08-16.
2. **Bundles are generated at build time, not committed.** The bundle manifest stamps
   `migrationHead` (`ExportService.ts:136`, schema at `bundleFormat.ts:105`) and
   `ImportService.checkMigrationHead` compares it against `migrations/meta/_journal.json`.
   A *committed* bundle therefore rots as the schema evolves; a *generated* one is rebuilt
   against the current head every CI run and structurally cannot go stale.
3. **Generated output goes into `dist/`.** The Dockerfile copies `dist`, `package.json`,
   `node_modules`, `migrations` and one script — **`templates/` is not copied**
   (`Dockerfile:81-100`). Emitting into `dist/` needs no Dockerfile change; reading
   `templates/` at runtime would silently serve an empty gallery in production, and **no test
   can catch that** because the repo tree always has `templates/`.
4. **User publishing is out of scope.** `POST /api/market/publish` stays stubbed. The catalog
   interface must not *preclude* a future database-backed provider, but nothing here builds one.

---

## TM-1 — Build-time generator: curated JSON → portability bundles in `dist/` ✅ DONE 2026-08-16

**Gates re-run by the reviewer**, not read off the dev's report: `type-check` **0 errors** ·
`eslint --max-warnings 0` on all six touched files **exit 0** · `test:fast` **276 files /
3219 passed / 0 failed** (baseline 3209 → +10, exactly the new tests) · `test:integration`
run **alone** against a freshly recreated `ezbuildr_test_tm_1`.

**Verified by inspection, not assertion:**
- **The extraction is genuine.** `getMigrationHead` moved to
  `server/services/portability/migrationHead.ts`; `ExportService` imports it and its private
  copy is deleted, not commented out. The logic is byte-identical. This is what makes AC4
  meaningful — two divergent copies would have defeated the anti-staleness property outright.
  `fs`/`path` remain used in `ExportService` (`getAppVersion`, tmp paths), so no orphans.
- **The generator was run and its output opened.** Three `.ezb` + `index.json` in
  `dist/marketplace/`. Retainer bundle: `migrationHead: 0023_condemned_hannibal_king`,
  independently confirmed equal to the current journal head; entities `workflows` 1,
  `sections` 2, `steps` 9, `workflow_versions` 1, `templates` 1, `template_versions` 1,
  `workflow_templates` 1 — the canonical `ENTITY_GRAPH` entities, not invented shapes.
- **The DOCX blob is byte-identical to source in all three bundles**, and
  `templates`/`template_versions` reference it by the same `fileRef` key the blob index uses.
  (Reviewer note: the blob index is keyed by `fileRef`, not by sha256 — a first lookup by
  sha256 reported "missing" and was the reviewer's error, not a defect.)
- **AC6 holds:** nothing under `server/` or `client/` reads `templates/`. The generator is
  `scripts/`-only, wired into `build` via `build:marketplace`, standalone-runnable.
- **AC5 is tested with real fixtures** — missing required field, unknown top-level field, bad
  step `type` — each asserting the thrown message names the file and the field.

**The dev's disclosed deviation was correct, and it corrects this board.** It added a
`workflow_versions` row carrying a real runtime-shaped snapshot rather than a stub `{}`,
because `workflow_templates.workflowVersionId` is a NOT NULL FK. Reviewer verified the
justification: `server/services/workflow-runs/RunDefinitionProvider.ts` parses
`version.graphJson` through `VersionRuntimeSchema` to serve pinned run definitions, and
`RunStateService.ts:165` reads it as `WorkflowContentData`. A stub would have produced a
workflow that breaks the moment it is pinned. **See the correction on TM-5.**

**Priority: P0** · Size: M · Files: `scripts/generateMarketplaceBundles.ts`,
`scripts/curatedWorkflowSchema.ts`, `server/services/portability/migrationHead.ts`,
`server/services/portability/ExportService.ts`, `package.json`, `tests/unit/scripts/**`

### Finding

`templates/curated/<slug>/workflow.json` is a hand-written descriptive spec — its own README
says *"nothing here imports it today. No route, service, or repository reads these files."*
Its shape is `{ title, description, settings, sections: [{ title, steps: [{ alias, type,
title, required, config?, visibleIf? }] }] }`, deliberately mirroring `sections`/`steps` in
`shared/schema/workflow.ts`.

Meanwhile the repo already has a complete, tested portability format
(`server/services/portability/`) that moves a workflow **with its sections, steps and
blobs**. `BundleWriter` (`bundleWriter.ts:9`) is a general-purpose writer — `writeManifest`,
`writeEntityRow`, blob writes — **not** coupled to reading a database, so it can be driven
from JSON rather than from Postgres.

### Preferred fix

A build-time script that, for each `templates/curated/<slug>/`:

1. Reads and **validates** `workflow.json` against a Zod schema (new, colocated with the
   generator). A malformed or unknown field is a **build failure**, not a warning.
2. Assembles the entity rows a real export would produce, and writes them with
   **`BundleWriter`** — do **not** hand-roll the zip or reimplement the format.
3. Attaches `template.docx` as a **blob**, the same way `ExportService` does, so the DOCX
   travels with the bundle and lands in whichever environment imports it.
4. Stamps `migrationHead` using the **same** mechanism as `ExportService.getMigrationHead()`
   (`ExportService.ts:136`) so generated bundles always carry the current head.
5. Emits to a path under `dist/` and a machine-readable index (slug → bundle path + display
   metadata: title, description, category, tags) for TM-2 to read.

Wire it into `npm run build` **before** the server build, and make it runnable standalone for
local iteration.

**Prefer emitting a generated module over a runtime filesystem read** if it is not awkward —
that removes the `process.cwd()` dependency entirely. Reading from a path *inside* `dist/` is
acceptable, since `dist/` is shipped. Reading from `templates/` is **not**.

### Ties

- Load `run-tests`. Read `server/services/portability/bundleFormat.ts` (the Zod schema for
  the manifest) and `ExportService.ts` before writing anything — the bundle shape is defined
  there, and this ticket must not invent a second definition of it.
- **Blocks TM-2 and TM-3.**
- `docs/architecture/` has no portability doc; `bundleFormat.ts` is the contract.
- Related hazard: `ImportService.checkMigrationHead` reads
  `migrations/meta/_journal.json` via `process.cwd()` and only *warns* if unreadable — so a
  wrong head degrades silently. Do not copy that leniency into the generator.

### Acceptance criteria

1. `npm run build` produces one bundle per curated template plus an index, under `dist/`.
2. Each generated bundle is **readable by `BundleReader`** and validates against
   `bundleFormat`'s manifest schema — asserted by a test, not by inspection.
3. `template.docx` is present in each bundle as a blob, and its bytes round-trip byte-identical.
4. `migrationHead` in each generated manifest equals the current journal head, proven by a
   test that would fail if the head were hardcoded or stale.
5. A malformed `workflow.json` (missing required field, unknown field, bad step `type`)
   **fails the build with a message naming the file and the field**. Covered by a test.
6. Nothing is read from `templates/` at runtime — the generator is build-time only.
7. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

---

## TM-2 — Curated catalog provider behind `MarketplaceService` ✅ DONE 2026-08-16

**Gates re-run by the reviewer** against a settled tree and a freshly recreated
`ezbuildr_test_tm_2`: `type-check` **0** · `eslint --max-warnings 0` **exit 0** ·
`test:fast` **279 files / 3239 passed / 0 failed** (baseline 3226 → +13) ·
`test:integration` **113 files / 1123 passed / 0 failed** (baseline 112/1116 → +1 file,
+7 tests).

### 🔴 A routing collision this board got wrong — the dev found it, and its fix is better than the reviewer's

This file claimed the marketplace routes were "✅ complete and correct". **They were not.**
`GET /api/templates/:id` is *also* served by the Stage-4 document-templates router
(`templates.routes.ts:434`), which was registered first (`index.ts:123`) and validates `:id`
as a UUID. Curated slugs are not UUIDs, so every marketplace detail request was shadowed and
**400'd before reaching `marketplace.ts`** — the endpoint was unreachable, and AC2 was
literally impossible. The reviewer wrote that "complete and correct" claim after reading
`marketplace.ts` in isolation without checking who else already owned the path; the list
endpoint working is what made it look fine.

The reviewer's first instinct was to move the marketplace to an `/api/marketplace/*` prefix.
**The dev's narrower fix was adopted instead**: mount `marketplaceRouter` *before*
`registerApiTemplateRoutes`, plus a `skipUuidIds` guard that `next('route')`s UUID-shaped ids
so real document-template lookups fall through untouched. Verified safe — the document
router's list route is `/projects/:projectId/templates`, there is **no bare `GET /templates`**,
and every other route is `/templates/:id/<subpath>`, none of which marketplace defines. So the
only shared path is `GET /templates/:id`, which the UUID discriminator resolves, and **no
client change is needed** (the prefix move would have required one).

⚠️ **The fix depends on registration order.** Reordering router mounts in `index.ts` will
silently break it. The comment there says so; keep it.

### Reviewer fix applied — search matched substrings, not words

The dev made its failing search test pass by **changing the expectation** (searching
"confidentiality" instead of "NDA"), noting in a comment that "cale**nda**r" contains "nda".
Honest, but it left the defect: a user typing "NDA" got the retainer agreement back.

Fixed here instead: `matchesWholeWord` anchors the query to a **word start**, so prefix
search still works. Verified directly against the real catalog —

| query | before | after |
|---|---|---|
| `NDA` | nda, retainer-agreement | **nda** |
| `retain` | retainer-agreement | retainer-agreement |
| `calendar` | retainer-agreement | retainer-agreement |
| `zzz` | (none) | (none) |

The meaningful assertion was restored, plus a prefix case and a tag case.

### Reviewer process note — worth not repeating

The dev's first "completed" notification arrived while it was **still editing**; the routing
fix landed afterwards. Two full integration runs were burned on a half-applied tree, and the
5 DataVault / 2 auth / 1 perf failures they showed were an artefact of that, **not** a
regression and **not** the `beforeAll`-runs-the-generator hypothesis the reviewer floated.
The settled tree is clean. Confirm a worktree is quiescent before starting a verification run.

**Priority: P0** · Size: M · **Depends on TM-1** · Files: `server/lib/templates/{TemplateCatalog,CuratedCatalogProvider,MarketplaceService}.ts`, `server/routes/{marketplace,index}.ts`, `tests/unit/lib/templates/**`, `tests/integration/api.marketplace.test.ts`

### Finding

`MarketplaceService.listTemplates` and `getTemplate` are stubs:

```ts
logger.warn('MarketplaceService.listTemplates: marketplaceTemplates table not yet implemented');
return [];
```

The routes calling them are complete and correct, so the gallery is empty purely because the
service returns nothing. The routes already handle `category` and `search` query params
(`marketplace.ts`, `listTemplatesQuerySchema`).

### Preferred fix

Introduce a small **`TemplateCatalog` interface** (list / get) and a
**`CuratedCatalogProvider`** that serves TM-1's generated index. `MarketplaceService`
delegates to the catalog rather than querying a table.

Keep the interface deliberately provider-shaped so a future database-backed provider (user
publishing) can be added and unioned **without** changing the routes or the client. Do not
build that provider now.

Honour `category` and `search` filtering in the provider so the existing UI controls work.

**Do not delete `publishTemplate`'s stub** — user publishing is explicitly out of scope, and
it should keep throwing rather than silently appearing to work.

### Ties

- Load `add-api-endpoint` for the service-layer conventions and the error-string contract
  (`classifyRouteError` maps exact phrasings to 404/403).
- Depends on **TM-1**; **blocks TM-3**.
- File footprint overlaps TM-3 (`MarketplaceService.ts`) — **sequence, do not parallelise**.
- Note the routes force `isPublic: true` with a `TODO` about auth context. Curated templates
  are global and tenant-less, so this is fine for TM — leave the TODO, do not "fix" it here.

### Vertical proof

Entry point: `GET /api/templates` as an authenticated user. Hops: route → `hybridAuth` →
`requireTenant` → `MarketplaceService.listTemplates` → `CuratedCatalogProvider` → generated
index. Unmocked: the route chain and the real generated index. End state: three curated
templates returned with title/description/category. Also assert `GET /api/templates/:id`
returns one and **404s for an unknown id** (the route already handles null → 404).
Suite: `tests/integration/`.

### Acceptance criteria

1. `GET /api/templates` returns the three curated templates for an authenticated user.
2. `GET /api/templates/:id` returns one, and an unknown id yields **404**.
3. `category` and `search` filtering work, proven by tests including a no-match case.
4. `MarketplaceService` depends on a `TemplateCatalog` abstraction, not on file paths
   directly, and a second provider could be added without touching routes or client.
5. `publishTemplate` still throws — asserted by a test so a later refactor cannot quietly
   enable it.
6. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

---

## TM-3 — `installTemplate` creates a real workflow via `ImportService` ✅ DONE 2026-08-18

**Found already implemented but never gated.** The work sat uncommitted in the `tm-3`
worktree from an earlier session that stopped without running anything. Every gate below was
run by the reviewer against the settled tree, and **the integration suite caught two real
failures the dev never saw.**

- `type-check` **0 errors** (tsbuildinfo cleared first) · `eslint --max-warnings 0` on all
  seven touched files **exit 0**
- `test:fast` **279 files / 3242 passed / 0 failed** (baseline 3239 → +3)
- `test:integration` **114 files / 1129 passed / 0 failed**, run **alone** against a freshly
  recreated `ezbuildr_test_tm_3` (baseline 113/1123 → +1 file, +6 tests, exactly this
  ticket's new suite)

### 🔴 Reviewer fix — the route trusted a global handler that its own test app never installs

AC3 and the unknown-id case **both returned 500 instead of 403/404**. The diagnosis that
looks right and is wrong: "production registers `errorHandler`, so the test is unrealistic."
Production does register it (`server/index.ts:143`, `server/production.ts:97`) — but
**`registerRoutes` does not**, and `tests/helpers/integrationTestHelper.ts` builds its app
from `registerRoutes` alone. So the test app had no error middleware and Express defaulted
to 500.

Fixing the harness would have been the wrong lever. The repo's actual contract (CLAUDE.md
convention 2, the `add-api-endpoint` skill) is that **the route classifies**, via
`classifyRouteError` — and marketplace is not one of the documented exempt families
(snapshots, secrets, esign, ai-workflowEdit). The route was non-conforming; the test was
asserting the right thing. `classifyRouteError`'s own docstring describes this exact
SEC-029 failure mode: statuses collapsing to 500 and masking 403/404.

`POST /api/templates/:id/install` now wraps the service call in `try`/`catch` +
`classifyRouteError`. **The Zod parses stay outside the `try`** so validation still yields
400 rather than being swallowed into the classifier. Six of six install tests pass.

**Verified by inspection, not assertion** — every load-bearing claim in the implementation's
comments was checked against `ImportService` rather than read:
- `apply(filePath, userId, { targetProjectId })` really returns `ImportApplyResult` with
  `rootId`, so `{ id: result.rootId }` is correct.
- `resolveTargetOwnerForProject` throws `'Target project not found'` / `'Access denied -
  insufficient permissions for target project'` **before anything is written**, and
  `enforceOwnership` / `resolveProjectIdOverride` are both genuinely invoked on the apply
  path. This — not a database backstop — is the tenant boundary, as the ticket required.
- `logger` is not orphaned in `MarketplaceService` (still used by `publishTemplate`).
- The unit tests mock `ImportService` to keep `unit-fast` DB-free and defer real behavior to
  the integration suite, which is the right split and is documented in the test itself.

**Priority: P0** · Size: M · **Depends on TM-1, TM-2** · Files: `server/lib/templates/MarketplaceService.ts`, `server/lib/templates/{CuratedCatalogProvider,TemplateCatalog}.ts`, `server/routes/marketplace.ts`, tests

### Finding

```ts
async installTemplate(_templateId: string, _userContext: { userId: string, projectId: string }) {
    logger.warn('MarketplaceService.installTemplate: marketplaceTemplates table not yet implemented');
    throw new Error('Marketplace functionality not yet available');
}
```

The route `POST /api/templates/:id/install` is complete and passes `{ userId, projectId }`.

### Preferred fix

Delegate to **`ImportService`** with the template's generated bundle. Do **not** write a
second importer: `ImportService` already creates workflow + sections + steps, restores blobs,
and runs the migration-head drift check. A bespoke installer would be a competing code path.

The created workflow must belong to the **caller's tenant** and the requested project — this
is the security-critical part of the ticket. Curated templates are global, but everything
instantiated from one is tenant-scoped like any other workflow.

Decide and document what happens when the same template is installed twice (new workflow each
time is the expected answer) and what the returned shape is — the client redirects to
`/workflows/${workflow.id}/builder`, so it needs an `id`.

### Ties

- Load `add-api-endpoint` (tenancy checks, error contract) and `run-tests`.
- Depends on **TM-2**; overlaps its file — sequence.
- Read `ImportService.ts` before starting; note its `checkMigrationHead` behaviour.
- ⚠️ Tenancy is service-layer today; RLS is not enforced (see
  `tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`). **Do not rely on a database backstop that does
  not exist** — write the explicit tenant check.

### Vertical proof

Entry point: `POST /api/templates/<curated-slug>/install` with a real `projectId`, as an
authenticated user of tenant A. Hops: route → `MarketplaceService.installTemplate` →
`ImportService` → real `workflows` / `sections` / `steps` rows + the DOCX blob. Unmocked:
the import and the database. End state: a workflow exists, owned by tenant A, in the given
project, with the template's sections and steps, and its DOCX retrievable.
**Cross-tenant case:** a user of tenant B installing the same template gets their **own**
workflow in their own tenant, and cannot reach tenant A's. Also assert installing into a
project the caller does not own is rejected. Suite: `tests/integration/`.

### Acceptance criteria

1. Installing a curated template creates a workflow with its sections and steps, and returns
   an object carrying `id`.
2. The workflow is scoped to the caller's tenant and the requested project.
3. Installing into a project the caller does not own is **rejected** (403/404 per the error
   contract), proven by a test.
4. Two installs produce two independent workflows; editing one does not affect the other.
5. The template's DOCX is attached/retrievable on the created workflow.
6. `type-check` 0 · `lint` 0 · `test:fast` above baseline · `test:integration` no new failures.

---

## TM-4 — Fix the client's hardcoded `projectId` before install can work 🔲

**Priority: P1** · Size: S · **Depends on TM-3** · Files: `client/src/pages/Marketplace.tsx`, tests

### Finding

`Marketplace.tsx` sends a literal placeholder, under a block of thinking-out-loud comments
left in the source:

```ts
// For MVP, passing a placeholder.
const projectId = "default";

const res = await fetch(`/api/templates/${templateId}/install`, {
    method: 'POST', ...
    body: JSON.stringify({ projectId })
});
```

There is no project with id `"default"`, so install fails for every user regardless of what
TM-3 does. The preceding comment block (six lines of "Wait, backend `installTemplate`
requires `projectId`…") is scratch reasoning that must not survive.

### Preferred fix

Let the user choose a destination project — a select in the install flow, defaulting sensibly
when the user has exactly one project. Fetch projects through the existing TanStack Query
hook rather than a bare `fetch`; the rest of this page uses `useQuery`/`useMutation` already,
so match it.

Delete the scratch comment block. Also handle the "user has no projects" case rather than
letting install fail opaquely.

### Ties

- **Load the `design` skill before changing this UI** — it is a user-facing surface and the
  repo standard requires it.
- Load `add-api-endpoint` only if a projects endpoint turns out to be missing (it should not be).
- Depends on **TM-3** — there is no point wiring the picker before install works.
- Note `client/src/pages/Marketplace.tsx` also declares a local `Template` interface with
  `usageCount`, `rating`, `isOfficial` fields the curated catalog will not supply. Reconcile
  the type with what TM-2 actually returns rather than faking values.

### Acceptance criteria

1. The user selects a destination project; a single-project user gets a sensible default.
2. No hardcoded `"default"` id remains, and the scratch comment block is deleted.
3. The "no projects" case is handled with a clear message, not a failed request.
4. The page's `Template` type matches what the API actually returns — no invented fields
   rendered as though real.
5. Install succeeds end to end from the UI and redirects to the builder.
6. `type-check` 0 · `lint` 0 · `test:fast` above baseline.

---

## TM-5 — Re-type `TemplateManifest.workflow`, and rule on `exportTemplate` 🔲

**Priority: P1** · Size: S · Files: `server/lib/templates/types.ts`, `MarketplaceService.ts`

### Finding

`server/lib/templates/types.ts` declares:

```ts
workflow: unknown; // The exported workflow schema
```

and `MarketplaceService.exportTemplate` populates it from
`workflow.currentVersion.graphJson`. `exportTemplate` is not called by any route on this board.

> ### 🔴 CORRECTED 2026-08-16 — `graphJson` is NOT a dead graph-builder relic
>
> This ticket originally called `graphJson` "the pre-graph-removal model" and implied
> anything reading it is stale. **That is wrong**, and it was the reviewer's error when
> authoring this board. The column was **repurposed**: it now stores a serialized *runtime
> snapshot* (sections / steps / logicRules), not graph-builder nodes and edges.
>
> Verified: `server/services/workflow-runs/RunDefinitionProvider.ts` parses
> `version.graphJson` through `VersionRuntimeSchema` to serve **pinned run definitions**, and
> `server/services/workflow-runs/RunStateService.ts:165` reads it as `WorkflowContentData`.
> `TemplateService.ts:143` even documents the shift — "post-ICW2-6, blueprint snapshots are
> ingest-shaped". So `graphJson` is load-bearing for running a published workflow.
>
> **Consequences for this ticket:** "it reads `graphJson`" is *not* by itself evidence that
> `exportTemplate` is dead. Judge it purely on whether anything calls it. If it survives, it
> may legitimately keep using `graphJson` — but it should use the runtime-snapshot shape
> TM-1's generator now produces, not assume graph nodes/edges.
>
> `server/realtime/persistence.ts:324-350` *does* still handle `graphJson.nodes`/`.edges` —
> that one is a genuine collab-era relic and is **out of scope here**; note it, do not fix it.

`unknown` also means nothing type-checks the most important field in the manifest.

### Preferred fix

Give `workflow` a real type matching what the catalog actually carries. Then **rule on
`exportTemplate`**: it is either (a) dead code from the removed graph model and should be
deleted, or (b) genuinely wanted for a future publish flow, in which case it must be rebuilt
on `sections`/`steps` — not on `graphJson`.

**Investigate before deciding**, and state the finding: does anything call `exportTemplate`?
If not, deletion is the default. Do not leave a third opinion about workflow shape in the tree.

### Ties

- Depends on **TM-2** (which establishes what the catalog actually returns).
- Related history: the graph-builder removal and the graph run tables drop. `graphJson` being
  `notNull` in the schema does **not** mean it is live — check what writes it before treating
  it as current.
- If deletion is chosen, remove the orphaned imports (`eq`, `workflows`, `db`) it leaves behind.

### Acceptance criteria

1. `TemplateManifest.workflow` has a real type; no `unknown` remains for that field.
2. A written finding on whether `exportTemplate` has any caller, with the evidence.
3. `exportTemplate` is either deleted (with its orphaned imports) or rebuilt on
   `sections`/`steps` — not left reading `graphJson`.
4. `type-check` 0 · `lint` 0 · `test:fast` above baseline.

---

## Gate

- [ ] TM-1..5 ✅ each with a dated verification note
- [ ] **A curated template installs from the deployed `dev` environment**, not just locally —
      this is the criterion that proves the `dist/` bundling actually shipped, and it is the
      one thing no test can establish
- [ ] The gallery is non-empty in a deployed environment
- [ ] `publishTemplate` still throws (user publishing remains out of scope)
- [ ] GH-173 flipped to ✅ in `tickets/ROADMAP_TICKETS.md`, **and the phase/overall counters
      recounted** — recount the rows, do not increment
- [ ] Reviewer has committed each passed ticket

---

## Backlog / observations

- 🔴 **The integration harness does not mirror production's middleware stack, so no
  integration test can verify global error classification.** Found at TM-3.
  `server/index.ts:143` and `server/production.ts:97` register `errorHandler` after routes;
  `registerRoutes` does not, and `tests/helpers/integrationTestHelper.ts` builds its app from
  `registerRoutes` alone. Consequence: **any route that relies on the global handler rather
  than calling `classifyRouteError` itself will answer 500 to every denial under test, and no
  test will ever say so.** Routes that classify at the route level (the documented
  convention) are unaffected, which is why this went unnoticed. Two candidate fixes, and they
  are not equivalent: registering `errorHandler` in the test helper makes the harness honest
  but may flip existing assertions that currently expect 500; auditing routes for missing
  `classifyRouteError` fixes the real defects but leaves the harness lying. Probably both, in
  that order. **Do not fold this into TM — it is a repo-wide audit.** *Tag: needs-initiative.*
- **User publishing** (`POST /api/market/publish`) is deliberately unbuilt. When it is picked
  up it needs a real data model, tenancy scoping, moderation, and a decision about whether
  templates published in `dev`/`test` should ever be visible in `production` (they should
  not — that argues for per-environment publishing with an explicit promotion step, not one
  shared pool). *Tag: needs-initiative.*
- ✅ **RESOLVED 2026-08-16 by the reviewer** (a Stage-5 "reviewer fixes it" — the change was
  three string literals and the context was already in hand). Each `workflow.json`
  `description` is now user-facing copy describing what the template collects and produces;
  the engineering rationale it replaced already lives in `README.md` and each `mapping.md`,
  so nothing was lost. Regenerated the bundles and re-ran the affected suites (21 passed).
  A first attempt rewrote the files with `JSON.stringify` and reflowed every compact array —
  semantically identical but it destroyed the hand-formatting, so it was reverted and redone
  as a literal string replacement: **1 line changed per file.** Original finding follows.
- ~~🔴 **The curated descriptions are developer notes, and they will render to end users.**~~
  TM-1's generated `index.json` carries `title`/`description` verbatim from each
  `workflow.json`, and LD-2 wrote those as internal documentation. The NDA's reads:
  *"Curated starter workflow (LD-2). Collects the facts needed to render
  templates/curated/nda/template.docx… Authored content only — not wired to any importer or
  route; see templates/curated/README.md."* Ticket IDs, repo file paths, and a sentence
  saying the thing is not wired up would all appear on the marketplace card. The same text is
  also written into the `templates.description` entity row, so it follows the workflow after
  install. **This is a content fix in `templates/curated/*/workflow.json`, not a generator
  bug** — TM-1 faithfully passes through what it is given. Must be fixed before the gallery
  is user-visible; sequence it with or before TM-2. *Tag: enhancement.*
- **`Marketplace.tsx` renders `usageCount`, `rating` and `isOfficial`** which no curated
  template supplies. TM-4 reconciles the type; whether the product actually wants ratings is
  a separate product question. *Tag: product-decision.*
- **LD-2's `workflow.json` remains the editable source of truth** and is never itself
  installed — TM-1 generates from it. If a future importer wants to consume it directly, that
  is a second consumer of the same file and fine; what must not happen is two competing
  *install* paths. *Tag: informational.*

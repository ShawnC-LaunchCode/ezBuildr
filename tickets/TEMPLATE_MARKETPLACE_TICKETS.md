# Template Marketplace — make the curated templates installable (TM)

**Status:** open · **Written:** 2026-08-16
**Ticket prefix:** `TM-1..5`
**Parent:** GH-173 in `tickets/ROADMAP_TICKETS.md` (🔲) and the closed LD board
(`tickets/LEGAL_DRAFTING_TICKETS.md`)

---

## How to work this document

- Read this header and **your ticket only**.
- Line numbers are advisory; the **quoted code plus the symbol name** is the locator. Grep
  for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- **Devs do not commit or stage.** The reviewer commits, one commit per passed ticket.
- Baselines at authoring time (`dev` @ `b1511e30`): `test:fast` **274 files / 3209 passed /
  0 failed**; `test:integration` **112 files / 1116 passed / 0 failed**. Any failure is new.
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
| Endpoints | ✅ list / detail / install / publish | `server/routes/marketplace.ts` |
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

## TM-1 — Build-time generator: curated JSON → portability bundles in `dist/` 🔲

**Priority: P0** · Size: M · Files: `scripts/` (new generator), `package.json` build script,
`templates/curated/**` (read-only), tests

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

## TM-2 — Curated catalog provider behind `MarketplaceService` 🔲

**Priority: P0** · Size: M · **Depends on TM-1** · Files: `server/lib/templates/`, tests

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

## TM-3 — `installTemplate` creates a real workflow via `ImportService` 🔲

**Priority: P0** · Size: M · **Depends on TM-1, TM-2** · Files: `server/lib/templates/MarketplaceService.ts`, tests

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
`workflow.currentVersion.graphJson` — **the pre-graph-removal model**. `graphJson` still
exists in the schema (`shared/schema/workflow.ts:147,220`, `notNull`), so this compiles, but
the graph builder and graph run tables were removed and `sections`/`steps` are the source of
truth. `exportTemplate` is not called by any route on this board.

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

- **User publishing** (`POST /api/market/publish`) is deliberately unbuilt. When it is picked
  up it needs a real data model, tenancy scoping, moderation, and a decision about whether
  templates published in `dev`/`test` should ever be visible in `production` (they should
  not — that argues for per-environment publishing with an explicit promotion step, not one
  shared pool). *Tag: needs-initiative.*
- **`Marketplace.tsx` renders `usageCount`, `rating` and `isOfficial`** which no curated
  template supplies. TM-4 reconciles the type; whether the product actually wants ratings is
  a separate product question. *Tag: product-decision.*
- **LD-2's `workflow.json` remains the editable source of truth** and is never itself
  installed — TM-1 generates from it. If a future importer wants to consume it directly, that
  is a second consumer of the same file and fine; what must not happen is two competing
  *install* paths. *Tag: informational.*

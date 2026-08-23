# Interview Structure — Sections above Pages (SECT-1..10 + backlog)

Source: feature request from the repo owner + a codebase audit of the workflow
hierarchy, 2026-08-18.
Owner rulings refreshed 2026-08-23: all environment data is disposable test
data; the RLS implementation is complete in code and dev is free for this epic;
Sections cannot be empty; and removing a Section's last page requires explicit
user confirmation because it deletes the Section.
Scope: `shared/schema/workflow.ts`, `server/services/SectionService.ts`,
`server/repositories/SectionRepository.ts`, `server/routes/sections.routes.ts`,
`server/services/VersionService.ts`, `server/services/portability/entityGraph.ts`,
`server/services/workflow-runs/RunRuntimeService.ts`, `shared/workflowLogic.ts`,
the builder outline (`client/src/components/builder/SidebarTree.tsx`,
`sidebar/`, `pages/`) and the runner
(`client/src/pages/WorkflowRunner.tsx`, `client/src/components/runner/`,
`client/src/hooks/runner/`).

Overall grade at audit time: **N/A — this is new capability, not a defect.** The
audit's one finding about existing code is a *naming* problem (below), not a bug.

Every finding below was verified against the working tree at audit time. **Line
numbers are advisory** — they were accurate when written and drift as work
lands. The locator is the quoted code and the named symbol; grep for those. A
stale line number is not a broken ticket and does not need re-issuing.

---

## The problem this initiative solves

A divorce petition interview can run to ~100 pages of questions. Today the
builder shows them as one flat list and the runner walks them in a straight
line with a progress bar. There is no way to say "these eleven pages are the
Assets part" — not while authoring, and not while answering.

This initiative adds one grouping layer **above** pages:

```
Workflow  →  Section  →  Page  →  Question
```

- **Authoring:** the Document Outline nests pages under a Section, the way
  questions already nest under a page.
- **Answering:** a persistent left-hand nav lists Sections and their pages, so
  a respondent can see where they are in a long interview and jump back.
- **A page does not need a Section.** Ungrouped pages are first-class.

### The naming collision, and why Phase 0 exists

The audit's central finding: **the DB table `sections` already means "page".**

```ts
// shared/schema/workflow.ts — `sections`
export const sections = pgTable("sections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id")...,
    title: varchar("title").notNull(),
    order: integer("order").notNull(),
    visibleIf: jsonb("visible_if"),
```

```ts
// shared/schema/workflow.ts — `steps`
    sectionId: uuid("section_id").references(() => sections.id, ...).notNull(),
```

The UI has *already* diverged from it and calls these Pages —
`SidebarHeader` renders **"Add Page"**, `SectionSettingsDialog` renders
**"Page Settings: {title}"**, `SectionGeneralSettings` renders **"Page
Title"**, and `SidebarTree` renders **"No pages yet."** So the word "Section"
is free at the user level and taken at the code level, in opposite directions.

Building the new layer without resolving this would leave the codebase saying
`section` for two different things one level apart in the same tree. **Decision
D-1 (below) is to rename first.** Phase 0 does nothing a user can see; it makes
Phases 1–4 legible.

---

## How to work this document

- **Tickets are grouped into 5 phases**, ordered by risk and dependency. Do not
  start a phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer.
- Each ticket has **Finding**, **Preferred fix**, **Ties**, and **Acceptance
  criteria** (all must pass), plus **Vertical proof** on any ticket spanning
  more than one layer.
- **Read the Decisions section below before starting any ticket.** Several
  design questions were settled by the repo owner up front; re-litigating one
  in a ticket is an automatic send-back.
- **Load the project skills named in each ticket's Ties first.** In particular:
  - `db-schema-change` for anything touching `shared/schema/` or `migrations/`
  - `add-api-endpoint` for anything under `server/routes|services|repositories/`
  - `run-tests` before running any test — `npm test` naively gives wrong results
  - `verify` to prove behavior against the live local app
  - **`design`** — the repo owner's standing instruction is that the design
    skill is loaded for *any* UI work. Every ticket in Phases 2 and 4 requires it.
- **Vocabulary is phase-dependent.** Before Phase 0 lands, `section` in code
  means *page*. After it lands, `page` means page and `section` is free for the
  new group layer. A ticket written for Phase 1+ uses the post-rename names.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 0 | Vocabulary migration: `sections` → `pages` | SECT-1..2 | ~1.5 days |
| 1 | Sections exist and persist end-to-end | SECT-3..4 | ~2 days |
| 2 | Builder authoring | SECT-5..6 | ~2 days |
| 3 | Section-level visibility logic | SECT-7 | ~1.5 days |
| 4 | Reached-state persistence + runner navigation | SECT-8A, SECT-8B, SECT-9 | ~3 days |
| 5 | Documentation alignment (carried from GH-174) | SECT-10 | ~2 hours |
| Backlog | Not phase-gated | SECT-B1..B6 | |

### Ticket collision map (dispatch is a lookup against this)

| Ticket | Primary footprint | Collides with |
|---|---|---|
| SECT-1 | ~511 files, repo-wide | **everything** — dispatch alone, in a worktree, with no concurrent work |
| SECT-2 | `migrations/`, `shared/schema/workflow.ts` | SECT-1 (must follow it) |
| SECT-3 | `shared/schema/workflow.ts`, `server/{routes,services,repositories}/` | SECT-4 |
| SECT-4 | `VersionService.ts`, `entityGraph.ts`, `RunRuntimeService.ts` | SECT-3 (must follow it) |
| SECT-5 | `client/src/components/builder/sidebar/`, `SidebarTree.tsx` | SECT-6 |
| SECT-6 | `client/src/components/builder/pages/PageCanvas*` | SECT-5 (adjacent; sequence) |
| SECT-7 | `shared/workflowLogic.ts`, `LogicService.ts`, map, simulator | none in-phase |
| SECT-8A | `shared/schema/run.ts`, run repository/service/routes | none; must precede SECT-8B/9 |
| SECT-8B | runner layout + new nav | SECT-9 (must precede it) |
| SECT-9 | `client/src/hooks/runner/`, runner nav, preview | SECT-8A/8B (must follow both) |
| SECT-10 | `docs/`, `README.md`, `CLAUDE.md` | none — but must run last |

---

## Decisions (settled by the repo owner, 2026-08-18 — do not re-litigate)

| # | Decision |
|---|---|
| **D-1** | **Rename first.** `sections` → `pages` lands as Phase 0, before any feature work. The new group layer is then called `sections` in **both** code and UI, so the two vocabularies match permanently. The alternative (build as `chapters`, live with a split vocabulary) was measured at ~511 files either way and rejected — the rename is the same size whenever it happens, and doing it first means the feature is never written in the wrong words. |
| **D-2** | **One flat page order; a Section is a contiguous span over it.** `pages.order` stays the single source of truth for run order. A Section is a label over a contiguous run of it, and its position is derived from its first page. There is no `sections.order` column or Section-reorder endpoint: reordering a Section moves its page span through the atomic page-reorder endpoint. Nothing that consumes run order today (`skip_to`, the reorder warning, the workflow map, the simulator) learns a composite sort. |
| **D-3** | **A page does not need a Section.** `pages.section_id` is nullable. An ungrouped page can sit anywhere in the order — before, between, or after Sections. It renders at the top level of the outline and the runner nav. |
| **D-4** | **Runner nav: jump back freely, forward only to reached pages.** Unreached pages and Sections are **shown but greyed out and non-interactive** — not hidden. The respondent can see the whole shape of the interview; they just cannot skip ahead. This preserves the existing validate-then-advance contract, where forward movement runs server-side submit + `skip_to` resolution that decides the real next page. |
| **D-5** | **Sections carry their own `visible_if` in v1.** Precedence is explicit and one-directional: **a hidden Section hides every page inside it, regardless of that page's own `visibleIf`.** A visible Section does not override a page's own `visibleIf`. |
| **D-6** | **Greyed ≠ hidden.** A page excluded by `visibleIf` is not part of this run and does not appear in the nav at all. A page that is *visible but not yet reached* appears greyed. Conflating these is the most likely way SECT-8B gets sent back. |
| **D-7** | **Deleting a Section unassigns its pages; it never deletes them.** Pages keep their order and become ungrouped. Sections are **hard**-deleted — the soft-delete on `pages`/`steps` exists to protect cascaded `step_values` (ICW2-B1), and a Section holds no respondent answers, so copying that pattern here would be cargo-culting. |
| **D-8** | **Logic *rules* cannot target a Section in v1.** `logic_rules.targetType` stays `page`/`step`. Section-level show/hide is expressed through `sections.visible_if` only. Extending the rule engine is backlog SECT-B2. |
| **D-9** | **Sections are never empty.** Creating a Section assigns at least one page in the same transaction. A reorder that would remove a Section's last page is rejected unless the request explicitly names that Section for deletion; the UI obtains confirmation before retrying with that authorization. On confirmation the Section is hard-deleted and the moved page completes its requested move. This keeps the invariant enforceable for API clients and concurrent edits, not merely as UI etiquette. |
| **D-10** | **Visibility lint is conservative, not a theorem prover.** V1 does not attempt to prove whether an arbitrary condition can ever be true. A Section may reference answers only from pages strictly before its first page; self/later dependencies and script conditions (whose dependencies are opaque) are publish-blocking. Existing structural, dangling-reference and cycle lints also apply. A `skip_to` page inside any conditionally visible Section is publish-blocking; authors must target an unconditional Section or remove the Section condition. These rules may reject a logically safe advanced case, but cannot approve a Section the respondent cannot reveal or a jump that strands the run. Smarter implication/script dependency analysis is future work. |

---

# Phase 0 — Vocabulary migration

Rename the existing "section" concept to "page" across the codebase, freeing
the word "section" for the new group layer. **No user-visible behavior changes
in this phase.** The UI already says "Page"; this makes the code agree.

The phase is split so that the tree is green at every commit: SECT-1 renames
TypeScript symbols, API paths and JSON keys while the *database* keeps its
current object names via Drizzle's name mapping; SECT-2 then performs the
physical DDL rename and removes the mapping. Doing both at once produces a
single unreviewable commit spanning 511 files *and* a migration.

## SECT-1 — Rename `sections` → `pages` in TypeScript, API paths and JSON contracts ✅

**Done and independently verified:** 2026-08-23 · implemented in dedicated
worktree `sect-1`. Clean type-check and lint; fast 3,283/3,283; unit
3,443/3,443; integration 1,185 passed + 3 skipped; strict zones 6/6. Fresh
migration and exact catalog assertions passed. Senior review corrected Slack,
DOCX and non-entity UI `section` false positives before acceptance.

**Corrective verification:** 2026-08-23 · removed the remaining legacy page
vocabulary from `README.md`, `openapi.yaml`, and the curated-template README.
The OpenAPI document now parses with one `components` map and one `paths` map;
all 33 paths and 28 schemas resolve without retired Section contracts. Uncached
type-check, lint, and fast 3,283/3,283 are green after the correction.

**Priority: P1** · Size: L · File: repo-wide (~511 files)

### Finding

The exported Drizzle symbol, and every symbol derived from it, names the page
concept "section":

```ts
// shared/schema/workflow.ts
export const sections = pgTable("sections", { ... });
export const steps = pgTable("steps", {
    sectionId: uuid("section_id").references(() => sections.id, ...).notNull(),
```

Measured blast radius at audit time:

| Surface | Count |
|---|---|
| Source files mentioning `section` (case-insensitive) | **511** — server 91, shared 21, `client/src` 192, tests 207 |
| Raw identifier occurrences | **~10,400** |
| Public API path families | **4** — `/api/workflows/:workflowId/sections`, `/api/sections/:sectionId`, `/api/runs/:runId/sections`, `/api/workflows/:workflowId/sections/reorder` |
| Persisted JSON keys | `graph_json.sections[]` (`VersionService.serializeWorkflow`, `workflow_versions` + `workflow_blueprints`); `sections` in the AI output schema (`shared/types/ai.ts`); the portability entity name `'sections'` (`entityGraph.ts`) |
| Docs / scripts | 39 + 38 files, plus `CLAUDE.md` |

The persisted-JSON hop is normally where a rename gets expensive, but **all
three environment databases hold only disposable test data** (reconfirmed by
the repo owner 2026-08-23; the marketplace bundles
in `scripts/generateMarketplaceBundles.ts` are build-time generated, not
committed artifacts). So the keys can be renamed outright — **no compat reader,
no jsonb backfill.** Do not build one.

### Preferred fix

A single mechanical sweep, in its own worktree, with no other work in flight.

**Keep the database object names unchanged in this ticket** by pinning them in
the Drizzle table definition, so no migration is required and the tree stays
green:

```ts
// shared/schema/workflow.ts — after SECT-1, before SECT-2
export const pages = pgTable("sections", {          // TS name changes; DB name pinned
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id")...,
```

```ts
export const steps = pgTable("steps", {
    pageId: uuid("section_id").references(() => pages.id, ...).notNull(),
```

The same pinning applies to `blocks.section_id`, `lifecycle_hooks.section_id`,
`logic_rules.target_section_id`, `transform_blocks.section_id` and
`workflow_runs.current_section_id`. SECT-2 removes every pin.

**Persisted enum labels are the exception to “no physical DB change.”**
PostgreSQL enum labels cannot be name-pinned independently from their
application values. Two enums contain page-as-Section vocabulary and migration
`0037_*` renames all three labels in place:

```sql
ALTER TYPE "logic_rule_target_type" RENAME VALUE 'section' TO 'page';
ALTER TYPE "block_phase" RENAME VALUE 'onSectionEnter' TO 'onPageEnter';
ALTER TYPE "block_phase" RENAME VALUE 'onSectionSubmit' TO 'onPageSubmit';
```

Those operations update existing test rows in place. `onRunStart`, `onNext`,
`onRunComplete`, and the already-correct lifecycle phases `beforePage`/
`afterPage` do not change. Rename the phase unions, defaults, UI values/labels,
serialized definitions, AI schema, scripts, docs and tests with the rest of the
contract. Do not add a repository translation layer or leave both labels
behind; either would create temporary vocabulary that SECT-2 then has to
discover and remove.

Rename in this order, running `npm run type-check` after each to keep the
error list small and attributable: `shared/` → `server/` → `client/src/` →
`tests/` → `scripts/` → `docs/` + `CLAUDE.md`.

**This is not a blind find-and-replace.** The word "section" has unrelated
meanings in this tree that must be left alone. Before replacing any occurrence,
confirm it refers to the workflow entity. Known non-entity uses:

- HTML `<section>` elements and Tailwind/CSS class names
- Prose in docs and comments ("the section below", "this section of the file")
- DOCX/`RenderCore` document sections
- Any `Section` imported from a third-party library

Rename user-facing strings too, where any still say "Section" for a page —
`LogicPanel.tsx` renders `Section: {section.title}` and `LogicRuleEditor.tsx`
offers a `<SelectItem value="section">Section</SelectItem>`; both mean *page*
and both are visible to a builder.

Rename the route files themselves (`sections.routes.ts` → `pages.routes.ts`,
`SectionService.ts` → `PageService.ts`, `SectionRepository.ts` →
`PageRepository.ts`, and the client's `useSections` → `usePages` etc.) so the
filenames match their contents.

The logic engine's result shape renames with everything else —
`visibleSections`/`hiddenSections`/`skipToSectionId` in `shared/workflowLogic.ts`
become `visiblePages`/`hiddenPages`/`skipToPageId`. **Phase 3 then reuses the
freed `visibleSections` name for the actual group layer**, so getting this
right here is what makes SECT-7 readable.

### Ties

- **Blocks the entire rest of this file.** Nothing else starts until SECT-1 and
  SECT-2 are committed.
- **Dispatch alone.** This ticket invalidates quoted-code anchors across the
  repo. The RLS implementation and Template Marketplace work that previously
  blocked it are complete in code as of 2026-08-23; test-server human QA and
  production promotion do not block `dev`. Still confirm no other board is
  mid-dispatch and the repo owner's second IDE has no overlapping uncommitted
  work before starting. TM-5 already typed the `graph_json` runtime snapshot as
  `WorkflowContentData` (`WorkflowContentIngestService`), so that is the shape
  this rename touches.
- Load `db-schema-change` (the Drizzle name-pinning above), `add-api-endpoint`
  (route/service/repository conventions), and `run-tests`.
- Work in a dedicated worktree: `pwsh scripts/new-worktree.ps1 -Name sect-1`.
  Do **not** use `-LinkModules` — this ticket runs Vitest heavily.
- File footprint: repo-wide plus `migrations/0037_*.sql` and migration metadata.
  No parallel work is possible alongside it.

### Vertical proof

- **Path:** builder loads `GET /api/workflows/:id/pages` → `PageService.getPages()`
  → `PageRepository` → the (still-named `sections`) table → outline renders →
  publish writes `graph_json.pages[]` → `GET /api/runs/:runId/runtime` returns
  `pages` → runner walks them.
- **Real, not mocked:** the DB hop and the publish→runtime hop. A rename that
  compiles but breaks the pinned-definition read is exactly the failure this
  proof exists to catch.
- **Cross-tenant denial:** `GET /api/workflows/:id/pages` as a user without
  access to that workflow → 403 `Access denied`, unchanged from the pre-rename
  `WorkflowService.verifyAccess`/`classifyRouteError` contract. The original
  draft said 404, but an unmodified-baseline integration proof on 2026-08-23
  established that claim was wrong; this vocabulary ticket must not alter auth
  semantics to manufacture it.
- **Suite:** `npm run test:integration` in full — specifically the workflow,
  run and portability integration tests. `test:fast` cannot close this ticket.

### Acceptance criteria

1. No TypeScript symbol, filename, API path, route handler, client hook, or
   test helper refers to the page concept as "section". `grep -ril "section"`
   over `server/ shared/ client/src/ tests/` returns only the documented
   non-entity uses (HTML/CSS, DOCX, prose) — and the dev's report lists them.
2. Public API paths are `/api/workflows/:workflowId/pages`,
   `/api/pages/:pageId`, `/api/runs/:runId/pages`, and
   `/api/workflows/:workflowId/pages/reorder`. No alias or redirect is left
   behind for the old paths.
3. `graph_json` written by `VersionService.serializeWorkflow` uses the key
   `pages`; the AI output schema in `shared/types/ai.ts` uses `pages`; the
   portability `ENTITY_GRAPH` entity is named `pages` and its child descriptor's
   `parent.fk` is `pageId`. No back-compat reader for the old keys exists.
4. `shared/schema/workflow.ts` exports `pages` (not `sections`), with table,
   column, index and constraint names pinned to their current DB names. The only
   physical changes are migration `0037_*` renaming
   `logic_rule_target_type.section` → `page` and `block_phase` values
   `onSectionEnter`/`onSectionSubmit` → `onPageEnter`/`onPageSubmit`. A fresh
   `db:migrate` plus catalog assertions prove the three exact enum labels and
   pinned physical table/column names. Do **not** apply `db:push`: after the RLS
   rollout it treats unmanaged policies as drift and proposes destructive
   policy removal, so it is no longer a valid parity gate.
5. `shared/workflowLogic.ts` exports `visiblePages`/`hiddenPages`/`skipToPageId`
   in place of the `*Sections`/`skipToSectionId` names, and every consumer is
   updated.
6. User-facing strings that said "Section" for a page now say "Page" —
   including `LogicPanel.tsx` and the `LogicRuleEditor.tsx` target selector,
   whose stored `targetType` value also becomes `page`.
7. `CLAUDE.md` and `docs/claude/SCHEMA.md` are updated to the new vocabulary,
   including a note that the group layer added in Phase 1 is the new `sections`.
8. Existing tests are renamed and updated in place, not deleted. The suite's
   **test count does not drop** — the dev's report states the before and after
   counts for each project.
9. The Vertical proof path passes end to end with the DB and publish hops
   unmocked.
10. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
    `npm run test:fast`, `npm run test:unit` and `npm run test:integration` all
    green, and `bash .husky/pre-commit`'s `check:strict-zones` passes.

---

## SECT-2 — Physical DB rename: `sections` → `pages`, and drop the name pins ✅

**Passed:** 2026-08-23 · Senior-reviewed in the dedicated `sect-2` worktree
from `dev` dispatch head `7486fa4c`. Migration `0038` is metadata-only and was
proved from both a fresh chain and the exact `0037` pre-head using only local
PostgreSQL. Independent gates: type-check 0, lint 0, fast 3,283, unit 3,443
(160 DB), integration 1,187 passed + 3 skipped, restricted-role RLS 1,190/1,190
with zero allowlisted failures, and strict zones 6/6. Independent acceptance
audit passed; verification used no remote DB or `db:push`.

**Priority: P1** · Size: M · File: `migrations/0038_*.sql`, `shared/schema/workflow.ts`

### Finding

After SECT-1 the TypeScript says `pages` while the database still says
`sections`, held together by the pins SECT-1 added:

```ts
export const pages = pgTable("sections", { ... });   // pin to remove
```

The physical objects still carrying the old name, from
`migrations/0000_init_baseline.sql`:

- the table `sections`
- FK columns `blocks.section_id`, `lifecycle_hooks.section_id`,
  `logic_rules.target_section_id`, `steps.section_id`,
  `transform_blocks.section_id`, `workflow_runs.current_section_id`
- indexes `sections_workflow_idx`, `sections_deleted_at_idx`,
  `steps_section_idx`, `workflow_runs_current_section_idx`
- every FK constraint named `*_section_id_sections_id_fk`

RLS is now fully implemented in code (RLS-1..7, 2026-08-23). PostgreSQL stores
policy expressions as object/column references, not loose SQL strings, so an
`ALTER TABLE/ALTER COLUMN ... RENAME` preserves the attached policies. The old
baseline migrations contain text such as:

```sql
-- migrations/0001_enable_rls.sql
IF to_regclass('sections') IS NOT NULL THEN
    ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON sections;
    CREATE POLICY tenant_isolation ON sections
      ... WHERE w.id = sections.workflow_id
```

Do **not** copy or re-issue those obsolete `0001`/`0005` definitions: later RLS
migrations replaced and extended them. Instead, prove after the rename that the
current policies remain attached to `pages` and still enforce through the
restricted application-role gate.

### Preferred fix

One migration after SECT-1 (`0037_*`, so this is `0038_*`). `ALTER TABLE ...
RENAME` preserves data, constraints, indexes and policies,
so this is a metadata-only change — but constraint and index *names* do not
follow, and must be renamed explicitly so the schema stays legible and matches
what `db:generate` would produce.

**Author the migration via `npm run db:generate`, never by hand-editing the
journal** — load `db-schema-change` first; the migration chain was regenerated
2026-07-19 and intuition about how it runs here is wrong. Drizzle emits
`DROP TABLE`/`CREATE TABLE` for a rename it cannot infer, so verify the
generated SQL is `ALTER TABLE ... RENAME TO ...` and correct it if not — a
generated drop-and-recreate on this table is data loss and an automatic F.

Then delete every pin SECT-1 added, so the Drizzle definition reads plainly:

```ts
export const pages = pgTable("pages", {
    ...
    pageId: uuid("page_id")...
```

⚠️ **`db:migrate` runs against whatever `DATABASE_URL` points at.** Confirm the
local `.env` points at the dev Neon branch before running it (see LU-B1 in
`tickets/backlog/`). Never run a migration against production from a dev machine.

### Ties

- **Must follow SECT-1.** It is meaningless before it and trivial after it.
- Load `db-schema-change` **first** — this is exactly the work it exists for.
- Also load `run-tests`: the test harness applies `.sql` files its own way, and
  a rename migration that looks correct in Drizzle metadata can still break
  fresh test-schema setup.
- File footprint: `migrations/0038_*.sql`, `migrations/meta/`,
  `shared/schema/workflow.ts`. Small, but it collides with any other migration
  authored in parallel — see the migration-index-collision note in
  `tickets/BACKLOG.md`. Check for unmerged migrations before starting.

### Vertical proof

- **Path:** `npm run db:migrate` against a fresh database → the integration
  suite's `beforeAll` schema setup → `GET /api/workflows/:id/pages` returns rows
  → a run completes and writes `workflow_runs.current_page_id`.
- **Real, not mocked:** the migration itself and the DB hop. This ticket is DDL;
  there is nothing to prove without a real database.
- **Cross-tenant denial:** after the rename, a query executed as the restricted
  application role returns zero rows for another tenant — use the current RLS
  gate rather than an obsolete baseline-policy fixture.
- **Suite:** `npm run test:integration` (needs DB; start it with
  `npm run test:docker:up`).

### Acceptance criteria

1. Migration `0038_*.sql` renames the table, all six FK columns, all four
   indexes, and every `*_section_id_sections_id_fk` constraint to the `page`
   vocabulary, using `ALTER TABLE ... RENAME` — the file contains no
   `DROP TABLE "sections"`.
2. The migration does not recreate policies from obsolete migrations. A test
   queries the post-migration catalog to prove the current policies remain
   attached to `pages`, and the restricted-role RLS gate proves they still
   enforce after the rename.
3. `shared/schema/workflow.ts` contains no pinned legacy names — every
   `pgTable`/column name argument matches its TypeScript identifier.
4. `npm run db:migrate` applies cleanly to a database at the pre-migration head.
   Catalog assertions prove the renamed objects match the Drizzle schema and
   current RLS policies remain attached. `db:push` is not applied because it
   does not model the current RLS policy layer and proposes destructive false
   drift.
5. A catalog test proves the current policies survived attached to `pages`, and
   the restricted-role RLS gate still denies another tenant after the rename.
   No acceptance criterion depends on recreating obsolete policy SQL.
6. The Vertical proof path passes with a real migration run against a real DB.
7. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:unit` and `npm run test:integration` green.

---

## Phase 0 Gate

**Verified and committed by the senior reviewer:** 2026-08-23 · Independent
gates are green: type-check 0, lint 0, fast 3,283/3,283, unit 3,443/3,443 (DB unit
160/160), and integration 1,194 passed + 3 skipped across 128 files. A fresh
local PostgreSQL 16 database accepted the complete migration chain; catalog
checks found `pages`, no legacy `sections` table, and the current
`tenant_isolation` policies attached to workflows/pages/steps. The restricted
RLS integration gate was included in the green integration run; PostgreSQL
reported zero signal-11 crashes.

The shared dev Neon branch already contained all three physical SECT-1 enum
renames but was missing the 0037 ledger record. Following the schema-change
playbook, the reviewer verified the exact enum/table preconditions, stamped
only that already-applied migration, and then `npm run db:migrate` applied
0038 normally. No `db:push` was used.

Live local proof added a second page, renamed the pages, persisted the reordered
`Details → Welcome` sequence across reload, published, and completed a run that
walked both pages. Evidence:
`.playwright-mcp/phase0-builder-pages-reordered.png`,
`.playwright-mcp/phase0-published.png`,
`.playwright-mcp/phase0-run-details.png`,
`.playwright-mcp/phase0-run-welcome.png`, and
`.playwright-mcp/phase0-run-complete.png`. The disposable tenant, user,
workflow, run, and audit rows were removed and verified absent.

- [x] SECT-1 and SECT-2 both ✅ with dated verification notes
- [x] `npm run type-check` → 0 errors; `npm run lint` → clean
- [x] `npm run test:fast`, `test:unit`, `test:integration` all green, with test
      counts equal to or greater than the pre-Phase-0 baseline
- [x] Fresh `db:migrate` succeeds; catalog assertions prove enum/object parity
      and the restricted-role RLS gate remains green (`db:push` is not applied
      because it proposes removal of unmanaged RLS policies)
- [x] Live check via the `verify` skill: builder loads a workflow, adds a page,
      reorders pages, publishes, and a run walks them — screenshots attached
- [x] `CLAUDE.md` reflects the new vocabulary
- [x] Reviewer has committed each passed ticket + this gate

---

# Phase 1 — Sections exist and persist

Introduce the group layer and make it survive every hop a workflow takes:
authoring reads/writes, publish, run runtime, export/import, and diff. **No UI
in this phase** — Phase 1 closes at *Code complete*, not *User-reachable*, and
its tickets are titled accordingly.

## SECT-3 — Non-empty `sections`, nullable `pages.section_id`, and contiguous membership ✅

**Passed:** 2026-08-23 · Senior-reviewed from `dev` dispatch head `9312b842`.
Migration `0039_slimy_leader.sql` was generated with Drizzle and extended only
with the current Section RLS policy. The real-DB vertical proof, atomic rollback
cases, exact 404/403 tenancy contract, restricted-role RLS, client reorder
compatibility, and concurrent creation serialization all passed. Independent
gates: type-check 0, lint 0, fast 3,289/3,289 (baseline 3,283), unit
3,449/3,449, integration 1,200 passed + 3 existing admin-DB skips, and focused
Section/API/RLS proof 75/75. Senior grade: A; no deviations or blockers.

**Dispatched:** 2026-08-23 · Phase 0 gate committed at `706b54f8`. Migration
`0039` is reserved for this ticket. Senior review additionally requires
serialization of concurrent membership changes, immutable `sectionId` on
generic page CRUD, restricted-role RLS proof, and compatibility updates for
the existing builder reorder payload.

**Priority: ENH** · Size: L · File: `shared/schema/workflow.ts`, `server/services/SectionService.ts` (new)

### Finding

New capability. Post-Phase-0 the hierarchy is `workflows → pages → steps` and
nothing groups pages. `PageService.reorderPages` (the renamed
`SectionService.reorderSections`, still the donor pattern) rewrites a flat order:

```ts
  async reorderSections(
    ...
    await db.transaction(async (tx) => {
```

and warns about rules a reorder would break:

```ts
  private async findBackwardSkipRules(workflowId: string): Promise<ReorderSkipRuleWarning[]> {
```

Both behaviors must survive; grouping must not fork run ordering into a second
sort key (**D-2**).

### Preferred fix

Add a `sections` table mirroring the shape and conventions of `pages`:

```ts
export const sections = pgTable("sections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    visibleIf: jsonb("visible_if"),          // evaluated in SECT-7, stored here
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("sections_workflow_idx").on(table.workflowId),
]);
```

and a nullable FK on pages: `sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'set null' })`.

**`onDelete: 'set null'` is the schema-level expression of D-7** — deleting a
Section orphans its pages rather than destroying respondent-bearing content.
**No `deletedAt`**: the soft-delete on pages/steps exists to protect cascaded
`step_values`, and a Section holds no answers (D-7).

**The invariant, enforced in the service and tested:**

> Every Section owns at least one page. Pages grouped by `section_id` form
> **contiguous, non-overlapping spans** of `pages.order`. Ungrouped pages
> (`section_id IS NULL`) may sit anywhere between spans.

`pages.order` remains the only thing that determines run order (D-2).
There is deliberately no `sections.order`: a Section's position is the order of
its first page, and moving a Section means moving that whole page span. This
removes redundant order state that could drift.

Postgres cannot express this as a constraint, so it is a service-layer
validation with its own unit tests — write a single exported helper
(e.g. `assertValidSectionSpans`) called from every mutating path, rather than
open-coding the check in each handler. The helper checks both contiguity and the
non-empty invariant.

Section creation and initial membership are one transaction. `POST
/api/workflows/:workflowId/sections` requires a non-empty `pageIds` array; the
named pages must belong to that workflow and the resulting layout must satisfy
the invariant. The builder's Add Section dialog requires at least one page
selection rather than persisting an empty placeholder.

**Membership and order change together, in one call.** Extend the existing
reorder endpoint rather than adding a second endpoint that can desync:

```
PUT /api/workflows/:workflowId/pages/reorder
  {
    pages: [{ id, order, sectionId }],       // sectionId required; null = ungrouped
    deleteEmptySectionIds: []                // explicit authorization, normally empty
  }
```

If the proposed layout empties a Section not named in
`deleteEmptySectionIds`, reject the transaction with **409** and name it. The UI
uses that response to ask, “Moving the last page will also delete Section X.
Continue?” If confirmed, it retries with that Section id; the server verifies
the Section really becomes empty, hard-deletes it, and commits the page move in
the same transaction. This is the API expression of D-9 and protects direct API
clients and concurrent sessions as well as the builder.

Add CRUD mirroring `pages.routes.ts` exactly — same `hybridAuth`, same
`createLimiter` on POST, same `autoRevertToDraft`, same `classifyRouteError`
error-string contract:

```
POST   /api/workflows/:workflowId/sections
GET    /api/workflows/:workflowId/sections
PUT    /api/sections/:sectionId
DELETE /api/sections/:sectionId
```

### Ties

- **Blocks SECT-4..9.** Nothing downstream exists without this.
- **Must follow the Phase 0 Gate.** Writing it pre-rename guarantees a conflict.
- Load `add-api-endpoint` (the 3-tier pattern, tenancy checks, and the exact
  error-string contract `classifyRouteError` maps to 404/403) and
  `db-schema-change` (migration authoring) **before** touching code.
- Donor patterns to copy, not reinvent: `server/routes/pages.routes.ts`,
  `server/services/PageService.ts`, `server/repositories/PageRepository.ts`
  (all three are the Phase-0 renames of the `Section*` files).
- File footprint: `shared/schema/workflow.ts`, `migrations/0039_*.sql`,
  `server/routes/sections.routes.ts` (new), `server/services/SectionService.ts`
  (new), `server/repositories/SectionRepository.ts` (new), plus the reorder
  handler in `pages.routes.ts`/`PageService.ts`. Collides with SECT-4.

### Vertical proof

- **Path:** `POST /api/workflows/:id/sections` with one initial page id →
  `SectionService.createSection()` → real `sections` row and membership in one
  transaction → `PUT /api/workflows/:id/pages/reorder` assigning two more
  pages into it → `GET /api/workflows/:id/pages` returns all three with
  `sectionId` set and contiguous `order` → `DELETE /api/sections/:id` → the same
  three pages come back with `sectionId: null` and **unchanged `order`**.
- **Real, not mocked:** the DB hop throughout. The contiguity invariant is a
  statement about persisted rows; a mocked repository proves nothing about it.
- **Cross-tenant denial:** `POST /api/workflows/:id/sections` with tenant B's
  workflow id → 404 and **no row written** (assert the table is empty, with a
  fixture that would otherwise have created one — an empty-table assertion over
  an empty fixture passes trivially).
- **Suite:** `tests/integration/api.sections.test.ts` (new; integration project,
  needs DB).

### Acceptance criteria

1. `sections` table exists with the columns above, **no `order` column**, a
   `sections_workflow_idx` index, and a `0039_*` migration authored via `npm run
   db:generate`.
2. `pages.section_id` is nullable with `ON DELETE SET NULL`; a page with no
   Section is valid and round-trips through every endpoint.
3. Migration `0039_*` adds an RLS policy for `sections` using the current
   post-RLS-7 pattern in `docs/architecture/TENANT_ISOLATION_RLS.md` — do not
   copy the obsolete baseline policy. A new tenant-scoped table without one is
   a standing violation of convention 7 in `CLAUDE.md`.
4. All four section endpoints exist with `hybridAuth`, tenancy checks in the
   service layer, Zod-validated bodies, and `classifyRouteError` mapping —
   matching `pages.routes.ts` handler-for-handler.
5. Creating a Section requires at least one page id and writes the Section plus
   initial membership atomically. Empty `pageIds`, cross-workflow ids and a
   resulting non-contiguous span are rejected with no row left behind.
6. `PUT /api/workflows/:workflowId/pages/reorder` requires an explicit nullable
   `sectionId` per page and sets membership and order atomically in one
   transaction; omitted membership is a validation error, not an implicit
   ungroup.
7. A reorder or assignment that would break contiguity is **rejected with 400**
   and a message naming the offending Section; the transaction rolls back and no
   partial write survives. A unit test asserts the rejection, and a second test
   asserts the rollback by reading the rows back.
8. A reorder that would empty a Section returns 409 and rolls back unless that
   exact id is present in `deleteEmptySectionIds`. With explicit authorization,
   the page move and hard-delete commit atomically. Tests cover refusal,
   confirmed deletion, and a stale/concurrent authorization naming a Section
   that did not become empty.
9. Deleting a Section sets `section_id = null` on its pages and leaves their
   `order` values untouched (D-7), proven by reading the rows back.
10. `findBackwardSkipRules`' reorder warning still fires after a
   section-assigning reorder — grouping does not silently disable it.
11. The Vertical proof path passes end to end in
   `tests/integration/api.sections.test.ts`, with the DB unmocked and the
   cross-tenant denial case included.
12. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
    `npm run test:unit` and `npm run test:integration` green.

---

## SECT-4 — Sections travel: publish, run runtime, export/import, diff ✅

**Passed:** 2026-08-23 · Senior-reviewed from `dev` dispatch head `9af1091d`.
Published graphs and runtime now carry sibling Sections plus explicit nullable
page membership, including legacy-version fallback and pinned-title immunity.
The real project-scope vertical published and ran two Sections/five pages, then
round-tripped them from tenant A to tenant B with order, membership, and fully
remapped ids intact. A missing bundled Section warns, retains the page, and
clears its membership. Section add/remove/rename diffing and distinct
Section/Page viewer counters are covered while the legacy changelog contract
remains intact. Independent gates: type-check 0, lint 0, fast 3,294/3,294
(baseline 3,289), unit 3,454/3,454, integration 1,202 passed + 3 existing
admin-DB skips, focused unit 92/92, and focused integration 31/31. Senior grade:
A; no ticket-scope deviations. Template/blueprint Section ingestion remains
intentionally unsupported because it is outside SECT-4.

**Dispatched:** 2026-08-23 · Follows accepted SECT-3 commit `d52af401`.
Senior review additionally requires the pinned `RunDefinitionProvider` to carry
Sections and explicit nullable page membership, legacy pinned versions to fall
back to `sections: []`/`sectionId: null`, the existing diff/changelog response
to remain backward compatible while the viewer receives real Section and Page
counters, and the nullable portability warning path to be proven against a
second tenant. The ticket's claimed pre-existing runtime pass-through and
Section-labelled viewer counters are stale; neither exists on this base.

**Priority: ENH** · Size: M · File: `server/services/VersionService.ts`, `server/services/portability/entityGraph.ts`

### Finding

A Section that exists only in the authoring tables is invisible to every
published run. `VersionService.serializeWorkflow` builds the pinned definition
and knows only about pages:

```ts
    return {
      title: fullData.title,
      ...
      sections: fullData.sections.map(section => ({     // `pages` after SECT-1
        id: section.id,
        title: section.title,
        order: section.order,
```

The runner reads that pinned definition, not the live tables:

```ts
// server/services/workflow-runs/RunRuntimeService.ts
      sections: definition.sections,
```

So without this ticket, Phase 4's nav would show nothing on a real run. The
same gap exists in three more places:

```ts
// server/services/portability/entityGraph.ts
  {
    table: schema.sections,
    name: 'sections',
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","title","description","order","config","visibleIf"],
```

— an exported project bundle would drop every Section and import a flattened
workflow; and `WorkflowDiffService`/`DiffViewer`, which report "Sections Added"
/ "Sections Removed" about what are now pages.

### Preferred fix

Four small, matching extensions:

1. **`serializeWorkflow`** — emit a top-level `sections: [...]` array (id, title,
   description, visibleIf) alongside `pages`, and add `sectionId` to each
   serialized page. Keep it a *sibling* array rather than nesting pages inside
   sections: nesting would make run order depend on traversal order, contradicting
   D-2, and would force every existing consumer of `graph_json.pages[]` to change.
   The array's own order is not semantic; consumers position each Section by its
   first page in `pages.order`.
2. **`RunRuntimeService`** — pass `definition.sections` through to the runtime
   payload, mirroring the existing `sections: definition.sections` line.
3. **`entityGraph.ts`** — add a `sections` descriptor with
   `parent: { name: 'workflows', fk: 'workflowId' }`, `refs: ["workflowId"]`,
   `jsonRefs: ["visibleIf"]`, and add `sectionId` to the `pages` descriptor's
   `fields` and `refs`. **Order matters** — `sections` must be listed *before*
   `pages` in `ENTITY_GRAPH`, because `ExportService.findUnresolvedRef` reads
   `extractedIds` and a child processed first cannot resolve its parent. Give
   the pages descriptor `dropIfUnresolved` for `sectionId`? **No** — the column
   is nullable, so the correct handling is to null it, not drop the row. Say so
   in a comment.
4. **Diff** — teach `WorkflowDiffService` to report section add/remove/rename,
   and correct the `DiffViewer` labels that currently say "Sections" about pages.

### Ties

- **Must follow SECT-3** — it serializes what SECT-3 creates.
- Blocks SECT-8A/SECT-8B/SECT-9: production runs read the pinned definition, so the nav
  has no data until this lands.
- Load `add-api-endpoint`; read `docs/architecture/SECURITY_THREAT_MODEL.md` for
  the mass-assignment invariants before extending an import path.
- Existing portability rules are documented at length in the `EntityDescriptor`
  doc comments in `entityGraph.ts` — read them; several were paid for.
- File footprint: `server/services/VersionService.ts`,
  `server/services/workflow-runs/RunRuntimeService.ts`,
  `server/services/portability/entityGraph.ts`,
  `server/services/diff/{diffWorkflows,WorkflowDiffService}.ts`,
  `client/src/components/builder/versioning/DiffViewer.tsx`.

### Vertical proof

- **Path:** create a workflow with two Sections and five pages (two grouped, one
  ungrouped) → publish → `workflow_versions.graph_json` contains both Sections
  and per-page `sectionId` → start a run → `GET /api/runs/:runId/runtime` returns
  the Sections → export the project → re-import into a second tenant → the
  imported workflow has the same Sections with the same page membership and
  order.
- **Real, not mocked:** the publish write, the runtime read, and the full
  export→import round trip. Mocking the serializer voids this proof, since the
  serializer is the layer being changed.
- **Cross-tenant denial:** the re-import lands in tenant B and references
  **only** tenant B ids — assert no imported row points at a tenant A section id.
- **Suite:** `tests/integration/` — extend the existing portability round-trip
  test and the run-runtime test rather than writing a parallel one.

### Acceptance criteria

1. `graph_json` written by `serializeWorkflow` contains a top-level `sections`
   array, and every serialized page carries `sectionId` (`null` when ungrouped).
2. `GET /api/runs/:runId/runtime` returns `sections` from the **pinned
   definition**, not the live tables — a test proves this by mutating the live
   Section title after publishing and asserting the runtime payload is unchanged.
3. `ENTITY_GRAPH` contains a `sections` descriptor positioned **before** `pages`,
   and `pages.fields`/`refs` include `sectionId`.
4. A project export→import round trip preserves Sections, page membership, and
   page order, with all ids remapped to the destination tenant.
5. An import of a bundle whose page references a `sectionId` absent from the
   bundle sets the column to `null` and records a manifest warning — it does not
   drop the page and does not throw.
6. `WorkflowDiffService` reports section additions, removals and renames, and
   `DiffViewer`'s "Sections Added/Removed" counters refer to actual Sections
   while pages get their own correctly-labelled counters.
7. The Vertical proof path passes end to end in the integration project with the
   publish, runtime and round-trip hops unmocked, including the cross-tenant
   assertion.
8. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:unit` and `npm run test:integration` green.

---

## Phase 1 Gate

- [ ] SECT-3 and SECT-4 ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → clean
- [ ] `npm run test:unit` and `npm run test:integration` green
- [ ] Fresh `db:migrate` succeeds; catalog assertions prove schema/policy parity
      without applying `db:push`'s destructive unmanaged-RLS proposals
- [ ] Live check via the `verify` skill: Sections created over the API survive
      publish, appear in `GET /api/runs/:runId/runtime`, and round-trip through
      export/import — real JWT, real DB, output pasted
- [ ] **Stated explicitly in the gate note:** Phase 1 closes at *Code complete*.
      Sections are not yet reachable by a user. Phase 2 delivers that.
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Builder authoring

Make Sections real in the Document Outline and the page canvas. This is the
phase that makes the feature *User-reachable*.

**Every ticket in this phase requires the `design` skill.** The repo owner's
standing instruction is that it is loaded for any UI work; a turn-in that
skipped it is sent back regardless of how the UI looks.

## SECT-5 — Document Outline nests pages under Sections 🔲

**Priority: ENH** · Size: M · File: `client/src/components/builder/SidebarTree.tsx`

### Finding

The outline renders a flat list — `SidebarTree` maps pages directly with no
grouping level:

```tsx
          {sections?.map((section) => (
            <SectionItem
              key={section.id}
              section={section}
              workflowId={workflowId}
              isExpanded={expandedSections.has(section.id)}
```

`SectionItem` (→ `PageItem` after SECT-1) already implements exactly the
disclosure pattern the new level needs — a header plus an indented, ruled child
list:

```tsx
            {isExpanded && (
                <div className="ml-4 pl-2 mt-1 space-y-0.5 border-l border-sidebar-border/50">
```

With ~100 pages in a real divorce interview, this flat list is the core problem
the initiative exists to fix.

### Preferred fix

Add one level of nesting above the existing page items, copying `PageItem`'s
structure rather than inventing a second disclosure idiom:

```
▾ Assets                    ← new SectionItem (collapsible, count badge)
    ▾ Real Property         ← existing PageItem, indented one level
          Address           ← existing StepItem
    ▸ Bank Accounts
  Unfiled page              ← ungrouped page, rendered at top level (D-3)
▸ Debts
```

- Ungrouped pages render **inline at the top level, in `order` position** — not
  collected into a trailing "Ungrouped" bucket, which would misrepresent run
  order (D-2/D-3).
- Keep the existing `expandedSections` `Set<string>` state shape for the new
  level; add a sibling set for pages rather than overloading one.
- Reuse `SidebarHeader`'s existing grouped-actions panel for "Add Section";
  do not add another ghost button to the title bar — read the comment above
  `COMPACT_WIDTH_PX` in `SidebarTree.tsx` before touching that header, and
  re-measure the compact-width breakpoint if the widest action label changes.
- Section create/rename/delete reuses `SectionSettingsDialog`'s dialog pattern.
  Create requires selecting at least one page; no empty Section is persisted
  (D-9).
  On delete, the confirmation must state that pages will be kept and ungrouped
  (D-7) — a user who reads "delete section" and assumes their 11 pages go with
  it will not click it.
- **Indentation is already three levels deep at the step.** A fourth level needs
  the `design` skill's guidance on hierarchy that stays legible in a panel whose
  minimum width is 15% — do not simply add another `ml-4`.

### Ties

- **Must follow the Phase 1 Gate** — the API it calls is SECT-3's.
- **Sequence with SECT-6**, which touches the adjacent page canvas. Review SECT-5
  before dispatching SECT-6 so the second dev builds on committed state.
- **Load the `design` skill.** Mandatory, per the repo owner's standing instruction.
- File footprint: `client/src/components/builder/SidebarTree.tsx`,
  `client/src/components/builder/sidebar/` (new `SectionItem.tsx` +
  `SectionItemHeader.tsx`; the existing files are `PageItem*` after SECT-1),
  `client/src/lib/vault-hooks.ts` (new `useSections`/`useCreateSection`/…),
  `client/src/lib/vault-api.ts` (`ApiSection` type).
- **Convention 8 in `CLAUDE.md` applies:** Sections are server state and belong
  to their TanStack Query hook. Do not mirror them into a zustand store —
  `tests/unit/client/store.deadSetters.test.ts` guards this, and the reason it
  exists (builder `mode` sat at its default for months) is exactly this mistake.

### Acceptance criteria

1. The outline renders Sections as a collapsible level containing their pages,
   with ungrouped pages at the top level in `order` position.
2. A Section can be created around at least one selected page, renamed, and
   deleted from the outline; the UI cannot submit an empty Section, and delete
   confirmation states that pages are kept and become ungrouped.
3. Collapse/expand state is independent per Section and per page, and persists
   across re-renders within a session.
4. A workflow with zero Sections renders exactly as it does today — no empty
   group header, no extra indentation, no layout shift.
5. The compact/icon-only mode still works at the panel's 15% minimum width, with
   the `COMPACT_WIDTH_PX` breakpoint re-measured if any action label changed.
6. Section data is read through a TanStack Query hook and is **not** mirrored
   into any zustand store (convention 8); `tests/unit/client/store.deadSetters.test.ts`
   stays green.
7. Component tests in `tests/unit/client/` cover: grouped rendering, an
   ungrouped page's position, the zero-Section case, and delete-keeps-pages.
8. Live proof via the `verify` skill: screenshots of the outline with two
   Sections, one ungrouped page, and both collapsed and expanded states.
9. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:fast` green.

---

## SECT-6 — Drag pages into and out of Sections; reorder Sections 🔲

**Priority: ENH** · Size: M · File: `client/src/components/builder/pages/PageCanvas.hooks.ts`

### Finding

The page canvas already has full dnd-kit drag-and-drop with a `skip_to` safety
warning, and knows nothing about grouping:

```ts
            const reordered = arrayMove(pages, oldIndex, newIndex);
            const updates = reordered.map((page, index) => ({
```

```ts
            description: `This reorder moved a "skip to" target at or before the page that triggers it, so it will never fire: ${rules.map(describe).join(", ")}. Fix it in Logic before publishing.`,
```

Without this ticket, membership can only be changed through the API, so the
feature is authorable but not usable.

### Preferred fix

Extend the existing `@dnd-kit` setup — do not introduce a second drag library or
a parallel drag context. Two new capabilities:

1. **Drag a page into / out of / between Sections.** On drop, compute the new
   flat `pages.order` **and** the new `sectionId`, and send both in the single
   extended reorder call SECT-3 added. Because a Section is a contiguous span
   (D-2), dropping a page inside a Section's span necessarily reassigns it — the
   position *is* the membership. Make that legible with a drop indicator that
   shows which Section the page will land in.
2. **Reorder Sections**, moving their pages with them as a block.

The server rejects an order that breaks contiguity (SECT-3, AC7). The client's
job is to make that unreachable by construction rather than to surface a 400 —
but handle the 400 anyway, with the optimistic update rolled back, because a
concurrent edit from another session can still produce one.

Removing the last page from a Section is the deliberate exception (D-9). The
first request receives SECT-3's 409 with the Section id and title; roll back the
optimistic state and ask the user to confirm that the move will also delete the
Section. Cancel leaves both untouched. Confirm retries with that id in
`deleteEmptySectionIds`, so the move and Section deletion commit atomically.
Never delete the Section optimistically before the server accepts both changes.

Preserve the `findBackwardSkipRules` warning on every path, including
section-level reorders — moving a Section moves its pages, so it can break a
`skip_to` target exactly as a page move can.

### Ties

- **Sequence after SECT-5** — adjacent components, and SECT-5 establishes the
  section-item vocabulary this ticket drags around.
- **Load the `design` skill** (drop indicators, drag affordances, motion).
- File footprint: `client/src/components/builder/pages/PageCanvas.tsx`,
  `PageCanvas.hooks.ts`, `PageCard.tsx`, `client/src/lib/dnd.ts`.
- Read the existing drag handling in `PageCanvas.hooks.ts` end to end first; it
  already handles cross-container step moves and is the donor pattern for
  cross-Section page moves.

### Acceptance criteria

1. A page can be dragged into a Section, out of a Section (becoming ungrouped),
   and between two Sections; membership and order are sent in one reorder call.
2. A Section can be reordered, and its pages move with it as a contiguous block.
3. A drop indicator names the Section the page will land in before the drop
   commits.
4. A server 400 from a contiguity violation rolls the optimistic update back and
   surfaces a toast naming the Section — the UI never persists a state the
   server rejected.
5. Moving the last page out receives a 409, rolls back, and opens a confirmation
   naming the Section. Cancel changes nothing; confirm retries with
   `deleteEmptySectionIds` and removes the Section atomically with the page
   move. Component tests cover both choices.
6. The `findBackwardSkipRules` warning still fires for page moves **and** for
   Section moves that relocate a `skip_to` target.
7. Keyboard-accessible drag is preserved at parity with today's behavior (dnd-kit
   keyboard sensor), and the new Section drag handles are reachable by keyboard.
8. Component tests cover: page into Section, page out of a multi-page Section,
   last-page cancel, last-page confirm/delete, page between Sections, Section
   reorder, and the 400-rollback path.
9. Live proof via the `verify` skill: a screen recording or before/after
   screenshots of the drag operations in AC8, including last-page cancellation
   and confirmed Section deletion.
10. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:fast` green.

---

## Phase 2 Gate

- [ ] SECT-5 and SECT-6 ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → clean
- [ ] `npm run test:fast` and `npm run test:unit` green
- [ ] **One batched live drive-through** (not one per ticket): build a workflow
      with three Sections and ~12 pages including two ungrouped, drag pages
      across every boundary, reorder Sections, publish, and confirm the pinned
      definition matches the outline — screenshots attached
- [ ] Sections are now *User-reachable* — say so explicitly in the gate note
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Section-level visibility

## SECT-7 — Evaluate `sections.visible_if`, with a hidden Section hiding its pages 🔲

**Priority: ENH** · Size: L · File: `shared/workflowLogic.ts`

### Finding

SECT-3 stores `sections.visible_if` but nothing reads it. The visibility engine
knows two target types and no grouping:

```ts
  // Group rules by target
  const sectionRules = rules.filter(r => r.targetType === 'section');
  const stepRules = rules.filter(r => r.targetType === 'step');
```

```ts
    visibleSections: new Set(),
    hiddenSections: new Set(),
    visibleSteps: new Set(),
    hiddenSteps: new Set(),
```

(after SECT-1 these are `pageRules`, `visiblePages`, `hiddenPages` — the
`*Sections` names are now free for the group layer, which is the point of the
Phase 0 rename.)

The client mirrors the same shape:

```ts
// client/src/hooks/runner/useSectionVisibility.ts
    return sections.filter((section) => visibility.visibleSections.has(section.id));
```

Without this ticket, an author can write a condition on a Section in the builder
and it silently does nothing at run time — worse than not offering it.

### Preferred fix

One condition language, one evaluator — `sections.visible_if` holds the same
`ConditionExpression` as pages and steps and is evaluated by
`shared/conditionEvaluator.ts`. Do **not** introduce a second expression shape;
`CLAUDE.md`'s logic-operators section documents why the flat operator enum was
removed.

Extend `evaluateWorkflowVisibility` to compute `visibleSections`/`hiddenSections`
for the group layer, then apply **D-5's precedence, one-directional**:

> A hidden Section removes every one of its pages from `visiblePages`,
> regardless of that page's own `visibleIf`. A **visible** Section grants
> nothing — a page inside it whose own `visibleIf` is false stays hidden.

Evaluate Sections **before** pages so the page pass can subtract, rather than
patching the result afterwards. Write the rule as a comment on the function; it
is the kind of precedence that gets "simplified" into symmetry by a later reader.

Four consumers must agree, or the builder will preview one thing and the run will
do another:

- `shared/workflowLogic.ts` — the engine (source of truth)
- `server/services/LogicService.ts` — server-side navigation resolution
- `client/src/hooks/runner/useSectionVisibility.ts` — runner + preview
- `shared/workflowSimulation.ts` + the workflow map — MAP-7 proved the simulator
  at parity with `LogicService.evaluateNavigation`, and **that parity is a
  standing invariant**; a change here that only lands in the engine breaks it.

Extend the existing condition-dependency lint to Section expressions so
dangling aliases and dependency cycles are caught using the same machinery as
pages and steps. Every referenced question must belong to a page strictly
before the Section's first page; a reference inside the same Section or on a
later page is publish-blocking because the respondent cannot reliably answer a
question before the Section is revealed. Script conditions are publish-blocking
for Section `visibleIf` in v1 because their dependencies cannot be extracted.
Do **not** add a satisfiability solver or claim to prove that an arbitrary
expression can never be true (D-10).

Add one conservative publish blocker for the failure this makes newly possible:
if a `skip_to` target page belongs to any Section with a non-null, non-empty
`visibleIf`, publishing fails. V1 deliberately does not try to prove that the
skip condition implies the Section condition; the author must target a page in
an unconditional Section or remove the Section condition. This rule is simple
enough to explain in the lint message and cannot strand the run.

### Ties

- **Must follow Phase 1** (the column) and is independent of Phase 2 (the UI
  editor for the condition can reuse `SectionSettingsDialog`'s existing
  visibility editor — see `client/src/components/logic/`).
- Read `CLAUDE.md`'s "Logic Operators & Actions" section and
  `tickets/backlog/LOGIC_UNIFICATION.md` before starting — the single-condition-
  language rule was expensively established.
- Read `tickets/backlog/WORKFLOW_MAP.md` D-5 on backward `skip_to`, and MAP-7 on
  simulator parity.
- Load the `design` skill for the condition-editor surface on the Section dialog.
- File footprint: `shared/workflowLogic.ts`, `shared/workflowSimulation.ts`,
  `server/services/LogicService.ts`,
  `client/src/hooks/runner/useSectionVisibility.ts`, the map's
  `toFlowElements.ts`, `SectionSettingsDialog.tsx`, and the publish linter in
  `server/services/VersionService.ts`.

### Vertical proof

- **Path:** author an earlier ungrouped page containing `filed_jointly`, then a
  Section with `visibleIf: answer("filed_jointly") == true` containing three
  pages, one of which has its own `visibleIf: false` → publish → run A answers
  `false` and all three Section pages are absent → run B answers `true` and two
  pages are present while the third stays absent (its own condition).
- **Real, not mocked:** the evaluator and the run's page walk. A test that stubs
  `evaluateWorkflowVisibility` proves the stub works — that is the layer being
  changed.
- **Cross-tenant denial:** N/A — this ticket adds no new endpoint; state that
  explicitly rather than omitting the heading.
- **Suite:** `tests/integration/` for the run walk, plus
  `tests/unit/shared/workflowLogic.*.test.ts` for the precedence matrix.

### Acceptance criteria

1. `sections.visible_if` is evaluated by `shared/conditionEvaluator.ts` through
   the same `ConditionExpression` shape as pages and steps — no second
   expression format is introduced.
2. A hidden Section removes all of its pages from the visible set, overriding a
   page-level `visibleIf` that evaluates true (D-5).
3. A visible Section does **not** override a page-level `visibleIf` that
   evaluates false. A unit test covers all four combinations of
   (section visible/hidden × page visible/hidden).
4. `LogicService`, `useSectionVisibility`, and `shared/workflowSimulation.ts`
   produce the same visible-page set as `shared/workflowLogic.ts` for a shared
   fixture — a parity test asserts this across all four combinations, extending
   MAP-7's existing parity test rather than adding a parallel one.
5. The Section condition is editable from the Section settings dialog, reusing
   the existing visibility-editor component.
6. Existing condition-dependency lint covers Section `visibleIf` expressions:
   dangling aliases and cycles are publish-blocking, with tests using the same
   fixtures as page/step conditions. References to a question in the same
   Section or any later page are also rejected; a question on an earlier page
   passes. Script conditions are rejected for Section visibility in v1 because
   their dependencies are opaque. No “can never be true” solver is added.
7. Publish-time lint rejects every `skip_to` target page whose Section has a
   non-null, non-empty `visibleIf`, with an actionable message. Tests prove a
   conditional-Section target is rejected and targets in an unconditional
   Section or ungrouped pages pass; no implication inference is attempted.
8. The Vertical proof path passes end to end in the integration project with the
   evaluator unmocked.
9. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:unit` and `npm run test:integration` green.

---

## Phase 3 Gate

- [ ] SECT-7 ✅ with a dated verification note
- [ ] Engine / server / client / simulator parity test green
- [ ] `npm run test:unit` and `npm run test:integration` green
- [ ] Live check: two runs of the same published workflow, one taking the false
      branch and one the true branch of a Section condition driven by a real
      earlier answer — screenshots attached
- [ ] Reviewer has committed the passed ticket + this gate

---

# Phase 4 — Runner navigation

The respondent-facing half of the feature. **Both UI tickets require the
`design` skill**, and SECT-8B changes the runner's whole layout shell, so it also
carries responsive obligations.

Reachedness must exist before a rail can truthfully distinguish a page the
respondent may revisit from one they have not reached. Phase 4 therefore lands
the persisted fact first (SECT-8A), renders it second (SECT-8B), and makes the
rendered items interactive last (SECT-9).

## SECT-8A — Persist reached pages on the run 🔲

**Priority: ENH** · Size: M · File: `shared/schema/run.ts`, `server/repositories/WorkflowRunRepository.ts`

### Finding

The run persists only one `currentPageId` after Phase 0. There is no durable
record of the pages the respondent already entered, so a reload cannot tell the
difference between a previously reached page and a visible page that forward
navigation skipped. Deriving reachedness from `step_values` is wrong: a page
whose optional questions are left blank writes no values.

### Preferred fix

Add `workflow_runs.visited_page_ids` (`uuid[]`, not null, default `'{}'`) in
migration `0040_*`. Treat it as an insertion-ordered set: repository updates
append only when the id is absent.

The server, never the client, records entry:

- Run creation appends the resolved initial page in the same transaction that
  stores `current_page_id`.
- `next` appends the **server-resolved destination page**, not the
  client-supplied current page, in the same transaction that advances the run.
- Resume ensures the restored `current_page_id` is present idempotently. It does
  not guess older history that was never stored. All environments contain only
  test data, so no historical backfill is required.

Return `visitedPageIds` in the authenticated run/runtime payload consumed by
`WorkflowRunner`. Keep it as TanStack Query server state; do not mirror it into
zustand (convention 8).

### Ties

- **Must follow SECT-7** and blocks SECT-8B/SECT-9.
- Load `add-api-endpoint`, `db-schema-change`, and `run-tests`.
- File footprint: `shared/schema/run.ts`, `migrations/0040_*.sql`,
  `server/repositories/WorkflowRunRepository.ts`, `server/services/RunService.ts`,
  `server/services/runs/RunResumeService.ts`, the existing `next` coordinator/
  route, `server/services/workflow-runs/RunRuntimeService.ts`, and the run API
  response types.
- Use the post-RLS service/transaction pattern; tenant context and the visited
  append must share the same transaction as the run-state update.

### Vertical proof

- **Path:** start a run → initial page id is persisted → advance through pages
  1→2→3, including a `skip_to` over another visible page → reload → runtime
  returns exactly pages 1, 2 and 3 as visited and does not mark the skipped page
  reached → resume by resume link → the same ordered set returns.
- **Real, not mocked:** the DB writes, server-side next-page resolution, reload,
  and resume-link hop.
- **Cross-tenant denial:** attempt `next` with credentials that cannot access
  the victim run → 404 and the victim's `visited_page_ids` is unchanged.
- **Suite:** integration project with the DB unmocked.

### Acceptance criteria

1. `workflow_runs.visited_page_ids` exists as a non-null `uuid[]` defaulting to
   empty, with migration `0040_*` authored via `npm run db:generate`.
2. Run creation stores the resolved first page as visited atomically with
   `current_page_id`; a test proves a newly started run does not begin with an
   empty reached set.
3. `next` appends the server-resolved destination id exactly once and atomically
   with advancement. Repeating/resuming does not duplicate ids, and a visible
   page bypassed by `skip_to` is not added.
4. Reload and resume-link resume return the same ordered reached set from the
   DB. Tests perform the reload/resume hop rather than inspecting in-memory
   state.
5. The runtime/run response exposes `visitedPageIds`; its source is the run row,
   not inferred step values or page order.
6. Cross-tenant denial leaves the victim array byte-for-byte unchanged.
7. Gates: `npm run type-check` 0 errors, `npm run lint` clean, and `npm run
   test:unit` plus `npm run test:integration` green.

---

## SECT-8B — Persistent left-hand Section nav in the runner (read-only) 🔲

**Priority: ENH** · Size: L · File: `client/src/components/runner/ClientRunnerLayout.tsx`

### Finding

The runner has **no navigation at all**. `ClientRunnerLayout` is a single
centred column with a progress bar and a step counter:

```tsx
            {totalSteps && totalSteps > 0 && currentStep !== undefined && (
                <div className="text-xs text-muted-foreground font-medium" aria-label="Progress summary">
                    {currentStep >= totalSteps ? "Review" : `Step ${currentStep + 1} of ${totalSteps}`}
```

```tsx
            <main className={cn("flex-1 w-full max-w-2xl mx-auto p-4 md:p-8 md:pt-12", className)}>
```

`"Step 41 of 97"` is the entire sense of place a respondent gets in a hundred-page
divorce petition. There is no way to see that they are in "Assets", how much of
it is left, or what comes next.

### Preferred fix

Restructure `ClientRunnerLayout` from a centred column into a two-column shell:
a persistent nav rail plus the existing `max-w-2xl` content column, which keeps
its current measure so question layout is unchanged.

The rail lists Sections with their pages, annotated by state — **shown, not
hidden, when unreached, and greyed out** (D-4):

```
▾ Assets              ✓ 2/2
     Real Property    ✓
     Bank Accounts    ✓
▾ Debts               ● 1/2
     Credit Cards     ●        ← current
     Loans            ○        ← greyed, not interactive
  Interlude           ○        ← ungrouped page, top level (D-3)
▸ Children            ○ 0/3    ← greyed
```

**D-6 is the trap in this ticket.** Three states, not two:

| State | Source | Rendering |
|---|---|---|
| Excluded by `visibleIf` | not in `visiblePages` | **absent** from the nav entirely |
| Visible, not yet reached | in `visiblePages`, not in the reached set | **greyed, non-interactive** |
| Reached | in the reached set | normal, interactive in SECT-9 |

A page hidden by logic is not part of this run and must not be advertised —
leaking "Spousal Support" into the nav of a run where logic excluded it is an
information disclosure, not a cosmetic bug.

This ticket is **read-only**: it renders state and does not navigate. Clicking
is SECT-9. Ship the rail inert rather than half-navigating.

Responsive: the rail collapses to a trigger + sheet/drawer below the `md`
breakpoint. The runner is respondent-facing and frequently used on phones; a
fixed rail would eat the content column. Use the existing Radix sheet primitive
in `client/src/components/ui/`.

Branding: the rail sits inside the branded surface — respect
`useBrandingStyle`/`ResolvedBranding` exactly as the header does, and honor
`branding.whiteLabel`.

Preview has no run row, so `PreviewRunner` maintains an ephemeral in-memory
visited set, appending the resolved page whenever preview navigation enters it.
This is the preview analogue of SECT-8A, is discarded when preview closes, and
must not be placed in a global zustand store.

### Ties

- **Must follow SECT-4** (the runtime payload must carry Sections), **SECT-7**
  (visibility determines what the rail may show), and **SECT-8A** (the reached
  set determines enabled/disabled state).
- **Blocks SECT-9.**
- **Load the `design` skill** — this is the most visible surface in the product
  and the one a client of the repo owner's customer actually sees.
- File footprint: `client/src/components/runner/ClientRunnerLayout.tsx`, a new
  `client/src/components/runner/RunnerSectionNav.tsx`,
  `client/src/pages/WorkflowRunner.tsx` (passing nav data through), and
  `client/src/components/preview/` so the builder preview shows the same rail.
- Convention 8 applies: nav state derives from server state and the existing
  `useRunNavigation` return; do not mirror it into a zustand store.

### Acceptance criteria

1. `ClientRunnerLayout` renders a persistent left rail at `md` and above,
   listing Sections, their pages, and ungrouped pages in `order` position.
2. The content column keeps its current `max-w-2xl` measure — question layout is
   pixel-unchanged from today at the same viewport width.
3. Below `md`, the rail collapses into a sheet/drawer behind a trigger, and the
   content column occupies the full width as it does today.
4. Pages excluded by `visibleIf` **do not appear** in the rail; visible-but-
   unreached pages appear greyed and non-interactive; the current page is
   distinctly marked (D-4/D-6). A test asserts an excluded page's title is absent
   from the DOM — with a fixture that *would* have rendered it absent the
   exclusion, so the assertion cannot pass trivially. A Section with zero
   visible pages for this run is omitted rather than rendered as an empty label.
5. Each Section shows a **reached/visible** progress indicator over its visible
   pages only. Do not label reached pages “completed”: entering a page does not
   prove its validation was submitted. Counts never include pages logic removed.
6. A workflow with zero Sections renders every page at the top level of the rail
   and looks deliberate, not broken.
7. The rail respects resolved branding and `whiteLabel`, matching the header.
8. Keyboard and screen-reader support: the rail is a labelled `nav` landmark,
   greyed items are exposed as disabled rather than merely dimmed, and the
   current page carries `aria-current`.
9. Component tests cover: grouped rendering, the three visibility states, the
   zero-Section case, the mobile collapse, and preview accumulating reached
   pages without marking a skipped visible page reached.
10. Live proof via the `verify` skill: screenshots at desktop and mobile widths,
    of a run with at least two Sections, one ungrouped page, and one page
    excluded by logic.
11. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
    `npm run test:fast` green.

---

## SECT-9 — Navigate by clicking reached pages 🔲

**Priority: ENH** · Size: M · File: `client/src/hooks/runner/useRunNavigation.ts`

### Finding

SECT-8A makes reachedness durable and SECT-8B renders it, but navigation is
still index arithmetic over `visiblePages`:

```ts
  const handlePrev = useCallback(async () => {
    ...
    await transport.saveBeforeLeavingSection();
    setCurrentSectionIndex((prev) => Math.max(prev - 1, 0));
```

Forward movement is deliberately not arithmetic — it runs validation, then a
server round trip that resolves the real next page through `skip_to`:

```ts
        const nextResult = await nextMutation.mutateAsync({
          runId,
          currentSectionId: currentSection.id,
        });
```

The only jump that exists today is Review → edit an answer:

```ts
  const onEditReviewStep = useCallback((stepId: string, sectionId: string) => {
    const sectionIndex = respondentSections.findIndex((section) => section.id === sectionId);
```

SECT-8A now answers “which pages may I click?”; this ticket provides the guarded
jump without weakening the existing validate-then-advance path.

### Preferred fix

Make clicking work by reusing the jump machinery that already exists:
`onEditReviewStep` is the donor pattern — it calls `setCurrentSectionIndex` +
`setShowReview(false)` and is proven. Generalize it into a `jumpToPage(pageId)`
on `useRunNavigation` and have both the Review edit buttons and the rail call it.

Rules the jump must obey:

- **Flush pending autosaves before leaving** — call
  `transport.saveBeforeLeavingSection()` exactly as `handlePrev` does. A jump
  that skips this loses the current page's un-flushed answers, and it will look
  like data corruption to the respondent.
- **A jump is not a submit.** Do not run `submitSection`/`next`; those advance
  the run and re-resolve `skip_to`. A jump only moves the view.
- **Clicking a Section** lands on its first reached page (or its first page if
  the whole Section is reached).
- **Unreached targets are refused** — the rail already disables them (SECT-8B),
  but `jumpToPage` validates independently, because the rail's state can be one
  render behind the run's.
- Clear `reviewEditStepId` on any jump so the "return to review after next"
  behavior does not fire from an unrelated page.

Preview mode must behave identically — `useRunNavigationTransport` has a preview
branch and a production branch, and a jump implemented in only one of them is
the classic seam defect this repo keeps paying for.

### Ties

- **Must follow SECT-8A and SECT-8B** (persisted reached state + the rendered
  rail it makes interactive).
- Load the `design` skill for the interactive/hover/focus states the rail's
  items gain, plus `run-tests`.
- File footprint: `client/src/hooks/runner/useRunNavigation.ts`,
  `client/src/pages/WorkflowRunner.tsx`,
  `client/src/components/runner/RunnerSectionNav.tsx`, and
  `client/src/components/preview/`.
- Read `tickets/backlog/WORKFLOW_MAP.md` D-5: backward *navigation* is a runner
  feature (this ticket), while a backward `skip_to` **rule** stays a
  publish-blocking error. Do not "fix" the latter here.

### Vertical proof

- **Path:** load SECT-8A's persisted reached set → rail shows reached pages as
  enabled and future pages disabled → type without blurring → click a reached
  page → pending answer saves before the view moves → reload → reached state is
  unchanged and the server's forward resume position remains authoritative.
- **Real, not mocked:** the autosave transport in the live drive-through. DB
  persistence/reload itself was closed by SECT-8A and is not reimplemented here.
- **Cross-tenant denial:** N/A — this ticket adds no endpoint or data access;
  state that explicitly in the turn-in.
- **Suite:** `tests/unit/client/` for jump guards and preview parity, plus live
  proof through the local app.

### Acceptance criteria

1. `jumpToPage(pageId)` exists on `useRunNavigation`, flushes pending autosaves
   before moving, and does **not** call `submitSection` or `next`.
2. Clicking a reached page in the rail navigates to it; clicking a Section lands
   on its first reached page; unreached targets are refused by `jumpToPage`
   itself, not only by the rail's disabled state. A unit test calls
   `jumpToPage` with an unreached id directly and asserts no navigation occurs.
3. The Review screen's existing edit-an-answer jump is re-implemented on top of
   `jumpToPage` and still returns to Review after Next
   (`returnToReviewAfterNext`) — an existing behavior that must not regress.
4. Preview mode consumes SECT-8B's in-memory reached set and supports jumping
   with identical guards to production; a test exercises the preview branch,
   not only production.
5. Un-flushed answers on the page being left are persisted before the jump — a
   test types into a field and jumps without blurring, then asserts the value
   was saved.
6. The Vertical proof path passes through the local app with autosave unmocked.
7. Gates: `npm run type-check` 0 errors, `npm run lint` clean,
   `npm run test:fast` and `test:unit` green.

---

## Phase 4 Gate

- [ ] SECT-8A, SECT-8B and SECT-9 ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → clean
- [ ] Full suite green: `test:fast`, `test:unit`, `test:integration`
- [ ] **One batched live drive-through:** a published ~15-page workflow with
      three Sections, one ungrouped page and one logic-excluded page — walk it
      forward, jump back by rail, reload mid-run, confirm reached state and that
      the excluded page never appears. Desktop **and** mobile widths.
      Screenshots attached.
- [ ] The feature is *Live-verified*, not merely code-complete — say so
      explicitly in the gate note
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 5 — Documentation alignment

## SECT-10 — Align feature documentation with executable product status 🔲

**Priority: P2** · Size: S · File: `docs/claude/FEATURES.md`, `docs/INDEX.md`, `README.md`

> **Carried from `GH-174`** when the Roadmap epics board retired on 2026-08-18
> (`tickets/backlog/ROADMAP.md`). It was the only open roadmap item backed by
> real evidence — its cited files all exist — so it was carried rather than
> parked. It landed on *this* board because SECT-1 rewrites the vocabulary of
> every document it touches; doing it first means doing it twice.

### Finding

The feature documentation describes capabilities that have since shipped,
changed, or been deleted, and it is the surface a new dev and every foreign
harness reads first. Two concrete classes of drift, both created by this
initiative and by the boards that retired alongside it:

- **Vocabulary.** After SECT-1/SECT-2, `sections` means the group layer and
  `pages` means what the docs still call sections. `docs/claude/SCHEMA.md`,
  `docs/claude/API_ENDPOINTS.md` and `docs/guides/` all carry the old meaning.
  SECT-1 AC7 updates `CLAUDE.md` and `SCHEMA.md` only — the rest is this ticket.
- **Status.** `docs/claude/FEATURES.md` records feature status and changelog, and
  four initiatives closed between 2026-08-09 and 2026-08-18 (Template Language,
  AI Service Layer, Legal Drafting, and the Roadmap epics themselves) without a
  documentation pass.

### Preferred fix

Audit the documents against the tree rather than editing them from memory. The
`Documentation Index` table in `CLAUDE.md` is the list of what exists; walk it.

For each document, the test is whether a reader following it would be **wrong**,
not whether it is stylistically stale. Fix the wrong; leave the rest.

Do **not** expand scope into rewriting the guides. This is an alignment pass:
correct vocabulary, correct status, correct file paths, remove references to
deleted things. A guide that is merely thin stays thin.

Where a document describes something that no longer exists at all, delete the
section and note the deletion in `FEATURES.md`'s changelog rather than leaving a
tombstone.

### Ties

- **Must run last** — after SECT-2 at minimum, and ideally after Phase 4, or the
  vocabulary changes underneath it.
- No project skill is required, but read `CLAUDE.md`'s Documentation Index and
  the "Quick Reference (Claude-optimized — update these when you change what they
  document)" note above it.
- File footprint: `docs/`, `README.md`, `CLAUDE.md`. Collides with nothing in
  this initiative, since every other ticket's docs edits are scoped to its own
  acceptance criteria.

### Acceptance criteria

1. `docs/claude/SCHEMA.md` documents the `sections` (group) and `pages` tables
   with their real post-rename column names, and the table count is recounted
   from `shared/schema/`, not incremented.
2. `docs/claude/API_ENDPOINTS.md` lists the post-rename page endpoints and the
   new section endpoints, and every path in it resolves to a real route handler
   — verified by grep, and the dev's report states how.
3. `docs/claude/FEATURES.md` reflects the four initiatives that closed
   2026-08-09..18, and its changelog names them.
4. No document references a file path that does not exist. The dev's report
   includes the command used to check this and its output.
5. `README.md`'s quick start works end to end on a clean checkout — actually run
   it, do not read it.
6. `CLAUDE.md`'s Documentation Index has no dead links.
7. Gates: `npm run lint` clean (markdown is not linted, but the repo-wide gate
   must still pass), and no source file is modified by this ticket.

---

# Backlog / observations

Not phase-gated. Promote to a ticket only if the repo owner asks — several of
these are deliberate v1 exclusions, not oversights.

- **SECT-B1 — Review screen grouped by Section.** `ReviewSection.tsx` lists
  every answer flat. Once Sections exist, grouping the review by Section is the
  obvious follow-on, and it is where a respondent checking a 100-page petition
  actually spends their time. Deliberately out of Phase 4 to keep SECT-8B/9
  reviewable.

- **SECT-B2 — `logic_rules` targeting a Section.** D-8 restricts v1 to
  `sections.visible_if`. Extending `logic_rules.targetType` to `section` would
  let a rule show/hide/skip-to a whole Section. Needs a decision on what
  `skip_to` a Section means (its first visible page, presumably) and a
  `conditionalActionEnum`/enum migration.

- **SECT-B3 — Workflow map draws Section containers.** `MapTab` renders page
  nodes with no grouping. React Flow supports parent nodes; grouping the map by
  Section would make a 100-page map readable. Check `mapLayout.ts` — the
  existing layout algorithm may need real work, so size it before promoting.

- **SECT-B4 — AI generation emits Sections.** `shared/types/ai.ts`'s
  `AIGeneratedSectionSchema` produces a flat page list. An AI-generated
  100-page interview arriving ungrouped undercuts the feature for exactly the
  workflows that need it most. Needs prompt work in `AIPromptBuilder` plus
  schema changes, and should follow real usage of Phase 2 so the AI groups the
  way authors actually do.

- **SECT-B5 — Marketplace/blueprint templates ship with Sections.** The curated
  catalog (TM-1/TM-2) generates bundles at build time. Once SECT-4 lands, the
  curated templates should be re-authored with Sections — otherwise the
  showcase content demonstrates the flat model.

- **SECT-B6 — Per-Section progress in the runner header.** The header shows
  `Step N of M` over the whole workflow. With Sections, "Page 3 of 11 in Assets"
  is a better signal. Left out of SECT-8B to keep that ticket's scope on the rail
  itself.

---

# Escalations raised at generation time

Per the ticket-flow skill's Size-L rule, flagged to the repo owner before dispatch:

| Ticket | Size | Why it is L, and the recommendation |
|---|---|---|
| **SECT-1** | L | ~511 files. **Indivisible** — a half-applied rename leaves the tree red, and splitting it by layer manufactures exactly the seam this process warns about. Recommendation: keep as one ticket, dispatch alone in a dedicated worktree with every other board paused, and budget a full day. The Drizzle name-pinning is what keeps it from also being a migration. |
| **SECT-3** | L | Schema + service + repository + routes + a non-trivial invariant. **Could** be split into "table + CRUD" and "reorder + contiguity", but the contiguity rule is the only interesting part and splitting it would land a reorder endpoint that permits invalid states. Recommendation: keep whole; if it runs long, the fallback split is by endpoint group, never by layer. |
| **SECT-7** | L | Four consumers must stay in parity (engine, server, client, simulator), and MAP-7's parity invariant makes partial delivery worse than none. Recommendation: keep whole. |
| **SECT-8B** | L | Restructures the runner's layout shell *and* adds a new component *and* carries responsive + branding + a11y obligations. Recommendation: keep whole — the layout change and the rail are one design problem. SECT-8A now supplies reached state first; SECT-9 carries the interactive half. |

## Ordering against the other boards — refreshed 2026-08-23

The RLS implementation is complete in code and deployed to the test server.
Human acceptance there and the later production promotion continue on their own
operational track; per the repo owner's 2026-08-23 ruling, they do **not** block
work on this epic in `dev`. SECT-3 must use the now-established RLS pattern for
its new tenant table rather than copying an early migration.

Template Marketplace and the Roadmap board are retired and impose no remaining
ordering constraint. The active order is therefore:

```
1. SECT-1 → SECT-2                  vocabulary + physical rename
2. SECT-3 → SECT-4                  persistence and travel
3. SECT-5 → SECT-6                  builder authoring
4. SECT-7                           visibility
5. SECT-8A → SECT-8B → SECT-9       reached state, rail, interaction
6. SECT-10                          docs, last
```

The migration head is `0036` at this refresh. This board reserves `0037` for
SECT-1's enum value rename, `0038` for SECT-2's physical page rename, `0039`
for SECT-3's new Sections table, and `0040` for SECT-8A's reached-page state.
Before dispatching each migration ticket, confirm no intervening migration has
landed; if one has, renumber the remaining reservations together and update
their acceptance criteria before the dev starts.

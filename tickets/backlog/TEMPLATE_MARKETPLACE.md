# Template Marketplace (TM) — retired 2026-08-18

Initiative ran 2026-08-16 → 2026-08-18. **5 of 5 tickets closed, gate fully satisfied against
a real deployment.** Full detail of any closed ticket:
`git log -p -- tickets/TEMPLATE_MARKETPLACE_TICKETS.md`.

The curated templates LD-2 authored are now installable. `MarketplaceService` was every-method
stubs; it now serves a build-time-generated catalog and installs through `ImportService`.
Nothing here built a database-backed marketplace — that was the point.

## Closed — do not re-file

| Ticket | What shipped | Commit |
|---|---|---|
| TM-1 | Build-time generator: curated JSON → portability bundles + index in `dist/`, via `BundleWriter`; `getMigrationHead` extracted to `portability/migrationHead.ts` | 2026-08-16 |
| TM-2 | `TemplateCatalog` interface + `CuratedCatalogProvider`; **fixed a routing collision** where `GET /api/templates/:id` was shadowed by the document-templates router and 400'd on non-UUID slugs | `75b70b1a` → `0650f3b2` |
| TM-3 | `installTemplate` creates a real workflow via `ImportService`, scoped to the caller's tenant and project | `49723e88` → `2a65c6d5` |
| TM-4 | Destination-project picker replaces the hardcoded `projectId: "default"`; page `Template` type reconciled with `CatalogTemplate` | `23870d57` → `9ec47412` |
| TM-5 | Deleted zero-caller `exportTemplate`; `TemplateManifest.workflow` typed as `WorkflowContentData` | `0dbc0d5d` → `d145ec7c` |
| gate fix | `.dockerignore` excluded TM-1's generator from the build context — **every `dev` deploy had failed for two days** | `478331c5` |

**Gate proof (2026-08-18, deploy `cf12917f`):** `GET /api/templates` → 200 with all three
curated templates; `POST /api/templates/retainer-agreement/install` → 200, and the returned
workflow existed with the caller's `projectId`. Build log: `Generated 3 marketplace bundle(s)
in /app/dist/marketplace`.

**`GH-173` was NOT flipped.** The Roadmap board retired into `backlog/ROADMAP.md` (`94fad9ef`)
before this board closed, so there was no file to flip and no counters to recount. Repo owner
ruled 2026-08-18 to drop the item entirely; `BACKLOG.md` already records GH-173 as
"substantially delivered by the LD and TM boards", and the epic stays parked.

## Decisions — settled, do not relitigate

- **D1** Curated templates are **code-shipped, never database rows.** They are first-party
  content that changes only when a commit ships, so the deploy *is* the sync mechanism.
- **D2** Bundles are **generated at build time, not committed.** The manifest stamps
  `migrationHead`, so a committed bundle would rot as the schema evolves; a generated one is
  rebuilt against the current head every build and structurally cannot go stale.
- **D3** Generated output goes to **`dist/`**, never read from `templates/` at runtime — the
  Dockerfile does not copy `templates/`.
- **D4** **User publishing is out of scope** and `publishTemplate` still throws, guarded by a
  test so a later refactor cannot quietly enable it.

## Open observations

- **TM-B1 — the integration harness does not mirror production's middleware stack.**
  `needs-initiative`. `server/index.ts:143` and `server/production.ts:97` register
  `errorHandler` after routes; **`registerRoutes` does not**, and
  `tests/helpers/integrationTestHelper.ts` builds its app from `registerRoutes` alone. So any
  route relying on the global handler rather than calling `classifyRouteError` itself will
  **answer 500 to every denial under test, and no test will say so.** Found because TM-3's
  cross-tenant test failed this way; the route was genuinely non-conforming and was fixed, but
  the harness gap is repo-wide. Two fixes, not equivalent: registering `errorHandler` in the
  helper makes the harness honest but may flip assertions that currently expect 500; auditing
  routes for missing `classifyRouteError` fixes real defects but leaves the harness lying.
  Probably both, in that order. **This is a security-shaped blind spot, not tidiness** — the
  untested paths are denial paths.
- **TM-B2 — a failed Railway build is invisible.** `operational`. `dev` deploys failed
  continuously 2026-08-16 → 2026-08-18 while the environment kept serving the last good build,
  so TM-1 and TM-2 *appeared* shipped and were not. Railway keeps the previous deployment
  alive on build failure and **`Wait for CI` is off on all three environments**.
  **Owner decision 2026-08-18: turn `Wait for CI` on for `production` only** — dev/test stay
  fast. Still worth a deploy-status check (a job that fails when the latest deployment for a
  branch is not SUCCESS), since `Wait for CI` gates deploys but does not surface a build that
  fails on its own.
- **TM-B3 — the login page renders API errors as `[object Object]`.** `enhancement`.
  `POST /api/auth/login` returns a good body (`AUTH_006`, "Please verify your email before
  logging in…") and the toast shows the literal string `[object Object]`, so a user hitting
  the most common signup failure is told nothing. Fix is in the login page's error handling,
  not the API. Found incidentally while attempting TM-4's browser proof.
- **TM-B4 — user publishing** (`POST /api/market/publish`) is deliberately unbuilt.
  `needs-initiative`. Needs a real data model, tenancy scoping, moderation, and a ruling on
  whether templates published in `dev`/`test` should ever be visible in `production` (they
  should not — that argues for per-environment publishing with an explicit promotion step,
  not one shared pool).
- **TM-B5 — `usageCount` / `rating` / `isOfficial`.** `product-decision`. TM-4 removed them
  from the page because the curated catalog supplies none. Whether the product actually wants
  ratings and install counts is unanswered; it would require a real data model, and for
  first-party-only content it may never be worth it.
- **TM-B6 — `workflow.json` remains the editable source of truth** and is never itself
  installed; TM-1 generates from it. `informational`. A future importer consuming it directly
  is fine — what must not happen is two competing *install* paths.

## Lessons worth carrying

- **The gate criterion no test could satisfy is the one that found the real bug.** Every
  ticket passed its own gates, `test:fast` and `test:integration` were green throughout, and
  the product was still not shipping — because `.dockerignore` excluded the generator from the
  build context. Local trees always have `scripts/`; only the Docker build context does not.
  When a ticket adds a build step, check it against the Dockerfile **and** `.dockerignore`.
- **Reasoning about one Docker stage does not cover the other.** This board's D3 reasoned
  carefully about what the *runtime* stage copies and got it right, then shipped a *build*-stage
  dependency it never checked. Ask both questions.
- **"The test is unrealistic" is the most dangerous available diagnosis.** TM-3's 500s looked
  like a harness artefact and were a real non-conforming route. The harness *was* also wrong
  (TM-B1) — both were true, and fixing only the harness would have shipped the defect.
- **Work found already-done is work not yet verified.** TM-3 arrived fully implemented in its
  worktree from a session that stopped before gating. It was good code that failed two
  integration tests. Never treat an unattended turn-in as further along than an unstarted one.
- **A deployed environment is not a local one.** Its signup gate is closed
  (`NODE_ENV=production` enforces email verification, so the `dev:test` recipe does not
  apply), `POST /api/tenants` attaches a tenant in the DB while the caller's JWT still says
  `tenantId: null`, and `hybridAuth` re-hydrates tenant/role from the DB behind a **30-second
  TTL cache** — so a request issued right after tenant creation still 403s with `no_tenant`.

# ezBuildr - Architecture Quick Reference

**Status:** Production Ready | **Updated:** July 11, 2026

## What is ezBuildr?

Enterprise workflow automation platform combining visual workflow building, conditional logic, custom code execution (JS/Python), and data management.

**Scale:** 64 page files (58 routes) | 66 API route files | 219 service files | 108 DB tables | 37 step types | 40+ script helpers

## Project Skills — use them

`.claude/skills/` has project skills that encode patterns you should NOT re-derive. Load the matching skill before working:

| Skill | When |
|-------|------|
| `add-api-endpoint` | Any change under `server/routes/`, `server/services/`, `server/repositories/` |
| `db-schema-change` | Any schema/migration work, or "relation/column does not exist" errors |
| `add-step-type` | Adding/changing a step, question, or block type |
| `run-tests` | Running or writing any test (`npm test` naively gives wrong results) |
| `verify` | Proving a change against the live local app |

There is also a `test-runner` agent (`.claude/agents/test-runner.md`) — delegate test runs to it after non-trivial edits — and `.claude/launch.json` with `ezbuildr-dev` / `ezbuildr-test-mode` dev-server configs.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18.3, Vite 7.1, Zustand, TanStack Query, Radix UI, Tailwind, Wouter, React Hook Form + Zod |
| **Backend** | Node.js 20+, Express 4.21, Drizzle ORM, PostgreSQL (Neon) |
| **Auth** | Google OAuth2 + email/password, stateless JWT, refresh tokens, MFA |
| **AI** | OpenAI, Anthropic, Google Gemini (provider registry in `server/services/ai/`) |
| **DevOps** | Railway, GitHub Actions, Vitest + Playwright |

## Directory Structure

```
ezBuildr/
├── client/src/
│   ├── Router.tsx           # Wouter route table (source of truth for pages)
│   ├── components/
│   │   ├── builder/         # Workflow builder (7-tab nav, canvas, inspector)
│   │   ├── runner/          # Run-time rendering (blocks/, pages/)
│   │   ├── preview/         # In-memory preview shell (PreviewRunner, DevToolbar)
│   │   ├── blocks/          # Block editors
│   │   ├── collab/          # Real-time presence/cursors
│   │   ├── datavault/       # DataVault UI
│   │   ├── logic/           # Logic builder, visibility editor
│   │   └── ui/              # Shared components (Radix + Tailwind)
│   ├── pages/               # Route pages (lazy-loaded)
│   ├── lib/                 # API clients, blockRegistry, utilities
│   └── hooks/               # React hooks
├── server/
│   ├── routes/              # API handlers (66 *.routes.ts incl. ai/, datavault/)
│   ├── services/            # Business logic (219 files incl. subdirs)
│   ├── repositories/        # Data access (BaseRepository pattern, 50 files)
│   └── middleware/          # hybridAuth, tenant, requireUser, error handling
├── shared/
│   ├── schema/              # Drizzle schema, one file per domain (108 tables)
│   ├── types/               # StepType, conditions, stepConfigs, ai, ...
│   ├── conditionEvaluator.ts # Logic engine
│   └── workflowLogic.ts     # Workflow execution logic
├── migrations/              # 0000_init_baseline.sql + follow-ons through 0040 (41 files)
├── scripts/                 # Utility scripts (tsx)
└── tests/                   # unit-fast / unit-db / integration (see run-tests skill)
```

## Core Architecture

### Workflow Hierarchy
```
Projects → Workflows → Pages → Steps (Questions/Actions)
                    → Logic Rules, Transform Blocks, Lifecycle Hooks
                    → Workflow Runs → Step Values, Execution Trace
```

### 3-Tier Pattern
- **Routes** (`server/routes/`) - HTTP handling, Zod validation
- **Services** (`server/services/`) - Business logic, authorization (tenancy checks)
- **Repositories** (`server/repositories/`) - Data access, queries

Details, error-string contract, and security invariants: `add-api-endpoint` skill.

### Key Tables (full inventory: docs/claude/SCHEMA.md)
| Table | Purpose |
|-------|---------|
| `workflows` | Workflow definitions |
| `pages` | Physical storage for workflow pages with order and visibleIf |
| `steps` | Individual steps with type, alias, config, visibleIf |
| `workflow_runs` / `run_resume_links` / `step_values` | Execution instances, expiring resume credentials, and run data (the only run model — graph run tables were dropped) |
| `datavault_databases` / `datavault_tables` / `datavault_rows` | DataVault (all `datavault_`-prefixed) |
| `lifecycle_hooks` / `document_hooks` | Custom scripting |
| `connections` / `secrets` | API integrations (encrypted) |
| `users` / `tenants` / `organizations` / `workspaces` | Auth & tenancy |

### Step Types
37 values in `stepTypeEnum` (`shared/schema/workflow.ts:38`) — legacy types (`short_text`, `multiple_choice`, `signature_block`, `computed`, ...), easy-mode types (`phone`, `date`, `currency`, `scale`, ...), advanced-mode variants (`*_advanced`, `multi_field`, ...), and the structural `list` type (nestable repeating question with runner drill-in navigation; both List initiatives closed 2026-08-02 — parked follow-ups are in `tickets/BACKLOG.md`). There is **no** `checkbox` or plain `signature` type, and no `repeater`/`loop_group` (both retired in LIST-13). Adding one touches ~10 files — use the `add-step-type` skill.

### Logic Operators & Actions
- **One condition language.** `logic_rules.when` and `steps.visibleIf` / `pages.visibleIf` all
  store the same `ConditionExpression` (28-value `ComparisonOperator` union in
  `shared/types/conditions.ts`: starts_with, date diffs, includes_all, ...), evaluated by
  `shared/conditionEvaluator.ts`. The flat 9-value `conditionOperatorEnum` DB enum
  (`equals`/`not_equals`/`contains`/.../`is_not_empty`) that `logic_rules` used before LU-6a/LU-6c
  is gone — nothing produces or reads it anymore.
- **Actions** (`conditionalActionEnum`): show, hide, require, make_optional, skip_to

**Vocabulary boundary:** a workflow's navigable units are now always **pages** in
TypeScript, APIs, JSON, and product copy. The group layer introduced later in
Phase 1 uses **sections** as a new, distinct container for one or more pages.

## Environment Variables

**Required** (see `.env.example` for the full list):
```env
NODE_ENV=development|production
PORT=5000
BASE_URL=http://localhost:5000
DATABASE_URL=postgresql://user:pass@host/db
GOOGLE_CLIENT_ID=<server-id>
VITE_GOOGLE_CLIENT_ID=<client-id>
SESSION_SECRET=<32-char-secret>
JWT_SECRET=<secret>  # required in production; dev/test fall back to an insecure default (server/config/env.ts)
VL_MASTER_KEY=<base64-32-byte-key>  # NEVER regenerate on a machine with stored secrets
ALLOWED_ORIGIN=localhost,127.0.0.1
```

Login verifies the Google ID token with `new OAuth2Client(GOOGLE_CLIENT_ID)` only
(`server/googleAuth.ts`) — `GOOGLE_CLIENT_SECRET` is declared in the env schema but
never consumed anywhere in `server/` or `client/src/`; do not chase it down as a
login blocker.

**Optional:** `SENDGRID_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_API_KEY`, Stripe keys, `GOOGLE_PLACES_API_KEY`, `GOOGLE_CLIENT_SECRET`, and the `DOCUSIGN_*` JWT/Connect values documented in `.env.example`
**Tests:** `TEST_DATABASE_URL` overrides `DATABASE_URL` for unit-db/integration tests (Docker PG on port 5434 via `npm run test:docker:up`)

## Common Commands

```bash
npm run dev              # Start development (port 5000)
npm run kill-server      # Kill server on port 5000
npm run build            # Build for production
npm run type-check       # tsc --noEmit (build gate)
npm run lint             # ESLint, zero-error policy

npm run test:fast        # unit-fast (~13s, no DB) — default sanity check
npm run test:unit        # unit-fast + unit-db (needs DB)
npm run test:integration # integration project (needs DB, slow)
npm test                 # everything, single-fork + coverage (what CI uses)
npm run test:e2e         # Playwright
npm run test:docker:up   # Postgres 16 for tests on port 5434 (tmpfs)

npm run db:push          # Apply Drizzle schema to dev DB
npm run db:migrate       # Run SQL migrations (see db-schema-change skill first)
```

## Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| "column/relation does not exist" | Load the `db-schema-change` skill — do not guess; usually `npm run db:push` or a missing migration |
| Transform block output fails | `tsx scripts/migrateTransformBlockVirtualSteps.ts` |
| "Code did not call emit()" | Ensure code calls `emit(value)` exactly once |
| Google OAuth fails | Check `GOOGLE_CLIENT_ID`, origins, CORS; local auth workaround is in the `verify` skill |
| Test fails only locally | Check known-failure list in the `run-tests` skill (vm2/isolated-vm, excluded integration tests) |

## Documentation Index

### Quick Reference (Claude-optimized — update these when you change what they document)
| Document | Contents |
|----------|----------|
| [Schema Reference](./docs/claude/SCHEMA.md) | All 108 database tables by domain file + enums |
| [API Endpoints](./docs/claude/API_ENDPOINTS.md) | API domains → route files + verified endpoints |
| [Services Reference](./docs/claude/SERVICES.md) | Service classes by domain |
| [Frontend Pages](./docs/claude/PAGES.md) | All client routes from Router.tsx |
| [Features & Security](./docs/claude/FEATURES.md) | Feature status, security, changelog |

### Core Documentation
| Document | Contents |
|----------|----------|
| [README.md](./README.md) | Project overview, quick start, setup |
| [docs/INDEX.md](./docs/INDEX.md) | Full documentation hub |
| [Developer Reference](./docs/reference/DEVELOPER_REFERENCE.md) | Technical architecture guide |

### API & Blocks
| Document | Contents |
|----------|----------|
| [API Reference](./docs/api/API.md) | Complete workflow API endpoints |
| [Block Framework](./docs/api/BLOCKS.md) | Block types and examples |
| [Transform Blocks](./docs/api/TRANSFORM_BLOCKS.md) | JS/Python code blocks |

### Custom Scripting System
| Document | Contents |
|----------|----------|
| [Scripting Overview](./docs/scripting/overview.md) | Scripting system introduction |
| [Lifecycle Hooks](./docs/scripting/lifecycle-hooks.md) | 4 workflow phases |
| [Document Hooks](./docs/scripting/document-hooks.md) | 2 document phases |
| [Helper Library](./docs/scripting/helper-library.md) | 40+ utility functions |
| [Script Context](./docs/scripting/script-context.md) | Context object reference |
| [Debugging](./docs/scripting/debugging.md) | Script console, logging |
| [Examples](./docs/scripting/examples.md) | Code examples |

### Guides
| Document | Contents |
|----------|----------|
| [Auth System](./docs/guides/AUTH_SYSTEM.md) | Full auth architecture (JWT, MFA, sessions) |
| [Run Token Auth](./docs/guides/AUTHENTICATION.md) | Workflow run authentication |
| [Frontend Guide](./docs/guides/FRONTEND.md) | Frontend architecture |
| [Step Aliases](./docs/guides/STEP_ALIASES.md) | Variable naming system |
| [E-Signature](./docs/guides/ESIGNATURE_INTEGRATION.md) | DocuSign integration |
| [Legal Integrations](./docs/guides/LEGAL_INTEGRATIONS.md) | Clio Manage, Stripe Payments, and DocuSign setup |
| [Variables in Documents](./docs/guides/VARIABLES_IN_DOCUMENTS.md) | Template variables |
| [Scripts vs Template Filters](./docs/guides/SCRIPTING_VS_TEMPLATE_FILTERS.md) | Which of the two utility systems applies, and why page logic cannot call helpers |

### Architecture
| Document | Contents |
|----------|----------|
| [Shared Components](./docs/architecture/SHARED_COMPONENTS.md) | UI component library |
| [Error Handling](./docs/architecture/ERROR_HANDLING.md) | Error middleware |
| [Step Aliases Architecture](./docs/architecture/STEP_ALIASES_ARCHITECTURE.md) | Aliases deep dive |
| [Security Threat Model](./docs/architecture/SECURITY_THREAT_MODEL.md) | SSRF + mass-assignment invariants; why `safeFetch` and discriminated unions exist |

### Testing & Deployment
| Document | Contents |
|----------|----------|
| [Testing Framework](./docs/testing/TESTING.md) | Vitest + Playwright |
| [CI/CD Setup](./docs/deployment/CI_CD_SETUP.md) | GitHub Actions, Railway |

### Troubleshooting
| Document | Contents |
|----------|----------|
| [Common Issues](./docs/troubleshooting/TROUBLESHOOTING.md) | General troubleshooting |
| [OAuth Issues](./docs/troubleshooting/OAUTH_TROUBLESHOOTING.md) | OAuth debugging |
| [DataVault Fixes](./docs/troubleshooting/DATAVAULT_TABLE_CREATION_FIX.md) | DataVault issues |

## Key Conventions

1. **Authentication:** `hybridAuth` middleware is the standard (JWT bearer, then refresh cookie); `requireUser` only when the full User row is needed; `optionalHybridAuth` for public+personalized routes
2. **Error contract:** services throw errors with exact phrasings ("not found", "Access denied") that `classifyRouteError` maps to 404/403 — see `add-api-endpoint` skill
3. **Step Aliases:** human-friendly variable names for logic/transforms
4. **Two-Tier Visibility:** workflow logic rules + step-level `visibleIf` expressions
5. **Sandboxed Execution:** JS (vm2/vm) + Python (subprocess) with timeouts; vm2/isolated-vm are optional deps and may be missing locally
6. **Secrets:** AES-256-GCM encrypted, accessed via the secrets service only; outbound HTTP to user URLs goes through `safeFetch`
7. **Tenant Isolation:** service-layer `tenant_id` scoping, plus the `withTenant` helper and staged Postgres RLS (`migrations/0001_enable_rls.sql`, defined not-yet-enforced). New tenant tables need an RLS policy; never set the tenant GUC session-level — see `docs/architecture/TENANT_ISOLATION_RLS.md` (SEC-051)
8. **Client state vs server state:** anything persisted server-side is owned by its TanStack Query hook and must **never** be mirrored into a zustand store. The stores in `client/src/store/` hold ephemeral UI state only — "what am I looking at right now", discarded on reload. A mirrored copy drifts silently: builder `mode` lived in the global store with a `setMode` nobody called, so it sat at its `"easy"` default forever and every Advanced branch gating on it was unreachable for months (O-10). A global store also cannot represent a per-workflow setting, so syncing such a copy is not a fix. `tests/unit/client/store.deadSetters.test.ts` guards this — neither `tsc` nor ESLint can, because an uncalled store action is a *used property of an object literal*, not an unused export.
9. **Template grammar: one language, `RenderCore` owns it.** DOCX templates and runner
   answer-piping share a single grammar — `{{ alias | filter:"arg" }}` — parsed in exactly one
   place, `server/services/document/RenderCore.ts`, via docxtemplater's `angular-expressions`
   wrapper. Four rules that are easy to get wrong and were each paid for:
   **(a)** register filters from the `docxHelpers` **object**, never `import * as` — the module
   namespace misses the 8 merged in via `...formatters` (`currency`, `date`, `upper`, …);
   **(b)** an unknown *top-level* variable **raises**, while a known-but-empty one renders blank
   — `RunDataService` seeds every alias as `null` so a skipped optional question is not mistaken
   for a typo; **(c)** `{%` and `{#` are reserved and rejected, and that scan must run on text
   with markup stripped, because Word splits tags across runs; **(d)** filter arguments are
   colon-form (`| default:"N/A"`) — parenthesised does not parse. Authoring guide:
   `docs/guides/VARIABLES_IN_DOCUMENTS.md`, whose examples are executable in
   `tests/unit/services/document/docSamples.test.ts` — update them together.
10. **Parallel agents use worktrees, never the shared tree** — see below.
11. **Work promotes `dev` → `test` → `main`** — never commit or push straight to `main`; see below.

## Branch flow: dev → test → main

Three branches, in one direction:

| Branch | Railway environment | Role |
|--------|--------------------|------|
| `dev` | `dev` → ezbuildr-prod-dev.up.railway.app | Where work lands. Commit here by default. |
| `test` | `test` → ezbuildr-prod-test.up.railway.app | What CI has proven. Promoted from `dev` by merge once dev's build is green. |
| `main` | `production` → www.ezbuildr.com | What is **live**. Railway auto-deploys it with no staging step. |

Each Railway environment has its **own Neon database, S3 bucket and secrets** — they
are not sharing production's. Verify the branch → environment mapping in the Railway
UI rather than assuming it: until 2026-08-15 **all three environments were connected
to the `test` branch**, so a `git push origin dev:test` deployed straight to
www.ezbuildr.com. The Railway API does not expose the connected branch, and
`railway status` reports only the *linked* environment, so neither can confirm this —
the service's Settings → Source pane is the only source of truth.

**`Wait for CI` is OFF on all three environments.** Railway deploys the moment GitHub
receives the push, without waiting for Actions, so a red build still ships. Turning it
on for `production` is the single highest-value control still available.

- **Commit to `dev`.** If a task starts on `main` or `test`, branch to `dev` (or a
  feature branch off it) first.
- **`dev` → `test`: merge and push**, once CI is green on `dev`.
- **`test` → `main`: pull request only.** This is the hop that reaches production,
  so it gets the diff, the CI run before the merge, and the strict-zones summary
  comment — none of which a direct push produces.

**All three branches now run CI** (`ci.yml`, `strict-mode-check.yml`, `auth-tests.yml`).
Until 2026-08-13 only `main` did, so a break first became visible on the branch that
deploys: the `PdfConverter` env-leak failed six consecutive `main` builds, having
passed nothing earlier because nothing earlier ran. `strict-mode-check.yml` also
listed a `develop` branch that has never existed here, so that gate was half dead.

### The override

`.claude/hooks/guard-branch-push.mjs` (wired in `.claude/settings.json`) blocks any
`git push` to `main`. `test` is deliberately unguarded: its promotion *is* a push,
so guarding it would make the routine path need the override every time, which
turns the override into a reflex and leaves it meaning nothing on `main`. To push
to `main` anyway:

```bash
EZB_DIRECT_PUSH=1 git push origin main            # bash
$env:EZB_DIRECT_PUSH='1'; git push origin main    # PowerShell
```

**Claude sets that only when the repo owner has asked for a direct push in that
session** — never on its own initiative, and never to route around a red build.
Say so plainly in the response when you use it.

The guard resolves the real target (`HEAD:main`, `dev:main`, `--all`, and a bare
`git push` while `main` is checked out all count), so it cannot be sidestepped by
phrasing. It stops *forgetful* pushes, not determined ones — the assistant can type
the override itself.

### The real boundary: rulesets, not the legacy API

`main` is genuinely protected, by a **repository ruleset** — not by the classic
branch-protection API, which returns *"Branch protection has been disabled on this
repository"* (404) and made several audits conclude protection was off. **It is not.**
Check `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`, never
`…/branches/main/protection`.

| Ruleset | Branch | Rules |
|---------|--------|-------|
| `main-protection` | `main` | deletion, non-fast-forward, PR required (0 approvals), required checks |
| `test-snapshot-protection` | `test` | deletion, non-fast-forward |
| `dev-protection` | `dev` | deletion, non-fast-forward |

Required checks on `main` are **Quality Gates, Validate Strict Zones, Tests (24.x),
Security Scan**. The last two were added 2026-08-15; before that only the first two
were required, so a PR whose test suite or dependency audit was red could still merge —
which is exactly what both outages of that week were.

All three rulesets carry `RepositoryRole → bypass: always`, so the owner is never
locked out. That bypass is also why the `deletion` rule did **not** save `test`: the
repo had `delete_branch_on_merge=true`, and merging the `test` → `main` PR deleted the
branch through the bypass, leaving Railway's test environment reporting *"Connected
branch does not exist"*. **`delete_branch_on_merge` is now `false` and must stay that
way** — with a promotion-branch model, every promotion PR would otherwise delete the
branch it came from.

Do **not** add a "require linear history" rule. It forces squash/rebase merges, which
rewrite SHAs and make `test` and `main` diverge in content, breaking the fast-forward
promotions this model depends on. Promotion PRs merge with a merge commit; afterwards,
fast-forward `dev` and `test` back up to `main` so all three realign.

## Parallel work: use git worktrees

When dispatching more than one agent at a time (e.g. the `ticket-flow` skill's
Mode B), give each one its own git worktree: `Agent(isolation: "worktree")`.
Do **not** run concurrent agents in the main checkout.

This is a hard-won default. Running a 16-ticket initiative with 3-4 concurrent
devs in one shared tree (2026-07-25) produced, in a single session:

- **Co-mingled commits.** Three ticket pairs landed in the same file before
  either could be committed and had to share a commit (RUN2-2/5, RUN2-3/13,
  RUN2-12/16), losing one-commit-per-ticket traceability.
- **A near-miss data loss.** A dev ran `git stash` to get a clean baseline; a
  concurrent edit landed between push and pop, the pop conflicted, and both
  files were reset to HEAD. Recovered by hand, but only because it was noticed.
- **Blocked commits and false gate reports.** The repo-wide `tsc` in the
  pre-commit hook fails whenever *any* concurrent dev is mid-edit, so verified
  work could not be committed until unrelated agents finished — and agents
  reported their own gates green while the tree was red.

**Use the script. Do not hand-roll this.**

```powershell
pwsh scripts/new-worktree.ps1 -Name <ticket-id>
```

It creates the worktree from current `main`, **copies** `node_modules`, copies
`.env`, **creates a per-worktree test database**, and then *proves* the result:
`node_modules` is a real directory with `@types`/`typescript`/`vitest` resolving,
base commit matches `main`, the test DB is reachable, and `test:fast` actually
reports passing tests. It fails loudly rather than handing you a tree that looks
fine.

**Two defaults changed on 2026-08-02 — both because of real failures:**

- **`node_modules` is copied, not junctioned.** A junction shares one physical
  directory, and build caches inside it are keyed to a single project root:
  `node_modules/.vite` (Vite's dep-optimizer cache) and
  `node_modules/typescript/tsbuildinfo`. Sharing `.vite` across three concurrent
  worktrees made bare specifiers misresolve — the Node builtin `stream` resolving
  to `<worktree>\stream`. All three DataVault Phase 1 devs hit it and each
  invented a *different, initially undisclosed* workaround, so **not one of their
  gate reports was reproducible** and the reviewer re-ran every gate by hand.
  Note it passed at worktree-creation time and only broke later, once a second
  root rewrote the cache — the creation-time proof could not have caught it.
  Copying costs ~1GB and ~30-90s; an unreproducible gate report costs far more.
  Use `-LinkModules` only for a worktree that will never run Vitest.
- **Each worktree gets its own database** (`ezbuildr_test_<name>`). `tests/setup.ts`
  creates schemas per *worker*, not per process, so worktrees sharing one database
  clobber each other and fake dozens of failures.

**Tear worktrees down with `-Remove`, never with a bare `git worktree remove`:**

```powershell
pwsh scripts/new-worktree.ps1 -Name <ticket-id> -Remove
```

With `-LinkModules`, `git worktree remove --force` recurses **into** the
`node_modules` junction and deletes the main checkout's packages along with the
worktree. This is not hypothetical — it wiped all 1018 packages here and needed a
full `npm ci` to recover. `-Remove` drops the junction as a reparse point first,
then removes the worktree, then verifies the main `node_modules` survived.

`-Remove` also **checks that the removal actually happened**. `git worktree
remove` reports failures on stderr and exits non-zero, but PowerShell's
`$ErrorActionPreference` does not apply to native commands, so the script used to
print "Removed worktree" on a failed removal. Observed for real: git deregistered
and emptied the worktree, then hit `Permission denied` on the now-empty directory
(Windows holds a transient handle after a Vitest run), leaving a stale folder that
blocked the next create. It now prunes, retries, and verifies both git's view and
the disk before claiming success.

The rest of this section is why it exists — read it if the script fails.

**A worktree has no `node_modules` or `.env`** — `tsc`, ESLint and Vitest all
need them. Create the junction with **PowerShell**. Two different Git Bash
mistakes have now cost real time, and they fail in opposite ways:

- `cmd //c mklink` from Git Bash mangles the Windows path into a doubled drive
  letter (`C:\C:\Users\...`) that resolves to an *empty* directory. The gates
  then run against nothing and **report green**.
- `ln -s` from Git Bash creates a POSIX symlink rather than a Windows junction.
  `tsc` and ESLint work fine, so it looks healthy — but **every Vitest project
  fails to run at all** with `Vitest failed to find the runner`, because the
  setup file and the runner resolve two different `vitest` instances through
  the link. A dev agent turned in two submissions this way, having never
  executed a single test; both times the reviewer had to copy the work into the
  main checkout to find out whether it passed.

```powershell
New-Item -ItemType Junction -Path node_modules -Target C:\Users\<you>\path\to\repo\node_modules
```

Then **verify it resolved** before trusting any gate — `ls node_modules | head`
should list packages, and `node_modules/@types` must exist. Confirm it is a real
junction, not a symlink: `Get-Item node_modules | Select LinkType` must print
`Junction`. Copy `.env` from the main checkout too, or ~27 suites fail on
`DATABASE_URL: Required`.

**Prove the suite actually runs before dispatching anyone into the worktree:**
`npm run test:fast` must report passing files, not `0 test`. A worktree where
tests cannot run produces confident, unverifiable turn-ins.

**Check the worktree's base commit before trusting it.** A new worktree is not
guaranteed to start from current `HEAD` — in practice they have been created
from an older commit. On the first run of this policy, all three agents got a
base ~14 commits stale, so the tickets they were dispatched to work did not
exist in their copy of the ticket file and one correctly stopped with a blocker.
After dispatching, verify and fast-forward:

```bash
git worktree list                                  # confirm each base commit
git -C .claude/worktrees/<agent-dir> merge main --ff-only
```

Check `git diff --name-only <base>..main` for overlap with the agent's files
first; with no overlap the fast-forward preserves in-flight edits cleanly. Then
tell the agent to re-read its ticket and re-run its gates, since a stale base
also makes its test counts wrong.

Rules that still apply even with worktrees:

- The reviewer commits, one commit per passed ticket, staging **only that
  ticket's files by path**. Never `git add -A` — the repo owner works this
  repo from a second IDE concurrently, and unrelated staged changes are common.
- Verify gates yourself rather than trusting an agent's report. `tsc --pretty`
  emits ANSI codes, so `grep "error TS"` finds nothing on a failing tree — read
  the raw output or grep `Found [0-9]+ error`.
- Sequence, don't parallelize, tickets that touch the same file. Note each
  ticket's file footprint in its Ties so dispatch is a lookup.

---

**Maintainer:** Development Team | **Review:** when architecture changes land — keep the Quick Reference docs in sync

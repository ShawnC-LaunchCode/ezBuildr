# ezBuildr - Architecture Quick Reference

**Status:** Production Ready | **Updated:** July 11, 2026

## What is ezBuildr?

Enterprise workflow automation platform combining visual workflow building, conditional logic, custom code execution (JS/Python), and data management.

**Scale:** 29 pages | 63 route files | ~185 service files | 103 DB tables | 38 step types | 40+ script helpers

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
│   │   ├── runner/          # Run-time rendering (blocks/, sections/)
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
│   ├── routes/              # API handlers (63 *.routes.ts incl. ai/, datavault/)
│   ├── services/            # Business logic (~185 files incl. subdirs)
│   ├── repositories/        # Data access (BaseRepository pattern, ~41 files)
│   ├── middleware/          # hybridAuth, tenant, requireUser, error handling
│   └── di/                  # DI container (only partially adopted — prefer singletons)
├── shared/
│   ├── schema/              # Drizzle schema, one file per domain (103 tables)
│   ├── types/               # StepType, conditions, stepConfigs, ai, ...
│   ├── conditionEvaluator.ts # Logic engine
│   └── workflowLogic.ts     # Workflow execution logic
├── migrations/              # Single compacted baseline: 0000_init_baseline.sql
├── scripts/                 # Utility scripts (tsx)
└── tests/                   # unit-fast / unit-db / integration (see run-tests skill)
```

## Core Architecture

### Workflow Hierarchy
```
Projects → Workflows → Sections (Pages) → Steps (Questions/Actions)
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
| `sections` | Pages/sections with order, skipLogic, visibleIf |
| `steps` | Individual steps with type, alias, config, visibleIf |
| `workflow_runs` / `step_values` | Execution instances + run data (the only run model — graph run tables were dropped) |
| `datavault_databases` / `datavault_tables` / `datavault_rows` | DataVault (all `datavault_`-prefixed) |
| `lifecycle_hooks` / `document_hooks` | Custom scripting |
| `connections` / `secrets` | API integrations (encrypted) |
| `users` / `tenants` / `organizations` / `workspaces` | Auth & tenancy |

### Step Types
38 values in `stepTypeEnum` (`shared/schema/workflow.ts:38`) — legacy types (`short_text`, `multiple_choice`, `repeater`, `signature_block`, `computed`, ...), easy-mode types (`phone`, `date`, `currency`, `scale`, ...), and advanced-mode variants (`*_advanced`, `multi_field`, ...). There is **no** `checkbox` or plain `signature` type. Adding one touches ~10 files — use the `add-step-type` skill.

### Logic Operators & Actions
- **DB operators** (`conditionOperatorEnum`): equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty
- **Engine operators**: 28-value `ComparisonOperator` union in `shared/types/conditions.ts` (starts_with, date diffs, includes_all, ...)
- **Actions** (`conditionalActionEnum`): show, hide, require, make_optional, skip_to

## Environment Variables

**Required** (see `.env.example` for the full list):
```env
NODE_ENV=development|production
PORT=5000
BASE_URL=http://localhost:5000
DATABASE_URL=postgresql://user:pass@host/db
GOOGLE_CLIENT_ID=<server-id>
GOOGLE_CLIENT_SECRET=<server-secret>
VITE_GOOGLE_CLIENT_ID=<client-id>
SESSION_SECRET=<32-char-secret>
JWT_SECRET=<secret>
VL_MASTER_KEY=<base64-32-byte-key>  # NEVER regenerate on a machine with stored secrets
ALLOWED_ORIGIN=localhost,127.0.0.1
```

**Optional:** `SENDGRID_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_API_KEY`, Stripe keys, `GOOGLE_PLACES_API_KEY`
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
| [Schema Reference](./docs/claude/SCHEMA.md) | All 103 database tables by domain file + enums |
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
| [Variables in Documents](./docs/guides/VARIABLES_IN_DOCUMENTS.md) | Template variables |

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
8. **Parallel agents use worktrees, never the shared tree** — see below.

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

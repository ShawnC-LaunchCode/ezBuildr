# ezBuildr - Architecture Quick Reference

**Version:** 1.7.0 | **Status:** Production Ready | **Updated:** January 19, 2026

## What is ezBuildr?

Enterprise workflow automation platform combining visual workflow building, conditional logic, custom code execution (JS/Python), and data management.

**Scale:** 30+ pages | 66+ API routes | 90+ services | 80+ DB tables | 15+ step types | 40+ script helpers

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18.3, Vite 7.1, Zustand, TanStack Query, Radix UI, Tailwind, Wouter, React Hook Form + Zod |
| **Backend** | Node.js 20+, Express 4.21, Drizzle ORM 0.39, PostgreSQL (Neon) |
| **Auth** | Google OAuth2 (Passport.js), JWT, express-session |
| **AI** | OpenAI, Anthropic, Google Gemini |
| **DevOps** | Railway, GitHub Actions, Vitest + Playwright |

## Directory Structure

```
VaultLogic/
├── client/src/
│   ├── components/
│   │   ├── builder/         # Workflow builder (5-tab nav, canvas, inspector)
│   │   ├── preview/         # Preview & runner (18 block renderers)
│   │   ├── datavault/       # DataVault UI
│   │   ├── logic/           # Logic builder, visibility editor
│   │   └── ui/              # Shared components (Radix + Tailwind)
│   ├── pages/               # Route pages (30+)
│   ├── lib/                 # API clients, utilities
│   └── hooks/               # React hooks (30+)
├── server/
│   ├── routes/              # API handlers (66+ files)
│   ├── services/            # Business logic (90+ services)
│   ├── repositories/        # Data access (20+ repos)
│   └── middleware/          # Auth, validation, error handling
├── shared/
│   ├── schema/              # Drizzle schema (80+ tables)
│   ├── conditionalLogic.ts  # Logic engine
│   └── workflowLogic.ts     # Workflow execution
├── migrations/              # SQL migrations
├── scripts/                 # Utility scripts
└── tests/                   # Unit, integration, e2e
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
- **Services** (`server/services/`) - Business logic, authorization
- **Repositories** (`server/repositories/`) - Data access, queries

### Key Tables
| Table | Purpose |
|-------|---------|
| `workflows` | Workflow definitions |
| `sections` | Pages/sections with order, skipLogic, visibleIf |
| `steps` | Individual steps with type, alias, config, visibleIf |
| `workflowRuns` | Execution instances with runToken |
| `stepValues` | Run data storage |
| `databases/tables/table_rows` | DataVault data platform |
| `lifecycle_hooks/document_hooks` | Custom scripting |
| `connections/secrets` | API integrations (encrypted) |

### Step Types
`short_text`, `long_text`, `email`, `phone`, `website`, `number`, `currency`, `address`, `boolean`, `multiple_choice`, `radio`, `checkbox`, `scale`, `date`, `date_time`, `time`, `display`, `multi_field`, `signature`, `file_upload`, `computed`

### Logic Operators & Actions
- **Operators:** equals, not_equals, contains, greater_than, less_than, between, is_empty, is_not_empty
- **Actions:** show, hide, require, make_optional, set_value, skip_section

## Environment Variables

**Required:**
```env
NODE_ENV=development|production
PORT=5000
BASE_URL=http://localhost:5000
DATABASE_URL=postgresql://user:pass@host/db
GOOGLE_CLIENT_ID=<server-id>
VITE_GOOGLE_CLIENT_ID=<client-id>
SESSION_SECRET=<32-char-secret>
VL_MASTER_KEY=<base64-32-byte-key>  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ALLOWED_ORIGIN=localhost,127.0.0.1
```

**Optional:** `SENDGRID_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_API_KEY`

## Common Commands

```bash
npm run dev              # Start development
npm run build            # Build for production
npm start                # Start server
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:e2e         # Playwright E2E
npm run db:push          # Apply migrations
npm run kill-server      # Kill server on port 5000
```

## Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| "column does not exist" | `npx tsx scripts/fixAllMissingColumns.ts` |
| Transform block output fails | `tsx scripts/migrateTransformBlockVirtualSteps.ts` |
| "Code did not call emit()" | Ensure code calls `emit(value)` exactly once |
| Google OAuth fails | Check `GOOGLE_CLIENT_ID`, origins, CORS |

## Documentation Index

### Quick Reference (Claude-optimized)
| Document | Contents |
|----------|----------|
| [Schema Reference](./docs/claude/SCHEMA.md) | All 80+ database tables with columns |
| [API Endpoints](./docs/claude/API_ENDPOINTS.md) | All API routes organized by domain |
| [Services Reference](./docs/claude/SERVICES.md) | 90+ service classes by domain |
| [Frontend Pages](./docs/claude/PAGES.md) | 30+ pages with routes and features |
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
| [E-Signature](./docs/guides/ESIGNATURE_INTEGRATION.md) | DocuSign, HelloSign integration |
| [Variables in Documents](./docs/guides/VARIABLES_IN_DOCUMENTS.md) | Template variables |

### Architecture
| Document | Contents |
|----------|----------|
| [Shared Components](./docs/architecture/SHARED_COMPONENTS.md) | UI component library |
| [Error Handling](./docs/architecture/ERROR_HANDLING.md) | Error middleware |
| [Step Aliases Architecture](./docs/architecture/STEP_ALIASES_ARCHITECTURE.md) | Aliases deep dive |

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

1. **Authentication:** Bearer token, JWT, or session - all supported via `requireUser` middleware
2. **Step Aliases:** Human-friendly variable names for logic/transforms
3. **Two-Tier Visibility:** Workflow logic rules + step-level `visibleIf` expressions
4. **Sandboxed Execution:** JS (vm2) + Python (subprocess) with timeouts
5. **Secrets:** AES-256-GCM encrypted, accessed via `SecretService`

---

**Maintainer:** Development Team | **Review:** Monthly | **Next:** Feb 26, 2026

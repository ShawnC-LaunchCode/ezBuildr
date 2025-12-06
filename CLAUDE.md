# VaultLogic - Architecture & Current State

**Last Updated:** December 6, 2025
**Version:** 1.6.0 - DataVault v4 + Visibility Logic Builder
**Status:** Production Ready

---

## Executive Summary

VaultLogic is a **comprehensive workflow automation platform** that combines visual workflow building, conditional logic, custom code execution (JavaScript/Python), and runtime data collection. Originally inspired by Poll-Vault, VaultLogic has evolved into a production-ready workflow engine with advanced features for automation, data transformation, and team collaboration.

**Key Differentiators:**
- Visual workflow builder with drag-and-drop interface
- **DataVault:** Complete data management platform with databases, tables, and permissions
- **Two-tier visibility logic:** Workflow rules + step-level expressions
- Sandboxed JavaScript/Python execution for data transformation
- AI-powered workflow generation (OpenAI, Anthropic, Google Gemini)
- HTTP/API integration with OAuth2 Client Credentials + 3-legged flows
- Encrypted secrets management with AES-256-GCM
- Human-in-the-loop workflows (review gates, e-signatures)
- Token-based run authentication (creator + anonymous modes)
- Step aliases (human-friendly variable names)
- Real-time preview and comprehensive analytics

---

## Architecture Overview

### Tech Stack

**Frontend:**
- **Framework:** React 18.3.1 with Vite 7.1.9
- **State Management:** Zustand 5.0.8 + TanStack Query 5.60.5
- **UI Library:** Radix UI + Tailwind CSS 3.4.17
- **Routing:** Wouter 3.3.5
- **Forms:** React Hook Form 7.55.0 + Zod 3.24.2
- **Animations:** Framer Motion 11.13.1
- **Drag & Drop:** @dnd-kit/core 6.3.1
- **Charts:** Recharts 2.15.2

**Backend:**
- **Runtime:** Node.js 20+ (Express 4.21.2)
- **ORM:** Drizzle ORM 0.39.1
- **Database:** PostgreSQL (Neon serverless)
- **Authentication:** Google OAuth2 (Passport.js) + JWT
- **Session:** express-session + connect-pg-simple
- **Logging:** Pino 10.0.0
- **File Upload:** Multer 2.0.2
- **Email:** SendGrid 8.1.6
- **AI:** Google Gemini 0.24.1, OpenAI, Anthropic (optional)

**DevOps:**
- **Hosting:** Railway
- **CI/CD:** GitHub Actions
- **Testing:** Vitest 4.0.4 + Playwright 1.56.1

### Directory Structure

```
VaultLogic/
├── client/src/              # React frontend
│   ├── components/          # UI components (builder, logic, preview)
│   ├── pages/               # Route pages
│   ├── lib/                 # API clients, utilities
│   └── hooks/               # React hooks
├── server/                  # Node.js backend
│   ├── routes/              # API handlers (20+ files)
│   ├── services/            # Business logic (25+ services)
│   ├── repositories/        # Data access (15+ repos)
│   ├── middleware/          # Auth, validation, error handling
│   └── utils/               # Utilities
├── shared/                  # Shared code
│   ├── schema.ts            # Drizzle schema (30+ tables)
│   ├── conditionalLogic.ts  # Logic engine
│   └── workflowLogic.ts     # Workflow execution
├── migrations/              # SQL migrations
├── scripts/                 # Utility scripts
├── tests/                   # Test suites (unit, integration, e2e)
└── docs/                    # Documentation
```

---

## System Architecture

### Workflow-First Platform

**As of November 2025**, VaultLogic is a **dedicated workflow automation platform**:

**Workflows (VaultLogic Core)** - Primary system
- Tables: `workflows`, `sections`, `steps`, `workflowRuns`, `stepValues`
- Status: Production ready, active development
- Full feature set for workflow automation and data collection

**Legacy Survey System** (Removed Nov 16, 2025)
- Frontend completely removed (67 files, ~11,763 LOC)
- Backend routes disabled (returns 404)
- Database tables retained for historical data only
- Not accessible via UI or API

### Workflow System Architecture

```
Projects
  └── Workflows
        ├── Sections (Pages)
        │     └── Steps (Questions/Actions)
        │           ├── Step Aliases (Variables)
        │           └── Step Values (Run Data)
        ├── Logic Rules (Conditional Logic)
        ├── Transform Blocks (JS/Python Code)
        │     └── Virtual Steps (Computed Values)
        └── Workflow Runs (Execution Instances)
              ├── Run Token (Authentication)
              ├── Step Values (User Input)
              └── Progress Tracking
```

---

## Core Database Schema

**30+ tables organized by domain:**

### Core Workflow Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Top-level containers | `id`, `name`, `description`, `createdBy`, `tenantId` |
| `workflows` | Workflow definitions | `id`, `title`, `status`, `projectId`, `publicLink` |
| `sections` | Pages/sections | `id`, `workflowId`, `title`, `order`, `skipLogic`, `visibleIf` |
| `steps` | Individual steps | `id`, `sectionId`, `type`, `alias`, `required`, `config`, `visibleIf`, `defaultValue` |
| `stepValues` | Run data | `id`, `runId`, `stepId`, `value` |
| `workflowRuns` | Execution instances | `id`, `workflowId`, `runToken`, `createdBy`, `progress`, `completed` |

**Step Types:** short_text, long_text, multiple_choice, radio, checkbox, yes_no, date_time, file_upload, computed

### DataVault Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `databases` | Database definitions | `id`, `projectId`, `name`, `archived` |
| `tables` | Table schemas | `id`, `databaseId`, `name`, `columns` (JSONB) |
| `table_rows` | Actual data | `id`, `tableId`, `data` (JSONB) |
| `table_permissions` | Access control | `tableId`, `userId`, `teamId`, `canView`, `canCreate`, `canUpdate`, `canDelete` |
| `api_tokens` | External API access | `id`, `projectId`, `token`, `expiresAt` |
| `row_notes` | Row comments | `id`, `tableId`, `rowId`, `userId`, `note` |

**Column types:** text, number, date, boolean, select, multiselect, autonumber

### Logic & Automation Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `logicRules` | Conditional logic | `id`, `workflowId`, `condition`, `action` |
| `transformBlocks` | JS/Python code | `id`, `workflowId`, `code`, `inputKeys`, `outputKey`, `virtualStepId` |
| `transformBlockRuns` | Execution audit | `id`, `runId`, `blockId`, `status`, `errorMessage` |
| `blocks` | Reusable blocks | `id`, `workflowId`, `type`, `config` |

**Logic operators:** equals, not_equals, contains, greater_than, less_than, between, is_empty, is_not_empty

**Logic actions:** show, hide, require, make_optional, set_value, skip_section

### Integration Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `connections` | API connections | `id`, `projectId`, `connectionType`, `authConfig`, `secretRefs`, `oauthState` |
| `secrets` | Encrypted credentials | `id`, `projectId`, `key`, `type`, `encryptedValue`, `iv`, `authTag` |
| `review_tasks` | Review gates | `id`, `runId`, `status`, `assignedTo`, `decision` |
| `signature_requests` | E-signatures | `id`, `runId`, `token`, `status`, `documentUrl` |

**Connection types:** api_key, bearer, oauth2_client_credentials, oauth2_3leg

**Secret types:** api_key, bearer, oauth2, basic_auth

### Team Collaboration Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `teams` | Team entities | `id`, `name`, `createdBy` |
| `teamMembers` | Team membership | `teamId`, `userId`, `role` |
| `projectAccess` | Project permissions | `projectId`, `teamId`, `userId`, `role` |
| `workflowAccess` | Workflow permissions | `workflowId`, `teamId`, `userId`, `role` |

---

## Service Layer Architecture

### 3-Tier Pattern: Routes → Services → Repositories

**Routes** (`server/routes/`) - HTTP request/response handling, input validation (Zod)

**Services** (`server/services/`) - Business logic, authorization, transaction management

**Repositories** (`server/repositories/`) - Data access abstraction, query building

### Core Services (25+)

**Workflow Services:**
- WorkflowService, SectionService, StepService, RunService
- LogicService, TransformBlockService, BlockRunner
- VariableService, IntakeQuestionVisibilityService, IntakeNavigationService

**DataVault Services:**
- DatabaseService, TableService, TableRowService
- TablePermissionService, ApiTokenService, RowNoteService

**Integration Services:**
- ConnectionService, SecretService, OAuth2Service
- ReviewTaskService, SignatureRequestService

**Shared Services:**
- AnalyticsService, WorkflowExportService, ProjectService
- TeamService, AclService, ActivityLogService
- emailService, fileService, geminiService, AIService

---

## API Endpoints Summary

### Workflows
```
GET/POST    /api/workflows                    # List/Create
GET/PUT/DEL /api/workflows/:id                # CRUD operations
PATCH       /api/workflows/:id/status         # Update status
GET         /api/workflows/:id/variables      # Get aliases
```

### Sections & Steps
```
POST        /api/workflows/:id/sections       # Create section
PUT/DELETE  /api/sections/:id                 # Update/Delete
PUT         /api/workflows/:id/sections/reorder # Reorder

POST        /api/workflows/:wid/sections/:sid/steps # Create step
PUT/DELETE  /api/steps/:id                    # Update/Delete
PUT         /api/workflows/:id/steps/reorder  # Reorder
```

### Workflow Runs (Bearer Token or Session Auth)
```
POST        /api/workflows/:id/runs           # Create run (returns runToken)
GET         /api/runs/:id                     # Get run
GET/POST    /api/runs/:id/values              # Get/Save values
POST        /api/runs/:id/values/bulk         # Bulk save
POST        /api/runs/:id/sections/:sid/submit # Submit section
PUT         /api/runs/:id/complete            # Complete run
```

### Transform Blocks
```
GET/POST    /api/workflows/:id/transform-blocks # List/Create
PUT/DELETE  /api/transform-blocks/:id         # Update/Delete
POST        /api/transform-blocks/:id/test    # Test execution
```

### DataVault
```
# Databases
GET/POST    /api/projects/:id/databases       # List/Create
GET/PUT/DEL /api/databases/:id                # CRUD
POST        /api/databases/:id/archive        # Archive

# Tables & Rows
GET/POST    /api/databases/:id/tables         # List/Create tables
GET/PUT/DEL /api/tables/:id                   # CRUD tables
GET/POST    /api/tables/:id/rows              # List/Create rows
PUT/DELETE  /api/tables/:id/rows/:rowId       # Update/Delete row
POST        /api/tables/:id/rows/bulk         # Bulk operations

# API Tokens
GET/POST    /api/projects/:id/api-tokens      # List/Create
POST        /api/projects/:id/api-tokens/:tid/revoke # Revoke
```

### Connections & AI
```
GET/POST    /api/projects/:id/connections     # List/Create connections
POST        /api/projects/:id/connections/:id/test # Test connection
GET         /api/connections/oauth/start      # OAuth2 flow
GET         /api/connections/oauth/callback   # OAuth2 callback

POST        /api/ai/workflows/generate        # AI workflow generation
POST        /api/ai/workflows/:id/suggest     # AI suggestions
POST        /api/ai/templates/:tid/bindings   # AI template binding
```

### Analytics & Export
```
GET         /api/workflows/:id/analytics      # Analytics
GET         /api/workflows/:id/analytics/funnel # Funnel
GET         /api/workflows/:id/export/{format} # Export (json/csv/pdf)
```

---

## Key Features Status

### ✅ Complete Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Workflow Builder** | Production | 5-tab navigation, drag-and-drop, visual canvas |
| **DataVault** | Production | Complete data platform with tables, permissions, API tokens |
| **Visibility Logic** | Production | Two-tier: workflow rules + step-level expressions |
| **Transform Blocks** | Production | Sandboxed JS/Python execution with virtual steps |
| **Step Aliases** | Production | Human-friendly variable names |
| **Run Token Auth** | Production | Bearer token + session auth, anonymous runs |
| **Conditional Logic** | Production | Show/hide, require, skip sections |
| **Default Values** | Production | Pre-fill with URL parameter override |
| **HTTP/API Node** | Production | Full REST client with OAuth2 support |
| **Secrets Management** | Production | AES-256-GCM encrypted storage |
| **Review Gates** | Production | Human-in-the-loop approval workflows |
| **E-Signature** | Production | Token-based signing (native + DocuSign/HelloSign stubs) |
| **AI Generation** | Production | OpenAI/Anthropic/Gemini workflow creation |
| **Analytics** | Production | Funnel analysis, trends, export (JSON/CSV/PDF) |

### 🚧 In Progress

- Advanced Analytics Dashboards
- Team Collaboration (full RBAC)

### 📋 Planned Features

| Feature | Target | Description |
|---------|--------|-------------|
| **DataVault-Workflow Integration** | Q1 2026 | Use DataVault as data source in workflows |
| **Workflow Versioning** | Q1 2026 | Track changes, rollback capabilities |
| **Real-time Collaboration** | Q2 2026 | Multi-user editing with presence |
| **Integration Marketplace** | Q2 2026 | Third-party integrations ecosystem |

---

## Security Features

### Transform Block Sandboxing

**JavaScript (vm2):**
- No access to: `require`, `process`, `Buffer`, `global`, timers
- Only `input` object and `emit()` available
- Timeout enforced (max 3000ms)

**Python (subprocess):**
- Isolated subprocess execution
- Restricted builtins (no `os`, `sys`, `open`, `subprocess`, `socket`)
- No file system or network access
- Timeout with process termination
- Max output: 64KB

### General Security

- Google OAuth2 + JWT authentication
- Session management (PostgreSQL store)
- AES-256-GCM secrets encryption with master key
- CORS configuration
- Zod input validation
- Drizzle ORM (SQL injection protection)
- Rate limiting (10 req/min on test endpoints)
- File upload limits (10MB, MIME validation)

---

## Environment Configuration

**Required:**
```env
# Core
NODE_ENV=development|production
PORT=5000
BASE_URL=http://localhost:5000
DATABASE_URL=postgresql://user:pass@host/db

# Auth
GOOGLE_CLIENT_ID=<server-id>
VITE_GOOGLE_CLIENT_ID=<client-id>
SESSION_SECRET=<32-char-secret>

# Secrets (REQUIRED)
VL_MASTER_KEY=<base64-32-byte-key>

# CORS
ALLOWED_ORIGIN=localhost,127.0.0.1
```

**Optional:**
```env
SENDGRID_API_KEY=<key>
SENDGRID_FROM_EMAIL=<email>
GEMINI_API_KEY=<key>
AI_PROVIDER=openai|anthropic
AI_API_KEY=<key>
AI_MODEL_WORKFLOW=gpt-4-turbo-preview
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

**Generate VL_MASTER_KEY:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Testing Infrastructure

**Frameworks:**
- Unit: Vitest 4.0.4
- Integration: Vitest + supertest
- E2E: Playwright 1.56.1

**Commands:**
```bash
npm test                 # All tests with coverage
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e         # Playwright E2E
npm run test:watch       # Watch mode
npm run test:ui          # Interactive UI
```

---

## Deployment

**Production Stack:**
- Hosting: Railway
- Database: Neon PostgreSQL (serverless)
- CI/CD: GitHub Actions
- Logging: Pino structured logs

**Build & Deploy:**
```bash
npm run build            # Build for production
npm start                # Start server
npm run db:push          # Apply migrations
```

**Railway Configuration:**
Set all environment variables above with production values.

---

## Recent Architecture Changes

### DataVault v4 (Nov 18-26, 2025)
Complete data management platform with databases, tables, permissions, API tokens, and row comments. 7 column types, infinite scroll, advanced filtering, optimistic updates.

### Visibility Logic Builder (Nov 25, 2025)
Two-tier visibility system with workflow rules + step-level `visibleIf` expressions. React hook for real-time evaluation.

### JWT Auth Improvements (Nov 24, 2025)
New JWT token endpoint, cleaner auth patterns (`AuthRequest.userId` interface), better TypeScript typing.

### Default Values & URL Parameters (Nov 25, 2025)
Steps support `defaultValue` (JSONB), overridable via URL params for deep linking and testing.

### Integrations Hub - Stage 16 (Nov 13, 2025)
Unified connection model with OAuth2 3-legged flow, webhook node, connection health tracking.

### AI-Assisted Builder - Stage 15 (Nov 13, 2025)
Workflow generation from natural language, improvement suggestions, template variable binding with semantic matching.

### Review & E-Signature - Stage 14 (Nov 13, 2025)
Human-in-the-loop workflows with review gates, native e-signature support, token-based signing portals.

### HTTP/Secrets - Stage 9 (Nov 12, 2025)
Full HTTP/API node with OAuth2 Client Credentials, AES-256-GCM secrets encryption, LRU caching.

### Virtual Steps - Stage 8 (Nov 11, 2025)
Transform block outputs persisted via virtual steps with proper UUIDs, step aliases for variables.

### Survey System Removal (Nov 16, 2025)
Complete removal of legacy survey UI (67 files, ~11,763 LOC). VaultLogic is now 100% workflow-focused.

### Builder Navigation Overhaul (Nov 14-17, 2025)
5-tab navigation (Sections, Settings, Templates, Data Sources, Snapshots), mobile-responsive, template test runner.

---

## Troubleshooting

### Database Schema Issues
**Symptoms:** Login fails, "column does not exist" errors (PostgreSQL 42703)

**Fix:**
```bash
npx tsx scripts/fixAllMissingColumns.ts
npm run dev
```

Adds missing columns to `users`, `projects`, `workflows` tables, creates default tenant, sets up indices.

### Transform Blocks
**Issue:** Failed to persist output
**Fix:** Run `tsx scripts/migrateTransformBlockVirtualSteps.ts`

**Issue:** "Code did not call emit()"
**Fix:** Ensure code calls `emit(value)` exactly once

### Authentication
**Issue:** Google OAuth not working
**Check:** `GOOGLE_CLIENT_ID` values, authorized origins, CORS config

---

## Resources

### Documentation
- [Documentation Index](./docs/INDEX.md)
- [API Reference](./docs/api/API.md)
- [Developer Reference](./docs/reference/DEVELOPER_REFERENCE.md)
- [Testing Framework](./docs/testing/TESTING.md)
- [Changelog v1.6.0](./CHANGELOG_1.6.0.md)

### External Links
- [GitHub Repository](https://github.com/ShawnC-LaunchCode/VaultLogic)
- [Railway Hosting](https://railway.app/)
- [Neon Database](https://neon.tech/)
- [Drizzle ORM](https://orm.drizzle.team/)

---

**Document Maintainer:** Development Team
**Review Cycle:** Monthly
**Next Review:** January 6, 2026
**Version History:**
- v1.6.0 (Nov 26, 2025) - DataVault v4 + Visibility Logic Builder
- v1.5.0 (Nov 17, 2025) - Survey Removal + Navigation Overhaul

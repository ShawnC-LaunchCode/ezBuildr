# ezBuildr - Architecture & Current State

**Last Updated:** December 26, 2025
**Version:** 1.7.0 - Custom Scripting System (Lifecycle & Document Hooks)
**Status:** Production Ready - Enterprise Scale

---

## Executive Summary

ezBuildr is a **comprehensive enterprise workflow automation platform** that combines visual workflow building, conditional logic, custom code execution (JavaScript/Python), and advanced data management. Originally inspired by Poll-Vault, ezBuildr has evolved into a production-ready workflow engine with enterprise-grade features for automation, data transformation, team collaboration, and external integrations.

**Platform Scale:**
- **30+ frontend pages** with React 18.3 + TypeScript
- **66+ backend API route files** handling all operations
- **90+ service classes** implementing business logic
- **80+ PostgreSQL database tables** with Drizzle ORM
- **15+ question/action types** for workflows
- **40+ helper functions** for custom scripting

**Key Differentiators:**
- **Visual Workflow Builder:** Drag-and-drop interface with React Flow canvas + 5-tab navigation
- **DataVault:** Complete data management platform with databases, tables, permissions, infinite scroll, API tokens
- **Custom Scripting System:** Lifecycle & document hooks with 40+ helper functions, script console (Prompt 12)
- **Two-tier Visibility Logic:** Workflow rules + step-level expressions with real-time evaluation
- **Sandboxed Execution:** JavaScript (vm2) + Python (subprocess) with timeout enforcement and security isolation
- **AI-Powered Generation:** OpenAI, Anthropic, Google Gemini for workflow creation and optimization
- **HTTP/API Integration:** OAuth2 (Client Credentials + 3-legged) + encrypted secrets (AES-256-GCM)
- **E-Signature & Reviews:** DocuSign, HelloSign, native signatures with approval gates
- **Portal System:** Magic link authentication for external users, run tracking
- **Enterprise Features:** Multi-tenant workspaces, RBAC, Stripe billing integration, comprehensive audit logs
- **Document Generation:** PDF/DOCX with template variables, repeating sections, AI binding
- **Token-Based Auth:** Bearer token + JWT for API access, anonymous runs supported
- **Step Aliases:** Human-friendly variable names for logic and transforms
- **Real-time Collaboration:** Live presence, cursors, comments, version control
- **Advanced Analytics:** Funnel analysis, heatmaps, dropoff tracking, export (JSON/CSV/PDF)

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
├── client/src/              # React frontend (30+ pages)
│   ├── components/          # UI components
│   │   ├── builder/         # Workflow builder (5-tab nav, canvas, inspector)
│   │   ├── preview/         # Preview & runner components (18 block renderers)
│   │   ├── datavault/       # DataVault UI (tables, rows, permissions)
│   │   ├── logic/           # Logic builder, visibility editor
│   │   ├── analytics/       # Charts, dashboards, funnel analysis
│   │   ├── collaboration/   # Comments, presence, live cursors
│   │   └── ui/              # Shared UI components (Radix + Tailwind)
│   ├── pages/               # Route pages (30+)
│   │   ├── auth/            # Login, OAuth callback
│   │   ├── workflows/       # List, builder, visual builder, preview, runner
│   │   ├── runs/            # Runs dashboard, details, comparison
│   │   ├── datavault/       # Databases, tables, rows
│   │   ├── templates/       # Templates, marketplace, test runner
│   │   ├── portal/          # Portal login, dashboard
│   │   ├── admin/           # Admin dashboard, users, logs
│   │   └── settings/        # Branding, teams, connections
│   ├── lib/                 # API clients, utilities
│   └── hooks/               # React hooks (30+)
├── server/                  # Node.js backend
│   ├── routes/              # API handlers (66+ route files)
│   │   ├── workflows/       # Workflow CRUD, sections, steps
│   │   ├── runs/            # Run execution, values, completion
│   │   ├── datavault/       # Databases, tables, rows, permissions
│   │   ├── connections/     # API connections, OAuth2, secrets
│   │   ├── ai/              # Workflow generation, optimization
│   │   ├── documents/       # Document generation, templates
│   │   ├── analytics/       # Analytics, export, reporting
│   │   ├── portal/          # Portal auth, magic links
│   │   └── admin/           # Admin operations
│   ├── services/            # Business logic (90+ services)
│   │   ├── workflow/        # WorkflowService, SectionService, StepService
│   │   ├── execution/       # RunService, BlockRunner, IntakeService
│   │   ├── scripting/       # ScriptEngine, LifecycleHooks, DocumentHooks
│   │   ├── datavault/       # Database, Table, Row, Permission services
│   │   ├── documents/       # DocumentGeneration, TemplateParser, PDF
│   │   ├── integrations/    # Connections, Secrets, OAuth2, E-signature
│   │   ├── ai/              # AIService, GeminiService, Optimization
│   │   └── analytics/       # AnalyticsService, DropoffService, Heatmap
│   ├── repositories/        # Data access (20+ repos)
│   ├── middleware/          # Auth, validation, error handling
│   └── utils/               # Utilities
├── shared/                  # Shared code
│   ├── schema.ts            # Drizzle schema (80+ tables)
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

**As of November 2025**, ezBuildr is a **dedicated workflow automation platform**:

**Workflows (ezBuildr Core)** - Primary system
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

**80+ tables organized by domain:**

### Core Workflow Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Top-level containers | `id`, `name`, `description`, `createdBy`, `tenantId` |
| `workflows` | Workflow definitions | `id`, `title`, `status`, `projectId`, `publicLink` |
| `sections` | Pages/sections | `id`, `workflowId`, `title`, `order`, `skipLogic`, `visibleIf` |
| `steps` | Individual steps | `id`, `sectionId`, `type`, `alias`, `required`, `config`, `visibleIf`, `defaultValue` |
| `stepValues` | Run data | `id`, `runId`, `stepId`, `value` |
| `workflowRuns` | Execution instances | `id`, `workflowId`, `runToken`, `createdBy`, `progress`, `completed` |

**Step Types (15+):** short_text, long_text, email, phone, website, number, currency, address, boolean, multiple_choice, radio, checkbox, scale, date, date_time, time, display, multi_field, signature, file_upload, computed

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

### Custom Scripting System Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `lifecycle_hooks` | Workflow phase hooks | `id`, `workflowId`, `sectionId`, `name`, `phase`, `language`, `code`, `mutationMode` |
| `document_hooks` | Document transformation hooks | `id`, `workflowId`, `documentId`, `name`, `phase`, `language`, `code` |
| `script_execution_log` | Script execution audit trail | `id`, `runId`, `scriptType`, `scriptId`, `status`, `consoleOutput`, `durationMs` |

**Lifecycle hook phases:** beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated

**Document hook phases:** beforeGeneration, afterGeneration

**Supported languages:** JavaScript (vm2/vm sandbox), Python (subprocess isolation)

**Key Features:**
- **Helper Library:** 40+ safe utility functions (date, string, number, array, object, math, console, http)
- **Context Injection:** Workflow/run/phase metadata available via `context` object
- **Console Capture:** `helpers.console.log/warn/error()` captured for debugging
- **Mutation Mode:** Lifecycle hooks can transform workflow data between phases
- **Non-Breaking Execution:** Hook failures logged but don't crash workflows
- **Timeout Enforcement:** Configurable timeouts (100-3000ms) prevent infinite loops
- **Input/Output Whitelisting:** Explicit `inputKeys` and `outputKeys` for security
- **Execution Logging:** All script executions logged with console output and performance metrics

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
| `tenants` | Workspace tenants | `id`, `name`, `slug` |
| `organizations` | Enterprise orgs | `id`, `name`, `tenantId` |
| `workspaces` | Team workspaces | `id`, `name`, `tenantId` |
| `workspaceMembers` | Workspace membership | `workspaceId`, `userId`, `role` |
| `resourcePermissions` | Granular permissions | `resourceType`, `resourceId`, `userId`, `permission` |
| `auditLogs` | Activity tracking | `id`, `userId`, `action`, `resourceType`, `timestamp` |

### Portal & External Access Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `portalUsers` | Portal user accounts | `id`, `email`, `workflowId`, `magicToken` |
| `portalAccessLogs` | Portal login tracking | `id`, `portalUserId`, `timestamp` |
| `anonymousResponseTracking` | Anonymous run tracking | `id`, `runId`, `fingerprint` |

### Templates & Sharing Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workflowTemplates` | Workflow templates | `id`, `name`, `description`, `createdBy` |
| `workflowBlueprints` | Template blueprints | `id`, `templateId`, `structure` (JSONB) |
| `templateShares` | Sharing permissions | `id`, `templateId`, `sharedWith`, `permissions` |
| `emailTemplateMetadata` | Email templates | `id`, `projectId`, `name`, `htmlContent` |

### Analytics & Metrics Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `analyticsEvents` | Event tracking | `id`, `workflowId`, `runId`, `eventType`, `timestamp` |
| `workflowRunEvents` | Run-level events | `id`, `runId`, `eventName`, `metadata` (JSONB) |
| `workflowRunMetrics` | Run metrics | `id`, `runId`, `completionTime`, `dropoffStep` |
| `blockMetrics` | Block performance | `id`, `blockId`, `executionTime`, `errorRate` |
| `workflowAnalyticsSnapshots` | Analytics snapshots | `id`, `workflowId`, `snapshotDate`, `metrics` (JSONB) |
| `metricsEvents` | Metric events | `id`, `eventType`, `value`, `timestamp` |
| `metricsRollups` | Aggregated metrics | `id`, `period`, `aggregatedData` (JSONB) |

### Document Generation Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `runGeneratedDocuments` | Generated PDFs/DOCX | `id`, `runId`, `documentUrl`, `fileType`, `createdAt` |
| `signatureEvents` | Signature audit trail | `id`, `signatureRequestId`, `eventType`, `timestamp` |
| `finalBlock` | Final block config | `id`, `workflowId`, `templateId`, `config` (JSONB) |

### Billing & Enterprise Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `subscriptions` | Stripe subscriptions | `id`, `tenantId`, `stripeSubscriptionId`, `status`, `planId` |
| `billingPlans` | Plan definitions | `id`, `name`, `features` (JSONB), `priceMonthly` |
| `subscriptionSeats` | Seat management | `id`, `subscriptionId`, `userId`, `assignedAt` |
| `customerBillingInfo` | Billing addresses | `id`, `tenantId`, `billingEmail`, `stripeCustomerId` |
| `usageRecords` | Usage metering | `id`, `tenantId`, `period`, `runCount`, `workflowCount` |

### Versioning & State Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workflowVersions` | Version history | `id`, `workflowId`, `versionNumber`, `publishedAt`, `snapshot` (JSONB) |
| `workflowSnapshots` | Test data snapshots | `id`, `workflowId`, `name`, `data` (JSONB) |
| `sessions` | Express sessions | `sid`, `sess` (JSONB), `expire` |
| `userPreferences` | User settings | `id`, `userId`, `preferences` (JSONB) |
| `userPersonalizationSettings` | Personalization | `id`, `userId`, `settings` (JSONB) |
| `workflowPersonalizationSettings` | Workflow personalization | `id`, `workflowId`, `settings` (JSONB) |

### Legacy & Collections Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `collections` | Legacy collections | `id`, `projectId`, `name` |
| `collectionFields` | Collection schemas | `id`, `collectionId`, `fieldName`, `fieldType` |
| `records` | Collection records | `id`, `collectionId`, `data` (JSONB) |
| `surveys` | Legacy surveys (deprecated) | `id`, `title`, `createdBy` |
| `questions` | Legacy questions | `id`, `surveyId`, `questionType` |
| `responses` / `answers` | Legacy response data | `id`, `surveyId`, `userId`, `submittedAt` |

### Utility Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `files` | File storage metadata | `id`, `filename`, `mimeType`, `uploadedBy`, `url` |
| `apiKeys` | API token storage | `id`, `projectId`, `key`, `expiresAt` |
| `runLogs` | Run execution logs | `id`, `runId`, `logLevel`, `message`, `timestamp` |
| `systemStats` | System metrics | `id`, `statName`, `value`, `recordedAt` |
| `auditEvents` | Comprehensive audit trail | `id`, `userId`, `action`, `resourceType`, `before`, `after`, `timestamp` |

---

## Service Layer Architecture

### 3-Tier Pattern: Routes → Services → Repositories

**Routes** (`server/routes/`) - HTTP request/response handling, input validation (Zod)

**Services** (`server/services/`) - Business logic, authorization, transaction management

**Repositories** (`server/repositories/`) - Data access abstraction, query building

### Core Services (90+)

**Workflow Core Services:**
- WorkflowService, SectionService, StepService, RunService
- LogicService, VariableService, BlockService
- WorkflowClonerService, WorkflowExportService, WorkflowBundleService
- VersionService, SnapshotService

**Execution & Runtime Services:**
- RunService, BlockRunner, IntakeService
- TransformBlockService, QueryBlockService
- IntakeNavigationService, IntakeQuestionVisibilityService
- RepeaterService, QueryService

**Custom Scripting Services (Prompt 12):**
- ScriptEngine (unified JS/Python orchestrator)
- HelperLibrary (40+ utility functions)
- ScriptContext (context injection)
- LifecycleHookService, DocumentHookService
- LifecycleHookRepository, DocumentHookRepository
- ScriptExecutionLogRepository

**DataVault Services:**
- DatavaultDatabasesService, DatavaultTablesService, DatavaultColumnsService
- DatavaultRowsService, DatavaultRowNotesService
- DatavaultTablePermissionsService, DatavaultApiTokensService

**Document Generation Services:**
- DocumentGenerationService, DocumentTemplateService
- DocumentEngine, EnhancedDocumentEngine
- FinalBlockRenderer, TemplateParser, TemplateScanner
- MappingInterpreter, VariableNormalizer
- PdfConverter, ZipBundler
- docxRenderer, docxRenderer2

**E-Signature Services:**
- SignatureBlockService, EsignProvider
- DocusignProvider, SignatureRequestService
- EnvelopeBuilder

**AI & Optimization Services:**
- AIService (OpenAI, Anthropic, Gemini)
- GeminiService, WorkflowOptimizationService
- TemplateAnalysisService

**Analytics & Reporting Services:**
- AnalyticsService (overview metrics)
- DropoffService (funnel analysis)
- BranchingService (conditional flow analysis)
- AggregationService, HeatmapService

**Collections Services (Legacy Data):**
- CollectionService, CollectionFieldService
- RecordService

**Integration & Connection Services:**
- ConnectionService, SecretService, OAuth2Service
- ExternalDestinationService, GooglePlacesService
- WebhookService

**Authentication & Security Services:**
- AuthService (JWT, session)
- AclService (access control)
- CaptchaService, PortalAuthService
- PortalService

**Template & Sharing Services:**
- TemplateService, TemplateSharingService
- TemplateTestService, WorkflowTemplateService
- TemplateInsertionService

**Business Logic Services:**
- ProjectService, TeamService
- ReviewTaskService, BrandingService
- DataSourceService, RandomizerService

**Utility Services:**
- ActivityLogService, emailService, fileService
- UserPreferencesService, AccountService
- PdfQueueService

---

## API Endpoints Summary (66+ Route Files)

### Workflows & Structure
```
GET/POST    /api/workflows                    # List/Create workflows
GET/PUT/DEL /api/workflows/:id                # CRUD operations
PATCH       /api/workflows/:id/status         # Update status (draft/active/archived)
GET         /api/workflows/:id/variables      # Get step aliases
POST        /api/workflows/:id/publish        # Publish new version
POST        /api/workflows/:id/clone          # Clone workflow

POST        /api/workflows/:id/sections       # Create section
PUT/DELETE  /api/sections/:id                 # Update/Delete section
PUT         /api/workflows/:id/sections/reorder # Reorder sections

POST        /api/workflows/:wid/sections/:sid/steps # Create step
PUT/DELETE  /api/steps/:id                    # Update/Delete step
PUT         /api/workflows/:id/steps/reorder  # Reorder steps
```

### Workflow Execution (Bearer Token or Session Auth)
```
POST        /api/workflows/:id/runs           # Create run (returns runToken)
GET         /api/runs/:id                     # Get run details
GET/POST    /api/runs/:id/values              # Get/Save step values
POST        /api/runs/:id/values/bulk         # Bulk save values
POST        /api/runs/:id/sections/:sid/submit # Submit section
POST        /api/runs/:id/next                # Navigate to next section
PUT         /api/runs/:id/complete            # Complete run (triggers transforms)
GET         /api/runs/:id/trace               # Get execution trace
GET         /api/runs                         # List runs (with filters)
```

### Blocks & Code Execution
```
GET/POST    /api/workflows/:id/blocks         # List/Create blocks
PUT/DELETE  /api/blocks/:id                   # Update/Delete block
POST        /api/blocks/:id/test              # Test block execution

GET/POST    /api/workflows/:id/transform-blocks # Transform blocks
PUT/DELETE  /api/transform-blocks/:id         # Update/Delete
POST        /api/transform-blocks/:id/test    # Test with sample data
```

### Lifecycle & Document Hooks (Prompt 12)
```
# Lifecycle Hooks (4 phases)
GET/POST    /api/workflows/:workflowId/lifecycle-hooks # List/Create hooks
PUT/DELETE  /api/lifecycle-hooks/:hookId      # Update/Delete hook
POST        /api/lifecycle-hooks/:hookId/test # Test hook with sample data

# Document Hooks (2 phases)
GET/POST    /api/workflows/:workflowId/document-hooks # List/Create hooks
PUT/DELETE  /api/document-hooks/:hookId       # Update/Delete hook
POST        /api/document-hooks/:hookId/test  # Test hook with sample data

# Script Console (Execution Logs)
GET/DELETE  /api/runs/:runId/script-console   # Get/Clear execution logs
```

### DataVault (Complete Data Platform)
```
# Databases
GET/POST    /api/projects/:id/databases       # List/Create databases
GET/PUT/DEL /api/databases/:id                # CRUD databases
POST        /api/databases/:id/archive        # Archive database

# Tables & Rows
GET/POST    /api/databases/:id/tables         # List/Create tables
GET/PUT/DEL /api/tables/:id                   # CRUD tables
GET/POST    /api/tables/:id/rows              # List/Create rows (infinite scroll)
PUT/DELETE  /api/tables/:id/rows/:rowId       # Update/Delete row
POST        /api/tables/:id/rows/bulk         # Bulk operations

# Permissions & API Tokens
GET/POST    /api/tables/:id/permissions       # Table permissions
POST        /api/projects/:id/api-tokens      # Create API token
GET         /api/projects/:id/api-tokens      # List tokens
POST        /api/projects/:id/api-tokens/:tid/revoke # Revoke token

# Row Notes
GET/POST    /api/tables/:tid/rows/:rid/notes  # Row comments
```

### Logic & Visibility
```
GET/POST    /api/workflows/:id/logic          # List/Create logic rules
PUT/DELETE  /api/logic/:id                    # Update/Delete rule
POST        /api/workflows/:id/logic/validate # Validate logic
```

### Connections & Integrations
```
GET/POST    /api/projects/:id/connections     # List/Create connections
PATCH/DEL   /api/projects/:id/connections/:cid # Update/Delete connection
POST        /api/projects/:id/connections/:cid/test # Test connection
GET         /api/connections/oauth/start      # Start OAuth2 flow (3-legged)
GET         /api/connections/oauth/callback   # OAuth2 callback handler

GET/POST    /api/projects/:id/secrets         # Encrypted secrets
DELETE      /api/secrets/:id                  # Delete secret

POST        /api/webhooks                     # Create webhook subscription
GET         /api/webhooks/:id                 # Get webhook details
```

### AI-Powered Features
```
POST        /api/ai/workflows/generate        # Generate workflow from description
POST        /api/ai/workflows/:id/suggest     # Suggest improvements
POST        /api/ai/workflows/:id/optimize    # Optimize workflow structure
POST        /api/ai/templates/:tid/bindings   # AI template variable binding
POST        /api/ai/transform/generate        # Generate transform block code
POST        /api/ai/personalization/:wid      # Personalization suggestions
```

### Templates & Marketplace
```
GET/POST    /api/templates                    # List/Create templates
GET/PUT/DEL /api/templates/:id                # CRUD templates
POST        /api/templates/:id/share          # Share template
GET         /api/templates/:id/test           # Test template
POST        /api/templates/:id/insert         # Insert into workflow
GET         /api/marketplace                  # Browse marketplace
GET         /api/marketplace/:id              # Get marketplace item
```

### Document Generation & E-Signature
```
# Documents
GET/POST    /api/workflows/:id/documents      # Document templates
PUT/DELETE  /api/documents/:id                # Update/Delete template
POST        /api/documents/:id/generate       # Generate document
GET         /api/runs/:rid/documents          # Get run documents

# E-Signature
POST        /api/signatures/request           # Create signature request
GET         /api/signatures/:id               # Get request status
POST        /api/signatures/:id/sign          # Sign document (portal)
GET         /api/signatures/:id/download      # Download signed document

# Review Gates
POST        /api/reviews                      # Create review task
GET         /api/reviews/:id                  # Get review task
POST        /api/reviews/:id/approve          # Approve
POST        /api/reviews/:id/reject           # Reject
```

### Analytics & Reporting
```
GET         /api/workflows/:id/analytics      # Overview analytics
GET         /api/workflows/:id/analytics/funnel # Funnel analysis
GET         /api/workflows/:id/analytics/trends # Response trends
GET         /api/workflows/:id/analytics/heatmap # Field-level heatmap
GET         /api/workflows/:id/analytics/branching # Branching analysis
GET         /api/workflows/:id/export/json    # Export JSON
GET         /api/workflows/:id/export/csv     # Export CSV
GET         /api/workflows/:id/export/pdf     # Export PDF
```

### Portal & External Access
```
POST        /api/portal/login                 # Magic link login
GET         /api/portal/verify/:token         # Verify magic link
GET         /api/portal/runs                  # Portal user runs
POST        /api/portal/runs/:id/resume       # Resume workflow

# Public Access
GET         /api/public/workflows/:slug       # Public workflow access
POST        /api/public/workflows/:slug/runs  # Create anonymous run
```

### Teams & Collaboration
```
GET/POST    /api/teams                        # List/Create teams
GET/PUT/DEL /api/teams/:id                    # CRUD teams
POST        /api/teams/:id/members            # Add member
DELETE      /api/teams/:tid/members/:uid      # Remove member
GET/POST    /api/projects/:pid/access         # Project access control
GET/POST    /api/workflows/:wid/access        # Workflow access control
```

### Versioning & Snapshots
```
GET         /api/workflows/:id/versions       # List versions
GET         /api/workflows/:id/versions/:vid  # Get version
POST        /api/workflows/:id/versions/:vid/restore # Restore version
GET/POST    /api/workflows/:id/snapshots      # Snapshots (test data)
DELETE      /api/snapshots/:id                # Delete snapshot
```

### Admin & System
```
GET         /api/admin/users                  # List users
POST        /api/admin/users/:id/set-admin    # Set admin status
GET         /api/admin/logs                   # Audit logs
GET         /api/admin/stats                  # System stats
POST        /api/admin/diagnostics            # Run diagnostics

GET         /api/account                      # User account
PUT         /api/account                      # Update account
GET/PUT     /api/preferences                  # User preferences
```

### Billing & Enterprise
```
GET         /api/billing/subscription         # Get subscription
POST        /api/billing/subscription         # Create subscription
PUT         /api/billing/subscription         # Update subscription
POST        /api/billing/portal               # Stripe portal session
GET         /api/billing/usage                # Usage metrics
```

### Branding & Customization
```
GET/PUT     /api/branding/:projectId          # Branding settings
POST        /api/branding/:projectId/logo     # Upload logo
GET/POST    /api/branding/:projectId/domains  # Custom domains
GET/POST    /api/email-templates              # Email templates
```

---

## Frontend Pages & Capabilities (30+ Pages)

### Authentication & Landing
- **Landing Page** (`/`) - Public homepage, unauthenticated users
- **Login Page** (`/login`) - Google OAuth2 authentication
- **Dashboard** (`/dashboard`) - Main hub after login, workflow overview

### Workflow Management
- **Workflows List** (`/workflows`) - Browse all workflows with filters
- **New Workflow** (`/workflows/new`) - Create new workflow
- **Workflow Builder** (`/workflows/:id/build`) - 5-tab builder interface
  - Sections Tab - Manage pages/sections
  - Templates Tab - Insert reusable templates
  - Data Sources Tab - Configure DataVault connections
  - Settings Tab - Workflow properties
  - Snapshots Tab - Save/restore test data
- **Visual Workflow Builder** (`/workflows/:id/visual`) - React Flow canvas editor
- **Workflow Preview** (`/workflows/:id/preview`) - In-memory preview mode
- **Workflow Analytics** (`/workflows/:id/analytics`) - Funnel, dropoff, trends

### Workflow Execution
- **Workflow Runner** (`/workflows/:id/run`) - Participant completion view
- **Public Runner** (`/w/:slug`) - Public workflow access (no login)
- **Intake Preview** (`/workflows/:id/intake`) - Branded intake form preview
- **Runs Dashboard** (`/runs`) - List all completed/in-progress runs
- **Run Details** (`/runs/:id`) - View specific run (trace, inputs, outputs, logs)
- **Run Comparison** (`/runs/compare`) - Compare multiple runs side-by-side
- **Shared Run View** (`/share/:token`) - Public share view of completed runs

### DataVault (Data Management)
- **DataVault Dashboard** (`/datavault`) - Home, database overview
- **Databases** (`/datavault/databases`) - List/create databases
- **Database Details** (`/datavault/databases/:id`) - View tables in database
- **Database Settings** (`/datavault/databases/:id/settings`) - Permissions, columns
- **Tables List** (`/datavault/tables`) - All tables across projects
- **Table View** (`/datavault/tables/:id`) - Data grid with infinite scroll, filtering
- **Collections** (`/datavault/collections`) - Legacy data structure (deprecated)

### Templates & Marketplace
- **Templates** (`/templates`) - Browse, create, share templates
- **Marketplace** (`/marketplace`) - Discover shared templates
- **Template Test Runner** (`/templates/:id/test`) - Test with sample data
- **Template Upload** (`/templates/upload`) - Import templates

### Integrations & Settings
- **Connections** (`/connections`) - API connections, OAuth2 setup
- **Branding Settings** (`/branding`) - Custom domains, colors, logos
- **Domain List** (`/domains`) - Custom domain management
- **Email Templates** (`/email-templates`) - Email template editor
- **Settings** (`/settings`) - User preferences

### Portal System
- **Portal Login** (`/portal/login`) - Magic link authentication
- **Portal Magic Link** (`/portal/verify/:token`) - Verify magic link
- **Portal Dashboard** (`/portal/dashboard`) - Run history for portal users

### Teams & Collaboration
- **Teams** (`/teams`) - Team management, member invitations
- **Team Details** (`/teams/:id`) - Team members, permissions
- **Project Access** (`/projects/:id/access`) - Project permissions

### Admin & Enterprise
- **Admin Dashboard** (`/admin`) - System overview
- **Admin Users** (`/admin/users`) - User management
- **Admin Logs** (`/admin/logs`) - Audit trail
- **Billing Dashboard** (`/billing`) - Subscription management
- **Pricing Page** (`/pricing`) - Plan comparison

---

## Key Features Status

### ✅ Complete Features (Production Ready)

| Feature | Status | Description |
|---------|--------|-------------|
| **Visual Workflow Builder** | ✅ Production | 5-tab navigation, drag-and-drop, React Flow canvas, inspector panel |
| **15+ Question Types** | ✅ Production | Text, email, phone, number, currency, address, choice, scale, date, time, signature, file upload, display, multi-field, computed |
| **DataVault** | ✅ Production | Complete data platform: databases, tables, rows, 7 column types, infinite scroll, permissions, API tokens, row notes |
| **Custom Scripting System** | ✅ Production | Lifecycle hooks (4 phases) + document hooks (2 phases), 40+ helper functions, JS/Python, script console (Prompt 12) |
| **Two-Tier Visibility Logic** | ✅ Production | Workflow rules + step-level `visibleIf` expressions with real-time evaluation |
| **Transform Blocks** | ✅ Production | Sandboxed JS/Python execution, virtual steps, test playground, graph view |
| **Step Aliases** | ✅ Production | Human-friendly variable names for logic and transforms |
| **Run Token Authentication** | ✅ Production | Bearer token + JWT + session auth, anonymous runs, portal magic links |
| **Conditional Logic** | ✅ Production | Show/hide/require/skip sections, 8+ operators, visual editor |
| **Default Values** | ✅ Production | Pre-fill with defaults, URL parameter override |
| **HTTP/API Integration** | ✅ Production | Full REST client, OAuth2 (Client Credentials + 3-legged), webhooks |
| **Secrets Management** | ✅ Production | AES-256-GCM encrypted storage, LRU cache |
| **Review Gates** | ✅ Production | Human-in-the-loop approval, assign to users/teams |
| **E-Signature** | ✅ Production | DocuSign, HelloSign, native signatures, signing portals |
| **Document Generation** | ✅ Production | PDF/DOCX generation, template variables, repeating sections, AI binding |
| **AI-Powered Features** | ✅ Production | Workflow generation (OpenAI/Anthropic/Gemini), suggestions, optimization, template binding |
| **Templates & Marketplace** | ✅ Production | Reusable templates, sharing, marketplace, test runner, import/export |
| **Advanced Analytics** | ✅ Production | Funnel analysis, dropoff tracking, heatmaps, branching analysis, export (JSON/CSV/PDF) |
| **Portal System** | ✅ Production | Magic link authentication, external user access, run tracking |
| **Multi-Tenant Workspaces** | ✅ Production | Tenants, organizations, workspaces, resource permissions |
| **Team Collaboration** | ✅ Production | Teams, roles, project/workflow access control, invitations |
| **Versioning & Snapshots** | ✅ Production | Version history, publish workflow, diff viewer, restore, test data snapshots |
| **Real-time Collaboration** | ✅ Production | Live presence, cursors, comments on steps, activity logs |
| **Billing Integration** | ✅ Production | Stripe subscriptions, plans, usage metering, seat management |
| **Branding & Customization** | ✅ Production | Custom colors, logos, domains, white-label intake forms, email templates |
| **Admin & Audit** | ✅ Production | Admin dashboard, user management, comprehensive audit logs, system diagnostics |

### 🚧 In Progress

- **Advanced Analytics Dashboards** - Enhanced visualizations and reporting
- **DataVault-Workflow Integration** - Use DataVault as dynamic data source in workflows

### 📋 Planned Features

| Feature | Target | Description |
|---------|--------|-------------|
| **Enhanced Versioning** | Q1 2026 | Branch management, merge conflicts, change tracking |
| **Integration Marketplace** | Q2 2026 | Third-party integrations ecosystem, plugin system |
| **Advanced Personalization** | Q2 2026 | AI-powered user personalization, adaptive workflows |
| **Mobile Builder App** | Q3 2026 | Native mobile app for workflow building |

---

## Security Features

### Scripting System Sandboxing

**JavaScript (vm2/vm):**
- No access to: `require`, `process`, `Buffer`, `global`, timers
- Only `input`, `context`, and `helpers` objects available
- `emit()` function for output
- Timeout enforced (100-3000ms configurable)
- Code size limit: 32KB
- Output size limit: 64KB

**Python (subprocess):**
- Isolated subprocess execution
- Restricted builtins (no `os`, `sys`, `open`, `subprocess`, `socket`)
- No file system or network access
- Timeout with process termination
- Max output: 64KB

**Helper Library Security:**
- HTTP requests proxied through backend (URL whitelist validation)
- No direct network access from sandbox
- Console capture instead of native console
- Date/math operations use safe libraries (date-fns)
- All helpers designed to prevent code injection

**Script Execution Security:**
- Input/output key whitelisting (explicit allowlists)
- Non-breaking error handling (workflows continue on script failure)
- Execution audit logging (all scripts logged with performance metrics)
- Workflow ownership validation (only owners can create/modify hooks)
- Rate limiting on test endpoints (10 req/min)

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
npm run kill-server      # Gracefully kill server on port 5000
```

**Railway Configuration:**
Set all environment variables above with production values.

---

## Recent Architecture Changes

### Custom Scripting System - Prompt 12 (Dec 7, 2025)
Comprehensive scripting infrastructure with lifecycle hooks (beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated) and document hooks (beforeGeneration, afterGeneration). Features 40+ helper functions, context injection, console capture, mutation mode, and script console for debugging. Unified ScriptEngine orchestrates JavaScript (vm2/vm) and Python (subprocess) execution with security sandboxing.

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
Complete removal of legacy survey UI (67 files, ~11,763 LOC). ezBuildr is now 100% workflow-focused.

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
**Next Review:** February 26, 2026
**Version History:**
- v1.7.0 (Dec 26, 2025) - Custom Scripting System (Lifecycle & Document Hooks) + Documentation Update
- v1.6.0 (Nov 26, 2025) - DataVault v4 + Visibility Logic Builder
- v1.5.0 (Nov 17, 2025) - Survey Removal + Navigation Overhaul

# VaultLogic - Architecture & Current State

**Last Updated:** November 14, 2025
**Version:** 1.4.0 - Stage 21 Complete (Backend + Document Engine)
**Status:** Production Ready (Backend), Frontend Pending

---

## Executive Summary

VaultLogic is a **comprehensive workflow automation platform** that combines visual workflow building, conditional logic, custom code execution (JavaScript/Python), and run-time data collection. Originally inspired by Poll-Vault (a survey platform), VaultLogic has evolved into a next-generation workflow engine with advanced features for automation, data transformation, and team collaboration.

**Key Differentiators:**
- Visual workflow builder with drag-and-drop interface
- Sandboxed JavaScript/Python execution for data transformation
- **AI-powered workflow generation from natural language** 🆕
- **AI-driven workflow suggestions and improvements** 🆕
- **Intelligent template variable binding with AI** 🆕
- **HTTP/API integration with comprehensive authentication**
- **Encrypted secrets management for API credentials**
- **OAuth2 Client Credentials flow with intelligent caching**
- **Human-in-the-loop workflows with review and e-signature nodes**
- **Document review portals with approval/rejection workflow**
- **Native e-signature support with token-based signing**
- Token-based run authentication (creator + anonymous modes)
- Step aliases (human-friendly variable names)
- Virtual steps architecture for computed values
- Real-time preview and testing capabilities
- Comprehensive analytics and data export

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
- **Authentication:** Google OAuth2 (Passport.js)
- **Session:** express-session + connect-pg-simple
- **Logging:** Pino 10.0.0
- **File Upload:** Multer 2.0.2
- **Email:** SendGrid 8.1.6
- **AI:** Google Gemini 0.24.1 (optional)

**DevOps:**
- **Hosting:** Railway
- **CI/CD:** GitHub Actions
- **Testing:** Vitest 4.0.4 + Playwright 1.56.1

### Directory Structure

```
VaultLogic/
├── client/src/              # React frontend
│   ├── components/          # UI components
│   │   ├── builder/         # Workflow builder UI
│   │   ├── common/          # Shared components
│   │   ├── logic/           # Logic rule editor
│   │   ├── preview/         # Workflow preview/runner
│   │   └── ui/              # Radix UI components
│   ├── pages/               # Route pages
│   ├── lib/                 # API clients, hooks, utilities
│   └── hooks/               # React hooks
├── server/                  # Node.js backend
│   ├── routes/              # API route handlers (20+ files)
│   ├── services/            # Business logic layer (25+ services)
│   ├── repositories/        # Data access layer (15+ repos)
│   ├── middleware/          # Auth, error handling, validation
│   └── utils/               # Utilities, helpers
├── shared/                  # Shared code
│   ├── schema.ts            # Drizzle ORM schema (30+ tables)
│   ├── conditionalLogic.ts  # Logic engine
│   └── workflowLogic.ts     # Workflow execution
├── migrations/              # SQL migrations
├── scripts/                 # Utility scripts
├── tests/                   # Test suites
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # Playwright E2E tests
└── docs/                    # Documentation
    ├── api/                 # API documentation
    ├── guides/              # Implementation guides
    ├── architecture/        # Architecture docs
    ├── testing/             # Testing guides
    └── reference/           # Reference materials
```

---

## Core Concepts & Data Model

### Dual System: Surveys (Legacy) + Workflows (Current)

VaultLogic maintains **two parallel systems**:

1. **Surveys (Poll-Vault Legacy)** - Traditional survey system
   - Tables: `surveys`, `surveyPages`, `questions`, `responses`, `answers`
   - Status: Complete, stable, in production use

2. **Workflows (VaultLogic Core)** - Modern workflow automation
   - Tables: `workflows`, `sections`, `steps`, `workflowRuns`, `stepValues`
   - Status: Active development, primary focus

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

### Key Database Tables (30+ total)

#### Core Workflow Tables

**`projects`** - Top-level containers for workflows
- `id` (uuid), `name`, `description`, `createdBy`, `createdAt`, `updatedAt`

**`workflows`** - Workflow definitions
- `id` (uuid), `title`, `description`, `status` (draft/active/archived)
- `projectId`, `createdBy`, `publicLink` (for anonymous access)
- `easyModeEnabled`, `welcomeScreen`, `thankYouScreen`

**`sections`** - Pages/sections within workflows
- `id` (uuid), `workflowId`, `title`, `description`, `order`
- `skipLogic` (jsonb) - conditions for skipping sections

**`steps`** - Individual steps/questions
- `id` (uuid), `sectionId`, `type`, `title`, `description`
- `alias` (text) - human-friendly variable name
- `required`, `order`, `config` (jsonb)
- `isVirtual` (boolean) - for computed/transform block outputs
- **Types:** short_text, long_text, multiple_choice, radio, checkbox, yes_no, date_time, file_upload, computed

**`stepValues`** - Data collected during runs
- `id` (uuid), `runId`, `stepId`, `value` (jsonb)
- Stores all user input and computed values

**`workflowRuns`** - Execution instances
- `id` (uuid), `workflowId`, `runToken` (unique auth token)
- `createdBy` (creator:<userId> or anon)
- `completed`, `completedAt`, `currentSectionId`, `progress`

#### Logic & Automation Tables

**`logicRules`** - Conditional logic rules
- `id` (uuid), `workflowId`, `condition` (jsonb), `action` (jsonb)
- **Actions:** show, hide, require, make_optional, set_value, skip_section
- **Operators:** equals, not_equals, contains, greater_than, less_than, between, is_empty, is_not_empty

**`transformBlocks`** - JavaScript/Python code blocks
- `id` (uuid), `workflowId`, `sectionId`, `name`, `language`
- `code` (text), `inputKeys` (text[]), `outputKey` (text)
- `virtualStepId` (uuid) - reference to virtual step for output storage
- `phase` (onSectionSubmit/onWorkflowComplete)
- `enabled`, `order`, `timeoutMs`

**`transformBlockRuns`** - Audit log for transform block executions
- `id` (uuid), `runId`, `blockId`, `status` (success/error/timeout)
- `startedAt`, `finishedAt`, `errorMessage`, `outputSample`

**`blocks`** - Reusable workflow blocks (validation, branch, API, etc.)
- `id` (uuid), `workflowId`, `type`, `name`, `config` (jsonb)

#### Team Collaboration Tables

**`teams`** - Team entities
- `id` (uuid), `name`, `description`, `createdBy`, `createdAt`

**`teamMembers`** - Team membership
- `teamId`, `userId`, `role` (owner/admin/member/viewer)
- `joinedAt`, `invitedBy`

**`projectAccess`** / **`workflowAccess`** - Access control
- Link teams/users to projects/workflows with specific roles

#### Legacy Survey Tables

**`surveys`**, **`surveyPages`**, **`questions`**, **`responses`**, **`answers`** - Original survey system (stable, in production)

---

## Key Features & Implementation Status

### ✅ Complete Features

#### 1. Workflow Builder
- **Visual canvas editor** with drag-and-drop sections and steps
- **Sidebar tree view** with collapsible sections
- **Inspector panel** with step settings, logic, and blocks
- **Easy/Advanced mode toggle** for creator experience levels
- **Real-time preview** with hot-reload
- **Step reordering** within and across sections
- **Workflow duplication** with optional data

#### 2. Transform Blocks (JavaScript/Python Execution) 🆕
**Status:** ✅ Complete (Nov 2025)
- **Sandboxed execution** with vm2 (JS) and subprocess (Python)
- **Input whitelisting** - only specified step keys accessible
- **Output persistence** via virtual steps architecture
- **Timeout enforcement** (100-3000ms configurable)
- **Test data configuration UI** with "Generate All" button
- **Custom titles** for better organization
- **Enhanced error reporting** with stack traces and line numbers
- **Audit logging** - all executions tracked in `transformBlockRuns`
- **Rate limiting** - 10 test requests/min per user

**Virtual Steps Architecture** (Nov 11, 2025):
- Each transform block automatically creates a **virtual step**
- Virtual step has proper UUID for `stepValues` table
- Uses `outputKey` as step alias for referencing
- Marked as `isVirtual=true` (filtered from UI)
- Type: `computed`
- Fixes critical bug: transform outputs now persist correctly

**Example:**
```javascript
// Transform Block: Full Name
// inputKeys: ["firstName", "lastName"]
// outputKey: "fullName"
return input.firstName + ' ' + input.lastName;
```

#### 3. Step Aliases (Variables) 🆕
**Status:** ✅ Complete (Nov 2025)
- **Human-friendly variable names** for steps (e.g., `firstName`, `age`)
- **Unique per workflow** with validation
- **VariableSelect component** for easy reference in logic and blocks
- **Shown in sidebar** as badges next to step titles
- **Used throughout:** logic rules, transform blocks, computed values

#### 4. Run Token Authentication 🆕
**Status:** ✅ Complete (Nov 2025)
- **No more participants table** - simplified architecture
- **UUID run tokens** generated for each workflow run
- **Bearer token auth** for anonymous runs
- **Creator session auth** for authenticated access
- **Dual auth middleware:** `creatorOrRunTokenAuth`
- **Public links** for anonymous workflow access

#### 5. Conditional Logic Engine
- **Show/hide steps and sections** based on user input
- **Require/make optional** dynamically
- **Set values** programmatically
- **Skip sections** based on conditions
- **Complex operators:** equals, contains, greater_than, less_than, between, is_empty, etc.
- **Visual logic builder** with rule editor UI

#### 6. Workflow Runs & Data Collection
- **Run creation** (creator or anonymous)
- **Step value persistence** with upsert operations
- **Section submission** with validation
- **Progress tracking** (percentage, current section)
- **Run completion** with transform block execution
- **Bulk value operations** for performance

#### 7. Analytics & Reporting
- **Analytics events tracking** (page_view, question_focus, survey_complete, etc.)
- **Completion funnel analysis**
- **Response trends** over time
- **Drop-off analysis** per section
- **Time tracking** per step/section
- **Data export:** JSON, CSV, PDF

#### 8. Authentication & Authorization
- **Google OAuth2** integration
- **Session management** with PostgreSQL store
- **Role-based access:** admin, creator
- **Team-based access control** (in progress)

#### 9. File Uploads
- **Multer integration** with 10MB limit
- **MIME type validation**
- **File metadata storage** in `files` table
- **Linked to answers**

#### 10. Email Service
- **SendGrid integration**
- **Invitation emails** with custom templates
- **Reminder emails** for incomplete responses

### 🚧 In Progress

1. **Team Collaboration**
   - Tables created, basic structure in place
   - Full CRUD and permissions pending

2. **Advanced Analytics Visualization**
   - Basic analytics complete
   - Advanced dashboards in development

### 📋 Planned Features

1. **Workflow Versioning** - Track changes and rollback capabilities
2. **Logic Block Templates** - Pre-built reusable logic patterns
3. **Real-time Collaboration** - Multi-user editing with presence
4. **Integration Marketplace** - Third-party integrations ecosystem
5. **Advanced Analytics Dashboards** - Custom reporting and visualizations
6. **Workflow Templates Gallery** - Industry-specific starter templates

---

## Service Layer Architecture

### 3-Tier Pattern: Routes → Services → Repositories

**Routes** (`server/routes/`)
- Handle HTTP requests/responses
- Validate input with Zod schemas
- Call service methods
- Use centralized error handling middleware

**Services** (`server/services/`)
- Business logic and orchestration
- Authorization checks
- Cross-entity operations
- Transaction management

**Repositories** (`server/repositories/`)
- Data access abstraction
- CRUD operations
- Query building
- Database interactions

### Core Services (25+)

**Workflow Services:**
- `WorkflowService` - Workflow CRUD, status management
- `SectionService` - Section CRUD, reordering
- `StepService` - Step CRUD, alias validation, reordering
- `RunService` - Run creation, token generation, progress tracking
- `LogicService` - Logic rule management and evaluation
- `TransformBlockService` - Transform block CRUD, execution, testing
- `BlockRunner` - Transform block execution engine
- `VariableService` - Variable/alias management

**Legacy Survey Services:**
- `SurveyService` - Survey CRUD
- `ResponseService` - Response collection

**Shared Services:**
- `AnalyticsService` - Event tracking, funnel analysis
- `WorkflowExportService` - JSON/CSV/PDF export
- `ProjectService` - Project management
- `TeamService` - Team collaboration
- `AclService` - Access control lists
- `ActivityLogService` - Audit logging
- `emailService` - SendGrid integration
- `fileService` - File upload handling
- `geminiService` - AI integration (optional)

---

## API Endpoints

### Workflows

```
GET    /api/workflows                    # List workflows
POST   /api/workflows                    # Create workflow
GET    /api/workflows/:id                # Get workflow with sections/steps
PUT    /api/workflows/:id                # Update workflow
DELETE /api/workflows/:id                # Delete workflow
PATCH  /api/workflows/:id/status         # Update status

GET    /api/workflows/:id/variables      # Get all step aliases (variables)
```

### Sections

```
POST   /api/workflows/:id/sections       # Create section
PUT    /api/sections/:id                 # Update section
DELETE /api/sections/:id                 # Delete section
PUT    /api/workflows/:id/sections/reorder # Bulk reorder
```

### Steps

```
POST   /api/workflows/:wid/sections/:sid/steps # Create step
PUT    /api/steps/:id                    # Update step (including alias)
DELETE /api/steps/:id                    # Delete step
PUT    /api/workflows/:id/steps/reorder  # Bulk reorder
```

### Transform Blocks

```
GET    /api/workflows/:id/transform-blocks           # List blocks
POST   /api/workflows/:id/transform-blocks           # Create block (creates virtual step)
PUT    /api/transform-blocks/:id                     # Update block (updates virtual step)
DELETE /api/transform-blocks/:id                     # Delete block (deletes virtual step)
POST   /api/transform-blocks/:id/test                # Test with sample data
```

### Workflow Runs

```
POST   /api/workflows/:id/runs                       # Create run (returns runToken)
GET    /api/runs/:id                                 # Get run (session OR token)
GET    /api/runs/:id/values                          # Get step values (session OR token)
POST   /api/runs/:id/values                          # Save single value (token)
POST   /api/runs/:id/values/bulk                     # Bulk save values (token)
POST   /api/runs/:id/sections/:sid/submit            # Submit section (token)
POST   /api/runs/:id/next                            # Navigate to next section (token)
PUT    /api/runs/:id/complete                        # Complete run (executes transforms)
```

### Logic Rules

```
GET    /api/workflows/:id/logic                      # List logic rules
POST   /api/workflows/:id/logic                      # Create logic rule
PUT    /api/logic/:id                                # Update logic rule
DELETE /api/logic/:id                                # Delete logic rule
```

### Analytics

```
GET    /api/workflows/:id/analytics                  # Get workflow analytics
GET    /api/workflows/:id/analytics/funnel           # Get completion funnel
GET    /api/workflows/:id/analytics/trends           # Get response trends
```

### Export

```
GET    /api/workflows/:id/export/json                # Export all run data (JSON)
GET    /api/workflows/:id/export/csv                 # Export all run data (CSV)
GET    /api/workflows/:id/export/pdf                 # Export responses (PDF)
```

---

## Recent Major Changes (Nov 2025)

### Stage 16: Integrations Hub (Nov 13, 2025) 🆕
**Major Feature:** Unified connection management, OAuth2 3-legged flow, and webhook node

**Unified Connection Model:**
- Single `connections` table for all connection types (api_key, bearer, oauth2_client_credentials, oauth2_3leg)
- Replaces and extends Stage 9 `externalConnections` with enhanced capabilities
- Support for multiple secret references per connection
- Connection health tracking (last tested, last used timestamps)
- Automatic migration from old to new connection model

**OAuth2 3-Legged Authorization Flow:**
- Full authorization code grant implementation with CSRF protection
- User-initiated OAuth flows with state token validation
- Automatic token refresh when expired
- Encrypted storage of access and refresh tokens
- Support for Google, Microsoft, Dropbox, and other OAuth2 providers

**Enhanced HTTP Node:**
- Automatic detection of new vs old connections
- Seamless OAuth2 token injection and rotation
- Connection usage tracking
- Backward compatible with Stage 9 external connections

**Webhook Node (NEW):**
- Fire-and-forget or blocking modes
- Connection-based auth support
- Automatic retries with exponential backoff
- Template variable interpolation in URL, headers, and body
- Response body capture (limited to 512 bytes)
- Conditional execution support

**ConnectionService:**
- Complete CRUD operations for connections
- Connection resolution with secret decryption
- OAuth2 flow initiation and callback handling
- Connection testing and status monitoring
- Refresh token management

**API Endpoints:**
- `GET/POST/PATCH/DELETE /api/projects/:id/connections` - Connection CRUD
- `POST /api/projects/:id/connections/:id/test` - Test connection
- `GET /api/connections/oauth/start` - Initiate OAuth2 flow
- `GET /api/connections/oauth/callback` - Handle OAuth2 callback
- `GET /api/projects/:id/connections/:id/status` - Get connection status

**Database Schema:**
- Added `connection_type` enum: api_key, bearer, oauth2_client_credentials, oauth2_3leg
- New `connections` table with tenant/project scoping
- `authConfig` JSONB for provider-specific settings
- `secretRefs` JSONB for multiple secret references
- `oauthState` JSONB for encrypted token storage
- Unique constraint on (project_id, name)

**Migration:** `migrations/0016_add_connections_table.sql` with automatic data migration

**Documentation:** See `docs/STAGE_16_INTEGRATIONS_HUB.md` for complete guide

**Status:** Backend complete, frontend UI TODO

---

### Stage 15: AI-Assisted Workflow Builder (Nov 13, 2025) 🆕
**Major Feature:** AI-powered workflow generation using OpenAI and Anthropic

**AI Workflow Generation:**
- Generate complete workflows from natural language descriptions
- Creates sections, steps, logic rules, and transform blocks automatically
- Validates AI-generated structures for consistency and correctness
- Configurable constraints (max sections, max steps, preferred types)

**AI Workflow Suggestions:**
- Suggest improvements to existing workflows based on user requests
- Propose new sections, steps, and logic rules
- Non-destructive suggestions that can be reviewed before applying

**AI Template Bindings:**
- Automatically map DOCX placeholders to workflow variables
- Semantic matching with confidence scores (0-1)
- Identifies unmatched placeholders and variables
- Saves time on manual template configuration

**Supporting Infrastructure:**
- TypeScript types and Zod schemas for AI-generated structures
- AIService class with OpenAI and Anthropic provider support
- Structured prompts with constraints and examples
- Rate limiting (10 requests/min per user)
- RBAC enforcement (Builder/Owner only)
- Comprehensive error handling and logging

**API Endpoints:**
- `POST /api/ai/workflows/generate` - Generate new workflow
- `POST /api/ai/workflows/:id/suggest` - Suggest improvements
- `POST /api/ai/templates/:templateId/bindings` - Suggest bindings

**Configuration:**
- `AI_PROVIDER`: 'openai' or 'anthropic'
- `AI_API_KEY`: API key for chosen provider
- `AI_MODEL_WORKFLOW`: Model to use (e.g., gpt-4-turbo-preview, claude-3-5-sonnet)

**Documentation:** See `docs/STAGE_15_AI_WORKFLOW_BUILDER.md` for complete guide

**Status:** Backend complete, frontend UI pending

---

### Stage 14: E-Signature Node + Document Review Portal (Nov 13, 2025)
**Major Feature:** Human-in-the-loop workflow capabilities with review gates and e-signatures

**REVIEW Node:**
- Human review/approval gates for workflows
- Internal or external reviewer support
- Approve, request changes, or reject decisions
- Workflow pauses until review is completed
- Automatic workflow resumption after approval

**ESIGN Node:**
- Native e-signature support for documents
- Token-based public signing links (no login required)
- Signature request tracking and audit trail
- Support for DocuSign and HelloSign (stubs for future)
- Configurable expiration (default 72 hours)
- Email/name variable resolution from workflow context

**Database Schema:**
- Added run statuses: `waiting_review`, `waiting_signature`
- New `review_tasks` table for review tracking
- New `signature_requests` table for signature workflows
- New `signature_events` table for audit trail
- New enums: `review_task_status`, `signature_request_status`, `signature_provider`, `signature_event_type`

**Backend Services:**
- `ReviewTaskService`: Review task management and decision processing
- `SignatureRequestService`: Signature request creation and token management
- `resumeRunFromNode()`: Workflow resumption mechanism after waiting states

**API Endpoints:**
- `/api/review/tasks/:id` - Review task management
- `/api/review/tasks/:id/decision` - Approve/reject/request changes
- `/api/sign/:token` - Public signature portal (no auth)
- `/api/signatures/requests/:id` - Signature request management

**Engine Integration:**
- REVIEW and ESIGN nodes registered in engine
- Nodes return 'waiting' status to pause execution
- Service layer creates database records and updates run status

**Migration:** `migrations/0015_add_review_and_esign_tables.sql`

**Documentation:** See `docs/STAGE_14_REVIEW_ESIGN.md` for complete guide

**Status:** Backend complete, frontend portals TODO

---

### Stage 9: HTTP/Fetch Node + Secrets Management (Nov 12, 2025)
**Major Feature:** External API integration and secure credential management

**HTTP Node Engine:**
- Full-featured HTTP/API request node for workflows
- Methods: GET, POST, PUT, PATCH, DELETE
- Auth types: API Key, Bearer Token, OAuth2 Client Credentials, Basic Auth, None
- Features: timeout control, automatic retries, exponential backoff, response caching
- JSONPath response mapping to workflow variables
- Template variable interpolation (`{{var}}` in URLs, headers, body)

**Secrets Management:**
- AES-256-GCM encrypted storage for API keys, tokens, OAuth2 credentials
- Envelope encryption with master key (`VL_MASTER_KEY` env var)
- Secret types: api_key, bearer, oauth2, basic_auth
- Complete CRUD API with RBAC (Owner/Builder only)
- Never exposes plaintext values via API
- Redacted logging for all secret values

**External Connections:**
- Reusable API connection configurations
- Centralized credential management
- Default headers, timeout, retry settings
- Easy credential rotation

**Supporting Services:**
- OAuth2 Client Credentials service with intelligent token caching
- In-memory LRU cache for tokens and HTTP responses
- JSONPath selector utility for response mapping
- Comprehensive encryption utilities

**Schema Changes:**
- Added `secretTypeEnum`: api_key, bearer, oauth2, basic_auth
- Updated `secrets` table with `type` and `metadata` columns
- Created `externalConnections` table
- Unique constraints on (projectId, key) and (projectId, name)

**Migration:** `migrations/0009_add_external_connections_and_secret_types.sql`

**Documentation:** See `docs/STAGE_9_HTTP_SECRETS.md` for complete guide

---

### Stage 8: Virtual Steps for Transform Blocks (Nov 11, 2025)
**Problem:** Transform block outputs couldn't be persisted because `outputKey` (string) was used as `stepId` (UUID required)

**Solution:** Virtual steps architecture
- Each transform block automatically creates a virtual step
- Virtual step has proper UUID for `stepValues` storage
- Uses `outputKey` as step alias
- Marked as `isVirtual=true` (filtered from UI)
- Type: `computed`

**Schema Changes:**
- Added `'computed'` to `stepTypeEnum`
- Added `isVirtual` column to `steps` table
- Added `virtualStepId` column to `transformBlocks` table

**Migration:** `migrations/0008_add_virtual_steps_for_transform_blocks.sql`

---

### Additional Stage 8 Features (Nov 2025)

**Bearer Token Authentication:**
- All preview runner endpoints support `Authorization: Bearer <runToken>`
- Middleware: `creatorOrRunTokenAuth` accepts session OR token
- Enables anonymous runs with public links

**Step Aliases (Variables):**
- Added `alias` column to `steps` table
- Unique per workflow with partial index
- VariableSelect component for UI
- Variable resolution in logic rules and transform blocks

**Enhanced Transform Block Features:**
- Test data configuration UI with "Generate All" button
- Custom titles for blocks
- Enhanced error reporting with stack traces and line numbers
- Improved code editor with syntax validation

**Run Token System:**
- Removed `participants` table completely
- Added `runToken`, `createdBy`, `currentSectionId`, `progress` to `workflowRuns`
- Added `publicLink` to `workflows`
- Simplified architecture: creator session OR run token

---

## Security Features

### Transform Block Sandboxing

**JavaScript (vm2):**
- No access to: `require`, `process`, `Buffer`, `global`, `setTimeout`, `setInterval`
- Only `input` object and `emit()` function available
- Timeout enforced (max 3000ms)
- Falls back to Node.js `vm` if vm2 unavailable

**Python (subprocess):**
- Runs in isolated subprocess
- Restricted builtins: no `os`, `sys`, `open`, `subprocess`, `socket`
- No file system or network access
- Timeout enforced with process termination
- Max output size: 64KB

### General Security
- Google OAuth2 authentication
- Session management with PostgreSQL store
- CORS configuration with `ALLOWED_ORIGIN`
- Input validation with Zod schemas
- SQL injection protection via Drizzle ORM parameterization
- Rate limiting on test endpoints
- File upload size limits (10MB)
- MIME type validation

---

## Environment Configuration

Required environment variables:

```env
# Core
NODE_ENV=development|production
PORT=5000
BASE_URL=http://localhost:5000
VITE_BASE_URL=http://localhost:5000

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host.neon.tech/vault_logic

# Google OAuth2 (required)
GOOGLE_CLIENT_ID=your-server-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-client-web-client-id.apps.googleusercontent.com

# Session Security
SESSION_SECRET=your-super-secret-32-character-minimum-session-key

# CORS (hostnames only)
ALLOWED_ORIGIN=localhost,127.0.0.1

# Secrets Management (Stage 9 - REQUIRED)
VL_MASTER_KEY=your-base64-encoded-32-byte-master-key

# Optional Services
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
GEMINI_API_KEY=your-google-gemini-api-key
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# AI Workflow Generation (Stage 15 - Optional)
AI_PROVIDER=openai                      # or 'anthropic'
AI_API_KEY=your-openai-or-anthropic-api-key
AI_MODEL_WORKFLOW=gpt-4-turbo-preview   # or claude-3-5-sonnet-20241022
```

**Important:** Generate `VL_MASTER_KEY` using:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Testing Infrastructure

### Test Frameworks
- **Unit Tests:** Vitest 4.0.4
- **Integration Tests:** Vitest with supertest
- **E2E Tests:** Playwright 1.56.1

### Test Structure
```
tests/
├── unit/                    # Unit tests (services, utilities)
├── integration/             # API integration tests
└── e2e/                     # Playwright E2E tests
```

### Commands
```bash
npm test                     # Run all tests with coverage
npm run test:unit            # Unit tests only
npm run test:integration     # Integration tests only
npm run test:e2e             # E2E tests with Playwright
npm run test:watch           # Watch mode
npm run test:ui              # Interactive UI
npm run test:coverage        # Coverage report
```

**Status:** Test templates created, configuration in progress

---

## Deployment

### Production Stack
- **Hosting:** Railway
- **Database:** Neon PostgreSQL (serverless)
- **CI/CD:** GitHub Actions
- **Monitoring:** Pino structured logging

### Build & Deploy
```bash
# Build for production
npm run build

# Start production server
npm start

# Apply database migrations
npm run db:push
npm run db:migrate
```

### Railway Configuration
Set environment variables in Railway dashboard:
- `NODE_ENV=production`
- `DATABASE_URL=<neon-postgres-url>`
- `GOOGLE_CLIENT_ID=<server-oauth-client-id>`
- `VITE_GOOGLE_CLIENT_ID=<client-web-oauth-client-id>`
- `SESSION_SECRET=<32-char-random-secret>`
- `ALLOWED_ORIGIN=your-app.up.railway.app`

---

## Roadmap & Next Steps

### Immediate Priorities (Q1 2025)
1. Complete testing infrastructure configuration
2. Enable and fix skipped test files
3. Achieve 80% test coverage
4. Security audit for transform blocks
5. Performance optimization

### Short Term (Q2 2025)
1. Team collaboration features (complete)
2. Webhook system implementation
3. First 3-5 integrations (Zapier, Make, Slack)
4. Advanced logic engine enhancements

### Medium Term (Q3-Q4 2025)
1. Workflow versioning
2. Document automation (DOCX/PDF generation)
3. Real-time collaboration
4. Integration marketplace
5. AI-powered workflow generation

---

## Troubleshooting & Common Issues

### Transform Blocks
**Issue:** "Failed to persist transform block output"
- **Check:** Does block have `virtualStepId`?
- **Fix:** Run migration script: `tsx scripts/migrateTransformBlockVirtualSteps.ts`

**Issue:** "Code did not call emit() to produce output"
- **Fix:** Ensure code calls `emit(value)` exactly once

### Authentication
**Issue:** Google OAuth not working
- **Check:** `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` are correct
- **Check:** Authorized JavaScript origins include your domain
- **Check:** Cookie settings and CORS configuration

### Database
**Issue:** Migration errors
- **Check:** Database connection URL is correct
- **Check:** Migrations are run in order
- **Fix:** Use `npm run db:push` for schema sync

**Issue:** "column does not exist" errors (error code 42703)
- **Symptoms:** Login fails, workflows don't load, delete button doesn't work
- **Cause:** Database schema is out of sync with code (missing columns)
- **Fix:** Run schema fix script: `npx tsx scripts/fixAllMissingColumns.ts`
- **Details:** This adds missing columns to `users`, `projects`, and `workflows` tables, creates default tenant, and sets up proper indices
- **When to use:** After pulling latest code or when encountering "column does not exist" errors

---

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make changes following TypeScript and Prettier conventions
4. Run `npm run check && npm run test` before submitting
5. Submit a pull request with clear commit messages

### Code Standards
- Use 3-tier architecture (Routes → Services → Repositories)
- Write tests for new features
- Follow existing code patterns and naming conventions
- Update documentation as needed
- Use centralized error handling middleware

---

## Resources

### Documentation
- [Documentation Index](./docs/INDEX.md)
- [API Reference](./docs/api/API.md)
- [Developer Reference](./docs/reference/DEVELOPER_REFERENCE.md)
- [Testing Framework](./docs/testing/TESTING.md)
- [Transform Blocks Guide](./docs/api/TRANSFORM_BLOCKS.md)
- [Authentication Guide](./docs/guides/AUTHENTICATION.md)
- [Step Aliases Guide](./docs/guides/STEP_ALIASES.md)

### External Links
- [GitHub Repository](https://github.com/ShawnC-LaunchCode/VaultLogic)
- [Railway Hosting](https://railway.app/)
- [Neon Database](https://neon.tech/)
- [Drizzle ORM](https://orm.drizzle.team/)

---

**Document Maintainer:** Development Team
**Review Cycle:** Monthly
**Next Review:** December 14, 2025

**For questions or issues:** See troubleshooting section or create a GitHub issue

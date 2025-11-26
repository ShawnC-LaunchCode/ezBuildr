# VaultLogic - Architecture & Current State

**Last Updated:** November 26, 2025
**Version:** 1.6.0 - DataVault v4 + Visibility Logic Builder
**Status:** Production Ready (Backend), Frontend Active Development

---

## Executive Summary

VaultLogic is a **comprehensive workflow automation platform** that combines visual workflow building, conditional logic, custom code execution (JavaScript/Python), and run-time data collection. Originally inspired by Poll-Vault (a survey platform), VaultLogic has evolved into a next-generation workflow engine with advanced features for automation, data transformation, and team collaboration.

**Key Differentiators:**
- Visual workflow builder with drag-and-drop interface
- **DataVault: Complete data management platform with databases, tables, and permissions** 🆕
- **Two-tier visibility logic: workflow rules + step-level expressions** 🆕
- Sandboxed JavaScript/Python execution for data transformation
- **AI-powered workflow generation from natural language**
- **AI-driven workflow suggestions and improvements**
- **Intelligent template variable binding with AI**
- **HTTP/API integration with comprehensive authentication**
- **Encrypted secrets management for API credentials**
- **OAuth2 Client Credentials flow with intelligent caching**
- **Human-in-the-loop workflows with review and e-signature nodes**
- **Document review portals with approval/rejection workflow**
- **Native e-signature support with token-based signing**
- **Default values for steps with URL parameter support** 🆕
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

### System Architecture: Workflow-First Platform

**As of November 2025**, VaultLogic is a **dedicated workflow automation platform**:

**Workflows (VaultLogic Core)** - Primary and only active system
- Tables: `workflows`, `sections`, `steps`, `workflowRuns`, `stepValues`
- Status: Production ready, active development
- Full feature set for workflow automation, data collection, and integrations

**Legacy Survey System** (Removed Nov 16, 2025)
- Frontend completely removed (67 files, ~11,763 LOC)
- Backend routes disabled
- Database tables retained for historical data
- Not accessible via UI or API
- See `SURVEY_REMOVAL_SUMMARY.md` for details

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

#### DataVault Tables 🆕

**`databases`** - Database definitions
- `id` (uuid), `projectId`, `name`, `description`
- `createdBy`, `createdAt`, `updatedAt`, `archived`

**`tables`** - Table schemas and column definitions
- `id` (uuid), `databaseId`, `name`, `description`
- `columns` (jsonb) - column definitions with types and config
- `createdBy`, `createdAt`, `updatedAt`
- **Column types:** text, number, date, boolean, select, multiselect, autonumber

**`table_rows`** - Actual data storage
- `id` (uuid), `tableId`, `data` (jsonb)
- `createdBy`, `createdAt`, `updatedAt`
- Uses JSONB for flexible schema-less data storage

**`table_permissions`** - Access control for tables
- `id` (uuid), `tableId`, `userId`, `teamId`
- `canView`, `canCreate`, `canUpdate`, `canDelete`

**`api_tokens`** - External API access tokens
- `id` (uuid), `projectId`, `name`, `token`
- `expiresAt`, `createdBy`, `createdAt`
- `lastUsedAt`, `revokedAt`

**`row_notes`** - Comments and notes on table rows
- `id` (uuid), `tableId`, `rowId`, `userId`
- `note` (text), `createdAt`, `updatedAt`

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

#### Legacy Survey Tables (Deprecated)

**`surveys`**, **`surveyPages`**, **`questions`**, **`responses`**, **`answers`** - Original survey system (deprecated, UI removed Nov 2025, data retained for historical purposes only)

---

## Key Features & Implementation Status

### ✅ Complete Features

#### 1. Workflow Builder
- **5-Tab Navigation System** (Nov 2025) - Sections, Settings, Templates, Data Sources, Snapshots
- **Visual canvas editor** with drag-and-drop sections and steps
- **Sidebar tree view** with collapsible sections
- **Inspector panel** with step settings, logic, and blocks
- **Easy/Advanced mode toggle** for creator experience levels
- **Template Test Runner** - Test document generation with sample data
- **Mobile-responsive layout** with adaptive navigation
- **Real-time preview** with hot-reload
- **Step reordering** within and across sections
- **Workflow duplication** with optional data
- **Status management** (draft/active/archived) with auto-revert on modifications

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

#### 11. DataVault - Data Management Platform 🆕
**Status:** ✅ Complete (v4, Nov 2025)
- **Database management** - Create and manage multiple databases per project
- **Table schema editor** - Dynamic column creation with multiple types
- **Column types:** text, number, date, boolean, select, multiselect, autonumber
- **Infinite scroll** with virtual rendering for large datasets
- **Advanced filtering** - equals, contains, greater_than, less_than, between, etc.
- **Multi-column sorting** - Sort by multiple columns simultaneously
- **Optimistic updates** - Instant UI feedback with automatic rollback on error
- **API tokens** - External access with token-based authentication
- **Row notes/comments** - Collaboration features for data discussions
- **Table permissions** - Role-based access control (view, create, update, delete)
- **Autonumber columns** - Auto-incrementing IDs with custom prefixes
- **Bulk operations** - Import/export and batch updates
- **Activity logging** - Full audit trail of data changes

#### 12. Visibility Logic Builder 🆕
**Status:** ✅ Complete (Nov 2025)
- **Step-level visibility expressions** - `visibleIf` property on each step
- **Two-tier system** - Workflow rules + step-level expressions
- **Real-time evaluation** - Updates as users answer questions
- **useWorkflowVisibility hook** - React hook for visibility management
- **Alias resolution** - Works seamlessly with step aliases
- **All operators supported** - equals, contains, greater_than, less_than, etc.
- **Section-level visibility** - Apply expressions to entire sections

#### 13. Default Values & URL Parameters 🆕
**Status:** ✅ Complete (Migration 0044, Nov 2025)
- **Default value storage** - JSONB column on steps table
- **Preview mode defaults** - Auto-fill forms in preview
- **URL parameter override** - Deep linking with pre-filled values
- **In-app documentation** - URL parameters guide for end-users
- **Testing support** - Pre-fill workflows with sample data

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
- `IntakeQuestionVisibilityService` - Visibility logic evaluation 🆕
- `IntakeNavigationService` - Navigation with visibility 🆕
- `RepeaterService` - Repeating section management 🆕

**DataVault Services:** 🆕
- `DatabaseService` - Database CRUD and management
- `TableService` - Table schema and column management
- `TableRowService` - Row data CRUD operations
- `TablePermissionService` - Access control management
- `ApiTokenService` - External API token management
- `RowNoteService` - Comments and notes on rows

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

### DataVault 🆕

```
# Databases
GET    /api/projects/:id/databases                   # List databases
POST   /api/projects/:id/databases                   # Create database
GET    /api/databases/:id                            # Get database
PUT    /api/databases/:id                            # Update database
DELETE /api/databases/:id                            # Delete database
POST   /api/databases/:id/archive                    # Archive database

# Tables
GET    /api/databases/:id/tables                     # List tables
POST   /api/databases/:id/tables                     # Create table
GET    /api/tables/:id                               # Get table
PUT    /api/tables/:id                               # Update table
DELETE /api/tables/:id                               # Delete table
PUT    /api/tables/:id/columns                       # Update column schema

# Table Rows (Data)
GET    /api/tables/:id/rows                          # List rows (with filtering)
POST   /api/tables/:id/rows                          # Create row
GET    /api/tables/:id/rows/:rowId                   # Get row
PUT    /api/tables/:id/rows/:rowId                   # Update row
DELETE /api/tables/:id/rows/:rowId                   # Delete row
POST   /api/tables/:id/rows/bulk                     # Bulk operations

# API Tokens
GET    /api/projects/:id/api-tokens                  # List API tokens
POST   /api/projects/:id/api-tokens                  # Create API token
POST   /api/projects/:id/api-tokens/:tid/revoke      # Revoke token

# Row Notes/Comments
GET    /api/tables/:id/rows/:rowId/notes             # List notes
POST   /api/tables/:id/rows/:rowId/notes             # Create note
DELETE /api/notes/:id                                # Delete note
```

---

## Recent Major Changes (Nov 2025)

### DataVault v4 - Data Management Platform (Nov 18-26, 2025) 🆕
**Major Feature:** Complete database and table management system for VaultLogic

**Overview:**
DataVault provides a comprehensive data management platform integrated with VaultLogic workflows. Create databases, design table schemas, manage data with advanced filtering and sorting, and expose data via API tokens.

**Key Features:**
- **Database Management** - Multiple databases per project with full CRUD
- **Dynamic Table Schemas** - 7 column types: text, number, date, boolean, select, multiselect, autonumber
- **Advanced Data Operations** - Infinite scroll, filtering, sorting, bulk operations
- **API Tokens** - External access with token-based authentication
- **Collaboration** - Row notes/comments for team discussions
- **Permissions** - Role-based access control at table level
- **Autonumber** - Auto-incrementing IDs with custom prefixes (e.g., "INV-0001")

**Status:** ✅ Production Ready (v4 PR 13)

**Git Commits:** 13+ commits including:
- `cf72a7b` - feat(datavault): add final polish and regression tests
- `01d3208` - feat(datavault): add autonumber enhancements and table permissions
- `7312a54` - feat(datavault): add API tokens UI
- `340ccf1` - feat: Complete DataVault v3 frontend implementation

**Documentation:** See `CHANGELOG_1.6.0.md` for complete details

---

### Visibility Logic Builder (Nov 25, 2025) 🆕
**Major Feature:** Two-tier visibility system with workflow rules + step-level expressions

**What's New:**
- **Step-level `visibleIf` expressions** - Direct visibility control on each step
- **Section-level `visibleIf` expressions** - Control entire section visibility
- **React Hook** - `useWorkflowVisibility()` for real-time visibility management
- **Two-tier evaluation** - Workflow rules AND step expressions (both must be true)
- **Alias resolution** - Works seamlessly with step aliases

**Schema Changes:**
- Added `visible_if JSONB` column to `steps` table
- Added `visible_if JSONB` column to `sections` table

**Example:**
```json
{
  "operator": "greater_than",
  "variableName": "age",
  "value": 18
}
```

**Files Created:**
- `client/src/hooks/useWorkflowVisibility.ts` - Main hook (177 lines)
- `shared/conditionEvaluator.ts` - Expression evaluator

**Status:** ✅ Complete (commit `e2dd158`)

---

### JWT Authentication Improvements (Nov 24, 2025) 🆕
**Enhancement:** New token endpoint and cleaner auth patterns

**Changes:**
- New JWT token endpoint for external integrations
- Migrated from `req.user.claims.sub` to `AuthRequest.userId`
- More consistent auth interface across all routes
- Better TypeScript typing for authenticated requests

**Git Commits:**
- `95858c9` - fix(auth): improve JWT authentication and add token endpoint
- `d93248b` - fix(auth): use AuthRequest.userId instead of req.user.claims.sub

**Status:** ✅ Complete

---

### Default Values & URL Parameters (Nov 25, 2025) 🆕
**Feature:** Steps can have default values, overridable via URL parameters

**Capabilities:**
- New `default_value` JSONB column on `steps` table
- Auto-fill preview mode with default values
- URL parameter override during run creation
- Example: `?firstName=John&age=30`
- In-app documentation page for end-users

**Migration:** `migrations/0044_add_step_default_values.sql`

**Use Cases:**
- Pre-fill forms with common values
- Testing workflows with sample data
- Email link personalization
- Deep linking with context

**Status:** ✅ Complete (Migration 0044)

---

### Fee Waiver Demo Workflow (Nov 26, 2025) 🎓
**Resource:** Comprehensive reference workflow showcasing all VaultLogic features

**Overview:**
A production-grade court fee waiver application workflow demonstrating best practices.

**Statistics:**
- **6 sections** - Multi-page workflow
- **41 steps** - All with human-friendly aliases
- **7 transform blocks** - JavaScript calculations
- **5 logic rules** - Conditional requirements and visibility
- **9 step types** - All question types demonstrated

**Features Demonstrated:**
- Federal Poverty Level calculations (2024 guidelines)
- Income vs. expense analysis
- Conditional section skipping
- File upload validation
- Transform blocks with real-world logic
- Virtual steps for computed values

**Documentation:** `FEE_WAIVER_DEMO_README.md` (360 lines)

**Workflow ID:** `81a73b18-012d-458b-af05-5098eb75c753`

**Status:** ✅ Complete and documented

---

### Project Data Integrity Fix (Nov 25, 2025) 🐛
**Bug Fix:** Sync `createdBy` from `creatorId` for backward compatibility

**Problem:** Projects created before Stage 24 had `created_by=null`, causing access errors

**Solution:** Migration 0045 automatically syncs old data
```sql
UPDATE projects
SET created_by = creator_id
WHERE created_by IS NULL AND creator_id IS NOT NULL;
```

**Status:** ✅ Fixed (Migration 0045)

---

### Legacy Survey System Removal (Nov 16, 2025) 🎯
**Major Milestone:** Complete removal of legacy survey system, making VaultLogic a dedicated workflow automation platform

**Frontend Cleanup:**
- Removed 67 files (~11,763 lines of code)
- Deleted 11 survey pages (SurveyBuilder, SurveyPlayer, SurveyAnalytics, etc.)
- Removed 48 feature components (survey-builder, survey-player, survey-analytics)
- Deleted 3 custom hooks (useSurveyBuilder, useSurveyPlayer, useSurveyAnalytics)
- Removed 14 survey routes from App.tsx
- Cleaned up survey query keys and API clients

**Backend Changes:**
- Disabled 7 survey route registrations (~40 endpoints)
- Survey services and repositories retained for data access only
- Backend routes return 404 (intentional)
- Database tables preserved for historical data

**Impact:**
- 88% reduction in survey-specific code
- Zero risk to workflow functionality (completely isolated systems)
- Dashboard rebranded for workflow automation
- System now 100% workflow-focused

**Documentation:**
- Created `SURVEY_REMOVAL_SUMMARY.md` (detailed analysis)
- Created `docs/SHARED_INFRASTRUCTURE_ANALYSIS.md` (technical deep-dive)
- Created `docs/SHARED_QUICK_REFERENCE.md` (visual guide)
- Created `docs/FILE_PATH_REFERENCE.md` (developer reference)

**Next Steps:**
- Implement workflow-specific dashboard statistics
- Update admin routes to use workflow data
- Optional: Database cleanup after data export

---

### Workflow Builder Navigation Overhaul (Nov 14-17, 2025) 🎨
**Major Feature:** Complete redesign of workflow builder interface with tabbed navigation

**5-Tab Navigation System:**
- **Sections Tab** - Visual canvas with drag-and-drop workflow building
- **Settings Tab** - Workflow configuration, branding, welcome/thank you screens
- **Templates Tab** - Document template management and testing
- **Data Sources Tab** - Collections and external data integration (placeholder)
- **Snapshots Tab** - Version history and workflow backups (placeholder)

**Template Test Runner:**
- Test document generation with sample data
- Real-time preview of generated documents
- Sample data editor for testing variable bindings
- Status indicators for test results

**UI Improvements:**
- Mobile-responsive navigation with adaptive layout
- Enhanced workflow status management (draft/active/archived)
- Auto-revert to draft on workflow modifications
- Copy workflow link buttons throughout UI
- Improved Easy Mode (hides advanced features)

**Bug Fixes:**
- Fixed workflow status enum (draft/open/closed → draft/active/archived)
- Fixed workflow runner infinite loading issue
- Fixed public link routing with proper UUID resolution
- Fixed mobile navigation responsiveness

**Migration:** `migrations/0027_fix_workflow_status_enum.sql`

---

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

### Medium Term (Q3-Q4 2025 / Q1 2026)
1. **DataVault-Workflow Integration** - Use DataVault as data source in workflows
2. Workflow versioning and rollback
3. Real-time collaboration with presence
4. Integration marketplace
5. Advanced template system enhancements

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
- **Symptoms:** Login fails, workflows don't load, workflows can't be created, delete button doesn't work
- **Cause:** Database schema is out of sync with code (missing columns: `tenant_id`, `project_id`, `name`, etc.)
- **Fix (Recommended):** Apply migration 0024: `npx tsx scripts/applyMigration0024.ts`
- **Fix (Alternative):** Run schema fix script: `npx tsx scripts/fixAllMissingColumns.ts`
- **Documentation:** See `MIGRATION_0024_README.md` for detailed instructions and troubleshooting
- **Details:** This adds missing columns to `users`, `projects`, and `workflows` tables, creates default tenant/project, and sets up proper foreign keys and indices
- **When to use:** After pulling latest code, when encountering "column does not exist" errors, or when workflows fail to display/create

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
- [Changelog v1.6.0](./CHANGELOG_1.6.0.md) - Complete release notes 🆕
- [Fee Waiver Demo](./FEE_WAIVER_DEMO_README.md) - Reference workflow guide 🆕

### External Links
- [GitHub Repository](https://github.com/ShawnC-LaunchCode/VaultLogic)
- [Railway Hosting](https://railway.app/)
- [Neon Database](https://neon.tech/)
- [Drizzle ORM](https://orm.drizzle.team/)

---

**Document Maintainer:** Development Team
**Review Cycle:** Monthly
**Next Review:** December 26, 2025
**Version History:**
- v1.6.0 (Nov 26, 2025) - DataVault v4 + Visibility Logic Builder
- v1.5.0 (Nov 17, 2025) - Survey Removal + Navigation Overhaul

**For questions or issues:** See troubleshooting section or create a GitHub issue
- look at all tasks as a senior developer on a project with enough atonomy to make breaking changes for the long term health of the project.
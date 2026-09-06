# ezBuildr 🧠

[![CI](https://github.com/ShawnC-LaunchCode/ezBuildr/workflows/CI/badge.svg)](https://github.com/ShawnC-LaunchCode/ezBuildr/actions/workflows/ci.yml)

**Enterprise Workflow Automation Platform**

ezBuildr is a comprehensive enterprise workflow automation platform built with modern web technologies. Create, distribute, and analyze workflows with advanced features like conditional logic, custom scripting, data management, AI-powered generation, and detailed analytics.

**Platform Scale:**
- 30+ frontend pages with React 18.3 + TypeScript
- 66+ backend API route files
- 90+ service classes
- 80+ PostgreSQL database tables
- 37 question/action types
- 40+ helper functions for scripting

Originally inspired by Legacy App, evolved into next-generation workflow automation with enterprise-grade features.

---

## 🚀 Quick Start

**Prerequisites:** Node.js 20.19.0+, PostgreSQL (Neon recommended), and [`qpdf`](https://qpdf.sourceforge.io/) on `PATH` (used to unlock encrypted PDF form templates before filling — `apt-get install qpdf` / `brew install qpdf` / `choco install qpdf`)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/ShawnC-LaunchCode/ezBuildr.git
cd ezBuildr

# Install dependencies
npm install
```

### Step 2: Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Generate a master key for secrets encryption (REQUIRED)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Copy the output and paste it as VL_MASTER_KEY in your .env file

# Edit .env and configure:
# - DATABASE_URL (see Step 3 below)
# - GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID (see Step 4 below)
# - SESSION_SECRET (generate a random 32+ character string)
# - VL_MASTER_KEY (use the value from the command above)
```

### Step 3: Initialize Database

```bash
# Apply the SQL migration chain (do NOT use `npm run db:push` — after the RLS
# rollout it treats unmanaged policies as drift and proposes destructive
# policy removal; see the db-schema-change skill / docs/architecture/TENANT_ISOLATION_RLS.md)
npm run db:migrate
```

### Step 4: Start Development Server

```bash
npm run dev
```

**Access the app:** http://localhost:5000

---

## ⚙️ Environment Configuration

Create a `.env` file with the following variables:

```env
# Core Configuration
NODE_ENV=development
PORT=5000
BASE_URL=http://localhost:5000
VITE_BASE_URL=http://localhost:5000

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host.neon.tech/ezbuildr

# Google OAuth2 (required for authentication)
GOOGLE_CLIENT_ID=your-server-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-client-web-client-id.apps.googleusercontent.com

# Session Security
SESSION_SECRET=your-super-secret-32-character-minimum-session-key

# Secrets Management (REQUIRED for API integrations)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
VL_MASTER_KEY=your-base64-encoded-32-byte-master-key

# CORS (hostnames only, no protocols)
ALLOWED_ORIGIN=localhost,127.0.0.1

# Optional Services
SENDGRID_API_KEY=your-sendgrid-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
GEMINI_API_KEY=your-google-gemini-api-key-here
AI_PROVIDER=openai
AI_API_KEY=your-openai-or-anthropic-api-key
AI_MODEL_WORKFLOW=gpt-4-turbo-preview
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

---

### Database Setup (Detailed Instructions)

**Option A: Neon (Recommended - Free & Easy)**

1. Go to [Neon](https://neon.tech/) and sign up
2. Create a new project
3. Copy the connection string (looks like `postgresql://user:pass@ep-xyz.region.aws.neon.tech/dbname`)
4. Paste into `DATABASE_URL` in your `.env` file

**Option B: Local PostgreSQL Installation**

```bash
# Create a database named 'ezbuildr'
# Using psql command line:
psql -U postgres
CREATE DATABASE ezbuildr;
\q

# Update DATABASE_URL in .env:
# DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/ezbuildr
```

---

### Google OAuth2 Setup (REQUIRED for login)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services > Credentials**
4. Click **"Create Credentials"** > **"OAuth 2.0 Client IDs"**
5. Choose **"Web application"**
6. Configure **Authorized JavaScript origins**:
   - Add: `http://localhost:5000`
7. Leave "Authorized redirect URIs" empty
8. Click **Create** and copy the **Client ID**
9. Paste the Client ID into **both** `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in your `.env` file

---

## 🏛️ System Architecture

**ezBuildr is a dedicated workflow automation platform:**

### **Workflows (ezBuildr Core)** ⭐ Primary System
- Modern workflow automation engine
- Database tables: `workflows`, `pages`, `steps`, `workflowRuns`, `stepValues`
- API paths: `/api/workflows/*`, `/api/runs/*`
- **Status:** Production ready, active development

**ezBuildr is 100% workflow-focused.** The legacy survey system (removed Nov 2025)
is gone entirely — no `/api/surveys/*` routes, no survey tables in the schema.

---

## 🧱 Tech Stack

**Full-Stack Workflow Automation Platform**

- **Frontend:** React 18.3.1 (Vite, Tailwind CSS, TanStack Query, Radix UI)
- **Backend:** Node.js 20+ (Express + Drizzle ORM)
- **Database:** Neon PostgreSQL (serverless compatible)
- **Auth:** Google OAuth2
- **Storage:** Multer (local/S3 compatible)
- **AI:** Google Gemini, OpenAI, Anthropic (optional)

### Core Concept Flow

```mermaid
graph TD
A[Creator Builds Workflow] --> B[Pages]
B --> C[Steps]
C --> D[Conditional Logic Engine]
D --> E[Workflow Run Execution]
E --> F[Data Export JSON/CSV]
```

**3-Tier Service Architecture:**

```
Routes → Services → Repositories → Database
```

- **Routes:** Handle HTTP requests and responses
- **Services:** Business logic and orchestration (213 service classes)
- **Repositories:** Data access abstraction, `BaseRepository` pattern (48 classes)
- **Database:** Drizzle ORM with strongly-typed PostgreSQL schema

---

## ⚙️ Key Features

### Core Workflow Features
- 🔀 **Workflow Builder** — Page/step builder with 7-tab navigation and inspector panel
- 📋 **37 Question Types** — Text, email, phone, number, currency, address, boolean, choice, scale, date, time, signature, file upload, display, multi-field, computed, plus easy/advanced-mode variants
- 📄 **Pages & Steps** — Multi-page workflows with dynamic navigation and progress tracking
- ⚡ **Two-Tier Visibility Logic** — Workflow rules + step-level `visibleIf` expressions with real-time evaluation 🆕
- 🏷️ **Step Aliases** — Human-friendly variable names (e.g., `firstName`, `totalCost`)
- 📝 **Default Values** — Pre-fill with defaults, overridable via URL parameters 🆕

### Data Management (DataVault)
- 🗄️ **DataVault Platform** — Complete data management: databases, tables, rows, permissions, API tokens 🆕
- 📊 **7 Column Types** — Text, number, date, boolean, select, multiselect, autonumber
- ♾️ **Infinite Scroll** — High-performance data grids with advanced filtering
- 🔒 **Row-Level Permissions** — Granular access control for tables
- 💬 **Row Notes** — Collaborative comments on data rows
- 🔌 **External API Access** — Generate API tokens for external integrations

### Custom Scripting & Automation
- 🎯 **Custom Scripting System** — Lifecycle hooks (4 phases) + document hooks (2 phases) 🆕
- 🛠️ **40+ Helper Functions** — Date, string, number, array, object, math, HTTP, console utilities 🆕
- 🔧 **Transform Blocks** — Sandboxed JS/Python execution with virtual steps, test playground
- 📟 **Script Console** — View execution logs with console output and performance metrics 🆕
- 🔁 **Mutation Mode** — Transform workflow data between execution phases 🆕

### Logic & Conditional Flow
- 🎛️ **Conditional Logic** — Show/hide/require/skip pages with 8+ operators
- 🌳 **Branching Analysis** — Track conditional paths and user flows
- 👁️ **Visual Logic Editor** — Build complex logic with drag-and-drop interface

### Integrations & Connections
- 🌐 **HTTP/API Integration** — Full REST client with OAuth2 (Client Credentials + 3-legged)
- 🔐 **Secrets Management** — AES-256-GCM encrypted storage with LRU cache
- 🔗 **Webhooks** — Send data to external URLs on workflow events
- 🔌 **4 Connection Types** — API key, bearer token, OAuth2 client credentials, OAuth2 3-leg

### Document Generation & E-Signature
- 📄 **Document Generation** — PDF/DOCX with template variables, repeating sections
- ✍️ **E-Signature** — DocuSign, HelloSign, native signatures with signing portals
- 🤖 **AI Template Binding** — Automatic variable-to-field mapping with AI
- ✅ **Review Gates** — Human-in-the-loop approval workflows

### AI-Powered Features
- 🤖 **AI Workflow Generation** — Generate workflows from natural language (OpenAI, Anthropic, Gemini)
- 💡 **AI Suggestions** — Workflow optimization and improvement recommendations
- 🧠 **AI Transform Blocks** — Auto-generate JavaScript/Python code
- 🎯 **Smart Variable Binding** — Semantic matching for template variables

### Templates & Marketplace
- 📦 **Reusable Templates** — Create and share workflow templates
- 🏪 **Template Marketplace** — Browse community templates
- 🧪 **Template Test Runner** — Test templates with sample data
- 📤 **Import/Export** — Share templates across projects

### Analytics & Reporting
- 📊 **Advanced Analytics** — Funnel analysis, dropoff tracking, completion rates
- 🔥 **Heatmaps** — Field-level engagement visualization
- 📈 **Trend Analysis** — Response patterns over time
- 📤 **Export** — JSON and CSV run-data export

### Authentication & Access Control
- 🔑 **Multi-Auth System** — Google OAuth2, JWT tokens, session auth, magic links
- 🎫 **Run Token Auth** — Bearer token for anonymous and authenticated runs
- 🚪 **Portal System** — Magic link authentication for external users 🆕
- 👥 **Multi-Tenant** — Workspaces, organizations, tenants with resource permissions

### Team Collaboration
- 👥 **Teams** — Team management with roles and invitations
- 🔒 **RBAC** — Project and workflow access control
- 👁️ **Real-time Presence** — See who's editing with live cursors
- 💬 **Comments** — Inline comments on workflow steps
- 📝 **Activity Logs** — Comprehensive audit trail

### Versioning & History
- 📚 **Version Control** — Publish workflow versions with history
- 🔄 **Diff Viewer** — Compare versions side-by-side
- ⏪ **Restore** — Rollback to previous versions
- 📸 **Snapshots** — Save/restore test data for workflows

### Enterprise Features
- 💳 **Billing Integration** — Stripe subscriptions, plans, usage metering, seat management
- 🎨 **Branding** — Custom colors, logos, domains, white-label intake forms
- 📧 **Email Templates** — Custom email designs with branding
- 👔 **Admin Dashboard** — User management, system stats, audit logs
- 📊 **Usage Tracking** — Monitor runs, workflows, and resource consumption

### Developer Experience
- 🧱 **Drizzle ORM** — Strongly typed PostgreSQL models (80+ tables)
- 🧑‍💻 **TypeScript** — End-to-end type safety
- 🧪 **Comprehensive Testing** — Unit, integration, E2E with Vitest + Playwright
- 🔧 **3-Tier Architecture** — Routes → Services → Repositories
- 📚 **90+ Services** — Modular business logic layer
- 🛠️ **66+ API Routes** — RESTful API with Zod validation

---

## 🧪 API Endpoints

The endpoint list previously duplicated here had drifted from the actual routes
(wrong methods, wrong paths, some invented). Rather than maintain a second,
easily-stale copy, the authoritative, domain-by-domain endpoint reference is
**[docs/claude/API_ENDPOINTS.md](./docs/claude/API_ENDPOINTS.md)** — it names
the route file backing every path and is verified against `server/routes/`
directly. A few high-traffic examples to get oriented:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/workflows` | Create workflow |
| `GET` | `/api/workflows/:workflowId` | Fetch workflow |
| `GET/POST` | `/api/workflows/:workflowId/pages` | List / create pages |
| `POST` | `/api/workflows/:workflowId/runs` | Create a run (returns `runToken`) |
| `GET` | `/api/runs/:runId/runtime` | Sanitized pinned pages/steps + cursor + values |
| `POST` | `/api/ai/workflows/generate` | Generate a workflow from a description |

For the full, current list — including Sections, DataVault, AI, e-signature,
and every other domain — see `docs/claude/API_ENDPOINTS.md`.

---

## 🧩 Developer Notes

### Technology Stack Details

**Frontend Dependencies:**
- React 18.3.1 with React Hook Form & Zod validation
- TanStack Query 5.60.5 for data fetching/caching
- Radix UI + Tailwind CSS for component library
- Wouter 3.3.5 for routing
- Framer Motion 11.13.1 for animations
- Recharts 2.15.2 for data visualization

**Backend Dependencies:**
- Express 4.21.2 with Passport.js authentication
- Drizzle ORM 0.39.1 for type-safe database access
- Pino 10.0.0 for structured logging
- Multer 2.0.2 for file uploads
- SendGrid 8.1.6 for email services
- Google Generative AI 0.24.1 (Gemini)

### Database Schema

The database uses **Drizzle ORM** with **108 PostgreSQL tables**, one domain file
per area under `shared/schema/` (workflow/pages/steps, auth & tenancy, runs &
metrics, DataVault, integrations, billing, and more). Full inventory, exact
table names, and key enums: **[docs/claude/SCHEMA.md](./docs/claude/SCHEMA.md)**
— that file, not this section, is the source of truth for table names.

**Supported Question/Action Types (37, see `stepTypeEnum` in `shared/schema/workflow.ts`):**
- **Text Input:** `short_text`, `long_text`, `email`, `phone`, `website`
- **Numeric:** `number`, `currency`, `scale`
- **Date/Time:** `date`, `date_time`, `time`
- **Selection:** `multiple_choice`, `radio`, `yes_no`, `true_false`, `choice`
- **Advanced:** `address`, `signature_block`, `file_upload`, `display`, `multi_field`, `computed`, plus `*_advanced` variants and the structural `list` type

There is no `checkbox` or plain `signature` type, and no `repeater`/`loop_group`
(retired in LIST-13) — see CLAUDE.md's Step Types section.

### Key Implementation Details

- **Schema Management:** Run `npm run db:migrate` to apply migrations (see Step 3 above — not `db:push`)
- **File Uploads:** Handled via Multer; storage driver is disk or S3 (`STORAGE_DRIVER`), served via `storage.routes.ts`
- **Logic Engine:** Located in `shared/conditionEvaluator.ts` and `shared/workflowLogic.ts`
- **Service Layer:** 213 service classes in `server/services/`
- **Repository Layer:** `BaseRepository` pattern, 48 classes in `server/repositories/`
- **Transform Blocks:** Sandboxed JS/Python execution with vm2 and subprocess
- **Virtual Steps:** Transform block outputs stored via virtual steps with proper UUIDs
- **Step Aliases:** Human-friendly variable names for referencing steps in logic and blocks
- **Run Tokens:** UUID-based authentication for workflow runs (creator + anonymous modes)

---

## 🛠️ Available Commands

```bash
# Development
npm run dev              # Start development server
npm run dev:test         # Start test environment server

# Building & Production
npm run build            # Build for production
npm start                # Start production server
npm run check            # TypeScript type checking

# Database
npm run db:migrate       # Apply the SQL migration chain (preferred — see Step 3 above)
npm run db:push          # Push schema changes directly; avoid post-RLS, see db-schema-change skill

# Testing
# `npm test` alone gives misleading results here — the suite is split into 3
# Vitest projects with separate DB setup. See the `run-tests` project skill
# (.claude/skills/run-tests/) before running or writing any test; it documents
# test:fast / test:unit / test:integration / test:e2e and the Docker Postgres
# setup those last two need (`npm run test:docker:up`).
npm test                     # Full suite, parallel + coverage — what CI runs
npm run test:fast            # unit-fast, no DB, ~13s — default sanity check
npm run test:e2e             # End-to-end tests with Playwright

# Utilities
npm run set-admin        # Set a user as admin
npm run db:seed          # Generate test data
npm run test-gemini      # Test Gemini API connection
```

---

## 🛣️ Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| ✅ Stage 1-8 | Workflow Builder + Conditional Logic | Complete |
| ✅ Stage 8 | Transform Blocks (JavaScript/Python) | Complete (Nov 2025) |
| ✅ Stage 8 | Step Aliases (Variables) | Complete (Nov 2025) |
| ✅ Stage 8 | Run Token Authentication | Complete (Nov 2025) |
| ✅ Stage 9 | HTTP/API Node + Secrets Management | Complete (Nov 2025) |
| ✅ Stage 14 | Review & E-Signature Nodes | Complete (Nov 2025) |
| ✅ Stage 15 | AI Workflow Generation | Complete (Nov 2025) |
| ✅ Stage 16 | Integrations Hub (OAuth2 3-leg) | Complete (Nov 2025) |
| ✅ Stage 17 | Branding System | Complete (Nov 2025) |
| ✅ Stage 20-21 | Document Engine 2.0 + Repeaters | Complete (Nov 2025) |
| ✅ Nov 2025 | Survey System Removal | Complete (Nov 16, 2025) |
| ✅ Nov 2025 | Builder Navigation Overhaul | Complete (Nov 17, 2025) |
| ✅ Nov 2025 | **DataVault v4** - Complete Data Platform | **Complete (Nov 26, 2025)** 🆕 |
| ✅ Nov 2025 | **Visibility Logic Builder** - Two-tier System | **Complete (Nov 25, 2025)** 🆕 |
| ✅ Nov 2025 | **Default Values & URL Parameters** | **Complete (Nov 25, 2025)** 🆕 |
| ✅ Nov 2025 | **JWT Authentication Enhancements** | **Complete (Nov 24, 2025)** 🆕 |
| ✅ Dec 2025 | **Custom Scripting System (Prompt 12)** | **Complete (Dec 7, 2025)** 🆕 |
| ✅ Dec 2025 | **Portal System & Magic Links** | **Complete** 🆕 |
| ✅ Dec 2025 | **Billing Integration (Stripe)** | **Complete** 🆕 |
| ✅ Dec 2025 | **Real-time Collaboration** | **Complete (Presence, Cursors, Comments)** 🆕 |
| ✅ Dec 2025 | **Versioning & Snapshots** | **Complete** 🆕 |
| ✅ Dec 2025 | **Multi-Tenant Workspaces** | **Complete** 🆕 |
| 🔜 | Enhanced Versioning (Branching) | Backlog — no committed date |
| 🔜 | Integration Marketplace | Backlog — no committed date |
| 🔜 | Advanced Personalization | Backlog — no committed date |
| 🔜 | Mobile Builder App | Backlog — no committed date |

The four "Backlog" rows above did not ship on their original target quarters;
see `docs/claude/FEATURES.md`'s Backlog section — do not treat old dates as
commitments.

---

## 🤝 Contributing

We welcome contributions! To get started:

1. Fork the repository and create a feature branch
2. Make your changes following TypeScript and Prettier conventions
3. Run `npm run lint && npm run test` before submitting
4. Submit a pull request with clear commit messages

**Development Best Practices:**
- Use the 3-tier architecture (Routes → Services → Repositories)
- Write tests for new features
- Follow existing code patterns and naming conventions
- Update documentation as needed

---

## 🚀 Deployment

### Railway (Recommended)

1. Connect your GitHub repository to [Railway](https://railway.app/)
2. Add environment variables in Railway dashboard:
   ```
   NODE_ENV=production
   BASE_URL=https://your-app.up.railway.app
   VITE_BASE_URL=https://your-app.up.railway.app
   DATABASE_URL=<neon-postgres-url>
   GOOGLE_CLIENT_ID=<server-oauth-client-id>
   VITE_GOOGLE_CLIENT_ID=<client-web-oauth-client-id>
   SESSION_SECRET=<32-char-random-secret>
   JWT_SECRET=<32-char-random-secret>
   VL_MASTER_KEY=<base64-encoded-32-byte-key>
   ALLOWED_ORIGIN=your-app.up.railway.app
   ```

   `JWT_SECRET` and `SESSION_SECRET` are validated at boot (`server/config/env.ts`,
   min 32 characters) and only get an insecure dev/test fallback when `NODE_ENV`
   is `development` or `test` — omitting either on a `production` deploy crashes
   the app on startup, not just at login.
3. Generate VL_MASTER_KEY locally:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Configure Google OAuth authorized origins to include your Railway domain
5. Deploy! Railway auto-detects build and start commands

**Compatible with:** Railway, Neon Database, Docker, standard Node.js hosting

---

## 📄 License

MIT © 2025 ezBuildr Contributors

Originally inspired by legacy systems, rebuilt for next-generation workflow automation.

---

## 📚 Documentation

ezBuildr has comprehensive documentation organized by topic:

- **[Architecture & Current State](./CLAUDE.md)** - Streamlined architecture overview for technical teams
- **[Changelog v1.6.0](./CHANGELOG_1.6.0.md)** - Complete release notes for latest version
- **[Documentation Index](./docs/INDEX.md)** - Complete documentation map
- **[API Reference](./docs/api/API.md)** - Complete Workflow API documentation
- **[Developer Reference](./docs/reference/DEVELOPER_REFERENCE.md)** - Comprehensive technical guide
- **[Transform Blocks](./docs/api/TRANSFORM_BLOCKS.md)** - JavaScript/Python code execution guide
- **[Step Aliases](./docs/guides/STEP_ALIASES.md)** - Variable system implementation guide
- **[Authentication](./docs/guides/AUTHENTICATION.md)** - Run token authentication system
- **[Testing Framework](./docs/testing/TESTING.md)** - Testing infrastructure and guidelines
- **[Frontend Guide](./docs/guides/FRONTEND.md)** - Frontend development guide
- **[Error Handling](./docs/architecture/ERROR_HANDLING.md)** - Centralized error handler
- **[Troubleshooting](./docs/troubleshooting/TROUBLESHOOTING.md)** - Common issues and solutions

For a complete list of available documentation, see the [Documentation Index](./docs/INDEX.md).

---

## 🔧 Troubleshooting

### Database Schema Issues

**Symptoms:**
- Login fails with authentication errors
- "Workflow not found" errors when opening workflows
- Delete button doesn't work
- "column does not exist" errors in server logs (PostgreSQL error 42703)

**Solution:**
```bash
# Apply any migrations you haven't picked up yet
npm run db:migrate

# Restart your dev server
npm run dev
```

If that doesn't clear the error, do not guess further — load the `db-schema-change`
project skill (`.claude/skills/db-schema-change/`) before touching migrations by hand.

**When to use:** After pulling latest code changes or when encountering schema-related errors.

### Other Common Issues

**Google OAuth not working:**
- Verify `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` are correctly set in `.env`
- Ensure authorized JavaScript origins include your domain in Google Cloud Console
- Check cookie settings and CORS configuration

**Transform blocks not persisting:**
- Ensure transform blocks have virtual steps assigned
- Check that code calls `emit(value)` exactly once

For more detailed troubleshooting, see [CLAUDE.md](./CLAUDE.md) troubleshooting section.

---

**Last Updated:** August 2026 — see `CLAUDE.md` for the current architecture reference and `CHANGELOG_1.6.0.md` for release notes.

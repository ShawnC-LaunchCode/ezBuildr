# VaultLogic 🧠

[![CI](https://github.com/ShawnC-LaunchCode/VaultLogic/workflows/CI/badge.svg)](https://github.com/ShawnC-LaunchCode/VaultLogic/actions/workflows/ci.yml)

**Workflow Builder and Automation Logic Engine**

VaultLogic is a comprehensive workflow builder and survey platform built with modern web technologies. Create, distribute, and analyze surveys and workflows with advanced features like conditional logic, multi-page workflows, and detailed analytics.

Originally inspired by Poll-Vault, rebuilt for next-generation workflow automation.

---

## 🚀 Quick Start

**Prerequisites:** Node.js 20.19.0+, PostgreSQL (Neon recommended)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/ShawnC-LaunchCode/VaultLogic.git
cd VaultLogic

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
# Push schema to database
npm run db:push

# Fix database schema (adds missing columns if needed)
npx tsx scripts/fixAllMissingColumns.ts
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
DATABASE_URL=postgresql://user:password@host.neon.tech/vault_logic

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
# Create a database named 'vault_logic'
# Using psql command line:
psql -U postgres
CREATE DATABASE vault_logic;
\q

# Update DATABASE_URL in .env:
# DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/vault_logic
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

VaultLogic maintains **two parallel systems**:

### 1. **Legacy: Surveys (Poll-Vault)**
- Traditional survey platform (original codebase)
- Database tables: `surveys`, `survey_pages`, `questions`, `responses`, `answers`
- API paths: `/api/surveys/*`
- **Status:** Complete, stable, in production use

### 2. **Modern: Workflows (VaultLogic Core)** ⭐ Primary Focus
- Next-generation workflow automation engine
- Database tables: `workflows`, `sections`, `steps`, `workflowRuns`, `stepValues`
- API paths: `/api/workflows/*`, `/api/runs/*`
- **Status:** Active development, primary focus for new features

**For new projects, use the Workflow system.** The legacy Survey system is maintained for backward compatibility.

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
A[Creator Builds Workflow] --> B[Sections Pages]
B --> C[Steps Questions]
C --> D[Conditional Logic Engine]
D --> E[Workflow Run Execution]
E --> F[Data Export JSON/CSV]
```

**3-Tier Service Architecture:**

```
Routes → Services → Repositories → Database
```

- **Routes:** Handle HTTP requests and responses
- **Services:** Business logic and orchestration (20+ service classes)
- **Repositories:** Data access abstraction (15+ repository classes)
- **Database:** Drizzle ORM with strongly-typed PostgreSQL schema

---

## ⚙️ Key Features

- 🔀 **Workflow Builder** — Visually create logic-driven workflows with drag-and-drop interface
- 📄 **Sections & Steps** — Structure user journeys as pages and questions
- ⚡ **Conditional Logic** — Show/hide fields and pages dynamically based on user input
- 🧮 **Workflow Runs** — Capture user data and track execution progress
- 🔧 **Transform Blocks** — Execute custom JavaScript/Python code for data transformation with sandboxed execution
- 🏷️ **Step Aliases** — Human-friendly variable names for steps (e.g., `firstName`, `age`)
- 🔑 **Token Authentication** — Bearer token support for anonymous and authenticated runs
- 🧰 **Data Export** — JSON/CSV outputs for reporting or integration
- 🧱 **Drizzle ORM Schema** — Strongly typed PostgreSQL models with migrations
- 🧑‍💻 **Developer Friendly** — TypeScript end-to-end, modular services, comprehensive tests
- 📊 **Advanced Analytics** — Completion rates, drop-off analysis, engagement metrics, time tracking
- 📧 **Email Distribution** — SendGrid integration for invitations and notifications
- 🤖 **AI-Powered** — Google Gemini integration for workflow generation and analysis
- 🔐 **Secure Auth** — Google OAuth2 with session management + run token authentication
- 📤 **File Uploads** — Support for file upload questions with Multer

---

## 🧪 API Endpoints

### Modern Workflow System (Use These!)

#### Workflow Management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/workflows` | Create workflow |
| `GET` | `/api/workflows` | List all workflows |
| `GET` | `/api/workflows/:id` | Fetch workflow with sections & steps |
| `PUT` | `/api/workflows/:id` | Update workflow |
| `DELETE` | `/api/workflows/:id` | Delete workflow |
| `PATCH` | `/api/workflows/:id/status` | Update workflow status |
| `GET` | `/api/workflows/:id/variables` | Get all step aliases (variables) |

#### Sections
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/workflows/:id/sections` | Create section |
| `PUT` | `/api/sections/:id` | Update section |
| `DELETE` | `/api/sections/:id` | Delete section |
| `PUT` | `/api/workflows/:id/sections/reorder` | Bulk reorder sections |

#### Steps
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/workflows/:wid/sections/:sid/steps` | Create step |
| `PUT` | `/api/steps/:id` | Update step (including alias) |
| `DELETE` | `/api/steps/:id` | Delete step |
| `PUT` | `/api/workflows/:id/steps/reorder` | Bulk reorder steps |

#### Transform Blocks (Code Execution)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows/:id/transform-blocks` | List transform blocks |
| `POST` | `/api/workflows/:id/transform-blocks` | Create transform block |
| `PUT` | `/api/transform-blocks/:id` | Update transform block |
| `DELETE` | `/api/transform-blocks/:id` | Delete transform block |
| `POST` | `/api/transform-blocks/:id/test` | Test with sample data |

#### Workflow Runs (Execution)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/workflows/:id/runs` | Create run (returns runToken) | Session or Public |
| `GET` | `/api/runs/:id` | Get run details | Session or Bearer Token |
| `GET` | `/api/runs/:id/values` | Get step values | Session or Bearer Token |
| `POST` | `/api/runs/:id/values` | Save single value | Bearer Token |
| `POST` | `/api/runs/:id/values/bulk` | Bulk save values | Bearer Token |
| `POST` | `/api/runs/:id/sections/:sid/submit` | Submit section | Bearer Token |
| `POST` | `/api/runs/:id/next` | Navigate to next section | Bearer Token |
| `PUT` | `/api/runs/:id/complete` | Complete run (executes transforms) | Bearer Token |

#### Logic Rules
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows/:id/logic` | List logic rules |
| `POST` | `/api/workflows/:id/logic` | Create logic rule |
| `PUT` | `/api/logic/:id` | Update logic rule |
| `DELETE` | `/api/logic/:id` | Delete logic rule |

#### Connections & Integrations (Stage 16)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:id/connections` | List connections |
| `POST` | `/api/projects/:id/connections` | Create connection |
| `PATCH` | `/api/projects/:id/connections/:cid` | Update connection |
| `DELETE` | `/api/projects/:id/connections/:cid` | Delete connection |
| `POST` | `/api/projects/:id/connections/:cid/test` | Test connection |
| `GET` | `/api/connections/oauth/start` | Initiate OAuth2 flow |
| `GET` | `/api/connections/oauth/callback` | Handle OAuth2 callback |

#### AI Workflow Generation (Stage 15)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ai/workflows/generate` | Generate workflow from description |
| `POST` | `/api/ai/workflows/:id/suggest` | Suggest improvements |
| `POST` | `/api/ai/templates/:tid/bindings` | Suggest template bindings |

#### Analytics & Export
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows/:id/analytics` | Get workflow analytics |
| `GET` | `/api/workflows/:id/analytics/funnel` | Get completion funnel |
| `GET` | `/api/workflows/:id/analytics/trends` | Get response trends |
| `GET` | `/api/workflows/:id/export/json` | Export all run data (JSON) |
| `GET` | `/api/workflows/:id/export/csv` | Export all run data (CSV) |
| `GET` | `/api/workflows/:id/export/pdf` | Export responses (PDF) |

### Legacy Survey System

For legacy survey endpoints (Poll-Vault), use `/api/surveys/*` paths. See CLAUDE.md for details.

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

The database uses **Drizzle ORM** with 17 main tables:

- `users`, `sessions`, `user_preferences` — Authentication & user data
- `surveys`, `survey_pages`, `questions` — Workflow structure
- `conditional_rules`, `loop_group_subquestions` — Logic engine
- `responses`, `answers`, `analytics_events` — Run execution data
- `recipients`, `global_recipients`, `recipient_groups` — Distribution
- `files`, `survey_templates`, `system_stats` — Supporting features

**Supported Question Types:**
- `short_text`, `long_text`, `multiple_choice`, `radio`, `yes_no`, `checkbox`
- `date_time`, `file_upload`, `loop_group` (repeating sections), `computed` (virtual steps)

### Key Implementation Details

- **Environment Isolation:** Poll-Vault and Vault-Logic use separate Neon databases
- **Schema Management:** Run `npm run db:push` to sync schema changes
- **File Uploads:** Handled via Multer with metadata stored in `files` table
- **Logic Engine:** Located in `shared/conditionalLogic.ts` and `shared/workflowLogic.ts`
- **Service Layer:** 25+ service classes in `server/services/`
- **Repository Layer:** 15+ repository classes in `server/repositories/`
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
npm run db:push          # Push schema changes to database

# Testing
npm test                 # Run all tests with coverage
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests
npm run test:e2e         # Run end-to-end tests with Playwright
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Run tests with interactive UI
npm run test:coverage    # Generate coverage report

# Utilities
npm run set-admin        # Set a user as admin
npm run generate-fake-data # Generate test data
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
| 🔄 | Advanced Analytics & Dashboards | In Progress |
| 🔄 | Team Collaboration (Full RBAC) | In Progress |
| 🔜 | Workflow Versioning | Planned Q1 2026 |
| 🔜 | Real-time Collaboration | Planned Q2 2026 |
| 🔜 | Integration Marketplace | Planned Q2 2026 |

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
   VL_MASTER_KEY=<base64-encoded-32-byte-key>
   ALLOWED_ORIGIN=your-app.up.railway.app
   ```
3. Generate VL_MASTER_KEY locally:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Configure Google OAuth authorized origins to include your Railway domain
5. Deploy! Railway auto-detects build and start commands

**Compatible with:** Railway, Neon Database, Docker, standard Node.js hosting

---

## 📄 License

MIT © 2025 Vault-Logic Contributors

Originally inspired by Poll-Vault, rebuilt for next-generation workflow automation.

---

## 📚 Documentation

VaultLogic has comprehensive documentation organized by topic:

- **[Architecture & Current State](./claude.md)** - Complete architecture overview and current state
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
# Run the comprehensive schema fix script
npx tsx scripts/fixAllMissingColumns.ts

# Restart your dev server
npm run dev
```

**What it fixes:**
- Adds missing columns to `users` table (`full_name`, `tenant_id`, `first_name`, `last_name`, `profile_image_url`)
- Adds missing columns to `projects` table (`tenant_id`, `name`, `archived`)
- Adds missing columns to `workflows` table (`name`, `current_version_id`, `project_id`)
- Creates default tenant organization
- Sets up proper database indices

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

**Last Updated:** 2025-11-14
**Version:** 1.4.0 (Stage 21 Complete)

# Vault-Logic 🧠

**Workflow Builder and Automation Logic Engine**

> Vault-Logic lets you design and execute intelligent workflows with dynamic page and question logic — built for creators, consultants, and automation developers.
﻿# Vault-Logic

[![CI](https://github.com/ShawnC-LaunchCode/Vault-Logic/workflows/CI/badge.svg)](https://github.com/ShawnC-LaunchCode/Vault-Logic/actions/workflows/ci.yml)

**Vault-Logic** is a comprehensive workflow builder and survey platform built with modern web technologies. Create, distribute, and analyze surveys and workflows with advanced features like conditional logic, multi-page workflows, and detailed analytics.

[![CI](https://github.com/ShawnC-LaunchCode/VaultLogic/workflows/CI/badge.svg)](https://github.com/ShawnC-LaunchCode/VaultLogic/actions/workflows/ci.yml)

Originally inspired by Poll-Vault, rebuilt for next-generation workflow automation.

---

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, PostgreSQL (Neon recommended)

```bash
# Clone the repository
git clone https://github.com/ShawnC-LaunchCode/VaultLogic.git
cd VaultLogic

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and Google OAuth credentials

# Initialize database
npm run db:push

# Start development server
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

# CORS (hostnames only, no protocols)
ALLOWED_ORIGIN=localhost,127.0.0.1

# Optional Services
SENDGRID_API_KEY=your-sendgrid-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
GEMINI_API_KEY=your-google-gemini-api-key-here
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

---
### Step 3: Set Up PostgreSQL Database

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

### Step 4: Set Up Google OAuth2 (REQUIRED for login)

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

## 🧱 Architecture Overview

**Full-Stack Workflow Automation Platform**

- **Frontend:** React (Vite, Tailwind CSS, TanStack Query, Radix UI)
- **Backend:** Node.js (Express + Drizzle ORM)
- **Database:** Neon PostgreSQL (serverless compatible)
- **Auth:** Google OAuth2
- **Storage:** Multer (local/S3 compatible)
- **AI:** Google Gemini (optional)

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
- 🧰 **Data Export** — JSON/CSV outputs for reporting or integration
- 🧱 **Drizzle ORM Schema** — Strongly typed PostgreSQL models with migrations
- 🧑‍💻 **Developer Friendly** — TypeScript end-to-end, modular services, comprehensive tests
- 📊 **Advanced Analytics** — Completion rates, drop-off analysis, engagement metrics, time tracking
- 📧 **Email Distribution** — SendGrid integration for invitations and notifications
- 🤖 **AI-Powered** — Google Gemini integration for workflow generation and analysis
- 🔐 **Secure Auth** — Google OAuth2 with session management
- 📤 **File Uploads** — Support for file upload questions with Multer

---

## 🧪 API Endpoints

### Workflow Management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/surveys` | Create workflow |
| `GET` | `/api/surveys` | List all workflows |
| `GET` | `/api/surveys/:id` | Fetch workflow with sections & steps |
| `PUT` | `/api/surveys/:id` | Update workflow |
| `DELETE` | `/api/surveys/:id` | Delete workflow |
| `PATCH` | `/api/surveys/:id/status` | Update workflow status |

### Sections (Pages)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/surveys/:id/pages` | Create section |
| `GET` | `/api/surveys/:id/pages` | List sections |
| `PUT` | `/api/surveys/:id/pages/:pageId` | Update section |
| `DELETE` | `/api/surveys/:id/pages/:pageId` | Delete section |

### Steps (Questions)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/surveys/:id/questions` | Create step |
| `PUT` | `/api/surveys/:id/questions/:qid` | Update step |
| `DELETE` | `/api/surveys/:id/questions/:qid` | Delete step |

### Workflow Runs
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/surveys/:id/responses` | Start workflow run |
| `GET` | `/api/surveys/:id/responses` | List all runs |
| `GET` | `/api/surveys/:id/responses/:runId` | Get specific run |
| `POST` | `/api/surveys/:id/responses/:runId/answers` | Save step data |

### Data Export
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/surveys/:id/export/json` | Export all run data (JSON) |
| `GET` | `/api/surveys/:id/export/csv` | Export all run data (CSV) |
| `GET` | `/api/surveys/:id/export/pdf` | Export responses (PDF) |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/surveys/:id/analytics` | Get workflow analytics |
| `GET` | `/api/surveys/:id/analytics/funnel` | Get completion funnel |
| `GET` | `/api/surveys/:id/analytics/trends` | Get response trends |

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
- `short_text`, `long_text`, `multiple_choice`, `radio`, `yes_no`
- `date_time`, `file_upload`, `loop_group` (repeating sections)

### Key Implementation Details

- **Environment Isolation:** Poll-Vault and Vault-Logic use separate Neon databases
- **Schema Management:** Run `npm run db:push` to sync schema changes
- **File Uploads:** Handled via Multer with metadata stored in `files` table
- **Logic Engine:** Located in `shared/conditionalLogic.ts`
- **Service Layer:** 20+ service classes in `server/services/`
- **Repository Layer:** 15+ repository classes in `server/repositories/`

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
| ✅ | Workflow Builder + Section Logic | Complete |
| ✅ | Multi-page Workflows with Conditional Logic | Complete |
| ✅ | Response Collection & Analytics | Complete |
| 🔄 | Advanced Conditional Logic Engine | In Progress |
| 🔜 | Document Automation (PDF/DOCX) | Planned |
| 🔜 | Logic Blocks (JavaScript/Python) | Planned |
| 🔜 | Integrations (DocuSign, Zapier) | Planned |
| 🔜 | Workflow Versioning | Planned |
| 🔜 | Team Collaboration | Planned |

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
   DATABASE_URL=<neon-postgres-url>
   GOOGLE_CLIENT_ID=<server-oauth-client-id>
   VITE_GOOGLE_CLIENT_ID=<client-web-oauth-client-id>
   SESSION_SECRET=<32-char-random-secret>
   ALLOWED_ORIGIN=your-app.up.railway.app
   ```
3. Configure Google OAuth authorized origins to include your Railway domain
4. Deploy! Railway auto-detects build and start commands

**Compatible with:** Railway, Neon Database, Docker, standard Node.js hosting

---

## 📄 License

MIT © 2025 Vault-Logic Contributors

Originally inspired by Poll-Vault, rebuilt for next-generation workflow automation.

---

## 📚 Additional Resources

- [API Documentation](./docs/) - Detailed API reference
- [Architecture Guide](./CLAUDE.md) - Implementation strategy and design patterns
- [Testing Guide](./tests/README.md) - Testing approach and conventions

---

**Last Updated:** 2025-11-05

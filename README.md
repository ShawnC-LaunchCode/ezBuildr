# Vault-Logic

[![CI](https://github.com/ShawnC-LaunchCode/Vault-Logic/workflows/CI/badge.svg)](https://github.com/ShawnC-LaunchCode/Vault-Logic/actions/workflows/ci.yml)

**Vault-Logic** is a comprehensive workflow builder and survey platform built with modern web technologies. Create, distribute, and analyze surveys and workflows with advanced features like conditional logic, multi-page workflows, and detailed analytics.

## Tech Stack

- **Frontend:** React, Vite, TanStack Query, Radix UI, Tailwind CSS
- **Backend:** Node.js, Express, Drizzle ORM
- **Database:** PostgreSQL (Neon serverless compatible)
- **Authentication:** Google OAuth2
- **Services:** SendGrid (email), Multer (file upload)

## Features

- 🔐 **Secure Authentication** - Google OAuth2 integration
- 📋 **Survey Builder** - Multi-page surveys with drag-and-drop interface
- 🎯 **Question Types** - Short text, long text, multiple choice, radio, yes/no, date/time, file upload, loop groups
- 🔀 **Conditional Logic** - Show/hide questions based on answers
- 📧 **Email Distribution** - Send personalized survey invitations via SendGrid
- 👤 **Anonymous Responses** - Support for anonymous survey submissions with rate limiting
- 📊 **Analytics** - Completion rates, response times, drop-off analysis, and engagement metrics
- 📤 **Export** - Export responses to CSV or PDF formats
- 🎨 **Modern UI** - Built with Radix UI components and Tailwind CSS

---

## Recent Updates

### 2025-11-05: Bug Fixes & Developer Experience
- Fixed missing PUT /api/surveys/:surveyId/pages/:pageId endpoint causing 404 errors when updating page titles
- Made Gemini API key optional - app now starts without AI features if key not configured
- Improved development setup documentation

### 2025-10-22: Historical Statistics & Admin Enhancements
- Added `systemStats` table tracking lifetime totals (surveys/responses created/deleted)
- Added survey deletion buttons to admin pages with confirmation dialogs
- Implemented status-based navigation (drafts → builder, active → results)
- Fixed anonymous response creation by auto-generating `publicLink`

### 2025-10-20: Railway Migration & Cleanup
- Removed legacy Replit and Docker configurations
- Simplified CORS to use `ALLOWED_ORIGIN` only
- Verified production-ready architecture (monolithic full-stack deployment)

### 2025-10-15: 3-Tier Architecture Refactoring
- Implemented Repository layer for data access abstraction
- Implemented Service layer for business logic orchestration
- Refactored storage.ts (reduced from 2,500 to 1,480 lines)
- Pattern: Routes → Services → Repositories → Database

---

## Local Development Setup

### Prerequisites

Before you begin, make sure you have:
- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** database - Use [Neon](https://neon.tech/) (recommended) or local PostgreSQL
- **Git** (for cloning if needed)

### Step 1: Install Dependencies

```bash
npm install
```

*This installs all required packages from package.json*

### Step 2: Set Up Environment Variables

Create your `.env` file from the example:

```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

Now edit `.env` with your text editor and configure these **CRITICAL** variables:

**Minimum Required Configuration:**

```env
# Core Settings
NODE_ENV=development
PORT=5000
BASE_URL=http://localhost:5000
VITE_BASE_URL=http://localhost:5000

# Database (update with your PostgreSQL credentials)
DATABASE_URL=postgresql://username:password@localhost:5432/vault_logic

# Session Security (generate a random string)
SESSION_SECRET=your-super-secret-session-key-change-this

# CORS Settings
ALLOWED_ORIGIN=localhost,127.0.0.1

# Google OAuth2 (you'll set this up in Step 4)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Optional - Email (leave as-is for now)
SENDGRID_API_KEY=SG.optional
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

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

### Step 5: Initialize Database Schema

```bash
npm run db:push
```

*This creates all necessary tables in your PostgreSQL database*

### Step 6: Start the Development Server

```bash
npm run dev
```

You should see output like:

```
Server running on port 5000
Database connected successfully
```

### Step 7: Open in Browser

Visit: **http://localhost:5000**

You should see the Vault-Logic login page!

---

## Troubleshooting Common Issues

### Database Connection Failed

- Verify PostgreSQL is running: `psql -U postgres -c "SELECT 1"`
- Check DATABASE_URL format is correct
- Ensure database exists: `psql -U postgres -l`

### "GOOGLE_CLIENT_ID not provided"

- Make sure you've set up Google OAuth2 (Step 4)
- Check both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` are set in `.env`
- Restart the dev server after changing `.env`

### Port 5000 already in use

- Change `PORT=5001` in `.env`
- Update Google OAuth origins to `http://localhost:5001`

### Module not found errors

- Delete `node_modules` folder
- Run `npm install` again

---

## Optional: Set Up SendGrid for Email

For now, you can test without email functionality. When ready:

1. Sign up at [SendGrid](https://sendgrid.com/)
2. Create an API key
3. Verify a sender email address
4. Update `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` in `.env`

---

## Available Commands

```bash
npm run dev              # Start development server (Vite + Express)
npm run build            # Build for production
npm start                # Start production server
npm run check            # TypeScript type checking
npm run db:push          # Push schema changes to database
npm run db:studio        # Open Drizzle Studio (database GUI)
npm run test             # Run test suite
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Run tests with interactive UI
npm run test:coverage    # Run tests with coverage report
```

---

## Project Structure

```
Vault-Logic/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components (Radix UI)
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities & helpers
├── server/               # Express backend
│   ├── index.ts          # Entry point & CORS config
│   ├── routes/           # Modular route handlers
│   │   ├── auth.routes.ts       # Authentication endpoints
│   │   ├── surveys.routes.ts    # Survey CRUD operations
│   │   ├── pages.routes.ts      # Survey page management
│   │   ├── questions.routes.ts  # Question & conditional logic
│   │   ├── recipients.routes.ts # Recipient management
│   │   ├── responses.routes.ts  # Response collection
│   │   ├── analytics.routes.ts  # Analytics & reporting
│   │   └── files.routes.ts      # File upload & management
│   ├── services/         # Business logic layer (3-tier architecture)
│   ├── repositories/     # Data access layer (3-tier architecture)
│   ├── storage.ts        # Legacy interface (delegates to repositories)
│   └── types/            # TypeScript declarations
├── shared/               # Shared types & Drizzle schema
└── docs/                 # Project documentation
```

---

## Documentation

For detailed developer documentation, see [CLAUDE.md](./CLAUDE.md) which includes:
- Complete API reference
- Database schema details
- Implementation strategy
- Deployment instructions
- Security best practices

---

## License

MIT

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Deployment

### Railway (Recommended)

**Prerequisites:** GitHub repo, Railway account, Google OAuth credentials, Neon PostgreSQL database

**Quick Deploy:**

1. **Deploy:** Go to [Railway](https://railway.app/) → "Deploy from GitHub repo" → Select this repository
2. **Environment Variables:** Add these in Railway → Variables:
   ```bash
   NODE_ENV=production
   DATABASE_URL=<neon-postgres-url>
   GOOGLE_CLIENT_ID=<server-oauth-id>
   VITE_GOOGLE_CLIENT_ID=<client-oauth-id>
   SESSION_SECRET=<32-char-random>
   ALLOWED_ORIGIN=your-app.up.railway.app  # no https://
   ```
3. **Configure Google OAuth:** Add Railway URL to authorized origins in Google Cloud Console
4. **Verify:** Visit `https://your-app.up.railway.app`

Railway auto-detects the build and start commands. View deployment logs in the Railway dashboard.

---

**Last Updated:** 2025-11-05

# CI/CD Setup Guide for Vault-Logic

This guide explains how to configure automated testing and deployment for Vault-Logic using GitHub Actions and Railway.

## 🎯 Overview

The CI/CD pipeline automatically:
1. ✅ Runs unit and integration tests (Vitest + Supertest)
2. ✅ Runs E2E tests (Playwright)
3. ✅ Generates code coverage reports
4. ✅ Performs type checking (TypeScript)
5. ✅ Builds the application
6. ✅ Deploys to Railway (only on successful tests to `main` branch)

## 📋 Prerequisites

- GitHub repository with Vault-Logic code
- Railway account with deployed Vault-Logic service
- Neon PostgreSQL database (can be same as production or separate test database)

## 🔧 GitHub Secrets Configuration

You need to add the following secrets to your GitHub repository:

### How to Add Secrets:
1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each of the following secrets:

### Required Secrets:

#### 1. `DATABASE_URL`
Your Neon PostgreSQL connection string for testing.

```
postgresql://username:password@host/database?sslmode=require
```

**Recommendation:** Use a separate test database or schema to avoid affecting production data during CI runs.

#### 2. `GOOGLE_CLIENT_ID`
Your Google OAuth2 server-side client ID.

```
1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

#### 3. `VITE_GOOGLE_CLIENT_ID`
Your Google OAuth2 client-side (web) client ID.

```
1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

#### 4. `SESSION_SECRET`
A strong random secret for session management (minimum 32 characters).

Generate one using:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 5. `RAILWAY_TOKEN`
Your Railway account API token.

To get your Railway token:
1. Go to [Railway Dashboard](https://railway.app/account/tokens)
2. Click **Create Token**
3. Give it a name (e.g., "GitHub Actions CI/CD")
4. Copy the token value

#### 6. `RAILWAY_SERVICE_ID`
Your Vault-Logic service ID in Railway.

To find your service ID:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# List services and get the ID
railway service
```

Or find it in the Railway dashboard URL:
```
https://railway.app/project/{PROJECT_ID}/service/{SERVICE_ID}
```

#### 7. `CODECOV_TOKEN` (Optional)
Token for uploading coverage reports to Codecov.

- Sign up at [codecov.io](https://codecov.io)
- Link your GitHub repository
- Copy the repository upload token

## 🚀 Railway Configuration

The `.railway.toml` file is already configured with:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[env]
NODE_ENV = "production"
PORT = "5000"

[healthcheck]
path = "/api/health"
interval = 30
timeout = 10
```

### Railway Environment Variables

In your Railway project dashboard → **Variables** tab, ensure these are set:

```bash
DATABASE_URL=<your-production-postgres-url>
GOOGLE_CLIENT_ID=<oauth-client-id>
VITE_GOOGLE_CLIENT_ID=<web-oauth-client-id>
SESSION_SECRET=<secure-32-char-string>
ALLOWED_ORIGIN=your-app.up.railway.app
SENDGRID_API_KEY=<optional>
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

## 🔄 How the Pipeline Works

### Trigger Events:
- **Push to `main` or `develop`**: Runs full test suite + deploys (main only)
- **Pull Request to `main` or `develop`**: Runs full test suite (no deployment)

### Pipeline Stages:

#### 1. **Test Job** (Runs on Node 18.x and 20.x)
- Checkout code
- Install dependencies
- Type checking with TypeScript
- Run unit and integration tests
- Build the application

#### 2. **Coverage Job** (Runs on Node 20.x)
- Generate detailed coverage report
- Upload to Codecov (if configured)
- Enforce coverage thresholds:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
  - Statements: 80%

#### 3. **E2E Tests Job** (Runs on Node 20.x)
- Install Playwright browsers
- Run end-to-end tests
- Upload Playwright HTML report as artifact (available for 30 days)

#### 4. **Deploy Job** (Only on `main` push after all tests pass)
- Install Railway CLI
- Deploy to Railway production environment
- Uses Railway's native deployment system

### Blocking Conditions:

Deployment is **blocked** if:
- ❌ Any unit/integration test fails
- ❌ E2E tests fail
- ❌ TypeScript type checking fails
- ❌ Code coverage is below thresholds
- ❌ Build process fails
- ❌ Not pushing to `main` branch

## 🧪 Running Tests Locally

```bash
# Run all tests (unit + integration)
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Generate coverage report
npm run test:coverage

# Run the full CI test suite locally
npm run ci:test

# Type checking
npm run check
```

## 📊 Viewing Results

### GitHub Actions:
- Go to **Actions** tab in your repository
- View workflow runs, logs, and artifacts
- Download Playwright reports for failed E2E tests

### Coverage Reports:
- Local: Open `coverage/index.html` in browser
- Codecov: View at `https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO`

### Railway Deployments:
- Check deployment status in Railway dashboard
- View logs: `railway logs`
- Monitor via Railway CLI or web interface

## 🛠️ Troubleshooting

### Tests Fail in CI but Pass Locally:

**Common causes:**
- Missing environment variables in GitHub Secrets
- Database connection issues (check `DATABASE_URL`)
- Different Node.js versions (CI uses 18.x and 20.x)

**Solution:**
```bash
# Test with the same Node version as CI
nvm use 20
npm run ci:test
```

### Playwright Tests Fail:

**Common causes:**
- Missing browser dependencies
- Timeout issues in CI environment

**Solution:**
- Increase timeouts in `playwright.config.ts`
- Check Playwright report artifact in GitHub Actions

### Railway Deployment Fails:

**Common causes:**
- Invalid `RAILWAY_TOKEN` or `RAILWAY_SERVICE_ID`
- Build errors (check Railway logs)
- Missing environment variables in Railway

**Solution:**
```bash
# Verify Railway connection locally
railway login
railway status

# Check environment variables
railway variables
```

### Coverage Thresholds Not Met:

**Solution:**
```bash
# Run coverage locally to see what's missing
npm run test:coverage

# View detailed HTML report
open coverage/index.html
```

Temporarily lower thresholds in `vitest.config.ts` if needed while building test coverage.

## 🔄 Optional: Nightly Test Runs

To run tests every night and catch regressions:

Create `.github/workflows/nightly.yml`:

```yaml
name: Nightly Tests

on:
  schedule:
    - cron: "0 4 * * *" # Every day at 4 AM UTC
  workflow_dispatch: # Allow manual trigger

jobs:
  test:
    uses: ./.github/workflows/ci.yml
    secrets: inherit
```

## 📝 Best Practices

1. **Never commit secrets** to the repository
2. **Use separate test database** to avoid affecting production data
3. **Run tests locally** before pushing to save CI minutes
4. **Review Playwright reports** for visual regression testing
5. **Keep dependencies updated** to avoid security vulnerabilities
6. **Monitor Railway usage** to stay within plan limits

## 🎉 Verification Checklist

After setup, verify everything works:

- [ ] Push to `develop` branch triggers tests only
- [ ] Push to `main` branch triggers tests + deployment
- [ ] All test jobs pass successfully
- [ ] Coverage report is generated
- [ ] Playwright artifacts are uploaded
- [ ] Railway deployment succeeds
- [ ] Application is accessible at Railway URL

## 🆘 Support

If you encounter issues:

1. Check GitHub Actions logs for detailed error messages
2. Review Railway deployment logs: `railway logs`
3. Verify all secrets are correctly set
4. Test locally with the same environment variables
5. Consult the [Railway documentation](https://docs.railway.app)

---

**Last Updated:** 2025-10-29
**Pipeline Version:** 1.0

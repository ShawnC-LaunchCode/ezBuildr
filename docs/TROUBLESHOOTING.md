# Troubleshooting Guide

**Last Updated:** 2025-10-14

This guide covers common issues and solutions for Vault-Logic development and deployment.

---

## Table of Contents

1. [Development Environment Issues](#development-environment-issues)
2. [Database Connection Issues](#database-connection-issues)
3. [Authentication Issues](#authentication-issues)
4. [Build and Deployment Issues](#build-and-deployment-issues)
5. [Replit Package Import Issues](#replit-package-import-issues)

---

## Development Environment Issues

### Port Already in Use

**Problem:** `EADDRINUSE: address already in use :::5000`

**Solution:**
```bash
# Option 1: Kill the process using the port (Windows)
netstat -ano | findstr :5000
taskkill /PID <process_id> /F

# Option 2: Change the port in .env
PORT=5001

# Remember to update Google OAuth origins to match new port
```

### Module Not Found Errors

**Problem:** `Cannot find module 'package-name'`

**Solution:**
```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# If using Windows PowerShell:
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### TypeScript Compilation Errors

**Problem:** TypeScript errors preventing build

**Solution:**
```bash
# Run type checking to see all errors
npm run check

# Common fixes:
# 1. Restart TypeScript server in VS Code (Cmd/Ctrl + Shift + P > "Restart TS Server")
# 2. Delete node_modules/@types and reinstall
# 3. Check tsconfig.json paths are correct
```

---

## Database Connection Issues

### Connection Refused

**Problem:** `ECONNREFUSED` or `Connection timeout`

**Solution:**
```bash
# Verify PostgreSQL is running
# Local installation:
psql -U postgres -c "SELECT 1"

# Docker:
docker ps | grep postgres
docker-compose up -d postgres

# Check DATABASE_URL format:
# postgresql://username:password@host:port/database
# Example: postgresql://postgres:mypassword@localhost:5432/vault_logic
```

### Database Does Not Exist

**Problem:** `database "vault_logic" does not exist`

**Solution:**
```bash
# Create the database
psql -U postgres
CREATE DATABASE vault_logic;
\q

# Or using docker-compose:
docker-compose exec postgres psql -U pollvault_user -c "CREATE DATABASE pollvault;"

# Then run migrations
npm run db:push
```

### Schema Sync Issues

**Problem:** Missing tables or columns

**Solution:**
```bash
# Push schema changes to database
npm run db:push

# View schema in GUI
npm run db:studio

# For production, use migrations instead of push
npx drizzle-kit generate:pg
npx drizzle-kit migrate
```

---

## Authentication Issues

### Google OAuth Not Working

**Problem:** "Invalid client ID" or OAuth popup fails

**Solution:**

1. **Verify environment variables:**
   ```bash
   # Both must be set in .env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

2. **Check Google Console settings:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to APIs & Services > Credentials
   - Verify Authorized JavaScript origins includes: `http://localhost:5000`
   - If you changed PORT, update origins to match

3. **Restart dev server after .env changes**

### Session Lost on Refresh

**Problem:** User logged out after page refresh

**Solution:**

1. **Check session configuration:**
   ```bash
   # Ensure SESSION_SECRET is set in .env
   SESSION_SECRET=your-long-random-secret-32-chars-minimum
   ```

2. **Verify database sessions table exists:**
   ```bash
   npm run db:studio
   # Check that "sessions" table exists
   ```

3. **Check cookie settings:**
   - In development, ensure `secure: false` for HTTP
   - In production, ensure `secure: true` for HTTPS

---

## Build and Deployment Issues

### Build Fails with Memory Error

**Problem:** `JavaScript heap out of memory`

**Solution:**
```bash
# Increase Node.js memory limit
# Windows:
set NODE_OPTIONS=--max-old-space-size=4096 && npm run build

# macOS/Linux:
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Or add to package.json scripts:
"build": "NODE_OPTIONS=--max-old-space-size=4096 vite build"
```

### CORS Errors in Production

**Problem:** `Access-Control-Allow-Origin` errors

**Solution:**

1. **Set ALLOWED_ORIGIN correctly:**
   ```bash
   # In .env (hostnames only, no protocols)
   ALLOWED_ORIGIN=yourdomain.com,www.yourdomain.com
   ```

2. **Verify CORS configuration in server/index.ts:**
   - Check origin validation logic
   - Ensure credentials: true is set
   - Verify BASE_URL matches frontend URL

### Environment Variables Not Working

**Problem:** `undefined` when accessing `process.env.VARIABLE_NAME`

**Solution:**

1. **Server variables:** Access directly via `process.env.VARIABLE_NAME`

2. **Client variables:** Must prefix with `VITE_`:
   ```bash
   # .env
   VITE_API_URL=http://localhost:5000
   VITE_GOOGLE_CLIENT_ID=your-client-id

   # Access in client code
   const apiUrl = import.meta.env.VITE_API_URL
   ```

3. **Restart dev server after changing .env**

---

## Replit Package Import Issues

### Problem Summary

When running Vault-Logic outside of Replit (e.g., local development or external hosting), you may encounter module not found errors for Replit-specific packages:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@replit/vite-plugin-runtime-error-modal'
```

This occurs because `vite.config.ts` contains imports for Replit plugins that are not installed in non-Replit environments.

### Root Cause

The application's `vite.config.ts` includes static imports for Replit-specific packages:

```typescript
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
// And conditional dynamic imports for:
// - @replit/vite-plugin-cartographer
// - @replit/vite-plugin-dev-banner
```

**Critical Issue:** Static imports fail immediately during Node.js module resolution, before the application can even start, preventing any workarounds at runtime.

### Solution: Mock Packages

Since the Vite config cannot be easily modified without affecting the original Replit deployment, the solution is to create minimal mock packages that satisfy the import requirements without providing actual functionality.

#### Implementation Steps

**1. Create Mock Package Directories**

```bash
mkdir -p node_modules/@replit/vite-plugin-runtime-error-modal
mkdir -p node_modules/@replit/vite-plugin-cartographer
mkdir -p node_modules/@replit/vite-plugin-dev-banner
```

**2. Create package.json for Each Mock Package**

Create `node_modules/@replit/vite-plugin-runtime-error-modal/package.json`:

```json
{
  "name": "@replit/vite-plugin-runtime-error-modal",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module"
}
```

Repeat for the other two packages, adjusting the name field accordingly.

**3. Create index.js for Each Mock Package**

Create `node_modules/@replit/vite-plugin-runtime-error-modal/index.js`:

```javascript
// Mock implementation that returns a minimal Vite plugin
export default function runtimeErrorOverlay(options = {}) {
  return {
    name: 'mock-replit-runtime-error-overlay',
    configResolved() {
      // No-op implementation
    }
  };
}
```

For `@replit/vite-plugin-cartographer/index.js`:

```javascript
export function cartographer(options = {}) {
  return {
    name: 'mock-replit-cartographer',
    configResolved() {
      // No-op
    }
  };
}
```

For `@replit/vite-plugin-dev-banner/index.js`:

```javascript
export function devBanner(options = {}) {
  return {
    name: 'mock-replit-dev-banner',
    configResolved() {
      // No-op
    }
  };
}
```

**4. Verify Application Starts**

```bash
npm run dev
```

You should see the normal startup output without any `ERR_MODULE_NOT_FOUND` errors.

#### Why This Works

- **Zero Configuration Changes:** No modifications to `vite.config.ts` or other source files
- **Minimal Overhead:** Mock plugins return empty functions with no performance impact
- **Portable:** Works in any hosting environment (Railway, Heroku, Google Cloud, etc.)
- **Safe:** If real Replit packages are ever installed, they automatically override the mocks

#### Alternative Approaches Considered

- **Dynamic Imports:** ❌ Static imports still fail before dynamic imports are evaluated
- **Environment Variables:** ❌ Cannot conditionally prevent static imports from parsing
- **Build-time Solutions:** ❌ Would require modifying vite.config.ts

#### Maintenance Notes

- Mock packages are lightweight and require no updates
- Safe to commit to version control if needed
- No impact on production performance
- If deploying back to Replit, the real packages will be installed automatically

---

## Getting Further Help

If your issue isn't covered here:

1. **Check the logs:**
   ```bash
   # Development logs
   npm run dev

   # Production logs (if using Docker)
   docker-compose logs -f app
   ```

2. **Verify environment setup:**
   ```bash
   # Ensure all required variables are set
   cat .env | grep -E "(DATABASE_URL|GOOGLE_CLIENT_ID|SESSION_SECRET)"
   ```

3. **Review documentation:**
   - [README.md](../README.md) - Setup guide
   - [CLAUDE.md](../CLAUDE.md) - Comprehensive developer reference

4. **Check recent changes:**
   ```bash
   git log --oneline -10
   git diff HEAD~1
   ```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-14

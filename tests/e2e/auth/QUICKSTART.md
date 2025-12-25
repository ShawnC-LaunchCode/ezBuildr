# Authentication Tests - Quick Start Guide

## 🚀 Quick Start

### Run All Tests
```bash
npx playwright test tests/e2e/auth
```

### Run Specific Test
```bash
npx playwright test tests/e2e/auth/login-flow.e2e.ts
```

### Interactive Mode
```bash
npx playwright test tests/e2e/auth --ui
```

## 📁 Test Files

| File | Tests | Purpose |
|------|-------|---------|
| `login-flow.e2e.ts` | 15 | Login, session, OAuth |
| `logout-flow.e2e.ts` | 12 | Logout, cleanup, expiration |
| `protected-routes.e2e.ts` | 15 | Route access, RBAC |
| `portal-auth.e2e.ts` | 25 | Magic links, portal JWT |
| `token-access.e2e.ts` | 25 | Bearer tokens, JWT |
| `anonymous-runs.e2e.ts` | 30 | Public workflows, run tokens |

**Total: 150+ tests**

## 🔑 Key Features

### Page Objects
```typescript
import { LoginPage, DashboardPage, PortalPage } from "./page-objects";
```

### Fixtures
```typescript
import { test, expect } from "./fixtures/auth-fixtures";

test("example", async ({ authenticatedPage, testUser }) => {
  // Pre-authenticated page ready to use
});
```

### Helpers
```typescript
import {
  loginViaAPI,
  logoutViaAPI,
  clearAuthToken,
  setAuthToken,
  getAuthToken,
  isAuthenticated
} from "./fixtures/auth-fixtures";
```

## 📊 Coverage

### Authentication Flows
- ✅ Login (Google OAuth mocked)
- ✅ Logout
- ✅ Session persistence
- ✅ Token management
- ✅ Protected routes
- ✅ Portal magic links
- ✅ Anonymous runs

### Security Testing
- ✅ SQL Injection
- ✅ XSS Protection
- ✅ CSRF Protection
- ✅ Rate Limiting
- ✅ Token Tampering
- ✅ Enumeration Prevention
- ✅ Path Traversal
- ✅ Authorization

## 🧪 Example Usage

### Basic Test
```typescript
import { test, expect } from "./fixtures/auth-fixtures";

test("should login successfully", async ({ page, devLogin }) => {
  await devLogin();
  await expect(page).toHaveURL(/.*\/dashboard/);
});
```

### Using Page Objects
```typescript
test("should logout", async ({ loginPage, dashboardPage, devLogin }) => {
  await devLogin();
  await dashboardPage.goto();
  await dashboardPage.logout();

  await expect(page).toHaveURL(/login/);
});
```

### API Helpers
```typescript
test("should create user via API", async ({ page }) => {
  const user = await createTestUser(page, {
    email: "test@example.com",
    password: "Password123!"
  });

  expect(user.email).toBe("test@example.com");
});
```

## 🎯 Common Commands

```bash
# Run in specific browser
npx playwright test tests/e2e/auth --project=chromium
npx playwright test tests/e2e/auth --project=firefox
npx playwright test tests/e2e/auth --project=webkit

# Run with video
npx playwright test tests/e2e/auth --headed

# Debug mode
npx playwright test tests/e2e/auth --debug

# Update snapshots
npx playwright test tests/e2e/auth --update-snapshots

# Generate report
npx playwright show-report
```

## 📝 Test Structure

```typescript
test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await clearAuthToken(page);
  });

  test("should do something", async ({ page, devLogin }) => {
    // Test implementation
  });

  test("should handle errors", async ({ page }) => {
    // Error case testing
  });
});
```

## 🔧 Configuration

Tests use `playwright.config.ts`:
- **Base URL:** http://localhost:5174
- **Timeout:** 30s (local), 60s (CI)
- **Retries:** 0 (local), 2 (CI)
- **Browsers:** Chromium, Firefox, WebKit, Mobile

## 🐛 Troubleshooting

### Tests timeout
- Increase timeout in test
- Check if dev server is running
- Verify database connection

### Authentication fails
- Ensure dev-login endpoint is enabled
- Check environment variables
- Verify session middleware

### Page objects not found
- Check import paths
- Verify file exports
- Run TypeScript check: `npx tsc --noEmit`

## 📚 Resources

- [Full README](./README.md)
- [Test Summary](./.test-summary.md)
- [Playwright Docs](https://playwright.dev/)
- [VaultLogic CLAUDE.md](../../../CLAUDE.md)

## ✅ Pre-flight Checklist

Before running tests:
- [ ] Dev server running on port 5174
- [ ] Database connection established
- [ ] Environment variables set
- [ ] Dev-login endpoint enabled
- [ ] Node.js 20+ installed

## 🎉 Success Metrics

When tests pass, you have validated:
- ✅ 150+ test cases
- ✅ 15+ API endpoints
- ✅ 5 browser engines
- ✅ 8 security vectors
- ✅ 6 authentication flows

---

**Last Updated:** December 25, 2025
**Maintainer:** Development Team

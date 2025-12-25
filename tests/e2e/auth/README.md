# Authentication E2E Tests

Comprehensive end-to-end tests for VaultLogic authentication flows using Playwright.

## Test Coverage

### 1. Login Flow (`login-flow.e2e.ts`)
- Dev-login endpoint authentication
- Session creation and persistence
- Token management
- Concurrent login requests
- Google OAuth flow (mocked via dev-login)
- JWT token handling

**Key Tests:**
- ✓ Successful login with dev-login
- ✓ Redirect to dashboard after login
- ✓ Session persistence across page reloads
- ✓ Session maintenance during navigation
- ✓ User info retrieval from `/api/auth/me`
- ✓ Token inclusion in API requests

### 2. Logout Flow (`logout-flow.e2e.ts`)
- Session termination
- Token cleanup
- Multi-tab/window logout
- Refresh token invalidation
- Session storage cleanup

**Key Tests:**
- ✓ Successful logout and session clearance
- ✓ Auth token removal from storage
- ✓ Redirect to login after logout
- ✓ Protected route access prevention post-logout
- ✓ Multi-tab session handling
- ✓ Double logout handling
- ✓ Session expiration handling

### 3. Protected Routes (`protected-routes.e2e.ts`)
- Authentication requirements
- Route access control
- Deep linking preservation
- Browser history security
- Role-based access control (RBAC)

**Key Tests:**
- ✓ Unauthenticated user redirection
- ✓ Authenticated user access
- ✓ Navigation between protected routes
- ✓ Direct URL access
- ✓ Back button security
- ✓ Unauthorized API request handling
- ✓ Invalid token rejection
- ✓ Public route accessibility

**Protected Routes Tested:**
- `/dashboard`
- `/workflows`, `/workflows/new`
- `/runs`
- `/datavault`
- `/templates`
- `/settings`
- `/admin`

### 4. Portal Magic Link Authentication (`portal-auth.e2e.ts`)
- Magic link generation
- Email verification
- Portal JWT tokens
- Rate limiting
- Security protections

**Key Tests:**
- ✓ Magic link request sending
- ✓ Email format validation
- ✓ Rate limiting enforcement
- ✓ Token verification
- ✓ Expired token rejection
- ✓ Token reuse prevention
- ✓ Portal JWT generation
- ✓ Portal endpoint access
- ✓ User enumeration prevention
- ✓ SQL injection protection
- ✓ XSS protection

**Portal Endpoints:**
- `POST /api/portal/auth/send` - Send magic link
- `POST /api/portal/auth/verify` - Verify token
- `GET /api/portal/me` - Get portal user
- `GET /api/portal/runs` - List user runs
- `POST /api/portal/auth/logout` - Logout

### 5. Token-Based Access (`token-access.e2e.ts`)
- Bearer token authentication
- JWT validation
- Token refresh
- Token expiration
- Security best practices

**Key Tests:**
- ✓ Workflow run creation with bearer token
- ✓ JWT format validation
- ✓ Expired token handling
- ✓ Token refresh flow
- ✓ Cookie and bearer token authentication
- ✓ Token priority (bearer over cookie)
- ✓ Tampered signature rejection
- ✓ Invalid claims handling
- ✓ Token revocation
- ✓ Concurrent token requests
- ✓ Token security (no sensitive data in payload)
- ✓ Secure signing algorithm validation

### 6. Anonymous Workflow Runs (`anonymous-runs.e2e.ts`)
- Unauthenticated workflow execution
- Public link access
- Run token management
- Anonymous run security

**Key Tests:**
- ✓ Anonymous run creation via public link
- ✓ Initial values handling
- ✓ Run token authentication
- ✓ Step value saving
- ✓ Run completion
- ✓ Non-public workflow rejection
- ✓ Token validation
- ✓ Cross-run access prevention
- ✓ Unique token generation
- ✓ Bulk value save
- ✓ Section navigation
- ✓ Rate limiting
- ✓ Invalid slug handling
- ✓ SQL injection protection
- ✓ XSS protection
- ✓ Path traversal prevention
- ✓ Data size limits

**Anonymous Run Endpoints:**
- `POST /api/workflows/public/:slug/start` - Start anonymous run
- `GET /api/runs/:id` - Get run details (with run token)
- `POST /api/runs/:id/values` - Save step values
- `PUT /api/runs/:id/complete` - Complete run
- `POST /api/runs/:id/values/bulk` - Bulk save values

## Test Architecture

### Page Objects

Located in `page-objects/`:

#### LoginPage
- Email/password input handling
- Login button interactions
- Google OAuth button
- MFA code input
- Error message retrieval

#### DashboardPage
- Dashboard visibility checks
- User menu interactions
- Logout functionality
- Settings navigation

#### PortalPage
- Magic link request form
- Email input handling
- Success/error message display
- Magic link verification

### Fixtures

Located in `fixtures/auth-fixtures.ts`:

#### Test Fixtures
- `loginPage` - LoginPage instance
- `dashboardPage` - DashboardPage instance
- `portalPage` - PortalPage instance
- `authenticatedPage` - Pre-authenticated page
- `testUser` - Default test user data
- `devLogin` - Function to perform dev login

#### Helper Functions
- `createTestUser()` - Create user via API
- `loginViaAPI()` - Login and get token
- `logoutViaAPI()` - Logout via API
- `verifyEmail()` - Verify email token
- `requestMagicLink()` - Request portal magic link
- `verifyMagicLink()` - Verify magic link token
- `setAuthToken()` - Set token in storage
- `getAuthToken()` - Get token from storage
- `clearAuthToken()` - Clear auth token
- `isAuthenticated()` - Check auth status

## Running Tests

### Run All Auth Tests
```bash
npx playwright test tests/e2e/auth
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/auth/login-flow.e2e.ts
npx playwright test tests/e2e/auth/logout-flow.e2e.ts
npx playwright test tests/e2e/auth/protected-routes.e2e.ts
npx playwright test tests/e2e/auth/portal-auth.e2e.ts
npx playwright test tests/e2e/auth/token-access.e2e.ts
npx playwright test tests/e2e/auth/anonymous-runs.e2e.ts
```

### Run in UI Mode (Interactive)
```bash
npx playwright test tests/e2e/auth --ui
```

### Run in Headed Mode (See Browser)
```bash
npx playwright test tests/e2e/auth --headed
```

### Run on Specific Browser
```bash
npx playwright test tests/e2e/auth --project=chromium
npx playwright test tests/e2e/auth --project=firefox
npx playwright test tests/e2e/auth --project=webkit
```

### Debug Tests
```bash
npx playwright test tests/e2e/auth --debug
```

### Generate HTML Report
```bash
npx playwright show-report
```

## Configuration

Tests use the Playwright configuration from `playwright.config.ts`:

- **Base URL:** `http://localhost:5174` (dev server)
- **Timeout:** 30s (local), 60s (CI)
- **Retries:** 0 (local), 2 (CI)
- **Workers:** Default (local), 2 (CI)
- **Browsers:** Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Test Match:** `*.e2e.ts` files

## Dev Environment Setup

The tests use a dev-login endpoint available in test/development environments:

```typescript
// Available at: /api/auth/dev-login
// Creates a test user session without OAuth
```

**Dev User:**
- ID: `dev-user`
- Email: `dev@example.com`
- Role: `owner`
- First Name: `Dev`
- Last Name: `User`

## Best Practices

1. **Isolation:** Each test clears auth state before running
2. **Page Objects:** Use page objects for UI interactions
3. **API Helpers:** Use fixtures for API operations
4. **Assertions:** Use Playwright's built-in assertions
5. **Timeouts:** Add reasonable waits for async operations
6. **Cleanup:** Clear tokens and sessions after tests
7. **Security:** Test injection attacks and validation
8. **Error Handling:** Test both success and failure paths

## Security Testing

Each test suite includes security-focused tests:

- **SQL Injection:** Malicious input in email, tokens, slugs
- **XSS Protection:** Script tags in user input
- **CSRF Protection:** Token-based protection
- **Rate Limiting:** Request throttling
- **Token Validation:** Format, expiration, tampering
- **Authorization:** Role-based access control
- **Enumeration Prevention:** Same response for valid/invalid emails
- **Path Traversal:** File path injection attempts

## CI/CD Integration

Tests are configured for GitHub Actions:

```yaml
- name: Run E2E Auth Tests
  run: npx playwright test tests/e2e/auth
```

**CI Configuration:**
- Increased timeouts (60s)
- Test retries (2x)
- Parallel workers (2)
- Video on failure
- Screenshots on failure
- HTML report generation

## Troubleshooting

### Tests Fail in CI but Pass Locally
- Check timeout settings (CI uses 60s timeout)
- Verify dev-login endpoint is available
- Check environment variables are set
- Review server logs for errors

### Authentication State Not Persisting
- Ensure cookies are being set correctly
- Check `localStorage` is accessible
- Verify session middleware is running
- Check CORS configuration

### Rate Limiting Issues
- Rate limiting is disabled in test environment
- If enabled, increase delays between requests
- Use different IPs/contexts for concurrent tests

### Token Issues
- Verify JWT secret is set in environment
- Check token expiration times
- Ensure tokens are being sent in correct format
- Validate token signing algorithm

## Coverage Summary

**Total Tests:** 150+

**Coverage Areas:**
- ✓ Login/Logout flows
- ✓ Session management
- ✓ Token authentication
- ✓ Protected routes
- ✓ Portal magic links
- ✓ Anonymous runs
- ✓ Security validation
- ✓ Edge cases
- ✓ Error handling
- ✓ Concurrent operations

## Future Enhancements

- [ ] MFA (2FA) flow tests
- [ ] Password reset flow tests
- [ ] Email verification tests
- [ ] OAuth provider tests (Google, GitHub)
- [ ] Account lockout tests
- [ ] Session timeout tests
- [ ] Device trust tests
- [ ] Backup code tests
- [ ] Audit log verification

## Contributing

When adding new auth tests:

1. Create test file with `.e2e.ts` extension
2. Import fixtures from `fixtures/auth-fixtures`
3. Use page objects for UI interactions
4. Group related tests with `test.describe()`
5. Include security tests
6. Test both success and failure cases
7. Add descriptive test names
8. Update this README with new coverage

## References

- [Playwright Documentation](https://playwright.dev/)
- [VaultLogic CLAUDE.md](../../../CLAUDE.md)
- [Auth Routes](../../../server/routes/auth.routes.ts)
- [Portal Routes](../../../server/routes/portal.routes.ts)
- [Run Routes](../../../server/routes/runs.routes.ts)

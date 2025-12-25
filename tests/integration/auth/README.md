# Authentication Integration Tests

Comprehensive integration tests for JWT authentication, session management, OAuth2 flows, and portal authentication in VaultLogic.

## Test Coverage

### JWT Authentication & Session Management Tests

#### 1. JWT Authentication (`jwt.authentication.test.ts`)
Tests JWT token generation, validation, expiration, and authentication flows:

- **JWT Token Generation**
  - Valid token creation on login
  - Correct payload structure (userId, email, tenantId, role)
  - 15-minute expiry configuration
- **JWT Token Validation**
  - Valid token acceptance on protected routes
  - Rejection of missing/malformed/invalid tokens
  - Invalid signature detection
- **JWT Token Expiration**
  - Expired token rejection
  - Correct error codes for expired tokens
- **Bearer Token Authentication**
  - Authorization header handling
  - POST/PUT/DELETE/PATCH request support
- **Cookie-to-Token Exchange**
  - Session cookie to JWT conversion
  - Token exchange endpoint validation
- **Hybrid Authentication Strategy**
  - Bearer token precedence over cookies
  - Cookie fallback behavior
  - Safe method (GET) restrictions for cookies
  - Mutation-strict enforcement
- **Optional Authentication**
  - Anonymous access to public resources
  - User context attachment when authenticated
- **Token Refresh Flow**
  - Access token refresh using refresh token
  - Refresh token rotation
  - Token reuse detection
  - Security revocation on reuse
- **Logout Flow**
  - Refresh token revocation
  - Cookie clearing

**Test Count:** ~30 tests

#### 2. Session Management (`session.management.integration.test.ts`)
Tests session listing, revocation, device management, and multi-device scenarios:

- **Session Creation and Tracking**
  - Refresh token creation on login
  - Device metadata tracking (User-Agent, IP)
  - Multiple device session isolation
- **GET /api/auth/sessions**
  - Active session listing
  - Current session identification
  - Revoked session exclusion
  - Session ordering by last used
  - Authentication requirement
- **DELETE /api/auth/sessions/:sessionId**
  - Specific session revocation
  - Current session protection
  - Cross-user authorization prevention
  - Invalid session ID handling
- **DELETE /api/auth/sessions/all**
  - Bulk session revocation (except current)
  - Trusted device revocation
  - Active session requirement
- **Session Expiration**
  - 30-day expiry enforcement
  - Expired token rejection
- **Concurrent Session Handling**
  - Multiple concurrent logins
  - Concurrent token refresh scenarios
  - Race condition handling

**Test Count:** ~25 tests

#### 3. Portal Authentication (`portal.authentication.test.ts`)
Tests magic link authentication, portal tokens, and anonymous user flows:

- **Magic Link Generation**
  - Email-based magic link creation
  - Non-existent email handling (no enumeration)
  - Email format validation
  - Rate limiting (3 per 15 minutes)
  - Timing attack prevention (500ms delay)
- **Magic Link Verification**
  - Valid token verification
  - Portal JWT generation
  - Invalid token rejection
  - Expired token handling
  - Token consumption after use
- **Portal Token Authentication**
  - Portal JWT validation
  - Portal-specific routes access
  - Invalid portal token rejection
  - Run listing for portal users
  - Protected route authentication
- **Portal Token Expiration**
  - 24-hour expiry configuration
  - Expired token rejection
- **Portal Logout**
  - Stateless logout support
- **Anonymous User Flows**
  - Anonymous workflow run creation
  - Fingerprint-based tracking
  - Run token usage
  - Protected workflow restriction
- **Portal vs Regular Auth Isolation**
  - Portal token restriction to portal routes
  - Regular JWT restriction from portal routes

**Test Count:** ~25 tests

#### 4. Protected Routes (`protected.routes.test.ts`)
Tests authentication and authorization on all protected API routes:

- **GET/POST/PUT/DELETE/PATCH Protected Routes**
  - Bearer token validation
  - Missing/empty/malformed header handling
  - Wrong token type rejection
- **Token Edge Cases**
  - Extra spaces, newlines, very long tokens
  - Empty Authorization header
  - Multiple Authorization headers
  - SQL injection and XSS attempts
- **Token Payload Validation**
  - Missing userId rejection
  - Non-existent userId handling
- **Cross-User Authorization**
  - Resource isolation between users
  - Unauthorized access prevention
- **User Context Injection**
  - userId, tenantId, role injection
- **Rate Limiting**
  - Authenticated request exemption
- **Mixed Auth Scenarios**
  - Bearer + cookie handling
  - Token precedence enforcement
- **Optional Auth Routes**
  - Unauthenticated public access
  - Enhanced context when authenticated

**Test Count:** ~35 tests

#### 5. Auth Middleware (`auth.middleware.integration.test.ts`)
Comprehensive tests for all authentication middleware functions:

- **requireAuth Middleware**
  - Valid JWT Bearer token acceptance
  - Missing/invalid/expired token handling
- **optionalAuth Middleware**
  - Anonymous access allowance
  - User context attachment on valid token
- **hybridAuth Middleware**
  - JWT Bearer token authentication
  - Refresh cookie authentication (GET only)
  - Mutation-strict enforcement
  - Safe method allowance (HEAD, OPTIONS)
  - JWT precedence over cookies
- **optionalHybridAuth Middleware**
  - JWT/cookie authentication
  - Anonymous access support
  - Invalid auth tolerance
- **Cookie Strategy Security**
  - Safe method restriction
  - Mutation method rejection
  - Cookie precedence rules
  - Refresh token validation
- **User Context Attachment**
  - userId, userEmail, tenantId, userRole injection
  - Database lookup for missing fields
- **Error Handling**
  - Consistent error format
  - Proper error codes (missing_token, invalid_token, token_expired)
  - Malformed JWT handling

**Test Count:** ~40 tests

### OAuth2 Authentication Tests

## Test Coverage

### 1. Google OAuth2 Login (`oauth2.google.test.ts`)
Tests the Google OAuth2 ID token authentication flow:

- **Token Verification**
  - Valid Google ID token authentication
  - Token verification error handling
  - Unverified email rejection
  - Missing profile information handling

- **User Management**
  - New user creation from Google profile
  - Existing user updates on subsequent logins
  - Database user record validation
  - Email verification status tracking

- **Security**
  - Origin validation (CSRF protection)
  - Rate limiting (disabled in test env)
  - Missing token validation
  - Invalid token handling

- **Response Validation**
  - JWT token generation
  - Refresh token cookie setting
  - User data structure
  - Cookie security attributes

### 2. OAuth2 3-Legged Flow (`oauth2.callback.test.ts`)
Tests OAuth2 authorization code grant for third-party integrations:

- **Authorization Flow**
  - Authorization URL generation
  - State token generation and validation
  - Redirect URI encoding
  - Scope parameter handling

- **State Management**
  - CSRF state token validation
  - State expiration (10-minute TTL)
  - State cleanup after use
  - State reuse prevention

- **Callback Handling**
  - Missing state/code parameter handling
  - OAuth provider error responses
  - Connection status tracking
  - Metadata storage

- **Security**
  - Cryptographically secure random state
  - Redirect URI validation
  - State token uniqueness
  - PKCE support preparation

### 3. Token Refresh (`oauth2.token-refresh.test.ts`)
Tests refresh token rotation and session management:

- **Token Refresh**
  - Valid refresh token exchange
  - Automatic token rotation
  - New token generation
  - Old token revocation

- **Error Handling**
  - Missing refresh token
  - Invalid/expired tokens
  - Revoked token detection
  - User not found handling

- **Token Lifecycle**
  - Creation on login
  - Revocation on logout
  - Multiple active tokens per user
  - Bulk revocation (password reset)

- **Security**
  - Cryptographically strong tokens
  - Token hashing before storage
  - Token reuse detection
  - Concurrent request handling

- **Cookie Management**
  - HttpOnly flag
  - SameSite=Strict
  - Secure flag (production)
  - Proper expiry (30 days)

### 4. Client Credentials Flow (`oauth2.client-credentials.test.ts`)
Tests OAuth2 client credentials grant for server-to-server authentication:

- **Token Fetching**
  - Access token retrieval
  - Request parameter validation
  - Scope handling
  - Token type validation

- **Caching**
  - Token caching to avoid redundant requests
  - Cache key generation (tenant/project/scope scoped)
  - Cache expiration (30-second buffer)
  - Cache invalidation
  - Cache clearing

- **Error Handling**
  - 400/401/403/500 HTTP errors
  - Network errors
  - Malformed JSON responses
  - Timeout handling
  - Missing required fields

- **Credential Testing**
  - Valid credential validation
  - Invalid credential detection
  - Unreachable endpoint handling

### 5. Session Management (`oauth2.sessions.test.ts`)
Tests multi-device session tracking and management:

- **Session Listing**
  - Active sessions retrieval
  - Current session marking
  - Device name parsing
  - Empty session handling

- **Session Revocation**
  - Single session revocation
  - Current session protection
  - Cross-user session protection
  - Non-existent session handling

- **Multi-Device Logout**
  - All other sessions revocation
  - Current session preservation
  - Trusted device revocation
  - No active session handling

- **Trusted Devices**
  - Device trust registration
  - Trust expiry updates
  - Trusted device listing
  - Device revocation

- **Session Metadata**
  - IP address tracking
  - User agent tracking
  - Last used timestamp
  - Device fingerprinting

## Running Tests

### Run All Auth Integration Tests
```bash
npm run test:integration tests/integration/auth/
```

### Run Individual Test Suites
```bash
# Google OAuth2 tests
npm run test:integration tests/integration/auth/oauth2.google.test.ts

# OAuth2 callback tests
npm run test:integration tests/integration/auth/oauth2.callback.test.ts

# Token refresh tests
npm run test:integration tests/integration/auth/oauth2.token-refresh.test.ts

# Client credentials tests
npm run test:integration tests/integration/auth/oauth2.client-credentials.test.ts

# Session management tests
npm run test:integration tests/integration/auth/oauth2.sessions.test.ts
```

### Run with Coverage
```bash
npm run test:integration -- --coverage tests/integration/auth/
```

### Run in Watch Mode
```bash
npm run test:integration -- --watch tests/integration/auth/
```

## Test Environment Setup

### Required Environment Variables
```bash
# Core
NODE_ENV=test
DATABASE_URL=postgresql://...  # Test database
TEST_DATABASE_URL=postgresql://...  # Optional separate test DB

# Authentication
GOOGLE_CLIENT_ID=test-google-client-id
JWT_SECRET=test-jwt-secret
SESSION_SECRET=test-session-secret
VL_MASTER_KEY=<base64-32-byte-key>

# Optional
ALLOWED_ORIGIN=localhost,127.0.0.1
```

### Database Setup
Tests require a PostgreSQL database with:
- All tables migrated (run migrations before tests)
- At least one tenant record (created automatically)
- Database functions for DataVault (created in setup)

### Mock Setup
Tests mock:
- Google OAuth2 client (token verification)
- External OAuth2 providers (fetch API calls)
- SendGrid email service
- File storage operations

## Test Patterns

### Authentication Mocking
```typescript
import { __setGoogleClient } from '../../../server/googleAuth';

const mockGoogleClient = {
  verifyIdToken: vi.fn().mockResolvedValue({
    getPayload: () => mockPayload,
  }),
};
__setGoogleClient(mockGoogleClient);
```

### Test Data Cleanup
```typescript
beforeEach(async () => {
  // Clean up test users
  await db.delete(users).where(eq(users.email, testEmail));
});

afterAll(async () => {
  // Clean up tenant (cascades to all related data)
  await db.delete(tenants).where(eq(tenants.id, testTenantId));
});
```

### Cookie Handling
```typescript
const response = await request(app)
  .post('/api/auth/refresh-token')
  .set('Cookie', `refresh_token=${refreshToken}`);

const cookies = response.headers['set-cookie'];
expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
```

## CI/CD Integration

These tests are designed to run in CI environments:

1. **Database Isolation**: Each test suite creates its own tenant and cleans up after
2. **Mock External Services**: Google OAuth, OAuth2 providers, email
3. **No Network Calls**: All external APIs are mocked
4. **Fast Execution**: Optimized for parallel test execution
5. **Deterministic**: No timing-dependent assertions (except where testing timeouts)

## Troubleshooting

### Tests Hanging
- Check database connection (`DATABASE_URL`)
- Verify migrations have run
- Ensure test database exists

### Token Verification Errors
- Verify `GOOGLE_CLIENT_ID` is set
- Check mock setup in `beforeEach`
- Ensure `__setGoogleClient` is called

### Database Constraint Errors
- Run cleanup before tests: `npm run db:reset`
- Check for stale data from previous test runs
- Verify tenant cascade deletes work

### Rate Limiting Issues
- Rate limiting is disabled in test environment (`NODE_ENV=test`)
- If tests fail, verify `process.env.NODE_ENV === 'test'`

## Security Testing

These tests verify critical security features:

- ✅ Token hashing before database storage
- ✅ Refresh token rotation on use
- ✅ Token reuse detection and prevention
- ✅ CSRF protection (Origin validation, state tokens)
- ✅ Cookie security (HttpOnly, Secure, SameSite)
- ✅ Session isolation between users
- ✅ Current session protection
- ✅ Cryptographically secure random generation
- ✅ OAuth2 state validation and cleanup
- ✅ Token caching with expiry buffers

## Additional Resources

- [OAuth2 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [VaultLogic Authentication Architecture](../../../docs/architecture/AUTH.md)
- [Testing Best Practices](../../../docs/testing/BEST_PRACTICES.md)

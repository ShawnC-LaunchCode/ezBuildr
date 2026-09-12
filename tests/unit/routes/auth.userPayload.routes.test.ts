/**
 * MAP-10 — `POST /api/auth/login`, `POST /api/auth/refresh-token`, and
 * `POST /api/auth/google` must all return the same user projection.
 *
 * Round 1: the refresh handler built its own four-field object literal
 * (`id`, `email`, `role`, `tenantRole`) while login's `issueTokens()` built a
 * nine-field one including `tenantId`, `firstName` and `lastName`. `useAuth()`
 * sources the client's entire user object from the refresh endpoint, so
 * `tenantId` silently became `undefined` after the first page reload, window
 * refocus, or 14 minutes of staleness — turning off real-time collaboration
 * for every user (`WorkflowBuilder.tsx` gates it on `!!user?.tenantId`) and
 * replacing the displayed name with "Guest User".
 *
 * Round 2 (this review pass): there was a *third* endpoint,
 * `POST /api/auth/google` (`server/googleAuth.ts`), with its own tenth-field
 * literal that included `profileImageUrl` — which login and refresh did not
 * send. `Header.tsx`/`Sidebar.tsx` render an `<img>` when `profileImageUrl` is
 * present, so a Google user's avatar showed right after sign-in and then
 * vanished on the first reload — the identical bug as `tenantId`, just for a
 * different field, because two-of-three endpoints agreeing was never the fix.
 * All three now build from one `buildAuthUserPayload` helper.
 *
 * These tests hit the real route handlers (mocking only the repositories and
 * services underneath) so they exercise the actual `res.json(...)` shape,
 * not a hand-summarized description of it.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findByEmailMock, findByIdMock, findByUserIdMock, upsertMock } = vi.hoisted(() => ({
  findByEmailMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByUserIdMock: vi.fn(),
  upsertMock: vi.fn(),
}));

const {
  createTokenMock,
  createRefreshTokenMock,
  comparePasswordMock,
  rotateRefreshTokenMock,
} = vi.hoisted(() => ({
  createTokenMock: vi.fn(() => 'mock-access-token'),
  createRefreshTokenMock: vi.fn(async () => 'mock-new-refresh-token'),
  comparePasswordMock: vi.fn(async () => true),
  rotateRefreshTokenMock: vi.fn(),
}));

// googleAuth.ts's upsertUser() dynamically imports './db' and calls
// getDb().select().from(tenants).limit(1) to find a default tenant. Give it
// one row so upsertUser doesn't try to create a tenant of its own.
const getDbMock = vi.hoisted(() =>
  vi.fn(() => ({
    select: () => ({
      from: () => ({
        limit: async () => [{ id: 'tenant-123' }],
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: 'tenant-123' }],
      }),
    }),
  }))
);

vi.mock('../../../server/repositories', () => ({
  userRepository: {
    findByEmail: findByEmailMock,
    findById: findByIdMock,
    upsert: upsertMock,
  },
  userCredentialsRepository: {
    findByUserId: findByUserIdMock,
  },
}));

vi.mock('../../../server/services/AuthService', () => ({
  authService: {
    createToken: createTokenMock,
    createRefreshToken: createRefreshTokenMock,
    comparePassword: comparePasswordMock,
    rotateRefreshToken: rotateRefreshTokenMock,
  },
}));

vi.mock('../../../server/services/AccountLockoutService', () => ({
  accountLockoutService: {
    getGlobalFailedAttempts: vi.fn(async () => 0),
    isAccountLocked: vi.fn(async () => ({ locked: false })),
    recordAttempt: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../server/services/AuditLogService', () => ({
  auditLogService: {
    logLoginAttempt: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../server/services/MetricsService', () => ({
  metricsService: {
    recordAuthLatency: vi.fn(),
    recordLoginAttempt: vi.fn(),
    recordSessionOperation: vi.fn(),
    recordMfaEvent: vi.fn(),
  },
}));

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      tenants: { findFirst: vi.fn(async () => undefined) },
      trustedDevices: { findFirst: vi.fn(async () => undefined) },
      refreshTokens: { findFirst: vi.fn(async () => undefined), findMany: vi.fn(async () => []) },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    // RLS-4 precondition 2: googleAuth.ts's upsertUser now pins the tenant
    // it's assigning via withTenantAsUser (migration 0028's shape), which
    // opens a real db.transaction and calls tx.execute() twice (the tenant
    // GUC, then the self-id GUC) before userRepository.upsert (mocked
    // separately below) ever runs — the fake tx needs execute() to exist,
    // not just be present.
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: vi.fn(async () => undefined) })),
  },
  getDb: getDbMock,
}));

vi.mock('../../../server/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { registerAuthRoutes } from '../../../server/routes/auth.routes';
import { setupAuth, _testOnly_setGoogleClient } from '../../../server/googleAuth';

const MOCK_USER = {
  id: 'user-1',
  email: 'auth-user@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  profileImageUrl: 'https://example.com/avatar.png',
  tenantId: 'tenant-123',
  role: 'creator',
  tenantRole: 'member',
  emailVerified: true,
  mfaEnabled: false,
  isActive: true,
  authProvider: 'local',
};

describe('User payload parity across login, refresh, and Google auth (MAP-10)', () => {
  let app: Express;
  // `google-auth-library`'s OAuth2Client is not designed to be mocked — its
  // real `verifyIdToken` returns a `LoginTicket` with internal getters we have
  // no reason to fake. `tests/integration/auth/oauth2.google.test.ts` (the
  // house pattern for this exact SDK) types its test double the same way, and
  // `no-explicit-any` is already off for `tests/**/*` in .eslintrc.json.
  let mockGoogleClient: any;

  beforeEach(async () => {
    findByEmailMock.mockReset().mockResolvedValue(MOCK_USER);
    findByIdMock.mockReset().mockResolvedValue(MOCK_USER);
    findByUserIdMock.mockReset().mockResolvedValue({ passwordHash: 'hashed' });
    upsertMock.mockReset().mockResolvedValue(undefined);
    createTokenMock.mockClear();
    createRefreshTokenMock.mockClear();
    comparePasswordMock.mockReset().mockResolvedValue(true);
    rotateRefreshTokenMock.mockReset().mockResolvedValue({
      userId: MOCK_USER.id,
      newRefreshToken: 'rotated-refresh-token',
    });

    app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    await setupAuth(app);

    mockGoogleClient = {
      verifyIdToken: vi.fn(async () => ({
        getPayload: () => ({
          sub: MOCK_USER.id,
          email: MOCK_USER.email,
          email_verified: true,
          given_name: MOCK_USER.firstName,
          family_name: MOCK_USER.lastName,
          picture: MOCK_USER.profileImageUrl,
          aud: 'test-client-id',
          iss: 'https://accounts.google.com',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
        }),
      })),
    };
    _testOnly_setGoogleClient(mockGoogleClient);
  });

  afterEach(() => {
    _testOnly_setGoogleClient(null);
  });

  function login() {
    return request(app)
      .post('/api/auth/login')
      .send({ email: MOCK_USER.email, password: 'CorrectHorseBattery1!' });
  }

  function refresh() {
    return request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', ['refresh_token=old-refresh-token']);
  }

  function google() {
    return request(app)
      .post('/api/auth/google')
      .set('Origin', 'http://localhost')
      .send({ token: 'mock-google-id-token' });
  }

  it('returns the same tenantId as the login response — the AC4 regression case', async () => {
    const refreshRes = await refresh();

    expect(refreshRes.status).toBe(200);
    // This is the exact assertion that fails against today's four-field
    // payload (`{ id, email, role, tenantRole }`, no `tenantId`) — confirmed
    // red before the fix (see MAP-10 turn-in report).
    expect(refreshRes.body.user.tenantId).toBe(MOCK_USER.tenantId);
  });

  it('returns firstName and lastName, not just the four legacy fields', async () => {
    const refreshRes = await refresh();

    expect(refreshRes.body.user.firstName).toBe(MOCK_USER.firstName);
    expect(refreshRes.body.user.lastName).toBe(MOCK_USER.lastName);
  });

  it('produces the exact same user key set across all three endpoints, so none can drift again (AC5)', async () => {
    const loginRes = await login();
    const refreshRes = await refresh();
    const googleRes = await google();

    expect(loginRes.status).toBe(200);
    expect(refreshRes.status).toBe(200);
    expect(googleRes.status).toBe(200);

    const loginKeys = Object.keys(loginRes.body.user as Record<string, unknown>).sort();
    const refreshKeys = Object.keys(refreshRes.body.user as Record<string, unknown>).sort();
    const googleKeys = Object.keys(googleRes.body.user as Record<string, unknown>).sort();

    // Sanity check: prove the fixture actually distinguishes something,
    // rather than three empty objects trivially matching.
    expect(loginKeys.length).toBeGreaterThan(0);
    expect(loginKeys).toContain('tenantId');
    expect(loginKeys).toContain('profileImageUrl');

    // This is the assertion that fails against the Google endpoint's own
    // ten-field literal (it omits emailVerified and mfaEnabled, which login
    // and refresh both send) — confirmed red before this round's fix.
    expect(refreshKeys).toEqual(loginKeys);
    expect(googleKeys).toEqual(loginKeys);
  });

  it('login response carries the full ten-field projection', async () => {
    const loginRes = await login();

    expect(loginRes.body.user).toEqual({
      id: MOCK_USER.id,
      email: MOCK_USER.email,
      firstName: MOCK_USER.firstName,
      lastName: MOCK_USER.lastName,
      profileImageUrl: MOCK_USER.profileImageUrl,
      tenantId: MOCK_USER.tenantId,
      role: MOCK_USER.role,
      tenantRole: MOCK_USER.tenantRole,
      emailVerified: MOCK_USER.emailVerified,
      mfaEnabled: MOCK_USER.mfaEnabled,
    });
  });

  it('profileImageUrl survives a refresh — the Google-avatar regression', async () => {
    // This is the user-visible bug the reviewer caught: a Google user's
    // avatar rendered right after sign-in (their own endpoint sent
    // profileImageUrl) and then vanished on the very next reload, because
    // refresh-token never sent that field even after AC1's tenantId fix.
    const refreshRes = await refresh();

    expect(refreshRes.body.user.profileImageUrl).toBe(MOCK_USER.profileImageUrl);
  });

  it('Google auth response also carries profileImageUrl', async () => {
    const googleRes = await google();

    expect(googleRes.status).toBe(200);
    expect(googleRes.body.user.profileImageUrl).toBe(MOCK_USER.profileImageUrl);
  });
});

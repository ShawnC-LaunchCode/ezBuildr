/**
 * Shared Authentication Mocks for Tests
 * Provides reusable mock objects for authentication testing
 */

import { vi } from 'vitest';

import type { Request, Response, NextFunction } from 'express';

export interface MockSession {
  userId: string;
  email: string;
  tenantId: string;
  sessionId: string;
  cookie?: {
    originalMaxAge?: number;
    expires?: Date;
    secure?: boolean;
    httpOnly?: boolean;
    domain?: string;
    path?: string;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
  save?: (callback?: (err?: any) => void) => void;
  regenerate?: (callback: (err?: any) => void) => void;
  destroy?: (callback: (err?: any) => void) => void;
  reload?: (callback: (err?: any) => void) => void;
  touch?: () => void;
}

export interface MockUser {
  id: string;
  email: string;
  name?: string;
  tenantId?: string;
  role?: string;
}

export const createMockSession = (overrides: Partial<MockSession> = {}): MockSession => {
  const session: MockSession = {
    userId: 'test-user-id',
    email: 'test@example.com',
    tenantId: 'test-tenant',
    sessionId: 'test-session-id',
    cookie: {
      originalMaxAge: 86400000,
      expires: new Date(Date.now() + 86400000),
      secure: false,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    },
    save: vi.fn((cb) => cb?.()),
    regenerate: vi.fn((cb) => cb()),
    destroy: vi.fn((cb) => cb()),
    reload: vi.fn((cb) => cb()),
    touch: vi.fn(),
    ...overrides,
  };

  return session;
};

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  tenantId: 'test-tenant',
  role: 'user',
  ...overrides,
});

export const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => {
  const session = createMockSession();
  const user = createMockUser();

  return {
    session: session as any,
    user: user as any,
    headers: {},
    cookies: {},
    body: {},
    query: {},
    params: {},
    method: 'GET',
    url: '/',
    path: '/',
    ...overrides,
  };
};

export const createMockResponse = (): Partial<Response> => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    locals: {},
  };

  return res;
};

export const createMockNext = (): NextFunction => {
  return vi.fn() as any;
};

/**
 * Creates a mock authentication middleware that always succeeds
 */
export const createMockAuthMiddleware = () => {
  return {
    requireAuth: vi.fn((req: any, res: any, next: any) => {
      req.session = req.session || createMockSession();
      req.user = req.user || createMockUser();
      next();
    }),
    optionalAuth: vi.fn((req: any, res: any, next: any) => {
      req.session = req.session || createMockSession();
      req.user = req.user || createMockUser();
      next();
    }),
    getSession: vi.fn(() => createMockSession()),
  };
};

/**
 * Creates mock for express-session middleware
 */
export const createMockSessionMiddleware = () => {
  return vi.fn((req: any, res: any, next: any) => {
    req.session = req.session || createMockSession();
    req.sessionID = req.sessionID || 'test-session-id';
    next();
  });
};

/**
 * Helper to create an authenticated test request
 */
export const createAuthenticatedRequest = (userOverrides: Partial<MockUser> = {}) => {
  const user = createMockUser(userOverrides);
  const session = createMockSession({
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId || 'test-tenant',
  });

  return {
    user,
    session,
    cookies: [`connect.sid=test-session-id`],
    token: `Bearer test-token-${user.id}`,
  };
};

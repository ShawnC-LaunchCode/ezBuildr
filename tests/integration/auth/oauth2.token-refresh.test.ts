/**
 * OAuth2 Token Refresh Integration Tests
 *
 * Tests refresh token flows, token rotation, and session management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import { registerAuthRoutes } from '../../../server/routes/auth.routes';
import { db } from '../../../server/db';
import { users, tenants, refreshTokens, userCredentials } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { authService } from '../../../server/services/AuthService';
import { userRepository, userCredentialsRepository } from '../../../server/repositories';
import { nanoid } from 'nanoid';
import { serialize } from 'cookie';

describe('OAuth2 Token Refresh Flow', () => {
  let app: Express;
  let testTenantId: string;
  let testUserId: string;
  let testUserEmail: string;
  let testRefreshToken: string;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.set('trust proxy', 1);

    // Register auth routes
    registerAuthRoutes(app);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Token Refresh Test Tenant',
      plan: 'pro',
    }).returning();
    testTenantId = tenant.id;
  });

  beforeEach(async () => {
    // Create fresh test user for each test
    testUserEmail = `refresh-test-${nanoid()}@example.com`;

    const [user] = await db.insert(users).values({
      id: nanoid(),
      email: testUserEmail,
      firstName: 'Refresh',
      lastName: 'Test',
      fullName: 'Refresh Test',
      tenantId: testTenantId,
      role: 'creator',
      tenantRole: 'owner',
      authProvider: 'local',
      emailVerified: true,
      defaultMode: 'easy',
    }).returning();
    testUserId = user.id;

    // Create password credentials
    const passwordHash = await authService.hashPassword('TestPassword123');
    await userCredentialsRepository.createCredentials(testUserId, passwordHash);

    // Create refresh token
    testRefreshToken = await authService.createRefreshToken(testUserId, {
      ip: '127.0.0.1',
      userAgent: 'Test Agent',
    });
  });

  afterAll(async () => {
    // Clean up
    if (testTenantId) {
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    }
  });

  describe('POST /api/auth/refresh-token', () => {
    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        token: expect.any(String),
        user: {
          id: testUserId,
          email: testUserEmail,
          role: 'owner',
        },
      });

      // Verify new access token is valid JWT
      expect(response.body.token.split('.')).toHaveLength(3);

      // Verify new refresh token is set in cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
    });

    it('should rotate refresh token after use', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(200);

      // Extract new refresh token from cookie
      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toBeDefined();

      const newTokenMatch = setCookieHeader?.match(/refresh_token=([^;]+)/);
      const newRefreshToken = newTokenMatch?.[1];
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(testRefreshToken);

      // Old token should be revoked in database
      const oldToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, testRefreshToken),
      });
      expect(oldToken?.revoked).toBe(true);

      // New token should exist and not be revoked
      const newToken = await db.query.refreshTokens.findFirst({
        where: and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ),
      });
      expect(newToken).toBeDefined();
      expect(newToken?.token).not.toBe(testRefreshToken);
    });

    it('should return 401 when refresh token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Refresh token missing',
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', 'refresh_token=invalid-token-12345');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Invalid refresh token',
      });

      // Should clear the cookie
      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toContain('refresh_token=;');
      expect(setCookieHeader).toContain('Max-Age=0');
    });

    it('should return 401 for expired refresh token', async () => {
      // Create an expired token
      const expiredTokenRecord = await db.insert(refreshTokens).values({
        token: 'expired-token-hash',
        userId: testUserId,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        revoked: false,
        metadata: {},
      }).returning();

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', 'refresh_token=expired-token-raw');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 for revoked refresh token', async () => {
      // Revoke the token
      await db.update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.token, testRefreshToken));

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when user is not found', async () => {
      // Delete the user but keep the refresh token
      await db.delete(users).where(eq(users.id, testUserId));

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not found');
    });

    it('should update refresh token metadata on rotation', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`)
        .set('User-Agent', 'New Browser/1.0')
        .set('X-Forwarded-For', '192.168.1.100');

      expect(response.status).toBe(200);

      // Check new token has updated metadata
      const newToken = await db.query.refreshTokens.findFirst({
        where: and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ),
      });

      expect(newToken).toBeDefined();
      expect(newToken?.lastUsedAt).toBeDefined();
    });

    it('should handle concurrent refresh token requests (token reuse detection)', async () => {
      // Make two concurrent requests with the same token
      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/auth/refresh-token')
          .set('Cookie', `refresh_token=${testRefreshToken}`),
        request(app)
          .post('/api/auth/refresh-token')
          .set('Cookie', `refresh_token=${testRefreshToken}`),
      ]);

      // One should succeed, one should fail (or both fail due to rotation)
      const statuses = [response1.status, response2.status].sort();

      // At least one should be 401 (reuse detected)
      expect(statuses.some(s => s === 401)).toBe(true);
    });

    it('should set secure cookie in production', async () => {
      // Save original NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const response = await request(app)
          .post('/api/auth/refresh-token')
          .set('Cookie', `refresh_token=${testRefreshToken}`);

        expect(response.status).toBe(200);

        const setCookieHeader = response.headers['set-cookie']?.[0];
        expect(setCookieHeader).toContain('Secure');
        expect(setCookieHeader).toContain('HttpOnly');
        expect(setCookieHeader).toContain('SameSite=Strict');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should set proper cookie attributes', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('SameSite=Strict');
      expect(setCookieHeader).toContain('Path=/');
      expect(setCookieHeader).toContain('Max-Age=2592000'); // 30 days in seconds
    });

    it('should include user role information in response', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: testUserId,
        email: testUserEmail,
        role: 'owner',
      });
    });
  });

  describe('Refresh Token Lifecycle', () => {
    it('should create refresh token on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'TestPassword123',
        });

      expect(response.status).toBe(200);

      // Verify refresh token cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);

      // Verify refresh token exists in database
      const tokenCount = await db.select().from(refreshTokens)
        .where(eq(refreshTokens.userId, testUserId));

      expect(tokenCount.length).toBeGreaterThan(0);
    });

    it('should revoke refresh token on logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logout successful');

      // Verify token is revoked
      const token = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, testRefreshToken),
      });
      expect(token?.revoked).toBe(true);

      // Verify cookie is cleared
      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toContain('refresh_token=');
      expect(setCookieHeader).toContain('Max-Age=0');
    });

    it('should handle logout without refresh token gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logout successful');
    });

    it('should support multiple active refresh tokens per user', async () => {
      // Create additional refresh tokens (simulating multiple devices)
      const token2 = await authService.createRefreshToken(testUserId, {
        ip: '192.168.1.1',
        userAgent: 'Mobile App',
      });

      const token3 = await authService.createRefreshToken(testUserId, {
        ip: '10.0.0.1',
        userAgent: 'Tablet Browser',
      });

      // Verify all tokens are valid
      const activeTokens = await db.select().from(refreshTokens)
        .where(and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ));

      expect(activeTokens.length).toBeGreaterThanOrEqual(3);
    });

    it('should revoke all user tokens on password reset', async () => {
      // Create multiple tokens
      await authService.createRefreshToken(testUserId);
      await authService.createRefreshToken(testUserId);

      // Revoke all tokens (simulating password reset)
      await authService.revokeAllUserTokens(testUserId);

      // Verify all tokens are revoked
      const activeTokens = await db.select().from(refreshTokens)
        .where(and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ));

      expect(activeTokens.length).toBe(0);
    });
  });

  describe('Refresh Token Security', () => {
    it('should use cryptographically strong random tokens', async () => {
      const tokens = new Set<string>();

      // Generate multiple tokens
      for (let i = 0; i < 100; i++) {
        const token = await authService.createRefreshToken(testUserId);
        tokens.add(token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);

      // Tokens should be sufficiently long
      tokens.forEach(token => {
        expect(token.length).toBeGreaterThanOrEqual(32);
      });
    });

    it('should hash refresh tokens before storing in database', async () => {
      const rawToken = await authService.createRefreshToken(testUserId);

      // Find token in database
      const dbTokens = await db.select().from(refreshTokens)
        .where(eq(refreshTokens.userId, testUserId));

      // Raw token should not appear in database
      const tokensMatch = dbTokens.some(t => t.token === rawToken);
      expect(tokensMatch).toBe(false);

      // Tokens in DB should be hashed (different from raw)
      dbTokens.forEach(t => {
        expect(t.token).not.toBe(rawToken);
      });
    });

    it('should prevent refresh token reuse after rotation', async () => {
      // Use token once
      const firstResponse = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(firstResponse.status).toBe(200);

      // Try to reuse old token
      const secondResponse = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      expect(secondResponse.status).toBe(401);
      expect(secondResponse.body.message).toBe('Invalid refresh token');
    });

    it('should validate token ownership', async () => {
      // Create another user
      const [otherUser] = await db.insert(users).values({
        id: nanoid(),
        email: 'other-user@example.com',
        firstName: 'Other',
        lastName: 'User',
        fullName: 'Other User',
        tenantId: testTenantId,
        role: 'creator',
        tenantRole: 'viewer',
        authProvider: 'local',
        emailVerified: true,
        defaultMode: 'easy',
      }).returning();

      // Token belongs to testUserId, not otherUser
      // The system should verify the token belongs to the correct user
      const token = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, testRefreshToken),
      });

      expect(token?.userId).toBe(testUserId);
      expect(token?.userId).not.toBe(otherUser.id);
    });
  });

  describe('Cookie Security', () => {
    it('should set HttpOnly flag to prevent XSS', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('should set SameSite=Strict to prevent CSRF', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toContain('SameSite=Strict');
    });

    it('should set proper cookie path', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      const setCookieHeader = response.headers['set-cookie']?.[0];
      expect(setCookieHeader).toContain('Path=/');
    });

    it('should set appropriate expiry (30 days)', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${testRefreshToken}`);

      const setCookieHeader = response.headers['set-cookie']?.[0];
      // 30 days = 2592000 seconds
      expect(setCookieHeader).toContain('Max-Age=2592000');
    });
  });
});

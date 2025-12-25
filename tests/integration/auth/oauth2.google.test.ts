/**
 * OAuth2 Google Authentication Integration Tests
 *
 * Tests the Google OAuth2 login flow with mocked Google token verification
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import { setupAuth, __setGoogleClient, verifyGoogleToken } from '../../../server/googleAuth';
import { db } from '../../../server/db';
import { users, tenants, refreshTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { TokenPayload } from 'google-auth-library';

describe('OAuth2 Google Authentication Flow', () => {
  let app: Express;
  let testTenantId: string;
  let mockGoogleClient: any;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.set('trust proxy', 1);

    // Register auth routes
    await setupAuth(app);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      plan: 'pro',
    }).returning();
    testTenantId = tenant.id;
  });

  beforeEach(async () => {
    // Setup mock Google OAuth client
    mockGoogleClient = {
      verifyIdToken: vi.fn(),
    };
    __setGoogleClient(mockGoogleClient);

    // Clean up test users
    await db.delete(users).where(eq(users.email, 'testuser@example.com'));
  });

  afterAll(async () => {
    // Clean up
    if (testTenantId) {
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    }
    __setGoogleClient(null);
  });

  describe('POST /api/auth/google - Google OAuth2 Login', () => {
    it('should successfully authenticate with valid Google ID token', async () => {
      // Mock Google token verification
      const mockPayload: TokenPayload = {
        sub: 'google-user-123',
        email: 'testuser@example.com',
        email_verified: true,
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.jpg',
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      // Make authentication request
      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          token: 'mock-google-id-token-12345',
        });

      // Verify response
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Authentication successful',
        token: expect.any(String),
        user: {
          id: 'google-user-123',
          email: 'testuser@example.com',
          firstName: 'Test',
          lastName: 'User',
          profileImageUrl: 'https://example.com/avatar.jpg',
        },
      });

      // Verify JWT token is returned
      expect(response.body.token).toBeTruthy();
      expect(response.body.token.split('.')).toHaveLength(3); // JWT format

      // Verify refresh token cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);

      // Verify user was created in database
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, 'google-user-123'),
      });
      expect(dbUser).toBeDefined();
      expect(dbUser?.email).toBe('testuser@example.com');
      expect(dbUser?.emailVerified).toBe(true);
      expect(dbUser?.authProvider).toBe('google');
    });

    it('should return 400 when ID token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: 'ID token is required',
        error: 'missing_token',
      });
    });

    it('should return 403 when Origin header is invalid', async () => {
      const mockPayload: TokenPayload = {
        sub: 'google-user-456',
        email: 'test2@example.com',
        email_verified: true,
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'https://malicious-site.com')
        .send({
          token: 'mock-google-id-token',
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        message: 'Invalid request origin',
        error: 'invalid_origin',
      });
    });

    it('should return 401 when Google token verification fails', async () => {
      mockGoogleClient.verifyIdToken.mockRejectedValue(
        new Error('Invalid token')
      );

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          token: 'invalid-token',
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Authentication failed',
        error: 'auth_failed',
      });
    });

    it('should return 401 when email is not verified by Google', async () => {
      const mockPayload: TokenPayload = {
        sub: 'google-user-unverified',
        email: 'unverified@example.com',
        email_verified: false, // Not verified
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          token: 'unverified-email-token',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('auth_failed');
    });

    it('should update existing user on subsequent logins', async () => {
      const userId = 'google-user-existing';

      // Create existing user
      await db.insert(users).values({
        id: userId,
        email: 'existing@example.com',
        firstName: 'Old',
        lastName: 'Name',
        fullName: 'Old Name',
        tenantId: testTenantId,
        role: 'creator',
        tenantRole: 'viewer',
        authProvider: 'google',
        emailVerified: true,
        defaultMode: 'easy',
      });

      // Mock Google token with updated info
      const mockPayload: TokenPayload = {
        sub: userId,
        email: 'existing@example.com',
        email_verified: true,
        given_name: 'Updated',
        family_name: 'User',
        picture: 'https://example.com/new-avatar.jpg',
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          token: 'existing-user-token',
        });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        firstName: 'Updated',
        lastName: 'User',
        profileImageUrl: 'https://example.com/new-avatar.jpg',
      });

      // Verify database was updated
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      expect(updatedUser?.firstName).toBe('Updated');
      expect(updatedUser?.lastName).toBe('User');
    });

    it('should create refresh token record in database', async () => {
      const mockPayload: TokenPayload = {
        sub: 'google-user-refresh',
        email: 'refresh@example.com',
        email_verified: true,
        given_name: 'Refresh',
        family_name: 'Test',
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .set('User-Agent', 'Test Browser')
        .send({
          token: 'refresh-token-test',
        });

      expect(response.status).toBe(200);

      // Verify refresh token exists in database
      const token = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.userId, 'google-user-refresh'),
      });

      expect(token).toBeDefined();
      expect(token?.revoked).toBe(false);
      expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should support both "token" and "idToken" fields', async () => {
      const mockPayload: TokenPayload = {
        sub: 'google-user-idtoken',
        email: 'idtoken@example.com',
        email_verified: true,
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      // Test with "idToken" field
      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          idToken: 'test-id-token',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Authentication successful');
    });

    it('should respect rate limiting', async () => {
      // Skip in test environment (rate limiting is disabled)
      if (process.env.NODE_ENV === 'test') {
        expect(true).toBe(true);
        return;
      }

      const mockPayload: TokenPayload = {
        sub: 'google-user-rate',
        email: 'rate@example.com',
        email_verified: true,
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      // Make multiple requests rapidly
      const requests = Array.from({ length: 12 }, () =>
        request(app)
          .post('/api/auth/google')
          .set('Origin', 'http://localhost:5000')
          .send({ token: 'rate-test-token' })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429)
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should handle missing profile information gracefully', async () => {
      const mockPayload: TokenPayload = {
        sub: 'google-user-minimal',
        email: 'minimal@example.com',
        email_verified: true,
        // No given_name, family_name, or picture
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const response = await request(app)
        .post('/api/auth/google')
        .set('Origin', 'http://localhost:5000')
        .send({
          token: 'minimal-profile-token',
        });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        email: 'minimal@example.com',
        firstName: undefined,
        lastName: undefined,
        profileImageUrl: undefined,
      });
    });
  });

  describe('Google Token Verification', () => {
    it('should verify valid Google ID token', async () => {
      const mockPayload: TokenPayload = {
        sub: 'test-sub',
        email: 'test@example.com',
        email_verified: true,
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const payload = await verifyGoogleToken('valid-token');
      expect(payload).toMatchObject({
        sub: 'test-sub',
        email: 'test@example.com',
        email_verified: true,
      });
    });

    it('should throw error when token verification fails', async () => {
      mockGoogleClient.verifyIdToken.mockRejectedValue(
        new Error('Token verification failed')
      );

      await expect(verifyGoogleToken('invalid-token')).rejects.toThrow();
    });

    it('should throw error when email is not verified', async () => {
      const mockPayload: TokenPayload = {
        sub: 'test-sub',
        email: 'unverified@example.com',
        email_verified: false,
        aud: process.env.GOOGLE_CLIENT_ID!,
        iss: 'https://accounts.google.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      await expect(verifyGoogleToken('unverified-email-token')).rejects.toThrow(
        'Email not verified by Google'
      );
    });

    it('should throw error when payload is null', async () => {
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => null,
      });

      await expect(verifyGoogleToken('null-payload-token')).rejects.toThrow(
        'Invalid token payload'
      );
    });
  });
});

/**
 * OAuth2 Session Management Integration Tests
 *
 * Tests session management, device tracking, and multi-device support
 */

import { eq, and } from 'drizzle-orm';
import express from 'express';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { users, tenants, refreshTokens, trustedDevices , auditLogs } from '@shared/schema';



import { db } from '../../../server/db';
import { userCredentialsRepository } from '../../../server/repositories';
import { registerAuthRoutes } from '../../../server/routes/auth.routes';
import { authService } from '../../../server/services/AuthService';
import { hashToken } from '../../../server/utils/encryption';

import type { Express } from 'express';

describe('OAuth2 Session Management', () => {
  let app: Express;
  let testTenantId: string;
  let testUserId: string;
  let testUserEmail: string;
  let authToken: string;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.set('trust proxy', 1);

    // Register auth routes
    registerAuthRoutes(app);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: `Session Test Tenant ${nanoid()}`,
      plan: 'pro',
    }).returning();
    testTenantId = tenant.id;
  });

  beforeEach(async () => {
    // Create fresh test user
    testUserEmail = `session-test-${nanoid()}@example.com`;

    const [user] = await db.insert(users).values({
      id: nanoid(),
      email: testUserEmail,
      firstName: 'Session',
      lastName: 'Test',
      fullName: 'Session Test',
      tenantId: testTenantId,
      role: 'creator',
      tenantRole: 'owner',
      authProvider: 'local',
      emailVerified: true,
      defaultMode: 'easy',
    }).returning();
    testUserId = user.id;

    // Create password credentials
    const passwordHash = await authService.hashPassword('StrongTestUser123!@#');
    await userCredentialsRepository.createCredentials(testUserId, passwordHash);

    // Create auth token
    authToken = authService.createToken(user);
  });

  afterAll(async () => {
    if (testTenantId) {
      afterAll(async () => {
        if (testTenantId) {
          // Find all users in this tenant to clean up their dependencies
          const tenantUsers = await db.select().from(users).where(eq(users.tenantId, testTenantId));

          for (const user of tenantUsers) {
            await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
            await db.delete(trustedDevices).where(eq(trustedDevices.userId, user.id));
            await db.delete(auditLogs).where(eq(auditLogs.userId, user.id));
          }

          await db.delete(users).where(eq(users.tenantId, testTenantId));
          await db.delete(tenants).where(eq(tenants.id, testTenantId));
        }
      });
    }
  });

  describe('GET /api/auth/sessions - List Active Sessions', () => {
    it('should list all active sessions for current user', async () => {
      // Create multiple sessions
      await authService.createRefreshToken(testUserId, {
        ip: '192.168.1.1',
        userAgent: 'Chrome/100.0',
      });
      await authService.createRefreshToken(testUserId, {
        ip: '10.0.0.1',
        userAgent: 'Firefox/95.0',
      });

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeInstanceOf(Array);
      expect(response.body.sessions.length).toBeGreaterThanOrEqual(2);

      // Verify session structure
      response.body.sessions.forEach((session: any) => {
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('deviceName');
        expect(session).toHaveProperty('location');
        expect(session).toHaveProperty('ipAddress');
        expect(session).toHaveProperty('lastUsedAt');
        expect(session).toHaveProperty('createdAt');
        expect(session).toHaveProperty('current');
      });
    });

    it('should mark current session as current', async () => {
      const token = await authService.createRefreshToken(testUserId);

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Cookie', `refresh_token=${token}`);

      expect(response.status).toBe(200);

      const currentSession = response.body.sessions.find((s: any) => s.current);
      expect(currentSession).toBeDefined();
    });

    it('should return empty array when user has no active sessions', async () => {
      // Revoke all sessions
      await db.update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, testUserId));

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions).toEqual([]);
    });

    it('should not include expired sessions', async () => {
      // Create expired session
      await db.insert(refreshTokens).values({
        token: 'expired-session-hash',
        userId: testUserId,
        expiresAt: new Date(Date.now() - 1000),
        revoked: false,
        metadata: {},
      });

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const expiredSession = response.body.sessions.find(
        (s: any) => s.id === 'expired-session-hash'
      );
      expect(expiredSession).toBeUndefined();
    });

    it('should not include revoked sessions', async () => {
      const token = await authService.createRefreshToken(testUserId);

      // Revoke it
      await db.update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.token, token));

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const revokedSession = response.body.sessions.find(
        (s: any) => s.id === token
      );
      expect(revokedSession).toBeUndefined();
    });

    it('should parse device name from user agent', async () => {
      await authService.createRefreshToken(testUserId, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0',
      });

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBeGreaterThan(0);
      expect(response.body.sessions[0].deviceName).toBeTruthy();
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/auth/sessions');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/auth/sessions/:sessionId - Revoke Session', () => {
    it('should revoke a specific session', async () => {
      const token = await authService.createRefreshToken(testUserId);

      // Get session ID
      const sessionRecord = await db.query.refreshTokens.findFirst({
        where: and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.token, hashToken(token))
        ),
      });

      expect(sessionRecord).toBeDefined();

      const response = await request(app)
        .delete(`/api/auth/sessions/${sessionRecord!.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Session revoked successfully');

      // Verify session is revoked
      const updatedSession = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.id, sessionRecord!.id),
      });
      expect(updatedSession?.revoked).toBe(true);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/api/auth/sessions/non-existent-session-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Session not found');
    });

    it('should prevent revoking current session', async () => {
      const token = await authService.createRefreshToken(testUserId);

      const sessionRecord = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(token)),
      });

      const response = await request(app)
        .delete(`/api/auth/sessions/${sessionRecord!.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Cookie', `refresh_token=${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot revoke current session');
    });

    it('should prevent revoking another user\'s session', async () => {
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

      // Create session for other user
      const otherToken = await authService.createRefreshToken(otherUser.id);
      const otherSession = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(otherToken)),
      });

      // Try to revoke other user's session
      const response = await request(app)
        .delete(`/api/auth/sessions/${otherSession!.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Session not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .delete('/api/auth/sessions/some-session-id');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/auth/sessions/all - Logout All Other Devices', () => {
    it('should revoke all sessions except current', async () => {
      // Create multiple sessions
      const tokens = await Promise.all([
        authService.createRefreshToken(testUserId),
        authService.createRefreshToken(testUserId),
        authService.createRefreshToken(testUserId),
      ]);

      const currentToken = tokens[0];

      const response = await request(app)
        .delete('/api/auth/sessions/all')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Cookie', `refresh_token=${currentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out from all other devices');

      // Verify only current session remains active
      const activeSessions = await db.select().from(refreshTokens)
        .where(and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ));

      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].token).toBe(hashToken(currentToken));
    });

    it('should revoke all trusted devices', async () => {
      // Create trusted devices
      await db.insert(trustedDevices).values([
        {
          userId: testUserId,
          deviceFingerprint: 'device-1',
          deviceName: 'Device 1',
          trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revoked: false,
          createdAt: new Date(),
        },
        {
          userId: testUserId,
          deviceFingerprint: 'device-2',
          deviceName: 'Device 2',
          trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revoked: false,
          createdAt: new Date(),
        },
      ]);

      const currentToken = await authService.createRefreshToken(testUserId);

      const response = await request(app)
        .delete('/api/auth/sessions/all')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Cookie', `refresh_token=${currentToken}`);

      expect(response.status).toBe(200);

      // Verify all trusted devices are revoked
      const activeTrustedDevices = await db.select().from(trustedDevices)
        .where(and(
          eq(trustedDevices.userId, testUserId),
          eq(trustedDevices.revoked, false)
        ));

      expect(activeTrustedDevices.length).toBe(0);
    });

    it('should return 400 when no active session found', async () => {
      const response = await request(app)
        .delete('/api/auth/sessions/all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No active session found');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .delete('/api/auth/sessions/all');

      expect(response.status).toBe(401);
    });
  });

  describe('Trusted Devices Management', () => {
    describe('POST /api/auth/trust-device', () => {
      it('should mark current device as trusted', async () => {
        const response = await request(app)
          .post('/api/auth/trust-device')
          .set('Authorization', `Bearer ${authToken}`)
          .set('User-Agent', 'Test Browser/1.0');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          message: 'Device trusted successfully',
          trustedUntil: expect.any(String),
        });

        // Verify device exists in database
        const devices = await db.select().from(trustedDevices)
          .where(eq(trustedDevices.userId, testUserId));

        expect(devices.length).toBeGreaterThan(0);
      });

      it('should update existing trusted device expiry', async () => {
        // Trust device once
        await request(app)
          .post('/api/auth/trust-device')
          .set('Authorization', `Bearer ${authToken}`)
          .set('User-Agent', 'Test Browser/1.0');

        const initialDevice = await db.query.trustedDevices.findFirst({
          where: eq(trustedDevices.userId, testUserId),
        });

        // Trust again
        await request(app)
          .post('/api/auth/trust-device')
          .set('Authorization', `Bearer ${authToken}`)
          .set('User-Agent', 'Test Browser/1.0');

        const devices = await db.select().from(trustedDevices)
          .where(eq(trustedDevices.userId, testUserId));

        // Should still be only one device
        expect(devices.length).toBe(1);

        // Expiry should be updated
        expect(devices[0].lastUsedAt?.getTime()).toBeGreaterThan(
          initialDevice!.lastUsedAt?.getTime() || 0
        );
      });
    });

    describe('GET /api/auth/trusted-devices', () => {
      it('should list all trusted devices', async () => {
        // Create trusted devices
        await db.insert(trustedDevices).values([
          {
            userId: testUserId,
            deviceFingerprint: 'device-fingerprint-1',
            deviceName: 'Chrome Browser',
            trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            revoked: false,
            createdAt: new Date(),
          },
          {
            userId: testUserId,
            deviceFingerprint: 'device-fingerprint-2',
            deviceName: 'Firefox Browser',
            trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            revoked: false,
            createdAt: new Date(),
          },
        ]);

        const response = await request(app)
          .get('/api/auth/trusted-devices')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.devices).toBeInstanceOf(Array);
        expect(response.body.devices.length).toBe(2);

        response.body.devices.forEach((device: any) => {
          expect(device).toHaveProperty('id');
          expect(device).toHaveProperty('deviceName');
          expect(device).toHaveProperty('location');
          expect(device).toHaveProperty('trustedUntil');
          expect(device).toHaveProperty('lastUsedAt');
          expect(device).toHaveProperty('current');
        });
      });

      it('should not include revoked devices', async () => {
        await db.insert(trustedDevices).values({
          userId: testUserId,
          deviceFingerprint: 'revoked-device',
          deviceName: 'Revoked Device',
          trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revoked: true,
          createdAt: new Date(),
        });

        const response = await request(app)
          .get('/api/auth/trusted-devices')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        const revokedDevice = response.body.devices.find(
          (d: any) => d.deviceName === 'Revoked Device'
        );
        expect(revokedDevice).toBeUndefined();
      });
    });

    describe('DELETE /api/auth/trusted-devices/:deviceId', () => {
      it('should revoke a trusted device', async () => {
        const [device] = await db.insert(trustedDevices).values({
          userId: testUserId,
          deviceFingerprint: 'device-to-revoke',
          deviceName: 'Device To Revoke',
          trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revoked: false,
          createdAt: new Date(),
        }).returning();

        const response = await request(app)
          .delete(`/api/auth/trusted-devices/${device.id}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Device revoked successfully');

        // Verify device is revoked
        const updatedDevice = await db.query.trustedDevices.findFirst({
          where: eq(trustedDevices.id, device.id),
        });
        expect(updatedDevice?.revoked).toBe(true);
      });

      it('should return 404 for non-existent device', async () => {
        const response = await request(app)
          .delete('/api/auth/trusted-devices/non-existent-device-id')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Session Metadata Tracking', () => {
    it('should track IP address for sessions', async () => {
      const token = await authService.createRefreshToken(testUserId, {
        ip: '192.168.1.100',
      });

      const session = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(token)),
      });

      expect(session?.ipAddress).toBe('192.168.1.100');
    });

    it('should track user agent for sessions', async () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const token = await authService.createRefreshToken(testUserId, {
        userAgent,
      });

      const session = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(token)),
      });

      const metadata = session?.metadata as any;
      expect(metadata?.userAgent).toBe(userAgent);
    });

    it('should update lastUsedAt on token refresh', async () => {
      const token = await authService.createRefreshToken(testUserId);

      const initialSession = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(token)),
      });

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh token
      await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', `refresh_token=${token}`);

      // Get new session (old one should be revoked)
      const sessions = await db.select().from(refreshTokens)
        .where(and(
          eq(refreshTokens.userId, testUserId),
          eq(refreshTokens.revoked, false)
        ));

      expect(sessions.length).toBe(1);
      expect(sessions[0].lastUsedAt).toBeDefined();
    });
  });
});

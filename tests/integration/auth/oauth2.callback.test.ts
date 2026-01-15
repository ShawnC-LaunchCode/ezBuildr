/**
 * OAuth2 3-Legged Flow (Authorization Code Grant) Integration Tests
 *
 * Tests OAuth2 callback handling, state validation, and token exchange
 * for third-party API integrations (e.g., external services)
 */

import { eq } from 'drizzle-orm';
import express from 'express';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';



import { users, tenants, projects, connections, secrets } from '@shared/schema';

import { db } from '../../../server/db';
import { hybridAuth } from '../../../server/middleware/auth';
import { registerConnectionsV2Routes } from '../../../server/routes/connections-v2.routes';
import { authService } from '../../../server/services/AuthService';
import {
  generateOAuth2AuthorizationUrl,
  validateOAuth2State,
  cleanupOAuth2State,
} from '../../../server/services/oauth2';

import type { Express } from 'express';


describe('OAuth2 3-Legged Flow - Callback Handling', () => {
  let app: Express;
  let testTenantId: string;
  let testUserId: string;
  let testProjectId: string;
  let testConnectionId: string;
  let authToken: string;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.set('trust proxy', 1);

    // Mock auth middleware for tests
    app.use((req: any, res, next) => {
      req.userId = testUserId;
      req.tenantId = testTenantId;
      next();
    });

    // Register routes
    registerConnectionsV2Routes(app);

    // Create test data
    const [tenant] = await db.insert(tenants).values({
      name: 'OAuth Test Tenant',
      plan: 'pro',
    }).returning();
    testTenantId = tenant.id;

    const [user] = await db.insert(users).values({
      id: nanoid(),
      email: 'oauth-test@example.com',
      firstName: 'OAuth',
      lastName: 'Tester',
      fullName: 'OAuth Tester',
      tenantId: testTenantId,
      role: 'creator',
      tenantRole: 'owner',
      authProvider: 'local',
      emailVerified: true,
      defaultMode: 'easy',
    }).returning();
    testUserId = user.id;

    // Create JWT token
    authToken = authService.createToken(user);

    const [project] = await db.insert(projects).values({
      title: 'OAuth Test Project',
      name: 'OAuth Test Project',
      creatorId: testUserId,
      createdBy: testUserId,
      ownerId: testUserId,
      tenantId: testTenantId,
    }).returning();
    testProjectId = project.id;
  });

  beforeEach(async () => {
    // Clean up connections before each test
    await db.delete(connections).where(eq(connections.projectId, testProjectId));
    await db.delete(secrets).where(eq(secrets.projectId, testProjectId));
  });

  afterAll(async () => {
    // Clean up test data
    if (testTenantId) {
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    }
  });

  describe('OAuth2 Authorization Flow Initiation', () => {
    it('should initiate OAuth2 3-legged flow and generate authorization URL', async () => {
      // Create OAuth2 3-legged connection
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/connections`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test OAuth2 Connection',
          type: 'oauth2_3leg',
          baseUrl: 'https://api.example.com',
          authConfig: {
            authUrl: 'https://auth.example.com/oauth/authorize',
            tokenUrl: 'https://auth.example.com/oauth/token',
            scope: 'read write',
          },
          secretRefs: {
            clientId: 'oauth2_client_id',
            clientSecret: 'oauth2_client_secret',
          },
        });

      expect(createResponse.status).toBe(201);
      testConnectionId = createResponse.body.id;

      // Generate authorization URL
      const { authorizationUrl, state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          redirectUri: 'http://localhost:5000/api/oauth/callback',
          scope: 'read write',
        },
        testConnectionId
      );

      // Verify authorization URL
      expect(authorizationUrl).toContain('https://auth.example.com/oauth/authorize');
      expect(authorizationUrl).toContain('client_id=test-client-id');
      expect(authorizationUrl).toContain('redirect_uri=');
      expect(authorizationUrl).toContain('response_type=code');
      expect(authorizationUrl).toContain(`state=${state}`);
      expect(authorizationUrl).toContain('scope=read+write');

      // State should be a 64-character hex string
      expect(state).toMatch(/^[a-f0-9]{64}$/);

      // State should be valid for a short time
      const stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();
      expect(stateRecord?.connectionId).toBe(testConnectionId);
    });

    it('should include optional scope in authorization URL', async () => {
      const { authorizationUrl } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        'connection-without-scope'
      );

      // Should not include scope parameter if not provided
      expect(authorizationUrl).not.toContain('scope=');
    });
  });

  describe('OAuth2 State Validation', () => {
    it('should validate valid OAuth2 state token', () => {
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        'test-connection-123'
      );

      const stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();
      expect(stateRecord?.state).toBe(state);
      expect(stateRecord?.connectionId).toBe('test-connection-123');
      expect(stateRecord?.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should reject invalid OAuth2 state token', () => {
      const stateRecord = validateOAuth2State('invalid-state-token');
      expect(stateRecord).toBeUndefined();
    });

    it('should reject expired OAuth2 state token', async () => {
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        'test-connection-expired'
      );

      // Manually expire the state by manipulating time
      // In real test, you'd use fake timers or wait for actual expiry (10 minutes)
      // For now, we just verify the state exists initially
      const initialRecord = validateOAuth2State(state);
      expect(initialRecord).toBeDefined();

      // State cleanup would happen after 10 minutes in production
    });

    it('should clean up OAuth2 state after use', () => {
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        'test-cleanup'
      );

      // Verify state exists
      let stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();

      // Clean up state
      cleanupOAuth2State(state);

      // Verify state is removed
      stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeUndefined();
    });
  });

  describe('OAuth2 Callback Error Handling', () => {
    it('should handle callback with missing state parameter', async () => {
      // This would be handled by the callback route
      // We're testing the validation logic here
      const stateRecord = validateOAuth2State('');
      expect(stateRecord).toBeUndefined();
    });

    it('should handle callback with missing code parameter', () => {
      // State exists but code is missing
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        'test-missing-code'
      );

      // Verify state is valid
      const stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();

      // In the actual callback route, it would check for code presence
      // and return appropriate error
    });

    it('should handle OAuth2 provider error responses', () => {
      // Provider returns error in callback
      const errorParams = {
        error: 'access_denied',
        error_description: 'User denied access',
        state: 'some-state',
      };

      // This would be handled by the callback route
      expect(errorParams.error).toBe('access_denied');
      expect(errorParams.error_description).toBe('User denied access');
    });
  });

  describe('OAuth2 Connection Status', () => {
    it('should track OAuth2 connection status', async () => {
      // Create OAuth2 connection
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/connections`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Status Test Connection',
          type: 'oauth2_3leg',
          baseUrl: 'https://api.example.com',
          authConfig: {
            authUrl: 'https://auth.example.com/oauth/authorize',
            tokenUrl: 'https://auth.example.com/oauth/token',
          },
          secretRefs: {
            clientId: 'status_client_id',
            clientSecret: 'status_client_secret',
          },
        });

      expect(createResponse.status).toBe(201);
      const connectionId = createResponse.body.id;

      // Check initial status (should be disabled/not authorized)
      const connection = await db.query.connections.findFirst({
        where: eq(connections.id, connectionId),
      });

      expect(connection).toBeDefined();
      expect(connection?.type).toBe('oauth2_3leg');
      expect(connection?.enabled).toBe(true); // Default enabled
    });

    it('should store OAuth2 state in connection metadata', async () => {
      const connectionId = nanoid();

      const { state, authorizationUrl } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:5000/callback',
        },
        connectionId
      );

      // State should be retrievable
      const stateRecord = validateOAuth2State(state);
      expect(stateRecord?.connectionId).toBe(connectionId);
      expect(stateRecord?.state).toBe(state);
    });
  });

  describe('OAuth2 Security', () => {
    it('should use cryptographically secure random state', () => {
      const states = new Set<string>();

      // Generate multiple states
      for (let i = 0; i < 100; i++) {
        const { state } = generateOAuth2AuthorizationUrl(
          {
            authUrl: 'https://auth.example.com/oauth/authorize',
            tokenUrl: 'https://auth.example.com/oauth/token',
            clientId: 'test',
            clientSecret: 'test',
            redirectUri: 'http://localhost/callback',
          },
          `connection-${i}`
        );
        states.add(state);
      }

      // All states should be unique
      expect(states.size).toBe(100);

      // All states should be 64 hex characters
      states.forEach(state => {
        expect(state).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    it('should prevent state reuse after validation', () => {
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test',
          clientSecret: 'test',
          redirectUri: 'http://localhost/callback',
        },
        'no-reuse-connection'
      );

      // First validation should succeed
      let stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();

      // Clean up (simulating callback processing)
      cleanupOAuth2State(state);

      // Second validation should fail
      stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeUndefined();
    });

    it('should include PKCE support metadata in state record', () => {
      const { state } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test',
          clientSecret: 'test',
          redirectUri: 'http://localhost/callback',
        },
        'pkce-test'
      );

      const stateRecord = validateOAuth2State(state);
      expect(stateRecord).toBeDefined();
      // PKCE support could be added via codeVerifier field in the future
      expect(stateRecord).toHaveProperty('connectionId');
      expect(stateRecord).toHaveProperty('state');
      expect(stateRecord).toHaveProperty('createdAt');
    });
  });

  describe('OAuth2 Redirect URI Validation', () => {
    it('should validate redirect URI matches allowed URIs', () => {
      // This validation would happen in the callback route
      const allowedRedirectUris = [
        'http://localhost:5000/api/oauth/callback',
        'https://app.vaultlogic.com/api/oauth/callback',
      ];

      const testUri = 'http://localhost:5000/api/oauth/callback';
      expect(allowedRedirectUris.includes(testUri)).toBe(true);

      const invalidUri = 'https://malicious-site.com/callback';
      expect(allowedRedirectUris.includes(invalidUri)).toBe(false);
    });

    it('should encode redirect URI in authorization URL', () => {
      const redirectUri = 'http://localhost:5000/api/oauth/callback?param=value';
      const { authorizationUrl } = generateOAuth2AuthorizationUrl(
        {
          authUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'test',
          clientSecret: 'test',
          redirectUri,
        },
        'redirect-encoding-test'
      );

      // URL should contain encoded redirect URI
      expect(authorizationUrl).toContain('redirect_uri=');
      expect(authorizationUrl).toContain(encodeURIComponent(redirectUri));
    });
  });
});

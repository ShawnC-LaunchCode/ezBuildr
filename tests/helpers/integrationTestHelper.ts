/**
 * Integration Test Helper
 *
 * Provides reusable utilities for setting up integration tests with proper:
 * - User/tenant/project hierarchy
 * - Authentication tokens
 * - Server setup
 * - Cleanup
 *
 * This ensures consistency across all integration tests and reduces code duplication.
 */

import { type Server } from 'http';

import { eq, inArray } from 'drizzle-orm';
import express, { type Express } from 'express';
import { nanoid } from 'nanoid';
import request from 'supertest';

import * as schema from '@shared/schema';

import { db, initializeDatabase } from '../../server/db';
import { registerRoutes } from '../../server/routes';

export interface IntegrationTestContext {
  app: Express;
  server: Server;
  baseURL: string;
  tenantId: string;
  orgId: string;
  userId: string;
  authToken: string;
  projectId?: string;
  cleanup: () => Promise<void>;
}

export interface SetupOptions {
  tenantName?: string;
  createProject?: boolean;
  projectName?: string;
  userRole?: 'admin' | 'creator';
  tenantRole?: 'owner' | 'builder' | 'viewer';
}

/**
 * Sets up a complete integration test environment with:
 * - Express app with all routes registered
 * - HTTP server listening on random port
 * - Tenant created
 * - User registered with JWT token
 * - Optional project created
 * - Cleanup function to tear down all resources
 *
 * @param options Configuration options
 * @returns Test context with all setup resources
 */
export async function setupIntegrationTest(
  options: SetupOptions = {}
): Promise<IntegrationTestContext> {
  const {
    tenantName = 'Test Tenant',
    createProject = false,
    projectName = 'Test Project',
    userRole = 'admin',
    tenantRole = 'owner',
  } = options;

  // Ensure database is initialized before proceeding
  await initializeDatabase();

  // Setup Express app
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Register all routes
  const server = await registerRoutes(app);

  // Start server on random port
  const port = await new Promise<number>((resolve) => {
    const testServer = server.listen(0, () => {
      const addr = testServer.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : 5000;
      resolve(actualPort);
    });
  });

  const baseURL = `http://localhost:${port}`;

  // Create tenant
  const [tenant] = await db.insert(schema.tenants).values({
    name: `${tenantName} ${nanoid()}`,
    plan: 'pro',
  }).returning();
  const tenantId = tenant.id;

  // Register user with proper roles
  const email = `test-${nanoid()}@example.com`;
  const registerResponse = await request(baseURL)
    .post('/api/auth/register')
    .send({
      email,
      password: 'StrongTestUser123!@#',
      firstName: 'Test',
      lastName: 'User',
    });

  if (registerResponse.status !== 201) {
    throw new Error(`User registration failed: ${JSON.stringify(registerResponse.body)}`);
  }

  const authToken = registerResponse.body.token;
  const userId = registerResponse.body.user.id;

  // Update user with tenant and roles
  await db.update(schema.users)
    .set({
      tenantId,
      role: userRole,
      tenantRole: tenantRole,
    })
    .where(eq(schema.users.id, userId));

  // Create organization for ACL testing
  const [org] = await db.insert(schema.organizations).values({
    name: `${tenantName  } Org`,
    tenantId: tenantId,
  }).returning();
  const orgId = org.id;

  // Create organization membership
  await db.insert(schema.organizationMemberships).values({
    orgId: orgId,
    userId: userId,
    role: 'admin',
  });

  let projectId: string | undefined;

  // Optionally create project
  if (createProject) {
    const projectResponse = await request(baseURL)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: projectName });

    if (projectResponse.status !== 201) {
      throw new Error(`Project creation failed: ${JSON.stringify(projectResponse.body)}`);
    }

    projectId = projectResponse.body.id;
  }

  // Cleanup function
  const cleanup = async () => {
    try {
      if (tenantId) {
        // Cleanup audit_logs for users in this tenant to avoid FK constraints
        const tenantUsers = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.tenantId, tenantId));
        if (tenantUsers.length > 0) {
          const userIds = tenantUsers.map(u => u.id);
          // Delete related data first to avoid FK violations
          await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, userIds));
          await db.delete(schema.workflowVersions).where(inArray(schema.workflowVersions.createdBy, userIds));
          // Delete workflows created by these users (to avoid FK violations)
          await db.delete(schema.workflows).where(inArray(schema.workflows.creatorId, userIds));
          // Note: Workflows and Projects cascade from Tenant usually, but specific user ownership might block.
          // Explicit cleanup of user resources if needed.
        }
        await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  };

  return {
    app,
    server,
    baseURL,
    tenantId,
    orgId,
    userId,
    authToken,
    projectId,
    cleanup,
  };
}

/**
 * Creates an authenticated request agent for making API calls
 *
 * @param baseURL Base URL of the test server
 * @param authToken JWT authentication token
 * @returns Supertest agent with authorization header pre-configured
 */
export function createAuthenticatedAgent(baseURL: string, authToken: string) {
  return {
    get: (url: string) => request(baseURL).get(url).set('Authorization', `Bearer ${authToken}`),
    post: (url: string) => request(baseURL).post(url).set('Authorization', `Bearer ${authToken}`),
    put: (url: string) => request(baseURL).put(url).set('Authorization', `Bearer ${authToken}`),
    patch: (url: string) => request(baseURL).patch(url).set('Authorization', `Bearer ${authToken}`),
    delete: (url: string) => request(baseURL).delete(url).set('Authorization', `Bearer ${authToken}`),
  };
}

/**
 * Creates a new test user and logs them in to get valid credentials
 */
export async function createTestUser(
  ctx: IntegrationTestContext,
  role: 'owner' | 'builder' | 'runner' | 'viewer' = 'viewer',
  overrideTenantId?: string
) {
  const email = `test-${nanoid()}@example.com`;
  const password = 'StrongTestUser123!@#';

  // Register
  const registerRes = await request(ctx.baseURL)
    .post('/api/auth/register')
    .send({
      email,
      password,
      firstName: 'Test',
      lastName: role,
    });

  if (registerRes.status !== 201) {
    throw new Error(`User registration failed: ${JSON.stringify(registerRes.body)}`);
  }

  const userId = registerRes.body.user.id;

  // Update role/tenant
  await db.update(schema.users)
    .set({
      tenantId: overrideTenantId || ctx.tenantId,
      tenantRole: role,
      emailVerified: true // Auto-verify for tests
    })
    .where(eq(schema.users.id, userId));

  // Login to get tokens
  const loginRes = await request(ctx.baseURL)
    .post('/api/auth/login')
    .send({ email, password });

  if (loginRes.status !== 200) {
    throw new Error(`User login failed: ${JSON.stringify(loginRes.body)}`);
  }

  return {
    userId,
    email,
    token: loginRes.body.token,
    cookies: loginRes.headers['set-cookie'] as unknown as string[],
    agent: request.agent(ctx.server).set('Cookie', loginRes.headers['set-cookie'] as unknown as string[]) // Stateful agent with cookies
  };
}

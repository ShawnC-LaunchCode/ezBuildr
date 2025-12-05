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

import express, { type Express } from 'express';
import { type Server } from 'http';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';

export interface IntegrationTestContext {
  app: Express;
  server: Server;
  baseURL: string;
  tenantId: string;
  userId: string;
  authToken: string;
  projectId?: string;
  cleanup: () => Promise<void>;
}

export interface SetupOptions {
  tenantName?: string;
  createProject?: boolean;
  projectName?: string;
  userRole?: 'admin' | 'creator' | 'viewer';
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
    name: tenantName,
    plan: 'pro',
  }).returning();
  const tenantId = tenant.id;

  // Register user with proper roles
  const email = `test-${nanoid()}@example.com`;
  const registerResponse = await request(baseURL)
    .post('/api/auth/register')
    .send({
      email,
      password: 'TestPassword123',
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
      // Delete workflows first (cascades to workflow_versions)
      // This prevents FK constraint violations when deleting users
      if (tenantId) {
        await db.delete(schema.workflows)
          .where(eq(schema.workflows.tenantId, tenantId));
      }

      // Delete tenant (cascades to users, projects, etc.)
      if (tenantId) {
        await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      // Don't fail the test if cleanup fails
    }

    // Close server
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

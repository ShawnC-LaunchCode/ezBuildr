import request from "supertest";

import type { User } from "@shared/schema";

import type { Application } from "express";

/**
 * Integration test helpers for tests that use the real database (Neon)
 * These helpers don't depend on SQLite and can be used in CI environments
 */

/**
 * Create an authenticated supertest agent for integration tests
 * Uses the dev-login endpoint to create a session
 *
 * Note: The user parameter is currently ignored. The session will be for the
 * hardcoded dev-user-123 created by dev-login. Tests should use this user ID.
 */
export async function createAuthenticatedAgent(
  app: Application,
  user?: User
): Promise<any> {
  // Create an agent
  const agent = request.agent(app);

  // Use dev-login to create a valid session
  // This creates a session for the "dev-user-123" user
  const response = await agent.post("/api/auth/dev-login");

  if (response.status !== 200) {
    throw new Error(`Dev login failed with status ${response.status}: ${JSON.stringify(response.body)}`);
  }

  // Return the authenticated agent
  // The session is for dev-user-123 (id: "dev-user-123", email: "dev@example.com")
  return agent;
}

/**
 * The dev user that dev-login creates
 * Use this in tests that need to know the authenticated user's ID
 */
export const DEV_USER = {
  id: "dev-user-123",
  email: "dev@example.com",
  firstName: "Dev",
  lastName: "User",
} as const;

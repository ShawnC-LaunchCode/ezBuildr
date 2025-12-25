import { v4 as uuid } from "uuid";
import type { User } from "../../shared/schema";

export interface TestUserOptions {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role?: "admin" | "creator";
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test user with sensible defaults
 * Useful for all test types (unit, integration, e2e)
 */
export function createTestUser(overrides: TestUserOptions = {}): User {
  const timestamp = new Date();
  return {
    id: uuid(),
    email: `testuser_${Date.now()}@example.com`,
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    profileImageUrl: null,
    role: "creator",
    tenantRole: "owner",
    authProvider: "local",
    defaultMode: "easy",
    emailVerified: true,
    mfaEnabled: false,
    lastPasswordChange: null,
    tenantId: "tenant-test-123",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/**
 * Create multiple test users
 */
export function createTestUsers(count: number, baseOverrides: TestUserOptions = {}): User[] {
  return Array.from({ length: count }, (_, i) =>
    createTestUser({
      ...baseOverrides,
      email: `testuser_${Date.now()}_${i}@example.com`
    })
  );
}

/**
 * Create an admin user
 */
export function createTestAdmin(overrides: TestUserOptions = {}): User {
  return createTestUser({
    role: "admin",
    firstName: "Admin",
    lastName: "User",
    ...overrides,
  });
}

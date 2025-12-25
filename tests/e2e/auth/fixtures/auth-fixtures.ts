import { test as base, type Page } from "@playwright/test";
import { LoginPage } from "../page-objects/LoginPage";
import { DashboardPage } from "../page-objects/DashboardPage";
import { PortalPage } from "../page-objects/PortalPage";

/**
 * User credentials for testing
 */
export type TestUser = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "admin" | "creator" | "owner";
};

/**
 * Portal user for magic link testing
 */
export type PortalUser = {
  email: string;
  magicToken?: string;
};

/**
 * Extended fixtures for authentication tests
 */
type AuthFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  portalPage: PortalPage;
  authenticatedPage: Page;
  testUser: TestUser;
  devLogin: () => Promise<void>;
};

/**
 * Extended Playwright test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },

  portalPage: async ({ page }, use) => {
    const portalPage = new PortalPage(page);
    await use(portalPage);
  },

  testUser: async ({}, use) => {
    // Default test user matching server's dev-login endpoint
    const user: TestUser = {
      id: "dev-user",
      email: "dev@example.com",
      password: "DevPassword123",
      firstName: "Dev",
      lastName: "User",
      role: "owner",
    };
    await use(user);
  },

  devLogin: async ({ page }, use) => {
    const login = async () => {
      // Use the dev-login endpoint to set up authentication
      await page.goto("/api/auth/dev-login");
      await page.waitForURL("**/dashboard", { timeout: 10000 });
    };
    await use(login);
  },

  authenticatedPage: async ({ page, devLogin }, use) => {
    // Automatically authenticate before each test
    await devLogin();
    await use(page);
  },
});

export { expect } from "@playwright/test";

/**
 * Helper to create a test user via API
 */
export async function createTestUser(
  page: Page,
  userData: Partial<TestUser> = {}
): Promise<TestUser> {
  const timestamp = Date.now();
  const user: TestUser = {
    id: userData.id || `test-user-${timestamp}`,
    email: userData.email || `test-${timestamp}@example.com`,
    password: userData.password || "TestPassword123!",
    firstName: userData.firstName || "Test",
    lastName: userData.lastName || "User",
    role: userData.role || "creator",
  };

  const response = await page.request.post("/api/auth/register", {
    data: {
      email: user.email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test user: ${response.status()} ${await response.text()}`);
  }

  return user;
}

/**
 * Helper to login via API and get token
 */
export async function loginViaAPI(
  page: Page,
  email: string,
  password: string
): Promise<{ token: string; user: any }> {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Failed to login: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return { token: data.token, user: data.user };
}

/**
 * Helper to logout via API
 */
export async function logoutViaAPI(page: Page): Promise<void> {
  await page.request.post("/api/auth/logout");
}

/**
 * Helper to verify email via API
 */
export async function verifyEmail(page: Page, token: string): Promise<boolean> {
  const response = await page.request.post("/api/auth/verify-email", {
    data: { token },
  });

  return response.ok();
}

/**
 * Helper to create a portal magic link
 */
export async function requestMagicLink(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/portal/auth/send", {
    data: { email },
  });

  if (!response.ok()) {
    throw new Error(`Failed to request magic link: ${response.status()}`);
  }
}

/**
 * Helper to verify a magic link token
 */
export async function verifyMagicLink(
  page: Page,
  token: string
): Promise<{ email: string; token: string }> {
  const response = await page.request.post("/api/portal/auth/verify", {
    data: { token },
  });

  if (!response.ok()) {
    throw new Error(`Failed to verify magic link: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Helper to set auth token in browser storage
 */
export async function setAuthToken(page: Page, token: string): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("auth_token", t);
  }, token);
}

/**
 * Helper to get auth token from browser storage
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem("auth_token"));
}

/**
 * Helper to clear auth token from browser storage
 */
export async function clearAuthToken(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("auth_token");
    sessionStorage.clear();
  });
}

/**
 * Helper to check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const response = await page.request.get("/api/auth/me");
  return response.ok();
}

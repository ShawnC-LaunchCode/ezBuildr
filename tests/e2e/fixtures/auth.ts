import { test as base, type Page } from "@playwright/test";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "creator" | "owner";
};

/**
 * Create authenticated session by hitting the dev-login endpoint.
 * This sets the real cookies and tokens in the browser context.
 */
async function createAuthenticatedSession(page: Page): Promise<AuthUser> {
  // Hit the dev-login endpoint which sets cookies and redirects to /dashboard
  // We use goto() so it happens in the browser context
  await page.goto("/api/auth/dev-login");

  // Wait for the redirect to dashboard to confirm login
  await page.waitForURL("**/dashboard");

  // Return the fixed dev user details (matching server/routes/auth.routes.ts)
  return {
    id: "dev-user",
    email: "dev@example.com",
    firstName: "Dev",
    lastName: "User",
    role: "owner"
  };
}

type AuthFixtures = {
  authenticatedPage: Page;
  testUser: AuthUser;
};

/**
 * Extended Playwright test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  testUser: async ({ page }, use) => {
    const user = await createAuthenticatedSession(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(user);
  },

  authenticatedPage: async ({ page, _testUser }, use) => {
    // Session is already set up from testUser fixture
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect } from "@playwright/test";

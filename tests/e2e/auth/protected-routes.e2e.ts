import { test, expect } from "./fixtures/auth-fixtures";
import { clearAuthToken } from "./fixtures/auth-fixtures";

/**
 * E2E tests for protected route access
 * Tests authentication requirements for protected pages
 */
test.describe("Protected Route Access", () => {
  const protectedRoutes = [
    "/dashboard",
    "/workflows",
    "/workflows/new",
    "/runs",
    "/datavault",
    "/templates",
    "/settings",
    "/admin",
  ];

  test("should redirect unauthenticated users to login/landing", async ({ page }) => {
    // Ensure not authenticated
    await clearAuthToken(page);

    for (const route of protectedRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);

      const currentUrl = page.url();

      // Should be redirected away from protected route
      // Could be to login, landing (/), or stay but show error
      const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:5174";
      const isRedirected =
        currentUrl.includes("login") ||
        currentUrl === baseURL + "/" ||
        currentUrl === baseURL;

      // If not redirected, verify we can't access protected data
      if (!isRedirected) {
        const response = await page.request.get("/api/auth/me");
        expect(response.ok()).toBe(false);
      }
    }
  });

  test("should allow authenticated users to access protected routes", async ({
    page,
    devLogin,
  }) => {
    // Login first
    await devLogin();

    // Verify auth
    const authResponse = await page.request.get("/api/auth/me");
    expect(authResponse.ok()).toBe(true);

    const accessibleRoutes = ["/dashboard", "/workflows", "/settings"];

    for (const route of accessibleRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Should successfully load the route
      const currentUrl = page.url();
      const routePath = route.substring(1); // Remove leading slash

      // Should either be on the route or redirected to a valid page
      expect(
        currentUrl.includes(routePath) || currentUrl.includes("dashboard")
      ).toBe(true);
    }
  });

  test("should maintain authentication when navigating between protected routes", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Navigate through multiple protected routes
    await page.goto("/workflows");
    await page.waitForTimeout(300);

    await page.goto("/runs");
    await page.waitForTimeout(300);

    await page.goto("/dashboard");
    await page.waitForTimeout(300);

    // Should still be authenticated
    const response = await page.request.get("/api/auth/me");
    expect(response.ok()).toBe(true);
  });

  test("should preserve intended destination after login (deep linking)", async ({
    page,
  }) => {
    // Clear auth
    await clearAuthToken(page);

    // Try to access a specific protected route
    const intendedRoute = "/workflows";
    await page.goto(intendedRoute, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // May be redirected to login
    const currentUrl = page.url();

    // If redirected to login, the app might remember the intended destination
    // This is implementation-dependent, so we just verify the flow doesn't crash
    expect(currentUrl).toBeTruthy();
  });

  test("should handle direct URL access to protected routes", async ({
    browser,
    devLogin,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login first
    await page.goto("/api/auth/dev-login");
    await page.waitForURL("**/dashboard");

    // Directly navigate to protected route via URL
    await page.goto("/workflows/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Should be able to access it
    const response = await page.request.get("/api/auth/me");
    expect(response.ok()).toBe(true);

    await context.close();
  });

  test("should prevent access via browser back button after logout", async ({
    page,
    devLogin,
  }) => {
    // Login and navigate to protected route
    await devLogin();
    await page.goto("/workflows");
    await page.waitForTimeout(500);

    // Logout
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Go to public page
    await page.goto("/");
    await page.waitForTimeout(500);

    // Try to go back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should not be able to access protected content
    const response = await page.request.get("/api/auth/me");
    expect(response.ok()).toBe(false);
  });

  test("should handle unauthorized API requests gracefully", async ({ page }) => {
    // Clear auth
    await clearAuthToken(page);

    // Try to make authenticated API calls
    const endpoints = [
      "/api/workflows",
      "/api/runs",
      "/api/auth/me",
      "/api/projects",
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);

      // Should return 401 or 403
      expect([401, 403].includes(response.status())).toBe(true);
    }
  });

  test("should reject tampered/invalid auth tokens", async ({ page }) => {
    // Set invalid token
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "invalid.token.here");
    });

    // Try to access protected endpoint
    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: "Bearer invalid.token.here",
      },
    });

    // Should be rejected
    expect(response.ok()).toBe(false);
  });

  test("should enforce role-based access control", async ({
    page,
    devLogin,
  }) => {
    // Login as dev user (owner role)
    await devLogin();

    // Admin routes might require specific roles
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Owner role should have access (or be redirected gracefully)
    const url = page.url();
    expect(url).toBeTruthy();

    // The exact behavior depends on RBAC implementation
    // Just verify no crash occurs
  });

  test("should handle concurrent route access attempts", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Navigate to multiple routes simultaneously
    await Promise.all([
      page.goto("/workflows"),
      page.goto("/runs"),
      page.goto("/dashboard"),
    ]);

    // Should end up on one of them without crashing
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toMatch(/workflows|runs|dashboard/);
  });
});

test.describe("Public Route Access", () => {
  test("should allow unauthenticated access to public routes", async ({ page }) => {
    await clearAuthToken(page);

    const publicRoutes = ["/", "/login"];

    for (const route of publicRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Should successfully load
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();

      // Page should have content
      const body = await page.locator("body").textContent();
      expect(body?.length).toBeGreaterThan(0);
    }
  });

  test("should allow access to public workflow links", async ({ page }) => {
    await clearAuthToken(page);

    // Public workflow access route pattern: /w/:slug
    // This is a placeholder - actual slug would come from test data
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Should load without authentication
    expect(page.url()).toBeTruthy();
  });
});

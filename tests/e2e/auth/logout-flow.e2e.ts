import { test, expect } from "./fixtures/auth-fixtures";
import { clearAuthToken, getAuthToken } from "./fixtures/auth-fixtures";

/**
 * E2E tests for logout flow
 * Tests session termination, token cleanup, and post-logout behavior
 */
test.describe("Logout Flow", () => {
  test("should successfully logout and clear session", async ({
    page,
    devLogin,
    dashboardPage,
  }) => {
    // First login
    await devLogin();

    // Verify we're logged in
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Logout via API
    const logoutResponse = await page.request.post("/api/auth/logout");
    expect(logoutResponse.ok()).toBe(true);

    // Clear local storage as well
    await clearAuthToken(page);

    // Try to access protected endpoint
    const meResponse = await page.request.get("/api/auth/me");

    // Should be unauthorized (401) or redirect
    expect([401, 403].includes(meResponse.status())).toBe(true);
  });

  test("should clear auth token from storage on logout", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Verify token exists
    const tokenBefore = await getAuthToken(page);
    expect(tokenBefore).toBeTruthy();

    // Logout
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Verify token is cleared
    const tokenAfter = await getAuthToken(page);
    expect(tokenAfter).toBeNull();
  });

  test("should redirect to login page after logout", async ({
    page,
    devLogin,
    dashboardPage,
  }) => {
    // Login
    await devLogin();

    // Logout
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Try to access dashboard
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // Should be redirected to login or landing page
    const url = page.url();
    expect(url).toMatch(/login|^\/$|\/$/);
  });

  test("should prevent access to protected routes after logout", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Logout
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Try to access various protected routes
    const protectedRoutes = ["/workflows", "/runs", "/settings"];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForTimeout(500);

      // Should be redirected away from protected route
      const currentUrl = page.url();
      const isOnProtectedRoute = currentUrl.includes(route.substring(1));

      // If still on protected route, verify we can't access data
      if (isOnProtectedRoute) {
        const response = await page.request.get("/api/auth/me");
        expect(response.ok()).toBe(false);
      }
    }
  });

  test("should handle logout from multiple tabs/windows", async ({
    browser,
    devLogin,
  }) => {
    // Create two browser contexts (simulating tabs)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login in first tab using dev-login
    await page1.goto("/api/auth/dev-login");
    await page1.waitForURL("**/dashboard");

    // Login in second tab
    await page2.goto("/api/auth/dev-login");
    await page2.waitForURL("**/dashboard");

    // Logout from first tab
    await page1.request.post("/api/auth/logout");
    await clearAuthToken(page1);

    // First tab should be logged out
    const response1 = await page1.request.get("/api/auth/me");
    expect(response1.ok()).toBe(false);

    // Second tab should still be logged in (different session)
    const response2 = await page2.request.get("/api/auth/me");
    expect(response2.ok()).toBe(true);

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test("should invalidate refresh token on logout", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Get cookies before logout
    const cookiesBefore = await page.context().cookies();
    const refreshTokenBefore = cookiesBefore.find((c) => c.name === "refresh_token");

    // Logout
    const response = await page.request.post("/api/auth/logout");
    expect(response.ok()).toBe(true);

    // Get cookies after logout
    const cookiesAfter = await page.context().cookies();
    const refreshTokenAfter = cookiesAfter.find((c) => c.name === "refresh_token");

    // Refresh token should be cleared or expired
    expect(
      !refreshTokenAfter ||
      refreshTokenAfter.value === "" ||
      refreshTokenAfter.expires === 0
    ).toBe(true);
  });

  test("should handle double logout gracefully", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // First logout
    const response1 = await page.request.post("/api/auth/logout");
    expect(response1.ok()).toBe(true);

    // Second logout (should not error)
    const response2 = await page.request.post("/api/auth/logout");
    expect([200, 401].includes(response2.status())).toBe(true);
  });

  test("should clean up all session data on logout", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Store some additional data in storage
    await page.evaluate(() => {
      localStorage.setItem("test_data", "should_persist");
      sessionStorage.setItem("session_data", "should_be_cleared");
    });

    // Logout
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Session storage should be cleared
    const sessionData = await page.evaluate(() =>
      sessionStorage.getItem("session_data")
    );
    expect(sessionData).toBeNull();

    // Local storage test data should persist (only auth cleared)
    const testData = await page.evaluate(() => localStorage.getItem("test_data"));
    expect(testData).toBe("should_persist");
  });

  test("should handle logout during active API request", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Start a long-running request and logout simultaneously
    const [requestResponse, logoutResponse] = await Promise.all([
      page.request.get("/api/auth/me"),
      page.request.post("/api/auth/logout"),
    ]);

    // Both should complete without crashing
    expect(requestResponse).toBeTruthy();
    expect(logoutResponse).toBeTruthy();
  });
});

test.describe("Session Expiration", () => {
  test("should handle expired session gracefully", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Clear auth token to simulate expiration
    await clearAuthToken(page);

    // Try to access protected endpoint
    const response = await page.request.get("/api/auth/me");

    // Should be unauthorized
    expect(response.ok()).toBe(false);
  });

  test("should prompt re-authentication on expired session", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Clear session
    await page.request.post("/api/auth/logout");
    await clearAuthToken(page);

    // Try to access dashboard
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // Should be redirected to login
    const url = page.url();
    expect(url).toMatch(/login|^\/$|\/$/);
  });
});

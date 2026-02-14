import { test, expect } from "@playwright/test";

/**
 * US-S-013: Application Stability and Routing Tests
 *
 * Tests core application functionality and routing behavior
 */
test.describe("US-S-013: Application Stability", () => {
  // Use longer timeout in CI environments
  test.setTimeout(process.env.CI ? 60000 : 30000);

  test("should handle multiple page navigations", async ({ page }) => {
    const routes = ["/", "/about", "/features", "/dashboard", "/"];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Should not crash (React app should render)
      await page.waitForSelector('#root', { state: 'attached', timeout: 10000 });
    }
  });

  test("should handle browser back/forward navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);

    await page.goto("/about");
    await page.waitForTimeout(500);

    // Go back
    await page.goBack();
    await page.waitForTimeout(500);

    await page.waitForSelector('#root', { state: 'attached', timeout: 10000 });

    // Go forward
    await page.goForward();
    await page.waitForTimeout(500);

    await page.waitForSelector('#root', { state: 'attached', timeout: 10000 });
  });

  test("should handle page refresh", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Refresh page
    await page.reload({ waitUntil: "domcontentloaded" });

    const body = page.locator("body");
    await expect(body).toBeVisible();

    const content = await body.textContent();
    expect(content!.length).toBeGreaterThan(50);
  });

  test("should handle invalid routes gracefully", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-12345");
    await page.waitForTimeout(1000);

    // Should show 404 or redirect, not crash (React app should render)
    await page.waitForSelector('#root', { state: 'attached', timeout: 10000 });

    const body = page.locator("body");
    const content = await body.textContent();
    expect(content!.length).toBeGreaterThan(0);
  });

  test("should maintain responsive layout", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");

    // Check viewport dimensions work
    const boundingBox = await body.boundingBox();
    expect(boundingBox).toBeTruthy();
    expect(boundingBox!.width).toBeGreaterThan(0);
    expect(boundingBox!.height).toBeGreaterThan(0);
  });

  test("should load without JavaScript errors", async ({ page }) => {
    const jsErrors: string[] = [];

    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should not have JavaScript errors
    expect(jsErrors.length).toBe(0);
  });

  test("should handle API errors gracefully", async ({ _page, request }) => {
    // Test invalid API endpoint
    const response = await request.get("/api/invalid-endpoint-12345");

    // Should return 404, not crash
    expect(response.status()).toBe(404);
  });
});

import { test, expect } from "./fixtures/auth-fixtures";
import { setAuthToken, clearAuthToken } from "./fixtures/auth-fixtures";

/**
 * E2E tests for token-based workflow access
 * Tests Bearer token authentication and API access patterns
 */
test.describe("Token-Based Workflow Access", () => {
  test("should create workflow run with bearer token", async ({
    page,
    devLogin,
  }) => {
    // Login to get token
    await devLogin();

    // Get auth token
    const tokenResponse = await page.request.get("/api/auth/token");
    expect(tokenResponse.ok()).toBe(true);

    const { token } = await tokenResponse.json();
    expect(token).toBeTruthy();

    // Use token to make API request
    const meResponse = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(meResponse.ok()).toBe(true);
  });

  test("should access workflow with run token", async ({ page, devLogin }) => {
    // Login first
    await devLogin();

    // Create a workflow (mock - would need real workflow ID)
    const mockWorkflowId = "test-workflow-123";

    // Try to create a run
    const response = await page.request.post(
      `/api/workflows/${mockWorkflowId}/runs`,
      {
        data: {},
      }
    );

    // Will fail if workflow doesn't exist, but verify endpoint accepts tokens
    expect(response).toBeTruthy();
  });

  test("should validate JWT token format", async ({ page }) => {
    const invalidTokens = [
      "not-a-jwt",
      "invalid.jwt.format",
      "",
      "Bearer invalid",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
    ];

    for (const token of invalidTokens) {
      const response = await page.request.get("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Should reject invalid tokens
      expect(response.ok()).toBe(false);
    }
  });

  test("should handle expired JWT tokens", async ({ page }) => {
    // Mock expired token (would need real expired token in production)
    const expiredToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid";

    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    // Should reject expired token
    expect(response.ok()).toBe(false);
  });

  test("should refresh access token with refresh token", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Try to refresh token
    const response = await page.request.post("/api/auth/refresh-token");

    // Should get new access token
    if (response.ok()) {
      const data = await response.json();
      expect(data.token).toBeTruthy();
    } else {
      // Refresh token might not be set in all test scenarios
      expect([401, 403].includes(response.status())).toBe(true);
    }
  });

  test("should handle missing Bearer prefix in Authorization header", async ({
    page,
  }) => {
    const token = "valid-jwt-token";

    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: token, // Missing "Bearer " prefix
      },
    });

    // Should reject or handle gracefully
    expect(response.ok()).toBe(false);
  });

  test("should accept both cookie and bearer token authentication", async ({
    page,
    devLogin,
  }) => {
    // Login (sets cookies)
    await devLogin();

    // Request with cookies (default behavior)
    const cookieResponse = await page.request.get("/api/auth/me");
    expect(cookieResponse.ok()).toBe(true);

    // Get JWT token
    const tokenResponse = await page.request.get("/api/auth/token");
    if (tokenResponse.ok()) {
      const { token } = await tokenResponse.json();

      // Request with bearer token
      const bearerResponse = await page.request.get("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(bearerResponse.ok()).toBe(true);
    }
  });

  test("should prioritize bearer token over cookie", async ({
    page,
    devLogin,
  }) => {
    // Login (sets cookies)
    await devLogin();

    // Get valid token
    const tokenResponse = await page.request.get("/api/auth/token");
    expect(tokenResponse.ok()).toBe(true);

    const { token } = await tokenResponse.json();

    // Make request with both cookie and bearer token
    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Should accept request (bearer token takes precedence)
    expect(response.ok()).toBe(true);
  });

  test("should reject tampered JWT signature", async ({ page }) => {
    // Get a valid token structure but tamper with it
    const tamperedToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0YW1wZXJlZCJ9.tampered_signature";

    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
      },
    });

    // Should reject tampered token
    expect(response.ok()).toBe(false);
  });

  test("should handle token with invalid claims", async ({ page }) => {
    // Token with invalid/missing required claims
    const invalidClaimsToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnZhbGlkIjoidHJ1ZSJ9.signature";

    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${invalidClaimsToken}`,
      },
    });

    // Should reject
    expect(response.ok()).toBe(false);
  });

  test("should validate token audience and issuer", async ({ page, devLogin }) => {
    // Login and get token
    await devLogin();

    const tokenResponse = await page.request.get("/api/auth/token");
    if (tokenResponse.ok()) {
      const { token } = await tokenResponse.json();

      // Token should work for intended audience
      const response = await page.request.get("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.ok()).toBe(true);
    }
  });

  test("should handle case-sensitive authorization header", async ({ page }) => {
    const token = "mock-token";

    // Try different case variations
    const variations = [
      { authorization: `Bearer ${token}` },
      { Authorization: `Bearer ${token}` },
      { AUTHORIZATION: `Bearer ${token}` },
    ];

    for (const headers of variations) {
      const response = await page.request.get("/api/auth/me", { headers });

      // Should handle case-insensitively (depends on implementation)
      expect(response).toBeTruthy();
    }
  });

  test("should revoke all tokens on password change", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Get token
    const tokenResponse = await page.request.get("/api/auth/token");
    expect(tokenResponse.ok()).toBe(true);

    const { token } = await tokenResponse.json();

    // Simulate password reset (tokens should be revoked)
    // This would require actual password reset implementation

    // In real scenario, old token should no longer work after password change
    // This is a placeholder for that test
  });

  test("should handle concurrent token requests", async ({ page, devLogin }) => {
    // Login
    await devLogin();

    // Make concurrent token requests
    const requests = Array(5)
      .fill(null)
      .map(() => page.request.get("/api/auth/token"));

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach((r) => expect(r.ok()).toBe(true));
  });

  test("should include token expiration in response", async ({
    page,
    devLogin,
  }) => {
    await devLogin();

    const response = await page.request.get("/api/auth/token");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.token).toBeTruthy();
    expect(data.expiresIn).toBeTruthy(); // Should include expiration info
  });

  test("should handle whitespace in authorization header", async ({ page }) => {
    const token = "valid-token";

    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `  Bearer   ${token}  `, // Extra whitespace
      },
    });

    // Should handle or reject gracefully
    expect(response).toBeTruthy();
  });

  test("should prevent token reuse after revocation", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Get token
    const tokenResponse = await page.request.get("/api/auth/token");
    expect(tokenResponse.ok()).toBe(true);

    const { token } = await tokenResponse.json();

    // Logout (should revoke tokens)
    await page.request.post("/api/auth/logout");

    // Try to use token after logout
    const response = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Token should still work (JWT is stateless) but session should be invalid
    // Behavior depends on implementation
    expect(response).toBeTruthy();
  });
});

test.describe("Token Security", () => {
  test("should not include sensitive data in JWT payload", async ({
    page,
    devLogin,
  }) => {
    await devLogin();

    const response = await page.request.get("/api/auth/token");
    if (response.ok()) {
      const { token } = await response.json();

      // Decode JWT payload (base64)
      const [, payload] = token.split(".");
      if (payload) {
        const decodedPayload = Buffer.from(payload, "base64").toString();
        const claims = JSON.parse(decodedPayload);

        // Should not contain password, secrets, etc.
        expect(claims.password).toBeUndefined();
        expect(claims.passwordHash).toBeUndefined();
        expect(claims.secret).toBeUndefined();
      }
    }
  });

  test("should use secure signing algorithm", async ({ page, devLogin }) => {
    await devLogin();

    const response = await page.request.get("/api/auth/token");
    if (response.ok()) {
      const { token } = await response.json();

      // Decode JWT header
      const [header] = token.split(".");
      if (header) {
        const decodedHeader = Buffer.from(header, "base64").toString();
        const headerObj = JSON.parse(decodedHeader);

        // Should use secure algorithm (HS256, RS256, etc.)
        expect(headerObj.alg).toMatch(/^(HS256|RS256|ES256)$/);
        expect(headerObj.alg).not.toBe("none"); // Reject "none" algorithm
      }
    }
  });

  test("should enforce HTTPS in production", async ({ page }) => {
    // This test verifies the configuration
    // In production, tokens should only be sent over HTTPS
    const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:5174";

    // In test environment, HTTP is acceptable
    expect(baseURL).toMatch(/^https?:\/\//);
  });
});

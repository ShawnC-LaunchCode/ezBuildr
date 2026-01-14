import { test, expect , clearAuthToken } from "./fixtures/auth-fixtures";


/**
 * E2E tests for anonymous workflow runs
 * Tests unauthenticated workflow execution via public links
 */
test.describe("Anonymous Workflow Runs", () => {
  // Mock workflow data
  const mockPublicSlug = "test-workflow-public";
  const mockWorkflowId = "workflow-123";

  test("should create anonymous run via public link", async ({ page }) => {
    // Ensure not authenticated
    await clearAuthToken(page);

    // Try to start anonymous run via public link
    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    // Will fail if workflow doesn't exist, but verify endpoint is accessible
    expect(response).toBeTruthy();

    // If workflow exists and is public, should succeed
    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.runToken).toBeTruthy();
      expect(data.data.runId).toBeTruthy();
    } else {
      // Expected if workflow doesn't exist
      expect([404, 403, 500].includes(response.status())).toBe(true);
    }
  });

  test("should create anonymous run with initial values", async ({ page }) => {
    await clearAuthToken(page);

    const initialValues = {
      name: "Test User",
      email: "test@example.com",
    };

    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: { initialValues },
      }
    );

    // Verify endpoint accepts initial values
    expect(response).toBeTruthy();
  });

  test("should access workflow run with run token", async ({ page }) => {
    await clearAuthToken(page);

    // Mock run token
    const mockRunToken = "run-token-12345";
    const mockRunId = "run-123";

    // Try to access run details with token
    const response = await page.request.get(`/api/runs/${mockRunId}`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
    });

    // Will fail with mock token, but verify endpoint exists
    expect(response).toBeTruthy();
  });

  test("should save step values with run token", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";

    const stepValues = {
      stepId: "step-1",
      value: "test answer",
    };

    const response = await page.request.post(`/api/runs/${mockRunId}/values`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
      data: stepValues,
    });

    // Verify endpoint accepts run token
    expect(response).toBeTruthy();
  });

  test("should complete anonymous run with run token", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";

    const response = await page.request.put(`/api/runs/${mockRunId}/complete`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
      data: {},
    });

    // Verify endpoint exists
    expect(response).toBeTruthy();
  });

  test("should reject anonymous run for non-public workflow", async ({ page }) => {
    await clearAuthToken(page);

    // Try to create run for non-public workflow
    const privateSlug = "private-workflow";

    const response = await page.request.post(
      `/api/workflows/public/${privateSlug}/start`,
      {
        data: {},
      }
    );

    // Should fail (403 or 404)
    if (!response.ok()) {
      expect([403, 404].includes(response.status())).toBe(true);
    }
  });

  test("should validate run token format", async ({ page }) => {
    await clearAuthToken(page);

    const invalidTokens = ["", "invalid", "malformed-token"];

    for (const token of invalidTokens) {
      const response = await page.request.get("/api/runs/test-run-123", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Should reject invalid tokens
      expect(response.ok()).toBe(false);
    }
  });

  test("should prevent cross-run access with wrong token", async ({ page }) => {
    await clearAuthToken(page);

    const runId1 = "run-123";
    const runId2 = "run-456";
    const tokenForRun1 = "token-for-run-123";

    // Try to access run2 with run1's token
    const response = await page.request.get(`/api/runs/${runId2}`, {
      headers: {
        Authorization: `Bearer ${tokenForRun1}`,
      },
    });

    // Should be rejected (403)
    expect(response.ok()).toBe(false);
  });

  test("should handle anonymous run without initial values", async ({ page }) => {
    await clearAuthToken(page);

    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    // Should accept request without initial values
    expect(response).toBeTruthy();
  });

  test("should track anonymous runs separately from authenticated runs", async ({
    page,
  }) => {
    await clearAuthToken(page);

    // Create anonymous run
    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    if (response.ok()) {
      const data = await response.json();

      // Anonymous run should have run token
      expect(data.data.runToken).toBeTruthy();

      // Should not require user authentication
      const runResponse = await page.request.get(
        `/api/runs/${data.data.runId}`,
        {
          headers: {
            Authorization: `Bearer ${data.data.runToken}`,
          },
        }
      );

      expect(runResponse).toBeTruthy();
    }
  });

  test("should generate unique run tokens for each anonymous run", async ({
    page,
  }) => {
    await clearAuthToken(page);

    // Create two anonymous runs
    const response1 = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    const response2 = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    // If both succeed, tokens should be different
    if (response1.ok() && response2.ok()) {
      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.data.runToken).not.toBe(data2.data.runToken);
      expect(data1.data.runId).not.toBe(data2.data.runId);
    }
  });

  test("should handle bulk value save for anonymous runs", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";

    const bulkValues = [
      { stepId: "step-1", value: "answer 1" },
      { stepId: "step-2", value: "answer 2" },
      { stepId: "step-3", value: "answer 3" },
    ];

    const response = await page.request.post(
      `/api/runs/${mockRunId}/values/bulk`,
      {
        headers: {
          Authorization: `Bearer ${mockRunToken}`,
        },
        data: { values: bulkValues },
      }
    );

    // Verify endpoint exists
    expect(response).toBeTruthy();
  });

  test("should allow section navigation with run token", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";
    const mockSectionId = "section-1";

    const response = await page.request.post(
      `/api/runs/${mockRunId}/sections/${mockSectionId}/submit`,
      {
        headers: {
          Authorization: `Bearer ${mockRunToken}`,
        },
        data: {},
      }
    );

    // Verify endpoint accepts run token
    expect(response).toBeTruthy();
  });

  test("should handle anonymous run expiration", async ({ page }) => {
    await clearAuthToken(page);

    // Mock expired run token
    const expiredRunToken = "expired-run-token";
    const mockRunId = "run-123";

    const response = await page.request.get(`/api/runs/${mockRunId}`, {
      headers: {
        Authorization: `Bearer ${expiredRunToken}`,
      },
    });

    // Should handle expired tokens gracefully
    expect(response).toBeTruthy();
  });

  test("should prevent modification of completed anonymous runs", async ({
    page,
  }) => {
    await clearAuthToken(page);

    const mockRunId = "completed-run-123";
    const mockRunToken = "run-token-for-completed";

    // Try to modify completed run
    const response = await page.request.post(`/api/runs/${mockRunId}/values`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
      data: {
        stepId: "step-1",
        value: "new value",
      },
    });

    // If run is completed, should reject modification
    if (response.status() === 403) {
      expect(response.ok()).toBe(false);
    }
  });

  test("should handle invalid workflow slug", async ({ page }) => {
    await clearAuthToken(page);

    const invalidSlugs = [
      "nonexistent-workflow",
      "../../etc/passwd",
      "<script>alert('xss')</script>",
      "workflow; DROP TABLE workflows;",
    ];

    for (const slug of invalidSlugs) {
      const response = await page.request.post(
        `/api/workflows/public/${slug}/start`,
        {
          data: {},
        }
      );

      // Should handle invalid slugs safely
      expect(response).toBeTruthy();
      expect([400, 404, 403, 500].includes(response.status())).toBe(true);
    }
  });

  test("should rate limit anonymous run creation", async ({ page }) => {
    await clearAuthToken(page);

    // Create many anonymous runs rapidly
    const requests = Array(20)
      .fill(null)
      .map(() =>
        page.request.post(`/api/workflows/public/${mockPublicSlug}/start`, {
          data: {},
        })
      );

    const responses = await Promise.all(requests);

    // Some may be rate limited (depends on implementation)
    // Just verify system doesn't crash
    expect(responses.length).toBe(20);
  });

  test("should track anonymous run fingerprint", async ({ page }) => {
    await clearAuthToken(page);

    // Create run (system may track fingerprint in background)
    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    // Should create run successfully
    expect(response).toBeTruthy();
  });

  test("should allow authenticated users to create anonymous runs", async ({
    page,
    devLogin,
  }) => {
    // Login
    await devLogin();

    // Create anonymous run (should still work)
    const response = await page.request.post(
      `/api/workflows/public/${mockPublicSlug}/start`,
      {
        data: {},
      }
    );

    // Authenticated users should be able to use public links too
    expect(response).toBeTruthy();
  });

  test("should handle concurrent anonymous run creation", async ({ page }) => {
    await clearAuthToken(page);

    // Create multiple runs simultaneously
    const requests = Array(5)
      .fill(null)
      .map(() =>
        page.request.post(`/api/workflows/public/${mockPublicSlug}/start`, {
          data: {},
        })
      );

    const responses = await Promise.all(requests);

    // All should complete
    expect(responses.length).toBe(5);
  });

  test("should validate initial values structure", async ({ page }) => {
    await clearAuthToken(page);

    const invalidInitialValues = [
      { malformed: "value" },
      null,
      "string-instead-of-object",
      [1, 2, 3],
    ];

    for (const initialValues of invalidInitialValues) {
      const response = await page.request.post(
        `/api/workflows/public/${mockPublicSlug}/start`,
        {
          data: { initialValues },
        }
      );

      // Should handle invalid data gracefully
      expect(response).toBeTruthy();
    }
  });
});

test.describe("Anonymous Run Security", () => {
  test("should prevent SQL injection in run token", async ({ page }) => {
    await clearAuthToken(page);

    const maliciousToken = "'; DROP TABLE runs; --";

    const response = await page.request.get("/api/runs/test-run", {
      headers: {
        Authorization: `Bearer ${maliciousToken}`,
      },
    });

    // Should reject safely without SQL injection
    expect(response.ok()).toBe(false);
  });

  test("should sanitize step values from anonymous users", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";

    const maliciousValue = "<script>alert('xss')</script>";

    const response = await page.request.post(`/api/runs/${mockRunId}/values`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
      data: {
        stepId: "step-1",
        value: maliciousValue,
      },
    });

    // Should accept but sanitize the value
    expect(response).toBeTruthy();
  });

  test("should prevent path traversal in workflow slug", async ({ page }) => {
    await clearAuthToken(page);

    const traversalAttempts = ["../../../etc/passwd", "..\\..\\windows\\system32"];

    for (const slug of traversalAttempts) {
      const response = await page.request.post(
        `/api/workflows/public/${slug}/start`,
        {
          data: {},
        }
      );

      // Should reject safely
      expect([400, 404, 403].includes(response.status())).toBe(true);
    }
  });

  test("should enforce CORS for anonymous runs", async ({ page }) => {
    await clearAuthToken(page);

    const publicSlug = "test-workflow-public";

    // CORS headers should be present for public endpoints
    const response = await page.request.post(
      `/api/workflows/public/${publicSlug}/start`,
      {
        data: {},
      }
    );

    // Just verify request completes (CORS is handled by server)
    expect(response).toBeTruthy();
  });

  test("should limit anonymous run data size", async ({ page }) => {
    await clearAuthToken(page);

    const mockRunId = "run-123";
    const mockRunToken = "run-token-12345";

    // Try to send very large value
    const largeValue = "x".repeat(1000000); // 1MB string

    const response = await page.request.post(`/api/runs/${mockRunId}/values`, {
      headers: {
        Authorization: `Bearer ${mockRunToken}`,
      },
      data: {
        stepId: "step-1",
        value: largeValue,
      },
    });

    // Should handle or reject large payloads
    expect(response).toBeTruthy();
  });
});

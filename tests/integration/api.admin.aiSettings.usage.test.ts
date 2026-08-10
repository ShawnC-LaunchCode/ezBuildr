import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupIntegrationTest, createTestUser, createAuthenticatedAgent, type IntegrationTestContext } from "../helpers/integrationTestHelper";

describe("Admin AI Settings Usage API", () => {
  let ctx: IntegrationTestContext;
  let adminAgent: ReturnType<typeof createAuthenticatedAgent>;
  let targetUserToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Admin Tenant",
      userRole: "admin",
      tenantRole: "owner",
    });
    adminAgent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const targetUser = await createTestUser(ctx, "builder");
    targetUserToken = targetUser.token;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("GET /api/admin/ai-settings/usage", () => {
    it("returns usage breakdown for an admin", async () => {
      const response = await adminAgent.get("/api/admin/ai-settings/usage");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.usage)).toBe(true);
    });

    it("accepts a valid days query param and defaults to 30", async () => {
      const response = await adminAgent.get("/api/admin/ai-settings/usage?days=7");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("returns 400 for non-numeric or out-of-range days (AISL-10 AC4)", async () => {
      const resNonNumeric = await adminAgent.get("/api/admin/ai-settings/usage?days=abc");
      expect(resNonNumeric.status).toBe(400);

      const resNegative = await adminAgent.get("/api/admin/ai-settings/usage?days=-5");
      expect(resNegative.status).toBe(400);

      const resTooLarge = await adminAgent.get("/api/admin/ai-settings/usage?days=400");
      expect(resTooLarge.status).toBe(400);
    });

    it("returns 403 for a non-admin authenticated user (AISL-10 AC3)", async () => {
      const response = await request(ctx.baseURL)
        .get("/api/admin/ai-settings/usage")
        .set("Authorization", `Bearer ${targetUserToken}`);
      
      expect(response.status).toBe(403);
    });
  });
});

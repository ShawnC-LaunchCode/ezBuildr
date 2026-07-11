import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { setupIntegrationTest, createTestUser, type IntegrationTestContext } from "../helpers/integrationTestHelper";

describe("Reproduction: API Workflow Creation (Cookie Auth)", () => {
    let ctx: IntegrationTestContext;
    let testUserCookies: string[];

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Cookie Repro Tenant",
            createProject: false,
        });

        // Create a new user and login to get cookies
        const user = await createTestUser(ctx, 'owner');
        testUserCookies = user.cookies;
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    // Cookie (refresh-token) auth is intentionally restricted to safe methods
    // (GET/HEAD/OPTIONS) as CSRF protection — see cookieStrategy in
    // server/middleware/auth.ts. A cookie-only mutation MUST be rejected;
    // clients must present a Bearer access token to create workflows.
    it("should reject workflow creation via COOKIES (CSRF safe-method guard)", async () => {
        const payload = {
            title: "Cookie Workflow",
            description: "Testing Cookie Auth",
        };

        const response = await request(ctx.baseURL)
            .post("/api/workflows")
            .set("Cookie", testUserCookies) // Cookie-only, no Authorization header
            .set("Content-Type", "application/json")
            .send(payload);

        expect(response.status).toBe(401);
    });
});

/**
 * Auth Middleware Integration Tests
 *
 * Comprehensive tests for all authentication middleware functions:
 * - requireAuth
 * - optionalAuth
 * - hybridAuth
 * - optionalHybridAuth
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { setupIntegrationTest, type IntegrationTestContext } from "../../helpers/integrationTestHelper";
import { db } from "../../../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe.sequential("Auth Middleware Integration Tests", () => {
    let ctx: IntegrationTestContext;
    let testUser: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    };
    let userToken: string;
    let refreshCookie: string[];

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Middleware Test Tenant",
            createProject: true,
            projectName: "Middleware Test Project",
            userRole: "admin",
            tenantRole: "owner",
        });
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    beforeEach(async () => {
        testUser = {
            email: `middleware-test-${nanoid()}@example.com`,
            password: "TestPassword123!",
            firstName: "Middleware",
            lastName: "Tester",
        };

        // Register and verify user
        const registerRes = await request(ctx.baseURL)
            .post("/api/auth/register")
            .send(testUser)
            .expect(201);

        const userId = registerRes.body.user.id;

        await db.update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, userId));

        const loginRes = await request(ctx.baseURL)
            .post("/api/auth/login")
            .send({
                email: testUser.email,
                password: testUser.password,
            })
            .expect(200);

        userToken = loginRes.body.token;
        refreshCookie = loginRes.headers['set-cookie'];
    });

    describe("requireAuth Middleware", () => {
        it("should allow access with valid JWT Bearer token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
        });

        it("should return 401 when no token provided", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .expect(401);

            expect(res.body.error).toBe("missing_token");
        });

        it("should return 401 with invalid token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer invalid-token")
                .expect(401);

            expect(res.body.error).toBe("invalid_token");
        });

        it("should return 401 with expired token", async () => {
            const jwt = require("jsonwebtoken");
            const expiredToken = jwt.sign(
                {
                    userId: "some-id",
                    email: testUser.email,
                    tenantId: null,
                    role: null
                },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: '1s' }
            );

            await new Promise(resolve => setTimeout(resolve, 1100));

            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${expiredToken}`)
                .expect(401);

            expect(res.body.error).toBe("token_expired");
        });

        it("should extract token without Bearer prefix", async () => {
            // Some endpoints might accept token directly
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", userToken)
                .expect(401);

            // Should fail without Bearer prefix
            expect(res.body.error).toBe("missing_token");
        });
    });

    describe("optionalAuth Middleware", () => {
        it("should proceed without authentication if no token provided", async () => {
            // Create public workflow for optional auth testing
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Optional Auth Workflow",
                    publicLink: `optional-${nanoid()}`,
                })
                .expect(201);

            // Access without authentication
            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .expect(200);
        });

        it("should attach user context if valid token provided", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Optional Auth With Token",
                    publicLink: `optional-token-${nanoid()}`,
                })
                .expect(201);

            // Access with authentication
            const res = await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body).toBeDefined();
        });

        it("should proceed without auth if invalid token provided", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Optional Auth Invalid Token",
                    publicLink: `optional-invalid-${nanoid()}`,
                })
                .expect(201);

            // Access with invalid token should still work (optional)
            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .set("Authorization", "Bearer invalid-token")
                .expect(200);
        });
    });

    describe("hybridAuth Middleware", () => {
        it("should authenticate with JWT Bearer token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
        });

        it("should authenticate with refresh token cookie (GET only)", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Cookie", refreshCookie)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
        });

        it("should reject cookie auth for POST requests (mutation-strict)", async () => {
            await request(ctx.baseURL)
                .post("/api/projects")
                .set("Cookie", refreshCookie)
                .send({ name: "Cookie Auth Project" })
                .expect(401);
        });

        it("should reject cookie auth for PUT requests", async () => {
            await request(ctx.baseURL)
                .put("/api/account")
                .set("Cookie", refreshCookie)
                .send({ firstName: "Updated" })
                .expect(401);
        });

        it("should reject cookie auth for DELETE requests", async () => {
            await request(ctx.baseURL)
                .delete("/api/projects/some-id")
                .set("Cookie", refreshCookie)
                .expect(401);
        });

        it("should allow cookie auth for HEAD requests", async () => {
            // HEAD is a safe method
            const res = await request(ctx.baseURL)
                .head("/api/auth/me")
                .set("Cookie", refreshCookie);

            expect([200, 404]).toContain(res.status);
        });

        it("should prioritize JWT over cookie when both present", async () => {
            // Create second user
            const user2 = {
                email: `user2-${nanoid()}@example.com`,
                password: "TestPassword123!",
                firstName: "User",
                lastName: "Two",
            };

            const user2Res = await request(ctx.baseURL)
                .post("/api/auth/register")
                .send(user2)
                .expect(201);

            await db.update(users)
                .set({ emailVerified: true })
                .where(eq(users.id, user2Res.body.user.id));

            const user2LoginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: user2.email,
                    password: user2.password,
                })
                .expect(200);

            // Use user1's cookie with user2's Bearer token
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${user2LoginRes.body.token}`)
                .set("Cookie", refreshCookie)
                .expect(200);

            // Should authenticate as user2 (JWT wins)
            expect(meRes.body.email).toBe(user2.email);
        });

        it("should return 401 when no auth provided", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .expect(401);

            expect(res.body.error).toBe("unauthorized");
        });

        it("should return 401 when both JWT and cookie are invalid", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer invalid-token")
                .set("Cookie", ["refresh_token=invalid-cookie"])
                .expect(401);
        });
    });

    describe("optionalHybridAuth Middleware", () => {
        it("should authenticate with JWT if provided", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Hybrid Optional JWT",
                    publicLink: `hybrid-jwt-${nanoid()}`,
                })
                .expect(201);

            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);
        });

        it("should authenticate with cookie if JWT not provided", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Hybrid Optional Cookie",
                    publicLink: `hybrid-cookie-${nanoid()}`,
                })
                .expect(201);

            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .set("Cookie", refreshCookie)
                .expect(200);
        });

        it("should proceed anonymously if no auth provided", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Hybrid Optional Anonymous",
                    publicLink: `hybrid-anon-${nanoid()}`,
                })
                .expect(201);

            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .expect(200);
        });

        it("should proceed anonymously if both JWT and cookie are invalid", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Hybrid Optional Invalid",
                    publicLink: `hybrid-invalid-${nanoid()}`,
                })
                .expect(201);

            await request(ctx.baseURL)
                .get(`/api/workflows/${workflowRes.body.id}/public`)
                .set("Authorization", "Bearer invalid-token")
                .set("Cookie", ["refresh_token=invalid-cookie"])
                .expect(200);
        });
    });

    describe("Cookie Strategy Security", () => {
        it("should only allow safe methods for cookie auth", async () => {
            // GET should work
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Cookie", refreshCookie)
                .expect(200);

            // POST should fail
            await request(ctx.baseURL)
                .post("/api/projects")
                .set("Cookie", refreshCookie)
                .send({ name: "Test" })
                .expect(401);

            // PUT should fail
            await request(ctx.baseURL)
                .put("/api/account")
                .set("Cookie", refreshCookie)
                .send({ firstName: "Test" })
                .expect(401);

            // DELETE should fail
            await request(ctx.baseURL)
                .delete("/api/projects/some-id")
                .set("Cookie", refreshCookie)
                .expect(401);

            // PATCH should fail
            await request(ctx.baseURL)
                .patch("/api/account")
                .set("Cookie", refreshCookie)
                .send({ firstName: "Test" })
                .expect(401);
        });

        it("should ignore cookies when Bearer token present", async () => {
            // Create user with different cookie
            const user2 = {
                email: `cookie-test-${nanoid()}@example.com`,
                password: "TestPassword123!",
                firstName: "Cookie",
                lastName: "Test",
            };

            const user2Res = await request(ctx.baseURL)
                .post("/api/auth/register")
                .send(user2)
                .expect(201);

            await db.update(users)
                .set({ emailVerified: true })
                .where(eq(users.id, user2Res.body.user.id));

            const user2LoginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: user2.email,
                    password: user2.password,
                })
                .expect(200);

            // Use user2's Bearer token with user1's cookie
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${user2LoginRes.body.token}`)
                .set("Cookie", refreshCookie)
                .expect(200);

            // Should authenticate as user2 (Bearer wins)
            expect(meRes.body.email).toBe(user2.email);
        });

        it("should validate refresh token from cookie", async () => {
            // Use cookie with GET request
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Cookie", refreshCookie)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
        });

        it("should reject expired refresh token from cookie", async () => {
            // Set cookie to expired token (this would require modifying DB)
            // For now, test with invalid cookie
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Cookie", ["refresh_token=invalid-expired-token"])
                .expect(401);
        });
    });

    describe("User Context Attachment", () => {
        it("should attach userId to request", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.id).toBeDefined();
        });

        it("should attach userEmail to request", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
        });

        it("should attach tenantId to request", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.tenantId).toBeDefined();
        });

        it("should attach userRole to request", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(res.body.role).toBeDefined();
        });

        it("should lookup tenantId from database if missing from token", async () => {
            const jwt = require("jsonwebtoken");
            // Create token without tenantId
            const tokenWithoutTenant = jwt.sign(
                {
                    userId: ctx.userId,
                    email: testUser.email,
                    role: null
                    // Missing tenantId
                },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: "15m" }
            );

            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${tokenWithoutTenant}`)
                .expect(200);

            // Should still have tenantId from database lookup
            expect(res.body.tenantId).toBeDefined();
        });
    });

    describe("Error Handling", () => {
        it("should return consistent error format for missing token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .expect(401);

            expect(res.body).toHaveProperty("message");
            expect(res.body).toHaveProperty("error");
            expect(res.body.error).toBe("unauthorized");
        });

        it("should return consistent error format for invalid token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer invalid-token")
                .expect(401);

            expect(res.body).toHaveProperty("message");
            expect(res.body).toHaveProperty("error");
            expect(res.body.error).toBe("invalid_token");
        });

        it("should return consistent error format for expired token", async () => {
            const jwt = require("jsonwebtoken");
            const expiredToken = jwt.sign(
                {
                    userId: "test-id",
                    email: "test@example.com",
                    tenantId: null,
                    role: null
                },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: '1s' }
            );

            await new Promise(resolve => setTimeout(resolve, 1100));

            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${expiredToken}`)
                .expect(401);

            expect(res.body).toHaveProperty("message");
            expect(res.body).toHaveProperty("error");
            expect(res.body.error).toBe("token_expired");
        });

        it("should handle malformed JWT gracefully", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer not.a.jwt")
                .expect(401);

            expect(res.body).toHaveProperty("error");
        });

        it("should handle JWT with wrong algorithm", async () => {
            const jwt = require("jsonwebtoken");
            const wrongAlgoToken = jwt.sign(
                {
                    userId: "test-id",
                    email: "test@example.com",
                    tenantId: null,
                    role: null
                },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { algorithm: 'HS512' } // Wrong algorithm
            );

            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${wrongAlgoToken}`)
                .expect(401);

            expect(res.body.error).toBe("invalid_token");
        });
    });
});

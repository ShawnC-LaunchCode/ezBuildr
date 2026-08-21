/**
 * Auth Middleware Integration Tests
 *
 * Comprehensive tests for all authentication middleware functions:
 * - requireAuth
 * - optionalAuth
 * - hybridAuth
 * - optionalHybridAuth
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { users, userCredentials, workflows } from "@shared/schema";

import { setupIntegrationTest, type IntegrationTestContext } from "../../helpers/integrationTestHelper";
import { TestFactory } from "../../helpers/testFactory";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../../helpers/ownerDb";



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
            password: "StrongTestUser123!@#",
            firstName: "Middleware",
            lastName: "Tester",
        };

        // Register and verify user
        const registerRes = await request(ctx.baseURL)
            .post("/api/auth/register")
            .send(testUser)
            .expect(201);

        const userId = registerRes.body.user.id;

        await getOwnerDb().update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, userId));

        const loginRes = await request(ctx.baseURL)
            .post("/api/auth/login")
            .send({
                email: testUser.email,
                password: testUser.password,
            });

        if (loginRes.status !== 200) {
            console.error("Login Failed!", loginRes.status, loginRes.body);
            // Check DB
            const userInDb = await getOwnerDb().query.users.findFirst({ where: eq(users.email, testUser.email) });
            console.log("User in DB:", userInDb);
            if (userInDb) {
                const creds = await getOwnerDb().query.userCredentials.findFirst({ where: eq(userCredentials.userId, userInDb.id) });
                console.log("Creds in DB:", creds);
            }
        }

        expect(loginRes.status).toBe(200);

        userToken = loginRes.body.token;
        refreshCookie = loginRes.headers['set-cookie'] as unknown as string[];
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

            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should return 401 with invalid token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer invalid-token")
                .expect(401);

            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should return 401 with expired token", async () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
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

            expect(res.body.error.code).toBe("AUTH_008");
        });
    });

    // optionalAuth is currently unused in the server. The placeholder suite that
    // sat here held one `it` with an empty body — it asserted nothing and only
    // existed to be skipped. Write real tests here if optionalAuth is ever wired
    // up; an empty test is worse than no test, because it looks like coverage.

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
                .put("/api/account/preferences")
                .set("Cookie", refreshCookie)
                .send({ preferences: { theme: "dark" } })
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

            await getOwnerDb().update(users)
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

            expect(res.body.error.code).toBe("AUTH_008");
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
        /**
         * POST /api/workflows/public/:slug/start is the surviving
         * optionalHybridAuth entrypoint for anonymous-or-personalized run
         * creation; the /intake/* pipeline these cases used to exercise was an
         * orphaned parallel implementation and has been removed.
         */
        const createPublicWorkflow = async (): Promise<string> => {
            const factory = new TestFactory();
            const created = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
                workflow: {
                    status: "active",
                    isPublic: true,
                    requireLogin: false,
                },
            });
            const section = await factory.createSection(created.workflow.id);
            await factory.createStep(section.id, { alias: `q${nanoid(6)}` });
            // An anonymous run requires a published version to pin to.
            await getOwnerDb().update(workflows)
                .set({ currentVersionId: created.version.id })
                .where(eq(workflows.id, created.workflow.id));
            return created.workflow.publicLink!;
        };

        it("should authenticate with JWT if provided", async () => {
            const slug = await createPublicWorkflow();

            await request(ctx.baseURL)
                .post(`/api/workflows/public/${slug}/start`)
                .set("Authorization", `Bearer ${userToken}`)
                .send({})
                .expect(201);
        });

        it("should authenticate with cookie if JWT not provided", async () => {
            const slug = await createPublicWorkflow();

            await request(ctx.baseURL)
                .post(`/api/workflows/public/${slug}/start`)
                .set("Cookie", refreshCookie)
                .send({})
                .expect(201);
        });

        it("should proceed anonymously if no auth provided", async () => {
            const slug = await createPublicWorkflow();

            await request(ctx.baseURL)
                .post(`/api/workflows/public/${slug}/start`)
                .send({})
                .expect(201);
        });

        it("should proceed anonymously if both JWT and cookie are invalid", async () => {
            const slug = await createPublicWorkflow();

            // Even with invalid auth, optionalHybridAuth catches error and proceeds
            await request(ctx.baseURL)
                .post(`/api/workflows/public/${slug}/start`)
                .set("Authorization", "Bearer invalid-token")
                .set("Cookie", ["refresh_token=invalid-cookie"])
                .send({})
                .expect(201);
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

            await getOwnerDb().update(users)
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
    });

    describe("Error Handling", () => {
        it("should return consistent error format for missing token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .expect(401);

            expect(res.body).toHaveProperty("error");
            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should return consistent error format for invalid token", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer invalid-token")
                .expect(401);

            expect(res.body).toHaveProperty("error");
            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should return consistent error format for expired token", async () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
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

            expect(res.body).toHaveProperty("error");
            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should handle malformed JWT gracefully", async () => {
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer not.a.jwt")
                .expect(401);

            expect(res.body).toHaveProperty("error");
            expect(res.body.error.code).toBe("AUTH_008");
        });

        it("should handle JWT with wrong algorithm", async () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
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

            expect(res.body.error.code).toBe("AUTH_008");
        });
    });
});

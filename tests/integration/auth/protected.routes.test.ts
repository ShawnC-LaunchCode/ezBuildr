/**
 * Protected Routes Integration Tests
 *
 * Tests authentication and authorization on protected API routes.
 * Covers bearer token validation, role-based access, and edge cases.
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { users, workflows, workflowRuns, organizationMemberships } from "@shared/schema";

import { db } from "../../../server/db";
import { setupIntegrationTest, type IntegrationTestContext } from "../../helpers/integrationTestHelper";



describe.sequential("Protected Routes Integration Tests", () => {
    let ctx: IntegrationTestContext;
    let testUser: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    };
    let userToken: string;

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Protected Routes Test Tenant",
            createProject: true,
            projectName: "Protected Routes Test Project",
            userRole: "admin",
            tenantRole: "owner",
        });
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    beforeEach(async () => {
        testUser = {
            email: `protected-test-${nanoid()}@example.com`,
            password: "StrongTestUser123!@#",
            firstName: "Protected",
            lastName: "Tester",
        };

        // Register and verify user
        const registerRes = await request(ctx.baseURL)
            .post("/api/auth/register")
            .send(testUser)
            .expect(201);

        const userId = registerRes.body.user.id;

        await db.update(users)
            .set({
                emailVerified: true,
                tenantId: ctx.tenantId,
                tenantRole: 'owner'
            })
            .where(eq(users.id, userId));

        // Add user to the common organization so they can create org-owned resources
        // This fixes the 403 error in "Cross-User Authorization" test
        if (ctx.orgId) {
            await db.insert(organizationMemberships).values({
                orgId: ctx.orgId,
                userId: userId,
                role: 'admin',
            });
        }

        const loginRes = await request(ctx.baseURL)
            .post("/api/auth/login")
            .send({
                email: testUser.email,
                password: testUser.password,
            })
            .expect(200);

        userToken = loginRes.body.token;
    });

    describe("GET Protected Routes", () => {
        it("should allow access with valid Bearer token", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);
        });

        it("should reject access without Authorization header", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .expect(401);
        });

        it("should reject access with empty Bearer token", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer ")
                .expect(401);
        });

        it("should reject access with malformed Authorization header", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "InvalidHeader")
                .expect(401);
        });

        it("should reject access with wrong token type", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Basic ${userToken}`)
                .expect(401);
        });
    });

    describe("POST Protected Routes", () => {
        it("should allow POST with valid Bearer token", async () => {
            const res = await request(ctx.baseURL)
                .post("/api/projects")
                .set("Authorization", `Bearer ${userToken}`)
                .send({ name: "Test Project" })
                .expect(201);

            expect(res.body.id).toBeDefined();
        });

        it("should reject POST without Bearer token", async () => {
            await request(ctx.baseURL)
                .post("/api/projects")
                .send({ name: "Test Project" })
                .expect(401);
        });

        it("should reject POST with invalid token", async () => {
            await request(ctx.baseURL)
                .post("/api/projects")
                .set("Authorization", "Bearer invalid-token")
                .send({ name: "Test Project" })
                .expect(401);
        });
    });

    describe("PUT Protected Routes", () => {
        it("should allow PUT with valid Bearer token", async () => {
            await request(ctx.baseURL)
                .put("/api/account/preferences")
                .set("Authorization", `Bearer ${userToken}`)
                .send({ defaultMode: "advanced" })
                .expect(200);
        });

        it("should reject PUT without Bearer token", async () => {
            await request(ctx.baseURL)
                .put("/api/account/preferences")
                .send({ defaultMode: "advanced" })
                .expect(401);
        });
    });

    describe("DELETE Protected Routes", () => {
        it("should allow DELETE with valid Bearer token", async () => {
            // Create a project first
            const projectRes = await request(ctx.baseURL)
                .post("/api/projects")
                .set("Authorization", `Bearer ${userToken}`)
                .send({ name: "Delete Test Project" })
                .expect(201);

            // Delete it
            await request(ctx.baseURL)
                .delete(`/api/projects/${projectRes.body.id}`)
                .set("Authorization", `Bearer ${userToken}`)
                .expect(204);
        });

        it("should reject DELETE without Bearer token", async () => {
            await request(ctx.baseURL)
                .delete("/api/projects/00000000-0000-0000-0000-000000000000")
                .expect(401);
        });
    });

    describe("PATCH Protected Routes", () => {
        it("should allow PATCH with valid Bearer token", async () => {
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({ name: "PATCH Test Workflow" })
                .expect(201);

            await request(ctx.baseURL)
                .patch(`/api/workflows/${workflowRes.body.id}`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({ name: "Updated Name" })
                .expect(200);
        });

        it("should reject PATCH without Bearer token", async () => {
            await request(ctx.baseURL)
                .patch("/api/workflows/some-id")
                .send({ name: "Updated" })
                .expect(401);
        });
    });

    describe("Token Edge Cases", () => {
        it("should handle Bearer token with extra spaces", async () => {
            // Most implementations should handle this gracefully
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer  ${userToken}`)
                .expect(401); // Extra space makes it invalid
        });

        it.skip("should handle token with newlines", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}\n`)
                .expect(401);
        });

        it("should handle very long invalid token", async () => {
            const longToken = "a".repeat(10000);
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${longToken}`)
                .expect(401);
        });

        it("should handle empty Authorization header", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "")
                .expect(401);
        });

        it("should handle Authorization header with only Bearer", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer")
                .expect(401);
        });

        it("should handle multiple Authorization headers", async () => {
            // Express typically uses the first header
            const res = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .set("Authorization", "Bearer invalid-token");

            // Behavior depends on implementation
            expect([200, 401]).toContain(res.status);
        });

        it("should reject token with SQL injection attempt", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer '; DROP TABLE users; --")
                .expect(401);
        });

        it("should reject token with XSS attempt", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", "Bearer <script>alert('xss')</script>")
                .expect(401);
        });
    });

    describe("Token Payload Validation", () => {
        it("should reject token with missing userId", async () => {
            const jwt = require("jsonwebtoken");
            const invalidToken = jwt.sign(
                { email: testUser.email }, // Missing userId
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: "15m" }
            );

            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${invalidToken}`)
                .expect(401);
        });

        it("should reject token with non-existent userId", async () => {
            const jwt = require("jsonwebtoken");
            const invalidToken = jwt.sign(
                {
                    userId: "non-existent-id",
                    email: testUser.email,
                    tenantId: null,
                    role: null
                },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: "15m" }
            );

            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${invalidToken}`)
                .expect(404);
        });
    });

    describe("Cross-User Authorization", () => {
        it("should not allow user to access another user's resources", async () => {
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

            const user2Id = user2Res.body.user.id;

            await db.update(users)
                .set({
                    emailVerified: true,
                    tenantId: ctx.tenantId,
                    tenantRole: 'viewer'
                })
                .where(eq(users.id, user2Id));

            const user2LoginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: user2.email,
                    password: user2.password,
                })
                .expect(200);

            const user2Token = user2LoginRes.body.token;

            // User1 creates a project (Org Owned)
            const projectRes = await request(ctx.baseURL)
                .post("/api/projects")
                .set("Authorization", `Bearer ${userToken}`)
                .send({
                    name: "User1's Project",
                    ownerType: 'org',
                    ownerUuid: ctx.orgId
                })
                .expect(201);

            // User2 tries to delete User1's project
            await request(ctx.baseURL)
                .delete(`/api/projects/${projectRes.body.id}`)
                .set("Authorization", `Bearer ${user2Token}`)
                .expect(403);
        });
    });

    describe("User Context Injection", () => {
        it("should inject userId into request context", async () => {
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(meRes.body.email).toBe(testUser.email);
        });

        it("should inject tenantId into request context", async () => {
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(meRes.body.tenantId).toBeDefined();
        });

        it("should inject role into request context", async () => {
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(meRes.body.role).toBeDefined();
        });
    });

    describe("Rate Limiting on Protected Routes", () => {
        it("should not apply general rate limiting to authenticated requests", async () => {
            // Make many requests in quick succession
            const requests = [];
            for (let i = 0; i < 20; i++) {
                requests.push(
                    request(ctx.baseURL)
                        .get("/api/auth/me")
                        .set("Authorization", `Bearer ${userToken}`)
                );
            }

            const responses = await Promise.all(requests);

            // All should succeed (no rate limit on authenticated routes)
            responses.forEach(res => {
                expect(res.status).toBe(200);
            });
        });
    });

    describe("Mixed Auth Scenarios", () => {
        it("should handle request with both Bearer token and cookies", async () => {
            const loginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            const cookies = loginRes.headers['set-cookie'];

            // Request with both Bearer and cookie
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .set("Cookie", cookies)
                .expect(200);

            expect(meRes.body.email).toBe(testUser.email);
        });

        it("should prioritize Bearer token over cookie when both present", async () => {
            // Create two users
            const user1LoginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

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
                .set("Cookie", user1LoginRes.headers['set-cookie'])
                .expect(200);

            // Should authenticate as user2 (Bearer wins)
            expect(meRes.body.email).toBe(user2.email);
        });
    });

    describe("Optional Auth Routes", () => {
        it("should allow unauthenticated access to optional auth routes", async () => {
            // Create public workflow
            const slug = `public-${nanoid()}`;
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Public Workflow",
                    slug: slug, // Set slug for intake access
                })
                .expect(201);

            // Manually publish workflow and set isPublic (API might not expose all fields)
            await db.update(workflows)
                .set({
                    isPublic: true,
                    status: 'active',
                    slug: slug,
                    intakeConfig: { allowPrefill: false }
                })
                .where(eq(workflows.id, workflowRes.body.id));

            // Create intake run without authentication
            const res = await request(ctx.baseURL)
                .post("/intake/runs")
                .send({ slug })
                .expect(201);

            // Verify anonymous creation
            const run = await db.query.workflowRuns.findFirst({
                where: eq(workflowRuns.id, res.body.data.runId)
            });

            expect(run).toBeDefined();
            expect(run.createdBy).toBe("anon");
        });

        it("should enhance optional auth routes with user context when authenticated", async () => {
            const slug = `optional-${nanoid()}`;
            const workflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Optional Auth Workflow",
                    slug: slug,
                })
                .expect(201);

            // Manually publish
            await db.update(workflows)
                .set({
                    isPublic: true,
                    status: 'active',
                    slug: slug,
                    intakeConfig: { allowPrefill: false }
                })
                .where(eq(workflows.id, workflowRes.body.id));

            // Create intake run WITH authentication
            const res = await request(ctx.baseURL)
                .post("/intake/runs")
                .set("Authorization", `Bearer ${userToken}`)
                .send({ slug })
                .expect(201);

            // Verify authenticated creation
            const run = await db.query.workflowRuns.findFirst({
                where: eq(workflowRuns.id, res.body.data.runId)
            });

            // Get the userId from the token used
            const meRes = await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${userToken}`)
                .expect(200);

            expect(run).toBeDefined();
            expect(run.createdBy).toBe(`creator:${meRes.body.id}`);
        });
    });
});

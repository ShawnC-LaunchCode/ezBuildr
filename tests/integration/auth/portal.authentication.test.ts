/**
 * Portal Authentication Integration Tests
 *
 * Tests magic link authentication, portal token generation/validation,
 * and anonymous user flows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { setupIntegrationTest, type IntegrationTestContext } from "../../helpers/integrationTestHelper";
import { db } from "../../../server/db";
import { portalUsers, magicLinkTokens, workflowRuns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";

describe.sequential("Portal Authentication Integration Tests", () => {
    let ctx: IntegrationTestContext;
    let workflowId: string;

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Portal Test Tenant",
            createProject: true,
            projectName: "Portal Test Project",
            userRole: "admin",
            tenantRole: "owner",
        });

        // Create a test workflow
        const workflowRes = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/workflows`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({
                name: "Portal Test Workflow",
                publicLink: `portal-test-${nanoid()}`,
            })
            .expect(201);

        workflowId = workflowRes.body.id;
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    describe("Magic Link Generation", () => {
        it("should send magic link to valid email", async () => {
            const email = `portal-test-${nanoid()}@example.com`;

            // Create portal user first
            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            const res = await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain("magic link");

            // Verify token was created in database
            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            expect(tokens.length).toBeGreaterThan(0);
        });

        it("should not reveal if email does not exist", async () => {
            const nonExistentEmail = `nonexistent-${nanoid()}@example.com`;

            const res = await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email: nonExistentEmail })
                .expect(200);

            // Should return same success message
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain("magic link");
        });

        it("should reject invalid email format", async () => {
            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email: "invalid-email" })
                .expect(400);
        });

        it("should rate limit magic link requests (3 per 15 minutes)", async () => {
            const email = `rate-limit-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            // First 3 requests should succeed
            for (let i = 0; i < 3; i++) {
                await request(ctx.baseURL)
                    .post("/api/portal/auth/send")
                    .send({ email })
                    .expect(200);
            }

            // 4th request should be rate limited
            const res = await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(429);

            expect(res.body.error).toContain("Too many");
        });

        it("should add artificial delay to prevent timing attacks", async () => {
            const email = `timing-test-${nanoid()}@example.com`;

            const start = Date.now();
            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);
            const duration = Date.now() - start;

            // Should take at least 500ms due to artificial delay
            expect(duration).toBeGreaterThanOrEqual(500);
        });
    });

    describe("Magic Link Verification", () => {
        it("should verify valid magic link token and return portal JWT", async () => {
            const email = `verify-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            // Send magic link
            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            // Get token from database
            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            expect(tokens.length).toBeGreaterThan(0);
            const magicToken = tokens[0].token;

            // Verify token
            const verifyRes = await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: magicToken })
                .expect(200);

            expect(verifyRes.body.success).toBe(true);
            expect(verifyRes.body.email).toBe(email);
            expect(verifyRes.body.token).toBeDefined();

            // Verify it's a valid JWT
            const decoded = jwt.decode(verifyRes.body.token) as any;
            expect(decoded.email).toBe(email);
            expect(decoded.portal).toBe(true);
        });

        it("should reject invalid magic link token", async () => {
            await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: "invalid-token" })
                .expect(401);
        });

        it("should reject expired magic link token", async () => {
            const email = `expired-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            // Send magic link
            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            // Get token from database
            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const tokenId = tokens[0].id;

            // Update token to be expired
            const expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() - 25); // 25 hours ago

            await db.update(magicLinkTokens)
                .set({ expiresAt: expiredDate })
                .where(eq(magicLinkTokens.id, tokenId));

            // Try to verify expired token
            await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: tokens[0].token })
                .expect(401);
        });

        it("should consume magic link token after use", async () => {
            const email = `consume-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const magicToken = tokens[0].token;

            // First verification should succeed
            await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: magicToken })
                .expect(200);

            // Second verification should fail (token already used)
            await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: magicToken })
                .expect(401);
        });
    });

    describe("Portal Token Authentication", () => {
        it("should authenticate portal user with portal JWT", async () => {
            const email = `portal-jwt-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const verifyRes = await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: tokens[0].token })
                .expect(200);

            const portalToken = verifyRes.body.token;

            // Use portal token to access portal routes
            const meRes = await request(ctx.baseURL)
                .get("/api/portal/me")
                .set("Authorization", `Bearer ${portalToken}`)
                .expect(200);

            expect(meRes.body.authenticated).toBe(true);
            expect(meRes.body.email).toBe(email);
        });

        it("should reject invalid portal token", async () => {
            const fakeToken = jwt.sign(
                { email: "fake@example.com", portal: true },
                "wrong-secret",
                { expiresIn: "24h" }
            );

            await request(ctx.baseURL)
                .get("/api/portal/me")
                .set("Authorization", `Bearer ${fakeToken}`)
                .expect(200); // Returns unauthenticated response, not 401

            const res = await request(ctx.baseURL)
                .get("/api/portal/me")
                .set("Authorization", `Bearer ${fakeToken}`);

            expect(res.body.authenticated).toBe(false);
        });

        it("should list runs for authenticated portal user", async () => {
            const email = `portal-runs-test-${nanoid()}@example.com`;

            const portalUser = await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            }).returning();

            // Create a run for this portal user
            await db.insert(workflowRuns).values({
                workflowId,
                portalUserId: portalUser[0].id,
                runToken: nanoid(),
                createdAt: new Date(),
                completed: false,
                progress: 0,
            });

            // Get portal token
            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const verifyRes = await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: tokens[0].token })
                .expect(200);

            const portalToken = verifyRes.body.token;

            // List runs
            const runsRes = await request(ctx.baseURL)
                .get("/api/portal/runs")
                .set("Authorization", `Bearer ${portalToken}`)
                .expect(200);

            expect(Array.isArray(runsRes.body)).toBe(true);
            expect(runsRes.body.length).toBeGreaterThan(0);
        });

        it("should require portal token for protected portal routes", async () => {
            await request(ctx.baseURL)
                .get("/api/portal/runs")
                .expect(401);
        });
    });

    describe("Portal Token Expiration", () => {
        it("should set portal token expiry to 24 hours", async () => {
            const email = `portal-expiry-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const verifyRes = await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: tokens[0].token })
                .expect(200);

            const decoded = jwt.decode(verifyRes.body.token) as any;
            const expiryTime = decoded.exp - decoded.iat;

            // 24 hours = 86400 seconds
            expect(expiryTime).toBe(86400);
        });

        it("should reject expired portal token", async () => {
            const email = `expired-portal-test-${nanoid()}@example.com`;

            // Create expired portal token
            const expiredToken = jwt.sign(
                { email, portal: true },
                process.env.JWT_SECRET || process.env.SESSION_SECRET || 'insecure-dev-only-secret-DO-NOT-USE-IN-PRODUCTION',
                { expiresIn: '1s' }
            );

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100));

            const res = await request(ctx.baseURL)
                .get("/api/portal/me")
                .set("Authorization", `Bearer ${expiredToken}`)
                .expect(200);

            expect(res.body.authenticated).toBe(false);
        });
    });

    describe("Portal Logout", () => {
        it("should allow stateless logout", async () => {
            await request(ctx.baseURL)
                .post("/api/portal/auth/logout")
                .expect(200);
        });

        it("should return success message on logout", async () => {
            const res = await request(ctx.baseURL)
                .post("/api/portal/auth/logout")
                .expect(200);

            expect(res.body.success).toBe(true);
        });
    });

    describe("Anonymous User Flows", () => {
        it("should allow anonymous workflow run creation", async () => {
            // Create public workflow
            const publicWorkflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Anonymous Test Workflow",
                    publicLink: `anon-${nanoid()}`,
                })
                .expect(201);

            // Create anonymous run
            const runRes = await request(ctx.baseURL)
                .post(`/api/workflows/${publicWorkflowRes.body.id}/runs`)
                .send({
                    anonymous: true,
                })
                .expect(201);

            expect(runRes.body.runToken).toBeDefined();
            expect(runRes.body.id).toBeDefined();
        });

        it("should track anonymous runs with fingerprint", async () => {
            const publicWorkflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Fingerprint Test Workflow",
                    publicLink: `fingerprint-${nanoid()}`,
                })
                .expect(201);

            const fingerprint = `fp-${nanoid()}`;

            const runRes = await request(ctx.baseURL)
                .post(`/api/workflows/${publicWorkflowRes.body.id}/runs`)
                .set("X-Fingerprint", fingerprint)
                .send({
                    anonymous: true,
                })
                .expect(201);

            expect(runRes.body.runToken).toBeDefined();

            // Verify run in database has fingerprint tracking
            const runs = await db.query.workflowRuns.findMany({
                where: eq(workflowRuns.id, runRes.body.id),
            });

            expect(runs.length).toBe(1);
        });

        it("should allow anonymous run to use run token", async () => {
            const publicWorkflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Run Token Test Workflow",
                    publicLink: `run-token-${nanoid()}`,
                })
                .expect(201);

            const runRes = await request(ctx.baseURL)
                .post(`/api/workflows/${publicWorkflowRes.body.id}/runs`)
                .send({
                    anonymous: true,
                })
                .expect(201);

            const runToken = runRes.body.runToken;

            // Use run token to access run
            const getRunRes = await request(ctx.baseURL)
                .get(`/api/runs/${runRes.body.id}`)
                .set("Authorization", `Bearer ${runToken}`)
                .expect(200);

            expect(getRunRes.body.id).toBe(runRes.body.id);
        });

        it("should not allow anonymous access to protected workflows", async () => {
            const privateWorkflowRes = await request(ctx.baseURL)
                .post(`/api/projects/${ctx.projectId}/workflows`)
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .send({
                    name: "Private Test Workflow",
                    // No publicLink = private
                })
                .expect(201);

            // Try to create run without auth
            await request(ctx.baseURL)
                .post(`/api/workflows/${privateWorkflowRes.body.id}/runs`)
                .send({
                    anonymous: true,
                })
                .expect(401);
        });
    });

    describe("Portal vs Regular Auth Isolation", () => {
        it("should not allow portal token for regular API routes", async () => {
            const email = `isolation-test-${nanoid()}@example.com`;

            await db.insert(portalUsers).values({
                email,
                workflowId,
                createdAt: new Date(),
            });

            await request(ctx.baseURL)
                .post("/api/portal/auth/send")
                .send({ email })
                .expect(200);

            const tokens = await db.query.magicLinkTokens.findMany({
                where: eq(magicLinkTokens.email, email),
            });

            const verifyRes = await request(ctx.baseURL)
                .post("/api/portal/auth/verify")
                .send({ token: tokens[0].token })
                .expect(200);

            const portalToken = verifyRes.body.token;

            // Try to use portal token for regular API
            await request(ctx.baseURL)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${portalToken}`)
                .expect(401);
        });

        it("should not allow regular JWT for portal routes", async () => {
            // Try to use regular JWT for portal routes
            const runsRes = await request(ctx.baseURL)
                .get("/api/portal/runs")
                .set("Authorization", `Bearer ${ctx.authToken}`)
                .expect(401);
        });
    });
});

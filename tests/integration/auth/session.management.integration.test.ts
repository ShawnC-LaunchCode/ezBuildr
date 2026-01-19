/**
 * Session Management Integration Tests
 *
 * Tests session listing, revocation, device management, and trusted devices.
 * Covers multi-device login scenarios and session security features.
 */
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { refreshTokens, users } from "@shared/schema";
import { db } from "../../../server/db";
import { setupIntegrationTest, type IntegrationTestContext } from "../../helpers/integrationTestHelper";
describe.sequential("Session Management Integration Tests", () => {
    let ctx: IntegrationTestContext;
    let testUser: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    };
    let userId: string;
    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Session Test Tenant",
            createProject: false,
            userRole: "admin",
            tenantRole: "owner",
        });
    });
    afterAll(async () => {
        await ctx.cleanup();
    });
    beforeEach(async () => {
        testUser = {
            email: `session-test-${nanoid()}@example.com`,
            password: "StrongTestUser123!@#",
            firstName: "Session",
            lastName: "Tester",
        };
        // Register and verify user
        const registerRes = await request(ctx.baseURL)
            .post("/api/auth/register")
            .send(testUser)
            .expect(201);
        userId = registerRes.body.user.id;
        // Mark email as verified
        await db.update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, userId));
        // Clean up registration session (tests expect only explicit logins to create sessions)
        await db.update(refreshTokens)
            .set({ revoked: true })
            .where(eq(refreshTokens.userId, userId));
    });
    describe("Session Creation and Tracking", () => {
        it("should create refresh token on login", async () => {
            const loginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            expect(loginRes.headers['set-cookie']).toBeDefined();
            // Verify refresh token in database
            const tokens = await db.query.refreshTokens.findMany({
                where: and(
                    eq(refreshTokens.userId, userId),
                    eq(refreshTokens.revoked, false)
                ),
            });
            expect(tokens.length).toBeGreaterThan(0);
            expect(tokens[0].revoked).toBe(false);
        });
        it("should track device metadata in session", async () => {
            const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0";
            const loginRes = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", userAgent)
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const tokens = await db.query.refreshTokens.findMany({
                where: eq(refreshTokens.userId, userId),
            });
            expect(tokens.length).toBeGreaterThan(0);
            expect(tokens[0].deviceName).toBeDefined();
            expect(tokens[0].ipAddress).toBeDefined();
        });
        it("should create separate sessions for multiple device logins", async () => {
            // Login from device 1
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Login from device 2
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Login from device 3
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Safari/17.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const tokens = await db.query.refreshTokens.findMany({
                where: and(
                    eq(refreshTokens.userId, userId),
                    eq(refreshTokens.revoked, false)
                ),
            });
            expect(tokens.length).toBe(3);
        });
    });
    describe("GET /api/auth/sessions", () => {
        it("should list all active sessions for user", async () => {
            // Create multiple sessions
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Safari/17.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // List sessions
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            expect(sessionsRes.body.sessions).toHaveLength(3);
            expect(sessionsRes.body.sessions[0]).toHaveProperty("id");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("deviceName");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("location");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("ipAddress");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("lastUsedAt");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("createdAt");
            expect(sessionsRes.body.sessions[0]).toHaveProperty("current");
        });
        it("should mark current session correctly", async () => {
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            const currentSessions = sessionsRes.body.sessions.filter((s: any) => s.current);
            expect(currentSessions).toHaveLength(1);
        });
        it("should not include revoked sessions", async () => {
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const session2 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Get all sessions to find session2's ID
            const allSessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            const session2Info = allSessionsRes.body.sessions.find((s: any) => !s.current);
            // Revoke session2
            await request(ctx.baseURL)
                .delete(`/api/auth/sessions/${session2Info.id}`)
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            // List sessions again
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            expect(sessionsRes.body.sessions).toHaveLength(1);
        });
        it("should order sessions by last used (most recent first)", async () => {
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await new Promise(resolve => setTimeout(resolve, 100));
            const session2 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await new Promise(resolve => setTimeout(resolve, 100));
            const session3 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session3.body.token}`)
                .set("Cookie", session3.headers['set-cookie'])
                .expect(200);
            // Most recent should be first
            expect(sessionsRes.body.sessions[0].deviceName).toContain("Safari");
        });
        it("should require authentication", async () => {
            await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .expect(401);
        });
    });
    describe("DELETE /api/auth/sessions/:sessionId", () => {
        it("should revoke specific session", async () => {
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const session2 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Get sessions to find session2's ID
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            const session2Info = sessionsRes.body.sessions.find((s: any) => !s.current);
            // Revoke session2
            await request(ctx.baseURL)
                .delete(`/api/auth/sessions/${session2Info.id}`)
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            // Try to use session2's refresh token
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", session2.headers['set-cookie'])
                .expect(401);
        });
        it("should prevent revoking current session", async () => {
            const session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const sessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(200);
            const currentSession = sessionsRes.body.sessions.find((s: any) => s.current);
            // Try to revoke current session
            const revokeRes = await request(ctx.baseURL)
                .delete(`/api/auth/sessions/${currentSession.id}`)
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(400);
            expect(revokeRes.body.message).toContain("current session");
        });
        it("should not allow revoking other users sessions", async () => {
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
            const user2Session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: user2.email,
                    password: user2.password,
                })
                .expect(200);
            // User1 tries to get user2's sessions
            const user2SessionsRes = await request(ctx.baseURL)
                .get("/api/auth/sessions")
                .set("Authorization", `Bearer ${user2Session.body.token}`)
                .set("Cookie", user2Session.headers['set-cookie'])
                .expect(200);
            const user2SessionId = user2SessionsRes.body.sessions[0].id;
            // Login as user1
            const user1Session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // User1 tries to revoke user2's session
            await request(ctx.baseURL)
                .delete(`/api/auth/sessions/${user2SessionId}`)
                .set("Authorization", `Bearer ${user1Session.body.token}`)
                .set("Cookie", user1Session.headers['set-cookie'])
                .expect(404);
        });
        it("should return 404 for non-existent session ID", async () => {
            const session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            await request(ctx.baseURL)
                .delete("/api/auth/sessions/non-existent-id")
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(404);
        });
    });
    describe("DELETE /api/auth/sessions/all", () => {
        it("should revoke all sessions except current", async () => {
            const session1 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Chrome/120.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const session2 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Firefox/121.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const session3 = await request(ctx.baseURL)
                .post("/api/auth/login")
                .set("User-Agent", "Safari/17.0")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Revoke all from session1
            await request(ctx.baseURL)
                .delete("/api/auth/sessions/all")
                .set("Authorization", `Bearer ${session1.body.token}`)
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            // Session1 should still work
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", session1.headers['set-cookie'])
                .expect(200);
            // Session2 and Session3 should not work
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", session2.headers['set-cookie'])
                .expect(401);
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", session3.headers['set-cookie'])
                .expect(401);
        });
        it("should revoke all trusted devices", async () => {
            const session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Trust device
            await request(ctx.baseURL)
                .post("/api/auth/trust-device")
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(200);
            // Revoke all sessions
            await request(ctx.baseURL)
                .delete("/api/auth/sessions/all")
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(200);
            // Check trusted devices
            const trustedDevicesRes = await request(ctx.baseURL)
                .get("/api/auth/trusted-devices")
                .set("Authorization", `Bearer ${session.body.token}`)
                .set("Cookie", session.headers['set-cookie'])
                .expect(200);
            expect(trustedDevicesRes.body.devices).toHaveLength(0);
        });
        it("should require active session", async () => {
            await request(ctx.baseURL)
                .delete("/api/auth/sessions/all")
                .expect(401);
        });
    });
    describe("Session Expiration", () => {
        it("should reject refresh token after 30 days", async () => {
            const session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            // Get the refresh token from database (non-revoked only)
            const tokens = await db.query.refreshTokens.findMany({
                where: and(
                    eq(refreshTokens.userId, userId),
                    eq(refreshTokens.revoked, false)
                ),
            });
            const token = tokens[0];
            // Update token to be expired
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 31); // 31 days ago
            await db.update(refreshTokens)
                .set({ expiresAt: expiredDate })
                .where(eq(refreshTokens.id, token.id));
            // Try to use expired token
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", session.headers['set-cookie'])
                .expect(401);
        });
    });
    describe("Concurrent Session Handling", () => {
        it("should handle multiple concurrent logins", async () => {
            const logins = await Promise.all([
                request(ctx.baseURL)
                    .post("/api/auth/login")
                    .set("User-Agent", "Chrome/120.0")
                    .send({ email: testUser.email, password: testUser.password }),
                request(ctx.baseURL)
                    .post("/api/auth/login")
                    .set("User-Agent", "Firefox/121.0")
                    .send({ email: testUser.email, password: testUser.password }),
                request(ctx.baseURL)
                    .post("/api/auth/login")
                    .set("User-Agent", "Safari/17.0")
                    .send({ email: testUser.email, password: testUser.password }),
            ]);
            logins.forEach(res => {
                expect(res.status).toBe(200);
                expect(res.body.token).toBeDefined();
            });
            const tokens = await db.query.refreshTokens.findMany({
                where: and(
                    eq(refreshTokens.userId, userId),
                    eq(refreshTokens.revoked, false)
                ),
            });
            expect(tokens.length).toBe(3);
        });
        it("should handle concurrent token refreshes", async () => {
            const session = await request(ctx.baseURL)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);
            const cookies = session.headers['set-cookie'];
            // First refresh should succeed
            const refresh1 = await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", cookies)
                .expect(200);
            // Second concurrent refresh with old cookie should fail
            // This triggers token reuse detection, which revokes ALL user sessions for security
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", cookies)
                .expect(401);
            // Third refresh with new cookie should also fail (all sessions revoked for security)
            await request(ctx.baseURL)
                .post("/api/auth/refresh-token")
                .set("Cookie", refresh1.headers['set-cookie'])
                .expect(401);
        });
    });
});
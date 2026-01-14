import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

import { refreshTokens } from "@shared/schema";

import { db } from "../../server/db";
import { createTestApp } from "../helpers/testApp";
import {
  cleanAuthTables,
  deleteTestUser,
  createVerifiedUser,
} from "../helpers/testUtils";

import type { Express } from "express";




/**
 * Session Management Integration Tests (REAL)
 * Tests multi-device session management, revocation, and device tracking
 */

describe("Session Management Integration Tests (REAL)", () => {
  let app: Express;
  // Track created users for cleanup
  const createdUserIds: string[] = [];

  // Helper to track user creation
  const trackUser = (userId: string) => {
    createdUserIds.push(userId);
    return userId;
  };

  beforeAll(async () => {
    app = createTestApp();
  });

  // NO GLOBAL CLEANUP to allow parallel runs
  // beforeEach(async () => {
  //   await cleanAuthTables();
  // });

  afterEach(async () => {
    // specific cleanup for users created in this test block
    while (createdUserIds.length > 0) {
      const userId = createdUserIds.pop();
      if (userId) {
        await deleteTestUser(userId);
      }
    }
  });

  describe("GET /api/auth/sessions", () => {
    it("should list all active sessions for current user", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 3 sessions from different "devices"
      const session1 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .send({ email, password });

      const session2 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)")
        .send({ email, password });

      const session3 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
        .send({ email, password });

      const token = session3.body.token;
      const cookies = (session3.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // List sessions
      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeDefined();
      expect(response.body.sessions.length).toBe(3);

      // Verify session properties
      const sessions = response.body.sessions;
      expect(sessions[0]).toHaveProperty("id");
      expect(sessions[0]).toHaveProperty("deviceName");
      expect(sessions[0]).toHaveProperty("ipAddress");
      expect(sessions[0]).toHaveProperty("lastUsedAt");
      expect(sessions[0]).toHaveProperty("createdAt");
      expect(sessions[0]).toHaveProperty("current");

      // One session should be marked as current
      const currentSession = sessions.find((s: any) => s.current);
      expect(currentSession).toBeDefined();
    });

    it("should mark current session correctly", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 2 sessions
      await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const login2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login2.body.token;
      const cookies = (login2.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // List sessions with cookie (should identify current session)
      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      const sessions = response.body.sessions;
      const currentSessions = sessions.filter((s: any) => s.current);

      // Only one should be current
      expect(currentSessions.length).toBe(1);
    });

    it("should exclude revoked sessions", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 2 sessions
      const login1 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const login2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      // Manually revoke one session
      const allTokens = await db.query.refreshTokens.findMany({
        where: eq(refreshTokens.userId, userId),
      });

      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, allTokens[0].id));

      // List sessions
      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${login2.body.token}`);

      // Should only show 1 session (non-revoked)
      expect(response.body.sessions.length).toBe(1);
    });

    it("should order sessions by last used (most recent first)", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 3 sessions with delays
      await request(app).post("/api/auth/login").send({ email, password });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await request(app).post("/api/auth/login").send({ email, password });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const login3 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${login3.body.token}`);

      const sessions = response.body.sessions;

      // Should be ordered by lastUsedAt descending
      for (let i = 1; i < sessions.length; i++) {
        const prev = new Date(sessions[i - 1].lastUsedAt);
        const curr = new Date(sessions[i].lastUsedAt);
        expect(prev >= curr).toBe(true);
      }
    });

    it("should filter sessions by current user only", async () => {
      const user1 = await createVerifiedUser();
      trackUser(user1.userId);
      const user2 = await createVerifiedUser();
      trackUser(user2.userId);

      // User 1: 2 sessions
      await request(app)
        .post("/api/auth/login")
        .send({ email: user1.email, password: user1.password });

      const user1Login = await request(app)
        .post("/api/auth/login")
        .send({ email: user1.email, password: user1.password });

      // User 2: 1 session
      await request(app)
        .post("/api/auth/login")
        .send({ email: user2.email, password: user2.password });

      // User 1 should only see their 2 sessions
      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${user1Login.body.token}`);

      expect(response.body.sessions.length).toBe(2);
    });

    it("should return 401 for unauthenticated request", async () => {
      const response = await request(app).get("/api/auth/sessions");

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/auth/sessions/:sessionId", () => {
    it("should revoke specific session", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 2 sessions
      await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const login2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login2.body.token;

      // Get sessions
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      const sessions = sessionsResponse.body.sessions;
      const sessionToRevoke = sessions.find((s: any) => !s.current);

      // Revoke non-current session
      const revokeResponse = await request(app)
        .delete(`/api/auth/sessions/${sessionToRevoke.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.body.message).toContain("revoked");

      // Verify session was revoked in database
      const revokedToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.id, sessionToRevoke.id),
      });

      expect(revokedToken!.revoked).toBe(true);

      // Verify session no longer appears in list
      const newSessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      expect(newSessionsResponse.body.sessions.length).toBe(1);
    });

    it("should prevent revoking current session", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login.body.token;
      const cookies = (login.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // Get sessions
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      const currentSession = sessionsResponse.body.sessions.find(
        (s: any) => s.current
      );

      // Try to revoke current session
      const revokeResponse = await request(app)
        .delete(`/api/auth/sessions/${currentSession.id}`)
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      expect(revokeResponse.status).toBe(400);
      expect(revokeResponse.body.message).toContain("current session");
    });

    it("should return 404 for non-existent session", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const response = await request(app)
        .delete("/api/auth/sessions/non-existent-id")
        .set("Authorization", `Bearer ${login.body.token}`);

      expect(response.status).toBe(404);
    });

    it("should prevent revoking other user's session", async () => {
      const user1 = await createVerifiedUser();
      trackUser(user1.userId);
      const user2 = await createVerifiedUser();
      trackUser(user2.userId);

      // User 1 session
      const user1Login = await request(app)
        .post("/api/auth/login")
        .send({ email: user1.email, password: user1.password });

      // User 2 session
      const user2Login = await request(app)
        .post("/api/auth/login")
        .send({ email: user2.email, password: user2.password });

      // Get user 1's sessions
      const user1Sessions = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${user1Login.body.token}`);

      const user1SessionId = user1Sessions.body.sessions[0].id;

      // Try to revoke user 1's session as user 2
      const revokeResponse = await request(app)
        .delete(`/api/auth/sessions/${user1SessionId}`)
        .set("Authorization", `Bearer ${user2Login.body.token}`);

      expect(revokeResponse.status).toBe(404); // Session not found (ownership check)
    });
  });

  describe("DELETE /api/auth/sessions/all", () => {
    it("should revoke all other sessions", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 4 sessions
      await request(app).post("/api/auth/login").send({ email, password });
      await request(app).post("/api/auth/login").send({ email, password });
      await request(app).post("/api/auth/login").send({ email, password });

      const currentLogin = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = currentLogin.body.token;
      const cookies = (currentLogin.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // Revoke all except current
      const response = await request(app)
        .delete("/api/auth/sessions/all")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("all other devices");

      // Verify only 1 session remains
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      expect(sessionsResponse.body.sessions.length).toBe(1);
    });

    it("should keep current session active", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Create 2 sessions
      await request(app).post("/api/auth/login").send({ email, password });

      const currentLogin = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = currentLogin.body.token;
      const cookies = (currentLogin.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // Revoke all others
      await request(app)
        .delete("/api/auth/sessions/all")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      // Current session should still work
      const meResponse = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(meResponse.status).toBe(200);

      // Should be able to refresh with current token
      const refreshResponse = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", cookie!);

      expect(refreshResponse.status).toBe(200);
    });

    it("should return 400 if no active session found", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login.body.token;

      // Call without cookie (no refresh token)
      const response = await request(app)
        .delete("/api/auth/sessions/all")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("No active session");
    });

    it("should revoke all trusted devices", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login.body.token;
      const cookies = (login.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // Trust a device
      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${token}`);

      // Revoke all sessions
      await request(app)
        .delete("/api/auth/sessions/all")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      // Verify trusted devices were revoked
      const { trustedDevices } = await import("@shared/schema");
      const devices = await db.query.trustedDevices.findMany({
        where: eq(trustedDevices.userId, userId),
      });

      expect(devices.every((d) => d.revoked)).toBe(true);
    });

    it("should handle user with single session gracefully", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login.body.token;
      const cookies = (login.headers as any)["set-cookie"] as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token="));

      // Revoke all (but only one exists)
      const response = await request(app)
        .delete("/api/auth/sessions/all")
        .set("Authorization", `Bearer ${token}`)
        .set("Cookie", cookie!);

      expect(response.status).toBe(200);

      // Current session should still exist
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      expect(sessionsResponse.body.sessions.length).toBe(1);
    });
  });

  describe("Session Security", () => {
    it("should include device metadata in sessions", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/96.0")
        .set("X-Forwarded-For", "192.168.1.100")
        .send({ email, password });

      const token = login.body.token;

      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      const session = response.body.sessions[0];

      expect(session.deviceName).toBeDefined();
      expect(session.ipAddress).toBeDefined();
    });

    it("should not expose sensitive token data", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${login.body.token}`);

      const session = response.body.sessions[0];

      // Should NOT include token hash or metadata
      expect(session.token).toBeUndefined();
      expect(session.metadata).toBeUndefined();
    });

    it("should track session activity timestamps", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const response = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${login.body.token}`);

      const session = response.body.sessions[0];

      expect(session.createdAt).toBeDefined();
      expect(session.lastUsedAt).toBeDefined();
      expect(new Date(session.createdAt)).toBeInstanceOf(Date);
      expect(new Date(session.lastUsedAt)).toBeInstanceOf(Date);
    });
  });
});

import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

import { users, loginAttempts } from "@shared/schema";

import { db } from "../../server/db";
import { createTestApp ,
} from "../helpers/testApp";
import {
  cleanAuthTables, // Keeping import if needed for heavy reset, but favoring specific
  cleanTestUser,
  deleteTestUser,
  createVerifiedUser,
  createUserWithMfa,
  randomEmail,
  randomPassword,
  generateTotpCode,
  createPasswordResetToken
} from "../helpers/testUtils";

import type { Express } from "express";





/**
 * REAL Auth Routes Integration Tests
 * Tests complete authentication flows through actual HTTP endpoints
 */

describe("Auth Routes Integration Tests (REAL)", () => {
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
    // We clean in reverse order of creation just in case
    while (createdUserIds.length > 0) {
      const userId = createdUserIds.pop();
      if (userId) {
        await deleteTestUser(userId);
      }
    }
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const email = randomEmail();
      const password = randomPassword();

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password,
          firstName: "Test",
          lastName: "User",
        });

      expect(response.status).toBe(201);
      expect((response.body).message).toContain("Registration successful");
      expect((response.body).token).toBeDefined();
      expect((response.body).user).toBeDefined();
      expect((response.body).user.email).toBe(email);
      expect((response.body).user.emailVerified).toBe(false);

      // Verify user was created in database
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      expect(user).toBeDefined();
      expect(user!.email).toBe(email);
      trackUser(user!.id);
    });

    it("should return 400 for invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "invalid-email",
          password: "TestPassword123",
          firstName: "Test",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("email");
    });

    it("should return 400 for weak password", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: randomEmail(),
          password: "weak",
          firstName: "Test",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Password");
    });

    it("should return 409 for duplicate email", async () => {
      const email = randomEmail();
      const password = randomPassword();

      // Create user first
      await request(app)
        .post("/api/auth/register")
        .send({ email, password, firstName: "First" });

      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (user) {trackUser(user.id);}

      // Try to register again with same email
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email, password, firstName: "Second" });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("already exists");
    });

    it("should set httpOnly refresh token cookie", async () => {
      const email = randomEmail();
      const password = randomPassword();

      const response = await request(app)
        .post("/api/auth/register")
        .send({ email, password, firstName: "Test" });

      expect(response.status).toBe(201);
      expect(response.headers['set-cookie']).toBeDefined();

      const cookies = (response.headers as any)['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const refreshTokenCookie = cookies!.find(c => c.startsWith('refresh_token='));
      expect(refreshTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toContain('HttpOnly');
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(response.status).toBe(200);
      expect((response.body).message).toBe("Login successful");
      expect((response.body).token).toBeDefined();
      expect((response.body).user).toBeDefined();
      expect((response.body).user.email).toBe(email);

      // Verify refresh token cookie is set
      const cookies = (response.headers as any)['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const refreshTokenCookie = cookies!.find(c => c.startsWith('refresh_token='));
      expect(refreshTokenCookie).toBeDefined();
    });

    it("should return 401 for invalid password", async () => {
      const { email, userId } = await createVerifiedUser();
      trackUser(userId);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password: "WrongPassword123",
        });

      expect(response.status).toBe(401);
      expect(response.body).toBeDefined();
      expect(response.body.message || response.body.error).toBeDefined();
    });

    it("should return 401 for non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "TestPassword123",
        });

      expect(response.status).toBe(401);
      expect(response.body.message || response.body.error).toBeDefined();
    });

    it("should return 403 for unverified email", async () => {
      const email = randomEmail();
      const password = randomPassword();

      // Register user (unverified by default)
      await request(app)
        .post("/api/auth/register")
        .send({ email, password, firstName: "Test" });

      // Try to login
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(response.status).toBe(403);
      expect(response.body.message || response.body.error).toBeDefined();
    });

    it("should record failed login attempt", async () => {
      const { email, userId } = await createVerifiedUser();
      trackUser(userId);

      await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password: "WrongPassword",
        });

      // Check that failed attempt was recorded
      const attempts = await db.query.loginAttempts.findMany({
        where: eq(loginAttempts.email, email),
      });

      expect(attempts.length).toBeGreaterThan(0);
      const failedAttempt = attempts.find(a => !a.successful);
      expect(failedAttempt).toBeDefined();
    });

    it("should return requiresMfa=true for MFA-enabled users", async () => {
      const { email, password, userId } = await createUserWithMfa();
      trackUser(userId);

      const response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.requiresMfa).toBe(true);
      expect(response.body.userId).toBeDefined();
      expect(response.body.token).toBeUndefined(); // No token until MFA verified
    });

    it("should lock account after 5 failed attempts", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/login")
          .send({
            email,
            password: "WrongPassword",
          });
      }

      // 6th attempt should return locked error (even with correct password)
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password, // Correct password
        });

      expect(response.status).toBe(423);
      expect(response.body).toBeDefined();
      expect(response.body.error || response.body.message).toBeDefined();
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout and clear refresh token cookie", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Login first
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const cookies = (loginResponse.headers as any)['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const refreshTokenCookie = cookies!.find(c => c.startsWith('refresh_token='));
      expect(refreshTokenCookie).toBeDefined();

      // Logout
      const response = await request(app)
        .post("/api/auth/logout")
        .set('Cookie', refreshTokenCookie!);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Logout successful");

      // Verify cookie is cleared
      const logoutCookies = (response.headers as any)['set-cookie'] as string[];
      const clearedCookie = logoutCookies.find(c => c.startsWith('refresh_token='));
      expect(clearedCookie).toContain('Max-Age=0');
    });
  });

  describe("POST /api/auth/refresh-token", () => {
    it("should refresh access token with valid refresh token", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      // Login to get refresh token
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const cookies = (loginResponse.headers as any)['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const refreshTokenCookie = cookies!.find(c => c.startsWith('refresh_token='));
      expect(refreshTokenCookie).toBeDefined();

      // Refresh token
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set('Cookie', refreshTokenCookie!);

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();

      // Should get new refresh token (rotation)
      const newCookies = (response.headers as any)['set-cookie'] as string[] | undefined;
      expect(newCookies).toBeDefined();
      const newRefreshTokenCookie = newCookies!.find(c => c.startsWith('refresh_token='));
      expect(newRefreshTokenCookie).toBeDefined();
      expect(newRefreshTokenCookie).not.toBe(refreshTokenCookie);
    });

    it("should return 401 for missing refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token");

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Refresh token missing");
    });

    it("should rotate refresh token after use", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const cookies = (loginResponse.headers as any)['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const oldCookie = cookies!.find(c => c.startsWith('refresh_token='));
      expect(oldCookie).toBeDefined();

      // Use refresh token
      const refreshResponse = await request(app)
        .post("/api/auth/refresh-token")
        .set('Cookie', oldCookie!);

      const newCookies = (refreshResponse.headers as any)['set-cookie'] as string[] | undefined;
      expect(newCookies).toBeDefined();
      const newCookie = newCookies!.find(c => c.startsWith('refresh_token='));

      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(oldCookie);

      // Old token should no longer work
      const reuseResponse = await request(app)
        .post("/api/auth/refresh-token")
        .set('Cookie', oldCookie!);

      expect(reuseResponse.status).toBe(401);
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    it("should send password reset email for existing user", async () => {
      const { email, userId } = await createVerifiedUser();
      trackUser(userId);

      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("reset link");
    });

    it("should not reveal if email exists (security)", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@example.com" });

      // Should return 200 even if email doesn't exist
      expect(response.status).toBe(200);
      expect(response.body.message).toContain("reset link");
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("should reset password with valid token", async () => {
      const { email, password: oldPassword, userId } = await createVerifiedUser();
      trackUser(userId);

      // Generate reset token
      const token = await createPasswordResetToken(email);
      expect(token).toBeTruthy();

      const newPassword = randomPassword();

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token,
          newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Password updated");

      // Verify can login with new password
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password: newPassword });

      expect(loginResponse.status).toBe(200);

      // Old password should not work
      const oldLoginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password: oldPassword });

      expect(oldLoginResponse.status).toBe(401);
    });

    it("should return 400 for invalid token", async () => {
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: "invalid-token",
          newPassword: "NewPassword123",
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 for weak new password", async () => {
      const { email, userId } = await createVerifiedUser();
      trackUser(userId);
      const token = await createPasswordResetToken(email);

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token,
          newPassword: "weak",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Password");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return current user for valid token", async () => {
      const { email, password, userId } = await createVerifiedUser();
      trackUser(userId);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(email);
      expect(response.body.id).toBeDefined();
    });

    it("should return 401 for missing token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
    });
  });

  describe("MFA Routes", () => {
    describe("POST /api/auth/mfa/verify-login", () => {
      it("should complete MFA login with valid TOTP code", async () => {
        const { email, password, totpSecret, userId } = await createUserWithMfa();
        trackUser(userId);

        // Step 1: Login (should require MFA)
        const loginResponse = await request(app)
          .post("/api/auth/login")
          .send({ email, password });

        expect(loginResponse.body.requiresMfa).toBe(true);

        // Step 2: Verify MFA
        const totpCode = generateTotpCode(totpSecret);

        const mfaResponse = await request(app)
          .post("/api/auth/mfa/verify-login")
          .send({
            userId,
            token: totpCode,
          });

        expect(mfaResponse.status).toBe(200);
        expect(mfaResponse.body.token).toBeDefined();
        expect(mfaResponse.body.user).toBeDefined();
      });

      it("should reject invalid MFA code", async () => {
        const { userId } = await createUserWithMfa();
        trackUser(userId);

        const response = await request(app)
          .post("/api/auth/mfa/verify-login")
          .send({
            userId,
            token: "000000", // Invalid code
          });

        expect(response.status).toBe(401);
        expect(response.body.message).toContain("Invalid");
      });
    });
  });
});

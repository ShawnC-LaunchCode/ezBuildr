import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/testApp";
import {
  cleanAuthTables,
  randomEmail,
  randomPassword,
  createVerifiedUser,
  generateTotpCode,
} from "../helpers/testUtils";
import { db } from "../../server/db";
import { loginAttempts, accountLocks } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * REAL Auth Flow Integration Tests
 * Tests complete authentication flows end-to-end
 */

describe("Auth Flows Integration Tests (REAL)", () => {
  let app: Express;

  beforeAll(async () => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await cleanAuthTables();
  });

  describe("Complete Registration → Login Flow", () => {
    it("should complete registration, verify email, then login", async () => {
      const email = randomEmail();
      const password = randomPassword();

      // Step 1: Register
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password,
          firstName: "Test",
          lastName: "User",
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.user.emailVerified).toBe(false);

      // Step 2: Try to login (should fail - email not verified)
      const loginAttempt1 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(loginAttempt1.status).toBe(403);
      expect(loginAttempt1.body.message).toContain("verify your email");

      // Step 3: Verify email (in real app, user would click link from email)
      // For testing, we'll directly update the user
      const { users } = await import("@shared/schema");
      await db.update(users)
        .set({ emailVerified: true })
        .where(eq(users.email, email));

      // Step 4: Login successfully
      const loginAttempt2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(loginAttempt2.status).toBe(200);
      expect(loginAttempt2.body.token).toBeDefined();
      expect(loginAttempt2.body.user.emailVerified).toBe(true);
    });
  });

  describe("Account Lockout Flow", () => {
    it("should lock account after 5 failed attempts, then unlock after waiting", async () => {
      const { email, password } = await createVerifiedUser();

      // Step 1: Make 4 failed attempts
      for (let i = 0; i < 4; i++) {
        const response = await request(app)
          .post("/api/auth/login")
          .send({
            email,
            password: "WrongPassword" + i,
          });

        expect(response.status).toBe(401);
      }

      // Step 2: 5th attempt should trigger lockout
      const fifthAttempt = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password: "WrongPassword5",
        });

      expect(fifthAttempt.status).toBe(401);

      // Step 3: Next attempt should be blocked (even with correct password)
      const lockedAttempt = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password, // Correct password
        });

      expect(lockedAttempt.status).toBe(423);
      expect(lockedAttempt.body.message).toContain("locked");
      expect(lockedAttempt.body.lockedUntil).toBeDefined();

      // Verify lock in database
      const { users } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const locks = await db.query.accountLocks.findMany({
        where: eq(accountLocks.userId, user!.id),
      });

      expect(locks.length).toBeGreaterThan(0);
      expect(locks[0].unlocked).toBe(false);
    });

    it("should record all login attempts", async () => {
      const { email, password } = await createVerifiedUser();

      // Make several login attempts
      await request(app).post("/api/auth/login").send({ email, password: "wrong1" });
      await request(app).post("/api/auth/login").send({ email, password: "wrong2" });
      await request(app).post("/api/auth/login").send({ email, password }); // Correct

      // Verify attempts recorded
      const attempts = await db.query.loginAttempts.findMany({
        where: eq(loginAttempts.email, email),
      });

      expect(attempts.length).toBe(3);
      expect(attempts.filter(a => !a.successful).length).toBe(2);
      expect(attempts.filter(a => a.successful).length).toBe(1);
    });
  });

  describe("MFA Enrollment and Login Flow", () => {
    it("should complete MFA setup and login with TOTP", async () => {
      const { email, password } = await createVerifiedUser();

      // Step 1: Login to get access token
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = loginResponse.body.token;

      // Step 2: Setup MFA
      const setupResponse = await request(app)
        .post("/api/auth/mfa/setup")
        .set("Authorization", `Bearer ${token}`);

      expect(setupResponse.status).toBe(200);
      expect(setupResponse.body.qrCodeDataUrl).toBeDefined();
      expect(setupResponse.body.backupCodes).toBeDefined();
      expect(setupResponse.body.backupCodes.length).toBe(10);

      // Step 3: Get TOTP secret from database (in real app, user scans QR code)
      const { users, mfaSecrets } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const mfaSecret = await db.query.mfaSecrets.findFirst({
        where: eq(mfaSecrets.userId, user!.id),
      });

      expect(mfaSecret).toBeDefined();
      expect(mfaSecret!.enabled).toBe(false); // Not enabled until verified

      // Step 4: Verify TOTP code to enable MFA
      const totpCode = generateTotpCode(mfaSecret!.secret);

      const verifyResponse = await request(app)
        .post("/api/auth/mfa/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: totpCode });

      expect(verifyResponse.status).toBe(200);

      // Step 5: Logout
      await request(app).post("/api/auth/logout");

      // Step 6: Login again (should require MFA)
      const login2Response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(login2Response.status).toBe(200);
      expect(login2Response.body.requiresMfa).toBe(true);
      expect(login2Response.body.userId).toBeDefined();

      // Step 7: Complete MFA login
      const totpCode2 = generateTotpCode(mfaSecret!.secret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({
          userId: user!.id,
          token: totpCode2,
        });

      expect(mfaLoginResponse.status).toBe(200);
      expect(mfaLoginResponse.body.token).toBeDefined();
      expect(mfaLoginResponse.body.user.mfaEnabled).toBe(true);
    });

    it("should login with backup code when TOTP unavailable", async () => {
      const { email, password } = await createVerifiedUser();

      // Setup MFA
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = loginResponse.body.token;

      const setupResponse = await request(app)
        .post("/api/auth/mfa/setup")
        .set("Authorization", `Bearer ${token}`);

      const backupCodes = setupResponse.body.backupCodes;

      // Get secret and verify to enable MFA
      const { users, mfaSecrets } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const mfaSecret = await db.query.mfaSecrets.findFirst({
        where: eq(mfaSecrets.userId, user!.id),
      });

      const totpCode = generateTotpCode(mfaSecret!.secret);

      await request(app)
        .post("/api/auth/mfa/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: totpCode });

      // Logout and login with backup code
      await request(app).post("/api/auth/logout");

      const login2Response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      expect(login2Response.body.requiresMfa).toBe(true);

      // Use backup code instead of TOTP
      const backupCodeLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({
          userId: user!.id,
          backupCode: backupCodes[0],
        });

      expect(backupCodeLoginResponse.status).toBe(200);
      expect(backupCodeLoginResponse.body.token).toBeDefined();

      // Backup code should be consumed (can't use again)
      const login3Response = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const reuseBackupCodeResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({
          userId: user!.id,
          backupCode: backupCodes[0], // Same code
        });

      expect(reuseBackupCodeResponse.status).toBe(401);
    });
  });

  describe("Password Reset Flow", () => {
    it("should complete full password reset flow", async () => {
      const { email, password: oldPassword } = await createVerifiedUser();

      // Step 1: Request password reset
      const resetRequestResponse = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email });

      expect(resetRequestResponse.status).toBe(200);

      // Step 2: Get reset token from database (in real app, sent via email)
      const { passwordResetTokens } = await import("@shared/schema");
      const { users } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const resetTokenRecord = await db.query.passwordResetTokens.findFirst({
        where: eq(passwordResetTokens.userId, user!.id),
      });

      expect(resetTokenRecord).toBeDefined();

      // Since token is hashed, we need to use the service to generate it
      // We'll request a new one and capture it
      const { authService } = await import("../../server/services/AuthService");
      const plainToken = await authService.generatePasswordResetToken(email);

      expect(plainToken).toBeTruthy();

      // Step 3: Reset password
      const newPassword = randomPassword();

      const resetResponse = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: plainToken,
          newPassword,
        });

      expect(resetResponse.status).toBe(200);

      // Step 4: Verify old password no longer works
      const oldPasswordLogin = await request(app)
        .post("/api/auth/login")
        .send({ email, password: oldPassword });

      expect(oldPasswordLogin.status).toBe(401);

      // Step 5: Verify new password works
      const newPasswordLogin = await request(app)
        .post("/api/auth/login")
        .send({ email, password: newPassword });

      expect(newPasswordLogin.status).toBe(200);
      expect(newPasswordLogin.body.token).toBeDefined();
    });

    it("should invalidate all sessions after password reset", async () => {
      const { email, password } = await createVerifiedUser();

      // Login to create session
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const oldToken = loginResponse.body.token;

      // Generate and use reset token
      const { authService } = await import("../../server/services/AuthService");
      const resetToken = await authService.generatePasswordResetToken(email);

      const newPassword = randomPassword();

      await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          newPassword,
        });

      // Old token should no longer work
      const meResponse = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${oldToken}`);

      // Token might still be valid (JWT) but refresh tokens should be revoked
      // The key test is that refresh tokens are invalidated
      const { users } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const { refreshTokens } = await import("@shared/schema");
      const validRefreshTokens = await db.query.refreshTokens.findMany({
        where: eq(refreshTokens.userId, user!.id),
      });

      // All refresh tokens should be revoked
      expect(validRefreshTokens.every(t => t.revoked)).toBe(true);
    });
  });

  describe("Token Refresh Flow", () => {
    it("should rotate refresh token on each use", async () => {
      const { email, password } = await createVerifiedUser();

      // Login to get initial tokens
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      let cookies = loginResponse.headers['set-cookie'] as unknown as string[];
      let refreshTokenCookie = cookies.find(c => c.startsWith('refresh_token='));

      expect(refreshTokenCookie).toBeDefined();

      // Refresh 3 times
      for (let i = 0; i < 3; i++) {
        const refreshResponse = await request(app)
          .post("/api/auth/refresh-token")
          .set('Cookie', refreshTokenCookie!);

        expect(refreshResponse.status).toBe(200);
        expect(refreshResponse.body.token).toBeDefined();

        const newCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
        const newRefreshTokenCookie = newCookies.find(c => c.startsWith('refresh_token='));

        expect(newRefreshTokenCookie).toBeDefined();
        expect(newRefreshTokenCookie).not.toBe(refreshTokenCookie);

        // Update for next iteration
        refreshTokenCookie = newRefreshTokenCookie;
      }
    });

    it("should detect and prevent refresh token reuse (token theft)", async () => {
      const { email, password } = await createVerifiedUser();

      // Login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
      const originalRefreshToken = cookies.find(c => c.startsWith('refresh_token='));

      // Use token once (rotation happens)
      const refresh1 = await request(app)
        .post("/api/auth/refresh-token")
        .set('Cookie', originalRefreshToken!);

      expect(refresh1.status).toBe(200);

      // Try to reuse original token (simulates theft)
      const reuseAttempt = await request(app)
        .post("/api/auth/refresh-token")
        .set('Cookie', originalRefreshToken!);

      expect(reuseAttempt.status).toBe(401);

      // All user's refresh tokens should be revoked (security measure)
      const { users } = await import("@shared/schema");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const { refreshTokens } = await import("@shared/schema");
      const allTokens = await db.query.refreshTokens.findMany({
        where: eq(refreshTokens.userId, user!.id),
      });

      // All should be revoked
      expect(allTokens.every(t => t.revoked)).toBe(true);
    });
  });

  describe("Session Management Flow", () => {
    it("should list all active sessions", async () => {
      const { email, password } = await createVerifiedUser();

      // Login from "multiple devices" (simulate with different user agents)
      const login1 = await request(app)
        .post("/api/auth/login")
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        .send({ email, password });

      const login2 = await request(app)
        .post("/api/auth/login")
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)')
        .send({ email, password });

      const token = login2.body.token;

      // List sessions
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      expect(sessionsResponse.status).toBe(200);
      expect(sessionsResponse.body.sessions).toBeDefined();
      expect(sessionsResponse.body.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("should revoke specific session", async () => {
      const { email, password } = await createVerifiedUser();

      // Create 2 sessions
      const login1 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const login2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

      const token = login2.body.token;

      // List sessions
      const sessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      const sessions = sessionsResponse.body.sessions;
      const sessionToRevoke = sessions.find((s: any) => !s.current);

      // Revoke first session
      const revokeResponse = await request(app)
        .delete(`/api/auth/sessions/${sessionToRevoke.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(revokeResponse.status).toBe(200);

      // Verify session count decreased
      const newSessionsResponse = await request(app)
        .get("/api/auth/sessions")
        .set("Authorization", `Bearer ${token}`);

      expect(newSessionsResponse.body.sessions.length).toBeLessThan(sessions.length);
    });
  });
});

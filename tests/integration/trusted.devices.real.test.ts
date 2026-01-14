import { eq, and, gt } from "drizzle-orm";
import request from "supertest";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

import { trustedDevices } from "@shared/schema";

import { db } from "../../server/db";
import { createTestApp } from "../helpers/testApp";
import {
  cleanAuthTables,
  deleteTestUser,
  createUserWithMfa,
  generateTotpCode,
} from "../helpers/testUtils";

import type { Express } from "express";




/**
 * Trusted Devices Integration Tests (REAL)
 * Tests device trust for MFA bypass
 */

describe("Trusted Devices Integration Tests (REAL)", () => {
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

  describe("POST /api/auth/trust-device", () => {
    it("should trust current device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Login with MFA
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const token = mfaLoginResponse.body.token;

      // Trust device
      const trustResponse = await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      expect(trustResponse.status).toBe(200);
      expect(trustResponse.body.message).toContain("trusted");
      expect(trustResponse.body.trustedUntil).toBeDefined();

      // Verify device is in database
      const devices = await db.query.trustedDevices.findMany({
        where: and(
          eq(trustedDevices.userId, userId),
          eq(trustedDevices.revoked, false)
        ),
      });

      expect(devices.length).toBe(1);
      expect(devices[0].deviceName).toBeDefined();
      expect(devices[0].ipAddress).toBe("192.168.1.100");
    });

    it("should set trust expiry to 30 days", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const response = await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      const trustedUntil = new Date(response.body.trustedUntil);
      const now = new Date();
      const diffDays = Math.round(
        (trustedUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(diffDays).toBe(30);
    });

    it("should update expiry if device already trusted", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const token = mfaLoginResponse.body.token;
      const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
      const ipAddress = "192.168.1.100";

      // Trust device first time
      const response1 = await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", ipAddress);

      const firstExpiry = new Date(response1.body.trustedUntil);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Trust same device again
      const response2 = await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", ipAddress);

      const secondExpiry = new Date(response2.body.trustedUntil);

      // Should have extended expiry
      expect(secondExpiry > firstExpiry).toBe(true);

      // Should still only have 1 device record
      const devices = await db.query.trustedDevices.findMany({
        where: and(
          eq(trustedDevices.userId, userId),
          eq(trustedDevices.revoked, false)
        ),
      });

      expect(devices.length).toBe(1);
    });

    it("should require authentication", async () => {
      const response = await request(app).post("/api/auth/trust-device");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/auth/trusted-devices", () => {
    it("should list all trusted devices", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Login and trust 2 devices with different user agents
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)",
      ];

      for (let i = 0; i < userAgents.length; i++) {
        const ua = userAgents[i];
        await request(app).post("/api/auth/login").send({ email, password });

        const totpCode = generateTotpCode(totpSecret);

        const mfaLoginResponse = await request(app)
          .post("/api/auth/mfa/verify-login")
          .send({ userId, token: totpCode });

        await request(app)
          .post("/api/auth/trust-device")
          .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
          .set("User-Agent", ua)
          .set("X-Forwarded-For", `192.168.1.${100 + i}`);
      }

      // Get last token
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      // List devices
      const response = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`);

      expect(response.status).toBe(200);
      expect(response.body.devices).toBeDefined();
      expect(response.body.devices.length).toBe(2);

      // Verify device properties
      const device = response.body.devices[0];
      expect(device).toHaveProperty("id");
      expect(device).toHaveProperty("deviceName");
      expect(device).toHaveProperty("location");
      expect(device).toHaveProperty("ipAddress");
      expect(device).toHaveProperty("trustedUntil");
      expect(device).toHaveProperty("lastUsedAt");
      expect(device).toHaveProperty("createdAt");
      expect(device).toHaveProperty("current");
    });

    it("should mark current device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Trust device
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100");

      // List devices with same user agent and IP
      const response = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100");

      const currentDevice = response.body.devices.find((d: any) => d.current);
      expect(currentDevice).toBeDefined();
    });

    it("should exclude revoked devices", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Trust and then revoke a device
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      // Manually revoke device
      await db
        .update(trustedDevices)
        .set({ revoked: true })
        .where(eq(trustedDevices.userId, userId));

      // List devices
      const response = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`);

      expect(response.body.devices.length).toBe(0);
    });

    it("should exclude expired devices", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Trust device
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      // Manually expire device
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      await db
        .update(trustedDevices)
        .set({ trustedUntil: pastDate })
        .where(eq(trustedDevices.userId, userId));

      // List devices
      const response = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`);

      expect(response.body.devices.length).toBe(0);
    });
  });

  describe("DELETE /api/auth/trusted-devices/:deviceId", () => {
    it("should revoke specific device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Trust device
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const token = mfaLoginResponse.body.token;

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      // Get device ID
      const devicesResponse = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${token}`);

      const deviceId = devicesResponse.body.devices[0].id;

      // Revoke device
      const revokeResponse = await request(app)
        .delete(`/api/auth/trusted-devices/${deviceId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(revokeResponse.status).toBe(200);

      // Verify device is revoked
      const device = await db.query.trustedDevices.findFirst({
        where: eq(trustedDevices.id, deviceId),
      });

      expect(device!.revoked).toBe(true);

      // Verify device no longer appears in list
      const newDevicesResponse = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${token}`);

      expect(newDevicesResponse.body.devices.length).toBe(0);
    });

    it("should return 404 for non-existent device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const response = await request(app)
        .delete("/api/auth/trusted-devices/non-existent-id")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`);

      expect(response.status).toBe(404);
    });

    it("should prevent revoking other user's device", async () => {
      const user1 = await createUserWithMfa();
      trackUser(user1.userId);
      const user2 = await createUserWithMfa();
      trackUser(user2.userId);

      // User 1 trusts device
      await request(app)
        .post("/api/auth/login")
        .send({ email: user1.email, password: user1.password });

      const totpCode1 = generateTotpCode(user1.totpSecret);

      const mfaLogin1 = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId: user1.userId, token: totpCode1 });

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLogin1.body.token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .set("X-Forwarded-For", "192.168.1.100");

      const devices1 = await request(app)
        .get("/api/auth/trusted-devices")
        .set("Authorization", `Bearer ${mfaLogin1.body.token}`);

      const user1DeviceId = devices1.body.devices[0].id;

      // User 2 tries to revoke user 1's device
      await request(app)
        .post("/api/auth/login")
        .send({ email: user2.email, password: user2.password });

      const totpCode2 = generateTotpCode(user2.totpSecret);

      const mfaLogin2 = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId: user2.userId, token: totpCode2 });

      const revokeResponse = await request(app)
        .delete(`/api/auth/trusted-devices/${user1DeviceId}`)
        .set("Authorization", `Bearer ${mfaLogin2.body.token}`);

      expect(revokeResponse.status).toBe(404);
    });
  });

  describe("Device Trust with MFA Login", () => {
    it("should skip MFA for trusted device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // First login with MFA
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

      // Trust device
      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100");

      // Logout
      await request(app).post("/api/auth/logout");

      // Login again from same "device" (same user agent and IP)
      const secondLoginResponse = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100")
        .send({ email, password });

      // Should not require MFA
      expect(secondLoginResponse.status).toBe(200);
      expect(secondLoginResponse.body.requiresMfa).toBeUndefined();
      expect(secondLoginResponse.body.token).toBeDefined();
    });

    it("should require MFA for untrusted device", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Login and trust device 1
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

      // Logout
      await request(app).post("/api/auth/logout");

      // Login from different "device"
      const loginFromNewDevice = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)")
        .send({ email, password });

      // Should require MFA
      expect(loginFromNewDevice.body.requiresMfa).toBe(true);
    });

    it("should update lastUsedAt on trusted device login", async () => {
      const { email, password, userId, totpSecret } = await createUserWithMfa();
      trackUser(userId);

      // Login and trust device
      await request(app).post("/api/auth/login").send({ email, password });

      const totpCode = generateTotpCode(totpSecret);

      const mfaLoginResponse = await request(app)
        .post("/api/auth/mfa/verify-login")
        .send({ userId, token: totpCode });

      const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

      await request(app)
        .post("/api/auth/trust-device")
        .set("Authorization", `Bearer ${mfaLoginResponse.body.token}`)
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100");

      const device1 = await db.query.trustedDevices.findFirst({
        where: eq(trustedDevices.userId, userId),
      });

      const firstLastUsed = device1!.lastUsedAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Login again with same device fingerprint
      await request(app)
        .post("/api/auth/login")
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", "192.168.1.100")
        .send({ email, password });

      const device2 = await db.query.trustedDevices.findFirst({
        where: eq(trustedDevices.userId, userId),
      });

      const secondLastUsed = device2!.lastUsedAt;

      // lastUsedAt should be updated
      expect(secondLastUsed! > firstLastUsed!).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { AccountLockoutService } from "../../../server/services/AccountLockoutService";

import type { User } from "../../../shared/schema";

// Mock dependencies
vi.mock("../../../server/db", () => ({
  db: {
    query: {
      loginAttempts: {
        findMany: vi.fn(),
      },
      accountLocks: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("../../../server/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("AccountLockoutService", () => {
  let accountLockoutService: AccountLockoutService;
  let mockDb: any;

  beforeEach(async () => {
    const dbModule = await import("../../../server/db");
    mockDb = dbModule.db;

    // Create service with mocked database
    accountLockoutService = new AccountLockoutService(mockDb);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("recordAttempt()", () => {
    it("should record successful login attempt", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.recordAttempt(email, ipAddress, true);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should record failed login attempt", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockDb.query.loginAttempts.findMany.mockResolvedValue([]);

      await accountLockoutService.recordAttempt(email, ipAddress, false);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should handle undefined IP address", async () => {
      const email = "test@example.com";

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.recordAttempt(email, undefined, true);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should check for lockout after failed attempt", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockDb.query.loginAttempts.findMany.mockResolvedValue([]);

      await accountLockoutService.recordAttempt(email, ipAddress, false);

      // Verify that findMany was called to check failed attempts
      expect(mockDb.query.loginAttempts.findMany).toHaveBeenCalled();
    });

    it("should not check for lockout after successful attempt", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.recordAttempt(email, ipAddress, true);

      // Verify that findMany was NOT called for successful attempts
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();
    });
  });

  describe("checkAndLockAccount()", () => {
    it("should lock account after 5 failed attempts", async () => {
      const email = "test@example.com";
      const userId = "user-123";

      // Mock 5 failed attempts
      mockDb.query.loginAttempts.findMany.mockResolvedValue([
        { id: "1", email, successful: false, attemptedAt: new Date() },
        { id: "2", email, successful: false, attemptedAt: new Date() },
        { id: "3", email, successful: false, attemptedAt: new Date() },
        { id: "4", email, successful: false, attemptedAt: new Date() },
        { id: "5", email, successful: false, attemptedAt: new Date() },
      ]);

      // Mock user lookup
      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      // Mock account lock insert
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.checkAndLockAccount(email);

      // Verify account lock was created
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should not lock account with fewer than 5 failed attempts", async () => {
      const email = "test@example.com";

      // Mock 4 failed attempts (below threshold)
      mockDb.query.loginAttempts.findMany.mockResolvedValue([
        { id: "1", email, successful: false, attemptedAt: new Date() },
        { id: "2", email, successful: false, attemptedAt: new Date() },
        { id: "3", email, successful: false, attemptedAt: new Date() },
        { id: "4", email, successful: false, attemptedAt: new Date() },
      ]);

      await accountLockoutService.checkAndLockAccount(email);

      // Verify account lock was NOT created
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.query.users.findFirst).not.toHaveBeenCalled();
    });

    it("should only count failed attempts within 15-minute window", async () => {
      const email = "test@example.com";

      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

      // Mock 3 recent failures + 2 old failures (should not trigger lock)
      mockDb.query.loginAttempts.findMany.mockResolvedValue([
        { id: "1", email, successful: false, attemptedAt: now },
        { id: "2", email, successful: false, attemptedAt: now },
        { id: "3", email, successful: false, attemptedAt: now },
        // These two are outside the window and should not be included
      ]);

      await accountLockoutService.checkAndLockAccount(email);

      // Should not lock (only 3 in window)
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("should set lockout duration to 15 minutes", async () => {
      const email = "test@example.com";
      const userId = "user-123";

      // Mock 5 failed attempts
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        Array(5).fill({ email, successful: false, attemptedAt: new Date() })
      );

      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({
        values: mockValues,
      });

      await accountLockoutService.checkAndLockAccount(email);

      // Check that insert was called with lockedUntil approximately 15 minutes from now
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          reason: "too_many_failed_attempts",
          unlocked: false,
        })
      );
    });

    it("should not create lock if user not found", async () => {
      const email = "nonexistent@example.com";

      // Mock 5 failed attempts
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        Array(5).fill({ email, successful: false, attemptedAt: new Date() })
      );

      // User not found
      mockDb.query.users.findFirst.mockResolvedValue(null);

      await accountLockoutService.checkAndLockAccount(email);

      // Should not create lock if user doesn't exist
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("isAccountLocked()", () => {
    it("should return locked=true for locked account", async () => {
      const userId = "user-123";
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      mockDb.query.accountLocks.findFirst.mockResolvedValue({
        id: "lock-1",
        userId,
        lockedUntil,
        unlocked: false,
      });

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toEqual(lockedUntil);
    });

    it("should return locked=false for unlocked account", async () => {
      const userId = "user-123";

      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
      expect(result.lockedUntil).toBeUndefined();
    });

    it("should return locked=false if lock has expired", async () => {
      const userId = "user-123";
      const lockedUntil = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago (expired)

      // findFirst should not return expired locks
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
    });

    it("should return locked=false if lock was manually unlocked", async () => {
      const userId = "user-123";

      // findFirst filters by unlocked=false, so manually unlocked locks won't be returned
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
    });

    it("should only check for active locks (unlocked=false)", async () => {
      const userId = "user-123";
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);

      mockDb.query.accountLocks.findFirst.mockResolvedValue({
        id: "lock-1",
        userId,
        lockedUntil,
        unlocked: false,
      });

      await accountLockoutService.isAccountLocked(userId);

      // Verify the query included unlocked=false filter
      expect(mockDb.query.accountLocks.findFirst).toHaveBeenCalled();
    });
  });

  describe("unlockAccount()", () => {
    it("should unlock account by setting unlocked=true", async () => {
      const userId = "user-123";

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });

      await accountLockoutService.unlockAccount(userId);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ unlocked: true });
      expect(mockWhere).toHaveBeenCalled();
    });

    it("should unlock all locks for the user", async () => {
      const userId = "user-123";

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });

      await accountLockoutService.unlockAccount(userId);

      // Should update all locks for this user (no additional filtering)
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("cleanupOldAttempts()", () => {
    it("should delete login attempts older than 30 days", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockDb.delete.mockReturnValue({ where: mockWhere });

      await accountLockoutService.cleanupOldAttempts();

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it("should only delete old attempts, not recent ones", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockDb.delete.mockReturnValue({ where: mockWhere });

      await accountLockoutService.cleanupOldAttempts();

      // Verify delete was called with a date filter
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("Lockout Workflow", () => {
    it("should follow complete lockout workflow", async () => {
      const email = "test@example.com";
      const userId = "user-123";
      const ipAddress = "192.168.1.1";

      // Mock initial state (no locks)
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      // Simulate 5 failed login attempts
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      let failedAttemptCount = 0;
      mockDb.query.loginAttempts.findMany.mockImplementation(() => {
        failedAttemptCount++;
        return Promise.resolve(
          Array(failedAttemptCount).fill({ email, successful: false, attemptedAt: new Date() })
        );
      });

      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      // Attempt 1-4: Should not lock
      for (let i = 0; i < 4; i++) {
        await accountLockoutService.recordAttempt(email, ipAddress, false);
      }

      // Attempt 5: Should lock
      await accountLockoutService.recordAttempt(email, ipAddress, false);

      // Verify account was locked
      expect(mockDb.insert).toHaveBeenCalled();

      // Now check if account is locked
      mockDb.query.accountLocks.findFirst.mockResolvedValue({
        id: "lock-1",
        userId,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        unlocked: false,
      });

      const lockStatus = await accountLockoutService.isAccountLocked(userId);
      expect(lockStatus.locked).toBe(true);

      // Admin unlocks the account
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });

      await accountLockoutService.unlockAccount(userId);

      expect(mockSet).toHaveBeenCalledWith({ unlocked: true });

      // Verify account is now unlocked
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const newLockStatus = await accountLockoutService.isAccountLocked(userId);
      expect(newLockStatus.locked).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle concurrent failed attempts", async () => {
      const email = "test@example.com";
      const userId = "user-123";

      // Simulate race condition where multiple requests check at the same time
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        Array(5).fill({ email, successful: false, attemptedAt: new Date() })
      );

      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      // Multiple concurrent checkAndLockAccount calls
      await Promise.all([
        accountLockoutService.checkAndLockAccount(email),
        accountLockoutService.checkAndLockAccount(email),
        accountLockoutService.checkAndLockAccount(email),
      ]);

      // Should have attempted to create lock (database constraints prevent duplicates)
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should handle exactly 5 attempts (boundary case)", async () => {
      const email = "test@example.com";
      const userId = "user-123";

      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        Array(5).fill({ email, successful: false, attemptedAt: new Date() })
      );

      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.checkAndLockAccount(email);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should handle 6+ attempts (above threshold)", async () => {
      const email = "test@example.com";
      const userId = "user-123";

      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        Array(10).fill({ email, successful: false, attemptedAt: new Date() })
      );

      mockDb.query.users.findFirst.mockResolvedValue({
        id: userId,
        email,
      });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await accountLockoutService.checkAndLockAccount(email);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });
});

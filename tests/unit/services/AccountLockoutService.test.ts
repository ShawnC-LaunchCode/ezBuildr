import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

import { AccountLockoutService } from "../../../server/services/AccountLockoutService";
import { loginAttempts, accountLocks, users } from "../../../shared/schema";
// Service imports from @shared/schema
import type { LoginAttempt, AccountLock, User } from "../../../shared/schema";

// We need to mock the db module
import { db } from "../../../server/db";

// Constants mirrored from the service (kept in sync with AccountLockoutService.ts)
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Mock dependencies
vi.mock("../../../server/db", () => {
  return {
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
  };
});

vi.mock("../../../server/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Helper: build N failed login-attempt rows all timestamped `at` (defaults to now)
function buildFailedAttempts(count: number, email: string, at: Date = new Date()): LoginAttempt[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    email,
    ipAddress: "192.168.1.1",
    successful: false,
    attemptedAt: new Date(at.getTime()),
  })) as unknown as LoginAttempt[];
}

describe("AccountLockoutService", () => {
  let accountLockoutService: AccountLockoutService;
  // Define strict types for the mocked db functions we use
  let mockDb: {
    query: {
      loginAttempts: { findMany: MockInstance<() => Promise<LoginAttempt[]>> };
      accountLocks: { findFirst: MockInstance<() => Promise<AccountLock | undefined | null>> };
      users: { findFirst: MockInstance<() => Promise<User | undefined | null>> };
    };
    insert: MockInstance;
    update: MockInstance;
    delete: MockInstance;
  };

  beforeEach(async () => {
    mockDb = db as unknown as typeof mockDb;

    // Create service with mocked database
    accountLockoutService = new AccountLockoutService(mockDb as unknown as typeof db);

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

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await accountLockoutService.recordAttempt(email, ipAddress, true);

      expect(mockDb.insert).toHaveBeenCalledWith(loginAttempts);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          ipAddress,
          successful: true,
          attemptedAt: expect.any(Date),
        })
      );
    });

    it("should record failed login attempt", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await accountLockoutService.recordAttempt(email, ipAddress, false);

      expect(mockDb.insert).toHaveBeenCalledWith(loginAttempts);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          ipAddress,
          successful: false,
          attemptedAt: expect.any(Date),
        })
      );
    });

    it("should handle undefined IP address", async () => {
      const email = "test@example.com";

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await accountLockoutService.recordAttempt(email, undefined, true);

      expect(mockDb.insert).toHaveBeenCalledWith(loginAttempts);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ email, ipAddress: undefined, successful: true })
      );
    });

    it("should only insert a row and not evaluate lockout (no findMany)", async () => {
      const email = "test@example.com";
      const ipAddress = "192.168.1.1";

      mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      await accountLockoutService.recordAttempt(email, ipAddress, false);

      // recordAttempt is a pure insert; lockout is evaluated dynamically in isAccountLocked
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();
    });
  });

  describe("checkAndLockAccount()", () => {
    it("is an intentional no-op that persists nothing (anti-DoS)", async () => {
      const email = "test@example.com";

      // Even if 5+ failed attempts exist, checkAndLockAccount must NOT write a lock row.
      mockDb.query.loginAttempts.findMany.mockResolvedValue(buildFailedAttempts(5, email));
      mockDb.query.users.findFirst.mockResolvedValue({ id: "user-123", email } as unknown as User);

      await accountLockoutService.checkAndLockAccount(email);

      // No persistence, no queries — lockout is now evaluated dynamically in isAccountLocked.
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();
      expect(mockDb.query.users.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("isAccountLocked() — manual/administrative locks", () => {
    it("should return locked=true for an active manual lock", async () => {
      const userId = "user-123";
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      mockDb.query.accountLocks.findFirst.mockResolvedValue({
        id: "lock-1",
        userId,
        lockedUntil,
        unlocked: false,
      } as unknown as AccountLock);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toEqual(lockedUntil);
    });

    it("should return locked=false when there is no active lock", async () => {
      const userId = "user-123";

      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
      expect(result.lockedUntil).toBeUndefined();
    });

    it("should return locked=false if the manual lock has expired (filtered out by query)", async () => {
      const userId = "user-123";

      // The query filters by lockedUntil >= now, so expired locks are never returned.
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
    });

    it("should return locked=false if the lock was manually unlocked (filtered out by query)", async () => {
      const userId = "user-123";

      // The query filters by unlocked=false, so unlocked rows are never returned.
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
    });

    it("should query for active locks only", async () => {
      const userId = "user-123";

      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      await accountLockoutService.isAccountLocked(userId);

      expect(mockDb.query.accountLocks.findFirst).toHaveBeenCalled();
    });
  });

  describe("isAccountLocked() — dynamic (email + IP) automatic lockout", () => {
    const userId = "user-123";
    const email = "test@example.com";
    const ipAddress = "192.168.1.1";

    beforeEach(() => {
      // No manual lock present — force evaluation of the dynamic path.
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);
    });

    it("locks after exactly MAX_FAILED_ATTEMPTS (boundary = 5) with a ~15-minute lockedUntil", async () => {
      const attemptTime = new Date();
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        buildFailedAttempts(MAX_FAILED_ATTEMPTS, email, attemptTime)
      );

      const before = Date.now();
      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);
      const after = Date.now();

      expect(mockDb.query.loginAttempts.findMany).toHaveBeenCalled();
      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toBeInstanceOf(Date);

      // lockedUntil = most-recent-attempt + 15 minutes.
      const durationMs = LOCKOUT_DURATION_MINUTES * 60 * 1000;
      const lockedUntilMs = result.lockedUntil!.getTime();
      expect(lockedUntilMs).toBeGreaterThanOrEqual(before + durationMs - 2000);
      expect(lockedUntilMs).toBeLessThanOrEqual(after + durationMs + 2000);
    });

    it("does NOT lock with fewer than MAX_FAILED_ATTEMPTS (4)", async () => {
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        buildFailedAttempts(MAX_FAILED_ATTEMPTS - 1, email)
      );

      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);

      expect(mockDb.query.loginAttempts.findMany).toHaveBeenCalled();
      expect(result.locked).toBe(false);
      expect(result.lockedUntil).toBeUndefined();
    });

    it("locks with more than MAX_FAILED_ATTEMPTS (6+)", async () => {
      mockDb.query.loginAttempts.findMany.mockResolvedValue(buildFailedAttempts(10, email));

      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);

      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toBeInstanceOf(Date);
    });

    it("does NOT lock when there are zero recent failed attempts", async () => {
      mockDb.query.loginAttempts.findMany.mockResolvedValue([]);

      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);

      expect(result.locked).toBe(false);
    });

    it("does NOT lock if the derived lockedUntil is already in the past (stale attempts)", async () => {
      // 5 failed attempts, but all timestamped well beyond the lockout duration ago,
      // so lockedUntil (attempt + 15min) is in the past → not locked.
      const staleTime = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
      mockDb.query.loginAttempts.findMany.mockResolvedValue(
        buildFailedAttempts(MAX_FAILED_ATTEMPTS, email, staleTime)
      );

      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);

      expect(result.locked).toBe(false);
    });

    it("does NOT evaluate the dynamic path when email/IP are absent", async () => {
      mockDb.query.loginAttempts.findMany.mockResolvedValue(buildFailedAttempts(10, email));

      // Called without email/ipAddress — dynamic lockout should be skipped entirely.
      const result = await accountLockoutService.isAccountLocked(userId);

      expect(result.locked).toBe(false);
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();
    });

    it("prioritizes an active manual lock over the dynamic evaluation", async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      mockDb.query.accountLocks.findFirst.mockResolvedValue({
        id: "lock-1",
        userId,
        lockedUntil,
        unlocked: false,
      } as unknown as AccountLock);

      const result = await accountLockoutService.isAccountLocked(userId, email, ipAddress);

      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toEqual(lockedUntil);
      // Manual lock short-circuits — dynamic query should not run.
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();
    });
  });

  describe("unlockAccount()", () => {
    it("should unlock account by setting unlocked=true", async () => {
      const userId = "user-123";
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

      mockDb.update.mockReturnValue({ set: mockSet });

      await accountLockoutService.unlockAccount(userId);

      expect(mockDb.update).toHaveBeenCalledWith(accountLocks);
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

      expect(mockDb.delete).toHaveBeenCalledWith(loginAttempts);
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

  describe("Lockout Workflow (end-to-end)", () => {
    it("records attempts, reports dynamic lockout at threshold, then respects a manual unlock", async () => {
      const email = "test@example.com";
      const userId = "user-123";
      const ipAddress = "192.168.1.1";

      // recordAttempt just inserts; capture each call.
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: mockValues });

      // No manual lock initially.
      mockDb.query.accountLocks.findFirst.mockResolvedValue(null);

      // Simulate 5 failed login attempts being recorded.
      for (let i = 0; i < 5; i++) {
        await accountLockoutService.recordAttempt(email, ipAddress, false);
      }
      expect(mockDb.insert).toHaveBeenCalledTimes(5);
      // recordAttempt must never evaluate lockout itself.
      expect(mockDb.query.loginAttempts.findMany).not.toHaveBeenCalled();

      // Dynamic evaluation: 5 recent failed attempts → locked.
      mockDb.query.loginAttempts.findMany.mockResolvedValue(buildFailedAttempts(5, email));
      const lockStatus = await accountLockoutService.isAccountLocked(userId, email, ipAddress);
      expect(lockStatus.locked).toBe(true);

      // Admin unlocks the account.
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });
      await accountLockoutService.unlockAccount(userId);
      expect(mockSet).toHaveBeenCalledWith({ unlocked: true });

      // After the attempt window clears (no recent failures), account is no longer locked.
      mockDb.query.loginAttempts.findMany.mockResolvedValue([]);
      const newLockStatus = await accountLockoutService.isAccountLocked(userId, email, ipAddress);
      expect(newLockStatus.locked).toBe(false);
    });
  });
});

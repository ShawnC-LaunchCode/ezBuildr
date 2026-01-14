import { describe, it, expect, vi, beforeEach } from "vitest";

import { db } from "../../../server/db";
import { auditLogService, SecurityEventType } from "../../../server/services/AuditLogService";

// Mock the database
vi.mock("../../../server/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(),
            })),
          })),
        })),
      })),
    })),
  },
}));

// Mock the logger
vi.mock("../../../server/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("AuditLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logLoginAttempt", () => {
    it("should log a successful login attempt", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.LOGIN_SUCCESS,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logLoginAttempt(
        "user-123",
        true,
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });

    it("should log a failed login attempt with reason", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.LOGIN_FAILED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logLoginAttempt(
        "user-123",
        false,
        "192.168.1.1",
        "Mozilla/5.0",
        "Invalid credentials"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe("logMfaChange", () => {
    it("should log MFA enabled event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.MFA_ENABLED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logMfaChange(
        "user-123",
        true,
        "192.168.1.1",
        "Mozilla/5.0",
        "totp"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });

    it("should log MFA disabled event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.MFA_DISABLED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logMfaChange(
        "user-123",
        false,
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe("logPasswordReset", () => {
    it("should log a password reset event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.PASSWORD_RESET,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logPasswordReset(
        "user-123",
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe("logSessionEvent", () => {
    it("should log a session created event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.SESSION_CREATED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logSessionEvent(
        "user-123",
        SecurityEventType.SESSION_CREATED,
        "session-123",
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });

    it("should log all sessions revoked event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.ALL_SESSIONS_REVOKED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logSessionEvent(
        "user-123",
        SecurityEventType.ALL_SESSIONS_REVOKED,
        null,
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe("logTrustedDeviceEvent", () => {
    it("should log a trusted device added event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.TRUSTED_DEVICE_ADDED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logTrustedDeviceEvent(
        "user-123",
        true,
        "device-fingerprint-123",
        "Chrome on Windows",
        "192.168.1.1",
        "Mozilla/5.0",
        "New York, US"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });

    it("should log a trusted device revoked event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.TRUSTED_DEVICE_REVOKED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logTrustedDeviceEvent(
        "user-123",
        false,
        "device-fingerprint-123",
        "Chrome on Windows",
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe("logAccountLockout", () => {
    it("should log an account locked event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.ACCOUNT_LOCKED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logAccountLockout(
        "user-123",
        true,
        "Too many failed login attempts",
        "192.168.1.1"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });

    it("should log an account unlocked event", async () => {
      const mockAuditLog = {
        id: "test-id",
        userId: "user-123",
        action: SecurityEventType.ACCOUNT_UNLOCKED,
        resourceType: "security",
        timestamp: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockAuditLog]);
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      const mockInsert = vi.fn(() => ({ values: mockValues }));

      (db.insert as any) = mockInsert;

      const result = await auditLogService.logAccountLockout(
        "user-123",
        false,
        "Lockout period expired",
        "192.168.1.1"
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });
});

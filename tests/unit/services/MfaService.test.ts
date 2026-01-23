import bcrypt from "bcrypt";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

import { MfaService } from "../../../server/services/MfaService";

// Mock dependencies
vi.mock("../../../server/db", () => ({
  db: {
    query: {
      mfaSecrets: {
        findFirst: vi.fn(),
      },
      mfaBackupCodes: {
        findMany: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
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

vi.mock("speakeasy");
vi.mock("qrcode");

describe("MfaService", () => {
  let mfaService: MfaService;
  let mockDb: any;

  beforeEach(async () => {
    mfaService = new MfaService();

    const dbModule = await import("../../../server/db");
    mockDb = dbModule.db;

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TOTP Setup", () => {
    describe("generateTotpSecret()", () => {
      it("should generate TOTP secret, QR code, and backup codes", async () => {
        const userId = "user-123";
        const userEmail = "test@example.com";

        // Mock speakeasy secret generation
        const mockSecret = {
          base32: "JBSWY3DPEHPK3PXP",
          otpauth_url: "otpauth://totp/ezBuildr(test@example.com)?secret=JBSWY3DPEHPK3PXP&issuer=ezBuildr",
        };
        (speakeasy.generateSecret as Mock).mockReturnValue(mockSecret);

        // Mock QR code generation
        (QRCode.toDataURL as Mock).mockResolvedValue("data:image/png;base64,mockQRCode");

        // Mock database insert
        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        });

        // Mock backup code storage
        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        const result = await mfaService.generateTotpSecret(userId, userEmail);

        expect(result.secret).toBe("JBSWY3DPEHPK3PXP");
        expect(result.qrCodeDataUrl).toBe("data:image/png;base64,mockQRCode");
        expect(result.backupCodes).toHaveLength(10);
        expect(result.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

        // Verify speakeasy was called correctly
        expect(speakeasy.generateSecret).toHaveBeenCalledWith({
          name: "ezBuildr (test@example.com)",
          issuer: "ezBuildr",
          length: 32,
        });

        // Verify QR code was generated
        expect(QRCode.toDataURL).toHaveBeenCalledWith(mockSecret.otpauth_url);
      });

      it("should throw error if secret generation fails", async () => {
        const userId = "user-123";
        const userEmail = "test@example.com";

        // Mock speakeasy to return no base32
        (speakeasy.generateSecret as Mock).mockReturnValue({});

        await expect(mfaService.generateTotpSecret(userId, userEmail)).rejects.toThrow(
          "Failed to generate TOTP secret"
        );
      });

      it("should generate unique backup codes", async () => {
        const userId = "user-123";
        const userEmail = "test@example.com";

        const mockSecret = {
          base32: "JBSWY3DPEHPK3PXP",
          otpauth_url: "otpauth://totp/test",
        };
        (speakeasy.generateSecret as Mock).mockReturnValue(mockSecret);
        (QRCode.toDataURL as Mock).mockResolvedValue("data:image/png;base64,mockQRCode");

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        });
        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        const result = await mfaService.generateTotpSecret(userId, userEmail);

        // Check all codes are unique
        const uniqueCodes = new Set(result.backupCodes);
        expect(uniqueCodes.size).toBe(10);

        // Check format
        result.backupCodes.forEach((code) => {
          expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        });
      });
    });

    describe("verifyAndEnableMfa()", () => {
      it("should verify TOTP code and enable MFA", async () => {
        const userId = "user-123";
        const token = "123456";

        // Mock database query
        mockDb.query.mfaSecrets.findFirst.mockResolvedValue({
          id: "secret-123",
          userId,
          secret: "JBSWY3DPEHPK3PXP",
          enabled: false,
        });

        // Mock TOTP verification
        (speakeasy.totp.verify as Mock).mockReturnValue(true);

        // Mock database updates
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const result = await mfaService.verifyAndEnableMfa(userId, token);

        expect(result).toBe(true);

        // Verify TOTP verification was called correctly
        expect(speakeasy.totp.verify).toHaveBeenCalledWith({
          secret: "JBSWY3DPEHPK3PXP",
          encoding: "base32",
          token,
          window: 2,
        });

        // Verify database updates were called
        expect(mockDb.update).toHaveBeenCalledTimes(2); // mfaSecrets and users
      });

      it("should return false if no MFA secret found", async () => {
        const userId = "user-123";
        const token = "123456";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue(null);

        const result = await mfaService.verifyAndEnableMfa(userId, token);

        expect(result).toBe(false);
        expect(speakeasy.totp.verify).not.toHaveBeenCalled();
      });

      it("should return false if TOTP code is invalid", async () => {
        const userId = "user-123";
        const token = "999999";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue({
          id: "secret-123",
          userId,
          secret: "JBSWY3DPEHPK3PXP",
          enabled: false,
        });

        (speakeasy.totp.verify as Mock).mockReturnValue(false);

        const result = await mfaService.verifyAndEnableMfa(userId, token);

        expect(result).toBe(false);
        expect(mockDb.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("TOTP Verification", () => {
    describe("verifyTotp()", () => {
      it("should verify valid TOTP code", async () => {
        const userId = "user-123";
        const token = "123456";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue({
          id: "secret-123",
          userId,
          secret: "JBSWY3DPEHPK3PXP",
          enabled: true,
        });

        (speakeasy.totp.verify as Mock).mockReturnValue(true);

        const result = await mfaService.verifyTotp(userId, token);

        expect(result).toBe(true);
      });

      it("should return false for invalid TOTP code", async () => {
        const userId = "user-123";
        const token = "999999";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue({
          id: "secret-123",
          userId,
          secret: "JBSWY3DPEHPK3PXP",
          enabled: true,
        });

        (speakeasy.totp.verify as Mock).mockReturnValue(false);

        const result = await mfaService.verifyTotp(userId, token);

        expect(result).toBe(false);
      });

      it("should return false if MFA is not enabled", async () => {
        const userId = "user-123";
        const token = "123456";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue(null);

        const result = await mfaService.verifyTotp(userId, token);

        expect(result).toBe(false);
        expect(speakeasy.totp.verify).not.toHaveBeenCalled();
      });

      it("should use 2-step window for time tolerance", async () => {
        const userId = "user-123";
        const token = "123456";

        mockDb.query.mfaSecrets.findFirst.mockResolvedValue({
          userId,
          secret: "JBSWY3DPEHPK3PXP",
          enabled: true,
        });

        (speakeasy.totp.verify as Mock).mockReturnValue(true);

        await mfaService.verifyTotp(userId, token);

        expect(speakeasy.totp.verify).toHaveBeenCalledWith({
          secret: "JBSWY3DPEHPK3PXP",
          encoding: "base32",
          token,
          window: 2, // 60 seconds total window
        });
      });
    });

    describe("isMfaEnabled()", () => {
      it("should return true if MFA is enabled", async () => {
        const userId = "user-123";

        mockDb.query.users.findFirst.mockResolvedValue({
          id: userId,
          email: "test@example.com",
          mfaEnabled: true,
        });

        const result = await mfaService.isMfaEnabled(userId);

        expect(result).toBe(true);
      });

      it("should return false if MFA is disabled", async () => {
        const userId = "user-123";

        mockDb.query.users.findFirst.mockResolvedValue({
          id: userId,
          email: "test@example.com",
          mfaEnabled: false,
        });

        const result = await mfaService.isMfaEnabled(userId);

        expect(result).toBe(false);
      });

      it("should return false if user not found", async () => {
        const userId = "user-123";

        mockDb.query.users.findFirst.mockResolvedValue(null);

        const result = await mfaService.isMfaEnabled(userId);

        expect(result).toBe(false);
      });
    });
  });

  describe("Backup Codes", () => {
    describe("verifyBackupCode()", () => {
      it("should verify and consume valid backup code", async () => {
        const userId = "user-123";
        const code = "ABCD-1234";

        const hashedCode = await bcrypt.hash(code, 10);

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([
          {
            id: "code-1",
            userId,
            codeHash: hashedCode,
            used: false,
          },
        ]);

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const result = await mfaService.verifyBackupCode(userId, code);

        expect(result).toBe(true);

        // Verify code was marked as used
        expect(mockDb.update).toHaveBeenCalled();
      });

      it("should return false for invalid backup code", async () => {
        const userId = "user-123";
        const code = "WRONG-CODE";

        const hashedCode = await bcrypt.hash("ABCD-1234", 10);

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([
          {
            id: "code-1",
            userId,
            codeHash: hashedCode,
            used: false,
          },
        ]);

        const result = await mfaService.verifyBackupCode(userId, code);

        expect(result).toBe(false);
        expect(mockDb.update).not.toHaveBeenCalled();
      });

      it("should return false if no unused backup codes", async () => {
        const userId = "user-123";
        const code = "ABCD-1234";

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([]);

        const result = await mfaService.verifyBackupCode(userId, code);

        expect(result).toBe(false);
      });

      it("should try multiple codes if first doesn't match", async () => {
        const userId = "user-123";
        const code = "EFGH-5678";

        const hash1 = await bcrypt.hash("ABCD-1234", 10);
        const hash2 = await bcrypt.hash("EFGH-5678", 10);

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([
          { id: "code-1", userId, codeHash: hash1, used: false },
          { id: "code-2", userId, codeHash: hash2, used: false },
        ]);

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const result = await mfaService.verifyBackupCode(userId, code);

        expect(result).toBe(true);
      });
    });

    describe("regenerateBackupCodes()", () => {
      it("should generate new backup codes", async () => {
        const userId = "user-123";

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        });

        const codes = await mfaService.regenerateBackupCodes(userId);

        expect(codes).toHaveLength(10);
        expect(codes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

        // Verify old codes were deleted
        expect(mockDb.delete).toHaveBeenCalled();

        // Verify new codes were inserted
        expect(mockDb.insert).toHaveBeenCalled();
      });

      it("should generate unique codes", async () => {
        const userId = "user-123";

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        });

        const codes = await mfaService.regenerateBackupCodes(userId);

        const uniqueCodes = new Set(codes);
        expect(uniqueCodes.size).toBe(10);
      });
    });

    describe("getRemainingBackupCodesCount()", () => {
      it("should return count of unused backup codes", async () => {
        const userId = "user-123";

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([
          { id: "code-1", used: false },
          { id: "code-2", used: false },
          { id: "code-3", used: false },
        ]);

        const count = await mfaService.getRemainingBackupCodesCount(userId);

        expect(count).toBe(3);
      });

      it("should return 0 if all codes are used", async () => {
        const userId = "user-123";

        mockDb.query.mfaBackupCodes.findMany.mockResolvedValue([]);

        const count = await mfaService.getRemainingBackupCodesCount(userId);

        expect(count).toBe(0);
      });
    });
  });

  describe("Disable MFA", () => {
    describe("disableMfa()", () => {
      it("should disable MFA and delete backup codes", async () => {
        const userId = "user-123";

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        await mfaService.disableMfa(userId);

        // Verify MFA secret was disabled
        expect(mockDb.update).toHaveBeenCalled();

        // Verify backup codes were deleted
        expect(mockDb.delete).toHaveBeenCalled();
      });
    });

    describe("adminResetMfa()", () => {
      it("should reset MFA and delete secret", async () => {
        const userId = "user-123";

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        await mfaService.adminResetMfa(userId);

        // Verify MFA was disabled
        expect(mockDb.update).toHaveBeenCalled();

        // Verify secret and backup codes were deleted
        expect(mockDb.delete).toHaveBeenCalled();
      });
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, redact, redactObject, maskSecret, generateMasterKey, validateMasterKey } from "../../../server/utils/encryption";
describe("Encryption Utilities", () => {
  const originalMasterKey = process.env.VL_MASTER_KEY;
  beforeEach(() => {
    // Set a test master key (32 bytes in base64)
    const testKey = Buffer.from("0".repeat(32)).toString("base64");
    process.env.VL_MASTER_KEY = testKey;
  });
  afterEach(() => {
    // Restore original master key
    process.env.VL_MASTER_KEY = originalMasterKey;
  });
  describe("generateMasterKey", () => {
    it("should generate a valid base64-encoded 32-byte key", () => {
      const key = generateMasterKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe("string");
      // Decode from base64 and check length
      const buffer = Buffer.from(key, "base64");
      expect(buffer.length).toBe(32);
    });
    it("should generate different keys each time", () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1).not.toBe(key2);
    });
  });
  describe("validateMasterKey", () => {
    it("should not throw error when master key is valid", () => {
      expect(() => validateMasterKey()).not.toThrow();
    });
    it("should throw error when master key is missing", () => {
      delete process.env.VL_MASTER_KEY;
      expect(() => validateMasterKey()).toThrow(
        "VL_MASTER_KEY environment variable not set"
      );
    });
    it("should throw error when master key is invalid base64", () => {
      process.env.VL_MASTER_KEY = "not-valid-base64!!!";
      expect(() => validateMasterKey()).toThrow("Invalid VL_MASTER_KEY format");
    });
    it("should throw error when master key is wrong length", () => {
      // 16 bytes instead of 32
      const shortKey = Buffer.from("0".repeat(16)).toString("base64");
      process.env.VL_MASTER_KEY = shortKey;
      expect(() => validateMasterKey()).toThrow("Master key must be 32 bytes");
    });
  });
  describe("encrypt and decrypt", () => {
    it("should encrypt and decrypt a string successfully", () => {
      const plaintext = "my-secret-api-key-12345";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
    it("should produce different ciphertext for same plaintext", () => {
      const plaintext = "my-secret-api-key";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      // Different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      // But both decrypt to same plaintext
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
    it("should handle empty strings", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
    it("should handle unicode characters", () => {
      const plaintext = "🔐 Secret with émoji and ñ characters";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
    it("should handle long strings", () => {
      const plaintext = "a".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(10000);
    });
    it("should throw error when decrypting with wrong key", () => {
      const plaintext = "my-secret";
      const encrypted = encrypt(plaintext);
      // Change the master key
      process.env.VL_MASTER_KEY = generateMasterKey();
      expect(() => decrypt(encrypted)).toThrow("Decryption failed");
    });
    it("should throw error when decrypting corrupted data", () => {
      const plaintext = "my-secret";
      const encrypted = encrypt(plaintext);
      // Corrupt the encrypted data
      const corrupted = `${encrypted.substring(0, encrypted.length - 4)  }XXXX`;
      expect(() => decrypt(corrupted)).toThrow("Decryption failed");
    });
    it("should throw error when decrypting invalid base64", () => {
      expect(() => decrypt("not-valid-base64!!!")).toThrow();
    });
    it("should return base64-encoded ciphertext", () => {
      const plaintext = "my-secret";
      const encrypted = encrypt(plaintext);
      // Should be valid base64
      expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
      // Should contain IV (12 bytes) + auth tag (16 bytes) + ciphertext
      const buffer = Buffer.from(encrypted, "base64");
      expect(buffer.length).toBeGreaterThanOrEqual(28); // 12 + 16
    });
  });
  describe("redact", () => {
    it("should redact non-empty strings", () => {
      expect(redact("my-secret-key")).toBe("••••••••");
    });
    it("should return (empty) for null", () => {
      expect(redact(null)).toBe("(empty)");
    });
    it("should return (empty) for undefined", () => {
      expect(redact(undefined)).toBe("(empty)");
    });
    it("should return (empty) for empty string", () => {
      expect(redact("")).toBe("(empty)");
    });
  });
  describe("maskSecret", () => {
    it("should mask long secrets showing first and last 4 characters", () => {
      const secret = "sk_test_1234567890abcdef";
      expect(maskSecret(secret)).toBe("sk_t...cdef");
    });
    it("should fully redact short secrets", () => {
      expect(maskSecret("short")).toBe("••••••••");
    });
    it("should fully redact secrets with 8 or fewer characters", () => {
      expect(maskSecret("12345678")).toBe("••••••••");
    });
    it("should handle empty string", () => {
      expect(maskSecret("")).toBe("(empty)");
    });
  });
  describe("redactObject", () => {
    it("should redact sensitive fields by default", () => {
      const obj = {
        username: "john",
        password: "secret123",
        apiKey: "sk_test_12345",
        token: "bearer_xyz",
        email: "john@example.com",
      };
      const redacted = redactObject(obj);
      expect(redacted.username).toBe("john");
      expect(redacted.email).toBe("john@example.com");
      expect(redacted.password).toBe("••••••••");
      expect(redacted.apiKey).toBe("••••••••");
      expect(redacted.token).toBe("••••••••");
    });
    it("should redact custom sensitive keys", () => {
      const obj = {
        username: "john",
        customSecret: "secret123",
        publicData: "public",
      };
      const redacted = redactObject(obj, ["customSecret"]);
      expect(redacted.username).toBe("john");
      expect(redacted.publicData).toBe("public");
      expect(redacted.customSecret).toBe("••••••••");
    });
    it("should handle nested objects", () => {
      const obj = {
        user: {
          name: "john",
          credentials: {
            password: "secret123",
            apiKey: "sk_test_12345",
          },
        },
      };
      const redacted = redactObject(obj);
      expect(redacted.user.name).toBe("john");
      expect(redacted.user.credentials.password).toBe("••••••••");
      expect(redacted.user.credentials.apiKey).toBe("••••••••");
    });
    it("should not modify non-object values", () => {
      const obj = {
        count: 42,
        active: true,
        items: [1, 2, 3],
      };
      const redacted = redactObject(obj);
      expect(redacted.count).toBe(42);
      expect(redacted.active).toBe(true);
      expect(redacted.items).toEqual([1, 2, 3]);
    });
    it("should handle case-insensitive matching", () => {
      const obj = {
        PASSWORD: "secret1",
        Password: "secret2",
        pAsSwOrD: "secret3",
      };
      const redacted = redactObject(obj);
      expect(redacted.PASSWORD).toBe("••••••••");
      expect(redacted.Password).toBe("••••••••");
      expect(redacted.pAsSwOrD).toBe("••••••••");
    });
    it("should handle partial matches in key names", () => {
      const obj = {
        userPassword: "secret1",
        authToken: "secret2",
        clientSecret: "secret3",
      };
      const redacted = redactObject(obj);
      expect(redacted.userPassword).toBe("••••••••");
      expect(redacted.authToken).toBe("••••••••");
      expect(redacted.clientSecret).toBe("••••••••");
    });
  });
});
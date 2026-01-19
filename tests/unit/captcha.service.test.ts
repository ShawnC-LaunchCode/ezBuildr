import { describe, it, expect } from "vitest";
import { CaptchaService } from "../../server/services/CaptchaService";
import type { CaptchaResponse } from "../../shared/types/intake";
describe("CaptchaService", () => {
  describe("generateSimpleChallenge", () => {
    it("should generate a valid simple math challenge", () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      expect(challenge.type).toBe("simple");
      expect(challenge.question).toMatch(/What is \d+ \+ \d+\?/);
      expect(challenge.token).toBeDefined();
      expect(challenge.token.length).toBe(32); // 16 bytes = 32 hex chars
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });
    it("should generate unique tokens for each challenge", () => {
      const challenge1 = CaptchaService.generateSimpleChallenge();
      const challenge2 = CaptchaService.generateSimpleChallenge();
      expect(challenge1.token).not.toBe(challenge2.token);
    });
    it("should generate challenges with numbers between 1-20", () => {
      for (let i = 0; i < 10; i++) {
        const challenge = CaptchaService.generateSimpleChallenge();
        const match = challenge.question?.match(/What is (\d+) \+ (\d+)\?/);
        expect(match).toBeDefined();
        if (match) {
          const num1 = parseInt(match[1], 10);
          const num2 = parseInt(match[2], 10);
          expect(num1).toBeGreaterThanOrEqual(1);
          expect(num1).toBeLessThanOrEqual(20);
          expect(num2).toBeGreaterThanOrEqual(1);
          expect(num2).toBeLessThanOrEqual(20);
        }
      }
    });
  });
  describe("validateCaptcha - simple type", () => {
    it("should validate correct answer", async () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      const match = challenge.question?.match(/What is (\d+) \+ (\d+)\?/);
      if (match) {
        const answer = (parseInt(match[1], 10) + parseInt(match[2], 10)).toString();
        const response: CaptchaResponse = {
          type: "simple",
          token: challenge.token,
          answer,
        };
        const result = await CaptchaService.validateCaptcha(response, "test-workflow");
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });
    it("should reject incorrect answer", async () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      const response: CaptchaResponse = {
        type: "simple",
        token: challenge.token,
        answer: "999",
      };
      const result = await CaptchaService.validateCaptcha(response, "test-workflow");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Incorrect answer");
    });
    it("should reject missing token", async () => {
      const response: CaptchaResponse = {
        type: "simple",
        token: "",
        answer: "5",
      };
      const result = await CaptchaService.validateCaptcha(response, "test-workflow");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing CAPTCHA token or answer");
    });
    it("should reject missing answer", async () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      const response: CaptchaResponse = {
        type: "simple",
        token: challenge.token,
        answer: "",
      };
      const result = await CaptchaService.validateCaptcha(response, "test-workflow");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing CAPTCHA token or answer");
    });
    it("should reject invalid token", async () => {
      const response: CaptchaResponse = {
        type: "simple",
        token: "invalid-token",
        answer: "5",
      };
      const result = await CaptchaService.validateCaptcha(response, "test-workflow");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid or expired CAPTCHA token");
    });
    it("should enforce max attempts (3)", async () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      // Attempt 1 - wrong
      await CaptchaService.validateCaptcha(
        { type: "simple", token: challenge.token, answer: "999" },
        "test-workflow"
      );
      // Attempt 2 - wrong
      await CaptchaService.validateCaptcha(
        { type: "simple", token: challenge.token, answer: "999" },
        "test-workflow"
      );
      // Attempt 3 - wrong (should be last attempt)
      const result3 = await CaptchaService.validateCaptcha(
        { type: "simple", token: challenge.token, answer: "999" },
        "test-workflow"
      );
      expect(result3.valid).toBe(false);
      expect(result3.error).toContain("Too many attempts");
    });
    it("should clean up used token after successful validation", async () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      const match = challenge.question?.match(/What is (\d+) \+ (\d+)\?/);
      if (match) {
        const answer = (parseInt(match[1], 10) + parseInt(match[2], 10)).toString();
        // First validation - success
        const result1 = await CaptchaService.validateCaptcha(
          { type: "simple", token: challenge.token, answer },
          "test-workflow"
        );
        expect(result1.valid).toBe(true);
        // Try to use same token again - should fail
        const result2 = await CaptchaService.validateCaptcha(
          { type: "simple", token: challenge.token, answer },
          "test-workflow"
        );
        expect(result2.valid).toBe(false);
        expect(result2.error).toBe("Invalid or expired CAPTCHA token");
      }
    });
  });
  describe("getStats", () => {
    it("should return challenge statistics", () => {
      // Generate some challenges
      CaptchaService.generateSimpleChallenge();
      CaptchaService.generateSimpleChallenge();
      CaptchaService.generateSimpleChallenge();
      const stats = CaptchaService.getStats();
      expect(stats.activeChallenges).toBeGreaterThanOrEqual(0);
      expect(typeof stats.activeChallenges).toBe("number");
    });
  });
});
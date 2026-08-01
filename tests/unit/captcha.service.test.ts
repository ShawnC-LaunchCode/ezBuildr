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
      expect(challenge.token.length).toBeGreaterThan(50); // It's a JWT-like payload.signature now
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });
    it("SEC-053: does not embed the plaintext answer in the token", () => {
      const challenge = CaptchaService.generateSimpleChallenge();
      const payload = Buffer.from(challenge.token.split(".")[0], "base64url").toString("utf-8");
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      // Only a keyed commitment + expiry may be present — never the answer itself.
      expect(parsed.answer).toBeUndefined();
      expect(typeof parsed.answerHash).toBe("string");
    });
    it("should generate unique tokens for each challenge", () => {
      const challenge1 = CaptchaService.generateSimpleChallenge();
      const challenge2 = CaptchaService.generateSimpleChallenge();
      expect(challenge1.token).not.toBe(challenge2.token);
    });
    it("should generate challenges with numbers between 10-50", () => {
      for (let i = 0; i < 10; i++) {
        const challenge = CaptchaService.generateSimpleChallenge();
        const match = challenge.question?.match(/What is (\d+) \+ (\d+)\?/);
        expect(match).toBeDefined();
        if (match) {
          const num1 = parseInt(match[1], 10);
          const num2 = parseInt(match[2], 10);
          expect(num1).toBeGreaterThanOrEqual(10);
          expect(num1).toBeLessThanOrEqual(50);
          expect(num2).toBeGreaterThanOrEqual(10);
          expect(num2).toBeLessThanOrEqual(50);
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
    it("should reject invalid token format", async () => {
      const response: CaptchaResponse = {
        type: "simple",
        token: "invalid-token",
        answer: "5",
      };
      const result = await CaptchaService.validateCaptcha(response, "test-workflow");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid CAPTCHA token format");
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
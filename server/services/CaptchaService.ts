import crypto from "crypto";
import type { CaptchaChallenge, CaptchaResponse, CaptchaType } from "../../shared/types/intake.js";
import logger from "../logger";

/**
 * CAPTCHA Service for Intake Portal (Stage 12.5)
 *
 * Generates and validates CAPTCHA challenges for anti-bot protection.
 * Supports simple math puzzles (MVP) and reCAPTCHA (optional).
 */

interface StoredChallenge {
  answer: string;
  expiresAt: number;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// In-memory store for challenges (would use Redis in production)
const challengeStore = new Map<string, StoredChallenge>();

export class CaptchaService {
  /**
   * Generate a simple math CAPTCHA challenge
   */
  static generateSimpleChallenge(): CaptchaChallenge {
    const num1 = Math.floor(Math.random() * 20) + 1; // 1-20
    const num2 = Math.floor(Math.random() * 20) + 1; // 1-20
    const answer = (num1 + num2).toString();
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;

    // Store challenge
    challengeStore.set(token, {
      answer,
      expiresAt,
      attempts: 0,
    });

    // Clean up expired challenges periodically
    this.cleanupExpired();

    return {
      type: "simple",
      question: `What is ${num1} + ${num2}?`,
      token,
      expiresAt,
    };
  }

  /**
   * Validate a CAPTCHA response
   */
  static async validateCaptcha(
    response: CaptchaResponse,
    workflowId: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (response.type === "simple") {
      return this.validateSimpleChallenge(response);
    } else if (response.type === "recaptcha") {
      return this.validateRecaptcha(response.recaptchaToken);
    }

    return { valid: false, error: "Invalid CAPTCHA type" };
  }

  /**
   * Validate simple math challenge
   */
  private static validateSimpleChallenge(
    response: CaptchaResponse
  ): { valid: boolean; error?: string } {
    const { token, answer } = response;

    if (!token || !answer) {
      return { valid: false, error: "Missing CAPTCHA token or answer" };
    }

    const challenge = challengeStore.get(token);

    if (!challenge) {
      return { valid: false, error: "Invalid or expired CAPTCHA token" };
    }

    // Check expiry
    if (Date.now() > challenge.expiresAt) {
      challengeStore.delete(token);
      return { valid: false, error: "CAPTCHA has expired" };
    }

    // Check attempts
    if (challenge.attempts >= MAX_ATTEMPTS) {
      challengeStore.delete(token);
      return { valid: false, error: "Too many attempts. Please refresh." };
    }

    // Increment attempts
    challenge.attempts++;

    // Check answer
    const isCorrect = answer.trim() === challenge.answer;

    if (isCorrect) {
      // Clean up used token
      challengeStore.delete(token);
      return { valid: true };
    } else {
      // Update attempt count
      challengeStore.set(token, challenge);
      return {
        valid: false,
        error: `Incorrect answer. ${MAX_ATTEMPTS - challenge.attempts} attempts remaining.`,
      };
    }
  }

  /**
   * Validate Google reCAPTCHA (optional feature)
   */
  private static async validateRecaptcha(
    recaptchaToken?: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (!recaptchaToken) {
      return { valid: false, error: "Missing reCAPTCHA token" };
    }

    const secretKey = process.env.RECAPTCHA_SECRET;

    if (!secretKey) {
      logger.warn("RECAPTCHA_SECRET not configured. Falling back to simple CAPTCHA.");
      return { valid: false, error: "reCAPTCHA not configured on server" };
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: recaptchaToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        return { valid: true };
      } else {
        logger.error("reCAPTCHA validation failed", { errors: data["error-codes"] });
        return { valid: false, error: "reCAPTCHA verification failed" };
      }
    } catch (error) {
      logger.error("Error validating reCAPTCHA", { error });
      return { valid: false, error: "Failed to verify reCAPTCHA" };
    }
  }

  /**
   * Clean up expired challenges
   */
  private static cleanupExpired(): void {
    const now = Date.now();
    for (const [token, challenge] of challengeStore.entries()) {
      if (now > challenge.expiresAt) {
        challengeStore.delete(token);
      }
    }
  }

  /**
   * Get challenge statistics (for monitoring)
   */
  static getStats(): { activeChallenges: number } {
    this.cleanupExpired();
    return {
      activeChallenges: challengeStore.size,
    };
  }
}

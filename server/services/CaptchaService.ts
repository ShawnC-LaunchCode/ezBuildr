import crypto from "crypto";

import { createLogger } from "../logger";
import { safeFetch } from "../utils/safeFetch";

import type { CaptchaChallenge, CaptchaResponse } from "../../shared/types/intake.js";

const logger = createLogger({ module: "captcha-service" });

/**
 * CAPTCHA Service for Intake Portal (Stage 12.5)
 *
 * Generates and validates CAPTCHA challenges for anti-bot protection.
 * Supports simple math puzzles (MVP) and reCAPTCHA (optional).
 */

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function getCaptchaSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-captcha-secret-key-that-is-long-enough";
}

/** Constant-time comparison of two hex-encoded strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export class CaptchaService {
  /**
   * Generate a simple math CAPTCHA challenge
   */
  static generateSimpleChallenge(): CaptchaChallenge {
    const num1 = Math.floor(Math.random() * 40) + 10; // 10-49
    const num2 = Math.floor(Math.random() * 40) + 10; // 10-49
    const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;

    // SEC-053: commit to the answer with a keyed hash rather than embedding the
    // plaintext answer in the token. Previously the token was
    // base64(JSON{ answer, expiresAt }) — signed, but the answer was readable by
    // base64-decoding it, so a bot could pass without solving anything. Now the
    // token carries only HMAC(secret, answer:expiresAt); the answer is never
    // recoverable from the token. (A bot can still compute the sum from the
    // question text, which is why reCAPTCHA is enforced in production — see
    // validateCaptcha.)
    const answerHash = this.hashAnswer((num1 + num2).toString(), expiresAt);
    const payload = Buffer.from(JSON.stringify({ answerHash, expiresAt })).toString("base64url");
    const signature = crypto.createHmac("sha256", getCaptchaSecret()).update(payload).digest("hex");
    const token = `${payload}.${signature}`;

    return {
      type: "simple",
      question: `What is ${num1} + ${num2}?`,
      token,
      expiresAt,
    };
  }

  /** Keyed commitment to a challenge answer, bound to the token's expiry. */
  private static hashAnswer(answer: string, expiresAt: number): string {
    return crypto
      .createHmac("sha256", getCaptchaSecret())
      .update(`${answer.trim()}:${expiresAt}`)
      .digest("hex");
  }

  /**
   * Validate a CAPTCHA response
   */
  static async validateCaptcha(
    response: CaptchaResponse,
    _workflowId: string
  ): Promise<{ valid: boolean; error?: string }> {
    // SEC-053: the simple math puzzle is inherently weak (the answer is derivable
    // from the question). When a real CAPTCHA is configured, require it in
    // production and treat "simple" as a dev/fallback-only mechanism.
    if (
      response.type === "simple" &&
      process.env.NODE_ENV === "production" &&
      typeof process.env.RECAPTCHA_SECRET === "string" &&
      process.env.RECAPTCHA_SECRET.length > 0
    ) {
      logger.warn("Rejected a simple CAPTCHA in production; reCAPTCHA is configured and required.");
      return { valid: false, error: "Simple CAPTCHA is disabled in production; reCAPTCHA is required." };
    }

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

    const parts = token.split(".");
    if (parts.length !== 2) {
      return { valid: false, error: "Invalid CAPTCHA token format" };
    }

    const [payload, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", getCaptchaSecret()).update(payload).digest("hex");

    if (!timingSafeEqualHex(signature, expectedSignature)) {
      return { valid: false, error: "Invalid or tampered CAPTCHA token" };
    }

    let parsedPayload: { answerHash: string; expiresAt: number };
    try {
      parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { answerHash: string; expiresAt: number };
    } catch {
      return { valid: false, error: "Malformed CAPTCHA token" };
    }

    if (Date.now() > parsedPayload.expiresAt) {
      return { valid: false, error: "CAPTCHA has expired" };
    }

    // SEC-053: recompute the keyed hash of the submitted answer and compare it to
    // the committed hash (constant-time). The plaintext answer is never in the token.
    const submittedHash = this.hashAnswer(answer, parsedPayload.expiresAt);
    if (!timingSafeEqualHex(submittedHash, parsedPayload.answerHash)) {
      // Stateless: attempt-tracking isn't possible here; the client simply fails.
      return { valid: false, error: "Incorrect answer." };
    }

    return { valid: true };
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
      // Routed through safeFetch (not raw fetch) to satisfy the SSRF guard and keep
      // all outbound server HTTP on one hardened path, even though the URL is a
      // hardcoded Google endpoint rather than user input.
      const response = await safeFetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- standard HTTP header name
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: recaptchaToken,
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/naming-convention -- Google reCAPTCHA API response field name
      const data: { success: boolean; "error-codes"?: string[] } = await response.json();

      if (data.success) {
        return { valid: true };
      } else {
        logger.error({ errors: data["error-codes"] }, "reCAPTCHA validation failed");
        return { valid: false, error: "reCAPTCHA verification failed" };
      }
    } catch (error) {
      logger.error({ error }, "Error validating reCAPTCHA");
      return { valid: false, error: "Failed to verify reCAPTCHA" };
    }
  }

  /**
   * Get challenge statistics (for monitoring)
   */
  static getStats(): { activeChallenges: number } {
    // Stateless CAPTCHAs do not track active challenges
    return {
      activeChallenges: 0,
    };
  }
}

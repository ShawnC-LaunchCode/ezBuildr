/**
 * Intake Portal Type Definitions (Stage 12.5)
 *
 * This module provides type-safe definitions for intake portal configuration,
 * including prefill, CAPTCHA, and email receipt features.
 */

/**
 * CAPTCHA type for intake portal
 */
export type CaptchaType = "simple" | "recaptcha";

/**
 * Intake portal configuration stored in workflows.intakeConfig
 */
export interface IntakeConfig {
  // URL-based Prefill
  allowPrefill?: boolean;
  allowedPrefillKeys?: string[];

  // CAPTCHA / Anti-bot
  requireCaptcha?: boolean;
  captchaType?: CaptchaType;

  // Email Receipts
  sendEmailReceipt?: boolean;
  receiptEmailVar?: string;       // Variable key that contains user's email
  receiptTemplateId?: string;     // Optional email template ID for future use
  excludeFromReceipt?: string[];  // NEW: List of field aliases to exclude from receipt (e.g. sensitive data)
}

/**
 * CAPTCHA challenge data
 */
export interface CaptchaChallenge {
  type: CaptchaType;
  question?: string;              // For simple type: "What is X + Y?"
  token: string;                  // Unique token to validate answer
  expiresAt: number;              // Timestamp when challenge expires
}

/**
 * CAPTCHA response from client
 */
export interface CaptchaResponse {
  type: CaptchaType;
  token: string;                  // Token from challenge
  answer?: string;                // For simple type: user's answer
  recaptchaToken?: string;        // For recaptcha type: Google token
}

/**
 * Email receipt data
 */
export interface IntakeEmailReceipt {
  attempted: boolean;
  to?: string;
  success?: boolean;
  error?: string;
}

/**
 * Intake run submission result
 */
export interface IntakeSubmitResult {
  runId: string;
  status: "success" | "error" | "validation_error";
  errors?: string[];
  emailReceipt?: IntakeEmailReceipt;
  outputs?: {
    pdf?: string;                 // URL to generated PDF
    docx?: string;                // URL to generated DOCX
  };
}

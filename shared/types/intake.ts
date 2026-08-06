/**
 * Intake configuration and CAPTCHA types.
 *
 * The Stage 12.5 intake portal (`/intake/*`) was removed on 2026-08-05 — its run
 * pipeline duplicated `/api/runs/*` and had no caller. What remains here is what
 * outlived it:
 *
 * - `IntakeConfig` — still a **live security control**. `RunService.createRun`
 *   and `createAnonymousRun` read `workflows.intakeConfig` and pass it to
 *   `filterPrefillValues` (RUN2-6), so `allowPrefill` / `allowedPrefillKeys`
 *   decide which caller-supplied values may seed a run.
 * - `CaptchaChallenge` / `CaptchaResponse` / `CaptchaType` — used by
 *   `CaptchaService`, which serves the **login and registration** captcha in
 *   `auth.routes.ts`. Nothing to do with intake any more.
 *
 * The other `IntakeConfig` fields (`requireCaptcha`, `captchaType`,
 * `sendEmailReceipt`, `receiptEmailVar`, `receiptTemplateId`,
 * `excludeFromReceipt`) are now **inert** — the portal was their only reader.
 * They are deliberately NOT deleted: `IntakeConfigSchema` is `.strict()` and
 * `RunService.resolveIntakeConfig` degrades to `{}` on a parse failure, so
 * dropping them would make any stored config still containing them fail to parse
 * and would silently switch prefill off. Removing them needs a data migration.
 */

/**
 * CAPTCHA type (login / registration anti-bot)
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

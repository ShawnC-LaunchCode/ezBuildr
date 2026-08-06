// Email service for sending notifications
// Note: In a production environment, you would use a service like SendGrid, Mailgun, or AWS SES
// For this implementation, we'll create a stub that logs the email details

import { logger } from "../logger";

const _FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@ezbuildr.com';


/**
 * Send a generic email using SendGrid or fallback to logger
 */
import { emailQueueService } from "./EmailQueueService";

/**
 * Send a generic email using the async queue
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    await emailQueueService.addToQueue(to, subject, html);
    return true; // Queued successfully
  } catch (error) {
    logger.error({ error, to, subject }, 'Failed to queue email');
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendRunResumeEmail(
  email: string,
  resumeUrl: string,
  expiresAt: Date,
  kind: 'save_resume' | 'handoff',
): Promise<void> {
  const safeUrl = escapeHtml(resumeUrl);
  const safeExpiry = escapeHtml(expiresAt.toISOString());
  const heading = kind === 'handoff' ? 'An interview is ready for you' : 'Continue your saved interview';
  const intro = kind === 'handoff'
    ? 'A staff member assigned an in-progress interview to you.'
    : 'Your interview progress was saved.';
  const queued = await sendEmail(email, `${heading} - ezBuildr`, `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${heading}</h2>
      <p>${intro}</p>
      <p><a href="${safeUrl}">Continue interview</a></p>
      <p>This private, one-time link expires at ${safeExpiry}.</p>
      <p>If you were not expecting this email, you can ignore it.</p>
    </div>
  `);
  if (!queued) {
    throw new Error('Failed to queue resume email');
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // In production, this should point to the actual frontend URL
  const baseUrl = process.env.VITE_BASE_URL ?? process.env.PUBLIC_URL ?? (process.env.NODE_ENV === 'production' ? 'https://ezbuildr.com' : 'http://localhost:5000');
  const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

  const subject = 'Reset Your Password - ezBuildr';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset Your Password</h2>
      <p>You requested to reset your password for your ezBuildr account.</p>
      <p>Click the button below to reset it:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't ask to reset your password, you can ignore this email.</p>
    </div>
  `;

  await sendEmail(email, subject, html);
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.VITE_BASE_URL ?? process.env.PUBLIC_URL ?? (process.env.NODE_ENV === 'production' ? 'https://ezbuildr.com' : 'http://localhost:5000');
  const verifyLink = `${baseUrl}/auth/verify-email?token=${token}`;

  const subject = 'Verify Your Email - ezBuildr';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify Your Email</h2>
      <p>Welcome to ezBuildr! Please verify your email address to get started.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>This link will expire in 24 hours.</p>
    </div>
  `;

  await sendEmail(email, subject, html);
}


export async function sendSystemInviteEmail(
  email: string,
  token: string,
  role: string,
  returnTo?: string
): Promise<void> {
  let baseUrl = process.env.NODE_ENV === 'production' ? 'https://www.ezbuildr.com' : (process.env.VITE_BASE_URL ?? 'http://localhost:5000');
  baseUrl = baseUrl.replace(/\/+$/, ''); // Strip trailing slashes
  const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\')
    ? `&returnTo=${encodeURIComponent(returnTo)}`
    : '';
  const setupLink = `${baseUrl}/auth/reset-password?token=${token}&setup=true${safeReturnTo}`;
  const roleDisplay = role === 'admin' ? 'an Administrator' : 'a Creator';

  const subject = 'You have been invited to ezBuildr';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ezBuildr!</h2>
      <p>You have been invited to join ezBuildr as ${roleDisplay}.</p>
      <p>Click the button below to set your password and complete your account setup:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${setupLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Complete Setup</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${setupLink}">${setupLink}</a></p>
      <p>This link will expire in 7 days.</p>
    </div>
  `;

  await sendEmail(email, subject, html);
}


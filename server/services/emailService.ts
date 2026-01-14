// Email service for sending notifications
// Note: In a production environment, you would use a service like SendGrid, Mailgun, or AWS SES
// For this implementation, we'll create a stub that logs the email details

import { logger } from "../logger";

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@ezbuildr.com'; // Rebranded from VaultLogic

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

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // In production, this should point to the actual frontend URL
  // For now, we assume it's running on the same host or configured via env
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
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
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
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

export async function sendNotificationEmail(
  recipientEmail: string,
  surveyTitle: string,
  respondentName: string,
  responseViewUrl: string
): Promise<void> {
  const subject = `New Response: ${surveyTitle}`;
  const html = `
    <div style="font-family: sans-serif;">
      <h2>New Survey Response</h2>
      <p>You have received a new response for <strong>${surveyTitle}</strong> from ${respondentName}.</p>
      <p><a href="${responseViewUrl}">View Response</a></p>
    </div>
  `;
  await sendEmail(recipientEmail, subject, html);
}

export async function sendSurveyInvitation(
  recipientEmail: string,
  recipientName: string,
  surveyTitle: string,
  surveyUrl: string
): Promise<void> {
  const subject = `Invitation: ${surveyTitle}`;
  const html = `
    <div style="font-family: sans-serif;">
      <h2>Invited to ${surveyTitle}</h2>
      <p>Hello ${recipientName},</p>
      <p>You are invited to participate in a survey.</p>
      <p><a href="${surveyUrl}">Start Survey</a></p>
    </div>
  `;
  await sendEmail(recipientEmail, subject, html);
}

export interface IntakeReceiptData {
  to: string;
  tenantId: string;
  workflowId: string;
  workflowName: string;
  runId: string;
  summary?: Record<string, any>;
  downloadLinks?: {
    pdf?: string;
    docx?: string;
  };
}

export async function sendIntakeReceipt(
  data: IntakeReceiptData
): Promise<{ success: boolean; error?: string }> {
  try {
    const { to, workflowName, runId, summary, downloadLinks } = data;

    let summaryHtml = "";
    if (summary && Object.keys(summary).length > 0) {
      summaryHtml = "<h3>Your Submission</h3><ul>";
      for (const [key, value] of Object.entries(summary)) {
        if (key.toLowerCase().match(/(password|ssn|credit|card)/)) {continue;}
        summaryHtml += `<li><strong>${key}:</strong> ${String(value).substring(0, 100)}</li>`;
      }
      summaryHtml += "</ul>";
    }

    let downloadHtml = "";
    if (downloadLinks?.pdf || downloadLinks?.docx) {
      downloadHtml = "<h3>Your Documents</h3>";
      if (downloadLinks.pdf) {downloadHtml += `<p><a href="${downloadLinks.pdf}">Download PDF</a></p>`;}
      if (downloadLinks.docx) {downloadHtml += `<p><a href="${downloadLinks.docx}">Download DOCX</a></p>`;}
    }

    const subject = `Confirmation: ${workflowName}`;
    const html = `
      <div style="font-family: sans-serif;">
        <h2>Submission Received</h2>
        <p>You have successfully completed <strong>${workflowName}</strong>.</p>
        ${summaryHtml}
        ${downloadHtml}
        <hr/>
        <p><small>Reference ID: ${runId}</small></p>
      </div>
    `;

    const success = await sendEmail(to, subject, html);
    return { success };
  } catch (error) {
    logger.error({ error, data }, "Error sending intake receipt email");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email"
    };
  }
}

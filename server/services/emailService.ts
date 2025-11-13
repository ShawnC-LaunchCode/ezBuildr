// Email service for sending notifications
// Note: In a production environment, you would use a service like SendGrid, Mailgun, or AWS SES
// For this implementation, we'll create a stub that logs the email details

import { logger } from "../logger";

export async function sendNotificationEmail(
  recipientEmail: string,
  surveyTitle: string,
  respondentName: string,
  responseViewUrl: string
): Promise<void> {
  try {
    // Log email details (in production, replace with actual email service)
    logger.info(`
=== EMAIL NOTIFICATION ===
To: ${recipientEmail}
Subject: New Survey Response Received - ${surveyTitle}

Hello,

You have received a new response for your survey "${surveyTitle}" from ${respondentName}.

View the response: ${responseViewUrl}

Best regards,
Vault-Logic Team
==========================
    `);
    
    // In production, implement actual email sending:
    /*
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransporter({
      service: 'gmail', // or your email service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: recipientEmail,
      subject: `New Survey Response Received - ${surveyTitle}`,
      html: `
        <h2>New Survey Response</h2>
        <p>You have received a new response for your survey "<strong>${surveyTitle}</strong>" from <strong>${respondentName}</strong>.</p>
        <p><a href="${responseViewUrl}">View the response</a></p>
        <br>
        <p>Best regards,<br>Vault-Logic Team</p>
      `
    });
    */

  } catch (error) {
    logger.error({ error }, "Error sending notification email");
    // Don't throw error to avoid breaking the survey submission flow
  }
}

export async function sendSurveyInvitation(
  recipientEmail: string,
  recipientName: string,
  surveyTitle: string,
  surveyUrl: string
): Promise<void> {
  try {
    logger.info(`
=== SURVEY INVITATION ===
To: ${recipientEmail}
Subject: You're invited to participate in: ${surveyTitle}

Hello ${recipientName},

You have been invited to participate in a survey: "${surveyTitle}".

Click here to start the survey: ${surveyUrl}

Thank you for your time!

Best regards,
Vault-Logic Team
=========================
    `);

    // In production, implement actual email sending similar to above

  } catch (error) {
    logger.error({ error }, "Error sending survey invitation");
  }
}

/**
 * Send intake receipt email (Stage 12.5)
 * Sends confirmation email after successful intake submission
 */
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

    // Format summary for email (limit to non-sensitive fields)
    let summaryText = "";
    if (summary && Object.keys(summary).length > 0) {
      summaryText = "\n\nYour submission:\n";
      for (const [key, value] of Object.entries(summary)) {
        // Skip sensitive-looking fields
        if (key.toLowerCase().includes("password") ||
            key.toLowerCase().includes("ssn") ||
            key.toLowerCase().includes("credit")) {
          continue;
        }
        summaryText += `  - ${key}: ${String(value).substring(0, 100)}\n`;
      }
    }

    // Format download links
    let downloadText = "";
    if (downloadLinks && (downloadLinks.pdf || downloadLinks.docx)) {
      downloadText = "\n\nYour documents are ready:\n";
      if (downloadLinks.pdf) {
        downloadText += `  - Download PDF: ${downloadLinks.pdf}\n`;
      }
      if (downloadLinks.docx) {
        downloadText += `  - Download DOCX: ${downloadLinks.docx}\n`;
      }
    }

    logger.info(`
=== INTAKE RECEIPT ===
To: ${to}
Subject: Confirmation - ${workflowName}

Thank you for completing "${workflowName}".
${summaryText}${downloadText}

Reference ID: ${runId}

If you have any questions, please contact us with your reference ID.

Best regards,
VaultLogic Team
=====================
    `);

    // In production, implement actual email sending:
    /*
    const sendgrid = require('@sendgrid/mail');
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

    await sendgrid.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@vaultlogic.com',
      subject: `Confirmation - ${workflowName}`,
      html: `
        <h2>Thank you for your submission</h2>
        <p>You have successfully completed "<strong>${workflowName}</strong>".</p>
        ${summaryHtml}
        ${downloadLinksHtml}
        <p><small>Reference ID: ${runId}</small></p>
        <br>
        <p>Best regards,<br>VaultLogic Team</p>
      `
    });
    */

    return { success: true };
  } catch (error) {
    logger.error({ error, data }, "Error sending intake receipt email");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email"
    };
  }
}

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
    logger.error("Error sending notification email:", error);
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
    logger.error("Error sending survey invitation:", error);
  }
}

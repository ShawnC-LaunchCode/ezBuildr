// SendGrid email service - Referenced from javascript_sendgrid integration
import { MailService } from '@sendgrid/mail';

const mailService = new MailService();

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      const errorMsg = 'SENDGRID_API_KEY environment variable is not set';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    mailService.setApiKey(process.env.SENDGRID_API_KEY);

    const mailData: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };

    if (params.text) {
      mailData.text = params.text;
    }

    if (params.html) {
      mailData.html = params.html;
    }

    await mailService.send(mailData);
    
    console.log(`Email sent successfully to ${params.to}`);
    return { success: true };
  } catch (error: any) {
    console.error('SendGrid email error:', error);
    
    // Extract meaningful error message from SendGrid response
    let errorMessage = 'Failed to send email';
    if (error.response?.body?.errors) {
      errorMessage = error.response.body.errors.map((e: any) => e.message).join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    if (error.code === 403) {
      errorMessage = 'SendGrid authentication failed. Please check API key permissions and sender verification.';
    }
    
    return { success: false, error: errorMessage };
  }
}

export interface SurveyInvitationParams {
  recipientName: string;
  recipientEmail: string;
  surveyTitle: string;
  surveyUrl: string;
  creatorName?: string;
}

export async function sendSurveyInvitation(params: SurveyInvitationParams, fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  const { recipientName, recipientEmail, surveyTitle, surveyUrl, creatorName } = params;
  
  const subject = `You're invited to participate in: ${surveyTitle}`;
  
  const textContent = `
Hello ${recipientName},

You've been invited to participate in a survey titled "${surveyTitle}"${creatorName ? ` by ${creatorName}` : ''}.

Please click the link below to take the survey:
${surveyUrl}

This is a personalized link for you. Please do not share it with others.

Thank you for your participation!

---
Sent from Vault-Logic
  `.trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Survey Invitation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0 0 20px 0; font-size: 24px;">Survey Invitation</h1>
            <p style="font-size: 18px; margin: 0;">Hello <strong>${recipientName}</strong>,</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0 0 20px 0;">You've been invited to participate in a survey titled:</p>
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">"${surveyTitle}"</h2>
            ${creatorName ? `<p style="margin: 0 0 20px 0; color: #6b7280;">Created by <strong>${creatorName}</strong></p>` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${surveyUrl}" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Take Survey
                </a>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                    <strong>Important:</strong> This is a personalized link for you. Please do not share it with others.
                </p>
            </div>
            
            <p style="margin: 20px 0 0 0; color: #6b7280;">Thank you for your participation!</p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px;">
            <p style="margin: 0;">Sent from <strong>Vault-Logic</strong></p>
            <p style="margin: 5px 0 0 0;">Professional survey and polling platform</p>
        </div>
    </body>
    </html>
  `;

  // Use provided fromEmail or fallback to environment variable or default
  const senderEmail = fromEmail || process.env.SENDGRID_FROM_EMAIL;

  if (!senderEmail) {
    return { success: false, error: 'Sender email not configured. Please set SENDGRID_FROM_EMAIL environment variable.' };
  }

  return await sendEmail({
    to: recipientEmail,
    from: senderEmail,
    subject,
    text: textContent,
    html: htmlContent,
  });
}

export interface SurveyReminderParams {
  recipientName: string;
  recipientEmail: string;
  surveyTitle: string;
  surveyUrl: string;
  creatorName?: string;
}

export async function sendSurveyReminder(params: SurveyReminderParams, fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  const { recipientName, recipientEmail, surveyTitle, surveyUrl, creatorName } = params;

  const subject = `Reminder: Please complete "${surveyTitle}"`;

  const textContent = `
Hello ${recipientName},

This is a friendly reminder to complete the survey "${surveyTitle}"${creatorName ? ` by ${creatorName}` : ''}.

We noticed you haven't completed the survey yet. Your feedback is valuable to us!

Please click the link below to take the survey:
${surveyUrl}

This is a personalized link for you. Please do not share it with others.

Thank you for your time!

---
Sent from Vault-Logic
  `.trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Survey Reminder</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fef3c7; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #f59e0b;">
            <h1 style="color: #92400e; margin: 0 0 20px 0; font-size: 24px;">⏰ Friendly Reminder</h1>
            <p style="font-size: 18px; margin: 0;">Hello <strong>${recipientName}</strong>,</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0 0 20px 0;">We noticed you haven't completed the survey yet. Your feedback is valuable to us!</p>
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">"${surveyTitle}"</h2>
            ${creatorName ? `<p style="margin: 0 0 20px 0; color: #6b7280;">Created by <strong>${creatorName}</strong></p>` : ''}

            <div style="text-align: center; margin: 30px 0;">
                <a href="${surveyUrl}"
                   style="display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Complete Survey Now
                </a>
            </div>

            <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                    <strong>Note:</strong> This is a personalized link for you. Please do not share it with others.
                </p>
            </div>

            <p style="margin: 20px 0 0 0; color: #6b7280;">Thank you for your time!</p>
        </div>

        <div style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px;">
            <p style="margin: 0;">Sent from <strong>Vault-Logic</strong></p>
            <p style="margin: 5px 0 0 0;">Professional survey and polling platform</p>
        </div>
    </body>
    </html>
  `;

  // Use provided fromEmail or fallback to environment variable or default
  const senderEmail = fromEmail || process.env.SENDGRID_FROM_EMAIL;

  if (!senderEmail) {
    return { success: false, error: 'Sender email not configured. Please set SENDGRID_FROM_EMAIL environment variable.' };
  }

  return await sendEmail({
    to: recipientEmail,
    from: senderEmail,
    subject,
    text: textContent,
    html: htmlContent,
  });
}
export interface TemplateInvitationParams {
  recipientEmail: string;
  templateName: string;
  access: "use" | "edit";
}

export async function sendTemplateInvitation(params: TemplateInvitationParams, fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  const { recipientEmail, templateName, access } = params;

  const subject = `You've been invited to ${access === "edit" ? "collaborate on" : "use"} a Vault-Logic template`;

  const accessDescription = access === "edit"
    ? "edit and use this template in your surveys"
    : "use this template in your surveys";

  const textContent = `
Hello,

You've been invited to ${accessDescription}.

Template: "${templateName}"
Access level: ${access === "edit" ? "Edit (can modify template)" : "Use (can insert into surveys)"}

Sign in to Vault-Logic to get started:
${process.env.PUBLIC_APP_URL || 'https://vault-logic.com'}

If you don't have an account yet, sign in with Google using this email address to accept the invitation.

---
Sent from Vault-Logic
  `.trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Template Invitation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0 0 10px 0; font-size: 24px;">🎯 Template Invitation</h1>
            <p style="font-size: 16px; margin: 0; color: rgba(255,255,255,0.9);">You've been granted access to a survey template</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0 0 20px 0;">You've been invited to ${accessDescription}:</p>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea;">
                <h2 style="color: #1f2937; margin: 0 0 10px 0; font-size: 20px;">"${templateName}"</h2>
                <p style="margin: 0; color: #6b7280; font-size: 14px;">
                    <strong>Access level:</strong>
                    <span style="display: inline-block; background: ${access === "edit" ? "#10b981" : "#3b82f6"}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                        ${access}
                    </span>
                </p>
            </div>

            ${access === "edit" ? `
            <div style="background: #d1fae5; border: 1px solid #10b981; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                    <strong>✏️ Edit Access:</strong> You can modify the template content, update details, and use it in your surveys.
                </p>
            </div>
            ` : `
            <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                    <strong>👁️ Use Access:</strong> You can insert this template into your surveys, but cannot modify the template itself.
                </p>
            </div>
            `}

            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.PUBLIC_APP_URL || 'https://vault-logic.com'}"
                   style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Sign In to Get Started
                </a>
            </div>

            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                    <strong>New to Vault-Logic?</strong> Sign in with Google using this email address to automatically accept the invitation.
                </p>
            </div>
        </div>

        <div style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px;">
            <p style="margin: 0;">Sent from <strong>Vault-Logic</strong></p>
            <p style="margin: 5px 0 0 0;">Professional survey and polling platform</p>
        </div>
    </body>
    </html>
  `;

  const senderEmail = fromEmail || process.env.SENDGRID_FROM_EMAIL;

  if (!senderEmail) {
    return { success: false, error: 'Sender email not configured. Please set SENDGRID_FROM_EMAIL environment variable.' };
  }

  return await sendEmail({
    to: recipientEmail,
    from: senderEmail,
    subject,
    text: textContent,
    html: htmlContent,
  });
}

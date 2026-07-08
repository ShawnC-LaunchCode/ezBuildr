/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
// SendGrid email service - Referenced from javascript_sendgrid integration
import { MailService } from '@sendgrid/mail';

import { logger } from '../logger';

const mailService = new MailService();

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

interface SendGridError extends Error {
  response?: { body?: { errors?: Array<{ message?: string }> } };
  code?: number;
}

function isSendGridError(error: unknown): error is SendGridError {
  return error instanceof Error;
}

export async function sendEmail(params: EmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      const errorMsg = 'SENDGRID_API_KEY environment variable is not set';
      logger.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    mailService.setApiKey(process.env.SENDGRID_API_KEY);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    
    logger.info(`Email sent successfully to ${params.to}`);
    return { success: true };
  } catch (error: unknown) {
    // @ts-ignore - TODO: fix type
    logger.error('SendGrid email error:', error);
    
    // Extract meaningful error message from SendGrid response
    let errorMessage = 'Failed to send email';
    if (isSendGridError(error)) {
      if (error.response?.body?.errors) {
        errorMessage = error.response.body.errors.map((e) => e.message).join(', ');
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (error.code === 403) {
        errorMessage = 'SendGrid authentication failed. Please check API key permissions and sender verification.';
      }
    }
    
    return { success: false, error: errorMessage };
  }
}



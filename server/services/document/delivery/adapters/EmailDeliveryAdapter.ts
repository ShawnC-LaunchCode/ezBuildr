import type { EmailDeliveryConfig } from '@shared/types/delivery';

import { createLogger } from '../../../../logger';
import { emailQueueService } from '../../../EmailQueueService';
import { storageProvider } from '../../../storage';

import type { DeliveryAdapter, DeliveryAdapterContext, DeliveryAdapterResult } from './IDeliveryAdapter';

const logger = createLogger({ module: 'email-delivery-adapter' });

/**
 * Escapes HTML characters to prevent XSS/injection in email content
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Interpolates {{variable}} placeholders with values from stepValues
 */
function interpolateVariables(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => {
    const val = values[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/**
 * Resolves a recipient email string which might be a template variable or static email
 */
function resolveRecipientEmail(toField: string, values: Record<string, unknown>): string {
  const trimmed = toField.trim();
  // Check {{var_name}} pattern
  const interpolated = interpolateVariables(trimmed, values).trim();
  if (interpolated?.includes('@')) {
    return interpolated;
  }
  // Check direct variable lookup without brackets
  if (typeof values[trimmed] === 'string') {
    return String(values[trimmed]).trim();
  }
  return trimmed;
}

export class EmailDeliveryAdapter implements DeliveryAdapter {
  async deliver(context: DeliveryAdapterContext): Promise<DeliveryAdapterResult> {
    const startTime = Date.now();
    const config = context.delivery.destinationConfig as EmailDeliveryConfig;

    if (!config?.to) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: 'Missing recipient email in configuration',
      };
    }

    const recipient = resolveRecipientEmail(config.to, context.stepValues);
    if (!recipient?.includes('@')) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: `Invalid recipient email address: "${recipient}"`,
      };
    }

    const rawSubject = config.subject ?? 'Your generated documents are ready';
    const subject = interpolateVariables(rawSubject, context.stepValues);

    const rawBody = config.body ?? 'Please find your generated document(s) below:';
    const bodyText = interpolateVariables(rawBody, context.stepValues);

    const documentLinksHtml = context.documents
      .map((doc) => {
        const name = escapeHtml(doc.fileName);
        const url = escapeHtml(doc.fileUrl);
        return `<li><a href="${url}" style="color: #4F46E5; text-decoration: underline; font-weight: 500;">${name}</a></li>`;
      })
      .join('\n');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #111827; margin-bottom: 16px;">${escapeHtml(subject)}</h2>
        <div style="margin-bottom: 20px; line-height: 1.6;">${escapeHtml(bodyText).replace(/\n/g, '<br/>')}</div>
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 14px; text-transform: uppercase; color: #6b7280; margin-top: 0; margin-bottom: 12px; letter-spacing: 0.05em;">Generated Documents (${context.documents.length})</h3>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
            ${documentLinksHtml}
          </ul>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">Sent automatically by ezBuildr.</p>
      </div>
    `;

    try {
      const attachments = config.attachDocuments === false
        ? []
        : await Promise.all(context.documents.map(async (doc) => ({
          content: (await storageProvider.getFile(doc.storageKey)).toString('base64'),
          filename: doc.fileName,
          type: doc.mimeType ?? 'application/octet-stream',
          disposition: 'attachment',
        })));
      await emailQueueService.sendNow(recipient, subject, html, attachments);
      const durationMs = Date.now() - startTime;

      logger.info(
        { deliveryId: context.delivery.id, recipient, attachmentCount: attachments.length, durationMs },
        'Email delivery accepted by SendGrid'
      );

      return {
        success: true,
        durationMs,
        metadata: {
          provider: 'sendgrid',
          recipient,
          subject,
          documentCount: context.documents.length,
          attachmentCount: attachments.length,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { deliveryId: context.delivery.id, recipient, error: errorMsg },
        'Failed to send email delivery'
      );
      return {
        success: false,
        durationMs,
        error: errorMsg,
        metadata: {
          recipient,
          subject,
        },
      };
    }
  }
}

export const emailDeliveryAdapter = new EmailDeliveryAdapter();

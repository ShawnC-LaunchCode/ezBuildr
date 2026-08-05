import crypto from 'crypto';

import type { WebhookDeliveryConfig } from '@shared/types/delivery';

import { createLogger } from '../../../../logger';
import {
  decryptProtectedHeaders,
  decryptProtectedValue,
} from '../../../../utils/documentDeliverySecrets';
import { safeFetch } from '../../../../utils/safeFetch';
import { storageProvider } from '../../../storage';

import type { DeliveryAdapter, DeliveryAdapterContext, DeliveryAdapterResult } from './IDeliveryAdapter';

const logger = createLogger({ module: 'webhook-delivery-adapter' });

export class WebhookDeliveryAdapter implements DeliveryAdapter {
  async deliver(context: DeliveryAdapterContext): Promise<DeliveryAdapterResult> {
    const startTime = Date.now();
    const config = context.delivery.destinationConfig as WebhookDeliveryConfig;

    if (!config?.url) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: 'Missing webhook target URL in configuration',
      };
    }

    try {
      const documentsPayload = await Promise.all(
        context.documents.map(async (doc) => {
          const docData: Record<string, unknown> = {
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            fileSize: doc.fileSize,
          };

          if (config.includeDocumentUrls !== false) {
            docData.url = doc.fileUrl;
          }

          if (config.includeDocumentBase64 === true) {
            try {
              const buffer = await storageProvider.getFile(doc.storageKey);
              docData.base64 = buffer.toString('base64');
            } catch (err) {
              logger.warn(
                { storageKey: doc.storageKey, error: err },
                'Failed to load document buffer for base64 encoding'
              );
            }
          }

          return docData;
        })
      );

      const payload = {
        event: 'document.delivered',
        deliveryId: context.delivery.id,
        runId: context.workflowRun.id,
        workflowId: context.workflowRun.workflowId,
        tenantId: context.delivery.tenantId,
        timestamp: new Date().toISOString(),
        documents: documentsPayload,
        stepValues: context.stepValues,
      };

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'EZBuildr-DocumentDelivery/1.0',
        ...(decryptProtectedHeaders(config.headers) ?? {}),
      };

      if (config.secret) {
        const secret = decryptProtectedValue(config.secret, 'webhook signing secret');
        const signature = crypto
          .createHmac('sha256', secret)
          .update(body)
          .digest('hex');
        headers['X-EZBuildr-Signature'] = `sha256=${signature}`;
      }

      const requireHttps = process.env.NODE_ENV === 'production';
      const response = await safeFetch(
        config.url,
        {
          method: 'POST',
          headers,
          body,
        },
        requireHttps
      );

      const durationMs = Date.now() - startTime;
      let responseText = '';
      try {
        responseText = (await response.text()).slice(0, 1000);
      } catch {
        // Ignore response reading error
      }

      if (response.ok) {
        logger.info(
          {
            deliveryId: context.delivery.id,
            url: config.url,
            status: response.status,
            durationMs,
          },
          'Webhook delivered successfully'
        );
        return {
          success: true,
          responseCode: response.status,
          durationMs,
          metadata: {
            statusCode: response.status,
            responseSnippet: responseText,
          },
        };
      } else {
        const fallbackStatus = response.statusText !== '' ? response.statusText : 'Error';
        const responseDetail = responseText !== '' ? responseText : fallbackStatus;
        const errorMsg = `Webhook returned HTTP ${response.status}: ${responseDetail}`;
        logger.warn(
          {
            deliveryId: context.delivery.id,
            url: config.url,
            status: response.status,
            durationMs,
            error: errorMsg,
          },
          'Webhook delivery failed with HTTP error'
        );
        return {
          success: false,
          responseCode: response.status,
          durationMs,
          error: errorMsg,
          metadata: {
            statusCode: response.status,
            responseSnippet: responseText,
          },
        };
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          deliveryId: context.delivery.id,
          url: config.url,
          durationMs,
          error: errorMsg,
        },
        'Webhook delivery network or processing error'
      );
      return {
        success: false,
        durationMs,
        error: errorMsg,
      };
    }
  }
}

export const webhookDeliveryAdapter = new WebhookDeliveryAdapter();

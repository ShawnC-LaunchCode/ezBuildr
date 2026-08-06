import https from 'node:https';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { CloudStorageDeliveryConfig } from '@shared/types/delivery';

import { createLogger } from '../../../../logger';
import { decryptProtectedValue } from '../../../../utils/documentDeliverySecrets';
import { resolveSafeUrl } from '../../../../utils/ssrfValidator';
import { storageProvider } from '../../../storage';

import type { DeliveryAdapter, DeliveryAdapterContext, DeliveryAdapterResult } from './IDeliveryAdapter';

const logger = createLogger({ module: 'cloud-storage-delivery-adapter' });

function sanitizePrefix(prefix: string): string {
  return prefix
    .split(/[/\\]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[^a-zA-Z0-9_\-.]/g, '_'))
    .join('/');
}

function sanitizeFileName(fileName: string): string {
  const baseName = fileName.split(/[/\\]+/).pop() ?? fileName;
  return baseName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

function buildTargetKey(pathPrefix: string | undefined, fileName: string): string {
  const cleanPrefix = pathPrefix ? sanitizePrefix(pathPrefix) : '';
  const cleanFileName = sanitizeFileName(fileName);
  return cleanPrefix ? `${cleanPrefix}/${cleanFileName}` : cleanFileName;
}

function resolveS3Credentials(config: CloudStorageDeliveryConfig): { accessKeyId: string; secretAccessKey: string } | undefined {
  if (config.accessKeyId !== undefined || config.secretAccessKey !== undefined) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('Both accessKeyId and secretAccessKey are required for custom cloud credentials');
    }
    return {
      accessKeyId: decryptProtectedValue(config.accessKeyId, 'cloud access key ID'),
      secretAccessKey: decryptProtectedValue(config.secretAccessKey, 'cloud secret access key'),
    };
  }

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return undefined;
}

async function createS3Client(config: CloudStorageDeliveryConfig): Promise<{ client: S3Client; region: string }> {
  let requestHandler: NodeHttpHandler | undefined;
  if (config.endpoint) {
    const resolution = await resolveSafeUrl(config.endpoint, ['https:']);
    if (!resolution) {
      throw new Error(`SSRF Prevention: Cloud storage endpoint is unsafe or resolves to an internal address (${config.endpoint})`);
    }
    const httpsAgent = new https.Agent({
      lookup: (_hostname, _options, callback) => {
        callback(null, resolution.address, resolution.family);
      },
    });
    requestHandler = new NodeHttpHandler({
      connectionTimeout: 10_000,
      requestTimeout: 60_000,
      throwOnRequestTimeout: true,
      httpsAgent,
    });
  }

  const region = config.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const credentials = resolveS3Credentials(config);

  const client = new S3Client({
    region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.endpoint !== undefined && config.endpoint !== '',
    credentials,
    requestHandler,
  });

  return { client, region };
}

export class CloudStorageDeliveryAdapter implements DeliveryAdapter {
  async deliver(context: DeliveryAdapterContext): Promise<DeliveryAdapterResult> {
    const startTime = Date.now();
    const config = context.delivery.destinationConfig as CloudStorageDeliveryConfig;

    if (!config?.bucket) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: 'Missing destination S3/Cloud Storage bucket in configuration',
      };
    }

    let s3Client: S3Client | undefined;
    try {
      const clientResult = await createS3Client(config);
      s3Client = clientResult.client;
      const { region } = clientResult;
      const uploadedFiles: Array<{ fileName: string; targetKey: string; sizeBytes: number }> = [];

      for (const doc of context.documents) {
        const fileBuffer = await storageProvider.getFile(doc.storageKey);
        const targetKey = buildTargetKey(config.pathPrefix, doc.fileName);

        await s3Client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: targetKey,
            Body: fileBuffer,
            ContentType: doc.mimeType ?? 'application/octet-stream',
          })
        );

        uploadedFiles.push({
          fileName: doc.fileName,
          targetKey,
          sizeBytes: fileBuffer.length,
        });
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          deliveryId: context.delivery.id,
          bucket: config.bucket,
          uploadedCount: uploadedFiles.length,
          durationMs,
        },
        'Cloud storage delivery succeeded'
      );

      return {
        success: true,
        durationMs,
        metadata: {
          bucket: config.bucket,
          region,
          uploadedCount: uploadedFiles.length,
          uploadedFiles,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          deliveryId: context.delivery.id,
          bucket: config.bucket,
          error: errorMsg,
          durationMs,
        },
        'Cloud storage delivery failed'
      );
      return {
        success: false,
        durationMs,
        error: errorMsg,
      };
    } finally {
      s3Client?.destroy();
    }
  }
}

export const cloudStorageDeliveryAdapter = new CloudStorageDeliveryAdapter();

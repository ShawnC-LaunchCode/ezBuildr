import { S3 , GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import type {
  IStorageProvider,
  StorageMetadata,
  UploadOptions,
  SignedUrlOptions,
} from './IStorageProvider';

/**
 * AWS S3 Storage Provider
 * Stores files in Amazon S3 (or S3-compatible storage like MinIO, DigitalOcean Spaces)
 *
 * SETUP REQUIRED:
 * 1. Install dependencies: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 * 2. Set environment variables:
 *    - AWS_S3_BUCKET=your-bucket-name
 *    - AWS_REGION=us-east-1 (or your region)
 *    - AWS_ACCESS_KEY_ID=your-access-key
 *    - AWS_SECRET_ACCESS_KEY=your-secret-key
 *    - AWS_S3_ENDPOINT=https://s3.amazonaws.com (optional, for S3-compatible services)
 * 3. Set FILE_STORAGE_PROVIDER=s3 in your .env
 */
export class S3StorageProvider implements IStorageProvider {
  private s3: S3;
  private bucket: string;
  private region: string;
  private baseUrl: string | null;

  constructor(options?: {
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
  }) {
    // Get configuration from options or environment variables
    this.bucket = options?.bucket || process.env.AWS_S3_BUCKET || '';
    this.region = options?.region || process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = options?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = options?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const endpoint = options?.endpoint || process.env.AWS_S3_ENDPOINT;

    if (!this.bucket) {
      throw new Error('S3 bucket name is required (set AWS_S3_BUCKET environment variable)');
    }

    // Initialize S3 client
    this.s3 = new S3({
      region: this.region,
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // Required for MinIO and some S3-compatible services
    });

    // For public URLs (if bucket is configured for public access)
    this.baseUrl = endpoint
      ? `${endpoint}/${this.bucket}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com`;

    logger.info({ bucket: this.bucket, region: this.region }, 'S3StorageProvider initialized');
  }

  async upload(buffer: Buffer, key: string, options?: UploadOptions): Promise<string> {
    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
        ACL: options?.acl,
        ServerSideEncryption: 'AES256', // Enable server-side encryption
      }));

      logger.info({ key, bucket: this.bucket, size: buffer.length }, 'File uploaded to S3');

      return key;
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to S3');
      throw createError.internal('Failed to upload file to S3');
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const response = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      logger.debug({ key, size: buffer.length }, 'File downloaded from S3');

      return buffer;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw createError.notFound('File not found in S3');
      }
      logger.error({ error, key }, 'Failed to download file from S3');
      throw createError.internal('Failed to download file from S3');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      logger.info({ key }, 'File deleted from S3');
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete file from S3');
      throw createError.internal('Failed to delete file from S3');
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata> {
    try {
      const response = await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        contentType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || 0,
        etag: response.ETag,
        lastModified: response.LastModified,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw createError.notFound('File not found in S3');
      }
      logger.error({ error, key }, 'Failed to get metadata from S3');
      throw createError.internal('Failed to get file metadata');
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: options.contentDisposition,
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: options.expiresIn,
      });

      logger.debug({ key, expiresIn: options.expiresIn }, 'Generated signed URL for S3 file');

      return url;
    } catch (error) {
      logger.error({ error, key }, 'Failed to generate signed URL for S3 file');
      throw createError.internal('Failed to generate signed URL');
    }
  }

  getPublicUrl(key: string): string | null {
    // Only return public URL if bucket is configured for public access
    // In production, you might want to check bucket policy or ACL
    return `${this.baseUrl}/${key}`;
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    try {
      await this.s3.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }));

      logger.info({ sourceKey, destKey }, 'File copied in S3');
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw createError.notFound('Source file not found in S3');
      }
      logger.error({ error, sourceKey, destKey }, 'Failed to copy file in S3');
      throw createError.internal('Failed to copy file in S3');
    }
  }

  async list(prefix: string, maxKeys: number = 1000): Promise<string[]> {
    try {
      const response = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }));

      const keys = (response.Contents || [])
        .map(obj => obj.Key)
        .filter((key): key is string => !!key);

      logger.debug({ prefix, count: keys.length }, 'Listed files in S3');

      return keys;
    } catch (error) {
      logger.error({ error, prefix }, 'Failed to list files in S3');
      throw createError.internal('Failed to list files in S3');
    }
  }
}

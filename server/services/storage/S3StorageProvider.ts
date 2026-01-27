import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Stream } from 'stream';

import { S3, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import { StorageProvider } from './types';

/**
 * AWS S3 Storage Provider
 * Stores files in Amazon S3 (or S3-compatible storage like MinIO)
 */
export class S3StorageProvider implements StorageProvider {
  private s3: S3;
  private bucket: string;
  private region: string;
  private endpoint?: string;

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
    this.endpoint = options?.endpoint || process.env.AWS_S3_ENDPOINT;

    // We don't throw here if bucket is missing, as we might not be using S3 provider
    // Validation happens in init()

    // Initialize S3 client
    this.s3 = new S3({
      region: this.region,
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
      endpoint: this.endpoint || undefined,
      forcePathStyle: !!this.endpoint, // Required for MinIO and some S3-compatible services
    });
  }

  async init(): Promise<void> {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required (set AWS_S3_BUCKET environment variable)');
    }
    logger.info({ bucket: this.bucket, region: this.region }, 'S3StorageProvider initialized');
  }

  async saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const ext = path.extname(originalName);
    const fileRef = `${nanoid(16)}${ext}`;
    return this.uploadFile(fileRef, buffer, mimeType);
  }

  async uploadFile(key: string, buffer: Buffer, mimeType: string, metadata?: Record<string, any>): Promise<string> {
    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: metadata as Record<string, string>, // S3 metadata is string-only
        ServerSideEncryption: 'AES256',
      }));

      logger.info({ key, bucket: this.bucket, size: buffer.length }, 'File uploaded to S3');
      return key;
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to S3');
      throw createError.internal('Failed to save file');
    }
  }

  async deleteFile(fileRef: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      }));
      logger.info({ fileRef }, 'File deleted from S3');
    } catch (error) {
      logger.error({ error, fileRef }, 'Failed to delete file from S3');
      // Don't throw for delete failure to allow cleanup flow to continue
    }
  }

  async exists(fileRef: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      return false;
    }
  }

  async getFile(fileRef: string): Promise<Buffer> {
    try {
      const response = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      }));

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      if (response.Body) {
        // @ts-ignore - AWS SDK types for Body are complex (Readable | ReadableStream | Blob)
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw createError.notFound('File not found in S3');
      }
      logger.error({ error, fileRef }, 'Failed to download file from S3');
      throw createError.internal('Failed to retrieve file');
    }
  }

  async getMetadata(fileRef: string): Promise<any> {
    try {
      const response = await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
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
      logger.error({ error, fileRef }, 'Failed to get metadata from S3');
      throw createError.internal('Failed to get file metadata');
    }
  }

  async getSignedUrl(fileRef: string, expiresIn: number = 300): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: expiresIn,
      });

      logger.debug({ fileRef, expiresIn }, 'Generated signed URL for S3 file');
      return url;
    } catch (error) {
      logger.error({ error, fileRef }, 'Failed to generate signed URL for S3 file');
      throw createError.internal('Failed to generate signed URL');
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const response = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
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

  async getLocalPath(fileRef: string): Promise<string> {
    // Check if file exists in temp dir first
    const tempDir = os.tmpdir();
    // Sanitize fileRef for filename
    const sanitizedRef = fileRef.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempFilePath = path.join(tempDir, `s3-cache-${sanitizedRef}`);

    try {
      // Check cache
      await fs.access(tempFilePath);
      return tempFilePath;
    } catch {
      // Not cached, download it
      logger.debug({ fileRef }, 'Downloading S3 file to local cache');
      const buffer = await this.getFile(fileRef);
      await fs.writeFile(tempFilePath, buffer);
      return tempFilePath;
    }
  }
}

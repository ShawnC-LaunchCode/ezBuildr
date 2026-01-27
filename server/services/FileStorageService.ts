import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';

import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,

} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { logger } from '../logger';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

export interface UploadResult {
    key: string;
    location: string;
    provider: 's3' | 'local';
    bucket?: string;
}

export class FileStorageService {
    private s3Client: S3Client | null = null;
    private bucketName: string | null = null;
    private localUploadDir: string;

    constructor() {
        this.localUploadDir = process.env.UPLOAD_DIR || './uploads';

        // Initialize S3 if credentials exist
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_BUCKET_NAME) {
            this.s3Client = new S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                }
            });
            this.bucketName = process.env.AWS_BUCKET_NAME;
            logger.info({ bucket: this.bucketName }, 'FileStorageService: S3 Initialized');
        } else {
            logger.warn('FileStorageService: No S3 credentials found. Using local disk storage.');
            // Ensure local directory exists
            this.ensureLocalDir().catch(err => {
                logger.fatal({ error: err }, 'FileStorageService: Failed to create upload directory');
            });
        }
    }

    private async ensureLocalDir() {
        try {
            await fs.promises.access(this.localUploadDir);
        } catch {
            await mkdirAsync(this.localUploadDir, { recursive: true });
        }
    }

    /**
     * Upload a file to storage (S3 or Local)
     */
    async upload(
        fileBuffer: Buffer,
        filename: string,
        mimeType: string,
        prefix: string = ''
    ): Promise<UploadResult> {
        const uniqueFilename = `${prefix}${randomUUID()}-${filename}`;

        if (this.s3Client && this.bucketName) {
            return this.uploadToS3(fileBuffer, uniqueFilename, mimeType);
        } else {
            return this.uploadToLocal(fileBuffer, uniqueFilename);
        }
    }

    /**
     * Delete a file from storage
     */
    async delete(key: string): Promise<void> {
        if (this.s3Client && this.bucketName) {
            // Check if it looks like an S3 key (simple check, or we assume key is correct for the provider active)
            // If we are in S3 mode, we assume keys are S3 keys.
            // In a mixed migration scenario, we might need 'provider' flag passed to delete.
            // For now, we rely on the caller or standardizing behavior.
            // The schema 'provider' column helps here. 
            // BUT, for now let's implement the 'provider' check in the Manager service, 
            // or pass it here.
            // Let's assume this method handles S3 if configured. 
            // Ideally call deleteWithProvider(key, provider).
            // Retaining simplified interface for now, will fix in 'FileService'.

            try {
                const command = new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: key
                });
                await this.s3Client.send(command);
            } catch (error) {
                logger.error({ error, key }, 'Failed to delete from S3');
                throw error;
            }
        } else {
            // Local delete
            // Key is likely the filename for local
            const filePath = path.join(this.localUploadDir, key);
            try {
                await unlinkAsync(filePath);
            } catch (error) {
                // Ignore if not found, else log
                const err = error as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') {
                    logger.error({ error, key }, 'Failed to delete local file');
                    throw error;
                }
            }
        }
    }

    /**
     * Explicit delete with provider awareness
     */
    async deleteWithProvider(key: string, provider: 's3' | 'local'): Promise<void> {
        if (provider === 's3') {
            if (!this.s3Client || !this.bucketName) {
                logger.warn({ key }, 'Request to delete S3 file but S3 not configured');
                return;
            }
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            await this.s3Client.send(command);
        } else {
            const filePath = path.join(this.localUploadDir, key);
            try {
                await unlinkAsync(filePath);
            } catch (error) {
                const err = error as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') {
                    logger.error({ error, key }, 'Failed to delete local file');
                    throw error;
                }
            }
        }
    }

    private async uploadToS3(buffer: Buffer, key: string, mimeType: string): Promise<UploadResult> {
        if (!this.s3Client || !this.bucketName) { throw new Error("S3 not initialized"); }

        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType
        });

        await this.s3Client.send(command);

        return {
            key,
            location: `https://${this.bucketName}.s3.amazonaws.com/${key}`,
            provider: 's3',
            bucket: this.bucketName
        };
    }

    private async uploadToLocal(buffer: Buffer, filename: string): Promise<UploadResult> {
        await this.ensureLocalDir();
        const filePath = path.join(this.localUploadDir, filename);
        await writeFileAsync(filePath, buffer);

        return {
            key: filename, // For local, key is the filename
            location: filePath,
            provider: 'local'
        };
    }

    // Helper to get Signed URL (for S3) or Local Path
    async getDownloadUrl(key: string, provider: 's3' | 'local', expiresIn = 3600): Promise<string> {
        if (provider === 's3' && this.s3Client && this.bucketName) {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            return getSignedUrl(this.s3Client, command, { expiresIn });
        } else {
            // Return server path - API route must handle serving this
            return `/api/files/download/${key}`;
        }
    }

    /**
     * Get a readable stream for the file
     */
    async getStream(key: string, provider: 's3' | 'local'): Promise<Readable> {
        if (provider === 's3' && this.s3Client && this.bucketName) {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            const response = await this.s3Client.send(command);
            if (!response.Body) {
                throw new Error(`S3 Object body is empty for key: ${key}`);
            }
            // S3 Body is a stream in Node environment
            return response.Body as Readable;
        } else {
            const filePath = path.join(this.localUploadDir, key);
            return fs.createReadStream(filePath);
        }
    }
}

export const fileStorageService = new FileStorageService();

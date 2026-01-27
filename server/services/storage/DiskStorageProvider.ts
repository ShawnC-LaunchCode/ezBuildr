
import fs from 'fs/promises';
import path from 'path';

import { nanoid } from 'nanoid';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import { StorageProvider } from './types';

export class DiskStorageProvider implements StorageProvider {
    private baseDir: string;

    constructor(baseDir?: string) {
        this.baseDir = baseDir || path.join(process.cwd(), 'server', 'files');
    }

    async init(): Promise<void> {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
        } catch (error) {
            logger.error({ error }, 'Failed to initialize disk storage');
            throw createError.internal('Failed to initialize file storage');
        }
    }

    async saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
        await this.init();

        const ext = path.extname(originalName);
        const fileName = `${nanoid(16)}${ext}`;
        return this.uploadFile(fileName, buffer, mimeType);
    }

    async uploadFile(key: string, buffer: Buffer, mimeType: string, metadata?: Record<string, any>): Promise<string> {
        await this.init();
        const filePath = path.join(this.baseDir, key);

        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        try {
            await fs.writeFile(filePath, buffer);
            // We could store metadata in a sidecar file if needed, but skipping for Disk provider for now
            return key;
        } catch (error) {
            logger.error({ error, key }, 'Failed to save file to disk');
            throw createError.internal('Failed to save file');
        }
    }

    async deleteFile(fileRef: string): Promise<void> {
        const filePath = path.join(this.baseDir, fileRef);
        try {
            await fs.unlink(filePath);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                logger.error({ error, fileRef }, 'Failed to delete file from disk');
            }
        }
    }

    async exists(fileRef: string): Promise<boolean> {
        const filePath = path.join(this.baseDir, fileRef);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async getFile(fileRef: string): Promise<Buffer> {
        const filePath = path.join(this.baseDir, fileRef);
        try {
            return await fs.readFile(filePath);
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                throw createError.notFound('File not found in storage');
            }
            throw error;
        }
    }

    async getLocalPath(fileRef: string): Promise<string> {
        const filePath = path.join(this.baseDir, fileRef);
        const exists = await this.exists(fileRef);
        if (!exists) {
            // For Disk provider, we check existance. If not found, throw.
            throw createError.notFound('File not found in storage');
        }
        return filePath;
    }

    async getMetadata(fileRef: string): Promise<any> {
        const filePath = path.join(this.baseDir, fileRef);
        try {
            const stats = await fs.stat(filePath);
            return {
                size: stats.size,
                lastModified: stats.mtime,
                contentType: 'application/octet-stream', // We don't store mime type on disk currently
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw createError.notFound('File not found');
            }
            throw error;
        }
    }

    async getSignedUrl(fileRef: string, expiresIn?: number): Promise<string> {
        // Return a local API URL relative to the server
        // Requires an endpoint to serve these files, e.g. /api/storage/files/:key
        return `/api/storage/files/${fileRef}`;
    }

    async list(prefix: string): Promise<string[]> {
        await this.init();
        const dir = path.join(this.baseDir, prefix);
        try {
            const files = await fs.readdir(dir);
            return files.map(f => path.join(prefix, f).replace(/\\/g, '/'));
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
}

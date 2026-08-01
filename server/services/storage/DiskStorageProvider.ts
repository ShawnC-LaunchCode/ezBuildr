
import fs from 'fs/promises';
import path from 'path';

import { nanoid } from 'nanoid';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import { StorageProvider } from './types';

function isErrorWithCode(err: unknown): err is Error & { code: string } {
    return err instanceof Error && 'code' in err;
}

export class DiskStorageProvider implements StorageProvider {
    private baseDir: string;

    constructor(baseDir?: string) {
        this.baseDir = path.resolve(baseDir ?? path.join(process.cwd(), 'server', 'files'));
    }

    /**
     * Resolve a caller-supplied ref to an absolute path inside `baseDir`, or
     * refuse. Every disk operation goes through here rather than calling
     * `path.join` directly, because a ref is not always trusted input: import
     * writes fileRefs straight out of an uploaded bundle (IEX-10), and a ref
     * like `../../.env` would otherwise resolve cleanly outside the store.
     *
     * The check is on the resolved path, not the raw string, so it also covers
     * encodings that only become traversal after normalisation, and absolute
     * refs — `path.join(base, 'C:\\secrets')` stays inside base but
     * `path.resolve` would escape, so resolve-then-contain is the safe order.
     */
    private resolveWithinBase(ref: string): string {
        const resolved = path.resolve(this.baseDir, ref);
        const relative = path.relative(this.baseDir, resolved);
        const escapes = relative.startsWith('..') || path.isAbsolute(relative);
        if (relative !== '' && escapes) {
            logger.warn({ ref }, 'Rejected storage path outside the storage root');
            throw createError.validation('Invalid file path');
        }
        return resolved;
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

    async uploadFile(key: string, buffer: Buffer, _mimeType: string, _metadata?: Record<string, unknown>): Promise<string> {
        await this.init();
        const filePath = this.resolveWithinBase(key);

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
        const filePath = this.resolveWithinBase(fileRef);
        try {
            await fs.unlink(filePath);
        } catch (error: unknown) {
            if (!isErrorWithCode(error) || error.code !== 'ENOENT') {
                logger.error({ error, fileRef }, 'Failed to delete file from disk');
            }
        }
    }

    async exists(fileRef: string): Promise<boolean> {
        const filePath = this.resolveWithinBase(fileRef);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async getFile(fileRef: string): Promise<Buffer> {
        const filePath = this.resolveWithinBase(fileRef);
        try {
            return await fs.readFile(filePath);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            if ((error as any).code === 'ENOENT') {
                throw createError.notFound('File not found in storage');
            }
            throw error;
        }
    }

    async getLocalPath(fileRef: string): Promise<string> {
        const filePath = this.resolveWithinBase(fileRef);
        const exists = await this.exists(fileRef);
        if (!exists) {
            // For Disk provider, we check existance. If not found, throw.
            throw createError.notFound('File not found in storage');
        }
        return filePath;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getMetadata(fileRef: string): Promise<any> {
        const filePath = this.resolveWithinBase(fileRef);
        try {
            const stats = await fs.stat(filePath);
            return {
                size: stats.size,
                lastModified: stats.mtime,
                contentType: 'application/octet-stream', // We don't store mime type on disk currently
            };
        } catch (error: unknown) {
            if (isErrorWithCode(error) && error.code === 'ENOENT') {
                throw createError.notFound('File not found');
            }
            throw error;
        }
    }

    async getSignedUrl(fileRef: string, _expiresIn?: number): Promise<string> {
        // Return a local API URL relative to the server
        // Requires an endpoint to serve these files, e.g. /api/storage/files/:key
        return `/api/storage/files/${fileRef}`;
    }

    async list(prefix: string): Promise<string[]> {
        await this.init();
        const dir = this.resolveWithinBase(prefix);
        try {
            const files = await fs.readdir(dir);
            return files.map(f => path.join(prefix, f).replace(/\\/g, '/'));
        } catch (error: unknown) {
            if (isErrorWithCode(error) && error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
}


import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { nanoid } from 'nanoid';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import { signStorageKey } from './signedUrl';
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

    async uploadStream(
        key: string,
        stream: Readable,
        _contentLength: number,
        _mimeType: string,
        _metadata?: Record<string, unknown>
    ): Promise<string> {
        await this.init();
        const filePath = this.resolveWithinBase(key);
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        try {
            await pipeline(stream, createWriteStream(filePath));
            return key;
        } catch (error) {
            await fs.unlink(filePath).catch(() => undefined);
            logger.error({ error, key }, 'Failed to stream file to disk');
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

    /**
     * Return a signed URL served by GET /api/storage/files/* (see
     * server/routes/storage.routes.ts). The signature (not a session) is the
     * credential, so this deliberately does not check `exists()` first —
     * that check would itself need auth to avoid leaking which keys exist.
     */
    async getSignedUrl(fileRef: string, expiresIn: number = 300): Promise<string> {
        const { exp, sig } = signStorageKey(fileRef, expiresIn);
        return `/api/storage/files/${fileRef}?exp=${exp}&sig=${sig}`;
    }

    async getTotalSize(prefix: string): Promise<number> {
        await this.init();
        return this.sumDirectory(this.resolveWithinBase(prefix));
    }

    /** Recursive byte total, taken from the dirents `readdir` already returns. */
    private async sumDirectory(dir: string): Promise<number> {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (error: unknown) {
            if (isErrorWithCode(error) && error.code === 'ENOENT') {
                return 0;
            }
            throw error;
        }
        const sizes = await Promise.all(entries.map(async entry => {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                return this.sumDirectory(entryPath);
            }
            const stats = await fs.stat(entryPath).catch(() => null);
            return stats?.size ?? 0;
        }));
        return sizes.reduce((total, size) => total + size, 0);
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

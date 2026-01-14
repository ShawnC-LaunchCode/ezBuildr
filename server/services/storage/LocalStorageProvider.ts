import fs from 'fs/promises';
import path from 'path';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import type {
  IStorageProvider,
  StorageMetadata,
  UploadOptions,
  SignedUrlOptions,
} from './IStorageProvider';

/**
 * Local Filesystem Storage Provider
 * Stores files in the local filesystem (server/files/)
 */
export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;
  private baseUrl: string;

  constructor(options?: { baseDir?: string; baseUrl?: string }) {
    this.baseDir = options?.baseDir || path.join(process.cwd(), 'server', 'files');
    this.baseUrl = options?.baseUrl || process.env.BASE_URL || 'http://localhost:5000';
  }

  /**
   * Initialize storage directory
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      logger.error({ error }, 'Failed to create storage directory');
      throw createError.internal('Failed to initialize storage');
    }
  }

  /**
   * Get full file path from storage key
   */
  private getFilePath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitized = key.replace(/\.\./g, '').replace(/^\//, '');
    return path.join(this.baseDir, sanitized);
  }

  async upload(buffer: Buffer, key: string, options?: UploadOptions): Promise<string> {
    await this.ensureDirectory();

    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);

    try {
      // Ensure subdirectories exist
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, buffer);

      logger.info({ key, size: buffer.length }, 'File uploaded to local storage');

      // Return the storage key (not full path)
      return key;
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to local storage');
      throw createError.internal('Failed to upload file');
    }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);

    try {
      const buffer = await fs.readFile(filePath);
      logger.debug({ key, size: buffer.length }, 'File downloaded from local storage');
      return buffer;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw createError.notFound('File not found');
      }
      logger.error({ error, key }, 'Failed to download file from local storage');
      throw createError.internal('Failed to download file');
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);

    try {
      await fs.unlink(filePath);
      logger.info({ key }, 'File deleted from local storage');
    } catch (error: any) {
      // Ignore error if file doesn't exist
      if (error.code !== 'ENOENT') {
        logger.error({ error, key }, 'Failed to delete file from local storage');
        throw createError.internal('Failed to delete file');
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata> {
    const filePath = this.getFilePath(key);

    try {
      const stats = await fs.stat(filePath);

      // Try to infer content type from extension
      const ext = path.extname(key).toLowerCase();
      let contentType = 'application/octet-stream';

      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.zip': 'application/zip',
      };

      if (ext in mimeTypes) {
        contentType = mimeTypes[ext];
      }

      return {
        contentType,
        size: stats.size,
        lastModified: stats.mtime,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw createError.notFound('File not found');
      }
      throw createError.internal('Failed to get file metadata');
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    // For local storage, generate a temporary token-based URL
    // In a real implementation, you'd store these tokens and validate them
    const token = Buffer.from(`${key}:${Date.now() + options.expiresIn * 1000}`).toString(
      'base64'
    );

    // Return a URL that points to a download endpoint
    return `${this.baseUrl}/api/files/download/${encodeURIComponent(key)}?token=${token}`;
  }

  getPublicUrl(key: string): string | null {
    // Local storage doesn't support public URLs by default
    // You could implement a public download endpoint if needed
    return `${this.baseUrl}/api/files/download/${encodeURIComponent(key)}`;
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = this.getFilePath(sourceKey);
    const destPath = this.getFilePath(destKey);

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Copy file
      await fs.copyFile(sourcePath, destPath);

      logger.info({ sourceKey, destKey }, 'File copied in local storage');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw createError.notFound('Source file not found');
      }
      logger.error({ error, sourceKey, destKey }, 'Failed to copy file in local storage');
      throw createError.internal('Failed to copy file');
    }
  }

  async list(prefix: string, maxKeys: number = 1000): Promise<string[]> {
    const prefixPath = this.getFilePath(prefix);
    const results: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= maxKeys) {return;}

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxKeys) {break;}

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await walk(fullPath);
          } else {
            // Convert to relative key
            const key = path.relative(this.baseDir, fullPath).replace(/\\/g, '/');
            results.push(key);
          }
        }
      } catch (error) {
        // Ignore errors for directories that don't exist
        logger.debug({ error, dir }, 'Failed to list directory');
      }
    };

    await walk(path.dirname(prefixPath));

    // Filter results by prefix
    return results.filter((key) => key.startsWith(prefix));
  }
}

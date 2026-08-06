
import type { Readable } from 'stream';

export interface StorageMetadata {
    contentType: string;
    size: number;
    etag?: string;
    lastModified?: Date;
    custom?: Record<string, unknown>; // Custom metadata like expiresAt
}

export interface StorageProvider {
    /**
     * Initialize storage (e.g. create directories)
     */
    init(): Promise<void>;

    /**
     * Save a file (generates unique ID)
     * @param buffer File content
     * @param originalName Original filename
     * @param mimeType MIME type
     * @returns unique file reference key
     */
    saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string>;

    /**
     * Upload a file with a specific key
     * @param key Storage key
     * @param buffer File content
     * @param mimeType MIME type
     * @param metadata Optional metadata
     */
    uploadFile(key: string, buffer: Buffer, mimeType: string, metadata?: Record<string, unknown>): Promise<string>;

    /**
     * Upload a file without materializing a second in-memory copy.
     * `contentLength` is required so S3-compatible providers can stream with
     * a deterministic Content-Length instead of chunked transfer encoding.
     */
    uploadStream(
        key: string,
        stream: Readable,
        contentLength: number,
        mimeType: string,
        metadata?: Record<string, unknown>
    ): Promise<string>;

    /**
     * Total bytes stored under a key prefix, counted recursively.
     * Providers must answer this from their own listing metadata rather than a
     * per-object round trip: quota checks run on every upload, and one
     * `getMetadata` call per stored object turns a quota check into an
     * unbounded request fan-out that grows with the tenant.
     */
    getTotalSize(prefix: string): Promise<number>;

    /**
     * Delete a file
     * @param fileRef Unique file reference key
     */
    deleteFile(fileRef: string): Promise<void>;

    /**
     * Check if file exists
     * @param fileRef Unique file reference key
     */
    exists(fileRef: string): Promise<boolean>;

    /**
     * Get file as buffer
     * @param fileRef Unique file reference key
     */
    getFile(fileRef: string): Promise<Buffer>;

    /**
     * Get a local file path for the file.
     * If on S3, this should download to a temp file.
     * If on Disk, returns actual path.
     * @param fileRef Unique file reference key
     */
    getLocalPath(fileRef: string): Promise<string>;

    /**
     * Get file metadata
     */
    getMetadata(fileRef: string): Promise<StorageMetadata>;

    /**
     * Get signed URL (or public URL/local path for disk)
     */
    getSignedUrl(fileRef: string, expiresIn?: number): Promise<string>;

    /**
     * List files with prefix
     */
    list(prefix: string): Promise<string[]>;
}

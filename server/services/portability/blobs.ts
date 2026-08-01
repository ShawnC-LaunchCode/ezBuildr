import { storageProvider } from '../storage';
import { MAX_TOTAL_SIZE, MAX_SINGLE_ENTRY_SIZE, BundleSizeLimitError } from './bundleFormat';
import { BundleWriter } from './bundleWriter';
import { createHash } from 'crypto';
import type { BlobIndex, ExportWarning } from './bundleFormat';

export class BlobCollector {
  private totalSize = 0;
  private blobIndex: BlobIndex = {};
  public warnings: ExportWarning[] = [];
  
  constructor(private writer: BundleWriter) {}

  async collect(fileRef: string, entityName: string, columnName: string): Promise<void> {
    if (this.blobIndex[fileRef] != null) {
      return;
    }

    const exists = await storageProvider.exists(fileRef);
    if (!exists) {
      this.warnings.push({
        type: 'missing_blob',
        entity: entityName,
        column: columnName,
        fileRef,
        message: `Blob not found in storage: ${fileRef}`
      });
      return;
    }

    const buffer = await storageProvider.getFile(fileRef);
    
    if (buffer.length > MAX_SINGLE_ENTRY_SIZE) {
      throw new BundleSizeLimitError(`File ${fileRef} exceeds single entry size limit of ${MAX_SINGLE_ENTRY_SIZE} bytes.`);
    }

    this.totalSize += buffer.length;
    if (this.totalSize > MAX_TOTAL_SIZE) {
      throw new BundleSizeLimitError(`Total bundle size exceeds limit of ${MAX_TOTAL_SIZE} bytes.`);
    }

    const hash = createHash('sha256').update(buffer).digest('hex');
    
    let mimeType = 'application/octet-stream';
    try {
      const metadata = await storageProvider.getMetadata(fileRef);
      if (metadata.contentType != null) {
         mimeType = metadata.contentType;
      }
    } catch (e) {
      // If metadata fails for some reason but getFile succeeded, default to octet-stream
    }
    
    const filename = fileRef.split('/').pop() ?? hash;

    this.blobIndex[fileRef] = {
      sha256: hash,
      filename: filename,
      mimeType: mimeType,
      size: buffer.length
    };

    await this.writer.writeBlob(hash, buffer);
  }

  async finalize(): Promise<void> {
    await this.writer.writeBlobIndex(this.blobIndex);
  }

  get blobCount(): number {
    return Object.keys(this.blobIndex).length;
  }
}

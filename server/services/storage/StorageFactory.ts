import { logger } from '../../logger';

import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';

/**
 * Storage Provider Factory
 * Creates the appropriate storage provider based on configuration
 *
 * Set FILE_STORAGE_PROVIDER environment variable to:
 * - 'local' (default) - Use local filesystem storage
 * - 's3' - Use AWS S3 storage
 *
 * For S3, also set:
 * - AWS_S3_BUCKET
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_S3_ENDPOINT (optional, for S3-compatible services)
 */

let storageProviderInstance: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (storageProviderInstance) {
    return storageProviderInstance;
  }

  const provider = process.env.FILE_STORAGE_PROVIDER || 'local';

  logger.info({ provider }, 'Initializing storage provider');

  switch (provider.toLowerCase()) {
    case 's3':
      storageProviderInstance = new S3StorageProvider();
      break;

    case 'local':
    default:
      storageProviderInstance = new LocalStorageProvider();
      break;
  }

  return storageProviderInstance;
}

/**
 * Reset the storage provider instance (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}

/**
 * Set a custom storage provider (useful for testing)
 */
export function setStorageProvider(provider: IStorageProvider): void {
  storageProviderInstance = provider;
}

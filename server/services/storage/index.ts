import { logger } from '../../logger';

import { DiskStorageProvider } from './DiskStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { StorageProvider } from './types';

const storageDriver = process.env.STORAGE_DRIVER || 'disk';

let provider: StorageProvider;

if (storageDriver === 's3') {
    logger.info('Initializing S3 Storage Provider');
    provider = new S3StorageProvider();
} else {
    logger.info('Initializing Disk Storage Provider');
    provider = new DiskStorageProvider();
}

export const storageProvider = provider;

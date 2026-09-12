import { logger } from '../../logger';

import { DiskStorageProvider } from './DiskStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { StorageProvider } from './types';

const storageDriver = process.env.STORAGE_DRIVER ?? 'disk';

export const storageProvider: StorageProvider =
    storageDriver === 's3' ? new S3StorageProvider() : new DiskStorageProvider();

/**
 * Announce the driver from server boot, NOT from module scope.
 *
 * This used to log as a side effect of importing the module, which made every
 * importer pay for a pino call at import time. CB-9a-1's RunPreviewPolicyService
 * pulled this module into RunLifecycleService's import graph, and a unit-fast
 * file that never touches storage began executing that log line while being
 * collected — dying on `this[writeSym] is not a function` before a single test
 * ran. It reproduced on every CI run and on none locally, which is the worst
 * shape a failure can have.
 *
 * The import chain was the trigger; the import-time side effect was the bug.
 * A module that hands out a storage provider has no business logging when it is
 * merely imported.
 */
export function logStorageProvider(): void {
    logger.info(`Initializing ${storageDriver === 's3' ? 'S3' : 'Disk'} Storage Provider`);
}

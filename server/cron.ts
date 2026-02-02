import cron from 'node-cron';

import { createLogger } from './logger';
import { authService } from './services/AuthService';

const log = createLogger({ module: 'cron' });

export function initCronJobs(): void {
    log.info('Initializing cron jobs...');

    // Run cleanup every day at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        log.info('Running scheduled execution: cleanupExpiredTokens');
        try {
            await authService.cleanupExpiredTokens();
            log.info('Completed scheduled execution: cleanupExpiredTokens');
        } catch (error) {
            log.error({ error }, 'Failed to run scheduled execution: cleanupExpiredTokens');
        }
    });

    // Run temp file cleanup every hour
    cron.schedule('0 * * * *', async () => {
        log.info('Running scheduled execution: cleanupTempFiles');
        try {
            // Import dynamically or assume imports are present
            const { cleanupTempFiles } = await import('./services/fileService');
            const { templatePreviewService } = await import('./services/TemplatePreviewService');

            const count = await cleanupTempFiles();
            const previews = await templatePreviewService.cleanupExpiredPreviews();

            log.info({ count, previews }, 'Completed scheduled execution: cleanupTempFiles');
        } catch (error) {
            log.error({ error }, 'Failed to run scheduled execution: cleanupTempFiles');
        }
    });

    log.info('Cron jobs initialized');
}

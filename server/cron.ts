import cron from 'node-cron';

import { createLogger } from './logger';
import { authService } from './services/AuthService';

const log = createLogger({ module: 'cron' });

export function initCronJobs() {
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

    log.info('Cron jobs initialized');
}

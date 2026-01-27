import { Router } from 'express';

import { createLogger } from '../logger';
import * as fileService from '../services/fileService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const logger = createLogger({ module: 'system-routes' });

/**
 * POST /api/system/cleanup
 * Trigger storage cleanup (Soft deleted files)
 * Secured by simple secret or internal checking?
 * For now, we assume it's protected by upstream or simple header if needed.
 * Adding a basic PSK auth for safety.
 */
router.post('/cleanup', asyncHandler(async (req, res) => {
    const authHeader = req.headers['x-system-key'];
    // In production, this should be set in environment variables
    const systemKey = process.env.SYSTEM_CLEANUP_KEY || 'ezbuildr-cleanup-secret';

    if (authHeader !== systemKey) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
    }

    logger.info('Manual cleanup triggered via API');
    const count = await fileService.processDeletions();

    res.json({
        success: true,
        deletedCount: count,
        message: `Cleanup completed. Removed ${count} files.`
    });
}));

export default router;

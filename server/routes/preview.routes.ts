import { Router } from "express";
import { z } from "zod";

import { logger } from "../logger";
import { hybridAuth } from '../middleware/auth';
import { RandomizerService } from "../services/randomizer";
import { asyncHandler } from "../utils/asyncHandler";

import type { Express, Request, Response } from "express";

const previewRouter = Router();

const generateDataSchema = z.object({
    steps: z.array(z.any()).max(100), // QuestionNodeConfig array, loose validation for now
});

// Use hybridAuth to ensure dev/user is authenticated
previewRouter.use(hybridAuth);

/**
 * POST /api/preview/random-data
 * Generate random valid data for a list of steps
 */
// eslint-disable-next-line @typescript-eslint/require-await -- asyncHandler wraps sync Zod parse + service call
previewRouter.post('/random-data', asyncHandler(async (req: Request, res: Response) => {
    try {
        const { steps } = generateDataSchema.parse(req.body);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- steps from Zod parse matches expected type
        const data = RandomizerService.generateData(steps);

        res.json(data);
    } catch (error) {
        logger.error({ error }, "Error generating random data");
        res.status(500).json({ message: "Failed to generate data" });
    }
}));

export function registerPreviewRoutes(app: Express): void {
    app.use('/api/preview', previewRouter);
}

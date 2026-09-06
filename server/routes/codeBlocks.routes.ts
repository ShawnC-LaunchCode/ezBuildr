/**
 * Code Block routes (CB-8).
 *
 * One authoring-time endpoint: run a Code Block's code against sample data so
 * the editor's test panel can show what it emits before the block is saved.
 *
 * A NEW module rather than an addition to `transformBlocks.routes.ts` on
 * purpose: CB-10 deletes that file along with the `transform_blocks` table, and
 * the donor route's `hybridAuth` + `testLimiter` shape is the only part worth
 * keeping.
 */
import { z } from "zod";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { testLimiter } from "../middleware/rateLimiting";
import { codeBlockService } from "../services/codeBlocks/CodeBlockService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "code-blocks-routes" });

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

/** 64KB, matching the transform-block test endpoint it replaces. */
const MAX_TEST_PAYLOAD_BYTES = 64 * 1024;

/**
 * Explicit fields only — `req.body` is never spread into the service. `code`
 * reaches the sandbox, so it is length-capped here as well as in
 * `ScriptEngine.validate` (32KB), and `testData` is an opaque value map by
 * design: the whole point is to hand the block whatever an author wants to try.
 */
const testCodeBlockSchema = z.object({
  code: z.string().max(32 * 1024).optional(),
  testData: z.record(z.unknown()).optional(),
});

export function registerCodeBlockRoutes(app: Express): void {
  /**
   * POST /api/steps/:stepId/code-block/test
   * Validate, and (when `testData` is given) execute, a Code Block's code.
   */
  app.post(
    "/api/steps/:stepId/code-block/test",
    hybridAuth,
    testLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const userId = (req as AuthRequest).userId;
        if (userId === undefined || userId === "") {
          return res.status(401).json({ message: UNAUTHORIZED_MSG });
        }

        const { stepId } = req.params;
        const params = testCodeBlockSchema.parse(req.body);

        if (JSON.stringify(params.testData ?? {}).length > MAX_TEST_PAYLOAD_BYTES) {
          return res.status(400).json({ message: "Validation error: testData exceeds the 64KB limit" });
        }

        const result = await codeBlockService.testBlock(stepId, userId, params);
        return res.json(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid input", errors: error.errors });
        }
        logger.error({ error }, "Error testing Code Block");
        const { status, message } = classifyRouteError(error, "Failed to test Code Block");
        return res.status(status).json({ message });
      }
    })
  );
}

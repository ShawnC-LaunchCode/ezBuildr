import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { workflowRuns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

/**
 * Extended request type with run authentication info
 */
export interface RunAuthRequest extends Request {
  runAuth?: {
    runId: string;
    workflowId: string;
    runToken: string;
  };
}

/**
 * Middleware to authenticate requests using Bearer runToken
 * Sets req.runAuth with run information if valid
 *
 * Usage:
 *   app.post('/api/runs/:runId/values', runTokenAuth, handler)
 *
 * Authorization header format:
 *   Authorization: Bearer <runToken>
 */
export async function runTokenAuth(
  req: RunAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Missing or invalid Authorization header",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - No token provided",
      });
      return;
    }

    // Look up the run by token
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.runToken, token))
      .limit(1);

    if (!run) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Invalid run token",
      });
      return;
    }

    // Set run auth info on request
    req.runAuth = {
      runId: run.id,
      workflowId: run.workflowId,
      runToken: token,
    };

    next();
  } catch (error) {
    logger.error({ err: error }, "Error in runTokenAuth middleware");
    res.status(500).json({
      success: false,
      error: "Internal server error during authentication",
    });
  }
}

/**
 * Middleware that accepts EITHER session auth OR run token auth
 * Checks session first, then falls back to run token
 *
 * Sets either:
 *   - req.user (from session) OR
 *   - req.runAuth (from token)
 *
 * Usage:
 *   app.post('/api/runs/:runId/values', creatorOrRunTokenAuth, handler)
 */
export async function creatorOrRunTokenAuth(
  req: RunAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Check if user is authenticated via session
  if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
    // User is authenticated via session, continue
    return next();
  }

  // Fall back to run token auth
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Must be authenticated as creator or provide valid run token",
      });
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - No token provided",
      });
      return;
    }

    // Look up the run by token
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.runToken, token))
      .limit(1);

    if (!run) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Invalid run token",
      });
      return;
    }

    // Set run auth info on request
    req.runAuth = {
      runId: run.id,
      workflowId: run.workflowId,
      runToken: token,
    };

    next();
  } catch (error) {
    logger.error({ err: error }, "Error in creatorOrRunTokenAuth middleware");
    res.status(500).json({
      success: false,
      error: "Internal server error during authentication",
    });
  }
}

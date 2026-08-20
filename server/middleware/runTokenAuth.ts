import { logger } from "../logger";
import { workflowRunRepository } from "../repositories/WorkflowRunRepository";
import { workflowTenantResolver } from "../services/WorkflowTenantResolver";
import { setCurrentTenantId, withVerifiedIdentifier } from "../utils/rlsContext";

import type { Request, Response, NextFunction } from "express";

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
    if (!authHeader?.startsWith("Bearer ")) {
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

    // Look up the run by token (hashed lookup handled in the repository)
    const run = await workflowRunRepository.findByToken(token);


    if (!run) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Invalid run token",
      });
      return;
    }

    // Reject expired run tokens. A NULL expiry means the run predates token
    // expiry and is grandfathered (never expires).
    if (run.tokenExpiresAt && run.tokenExpiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Run token has expired",
      });
      return;
    }

    // Set run auth info on request
    req.runAuth = {
      runId: run.id,
      workflowId: run.workflowId,
      runToken: token,
    };

    // RLS-2e (reviewer fix): a run token is NOT a tenant JWT, so neither
    // `attachUserToRequest` nor `cookieStrategy` runs for it and nothing
    // populates the async tenant context. Every service the RLS-2 rollout
    // converted throws "RLS: no tenant in context." when reached this way —
    // which is every public link and every anonymous run, i.e. the
    // customer-facing path. `workflow_runs` carries no tenant_id, so the tenant
    // is resolved from the workflow, which is exactly what
    // `WorkflowTenantResolver` exists for ("anything keyed on a workflow id
    // alone"). Mirrors what RLS-1 did for `hybridAuth`.
    //
    // RLS-4 precondition 2 (closed): that resolution itself reads `workflows`
    // — RLS-covered, ownership-derived — with no tenant known yet, which is
    // exactly what it's trying to determine. `run.workflowId` just came from
    // a verified token match on `workflow_runs` (unprotected), so it is a
    // legitimately-established value; pin it as `app.current_workflow_id`
    // (migration 0030's self-identification clause on `workflows`) for the
    // duration of this one lookup so it can actually see the row, instead of
    // being silently blocked the same way the bootstrap read always was
    // before FORCE was ever considered.
    //
    // Best-effort by design: if resolution fails we leave the context empty and
    // let the downstream service fail closed, rather than inventing a tenant.
    try {
      const runTenantId = await withVerifiedIdentifier(
        'app.current_workflow_id',
        run.workflowId,
        (tx) => workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx)
      );
      if (runTenantId) {
        setCurrentTenantId(runTenantId);
      } else {
        logger.warn({ runId: run.id, workflowId: run.workflowId },
          "Run token accepted but tenant could not be resolved; downstream RLS-scoped calls will fail closed");
      }
    } catch (e) {
      logger.warn({ err: e, runId: run.id }, "Tenant resolution failed for run token");
    }

    next();
  } catch (error) {
    logger.error({
      err: error,
      cause: error instanceof Error ? error.cause : undefined,
      stack: error instanceof Error ? error.stack : undefined
    }, "Error in runTokenAuth middleware");
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
async function creatorOrRunTokenAuthLogic(
  req: RunAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Check if user is authenticated via hybridAuth (bearer token or cookie)
  // The hybridAuth middleware should run before this and set req.userId
  const userId = (req as { userId?: string }).userId;

  if (userId) {
    // User is authenticated, continue (assuming authorization validation happens in service)
    // We optionally populate req.user if downstream needs it, but mostly we just need to pass
    return next();
  }

  // Fall back to run token auth
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
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

    // Look up the run by token (hashed lookup handled in the repository)
    const run = await workflowRunRepository.findByToken(token);


    if (!run) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Invalid run token",
      });
      return;
    }

    // Reject expired run tokens. A NULL expiry means the run predates token
    // expiry and is grandfathered (never expires).
    if (run.tokenExpiresAt && run.tokenExpiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: "Unauthorized - Run token has expired",
      });
      return;
    }

    // Set run auth info on request
    req.runAuth = {
      runId: run.id,
      workflowId: run.workflowId,
      runToken: token,
    };

    // RLS-2e (reviewer fix): a run token is NOT a tenant JWT, so neither
    // `attachUserToRequest` nor `cookieStrategy` runs for it and nothing
    // populates the async tenant context. Every service the RLS-2 rollout
    // converted throws "RLS: no tenant in context." when reached this way —
    // which is every public link and every anonymous run, i.e. the
    // customer-facing path. `workflow_runs` carries no tenant_id, so the tenant
    // is resolved from the workflow, which is exactly what
    // `WorkflowTenantResolver` exists for ("anything keyed on a workflow id
    // alone"). Mirrors what RLS-1 did for `hybridAuth`.
    //
    // RLS-4 precondition 2 (closed): that resolution itself reads `workflows`
    // — RLS-covered, ownership-derived — with no tenant known yet, which is
    // exactly what it's trying to determine. `run.workflowId` just came from
    // a verified token match on `workflow_runs` (unprotected), so it is a
    // legitimately-established value; pin it as `app.current_workflow_id`
    // (migration 0030's self-identification clause on `workflows`) for the
    // duration of this one lookup so it can actually see the row, instead of
    // being silently blocked the same way the bootstrap read always was
    // before FORCE was ever considered.
    //
    // Best-effort by design: if resolution fails we leave the context empty and
    // let the downstream service fail closed, rather than inventing a tenant.
    try {
      const runTenantId = await withVerifiedIdentifier(
        'app.current_workflow_id',
        run.workflowId,
        (tx) => workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx)
      );
      if (runTenantId) {
        setCurrentTenantId(runTenantId);
      } else {
        logger.warn({ runId: run.id, workflowId: run.workflowId },
          "Run token accepted but tenant could not be resolved; downstream RLS-scoped calls will fail closed");
      }
    } catch (e) {
      logger.warn({ err: e, runId: run.id }, "Tenant resolution failed for run token");
    }

    next();
  } catch (error) {
    logger.error({
      err: error,
      cause: error instanceof Error ? error.cause : undefined,
      stack: error instanceof Error ? error.stack : undefined
    }, "Error in creatorOrRunTokenAuth middleware");
    res.status(500).json({
      success: false,
      error: "Internal server error during authentication",
    });
  }
}

export function creatorOrRunTokenAuth(
  req: RunAuthRequest,
  res: Response,
  next: NextFunction
): void {
  void creatorOrRunTokenAuthLogic(req, res, next);
}

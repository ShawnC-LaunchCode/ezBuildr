import type { Request, Response, NextFunction, RequestHandler } from "express";
import { aclService } from "../services/AclService";
import type { AccessRole } from "@shared/schema";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'acl-auth' });

/**
 * Middleware factory to require minimum project role
 * Usage: requireProjectRole('view') or requireProjectRole('edit') or requireProjectRole('owner')
 *
 * Expects projectId to be in req.params.id or req.params.projectId
 */
export function requireProjectRole(
  minRole: Exclude<AccessRole, "none">
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user || req.user;

      if (!user?.claims?.sub) {
        logger.warn({ ip: req.ip }, 'Project access denied: Not authenticated');
        return res.status(401).json({
          success: false,
          error: "Unauthorized - You must be logged in",
        });
      }

      const userId = user.claims.sub;
      const projectId = req.params.id || req.params.projectId;

      if (!projectId) {
        logger.warn({ userId }, 'Project access denied: No project ID in request');
        return res.status(400).json({
          success: false,
          error: "Bad request - Project ID required",
        });
      }

      const hasAccess = await aclService.hasProjectRole(userId, projectId, minRole);

      if (!hasAccess) {
        const userRole = await aclService.resolveRoleForProject(userId, projectId);
        logger.warn(
          { userId, projectId, requiredRole: minRole, userRole },
          'Project access denied: Insufficient permissions'
        );
        return res.status(403).json({
          success: false,
          error: `Forbidden - ${minRole} access required (you have: ${userRole})`,
        });
      }

      // Attach user ID to request for use in route handlers
      req.userId = userId;

      logger.debug(
        { userId, projectId, minRole },
        'Project access granted'
      );
      next();
    } catch (error) {
      logger.error({ err: error }, 'Error in project ACL middleware');
      res.status(500).json({
        success: false,
        error: "Internal server error during authorization",
      });
    }
  };
}

/**
 * Middleware factory to require minimum workflow role
 * Usage: requireWorkflowRole('view') or requireWorkflowRole('edit') or requireWorkflowRole('owner')
 *
 * Expects workflowId to be in req.params.id or req.params.workflowId
 */
export function requireWorkflowRole(
  minRole: Exclude<AccessRole, "none">
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user || req.user;

      if (!user?.claims?.sub) {
        logger.warn({ ip: req.ip }, 'Workflow access denied: Not authenticated');
        return res.status(401).json({
          success: false,
          error: "Unauthorized - You must be logged in",
        });
      }

      const userId = user.claims.sub;
      const workflowId = req.params.id || req.params.workflowId;

      if (!workflowId) {
        logger.warn({ userId }, 'Workflow access denied: No workflow ID in request');
        return res.status(400).json({
          success: false,
          error: "Bad request - Workflow ID required",
        });
      }

      const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, minRole);

      if (!hasAccess) {
        const userRole = await aclService.resolveRoleForWorkflow(userId, workflowId);
        logger.warn(
          { userId, workflowId, requiredRole: minRole, userRole },
          'Workflow access denied: Insufficient permissions'
        );
        return res.status(403).json({
          success: false,
          error: `Forbidden - ${minRole} access required (you have: ${userRole})`,
        });
      }

      // Attach user ID to request for use in route handlers
      req.userId = userId;

      logger.debug(
        { userId, workflowId, minRole },
        'Workflow access granted'
      );
      next();
    } catch (error) {
      logger.error({ err: error }, 'Error in workflow ACL middleware');
      res.status(500).json({
        success: false,
        error: "Internal server error during authorization",
      });
    }
  };
}

/**
 * Helper to check user authentication without ACL checks
 * Just ensures user is logged in and attaches userId to request
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.session?.user || req.user;

    if (!user?.claims?.sub) {
      logger.warn({ ip: req.ip }, 'Authentication required');
      return res.status(401).json({
        success: false,
        error: "Unauthorized - You must be logged in",
      });
    }

    // Attach user ID to request for use in route handlers
    req.userId = user.claims.sub;

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error in auth middleware');
    res.status(500).json({
      success: false,
      error: "Internal server error during authentication",
    });
  }
};

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../logger';
import type { AuthRequest } from './auth';

const logger = createLogger({ module: 'rbac-middleware' });

/**
 * User roles in the system
 */
export type UserRole = 'owner' | 'builder' | 'runner' | 'viewer';

/**
 * Permission actions in the system
 */
export type Permission =
  // Wildcard permission (owner only)
  | '*'
  // Workflow permissions
  | 'workflow:create'
  | 'workflow:edit'
  | 'workflow:delete'
  | 'workflow:view'
  | 'workflow:run'
  | 'workflow:publish'
  // Template permissions
  | 'template:create'
  | 'template:edit'
  | 'template:delete'
  | 'template:view'
  // Project permissions
  | 'project:create'
  | 'project:edit'
  | 'project:delete'
  | 'project:view'
  // Team permissions
  | 'team:create'
  | 'team:edit'
  | 'team:delete'
  | 'team:view'
  | 'team:invite'
  // Tenant permissions
  | 'tenant:edit'
  | 'tenant:view'
  | 'tenant:manage-users'
  // Run permissions
  | 'run:view'
  | 'run:create'
  // Secret permissions
  | 'secret:create'
  | 'secret:edit'
  | 'secret:delete'
  | 'secret:view';

/**
 * Role-based permission matrix
 * Defines what each role can do
 */
export const RolePermissions: Record<UserRole, Permission[]> = {
  owner: ['*'], // Owner has all permissions

  builder: [
    // Workflow permissions
    'workflow:create',
    'workflow:edit',
    'workflow:view',
    'workflow:run',
    'workflow:publish',
    // Template permissions
    'template:create',
    'template:edit',
    'template:view',
    // Project permissions
    'project:view',
    // Team permissions
    'team:view',
    // Tenant permissions
    'tenant:view',
    // Run permissions
    'run:view',
    'run:create',
    // Secret permissions (builders can manage secrets)
    'secret:create',
    'secret:edit',
    'secret:view',
  ],

  runner: [
    // Workflow permissions (view and run only)
    'workflow:view',
    'workflow:run',
    // Template permissions (view only)
    'template:view',
    // Project permissions (view only)
    'project:view',
    // Team permissions (view only)
    'team:view',
    // Tenant permissions (view only)
    'tenant:view',
    // Run permissions
    'run:view',
    'run:create',
  ],

  viewer: [
    // Workflow permissions (view only)
    'workflow:view',
    // Template permissions (view only)
    'template:view',
    // Project permissions (view only)
    'project:view',
    // Team permissions (view only)
    'team:view',
    // Tenant permissions (view only)
    'tenant:view',
    // Run permissions (view only)
    'run:view',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) {
    return false;
  }

  const permissions = RolePermissions[role];

  // Check for wildcard permission
  if (permissions.includes('*')) {
    return true;
  }

  // Check for specific permission
  return permissions.includes(permission);
}

/**
 * RBAC Middleware Factory
 * Creates middleware that checks if user has required permission
 *
 * @param permission - Required permission for the endpoint
 * @returns Express middleware function
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest;

    // Check if user is authenticated
    if (!authReq.userId) {
      logger.warn({ path: req.path, permission }, 'Unauthenticated user attempted to access protected resource');
      res.status(401).json({
        message: 'Authentication required',
        error: 'unauthorized',
      });
      return;
    }

    // Check if user has required permission
    const userRole = authReq.userRole;
    const allowed = hasPermission(userRole, permission);

    if (!allowed) {
      logger.warn({
        userId: authReq.userId,
        userRole,
        permission,
        path: req.path,
      }, 'Permission denied');

      res.status(403).json({
        message: 'Permission denied',
        error: 'forbidden',
        details: `Required permission: ${permission}`,
      });
      return;
    }

    logger.debug({
      userId: authReq.userId,
      userRole,
      permission,
      path: req.path,
    }, 'Permission check passed');

    next();
  };
}

/**
 * RBAC Middleware for Multiple Permissions (OR logic)
 * User needs at least ONE of the specified permissions
 *
 * @param permissions - Array of permissions (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest;

    // Check if user is authenticated
    if (!authReq.userId) {
      logger.warn({ path: req.path, permissions }, 'Unauthenticated user attempted to access protected resource');
      res.status(401).json({
        message: 'Authentication required',
        error: 'unauthorized',
      });
      return;
    }

    // Check if user has any of the required permissions
    const userRole = authReq.userRole;
    const allowed = permissions.some(permission => hasPermission(userRole, permission));

    if (!allowed) {
      logger.warn({
        userId: authReq.userId,
        userRole,
        permissions,
        path: req.path,
      }, 'Permission denied (none of required permissions)');

      res.status(403).json({
        message: 'Permission denied',
        error: 'forbidden',
        details: `Required permissions (any): ${permissions.join(', ')}`,
      });
      return;
    }

    logger.debug({
      userId: authReq.userId,
      userRole,
      permissions,
      path: req.path,
    }, 'Permission check passed (has at least one permission)');

    next();
  };
}

/**
 * RBAC Middleware for Multiple Permissions (AND logic)
 * User needs ALL of the specified permissions
 *
 * @param permissions - Array of permissions (user needs all)
 * @returns Express middleware function
 */
export function requireAllPermissions(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest;

    // Check if user is authenticated
    if (!authReq.userId) {
      logger.warn({ path: req.path, permissions }, 'Unauthenticated user attempted to access protected resource');
      res.status(401).json({
        message: 'Authentication required',
        error: 'unauthorized',
      });
      return;
    }

    // Check if user has all required permissions
    const userRole = authReq.userRole;
    const allowed = permissions.every(permission => hasPermission(userRole, permission));

    if (!allowed) {
      logger.warn({
        userId: authReq.userId,
        userRole,
        permissions,
        path: req.path,
      }, 'Permission denied (missing some required permissions)');

      res.status(403).json({
        message: 'Permission denied',
        error: 'forbidden',
        details: `Required permissions (all): ${permissions.join(', ')}`,
      });
      return;
    }

    logger.debug({
      userId: authReq.userId,
      userRole,
      permissions,
      path: req.path,
    }, 'Permission check passed (has all permissions)');

    next();
  };
}

/**
 * RBAC Middleware for Specific Roles
 * User must have one of the specified roles
 *
 * @param roles - Array of allowed roles
 * @returns Express middleware function
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest;

    // Check if user is authenticated
    if (!authReq.userId) {
      logger.warn({ path: req.path, roles }, 'Unauthenticated user attempted to access protected resource');
      res.status(401).json({
        message: 'Authentication required',
        error: 'unauthorized',
      });
      return;
    }

    // Check if user has one of the required roles
    const userRole = authReq.userRole;
    const allowed = userRole && roles.includes(userRole);

    if (!allowed) {
      logger.warn({
        userId: authReq.userId,
        userRole,
        requiredRoles: roles,
        path: req.path,
      }, 'Role check failed');

      res.status(403).json({
        message: 'Access denied',
        error: 'forbidden',
        details: `Required role: ${roles.join(' or ')}`,
      });
      return;
    }

    logger.debug({
      userId: authReq.userId,
      userRole,
      requiredRoles: roles,
      path: req.path,
    }, 'Role check passed');

    next();
  };
}

/**
 * Owner-only middleware
 * Shorthand for requireRole('owner')
 */
export const requireOwner = requireRole('owner');

/**
 * Builder or above middleware
 * Allows builders and owners
 */
export const requireBuilder = requireRole('owner', 'builder');

/**
 * Runner or above middleware
 * Allows runners, builders, and owners
 */
export const requireRunner = requireRole('owner', 'builder', 'runner');

/**
 * Get user permissions (utility function)
 */
export function getUserPermissions(req: Request): Permission[] {
  const authReq = req as AuthRequest;
  const userRole = authReq.userRole;

  if (!userRole) {
    return [];
  }

  return RolePermissions[userRole];
}

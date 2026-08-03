import { z } from 'zod';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultTablePermissionsService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { AuditLogger } from '../../lib/audit/auditLogger';
import { ERROR_AUTH_REQUIRED, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault table permissions endpoints (v4 Micro-Phase 6)
 */
export function registerDatavaultPermissionRoutes(app: Express): void {
  /**
   * GET /api/datavault/tables/:tableId/permissions
   * Get all permissions for a table (owner only)
   */
  app.get('/api/datavault/tables/:tableId/permissions', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const permissions = await datavaultTablePermissionsService.getTablePermissions(
        userId,
        tableId,
        tenantId
      );
      res.json(permissions);
    } catch (error) {
      logger.error({ error }, 'Error fetching table permissions');
      const { status, message } = classifyRouteError(error, 'Failed to fetch permissions');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/tables/:tableId/permissions
   * Grant or update permission for a user (owner only)
   * Body: { userId: string, role: 'owner' | 'write' | 'read' }
   */
  app.post('/api/datavault/tables/:tableId/permissions', createLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const actorUserId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!actorUserId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Validate request body
      const permissionSchema = z.object({
        userId: z.string().min(1, { message: 'User ID is required' }),
        role: z.enum(['owner', 'write', 'read'], {
          errorMap: () => ({ message: 'Role must be owner, write, or read' })
        }),
      });
      const data = permissionSchema.parse(req.body);
      const permission = await datavaultTablePermissionsService.grantPermission(
        actorUserId,
        tableId,
        tenantId,
        {
          tableId,
          userId: data.userId,
          role: data.role,
        }
      );
      void AuditLogger.log({
        userId: actorUserId,
        tenantId,
        action: 'datavault.table_permission.granted',
        resourceType: 'datavault_table_permission',
        resourceId: permission.id,
        after: {
          tableId,
          targetUserId: data.userId,
          role: data.role,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      logger.debug({ permission }, 'Grant permission success');
      res.status(201).json(permission);
    } catch (error) {
      logger.error({ error }, 'Error granting table permission');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors
        });
      }
      // Intentional business-rule error: surface the specific (safe, hardcoded)
      // message so callers understand why the owner grant was rejected.
      const raw = error instanceof Error ? error.message : '';
      if (raw.includes('Cannot modify permissions for table owner')) {
        return res.status(500).json({ message: 'Cannot modify permissions for table owner' });
      }
      const { status, message } = classifyRouteError(error, 'Failed to grant permission');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/permissions/:permissionId
   * Revoke a permission (owner only)
   * Query param: tableId (required for authorization)
   */
  app.delete('/api/datavault/permissions/:permissionId', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const actorUserId = getAuthUserId(req);
      const { permissionId } = req.params;
      const { tableId } = req.query;
      if (!actorUserId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!tableId || typeof tableId !== 'string') {
        return res.status(400).json({ message: 'Table ID query parameter is required' });
      }
      await datavaultTablePermissionsService.revokePermission(
        actorUserId,
        permissionId,
        tableId,
        tenantId
      );
      void AuditLogger.log({
        userId: actorUserId,
        tenantId,
        action: 'datavault.table_permission.revoked',
        resourceType: 'datavault_table_permission',
        resourceId: permissionId,
        before: {
          tableId,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.json({ success: true, message: 'Permission revoked successfully' });
    } catch (error) {
      logger.error({ error }, 'Error revoking table permission');
      const { status, message } = classifyRouteError(error, 'Failed to revoke permission');
      res.status(status).json({ message });
    }
  }));
}

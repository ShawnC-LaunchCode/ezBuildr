import { eq } from "drizzle-orm";

import { tenants, users, projects } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { requireOwner, requirePermission } from "../middleware/rbac";
import { requireTenant, validateTenantParam } from "../middleware/tenant";
import { userRepository } from "../repositories";

import type { Express, Request, Response } from "express";



const logger = createLogger({ module: 'tenant-routes' });

/**
 * Register tenant-related routes
 * Provides APIs for tenant management and access control
 */
export function registerTenantRoutes(app: Express): void {
  /**
   * GET /api/tenants/current
   * Get the current user's tenant information
   */
  app.get('/api/tenants/current', hybridAuth, requireTenant, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId;

      if (!tenantId) {
        return res.status(404).json({
          message: 'No tenant found for current user',
          error: 'no_tenant',
        });
      }

      // Get tenant information
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (!tenant) {
        return res.status(404).json({
          message: 'Tenant not found',
          error: 'tenant_not_found',
        });
      }

      res.json({
        id: tenant.id,
        name: tenant.name,
        billingEmail: tenant.billingEmail,
        plan: tenant.plan,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch current tenant');
      res.status(500).json({
        message: 'Failed to fetch tenant',
        error: 'internal_error',
      });
    }
  });

  /**
   * GET /api/tenants/:tenantId
   * Get specific tenant information (must be a member of the tenant)
   */
  app.get('/api/tenants/:tenantId', hybridAuth, validateTenantParam, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get tenant information
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (!tenant) {
        return res.status(404).json({
          message: 'Tenant not found',
          error: 'tenant_not_found',
        });
      }

      res.json({
        id: tenant.id,
        name: tenant.name,
        billingEmail: tenant.billingEmail,
        plan: tenant.plan,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch tenant');
      res.status(500).json({
        message: 'Failed to fetch tenant',
        error: 'internal_error',
      });
    }
  });

  /**
   * PUT /api/tenants/:tenantId
   * Update tenant information (owner only)
   */
  app.put('/api/tenants/:tenantId', hybridAuth, validateTenantParam, requireOwner, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const { name, billingEmail, plan } = req.body;

      // Validate input
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {updateData.name = name;}
      if (billingEmail !== undefined) {updateData.billingEmail = billingEmail;}
      if (plan !== undefined) {updateData.plan = plan;}

      // Update tenant
      const [updatedTenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, tenantId))
        .returning();

      if (!updatedTenant) {
        return res.status(404).json({
          message: 'Tenant not found',
          error: 'tenant_not_found',
        });
      }

      logger.info({ tenantId }, 'Tenant updated');

      res.json({
        message: 'Tenant updated successfully',
        tenant: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          billingEmail: updatedTenant.billingEmail,
          plan: updatedTenant.plan,
          updatedAt: updatedTenant.updatedAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update tenant');
      res.status(500).json({
        message: 'Failed to update tenant',
        error: 'internal_error',
      });
    }
  });

  /**
   * GET /api/tenants/:tenantId/users
   * Get all users in a tenant (owner or builder)
   */
  app.get('/api/tenants/:tenantId/users', hybridAuth, validateTenantParam, requirePermission('tenant:view'), async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get all users in the tenant
      const tenantUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          fullName: users.fullName,
          profileImageUrl: users.profileImageUrl,
          role: users.tenantRole,
          authProvider: users.authProvider,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, tenantId));

      res.json({
        users: tenantUsers,
        total: tenantUsers.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch tenant users');
      res.status(500).json({
        message: 'Failed to fetch users',
        error: 'internal_error',
      });
    }
  });

  /**
   * GET /api/tenants/:tenantId/projects
   * Get all projects in a tenant
   */
  app.get('/api/tenants/:tenantId/projects', hybridAuth, validateTenantParam, requirePermission('project:view'), async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get all projects in the tenant
      const tenantProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId));

      res.json({
        projects: tenantProjects,
        total: tenantProjects.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch tenant projects');
      res.status(500).json({
        message: 'Failed to fetch projects',
        error: 'internal_error',
      });
    }
  });

  /**
   * POST /api/tenants
   * Create a new tenant (for future multi-tenant signup)
   */
  app.post('/api/tenants', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const { name, billingEmail, plan } = req.body;

      // Validate input
      if (!name) {
        return res.status(400).json({
          message: 'Tenant name is required',
          error: 'missing_fields',
        });
      }

      // Create tenant
      const [newTenant] = await db
        .insert(tenants)
        .values({
          name,
          billingEmail: billingEmail || null,
          plan: plan || 'free',
        })
        .returning();

      // Update user's tenantId and role to owner
      if (authReq.userId) {
        await userRepository.updateUser(authReq.userId, {
          tenantId: newTenant.id,
          tenantRole: 'owner',
        });
      }

      logger.info({ tenantId: newTenant.id, userId: authReq.userId }, 'Tenant created');

      res.status(201).json({
        message: 'Tenant created successfully',
        tenant: {
          id: newTenant.id,
          name: newTenant.name,
          billingEmail: newTenant.billingEmail,
          plan: newTenant.plan,
          createdAt: newTenant.createdAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create tenant');
      res.status(500).json({
        message: 'Failed to create tenant',
        error: 'internal_error',
      });
    }
  });

  /**
   * PUT /api/tenants/:tenantId/users/:userId/role
   * Update user role in tenant (owner only)
   */
  app.put('/api/tenants/:tenantId/users/:userId/role', hybridAuth, validateTenantParam, requireOwner, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = req.params;
      const { role } = req.body;

      // Validate role
      const validRoles = ['owner', 'builder', 'runner', 'viewer'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          message: 'Invalid role. Must be one of: owner, builder, runner, viewer',
          error: 'invalid_role',
        });
      }

      // Update user role
      const [updatedUser] = await db
        .update(users)
        .set({
          tenantRole: role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({
          message: 'User not found',
          error: 'user_not_found',
        });
      }

      // Verify user belongs to the tenant
      if (updatedUser.tenantId !== tenantId) {
        return res.status(403).json({
          message: 'User does not belong to this tenant',
          error: 'user_not_in_tenant',
        });
      }

      logger.info({ tenantId, userId, newRole: role }, 'User role updated');

      res.json({
        message: 'User role updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.tenantRole,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update user role');
      res.status(500).json({
        message: 'Failed to update user role',
        error: 'internal_error',
      });
    }
  });
}

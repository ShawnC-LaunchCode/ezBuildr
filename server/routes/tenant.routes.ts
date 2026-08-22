import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { tenants, users, projects } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { requireOwner, requirePermission } from "../middleware/rbac";
import { requireTenant, validateTenantParam } from "../middleware/tenant";
import { invalidateUserCache } from "../middleware/userCache";
import { userRepository } from "../repositories";
import { withCurrentTenant, withTenantAsUser } from "../utils/rlsContext";
import { authService } from "../services/AuthService";
import { asyncHandler } from "../utils/asyncHandler";

import type { Express, Request, Response } from "express";



const logger = createLogger({ module: 'tenant-routes' });

async function createTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
    const { name, billingEmail } = req.body;

    if (!name) {
      res.status(400).json({
        message: 'Tenant name is required',
        error: 'missing_fields',
      });
      return;
    }

    const [newTenant] = await db
      .insert(tenants)
      .values({
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
        name,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
        billingEmail: billingEmail ?? null,
        plan: 'free',
      })
      .returning();

    if (authReq.userId) {
      // Assigning a user's FIRST tenant, which is the one shape `withTenant`
      // alone gets wrong: `USING` is evaluated against the row's CURRENT
      // tenant, so pinning only the new one makes the row invisible and the
      // UPDATE silently matches zero rows — no error, no write.
      // `withTenantAsUser` pins the self-id GUC as well so the row is visible,
      // while WITH CHECK still forces the written tenant to be this one.
      await withTenantAsUser(newTenant.id, authReq.userId, (tx) =>
        userRepository.updateUser(authReq.userId as string, {
          tenantId: newTenant.id,
          tenantRole: 'owner',
        }, tx));

      // The row just changed, so the 30-second TTL copy in `userCache` is now
      // wrong. `hybridAuth` re-hydrates tenant/role from that cache on every
      // request, so without this the user keeps their pre-tenant identity for
      // up to 30s and the very next call fails with "User does not have a
      // tenant assigned" — i.e. a brand-new account creates its workspace and
      // then cannot do anything for half a minute.
      //
      // Reproduced end to end on dev: POST /api/tenants -> 201, immediate
      // POST /api/projects -> 400, the identical request 30s later -> 201,
      // with `users.tenant_id` correctly set in the database the whole time.
      // `userCache.ts` already states the rule ("role-changing endpoints
      // invalidate this cache"); this endpoint assigns a tenant AND a role and
      // was not honouring it.
      invalidateUserCache(authReq.userId);
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
}

/**
 * Register tenant-related routes
 * Provides APIs for tenant management and access control
 */
export function registerTenantRoutes(app: Express): void {
  /**
   * GET /api/tenants/current
   * Get the current user's tenant information
   */
  app.get('/api/tenants/current', hybridAuth, requireTenant, asyncHandler(async (req: Request, res: Response) => {
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

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
  }));

  /**
   * GET /api/tenants/:tenantId
   * Get specific tenant information (must be a member of the tenant)
   */
  app.get('/api/tenants/:tenantId', hybridAuth, validateTenantParam, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get tenant information
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
  }));

  /**
   * PUT /api/tenants/:tenantId
   * Update tenant information (owner only)
   */
  app.put('/api/tenants/:tenantId', hybridAuth, validateTenantParam, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const UpdateTenantSchema = z.object({
        name: z.string().min(1).optional(),
        billingEmail: z.string().email().optional(),
      }).strict();

      const parsed = UpdateTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Invalid request body',
          error: 'validation_error',
          details: parsed.error.errors
        });
      }

      const { name, billingEmail } = parsed.data;

      // Validate input
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic update fields for tenant
      const updateData: any = {
        updatedAt: new Date(),
      };

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
      if (name !== undefined) { updateData.name = name; }
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
      if (billingEmail !== undefined) { updateData.billingEmail = billingEmail; }

      // Update tenant
      const [updatedTenant] = await db
        .update(tenants)
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
        .set(updateData)
        .where(eq(tenants.id, tenantId))
        .returning();

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
  }));

  /**
   * GET /api/tenants/:tenantId/users
   * Get all users in a tenant (owner or builder)
   */
  app.get('/api/tenants/:tenantId/users', hybridAuth, validateTenantParam, requirePermission('tenant:view'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get all users in the tenant. `users` is RLS-covered, so unscoped this
      // returned an EMPTY member list — a tenant settings page showing no
      // members at all rather than an error.
      const tenantUsers = await withCurrentTenant((tx) => tx
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
        .where(eq(users.tenantId, tenantId)));

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
  }));

  /**
   * GET /api/tenants/:tenantId/projects
   * Get all projects in a tenant
   */
  app.get('/api/tenants/:tenantId/projects', hybridAuth, validateTenantParam, requirePermission('project:view'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Get all projects in the tenant. `projects` is RLS-covered — same
      // silent-empty shape as the member list above.
      const tenantProjects = await withCurrentTenant((tx) => tx
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId)));

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
  }));

  /**
   * POST /api/tenants
   * Create a new tenant (for future multi-tenant signup)
   */
  app.post('/api/tenants', hybridAuth, asyncHandler(createTenantHandler));

  /**
   * PUT /api/tenants/:tenantId/users/:userId/role
   * Update user role in tenant (owner only)
   */
  app.put('/api/tenants/:tenantId/users/:userId/role', hybridAuth, validateTenantParam, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = req.params;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
      const { role } = req.body;

      // Validate role
      const validRoles = ['owner', 'builder', 'runner', 'viewer'];
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          message: 'Invalid role. Must be one of: owner, builder, runner, viewer',
          error: 'invalid_role',
        });
      }

      // SECURITY: scope the UPDATE to the tenant so an owner can only change roles of users
      // that actually belong to their tenant. Previously the update matched on id alone and
      // only checked tenantId AFTER writing — letting an owner of tenant A mutate a user in
      // tenant B (the write persisted even though a 403 was returned).
      const [updatedUser] = await db
        .update(users)
        .set({
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
          tenantRole: role,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .returning();

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!updatedUser) {
        // Either the user does not exist or does not belong to this tenant. Do not
        // distinguish the two, to avoid leaking cross-tenant user existence.
        return res.status(404).json({
          message: 'User not found in this tenant',
          error: 'user_not_found',
        });
      }

      // SECURITY: a role change must take effect immediately. Invalidate the cached user (so
      // JWT-based auth re-hydrates the new role at once) and revoke the user's refresh tokens
      // (so their session cannot be silently refreshed under the old role).
      invalidateUserCache(userId);
      await authService.revokeAllUserTokens(userId);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
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
  }));
}

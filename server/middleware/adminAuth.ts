import { createLogger } from "../logger";

import { getUserById } from "./userCache";

import type { Request, Response, NextFunction, RequestHandler } from "express";

const logger = createLogger({ module: 'admin-auth' });

/**
 * Middleware to check if user is authenticated and has admin role
 */
// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const isAdmin: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userId = (req as any).userId;

    if (!userId) {
      logger.warn({ ip: req.ip }, 'Admin access denied: Not authenticated');
      return res.status(401).json({
        message: "Unauthorized - You must be logged in"
      });
    }

    // Get full user details from database to check role.
    //
    // RLS-5: this runs before any tenant is pinned and reads the CALLER'S own
    // row, so it is the same self-identification read `requireUser` does —
    // `getUserById` pins `app.current_user_id` (migration 0028) so the row is
    // visible, and shares that path's TTL cache and its invalidation on role
    // change. An unscoped `findById` here would deny every admin route under
    // enforcement for any admin who has a tenant.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const dbUser = await getUserById(userId);

    if (!dbUser) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      logger.warn({ userId }, 'Admin access denied: User not found in database');
      return res.status(401).json({
        message: "Unauthorized - User not found"
      });
    }

    if (dbUser.role !== 'admin') {
      logger.warn(
        {
          userId: dbUser.id,
          email: dbUser.email,
          role: dbUser.role
        },
        'Admin access denied: User is not an admin'
      );
      return res.status(403).json({
        message: "Forbidden - Admin access required"
      });
    }

    // Attach full user object to request for use in route handlers
    // Email, createdAt, and updatedAt should always be present for authenticated users
    req.adminUser = {
      ...dbUser,
      email: dbUser.email,
      createdAt: dbUser.createdAt!,
      updatedAt: dbUser.updatedAt!
    };

    logger.info({ userId: dbUser.id, email: dbUser.email }, 'Admin access granted');
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error in admin authorization middleware');
    res.status(500).json({
      message: "Internal server error during authorization"
    });
  }
};

/**
 * Helper to check if a user has admin role (without middleware context)
 */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  try {
    const user = await getUserById(userId);
    return user?.role === 'admin';
  } catch (error) {
    logger.error({ err: error, userId }, 'Error checking admin status');
    return false;
  }
}

import { eq, and, inArray } from 'drizzle-orm';

import { users, organizationInvites } from '../../shared/schema';
import { logger } from '../logger';
import { forEachTenant } from '../utils/forEachTenant';

/**
 * Placeholder User Cleanup Service
 *
 * Cleans up placeholder users that were created for invites but never accepted
 * Runs as a periodic job to prevent database pollution
 */
export class PlaceholderUserCleanupService {
  /**
   * Clean up placeholder users with no pending invites
   * Returns count of users deleted
   */
  async cleanupExpiredPlaceholders(): Promise<number> {
    try {
      // RLS-7: a periodic job has no request and so no ambient tenant, and
      // `users` is RLS-covered. Unscoped, the scan below returned zero rows
      // under enforcement and this method logged "No placeholder users found
      // for cleanup" forever — a job that reports success having done
      // nothing. Iterate tenants explicitly instead; see forEachTenant.
      const { results } = await forEachTenant('placeholderUserCleanup', async (_tenantId, tx) => {
        const placeholderUsers = await tx
          .select()
          .from(users)
          .where(eq(users.isPlaceholder, true));

        if (placeholderUsers.length === 0) { return 0; }

        // For each placeholder user, check if they have any pending invites
        const usersToDelete: string[] = [];

        for (const user of placeholderUsers) {
          const pendingInvites = await tx
            .select()
            .from(organizationInvites)
            .where(
              and(
                eq(organizationInvites.invitedUserId, user.id),
                eq(organizationInvites.status, 'pending')
              )
            );

          // If no pending invites, mark for deletion
          if (pendingInvites.length === 0) {
            usersToDelete.push(user.id);
          }
        }

        if (usersToDelete.length === 0) { return 0; }

        // Delete placeholder users with no pending invites
        await tx
          .delete(users)
          .where(
            and(
              eq(users.isPlaceholder, true),
              inArray(users.id, usersToDelete)
            )
          );

        return usersToDelete.length;
      });

      const deletedCount = results.reduce((sum, n) => sum + n, 0);
      logger.info(
        { deletedCount },
        'Cleaned up placeholder users with no pending invites'
      );

      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Error during placeholder user cleanup');
      throw error;
    }
  }

  /**
   * Get statistics about placeholder users
   */
  async getPlaceholderStats(): Promise<{
    totalPlaceholders: number;
    withPendingInvites: number;
    eligibleForCleanup: number;
  }> {
    // Same per-tenant iteration as the cleanup above — these stats describe
    // what that job would do, so they must see exactly what it sees.
    const { results } = await forEachTenant('placeholderUserStats', async (_tenantId, tx) => {
      const placeholderUsers = await tx
        .select()
        .from(users)
        .where(eq(users.isPlaceholder, true));

      let withPending = 0;
      for (const user of placeholderUsers) {
        const pendingInvites = await tx
          .select()
          .from(organizationInvites)
          .where(
            and(
              eq(organizationInvites.invitedUserId, user.id),
              eq(organizationInvites.status, 'pending')
            )
          );

        if (pendingInvites.length > 0) { withPending++; }
      }
      return { total: placeholderUsers.length, withPending };
    });

    const totalPlaceholders = results.reduce((sum, r) => sum + r.total, 0);
    const withPendingInvites = results.reduce((sum, r) => sum + r.withPending, 0);

    return {
      totalPlaceholders,
      withPendingInvites,
      eligibleForCleanup: totalPlaceholders - withPendingInvites,
    };
  }
}

export const placeholderUserCleanupService = new PlaceholderUserCleanupService();

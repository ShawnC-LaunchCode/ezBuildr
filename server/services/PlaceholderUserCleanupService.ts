import { eq, and, inArray } from 'drizzle-orm';

import { users, organizationInvites } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../logger';

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
      // Find all placeholder users
      const placeholderUsers = await db
        .select()
        .from(users)
        .where(eq(users.isPlaceholder, true));

      if (placeholderUsers.length === 0) {
        logger.info('No placeholder users found for cleanup');
        return 0;
      }

      logger.info({ count: placeholderUsers.length }, 'Found placeholder users, checking for pending invites');

      // For each placeholder user, check if they have any pending invites
      const usersToDelete: string[] = [];

      for (const user of placeholderUsers) {
        const pendingInvites = await db
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

      if (usersToDelete.length === 0) {
        logger.info('No placeholder users eligible for cleanup');
        return 0;
      }

      // Delete placeholder users with no pending invites
      await db
        .delete(users)
        .where(
          and(
            eq(users.isPlaceholder, true),
            inArray(users.id, usersToDelete.length > 0 ? usersToDelete : [''])
          )
        );

      logger.info(
        { deletedCount: usersToDelete.length },
        'Cleaned up placeholder users with no pending invites'
      );

      return usersToDelete.length;
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
    const placeholderUsers = await db
      .select()
      .from(users)
      .where(eq(users.isPlaceholder, true));

    let withPendingInvites = 0;

    for (const user of placeholderUsers) {
      const pendingInvites = await db
        .select()
        .from(organizationInvites)
        .where(
          and(
            eq(organizationInvites.invitedUserId, user.id),
            eq(organizationInvites.status, 'pending')
          )
        );

      if (pendingInvites.length > 0) {
        withPendingInvites++;
      }
    }

    return {
      totalPlaceholders: placeholderUsers.length,
      withPendingInvites,
      eligibleForCleanup: placeholderUsers.length - withPendingInvites,
    };
  }
}

export const placeholderUserCleanupService = new PlaceholderUserCleanupService();

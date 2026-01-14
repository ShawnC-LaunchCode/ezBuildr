import { eq } from 'drizzle-orm';

import { users, organizationMemberships } from '../../shared/schema';
import { db } from '../db';
import { canAccessAsset, isOrgMember } from '../utils/ownershipAccess';

/**
 * Transfer Service
 *
 * Handles ownership transfers for all asset types (projects, workflows, databases)
 * with consistent validation and cascade rules
 */

export interface TransferOwnershipInput {
  targetOwnerType: 'user' | 'org';
  targetOwnerUuid: string;
}

export class TransferService {
  /**
   * Validate that a user can transfer an asset
   * FIX #9: Reordered checks to fail fast - verify target exists first
   *
   * Rules:
   * - Target must exist (fast check)
   * - If transferring to org: user must be a member of target org
   * - If transferring to user: must be transferring to self
   * - User must have access to the current asset (owner or org member)
   */
  async validateTransfer(
    currentUserId: string,
    currentOwnerType: 'user' | 'org' | null,
    currentOwnerUuid: string | null,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<void> {
    // FIX #9: Step 1 - Verify target exists FIRST (fail fast on invalid UUID)
    if (targetOwnerType === 'org') {
      const org = await db.query.organizations.findFirst({
        where: (orgs, { eq }) => eq(orgs.id, targetOwnerUuid),
      });
      if (!org) {
        throw new Error('Target organization not found');
      }
    } else if (targetOwnerType === 'user') {
      const user = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, targetOwnerUuid),
      });
      if (!user) {
        throw new Error('Target user not found');
      }
    } else {
      throw new Error('Invalid target owner type');
    }

    // Step 2 - Validate target ownership permissions
    if (targetOwnerType === 'org') {
      // User must be a member of the target org
      const isMember = await isOrgMember(currentUserId, targetOwnerUuid);
      if (!isMember) {
        throw new Error('Access denied: You are not a member of the target organization');
      }
    } else if (targetOwnerType === 'user') {
      // Can only transfer to self
      if (targetOwnerUuid !== currentUserId) {
        throw new Error('Access denied: Can only transfer to yourself');
      }
    }

    // Step 3 - Validate user has access to current asset (last, as it might be most expensive)
    const hasAccess = await canAccessAsset(currentUserId, currentOwnerType, currentOwnerUuid);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have permission to transfer this asset');
    }
  }

  /**
   * Check if user can edit an asset based on ownership
   *
   * Rules:
   * - User owns the asset
   * - Or user is member of org that owns the asset
   */
  async canEditAsset(
    userId: string,
    ownerType: 'user' | 'org' | null,
    ownerUuid: string | null
  ): Promise<boolean> {
    return canAccessAsset(userId, ownerType, ownerUuid);
  }
}

export const transferService = new TransferService();

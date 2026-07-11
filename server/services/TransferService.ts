import { db } from '../db';
import { canAccessAsset, canManageOrg } from '../utils/ownershipAccess';
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
      // Creating or moving production assets into an org requires an org admin.
      const canManageTarget = await canManageOrg(currentUserId, targetOwnerUuid);
      if (!canManageTarget) {
        throw new Error('Access denied: Organization admin role required to transfer assets to this organization');
      }
    } else if (targetOwnerType === 'user' && targetOwnerUuid !== currentUserId) {
      // Can only transfer to self
      throw new Error('Access denied: Can only transfer to yourself');
    }
    if (
      currentOwnerType === 'org' &&
      currentOwnerUuid &&
      (targetOwnerType !== 'org' || targetOwnerUuid !== currentOwnerUuid)
    ) {
      const canManageSource = await canManageOrg(currentUserId, currentOwnerUuid);
      if (!canManageSource) {
        throw new Error('Access denied: Organization admin role required to transfer assets out of this organization');
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

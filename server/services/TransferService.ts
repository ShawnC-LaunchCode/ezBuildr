import { db } from '../db';
import { canAccessAsset, canManageOrg } from '../utils/ownershipAccess';

import type { DbTransaction } from '../repositories';
/**
 * Transfer Service
 *
 * Handles ownership transfers for all asset types (projects, workflows, databases)
 * with consistent validation and cascade rules
 *
 * RLS-2b: TransferService has no tenant of its own — it validates transfers between
 * owner (user/org) pairs, not tenant-scoped rows, so it does NOT open a `withTx`
 * transaction the way the pilot's tenant-owning services do. Its job here is only to
 * accept and thread an optional caller-supplied `tx` so it participates in whichever
 * tenant transaction its caller (DatavaultDatabasesService, ProjectService,
 * WorkflowService) already opened, instead of issuing untransacted pool queries
 * that would deadlock that caller's transaction on a size-1 pool (the SystemStats
 * class of bug — see canAccessAsset/isOrgMember in ownershipAccess.ts, fixed
 * alongside this file).
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
    target: { ownerType: 'user' | 'org'; ownerUuid: string },
    tx?: DbTransaction
  ): Promise<void> {
    // RLS-2b: bundled into `target` (was two positional params) to stay under
    // max-params once `tx` was added for transaction participation — see the
    // file header on why `tx` threading matters here.
    const { ownerType: targetOwnerType, ownerUuid: targetOwnerUuid } = target;
    const conn = tx ?? db;
    // FIX #9: Step 1 - Verify target exists FIRST (fail fast on invalid UUID)
    if (targetOwnerType === 'org') {
      const org = await conn.query.organizations.findFirst({
        where: (orgs, { eq }) => eq(orgs.id, targetOwnerUuid),
      });
      if (!org) {
        throw new Error('Target organization not found');
      }
    } else if (targetOwnerType === 'user') {
      const user = await conn.query.users.findFirst({
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
      const canManageTarget = await canManageOrg(currentUserId, targetOwnerUuid, tx);
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
      const canManageSource = await canManageOrg(currentUserId, currentOwnerUuid, tx);
      if (!canManageSource) {
        throw new Error('Access denied: Organization admin role required to transfer assets out of this organization');
      }
    }
    // Step 3 - Validate user has access to current asset (last, as it might be most expensive)
    const hasAccess = await canAccessAsset(currentUserId, currentOwnerType, currentOwnerUuid, tx);
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
    ownerUuid: string | null,
    tx?: DbTransaction
  ): Promise<boolean> {
    return canAccessAsset(userId, ownerType, ownerUuid, tx);
  }
}
export const transferService = new TransferService();

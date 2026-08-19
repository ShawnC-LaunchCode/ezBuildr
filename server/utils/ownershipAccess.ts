import { eq, and } from 'drizzle-orm';

import { organizationMemberships } from '../../shared/schema';
import { db } from '../db';
import type { DbTransaction } from '../repositories';
/**
 * Ownership Access Control Utilities
 *
 * Provides centralized access control for org-owned and user-owned assets.
 * All services should use these helpers to enforce consistent ownership rules.
 */
export interface OwnershipInfo {
  ownerType: 'user' | 'org' | null;
  ownerUuid: string | null;
}
/**
 * Check if a user can access an asset based on ownership
 *
 * Rules:
 * - User-owned assets: only the owner can access
 * - Org-owned assets: any org member can access
 *
 * @param userId - The user requesting access
 * @param ownerType - 'user' or 'org'
 * @param ownerUuid - UUID of the owner (user ID or org ID)
 * @returns true if access is allowed, false otherwise
 */
export async function canAccessAsset(
  userId: string,
  ownerType: 'user' | 'org' | null,
  ownerUuid: string | null,
  tx?: DbTransaction
): Promise<boolean> {
  // Fail closed on missing ownership fields (M1 Fix)
  if (!ownerType || !ownerUuid) {
    return false;
  }

  if (ownerType === 'user') {
    return ownerUuid === userId;
  }

  if (ownerType === 'org') {
    // RLS-2b: thread tx through — see isOrgMember's own comment on why an
    // untransacted pool query here would deadlock a caller's transaction on
    // a size-1 pool (the SystemStats class of bug).
    return isOrgMember(userId, ownerUuid, tx);
  }

  return false;
}

/**
 * Check if a user is a member of an organization
 * @returns true if user is a member, false otherwise
 */
export async function isOrgMember(userId: string, orgId: string, tx?: DbTransaction): Promise<boolean> {
  // Accept a caller's transaction: when invoked inside db.transaction() the pooled
  // `db` handle would wait for a second connection and deadlock the size-1 test pool.
  const membership = await (tx ?? db)
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.orgId, orgId)
      )
    )
    .limit(1);
  return membership.length > 0;
}
/**
 * Check if a user can manage an organization (admin role)
 *
 * @param userId - The user ID
 * @param orgId - The organization ID
 * @returns true if user is an admin, false otherwise
 */
export async function canManageOrg(userId: string, orgId: string, tx?: DbTransaction): Promise<boolean> {
  // Accept a caller's transaction (see isOrgMember) to avoid a size-1 pool deadlock.
  const membership = await (tx ?? db)
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.role, 'admin')
      )
    )
    .limit(1);
  return membership.length > 0;
}
/**
 * Get all organization IDs a user is a member of
 * Used for filtering list queries to include org-owned assets
 *
 * @param userId - The user ID
 * @returns Array of organization IDs
 */
export async function getUserOrgIds(userId: string, tx?: DbTransaction): Promise<string[]> {
  // RLS-2b (reviewer fix): MUST accept the caller's transaction. In test mode
  // the pool is size 1 (`server/db.ts`, so schema isolation is reliable), so a
  // query issued on the POOL from inside an open transaction waits forever for
  // the connection that transaction is already holding. It hangs rather than
  // erroring, which is why it reads as a 300s hook timeout and not a failure.
  // This is the `SystemStats` deadlock class, and it is reachable from every
  // service RLS-2a/2b converted, because the repositories below call this from
  // inside `withCurrentTenant`.
  const memberships = await (tx ?? db)
    .select({ orgId: organizationMemberships.orgId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId));
  return memberships.map(m => m.orgId);
}
/**
 * Build a SQL condition for "user owns OR user's org owns" filtering
 * Use this in list queries to show both user-owned and org-owned assets
 *
 * Example usage:
 * ```
 * const accessible = await getAccessibleOwnershipFilter(userId);
 * const results = await db.select().from(workflows).where(
 *   or(
 *     and(eq(workflows.ownerType, 'user'), eq(workflows.ownerUuid, userId)),
 *     and(eq(workflows.ownerType, 'org'), inArray(workflows.ownerUuid, accessible.orgIds))
 *   )
 * );
 * ```
 */
export async function getAccessibleOwnershipFilter(userId: string, tx?: DbTransaction): Promise<{
  userId: string;
  orgIds: string[];
}> {
  // Pass `tx` whenever this is reached from inside a service transaction — see
  // the deadlock note on `getUserOrgIds`. Repositories that call this from a
  // `withTx`-wrapped service path (Datavault tables/databases, projects,
  // workflows) must thread their own `tx` through.
  const orgIds = await getUserOrgIds(userId, tx);
  return { userId, orgIds };
}
/**
 * Check if user can create an asset with given ownership
 *
 * Rules:
 * - Can create user-owned if ownerUuid matches userId
 * - Can create org-owned if user is member of org
 *
 * @param userId - The user attempting to create
 * @param ownerType - 'user' or 'org'
 * @param ownerUuid - UUID of the intended owner
 * @returns true if user can create, false otherwise
 */
export async function canCreateWithOwnership(
  userId: string,
  ownerType: string,
  ownerUuid: string
): Promise<boolean> {
  if (ownerType === 'user') {
    return ownerUuid === userId;
  }
  if (ownerType === 'org') {
    return isOrgMember(userId, ownerUuid);
  }
  return false;
}
/**
 * Verify access and throw error if denied
 * Convenience function for endpoints
 *
 * @throws Error with 403 message if access denied
 */
export async function requireAssetAccess(
  userId: string,
  ownerType: 'user' | 'org' | null,
  ownerUuid: string | null,
  resourceName: string = 'resource'
): Promise<void> {
  const hasAccess = await canAccessAsset(userId, ownerType, ownerUuid);
  if (!hasAccess) {
    throw new Error(`Access denied: You do not have permission to access this ${resourceName}`);
  }
}
/**
 * Verify org admin access and throw error if denied
 *
 * @throws Error with 403 message if not an admin
 */
export async function requireOrgAdmin(
  userId: string,
  orgId: string
): Promise<void> {
  const isAdmin = await canManageOrg(userId, orgId);
  if (!isAdmin) {
    throw new Error('Access denied: Organization admin role required');
  }
}
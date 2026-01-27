import { eq, and } from 'drizzle-orm';

import { organizationMemberships } from '../../shared/schema';
import { db } from '../db';
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
 * - Org-owned assets: any member of the org can access
 * - Null ownership: legacy data, allow access (for now)
 *
 * @param userId - The user attempting access
 * @param ownerType - 'user' or 'org'
 * @param ownerUuid - UUID of the owner (user or org)
 * @returns true if user has access, false otherwise
 */
export async function canAccessAsset(
  userId: string,
  ownerType: 'user' | 'org' | null,
  ownerUuid: string | null
): Promise<boolean> {
  // Null ownership - legacy data, allow access for backward compatibility
  if (!ownerType || !ownerUuid) {
    return true;
  }
  // User-owned asset - only owner can access
  if (ownerType === 'user') {
    return ownerUuid === userId;
  }
  // Org-owned asset - check membership
  if (ownerType === 'org') {
    return isOrgMember(userId, ownerUuid);
  }
  return false;
}
/**
 * Check if a user is a member of an organization
 *
 * @param userId - The user ID
 * @param orgId - The organization ID
 * @returns true if user is a member, false otherwise
 */
export async function isOrgMember(userId: string, orgId: string): Promise<boolean> {
  const membership = await db
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
export async function canManageOrg(userId: string, orgId: string): Promise<boolean> {
  const membership = await db
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
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db
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
export async function getAccessibleOwnershipFilter(userId: string): Promise<{
  userId: string;
  orgIds: string[];
}> {
  const orgIds = await getUserOrgIds(userId);
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
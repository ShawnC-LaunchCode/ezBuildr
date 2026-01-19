import { eq, or } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../server/db';
import { canAccessAsset, isOrgMember, canManageOrg, getUserOrgIds, canCreateWithOwnership } from '../../server/utils/ownershipAccess';
import { organizationMemberships, organizations, users, tenants } from '../../shared/schema';
/**
 * Tests for Organization Ownership Access Control
 *
 * These tests verify that:
 * 1. Non-members cannot access org-owned assets
 * 2. Members can access org-owned assets
 * 3. Users can only access their own user-owned assets
 * 4. Admins can manage organizations
 */
describe('Ownership Access Control', () => {
  const userId1 = '00000000-0000-0000-0000-000000000001';
  const userId2 = '00000000-0000-0000-0000-000000000002';
  const orgId1 = '10000000-0000-0000-0000-000000000001';
  const orgId2 = '10000000-0000-0000-0000-000000000002';
  const tenantId = '00000000-0000-0000-0000-000000000099';
  // Setup test data before each test
  beforeEach(async () => {
    try {
      // Create test tenant
      await db.insert(tenants).values({
        id: tenantId,
        name: 'Ownership Test Tenant',
      }).onConflictDoNothing();
      // Create test organizations
      await db.insert(organizations).values([
        { id: orgId1, name: 'Test Org 1', tenantId },
        { id: orgId2, name: 'Test Org 2', tenantId },
      ]).onConflictDoNothing();
      // Create test users
      await db.insert(users).values([
        { id: userId1, email: 'user1@test.com', fullName: 'User 1', tenantId },
        { id: userId2, email: 'user2@test.com', fullName: 'User 2', tenantId },
      ]).onConflictDoNothing();
    } catch (error) {
      console.error('Setup error:', error);
      // Ignore setup errors if data already exists
    }
  });
  // Clean up test data after each test
  afterEach(async () => {
    try {
      // Clean up memberships
      await db.delete(organizationMemberships)
        .where(
          or(
            eq(organizationMemberships.orgId, orgId1),
            eq(organizationMemberships.orgId, orgId2)
          )
        );
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  describe('canAccessAsset', () => {
    it('should allow access to user-owned asset by owner', async () => {
      const hasAccess = await canAccessAsset(userId1, 'user', userId1);
      expect(hasAccess).toBe(true);
    });
    it('should deny access to user-owned asset by non-owner', async () => {
      const hasAccess = await canAccessAsset(userId2, 'user', userId1);
      expect(hasAccess).toBe(false);
    });
    it('should allow access to org-owned asset by org member', async () => {
      // Create membership
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'member',
      });
      const hasAccess = await canAccessAsset(userId1, 'org', orgId1);
      expect(hasAccess).toBe(true);
    });
    it('should deny access to org-owned asset by non-member', async () => {
      const hasAccess = await canAccessAsset(userId2, 'org', orgId1);
      expect(hasAccess).toBe(false);
    });
    it('should allow access to null ownership (legacy data)', async () => {
      const hasAccess = await canAccessAsset(userId1, null, null);
      expect(hasAccess).toBe(true);
    });
  });
  describe('isOrgMember', () => {
    it('should return true for org member', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'member',
      });
      const isMember = await isOrgMember(userId1, orgId1);
      expect(isMember).toBe(true);
    });
    it('should return false for non-member', async () => {
      const isMember = await isOrgMember(userId2, orgId1);
      expect(isMember).toBe(false);
    });
    it('should return true for org admin', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'admin',
      });
      const isMember = await isOrgMember(userId1, orgId1);
      expect(isMember).toBe(true);
    });
  });
  describe('canManageOrg', () => {
    it('should return true for org admin', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'admin',
      });
      const canManage = await canManageOrg(userId1, orgId1);
      expect(canManage).toBe(true);
    });
    it('should return false for org member (non-admin)', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'member',
      });
      const canManage = await canManageOrg(userId1, orgId1);
      expect(canManage).toBe(false);
    });
    it('should return false for non-member', async () => {
      const canManage = await canManageOrg(userId2, orgId1);
      expect(canManage).toBe(false);
    });
  });
  describe('getUserOrgIds', () => {
    it('should return all org IDs for a user', async () => {
      await db.insert(organizationMemberships).values([
        { orgId: orgId1, userId: userId1, role: 'member' },
        { orgId: orgId2, userId: userId1, role: 'admin' },
      ]);
      const orgIds = await getUserOrgIds(userId1);
      expect(orgIds).toHaveLength(2);
      expect(orgIds).toContain(orgId1);
      expect(orgIds).toContain(orgId2);
    });
    it('should return empty array for user with no memberships', async () => {
      const orgIds = await getUserOrgIds(userId2);
      expect(orgIds).toHaveLength(0);
    });
  });
  describe('canCreateWithOwnership', () => {
    it('should allow creating user-owned asset if ownerUuid matches userId', async () => {
      const canCreate = await canCreateWithOwnership(userId1, 'user', userId1);
      expect(canCreate).toBe(true);
    });
    it('should deny creating user-owned asset if ownerUuid does not match userId', async () => {
      const canCreate = await canCreateWithOwnership(userId1, 'user', userId2);
      expect(canCreate).toBe(false);
    });
    it('should allow creating org-owned asset if user is member', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'member',
      });
      const canCreate = await canCreateWithOwnership(userId1, 'org', orgId1);
      expect(canCreate).toBe(true);
    });
    it('should deny creating org-owned asset if user is not member', async () => {
      const canCreate = await canCreateWithOwnership(userId2, 'org', orgId1);
      expect(canCreate).toBe(false);
    });
  });
  describe('Cross-org Access Control', () => {
    it('should not allow member of org1 to access org2-owned assets', async () => {
      await db.insert(organizationMemberships).values({
        orgId: orgId1,
        userId: userId1,
        role: 'member',
      });
      const hasAccess = await canAccessAsset(userId1, 'org', orgId2);
      expect(hasAccess).toBe(false);
    });
    it('should allow member of multiple orgs to access all their org assets', async () => {
      await db.insert(organizationMemberships).values([
        { orgId: orgId1, userId: userId1, role: 'member' },
        { orgId: orgId2, userId: userId1, role: 'admin' },
      ]);
      const hasAccess1 = await canAccessAsset(userId1, 'org', orgId1);
      const hasAccess2 = await canAccessAsset(userId1, 'org', orgId2);
      expect(hasAccess1).toBe(true);
      expect(hasAccess2).toBe(true);
    });
  });
});
/**
 * Organization Workflow Integration Tests
 *
 * Tests the complete organization workflow:
 * 1. Create organization
 * 2. Invite member
 * 3. Accept invite
 * 4. Transfer workflow to org
 * 5. Member can access/edit workflow
 * 6. Non-member cannot access workflow
 */
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db } from '../../server/db';
import { organizationService } from '../../server/services/OrganizationService';
import { workflowService } from '../../server/services/WorkflowService';
import {
  users,
  organizations,
  organizationMemberships,
  organizationInvites,
  workflows,
  tenants,
} from '../../shared/schema';
describe('Organization Workflow Integration Tests', () => {
  // Test users
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const user3Id = uuidv4(); // Non-member
  const testTenantId = uuidv4();
  // Test data IDs
  let testOrgId: string;
  let testWorkflowId: string;
  let inviteToken: string;
  beforeAll(async () => {
    // Create test tenant
    await db.insert(tenants).values({
      id: testTenantId,
      name: 'Test Tenant',
    }).onConflictDoNothing();
    // Create test users
    await db.insert(users).values([
      {
        id: user1Id,
        email: 'org-owner@test.com',
        fullName: 'Org Owner',
        tenantId: testTenantId,
      },
      {
        id: user2Id,
        email: 'org-member@test.com',
        fullName: 'Org Member',
        tenantId: testTenantId,
      },
      {
        id: user3Id,
        email: 'non-member@test.com',
        fullName: 'Non Member',
        tenantId: testTenantId,
      },
    ]).onConflictDoNothing();
  });
  afterAll(async () => {
    // Cleanup in reverse dependency order
    try {
      if (testWorkflowId) {
        await db.delete(workflows).where(eq(workflows.id, testWorkflowId));
      }
      if (testOrgId) {
        await db.delete(organizationInvites).where(eq(organizationInvites.orgId, testOrgId));
        await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, testOrgId));
        await db.delete(organizations).where(eq(organizations.id, testOrgId));
      }
      await db.delete(users).where(eq(users.tenantId, testTenantId));
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });
  describe('Complete Organization Workflow', () => {
    it('Step 1: Create organization', async () => {
      const org = await organizationService.createOrganization(
        {
          name: 'Test Organization',
          description: 'Integration test organization',
        },
        user1Id
      );
      expect(org).toBeDefined();
      expect(org.name).toBe('Test Organization');
      expect(org.id).toBeDefined();
      testOrgId = org.id;
      // Verify creator is auto-added as admin
      const memberships = await db.query.organizationMemberships.findMany({
        where: eq(organizationMemberships.orgId, testOrgId),
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0].userId).toBe(user1Id);
      expect(memberships[0].role).toBe('admin');
    });
    it('Step 2: Invite member via email', async () => {
      const invite = await organizationService.createInvite(
        testOrgId,
        'org-member@test.com', // invitedEmail
        user1Id // adminUserId (inviter)
      );
      expect(invite).toBeDefined();
      expect(invite.inviteId).toBeDefined();
      expect(invite.token).toBeDefined();
      inviteToken = invite.token;
      // Verify invite was created
      const dbInvite = await db.query.organizationInvites.findFirst({
        where: eq(organizationInvites.id, invite.inviteId),
      });
      expect(dbInvite).toBeDefined();
      expect(dbInvite?.orgId).toBe(testOrgId);
      expect(dbInvite?.invitedEmail).toBe('org-member@test.com');
      expect(dbInvite?.invitedByUserId).toBe(user1Id);
    });
    it('Step 3: Accept invite', async () => {
      const result = await organizationService.acceptInvite(inviteToken, user2Id);
      expect(result).toBeDefined();
      expect(result.orgId).toBe(testOrgId);
      // Verify membership was created
      const membership = await db.query.organizationMemberships.findFirst({
        where: and(
          eq(organizationMemberships.orgId, testOrgId),
          eq(organizationMemberships.userId, user2Id)
        ),
      });
      expect(membership).toBeDefined();
      expect(membership?.role).toBe('member');
      // Verify invite was accepted (status changed to 'accepted')
      const invite = await db.query.organizationInvites.findFirst({
        where: eq(organizationInvites.token, inviteToken),
      });
      expect(invite).toBeDefined();
      expect(invite?.status).toBe('accepted');
    });
    it('Step 4: Create workflow owned by user', async () => {
      const workflow = await workflowService.createWorkflow(
        {
          title: 'Test Workflow for Transfer',
          description: 'Will be transferred to org',
          creatorId: user1Id,
          ownerId: user1Id,
        },
        user1Id
      );
      expect(workflow).toBeDefined();
      expect(workflow.ownerType).toBe('user');
      expect(workflow.ownerUuid).toBe(user1Id);
      testWorkflowId = workflow.id;
    });
    it('Step 5: Transfer workflow to organization', async () => {
      const transferred = await workflowService.transferOwnership(
        testWorkflowId,
        user1Id,
        'org',
        testOrgId
      );
      expect(transferred).toBeDefined();
      expect(transferred.ownerType).toBe('org');
      expect(transferred.ownerUuid).toBe(testOrgId);
      // Verify in database
      const dbWorkflow = await db.query.workflows.findFirst({
        where: eq(workflows.id, testWorkflowId),
      });
      expect(dbWorkflow?.ownerType).toBe('org');
      expect(dbWorkflow?.ownerUuid).toBe(testOrgId);
    });
    it('Step 6: Org member (user2) can access workflow', async () => {
      // User2 is a member of the org, should be able to access
      const workflow = await workflowService.getWorkflowWithDetails(
        testWorkflowId,
        user2Id
      );
      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(testWorkflowId);
      expect(workflow.title).toBe('Test Workflow for Transfer');
    });
    it('Step 7: Org member (user2) can update workflow', async () => {
      // User2 should be able to update org-owned workflow
      const updated = await workflowService.updateWorkflow(
        testWorkflowId,
        user2Id,
        {
          description: 'Updated by org member',
        }
      );
      expect(updated).toBeDefined();
      expect(updated.description).toBe('Updated by org member');
    });
    it('Step 8: Org admin (user1) can still access workflow after transfer', async () => {
      // Original owner (now admin) should still have access
      const workflow = await workflowService.getWorkflowWithDetails(
        testWorkflowId,
        user1Id
      );
      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(testWorkflowId);
    });
    it('Step 9: Non-member (user3) CANNOT access org workflow', async () => {
      // User3 is not a member of the org
      await expect(
        workflowService.getWorkflowWithDetails(testWorkflowId, user3Id)
      ).rejects.toThrow(/Access denied|not found/i);
    });
    it('Step 10: Non-member (user3) CANNOT update org workflow', async () => {
      // User3 should not be able to update
      await expect(
        workflowService.updateWorkflow(testWorkflowId, user3Id, {
          description: 'Attempted unauthorized update',
        })
      ).rejects.toThrow(/Access denied|not found/i);
    });
    it('Step 11: Non-member (user3) CANNOT transfer org workflow', async () => {
      // User3 should not be able to transfer org workflow to themselves
      await expect(
        workflowService.transferOwnership(
          testWorkflowId,
          user3Id,
          'user',
          user3Id
        )
      ).rejects.toThrow(/Access denied|not found/i);
    });
    it('Step 12: Org member can see workflow in list', async () => {
      const workflows = await workflowService.listWorkflows(user2Id);
      expect(workflows).toBeDefined();
      expect(workflows.some((w) => w.id === testWorkflowId)).toBe(true);
    });
    it('Step 13: Non-member CANNOT see workflow in list', async () => {
      const workflows = await workflowService.listWorkflows(user3Id);
      expect(workflows).toBeDefined();
      expect(workflows.some((w) => w.id === testWorkflowId)).toBe(false);
    });
    it('Step 14: Remove member from org', async () => {
      await organizationService.removeMember(testOrgId, user2Id, user1Id);
      // Verify membership was removed
      const membership = await db.query.organizationMemberships.findFirst({
        where: and(
          eq(organizationMemberships.orgId, testOrgId),
          eq(organizationMemberships.userId, user2Id)
        ),
      });
      expect(membership).toBeUndefined();
    });
    it('Step 15: Removed member (user2) can no longer access workflow', async () => {
      // After removal, user2 should no longer have access
      await expect(
        workflowService.getWorkflowWithDetails(testWorkflowId, user2Id)
      ).rejects.toThrow(/Access denied|not found/i);
    });
    it('Step 16: Re-add member and verify access restored', async () => {
      // Add user2 back as member
      await organizationService.addMember(testOrgId, user2Id, user1Id, 'member');
      // Should have access again
      const workflow = await workflowService.getWorkflowWithDetails(
        testWorkflowId,
        user2Id
      );
      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(testWorkflowId);
    });
  });
  describe('Edge Cases and Security', () => {
    it('Cannot invite same email twice (pending invite exists)', async () => {
      // Create first invite
      const invite1 = await organizationService.createInvite(
        testOrgId,
        'duplicate@test.com', // invitedEmail
        user1Id // adminUserId
      );
      expect(invite1).toBeDefined();
      // Try to create second invite for same email
      await expect(
        organizationService.createInvite(
          testOrgId,
          'duplicate@test.com', // invitedEmail
          user1Id // adminUserId
        )
      ).rejects.toThrow(/already invited|pending invite/i);
      // Cleanup
      await db
        .delete(organizationInvites)
        .where(eq(organizationInvites.id, invite1.inviteId));
    });
    it('Cannot accept expired invite', async () => {
      // Create invite
      const invite = await organizationService.createInvite(
        testOrgId,
        'expired@test.com', // invitedEmail
        user1Id // adminUserId
      );
      // Manually expire it
      await db
        .update(organizationInvites)
        .set({ expiresAt: new Date(Date.now() - 1000) }) // 1 second ago
        .where(eq(organizationInvites.id, invite.inviteId));
      // Try to accept
      await expect(
        organizationService.acceptInvite(invite.token, user2Id)
      ).rejects.toThrow(/expired/i);
      // Cleanup
      await db
        .delete(organizationInvites)
        .where(eq(organizationInvites.id, invite.inviteId));
    });
    it('Cannot transfer workflow to org user is not a member of', async () => {
      // Create another org
      const org2 = await organizationService.createOrganization(
        {
          name: 'Other Organization',
        },
        user3Id
      );
      // User1 tries to transfer their workflow to org2 (not a member)
      await expect(
        workflowService.transferOwnership(
          testWorkflowId,
          user1Id,
          'org',
          org2.id
        )
      ).rejects.toThrow(/not a member/i);
      // Cleanup
      await db
        .delete(organizationMemberships)
        .where(eq(organizationMemberships.orgId, org2.id));
      await db.delete(organizations).where(eq(organizations.id, org2.id));
    });
    it('Member cannot promote themselves to admin', async () => {
      // User2 is a member, tries to promote themselves
      await expect(
        organizationService.promoteMember(testOrgId, user2Id, user2Id)
      ).rejects.toThrow(/admin only|not authorized|admin role required/i);
    });
    it('Member cannot remove admin', async () => {
      // User2 (member) tries to remove user1 (admin)
      await expect(
        organizationService.removeMember(testOrgId, user1Id, user2Id)
      ).rejects.toThrow(/admin only|not authorized|admin role required/i);
    });
    it('Only members can view organization details', async () => {
      // User3 (non-member) tries to view org
      await expect(
        organizationService.getOrganizationById(testOrgId, user3Id)
      ).rejects.toThrow(/Access denied|not found/i);
    });
    it('Only members can view organization members list', async () => {
      // User3 (non-member) tries to view members
      await expect(
        organizationService.getOrganizationMembers(testOrgId, user3Id)
      ).rejects.toThrow(/Access denied|not authorized/i);
    });
  });
});
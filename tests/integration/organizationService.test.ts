import { eq, sql } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { db } from '../../server/db';
import { organizationService } from '../../server/services/OrganizationService';
import { organizations, organizationMemberships, users, tenants } from '../../shared/schema';
/**
 * Tests for Organization Service (Integration)
 *
 * Verifies organization management functionality:
 * - Creating organizations
 * - Listing user organizations
 * - Updating organizations
 * - Managing memberships
 */
describe('OrganizationService Integration', () => {
    const testUserId1 = '00000000-0000-0000-0000-000000000011';
    const testUserId2 = '00000000-0000-0000-0000-000000000012';
    let testOrgId: string;
    // Setup test data
    beforeEach(async () => {
        // Determine a safe tenant name or ensure uniqueness if running parallel (though beforeEach runs per test)
        // Create a test tenant
        const [tenant] = await db.insert(tenants).values({
            name: 'Test Tenant Integration',
            plan: 'pro',
        }).returning();
        // Create test users with tenantId using upsert to guarantee state
        await db.insert(users).values([
            { id: testUserId1, email: 'orgtest1_int@test.com', fullName: 'Org Test User 1 Int', tenantId: tenant.id },
            { id: testUserId2, email: 'orgtest2_int@test.com', fullName: 'Org Test User 2 Int', tenantId: tenant.id },
        ]).onConflictDoUpdate({
            target: users.id,
            set: { tenantId: tenant.id }
        });
        // Verification check ensures DB state is correct before test proceeds
        try {
            await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tenant_id UUID`);
        } catch (e) {
            // Ignore
        }
        const userCheck = await db.query.users.findFirst({
            where: eq(users.id, testUserId1),
            columns: { id: true, tenantId: true }
        });
        if (!userCheck?.tenantId) {
            console.error('CRITICAL: User lookup failed validation in beforeEach:', userCheck);
            throw new Error(`Test setup failed: User ${testUserId1} missing tenantId`);
        }
    });
    // Cleanup test data
    afterEach(async () => {
        try {
            if (testOrgId) {
                // Delete memberships first (cascade should handle this, but be explicit)
                await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, testOrgId));
                // Delete organization
                await db.delete(organizations).where(eq(organizations.id, testOrgId));
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });
    describe('createOrganization', () => {
        it('should create organization and auto-create admin membership', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Test Org Int', description: 'Test Description Int' },
                testUserId1
            );
            expect(org).toBeDefined();
            expect(org.name).toBe('Test Org Int');
            expect(org.description).toBe('Test Description Int');
            expect(org.createdByUserId).toBe(testUserId1);
            testOrgId = org.id;
            // Verify admin membership was created
            const memberships = await db
                .select()
                .from(organizationMemberships)
                .where(eq(organizationMemberships.orgId, org.id));
            expect(memberships).toHaveLength(1);
            expect(memberships[0].userId).toBe(testUserId1);
            expect(memberships[0].role).toBe('admin');
        });
    });
    describe('getUserOrganizations', () => {
        it('should return all organizations for user', async () => {
            const org = await organizationService.createOrganization(
                { name: 'User Org Test Int' },
                testUserId1
            );
            testOrgId = org.id;
            const userOrgs = await organizationService.getUserOrganizations(testUserId1);
            expect(userOrgs.length).toBeGreaterThan(0);
            const foundOrg = userOrgs.find(o => o.id === org.id);
            expect(foundOrg).toBeDefined();
            expect(foundOrg?.role).toBe('admin');
        });
        it('should return empty array for user with no memberships', async () => {
            const userOrgs = await organizationService.getUserOrganizations('non-existent-user');
            expect(userOrgs).toHaveLength(0);
        });
    });
    describe('updateOrganization', () => {
        it('should allow admin to update organization', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Original Name Int' },
                testUserId1
            );
            testOrgId = org.id;
            const updated = await organizationService.updateOrganization(
                org.id,
                testUserId1,
                { name: 'Updated Name Int', description: 'New Description Int' }
            );
            expect(updated.name).toBe('Updated Name Int');
            expect(updated.description).toBe('New Description Int');
        });
        it('should deny non-admin from updating organization', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            // Add user2 as member (not admin)
            await db.insert(organizationMemberships).values({
                orgId: org.id,
                userId: testUserId2,
                role: 'member',
            });
            await expect(
                organizationService.updateOrganization(org.id, testUserId2, { name: 'Hacked Name' })
            ).rejects.toThrow('Access denied');
        });
    });
    describe('getOrganizationMembers', () => {
        it('should return all members of organization', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Members Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            // Add second member
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'member');
            const members = await organizationService.getOrganizationMembers(org.id, testUserId1);
            expect(members).toHaveLength(2);
            expect(members.find(m => m.userId === testUserId1)?.role).toBe('admin');
            expect(members.find(m => m.userId === testUserId2)?.role).toBe('member');
        });
    });
    describe('promoteMember', () => {
        it('should allow admin to promote member', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Promote Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'member');
            await organizationService.promoteMember(org.id, testUserId2, testUserId1);
            const members = await organizationService.getOrganizationMembers(org.id, testUserId1);
            const promotedMember = members.find(m => m.userId === testUserId2);
            expect(promotedMember?.role).toBe('admin');
        });
    });
    describe('demoteMember', () => {
        it('should allow admin to demote other admin', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Demote Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'admin');
            await organizationService.demoteMember(org.id, testUserId2, testUserId1);
            const members = await organizationService.getOrganizationMembers(org.id, testUserId1);
            const demotedMember = members.find(m => m.userId === testUserId2);
            expect(demotedMember?.role).toBe('member');
        });
        it('should prevent self-demotion', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Self Demote Test Int' },
                testUserId1
            );
            testOrgId = org.id;
            await expect(
                organizationService.demoteMember(org.id, testUserId1, testUserId1)
            ).rejects.toThrow('Cannot demote yourself');
        });
    });
    describe('removeMember', () => {
        it('should allow admin to remove member', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Remove Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'member');
            await organizationService.removeMember(org.id, testUserId2, testUserId1);
            const members = await organizationService.getOrganizationMembers(org.id, testUserId1);
            expect(members).toHaveLength(1);
            expect(members.find(m => m.userId === testUserId2)).toBeUndefined();
        });
        it('should prevent self-removal', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Self Remove Test Int' },
                testUserId1
            );
            testOrgId = org.id;
            await expect(
                organizationService.removeMember(org.id, testUserId1, testUserId1)
            ).rejects.toThrow('Cannot remove yourself');
        });
    });
    describe('leaveOrganization', () => {
        it('should allow member to leave organization', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Leave Test Org Int' },
                testUserId1
            );
            testOrgId = org.id;
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'member');
            await organizationService.leaveOrganization(org.id, testUserId2);
            const members = await organizationService.getOrganizationMembers(org.id, testUserId1);
            expect(members.find(m => m.userId === testUserId2)).toBeUndefined();
        });
        it('should allow admin to leave organization', async () => {
            const org = await organizationService.createOrganization(
                { name: 'Admin Leave Test Int' },
                testUserId1
            );
            testOrgId = org.id;
            // Add second admin
            await organizationService.addMember(org.id, testUserId2, testUserId1, 'admin');
            // First admin leaves
            await organizationService.leaveOrganization(org.id, testUserId1);
            const members = await organizationService.getOrganizationMembers(org.id, testUserId2);
            expect(members).toHaveLength(1);
            expect(members[0].userId).toBe(testUserId2);
        });
    });
});
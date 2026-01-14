import { eq, inArray, or } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { db } from '../../server/db';
import { organizationService } from '../../server/services/OrganizationService';
import { organizations, organizationMemberships, organizationInvites, users, tenants, auditLogs } from '../../shared/schema';

/**
 * Tests for Organization Invite System
 *
 * Verifies:
 * - Creating invites
 * - Placeholder user creation
 * - Invite acceptance
 * - Expiry enforcement
 */

describe('Organization Invites', () => {
    const adminUserId = '00000000-0000-0000-0000-000000000021';
    const existingUserId = '00000000-0000-0000-0000-000000000022';
    const newUserEmail = `newuser_${Date.now()}@test.com`;
    const existingUserEmail = `existing_${Date.now()}@test.com`;
    const testTenantId = '00000000-0000-0000-0000-000000000098';
    let testOrgId: string;
    let createdInviteId: string;

    // Setup test data
    beforeEach(async () => {
        // ... (lines 28-32 same)
        // Create test tenant
        await db.insert(tenants).values({
            id: testTenantId,
            name: 'Invite Test Tenant',
        }).onConflictDoNothing();

        // Create test users
        // Create test users (clean up first)
        await db.delete(auditLogs).where(
            or(
                eq(auditLogs.userId, adminUserId),
                eq(auditLogs.userId, existingUserId)
            )
        );
        await db.delete(users).where(inArray(users.id, [adminUserId, existingUserId]));

        await db.insert(users).values([
            { id: adminUserId, email: 'admin@test.com', fullName: 'Admin User', tenantId: testTenantId },
            { id: existingUserId, email: existingUserEmail, fullName: 'Existing User', tenantId: testTenantId },
        ]);


        // Create test organization
        const org = await organizationService.createOrganization(
            { name: 'Invite Test Org' },
            adminUserId
        );
        testOrgId = org.id;
    });

    // Cleanup test data
    afterEach(async () => {
        try {
            if (testOrgId) {
                // Delete invites
                await db.delete(organizationInvites).where(eq(organizationInvites.orgId, testOrgId));
                // Delete memberships
                await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, testOrgId));
                // Delete organization
                await db.delete(organizations).where(eq(organizations.id, testOrgId));
            }

            // Clean up placeholder users
            await db.delete(users).where(eq(users.email, newUserEmail));
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('createInvite', () => {
        it('should create placeholder user for non-existent email', async () => {
            const result = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            expect(result.inviteId).toBeDefined();
            expect(result.token).toBeDefined();

            // Verify placeholder user was created
            const placeholderUser = await db.query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(placeholderUser).toBeDefined();
            expect(placeholderUser?.isPlaceholder).toBe(true);
            expect(placeholderUser?.placeholderEmail).toBe(newUserEmail);
            expect(placeholderUser?.fullName).toBe(newUserEmail.split('@')[0]); // Email prefix

            createdInviteId = result.inviteId;
        });

        it('should create invite for existing user without creating placeholder', async () => {
            const result = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            expect(result.inviteId).toBeDefined();

            // Verify existing user was not modified
            const user = await db.query.users.findFirst({
                where: eq(users.email, existingUserEmail),
            });

            expect(user?.isPlaceholder).toBe(false);

            createdInviteId = result.inviteId;
        });

        it('should prevent duplicate pending invites', async () => {
            await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            await expect(
                organizationService.createInvite(testOrgId, newUserEmail, adminUserId)
            ).rejects.toThrow('Pending invite already exists');
        });

        it('should prevent inviting existing members', async () => {
            // Add user as member first
            await organizationService.addMember(testOrgId, existingUserId, adminUserId, 'member');

            await expect(
                organizationService.createInvite(testOrgId, existingUserEmail, adminUserId)
            ).rejects.toThrow('already a member');
        });

        it('should require admin access to create invite', async () => {
            await expect(
                organizationService.createInvite(testOrgId, newUserEmail, existingUserId)
            ).rejects.toThrow('Access denied');
        });

        it('should set expiry to 7 days from now', async () => {
            const beforeCreate = new Date();
            const result = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            const invite = await db.query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, result.inviteId),
            });

            expect(invite?.expiresAt).toBeDefined();
            if (invite?.expiresAt) {
                const expectedExpiry = new Date(beforeCreate);
                expectedExpiry.setDate(expectedExpiry.getDate() + 7);

                // Allow 1 minute variance for test execution time
                const timeDiff = Math.abs(invite.expiresAt.getTime() - expectedExpiry.getTime());
                expect(timeDiff).toBeLessThan(60000); // 1 minute in milliseconds
            }

            createdInviteId = result.inviteId;
        });
    });

    describe('acceptInvite', () => {
        it('should accept invite and create membership', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            const result = await organizationService.acceptInvite(inviteResult.token, existingUserId);

            expect(result.orgId).toBe(testOrgId);
            expect(result.orgName).toBe('Invite Test Org');

            // Verify membership was created
            const members = await organizationService.getOrganizationMembers(testOrgId, adminUserId);
            const newMember = members.find(m => m.userId === existingUserId);

            expect(newMember).toBeDefined();
            expect(newMember?.role).toBe('member');

            // Verify invite was marked as accepted
            const invite = await db.query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('accepted');
            expect(invite?.acceptedAt).toBeDefined();
        });

        it('should convert placeholder user to real user on accept', async () => {
            // Create invite for new user (creates placeholder)
            const inviteResult = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            // Get placeholder user
            const placeholderUser = await db.query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(placeholderUser?.isPlaceholder).toBe(true);

            // Accept invite as this user
            await organizationService.acceptInvite(inviteResult.token, placeholderUser!.id);

            // Verify user is no longer placeholder
            const updatedUser = await db.query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(updatedUser?.isPlaceholder).toBe(false);
            expect(updatedUser?.placeholderEmail).toBeNull();
        });

        it('should reject expired invite', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Manually expire the invite
            await db
                .update(organizationInvites)
                .set({ expiresAt: new Date(Date.now() - 1000) }) // 1 second ago
                .where(eq(organizationInvites.id, inviteResult.inviteId));

            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).rejects.toThrow('expired');

            // Verify invite was marked as expired
            const invite = await db.query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('expired');
        });

        it('should reject already accepted invite', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Accept once
            await organizationService.acceptInvite(inviteResult.token, existingUserId);

            // Try to accept again
            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).rejects.toThrow('already been accepted');
        });

        it('should verify email matches invite', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Try to accept with wrong user
            await expect(
                organizationService.acceptInvite(inviteResult.token, adminUserId)
            ).rejects.toThrow('does not match');
        });

        it('should reject invalid token', async () => {
            await expect(
                organizationService.acceptInvite('invalid-token', existingUserId)
            ).rejects.toThrow('not found');
        });
    });

    describe('getPendingInvitesForUser', () => {
        it('should return pending invites for user email', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            const invites = await organizationService.getPendingInvitesForUser(existingUserId);

            expect(invites).toHaveLength(1);
            expect(invites[0].orgName).toBe('Invite Test Org');
            expect(invites[0].token).toBe(inviteResult.token);

            createdInviteId = inviteResult.inviteId;
        });

        it('should not return expired invites', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Expire the invite
            await db
                .update(organizationInvites)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(organizationInvites.id, inviteResult.inviteId));

            const invites = await organizationService.getPendingInvitesForUser(existingUserId);

            expect(invites).toHaveLength(0);
        });

        it('should not return accepted invites', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.acceptInvite(inviteResult.token, existingUserId);

            const invites = await organizationService.getPendingInvitesForUser(existingUserId);

            expect(invites).toHaveLength(0);
        });
    });

    describe('revokeInvite', () => {
        it('should allow admin to revoke invite', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.revokeInvite(inviteResult.inviteId, adminUserId);

            const invite = await db.query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('revoked');
        });

        it('should prevent accepting revoked invite', async () => {
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.revokeInvite(inviteResult.inviteId, adminUserId);

            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).rejects.toThrow('revoked');
        });
    });
});

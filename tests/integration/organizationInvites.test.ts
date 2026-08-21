import { eq, inArray, or } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { organizationService } from '../../server/services/OrganizationService';
import { hashToken } from '../../server/utils/encryption';
import { enterTenantContextForTests } from '../../server/utils/rlsContext';
import { organizations, organizationMemberships, organizationInvites, users, tenants, auditLogs, passwordResetTokens } from '../../shared/schema';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

/**
 * Tests for Organization Invite System
 *
 * Verifies:
 * - Creating invites
 * - Placeholder user creation
 * - Invite acceptance
 * - Expiry enforcement
 *
 * RLS-2d: every call here goes straight to `organizationService`, with no
 * HTTP request and therefore no `rlsContext` middleware. `testTenantId` is a
 * fixed constant, so `enterTenantContextForTests(testTenantId)` covers the
 * `beforeEach` hook's own `createOrganization` call (binding immediately
 * after the tenant id is known covers the rest of that hook — see
 * `enterTenantContextForTests`'s doc comment) and is repeated at the top of
 * every `it` body, since a hook's binding does not propagate into the test
 * (AsyncLocalStorage.enterWith is scoped per vitest hook/test execution).
 */

describe('Organization Invites', () => {
    const adminUserId = '00000000-0000-0000-0000-000000000021';
    const existingUserId = '00000000-0000-0000-0000-000000000022';
    const newUserEmail = `newuser_${Date.now()}@test.com`;
    const existingUserEmail = `existing_${Date.now()}@test.com`;
    const testTenantId = '00000000-0000-0000-0000-000000000098';
    let testOrgId: string;


    // Setup test data
    beforeEach(async () => {
        enterTenantContextForTests(testTenantId);
        // ... (lines 28-32 same)
        // Create test tenant
        await getOwnerDb().insert(tenants).values({
            id: testTenantId,
            name: 'Invite Test Tenant',
        }).onConflictDoNothing();

        // Create test users
        // Create test users (clean up first)
        await getOwnerDb().delete(auditLogs).where(
            or(
                eq(auditLogs.userId, adminUserId),
                eq(auditLogs.userId, existingUserId)
            )
        );
        await getOwnerDb().delete(users).where(inArray(users.id, [adminUserId, existingUserId]));

        await getOwnerDb().insert(users).values([
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
                await getOwnerDb().delete(organizationInvites).where(eq(organizationInvites.orgId, testOrgId));
                // Delete memberships
                await getOwnerDb().delete(organizationMemberships).where(eq(organizationMemberships.orgId, testOrgId));
                // Delete organization
                await getOwnerDb().delete(organizations).where(eq(organizations.id, testOrgId));
            }

            // Clean up placeholder users
            await getOwnerDb().delete(users).where(eq(users.email, newUserEmail));
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('createInvite', () => {
        it('should create placeholder user for non-existent email', async () => {
            enterTenantContextForTests(testTenantId);
            const result = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            expect(result.inviteId).toBeDefined();
            expect(result.token).toBeDefined();

            // Verify placeholder user was created
            const placeholderUser = await getOwnerDb().query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(placeholderUser).toBeDefined();
            expect(placeholderUser?.isPlaceholder).toBe(true);
            expect(placeholderUser?.placeholderEmail).toBe(newUserEmail);
            expect(placeholderUser?.fullName).toBe(newUserEmail.split('@')[0]); // Email prefix

            const setupToken = await getOwnerDb().query.passwordResetTokens.findFirst({
                where: eq(passwordResetTokens.userId, placeholderUser!.id),
            });

            expect(setupToken).toMatchObject({ used: false });
            expect(setupToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());


        });

        it('should create invite for existing user without creating placeholder', async () => {
            enterTenantContextForTests(testTenantId);
            const result = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            expect(result.inviteId).toBeDefined();

            // Verify existing user was not modified
            const user = await getOwnerDb().query.users.findFirst({
                where: eq(users.email, existingUserEmail),
            });

            expect(user?.isPlaceholder).toBe(false);


        });

        it('should prevent duplicate pending invites', async () => {
            enterTenantContextForTests(testTenantId);
            await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            await expect(
                organizationService.createInvite(testOrgId, newUserEmail, adminUserId)
            ).rejects.toThrow('Pending invite already exists');
        });

        it('should prevent inviting existing members', async () => {
            enterTenantContextForTests(testTenantId);
            // Add user as member first
            await organizationService.addMember(testOrgId, existingUserId, adminUserId, 'member');

            await expect(
                organizationService.createInvite(testOrgId, existingUserEmail, adminUserId)
            ).rejects.toThrow('already a member');
        });

        it('should require admin access to create invite', async () => {
            enterTenantContextForTests(testTenantId);
            await expect(
                organizationService.createInvite(testOrgId, newUserEmail, existingUserId)
            ).rejects.toThrow('Access denied');
        });

        it('should set expiry to 7 days from now', async () => {
            enterTenantContextForTests(testTenantId);
            const beforeCreate = new Date();
            const result = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            const invite = await getOwnerDb().query.organizationInvites.findFirst({
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


        });
    });

    describe('acceptInvite', () => {
        it('should accept invite and create membership', async () => {
            enterTenantContextForTests(testTenantId);
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
            const invite = await getOwnerDb().query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('accepted');
            expect(invite?.acceptedAt).toBeDefined();
        });

        it('should convert placeholder user to real user on accept', async () => {
            enterTenantContextForTests(testTenantId);
            // Create invite for new user (creates placeholder)
            const inviteResult = await organizationService.createInvite(testOrgId, newUserEmail, adminUserId);

            // Get placeholder user
            const placeholderUser = await getOwnerDb().query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(placeholderUser?.isPlaceholder).toBe(true);

            // Accept invite as this user
            await organizationService.acceptInvite(inviteResult.token, placeholderUser!.id);

            // Verify user is no longer placeholder
            const updatedUser = await getOwnerDb().query.users.findFirst({
                where: eq(users.email, newUserEmail),
            });

            expect(updatedUser?.isPlaceholder).toBe(false);
            expect(updatedUser?.placeholderEmail).toBeNull();
        });

        it('should reject expired invite', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Manually expire the invite
            await getOwnerDb()
                .update(organizationInvites)
                .set({ expiresAt: new Date(Date.now() - 1000) }) // 1 second ago
                .where(eq(organizationInvites.id, inviteResult.inviteId));

            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).rejects.toThrow('expired');

            // Verify invite was marked as expired
            const invite = await getOwnerDb().query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('expired');
        });

        it('should handle an already accepted invite idempotently', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Accept once
            await organizationService.acceptInvite(inviteResult.token, existingUserId);

            // A browser retry should report the same successful result without
            // creating a duplicate membership.
            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).resolves.toEqual({ orgId: testOrgId, orgName: 'Invite Test Org' });

            const memberships = await getOwnerDb()
                .select()
                .from(organizationMemberships)
                .where(eq(organizationMemberships.userId, existingUserId));

            expect(memberships).toHaveLength(1);
        });

        it('should verify email matches invite', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Try to accept with wrong user
            const acceptance = organizationService.acceptInvite(inviteResult.token, adminUserId);

            await expect(acceptance).rejects.toMatchObject({
                message: 'This invitation belongs to a different account. Sign in with the email address that received it.',
                statusCode: 403,
            });
        });

        it('should reconcile a pending invite when membership already exists', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.addMember(
                testOrgId,
                existingUserId,
                adminUserId,
                'member'
            );

            await expect(
                organizationService.acceptInvite(inviteResult.token, existingUserId)
            ).resolves.toEqual({ orgId: testOrgId, orgName: 'Invite Test Org' });

            const invite = await getOwnerDb().query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });
            const memberships = await getOwnerDb()
                .select()
                .from(organizationMemberships)
                .where(eq(organizationMemberships.userId, existingUserId));

            expect(invite?.status).toBe('accepted');
            expect(memberships).toHaveLength(1);
        });

        it('should reject invalid token', async () => {
            enterTenantContextForTests(testTenantId);
            await expect(
                organizationService.acceptInvite('invalid-token', existingUserId)
            ).rejects.toThrow('not found');
        });
    });

    describe('getPendingInvitesForUser', () => {
        it('should return pending invites for user email', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            const invites = await organizationService.getPendingInvitesForUser(existingUserId);

            expect(invites).toHaveLength(1);
            expect(invites[0].orgName).toBe('Invite Test Org');
            // Invite tokens are stored hashed; the raw token is only returned once at creation.
            expect(invites[0].token).toBe(hashToken(inviteResult.token));


        });

        it('should not return expired invites', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            // Expire the invite
            await getOwnerDb()
                .update(organizationInvites)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(organizationInvites.id, inviteResult.inviteId));

            const invites = await organizationService.getPendingInvitesForUser(existingUserId);

            expect(invites).toHaveLength(0);
        });

        it('should not return accepted invites', async () => {
            enterTenantContextForTests(testTenantId);
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
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.revokeInvite(inviteResult.inviteId, adminUserId);

            const invite = await getOwnerDb().query.organizationInvites.findFirst({
                where: eq(organizationInvites.id, inviteResult.inviteId),
            });

            expect(invite?.status).toBe('revoked');
        });

        it('should prevent accepting revoked invite', async () => {
            enterTenantContextForTests(testTenantId);
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

    describe('getOrganizationInvites', () => {
        it('should return pending invites for organization', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            const invites = await organizationService.getOrganizationInvites(testOrgId, adminUserId);

            expect(invites).toHaveLength(1);
            expect(invites[0].inviteId).toBe(inviteResult.inviteId);
            expect(invites[0].invitedEmail).toBe(existingUserEmail);
            expect(invites[0].status).toBe('pending');
            expect(invites[0].invitedByEmail).toBe('admin@test.com');
        });

        it('should not return accepted invites', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.acceptInvite(inviteResult.token, existingUserId);

            const invites = await organizationService.getOrganizationInvites(testOrgId, adminUserId);

            expect(invites).toHaveLength(0);
        });

        it('should not return expired invites', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await getOwnerDb()
                .update(organizationInvites)
                .set({ status: 'expired' })
                .where(eq(organizationInvites.id, inviteResult.inviteId));

            const invites = await organizationService.getOrganizationInvites(testOrgId, adminUserId);

            expect(invites).toHaveLength(0);
        });

        it('should not return revoked invites', async () => {
            enterTenantContextForTests(testTenantId);
            const inviteResult = await organizationService.createInvite(
                testOrgId,
                existingUserEmail,
                adminUserId
            );

            await organizationService.revokeInvite(inviteResult.inviteId, adminUserId);

            const invites = await organizationService.getOrganizationInvites(testOrgId, adminUserId);

            expect(invites).toHaveLength(0);
        });

        it('should require admin access to get organization invites', async () => {
            enterTenantContextForTests(testTenantId);
            await expect(
                organizationService.getOrganizationInvites(testOrgId, existingUserId)
            ).rejects.toThrow('Access denied');
        });
    });
});


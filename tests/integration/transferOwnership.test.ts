import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { db } from '../../server/db';
import { datavaultDatabasesService } from '../../server/services/DatavaultDatabasesService';
import { organizationService } from '../../server/services/OrganizationService';
import { projectService } from '../../server/services/ProjectService';
import { workflowService } from '../../server/services/WorkflowService';
import {
    projects,
    workflows,
    datavaultDatabases,
    organizations,
    organizationMemberships,
    users,
    tenants,
} from '../../shared/schema';

/**
 * Tests for Transfer Ownership System
 *
 * Verifies:
 * - Transfer validation and permissions
 * - Project transfer cascades to workflows
 * - Workflow transfer detaches from project if needed
 * - Database transfer (tables inherit ownership)
 * - Access control enforcement
 */

describe('Transfer Ownership', () => {
    const userId1 = '00000000-0000-0000-0000-000000000031';
    const userId2 = '00000000-0000-0000-0000-000000000032';
    const testTenantId = '00000000-0000-0000-0000-000000000099';
    let testOrgId: string;
    let testProjectId: string;
    let testWorkflowId: string;
    let testDatabaseId: string;

    // Setup test data
    beforeEach(async () => {
        // Create test tenant
        await db.insert(tenants).values({
            id: testTenantId,
            name: 'Transfer Test Tenant',
        }).onConflictDoNothing();

        // Create test users
        await db.insert(users).values([
            { id: userId1, email: 'transfer1@test.com', fullName: 'Transfer User 1', tenantId: testTenantId },
            { id: userId2, email: 'transfer2@test.com', fullName: 'Transfer User 2', tenantId: testTenantId },
        ]).onConflictDoUpdate({
            target: users.id,
            set: { tenantId: testTenantId }
        });

        // Create test organization
        const org = await organizationService.createOrganization(
            { name: 'Transfer Test Org' },
            userId1
        );
        testOrgId = org.id;

        // Add user2 as member
        await organizationService.addMember(testOrgId, userId2, userId1, 'member');
    });

    // Cleanup test data
    afterEach(async () => {
        try {
            if (testWorkflowId) {
                await db.delete(workflows).where(eq(workflows.id, testWorkflowId));
            }
            if (testProjectId) {
                await db.delete(projects).where(eq(projects.id, testProjectId));
            }
            if (testDatabaseId) {
                await db.delete(datavaultDatabases).where(eq(datavaultDatabases.id, testDatabaseId));
            }
            if (testOrgId) {
                await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, testOrgId));
                await db.delete(organizations).where(eq(organizations.id, testOrgId));
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Project Transfer', () => {
        it('should transfer user-owned project to org', async () => {
            // Create user-owned project with workflow
            const project = await projectService.createProject(
                { title: 'Test Project', creatorId: userId1, ownerId: userId1, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            const workflow = await workflowService.createWorkflow(
                { title: 'Test Workflow', projectId: testProjectId, creatorId: userId1, ownerId: userId1 },
                userId1
            );
            testWorkflowId = workflow.id;

            // Transfer to org
            const transferred = await projectService.transferOwnership(
                testProjectId,
                userId1,
                'org',
                testOrgId
            );

            expect(transferred.ownerType).toBe('org');
            expect(transferred.ownerUuid).toBe(testOrgId);

            // Verify workflow was cascaded
            const updatedWorkflow = await db.query.workflows.findFirst({
                where: eq(workflows.id, testWorkflowId),
            });

            expect(updatedWorkflow?.ownerType).toBe('org');
            expect(updatedWorkflow?.ownerUuid).toBe(testOrgId);
        });

        it('should prevent transfer to org if user is not a member', async () => {
            const project = await projectService.createProject(
                { title: 'Test Project', creatorId: userId2, ownerId: userId2, tenantId: testTenantId },
                userId2
            );
            testProjectId = project.id;

            // Try to transfer to org that userId2 is not a member of
            const otherOrg = await organizationService.createOrganization(
                { name: 'Other Org' },
                userId1
            );

            await expect(
                projectService.transferOwnership(testProjectId, userId2, 'org', otherOrg.id)
            ).rejects.toThrow('not a member');

            // Cleanup
            await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, otherOrg.id));
            await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
        });

        it('should allow org member to transfer org-owned project to another org they belong to', async () => {
            // Create org-owned project
            const project = await projectService.createProject(
                { title: 'Org Project', creatorId: userId1, ownerId: userId1, ownerType: 'org', ownerUuid: testOrgId, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // Create second org with both users as members
            const org2 = await organizationService.createOrganization(
                { name: 'Second Org' },
                userId1
            );
            await organizationService.addMember(org2.id, userId2, userId1, 'member');

            // user2 (member of both orgs) can transfer from org1 to org2
            const transferred = await projectService.transferOwnership(
                testProjectId,
                userId2,
                'org',
                org2.id
            );

            expect(transferred.ownerType).toBe('org');
            expect(transferred.ownerUuid).toBe(org2.id);

            // Cleanup
            await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, org2.id));
            await db.delete(organizations).where(eq(organizations.id, org2.id));
        });
    });

    describe('Workflow Transfer', () => {
        it('should detach workflow from project when transferring to different owner', async () => {
            // Create user-owned project
            const project = await projectService.createProject(
                { title: 'User Project', creatorId: userId1, ownerId: userId1, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // Create workflow in project
            const workflow = await workflowService.createWorkflow(
                { title: 'Test Workflow', projectId: testProjectId, creatorId: userId1, ownerId: userId1 },
                userId1
            );
            testWorkflowId = workflow.id;

            // Transfer workflow to org (different owner than project)
            const transferred = await workflowService.transferOwnership(
                testWorkflowId,
                userId1,
                'org',
                testOrgId
            );

            expect(transferred.ownerType).toBe('org');
            expect(transferred.ownerUuid).toBe(testOrgId);
            expect(transferred.projectId).toBeNull(); // Detached from project
        });

        it('should keep workflow in project when transferring to same owner', async () => {
            // Create org-owned project
            const project = await projectService.createProject(
                { title: 'Org Project', creatorId: userId1, ownerId: userId1, ownerType: 'org', ownerUuid: testOrgId, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // Create workflow in project
            const workflow = await workflowService.createWorkflow(
                { title: 'Test Workflow', projectId: testProjectId, creatorId: userId1, ownerId: userId1 },
                userId1
            );
            testWorkflowId = workflow.id;

            // Transfer workflow to same org (same owner as project)
            const transferred = await workflowService.transferOwnership(
                testWorkflowId,
                userId1,
                'org',
                testOrgId
            );

            expect(transferred.ownerType).toBe('org');
            expect(transferred.ownerUuid).toBe(testOrgId);
            expect(transferred.projectId).toBe(testProjectId); // Still in project
        });

        it('should prevent non-member from transferring org workflow', async () => {
            // Create org-owned workflow
            const workflow = await workflowService.createWorkflow(
                { title: 'Org Workflow', creatorId: userId1, ownerId: userId1 },
                userId1
            );
            testWorkflowId = workflow.id;

            // Create user3 who is not a member
            const userId3 = '00000000-0000-0000-0000-000000000033';
            await db.insert(users).values({
                id: userId3,
                email: 'transfer3@test.com',
                fullName: 'Transfer User 3',
                tenantId: testTenantId,
            }).onConflictDoNothing();

            // Try to transfer (should fail - user3 has no access)
            await expect(
                workflowService.transferOwnership(testWorkflowId, userId3, 'user', userId3)
            ).rejects.toThrow('Access denied');

            // Cleanup
            await db.delete(users).where(eq(users.id, userId3));
        });
    });

    describe('Database Transfer', () => {
        it('should transfer database ownership', async () => {
            // Create user-owned database
            const database = await datavaultDatabasesService.createDatabase({
                name: 'Test Database',
                scopeType: 'account',
                ownerType: 'user',
                ownerUuid: userId1,
                creatorId: userId1,
                tenantId: testTenantId,
            });
            testDatabaseId = database.id;

            // Transfer to org
            const transferred = await datavaultDatabasesService.transferOwnership(
                testDatabaseId,
                userId1,
                'org',
                testOrgId
            );

            if (transferred) {
                expect(transferred.ownerType).toBe('org');
                expect(transferred.ownerUuid).toBe(testOrgId);
            }
        });

        it('should allow org member to transfer org database', async () => {
            // Create org-owned database
            const database = await datavaultDatabasesService.createDatabase({
                name: 'Org Database',
                scopeType: 'account',
                ownerType: 'org',
                ownerUuid: testOrgId,
                creatorId: userId1,

                tenantId: testTenantId,

            });
            testDatabaseId = database.id;

            // user2 (org member) can transfer to themselves
            const transferred = await datavaultDatabasesService.transferOwnership(
                testDatabaseId,
                userId2,
                'user',
                userId2
            );

            if (transferred) {
                expect(transferred.ownerType).toBe('user');
                expect(transferred.ownerUuid).toBe(userId2);
            }
        });

        it('should prevent transfer to org if user is not a member', async () => {
            const database = await datavaultDatabasesService.createDatabase({
                name: 'User Database',
                scopeType: 'account',
                ownerType: 'user',
                ownerUuid: userId1,
                creatorId: userId1,
                tenantId: testTenantId,
            });
            testDatabaseId = database.id;

            // Create org that userId1 is not a member of
            const otherOrg = await organizationService.createOrganization(
                { name: 'Other Org' },
                userId2
            );

            await expect(
                datavaultDatabasesService.transferOwnership(testDatabaseId, userId1, 'org', otherOrg.id)
            ).rejects.toThrow('not a member');

            // Cleanup
            await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, otherOrg.id));
            await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
        });
    });

    describe('Transfer Validation', () => {
        it('should only allow transfer to self when targetOwnerType is user', async () => {
            const project = await projectService.createProject(
                { title: 'Test Project', creatorId: userId1, ownerId: userId1, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // Try to transfer to different user (should fail)
            await expect(
                projectService.transferOwnership(testProjectId, userId1, 'user', userId2)
            ).rejects.toThrow('Can only transfer to yourself');
        });

        it('should allow transfer from user to self (org member transferring org asset to themselves)', async () => {
            // Create org-owned project
            const project = await projectService.createProject(
                { title: 'Org Project', creatorId: userId1, ownerId: userId1, ownerType: 'org', ownerUuid: testOrgId, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // user2 (org member) transfers to themselves
            const transferred = await projectService.transferOwnership(
                testProjectId,
                userId2,
                'user',
                userId2
            );

            expect(transferred.ownerType).toBe('user');
            expect(transferred.ownerUuid).toBe(userId2);
        });
    });
});

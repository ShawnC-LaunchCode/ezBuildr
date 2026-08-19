import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { db } from '../../server/db';
import { workflowRepository } from '../../server/repositories';
import { datavaultDatabasesService } from '../../server/services/DatavaultDatabasesService';
import { organizationService } from '../../server/services/OrganizationService';
import { projectService } from '../../server/services/ProjectService';
import { workflowService } from '../../server/services/WorkflowService';
import { enterTenantContextForTests, runWithTenantContext } from '../../server/utils/rlsContext';
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

    // Setup test data.
    // RLS-2d: OrganizationService and ProjectService now open a
    // service-boundary tenant transaction (withCurrentTenant), which reads
    // the tenant from the request's async context. These tests call the
    // services directly (no HTTP request, no hybridAuth) — exactly like the
    // Database Transfer section below already handles for
    // DatavaultDatabasesService (RLS-2b) — so they must open that context
    // themselves. `enterTenantContextForTests` covers the rest of THIS hook;
    // it does not propagate into the `it` bodies below (measured, not
    // assumed — AsyncLocalStorage.enterWith is scoped per vitest hook/test),
    // so each of those binds it again.
    beforeEach(async () => {
        enterTenantContextForTests(testTenantId);
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
            enterTenantContextForTests(testTenantId);
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

        it('should roll back the entire cascade if a failure occurs mid-transfer (atomicity)', async () => {
            enterTenantContextForTests(testTenantId);
            // Create user-owned project with a workflow, so the cascade has
            // more than one table to touch.
            const project = await projectService.createProject(
                { title: 'Atomicity Test Project', creatorId: userId1, ownerId: userId1, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;
            expect(project.ownerType).toBe('user');
            expect(project.ownerUuid).toBe(userId1);

            const workflow = await workflowService.createWorkflow(
                { title: 'Atomicity Test Workflow', projectId: testProjectId, creatorId: userId1, ownerId: userId1 },
                userId1
            );
            testWorkflowId = workflow.id;

            // Force a failure partway through the cascade: the project row
            // update happens first inside the transaction, and
            // workflowRepo.findByProjectId is the very next query. Throwing
            // there simulates a failure "mid-cascade" — after the project
            // write has been issued but before workflows/runs/DataVault
            // assets are touched.
            const findByProjectIdSpy = vi
                .spyOn(workflowRepository, 'findByProjectId')
                .mockRejectedValueOnce(new Error('Injected failure for atomicity test'));

            try {
                await expect(
                    projectService.transferOwnership(testProjectId, userId1, 'org', testOrgId)
                ).rejects.toThrow('Injected failure for atomicity test');
            } finally {
                findByProjectIdSpy.mockRestore();
            }

            // If the cascade were not atomic, the project row update (which
            // runs before the injected failure) would have committed on its
            // own. Assert it did NOT: ownerType/ownerUuid must be exactly as
            // they were before the failed transfer attempt.
            const projectAfterFailure = await db.query.projects.findFirst({
                where: eq(projects.id, testProjectId),
            });
            expect(projectAfterFailure?.ownerType).toBe('user');
            expect(projectAfterFailure?.ownerUuid).toBe(userId1);

            // The workflow cascade never got its own failure, but since it
            // lives in the same rolled-back transaction it must also be
            // untouched.
            const workflowAfterFailure = await db.query.workflows.findFirst({
                where: eq(workflows.id, testWorkflowId),
            });
            expect(workflowAfterFailure?.ownerType).toBe('user');
            expect(workflowAfterFailure?.ownerUuid).toBe(userId1);
        });

        it('should prevent transfer into an org when the user is not an org admin', async () => {
            enterTenantContextForTests(testTenantId);
            const project = await projectService.createProject(
                { title: 'Test Project', creatorId: userId2, ownerId: userId2, tenantId: testTenantId },
                userId2
            );
            testProjectId = project.id;

            // Try to transfer into an org that userId2 does not administer.
            // Transferring assets INTO an org requires org-admin (members use copy instead).
            const otherOrg = await organizationService.createOrganization(
                { name: 'Other Org' },
                userId1
            );

            await expect(
                projectService.transferOwnership(testProjectId, userId2, 'org', otherOrg.id)
            ).rejects.toThrow(/organization admin/i);

            // Cleanup
            await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, otherOrg.id));
            await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
        });

        it('should prevent org member without owner role from transferring org-owned project', async () => {
            enterTenantContextForTests(testTenantId);
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

            // user2 can view org assets as a member, but cannot transfer org-owned projects.
            await expect(
                projectService.transferOwnership(
                    testProjectId,
                    userId2,
                    'org',
                    org2.id
                )
            ).rejects.toThrow(/Access denied|insufficient permissions|admin role required/i);

            // Cleanup
            await db.delete(organizationMemberships).where(eq(organizationMemberships.orgId, org2.id));
            await db.delete(organizations).where(eq(organizations.id, org2.id));
        });
    });

    describe('Workflow Transfer', () => {
        it('should detach workflow from project when transferring to different owner', async () => {
            enterTenantContextForTests(testTenantId);
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
            enterTenantContextForTests(testTenantId);
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
        // RLS-2b: DatavaultDatabasesService now opens a service-boundary
        // tenant transaction (withCurrentTenant), which reads the tenant from
        // the request's async context. These tests call the service directly
        // (no HTTP request, no hybridAuth), so — exactly like RLS-2a's
        // collections.e2e.test.ts — they must open that context themselves
        // via runWithTenantContext to stand in for the middleware a direct
        // service call doesn't get.
        it('should transfer database ownership', async () => {
            await runWithTenantContext(testTenantId, async () => {
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
        });

        it('should allow an org admin to transfer an org database out', async () => {
            await runWithTenantContext(testTenantId, async () => {
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

                // userId1 is the org admin; admins may transfer org assets out (to themselves).
                const transferred = await datavaultDatabasesService.transferOwnership(
                    testDatabaseId,
                    userId1,
                    'user',
                    userId1
                );

                if (transferred) {
                    expect(transferred.ownerType).toBe('user');
                    expect(transferred.ownerUuid).toBe(userId1);
                }
            });
        });

        it('should prevent an org member (non-admin) from transferring an org database out', async () => {
            await runWithTenantContext(testTenantId, async () => {
                // Create org-owned database; userId2 is only a member.
                const database = await datavaultDatabasesService.createDatabase({
                    name: 'Org Database (member)',
                    scopeType: 'account',
                    ownerType: 'org',
                    ownerUuid: testOrgId,
                    creatorId: userId1,
                    tenantId: testTenantId,
                });
                testDatabaseId = database.id;

                // Transferring an org asset OUT requires org-admin; members must copy instead.
                await expect(
                    datavaultDatabasesService.transferOwnership(testDatabaseId, userId2, 'user', userId2)
                ).rejects.toThrow(/organization admin/i);
            });
        });
    });

    describe('Transfer Validation', () => {
        it('should only allow transfer to self when targetOwnerType is user', async () => {
            enterTenantContextForTests(testTenantId);
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

        it('should prevent org member without owner role from transferring org asset to themselves', async () => {
            enterTenantContextForTests(testTenantId);
            // Create org-owned project
            const project = await projectService.createProject(
                { title: 'Org Project', creatorId: userId1, ownerId: userId1, ownerType: 'org', ownerUuid: testOrgId, tenantId: testTenantId },
                userId1
            );
            testProjectId = project.id;

            // user2 can view org assets as a member, but cannot claim ownership.
            await expect(
                projectService.transferOwnership(
                    testProjectId,
                    userId2,
                    'user',
                    userId2
                )
            ).rejects.toThrow(/Access denied|insufficient permissions/i);
        });
    });
});

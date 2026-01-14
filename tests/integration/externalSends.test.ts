
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';

import {
    tenants, projects, workflows, sections, steps, blocks,
    users, workspaces, externalDestinations, workflowVersions,
    type InsertTenant, type InsertProject, type InsertWorkflow,
    type InsertSection, type InsertStep, type InsertBlock, type InsertExternalDestination
} from '@shared/schema';

import { db } from '../../server/db';
import { runExecutionCoordinator, type ExecutionContext } from '../../server/services/runs/RunExecutionCoordinator';
import { runPersistenceWriter } from '../../server/services/runs/RunPersistenceWriter';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('External Send Block Integration', () => {
    let tenantId: string;
    let userId: string;
    let projectId: string;
    let workflowId: string;
    let workflowVersionId: string;
    let sectionId: string;
    let destinationId: string;
    let workspaceId: string;

    const testUrl = 'https://example.com/webhook';

    beforeAll(async () => {
        // 1. Setup Tenant & User
        const [tenant] = await db.insert(tenants).values({ name: 'External Send Tenant', slug: `ext-tenant-${Date.now()}` } as any).returning();
        tenantId = tenant.id;

        const [user] = await db.insert(users).values({
            id: uuidv4(),
            email: `ext-test-${Date.now()}@example.com`,
            tenantId,
            name: 'Tester',
            authProvider: 'local', // Must be 'local' or 'google'
            role: 'admin',
            tenantRole: 'owner'
        } as any).returning();
        userId = user.id;

        // 2. Setup Workspace (required)
        try {
            const [ws] = await db.insert(workspaces as any).values({
                title: 'Test Workspace',
                tenantId
            } as any).returning() as any[];
            workspaceId = ws.id;
        } catch (e) {
            workspaceId = uuidv4(); // Dummy
        }

        // 3. Setup Project
        const [project] = await db.insert(projects).values({
            name: 'External Send Project',
            title: 'Ex Send',
            tenantId,
            workspaceId, // Might be required
            creatorId: userId,
            ownerId: userId
        } as any).returning();
        projectId = project.id;
    });

    afterAll(async () => {
        if (tenantId) {
            // Clean up projects first to allow tenant delete if cascades are tricky
            await db.delete(projects).where(eq(projects.tenantId, tenantId));
            await db.delete(tenants).where(eq(tenants.id, tenantId));
        }
    });

    beforeEach(async () => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ status: 'received' })
        });

        // 4. Setup Workflow & Version & Section
        const [workflow] = await db.insert(workflows).values({
            projectId,
            title: 'Send Workflow',
            creatorId: userId,
            ownerId: userId,
            version: 1
        } as any).returning();
        workflowId = workflow.id;

        const [version] = await db.insert(workflowVersions).values({
            workflowId,
            versionNumber: 1,
            graphJson: {},
            createdBy: userId,
            published: true
        } as any).returning();
        workflowVersionId = version.id;

        // Update workflow current version
        await db.update(workflows).set({ currentVersionId: workflowVersionId }).where(eq(workflows.id, workflowId));

        const [section] = await db.insert(sections).values({
            workflowId,
            title: 'Send Section',
            order: 0
        } as any).returning();
        sectionId = section.id;

        // 5. Setup External Destination
        const [dest] = await db.insert(externalDestinations).values({
            tenantId,
            type: 'webhook',
            name: 'Test Webhook',
            config: { url: testUrl, method: 'POST' }
        } as any).returning();
        destinationId = dest.id;
    });

    it('PREVIEW MODE: Should simulate send and NOT call fetch', async () => {
        // 1. Create Input Step
        const inputStepId = uuidv4();
        await db.insert(steps).values({
            id: inputStepId,
            sectionId,
            type: 'short_text',
            title: 'Input',
            order: 0
        } as any);

        // 2. Create External Send Block
        const blockId = uuidv4();
        await db.insert(blocks).values({
            id: blockId,
            workflowId,
            sectionId,
            type: 'external_send',
            phase: 'onSectionSubmit',
            config: {
                destinationId,
                payloadMappings: [ // Matches corrected types
                    { key: 'message', value: inputStepId }
                ]
            },
            order: 1
        } as any);

        // 3. Create Run & Submit (PREVIEW)
        const runId = uuidv4();
        await runPersistenceWriter.createRun({
            id: runId,
            workflowId,
            workflowVersionId,
            createdBy: userId,
            completed: false,
            status: 'pending',
            runToken: uuidv4() // Add runToken
        } as any);

        const context: ExecutionContext = {
            workflowId,
            runId,
            userId,
            mode: 'preview' // Enforce Preview
        };

        const result = await runExecutionCoordinator.submitSection(
            context,
            sectionId,
            [{ stepId: inputStepId, value: 'Hello Preview' }]
        );

        expect(result.success).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled(); // Verify simulation
    });

    it('LIVE MODE: Should call fetch with mapped payload', async () => {
        // 1. Create Input Step
        const inputStepId = uuidv4();
        await db.insert(steps).values({
            id: inputStepId,
            sectionId,
            type: 'short_text',
            title: 'Input',
            order: 0
        } as any);

        // 2. Create External Send Block
        const blockId = uuidv4();
        await db.insert(blocks).values({
            id: blockId,
            workflowId,
            sectionId,
            type: 'external_send',
            phase: 'onSectionSubmit',
            config: {
                destinationId,
                payloadMappings: [
                    { key: 'remote_msg', value: inputStepId }
                ]
            },
            order: 1
        } as any);

        // 3. Create Run & Submit (LIVE)
        const runId = uuidv4();
        await runPersistenceWriter.createRun({
            id: runId,
            workflowId,
            workflowVersionId,
            createdBy: userId,
            completed: false,
            status: 'pending',
            runToken: uuidv4() // Add runToken
        } as any);

        const context: ExecutionContext = {
            workflowId,
            runId,
            userId,
            mode: 'live'
        };

        const result = await runExecutionCoordinator.submitSection(
            context,
            sectionId,
            [{ stepId: inputStepId, value: 'Hello Live' }]
        );

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(testUrl);
        expect(options.method).toBe('POST');

        const body = JSON.parse(options.body);
        expect(body).toEqual({
            remote_msg: 'Hello Live'
        });
    });
});

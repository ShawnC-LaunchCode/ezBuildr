import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { users, tenants } from '@shared/schema';
import type { ChoiceAdvancedConfig } from '@shared/types/stepConfigs';
import { db } from '../../server/db';
import { sectionRepository } from '../../server/repositories';
import { readTableBlockService } from '../../server/services/ReadTableBlockService';
import { stepService } from '../../server/services/StepService';
import { workflowService } from '../../server/services/WorkflowService';
describe('Dynamic Options Integration Flow', () => {
    let userId: string;
    let tenantId: string;
    let workflowId: string;
    let sectionId: string;
    beforeAll(async () => {
        // Setup Tenant & User
        const [tenant] = await db.insert(tenants).values({
            name: 'Integration Test Tenant',
            slug: `test-tenant-${uuidv4()}`,
        } as any).returning();
        tenantId = tenant.id;
        const [user] = await db.insert(users).values({
            email: `test-${uuidv4()}@example.com`,
            firstName: 'Test',
            lastName: 'User',
            tenantId: tenant.id,
            passwordHash: 'hash',
            role: 'admin',
        } as any).returning();
        userId = user.id;
        // Create Workflow
        const workflow = await workflowService.createWorkflow({
            title: 'Dynamic Options Test',
            description: 'Testing read -> choice flow',
        } as any, userId);
        workflowId = workflow.id;
        // Get default section
        const sections = await sectionRepository.findByWorkflowId(workflowId);
        sectionId = sections[0].id;
    });
    afterAll(async () => {
        // Cleanup
        if (workflowId) {await workflowService.deleteWorkflow(workflowId, userId);}
        if (userId) {await db.delete(users).where(eq(users.id, userId));}
        if (tenantId) {await db.delete(tenants).where(eq(tenants.id, tenantId));}
    });
    it('should successfully configure a workflow with Read Table -> Dynamic Choice', async () => {
        // 1. Create Read Table Block
        const readBlock = await readTableBlockService.createBlock(workflowId, userId, {
            name: 'Read Users',
            sectionId,
            phase: 'onSectionEnter', // Run before
            config: {
                dataSourceId: 'native', // Mock native
                tableId: 'users', // Read users table itself for simplicity
                outputKey: 'userList',
                resultMode: 'list',
            } as any
        });
        expect(readBlock).toBeDefined();
        // 2. Create Choice Question using the list
        const choiceConfig: ChoiceAdvancedConfig = {
            display: 'dropdown',
            allowMultiple: false,
            searchable: true,
            options: {
                type: 'list',
                listVariable: 'userList',
                labelPath: 'email',
                valuePath: 'id',
                includeBlankOption: true,
                blankLabel: 'Select a user...',
                transform: {
                    dedupe: { fieldPath: 'id' },
                    sort: [{ fieldPath: 'email', direction: 'asc' }]
                }
            }
        };
        const choiceStep = await stepService.createStep(workflowId, sectionId, userId, {
            type: 'choice',
            title: 'Select User',
            options: choiceConfig,
            order: 10
        });
        expect(choiceStep).toBeDefined();
        // The step stores the config in the 'options' column
        const storedOptions = choiceStep.options as ChoiceAdvancedConfig;
        expect((storedOptions.options as any).type).toBe('list');
        expect((storedOptions.options as any).listVariable).toBe('userList');
    });
    // Note: Full runtime data flow verification requires simulating the Runner's 
    // interaction with the API which is complex in this environment. 
    // The above verifies the Schema and API accept the configuration correctly.
});
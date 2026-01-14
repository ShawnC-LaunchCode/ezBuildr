
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
    users,
    tenants,
    projects,
    workflows,
    sections,
    blocks,
    datavaultDatabases,
    datavaultTables,
    datavaultColumns,
    workflowQueries,
    steps
} from '@shared/schema';

import { db } from '../../server/db';
import { stepValueRepository } from '../../server/repositories';
import {
    datavaultTablesService,
    datavaultColumnsService,
    datavaultRowsService
} from '../../server/services';
import { RunService } from '../../server/services/RunService';

describe('Data Block Integration Tests', () => {
    let tenantId: string;
    let userId: string;
    let projectId: string;
    let databaseId: string;
    let tableId: string;
    let columnId: string;
    let runService: RunService;

    const testEmail = 'datablock-test@example.com';
    const testColumnSlug = 'input_text';

    beforeAll(async () => {
        // 1. Setup Tenant and User
        const [tenant] = await db.insert(tenants).values({
            name: 'DataBlock Test Tenant',
            slug: `datablock-tenant-${Date.now()}`,
        } as any).returning();
        tenantId = tenant.id;

        const [user] = await db.insert(users).values({
            id: uuidv4(),
            email: testEmail,
            tenantId: tenantId,
            role: 'admin',
            tenantRole: 'owner',
            authProvider: 'google',
        } as any).returning();
        userId = user.id;

        // 2. Setup DataVault Schema
        const [database] = await db.insert(datavaultDatabases).values({
            name: 'Test Database',
            tenantId: tenantId,
        } as any).returning();
        databaseId = database.id;

        const table = await datavaultTablesService.createTable({
            name: 'Integration Test Table',
            description: 'Table for Write/Query block tests',
            databaseId: databaseId,
            ownerUserId: userId,
            tenantId: tenantId,
        });
        tableId = table.id;

        const column = await datavaultColumnsService.createColumn({
            tableId: tableId,
            name: 'Input Text',
            type: 'text',
            required: false,
        }, tenantId);
        columnId = column.id;

        // 3. Instantiate RunService
        // Uses real dependencies from server/repositories and server/services
        runService = new RunService();

    });

    afterAll(async () => {
        if (tenantId) {
            // Delete projects first to remove workflows (which reference users)
            // This prevents FK violation when deleting users via tenant cascade
            await db.delete(projects).where(eq(projects.tenantId, tenantId));

            // Clean up tenant (cascades to users, etc.)
            await db.delete(tenants).where(eq(tenants.id, tenantId));
        }
    });

    it('should write data to DataVault via WriteBlock', async () => {
        // 1. Create Workflow & Section
        const [project] = await db.insert(projects).values({
            name: 'Write Block Project',
            title: 'Write Block Project', // Required legacy field
            tenantId: tenantId,
            workspaceId: uuidv4(), // valid UUID
            creatorId: userId,
            ownerId: userId,
        } as any).returning();
        projectId = project.id;

        const [workflow] = await db.insert(workflows).values({
            projectId: projectId,
            title: 'Write Block Workflow',
            published: true,
            version: 1,
            creatorId: userId,
            ownerId: userId,
        } as any).returning();

        const [section] = await db.insert(sections).values({
            workflowId: workflow.id,
            title: 'Write Section',
            order: 0,
        } as any).returning();

        // 2. Create Steps & Blocks
        // Input 'step' to capture user data (NOT a block)
        const inputBlockId = uuidv4();
        await db.insert(steps).values({
            id: inputBlockId,
            sectionId: section.id,
            type: 'short_text',
            title: 'Enter Text',
            order: 0,
        } as any);

        // Write block to save data to DV (Logic Block)
        const writeBlockId = uuidv4();
        await db.insert(blocks).values({
            id: writeBlockId,
            workflowId: workflow.id, // Required
            sectionId: section.id,
            type: 'write',
            phase: 'onSectionSubmit', // Execute when submitting the section
            config: {
                dataSourceId: databaseId,
                tableId: tableId,
                mode: 'create',
                columnMappings: [
                    {
                        columnId: columnId,
                        value: `{{${inputBlockId}}}`, // Map input block value to column
                    }
                ]
            },
            order: 1,
        } as any);

        // 3. Execute Run
        // createRun(idOrSlug, userId, data, ...)
        const run = await runService.createRun(
            workflow.id,
            userId,
            {}
        );

        // Submit section with input data
        const inputData = { [inputBlockId]: 'Hello DataVault' };

        // submitSection requires Array<{ stepId: string; value: any }>
        const valuesToArray = Object.entries(inputData).map(([stepId, value]) => ({ stepId, value }));

        await runService.submitSection(
            run.id,
            section.id,
            userId,
            valuesToArray
        );

        // 4. Verify Data Written
        const { rows } = await datavaultRowsService.getRowsWithOptions(tenantId, tableId, { limit: 1 });

        expect(rows).toHaveLength(1);
        const row = rows[0];

        // Check value
        expect(row.values[columnId]).toBe('Hello DataVault');
    });

    it('should query data from DataVault via QueryBlock and use in Logic', async () => {
        // 1. Create Workflow & Query
        const [workflow] = await db.insert(workflows).values({
            projectId: projectId,
            title: 'Query Block Workflow',
            published: true,
            version: 1,
            creatorId: userId,
            ownerId: userId,
        } as any).returning();

        // Create a saved query
        const [query] = await db.insert(workflowQueries).values({
            projectId: projectId,
            workflowId: workflow.id,
            dataSourceId: databaseId,
            tableId: tableId, // Required
            name: 'Select Test Table',
            description: 'Selects all from test table',
            type: 'sql',
            query: `SELECT * FROM t_${tableId.replace(/-/g, '_')}`, // Physical table name convention
            tenantId: tenantId,
        } as any).returning();

        const [section] = await db.insert(sections).values({
            workflowId: workflow.id,
            title: 'Query Section',
            order: 0,
        } as any).returning();

        // 2. Create Blocks
        // Query Block (Logic Block)
        // Needs a Virtual Step to store the result
        const queryStepId = uuidv4();
        await db.insert(steps).values({
            id: queryStepId,
            sectionId: section.id,
            type: 'computed',
            title: 'Query Result',
            order: 0,
        } as any);

        const queryBlockId = uuidv4();
        const listVarName = 'my_results';
        await db.insert(blocks).values({
            id: queryBlockId,
            workflowId: workflow.id, // Required
            sectionId: section.id,
            type: 'query',
            phase: 'onSectionSubmit', // Execute when submitting checks
            virtualStepId: queryStepId, // Link output to step
            config: {
                queryId: query.id,
                outputVariableName: listVarName,
            },
            order: 0,
            stepAlias: 'query_step'
        } as any);

        // Validate Block (to consume list variable)
        const validateBlockId = uuidv4();
        await db.insert(blocks).values({
            id: validateBlockId,
            workflowId: workflow.id, // Required
            sectionId: section.id,
            type: 'validate',
            phase: 'onSectionSubmit', // Run validation after query (still on enter? or submit? validate usually runs on submit...)
            // But if we want to validate the *loaded data*, onSectionEnter after query is fine.
            // However, 'validate' blocks in 'blocks' table are often logic gates?
            // If I want to assert the list exists, doing it onEnter is okay.
            config: {
                rules: [
                    {
                        assert: {
                            key: listVarName,
                            op: 'is_not_empty'
                        },
                        message: 'List should not be empty'
                    }
                ]
            },
            orderIndex: 1
        } as any);

        // 3. Execute Run
        const run = await runService.createRun(
            workflow.id,
            userId,
            {}
        );

        // Submit section (empty data, triggers blocks)
        await runService.submitSection(
            run.id,
            section.id,
            userId,
            []
        );

        // 4. Verification
        // Check Query Block Output (Step Value)
        const queryStepValue = await stepValueRepository.findByRunAndStep(run.id, queryStepId);

        expect(queryStepValue).toBeDefined();
        // Verify ListVariable structure
        const val = queryStepValue!.value as any;
        expect(val).toBeDefined();
        // Depending on what QueryRunner returns, it might be a ListVariable { type: 'list', items: [] } or just []
        // But typically specialized blocks wrap it.
        // Let's inspect what we get if it fails, but assume standard variable or array.
        // QueryRunner returns { rows: [...], rowCount: ... }
        if (val.rows) {
            expect(Array.isArray(val.rows)).toBe(true);
            expect(val.rows.length).toBeGreaterThan(0);
            expect(val.rows[0][columnId]).toBe('Hello DataVault');
        } else if (val.items) {
            // Fallback if structure changes
            expect(Array.isArray(val.items)).toBe(true);
            expect(val.items.length).toBeGreaterThan(0);
            expect(val.items[0][columnId]).toBe('Hello DataVault');
        } else {
            // Raw array
            expect(Array.isArray(val)).toBe(true);
            expect(val.length).toBeGreaterThan(0);
            expect(val[0][columnId]).toBe('Hello DataVault');
        }
    });

});

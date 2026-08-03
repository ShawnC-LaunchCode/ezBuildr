
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { users, tenants, projects, workflows, sections, blocks, datavaultDatabases, workflowQueries, steps } from '@shared/schema';
import type { Block } from '@shared/schema';
import type { BlockContext, ListVariable, ReadTableConfig, WriteBlockConfig } from '@shared/types/blocks';

import { db } from '../../server/db';
import { WriteRunner } from '../../server/lib/writes/WriteRunner';
import { stepValueRepository } from '../../server/repositories';
import {
    datavaultTablesService,
    datavaultColumnsService,
    datavaultRowsService
} from '../../server/services';
import { ReadTableBlockRunner } from '../../server/services/blockRunners/ReadTableBlockRunner';
import { RunService } from '../../server/services/RunService';

describe('Data Block Integration Tests', () => {
    let tenantId: string;
    let userId: string;
    let projectId: string;
    let databaseId: string;
    let tableId: string;
    let columnId: string;
    let upsertMatchColumnId: string;
    let readTableId: string;
    let readTextColumnId: string;
    let readNumberColumnId: string;
    let readWorkflowId: string;
    let runService: RunService;

    const testEmail = 'datablock-test@example.com';
    const _testColumnSlug = 'input_text';

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

        const upsertMatchColumn = await datavaultColumnsService.createColumn({
            tableId,
            name: 'Upsert Match',
            type: 'text',
            required: false,
            isUnique: true,
        }, tenantId);
        upsertMatchColumnId = upsertMatchColumn.id;

        const [project] = await db.insert(projects).values({
            name: 'Write Block Project',
            title: 'Write Block Project',
            tenantId,
            workspaceId: uuidv4(),
            creatorId: userId,
            createdBy: userId,
            ownerId: userId,
        } as any).returning();
        projectId = project.id;

        const readTable = await datavaultTablesService.createTable({
            name: 'Read Table Integration Test',
            description: 'Table for Read Table block tests',
            databaseId,
            ownerUserId: userId,
            tenantId,
        });
        readTableId = readTable.id;

        const readTextColumn = await datavaultColumnsService.createColumn({
            tableId: readTableId,
            name: 'Label',
            type: 'text',
            required: false,
        }, tenantId);
        readTextColumnId = readTextColumn.id;

        const readNumberColumn = await datavaultColumnsService.createColumn({
            tableId: readTableId,
            name: 'Amount',
            type: 'number',
            required: false,
        }, tenantId);
        readNumberColumnId = readNumberColumn.id;

        await datavaultRowsService.createRow(
            readTableId,
            tenantId,
            { [readTextColumnId]: 'Alpha', [readNumberColumnId]: 9 },
            userId
        );
        await datavaultRowsService.createRow(
            readTableId,
            tenantId,
            { [readTextColumnId]: 'Beta', [readNumberColumnId]: 10 },
            userId
        );
        await datavaultRowsService.createRow(
            readTableId,
            tenantId,
            { [readTextColumnId]: 'Alpine', [readNumberColumnId]: 11 },
            userId
        );
        await datavaultRowsService.createRow(
            readTableId,
            tenantId,
            { [readTextColumnId]: '' },
            userId
        );
        const archived = await datavaultRowsService.createRow(
            readTableId,
            tenantId,
            { [readTextColumnId]: 'Archived', [readNumberColumnId]: 12 },
            userId
        );
        await datavaultRowsService.archiveRow(tenantId, archived.row.id);

        const [readWorkflow] = await db.insert(workflows).values({
            projectId,
            title: 'Read Table Block Workflow',
            published: true,
            version: 1,
            creatorId: userId,
            ownerId: userId,
        } as any).returning();
        readWorkflowId = readWorkflow.id;

        // 3. Instantiate RunService
        // Uses real dependencies from server/repositories and server/services
        runService = new RunService();

    });

    const executeReadTable = async (
        overrides: Partial<ReadTableConfig> = {}
    ): Promise<ListVariable> => {
        const config: ReadTableConfig = {
            dataSourceId: databaseId,
            tableId: readTableId,
            outputKey: 'read_rows',
            ...overrides,
        };
        const block = {
            id: uuidv4(),
            workflowId: readWorkflowId,
            sectionId: null,
            type: 'read_table',
            phase: 'onSectionEnter',
            config,
            order: 0,
            enabled: true,
            virtualStepId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as unknown as Block;

        const result = await new ReadTableBlockRunner().execute(config, {
            workflowId: readWorkflowId,
            phase: 'onSectionEnter',
            data: {},
        }, block);

        expect(result.success, result.errors?.join('\n')).toBe(true);
        const list = result.data?.read_rows as ListVariable | undefined;
        expect(list).toBeDefined();
        return list!;
    };

    afterAll(async () => {
        if (tenantId) {
            // Delete projects first to remove workflows (which reference users)
            // This prevents FK violation when deleting users via tenant cascade
            await db.delete(projects).where(eq(projects.tenantId, tenantId));

            // Clean up tenant (cascades to users, etc.)
            await db.delete(tenants).where(eq(tenants.id, tenantId));
        }
    });

    it('should write data to DataVault via WriteBlock', { timeout: 30000 }, async () => {
        // 1. Create Workflow & Section
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
            workflowId: workflow.id,
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

    it('serializes concurrent upserts for the same new match value into exactly one row', { timeout: 30000 }, async () => {
        const matchValue = `concurrent-${uuidv4()}`;
        const config: WriteBlockConfig = {
            dataSourceId: databaseId,
            tableId,
            mode: 'upsert',
            matchStrategy: {
                type: 'column_match',
                columnId: upsertMatchColumnId,
                columnValue: matchValue,
            },
            columnMappings: [
                { columnId: upsertMatchColumnId, value: matchValue },
                { columnId, value: 'Hello DataVault' },
            ],
        };
        const context = (runId: string): BlockContext => ({
            workflowId: readWorkflowId,
            runId,
            phase: 'onNext',
            data: {},
            userId,
        });
        const runner = new WriteRunner();

        const results = await Promise.all([
            runner.executeWrite(config, context('concurrent-upsert-a'), tenantId),
            runner.executeWrite(config, context('concurrent-upsert-b'), tenantId),
        ]);

        expect(results.map(result => result.success)).toEqual([true, true]);
        expect(results.map(result => result.operation).sort()).toEqual(['create', 'update']);

        const { rows } = await datavaultRowsService.getRowsWithOptions(tenantId, tableId, { limit: 100 });
        const matchingRows = rows.filter(row => row.values[upsertMatchColumnId] === matchValue);
        expect(matchingRows).toHaveLength(1);
        expect(results[0].rowId).toBe(matchingRows[0].row.id);
        expect(results[1].rowId).toBe(matchingRows[0].row.id);
    });

    it('returns actual EAV cell values and excludes archived rows via Read Table block', { timeout: 30000 }, async () => {
        const list = await executeReadTable();

        const alpha = list.rows.find(row => row[readTextColumnId] === 'Alpha');
        expect(alpha?.[readTextColumnId]).toBe('Alpha');
        expect(alpha?.[readNumberColumnId]).toBe(9);
        expect(list.rows.map(row => row[readTextColumnId])).not.toContain('Archived');
        expect(list.count).toBe(4);
    });

    it.each([
        ['equals', 'Beta', ['Beta']],
        ['contains', 'Alp', ['Alpha', 'Alpine']],
        ['greater_than', 9, ['Alpine', 'Beta']],
        ['is_empty', undefined, ['']],
        ['in', ['Alpha', 'Beta'], ['Alpha', 'Beta']],
    ] as const)(
        'applies the %s EAV filter without querying a nonexistent data column',
        async (operator, value, expectedLabels) => {
            const list = await executeReadTable({
                filters: [{ columnId: operator === 'greater_than' ? readNumberColumnId : readTextColumnId, operator, value }],
            });

            const labels = list.rows.map(row => row[readTextColumnId] as string).sort();
            expect(labels).toEqual([...expectedLabels].sort());
        }
    );

    it('sorts number-column values numerically via Read Table block', { timeout: 30000 }, async () => {
        const list = await executeReadTable({
            sort: { columnId: readNumberColumnId, direction: 'asc' },
        });

        const amounts = list.rows
            .map(row => row[readNumberColumnId])
            .filter((value): value is number => typeof value === 'number');
        expect(amounts).toEqual([9, 10, 11]);
    });

    it('should query data from DataVault via QueryBlock and use in Logic', { timeout: 30000 }, async () => {
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
            workflowId: workflow.id,
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

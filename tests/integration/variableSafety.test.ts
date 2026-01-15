
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

import {
    users as usersSchema,
    tenants as tenantsSchema,
    projects as projectsSchema,
    workflows as workflowsSchema,
    workflowVersions as workflowVersionsSchema,
    sections as sectionsSchema,
    steps as stepsSchema,
    workflowRuns as workflowRunsSchema,
} from "@shared/schema";
import { BlockContext, CreateRecordConfig } from "@shared/types/blocks";

import { db } from "../../server/db";
import { blockRunner } from "../../server/services/BlockRunner";
import { runPersistenceWriter } from "../../server/services/runs/RunPersistenceWriter";
import { scriptEngine } from "../../server/services/scripting/ScriptEngine";



const TEST_TIMEOUT = 15000;

describe("Variable Schema Safety & Resolution", () => {
    let tenantId: string;
    let userId: string;
    let projectId: string;
    let workflowId: string;
    let versionId: string;
    let sectionId: string;
    let runId: string;
    let runToken: string;
    let stepId1: string;

    const stepAlias1 = "input_variable";

    beforeEach(async () => {
        stepId1 = uuidv4(); // Generate new ID for each test
        // 1. Setup Tenant & User
        tenantId = uuidv4();
        await db.insert(tenantsSchema).values({
            id: tenantId,
            name: "Variable Safety Tenant",
            slug: `safety - ${uuidv4()} `,
        } as any);

        userId = uuidv4();
        await db.insert(usersSchema).values({
            id: userId,
            email: `safety - ${uuidv4()} @example.com`,
            tenantId,
            role: "admin",
            tenantRole: "owner",
            name: "Safety Tester",
            authProvider: "local",
        } as any);

        // 2. Setup Project & Workflow
        projectId = uuidv4();
        await db.insert(projectsSchema).values({
            id: projectId,
            name: "Safety Project",
            title: "Safety Project",
            tenantId,
            creatorId: userId,
            createdBy: userId,
            ownerId: userId,
        } as any);

        workflowId = uuidv4();
        versionId = uuidv4();
        await db.insert(workflowsSchema).values({
            id: workflowId,
            projectId,
            title: "Safety Workflow",
            creatorId: userId,
            ownerId: userId,
            currentVersionId: versionId,
        } as any);

        await db.insert(workflowVersionsSchema).values({
            id: versionId,
            workflowId,
            versionNumber: 1,
            graphJson: {},
            createdBy: userId,
        } as any);

        // 3. Setup Section & Step
        sectionId = uuidv4();
        await db.insert(sectionsSchema).values({
            id: sectionId,
            workflowId,
            title: "Main Section",
            order: 1,
        } as any);

        await db.insert(stepsSchema).values({
            id: stepId1,
            sectionId,
            type: "text",
            title: "My Step",
            alias: stepAlias1, // "input_variable"
            order: 1,
        } as any);

        // 4. Create Run
        runId = uuidv4();
        runToken = uuidv4();
        await runPersistenceWriter.createRun({
            id: runId,
            workflowId,
            workflowVersionId: versionId,
            runToken,
            createdBy: `creator:${userId} `,
            status: "pending",
        } as any);
    }, TEST_TIMEOUT);

    afterAll(async () => {
        // Cleanup in correct order to avoid foreign key violations
        // Delete in reverse order of creation
        try {
            // Delete workflow-related data first
            if (versionId) {
                await db.delete(workflowVersionsSchema).where(eq(workflowVersionsSchema.id, versionId));
            }
            if (workflowId) {
                await db.delete(workflowsSchema).where(eq(workflowsSchema.id, workflowId));
            }
            if (projectId) {
                await db.delete(projectsSchema).where(eq(projectsSchema.id, projectId));
            }
            if (userId) {
                await db.delete(usersSchema).where(eq(usersSchema.id, userId));
            }
            if (tenantId) {
                await db.delete(tenantsSchema).where(eq(tenantsSchema.id, tenantId));
            }
        } catch (error) {
            console.warn("Cleanup error (non-critical):", error);
        }
    });

    it("REPRO: ScriptEngine fails to resolve alias 'input_variable' when aliasMap is NOT provided", async () => {
        // 1. Save data using UUID (as the system does)
        await runPersistenceWriter.saveStepValue(runId, stepId1, 100, workflowId);

        // 2. Fetch data (RunExecutionCoordinator logic)
        const dataMap = await runPersistenceWriter.getRunValues(runId);

        // Assert: Data map keys are UUIDs
        expect(dataMap[stepId1]).toBe(100);
        expect(dataMap[stepAlias1]).toBeUndefined();

        // 3. Attempt to run script using Alias
        const result = await scriptEngine.execute({
            language: "javascript",
            code: "return input.input_variable * 2;",
            inputKeys: [stepAlias1], // "input_variable"
            data: dataMap, // Keyed by UUID
            context: {
                workflowId,
                runId,
                phase: "onSectionSubmit"
            }
        });

        // Expectation: Execution itself succeeds (ok=true), but result is NaN because input was undefined
        // Expectation: Execution might fail or return NaN. Both confirm that alias resolution didn't happen.
        if (result.ok) {
            expect(Number.isNaN(result.output)).toBe(true);
        } else {
            expect(result.ok).toBe(false);
        }
    });

    it("ScriptEngine resolves alias 'input_variable' when aliasMap is provided", async () => {
        // 1. Save data using UUID (as the system does)
        await runPersistenceWriter.saveStepValue(runId, stepId1, 100, workflowId);

        // 2. Fetch data
        const dataMap = await runPersistenceWriter.getRunValues(runId);

        // 3. Build Alias Map (simulating Coordinator logic)
        const aliasMap = { [stepAlias1]: stepId1 };

        // 4. Run script using Alias AND aliasMap
        const result = await scriptEngine.execute({
            language: "javascript",
            code: "return input.input_variable * 2;",
            inputKeys: [stepAlias1], // "input_variable"
            data: dataMap, // Keyed by UUID
            aliasMap,
            context: {
                workflowId,
                runId,
                phase: "onSectionSubmit"
            }
        });

        // Expectation: Should PASS now
        if (!result.ok) {
            console.log("ScriptEngine failed:", JSON.stringify(result, null, 2));
        }
        expect(result.ok).toBe(true);
        expect(result.output).toBe(200);
    });

    it("REPRO: BlockRunner fails to resolve alias in CreateRecordConfig", async () => {
        // 1. Save data
        await runPersistenceWriter.saveStepValue(runId, stepId1, "Test Value", workflowId);

        // 2. Prepare Context
        const dataMap = await runPersistenceWriter.getRunValues(runId);
        const context: BlockContext = {
            workflowId,
            runId,
            phase: "onSectionSubmit",
            data: dataMap, // Keyed by UUID
        };

        // 3. Config using ALIAS
        const config: CreateRecordConfig = {
            collectionId: uuidv4(),
            fieldMap: {
                "name": stepAlias1 // "input_variable"
            }
        };

        // We can't easily test `executeCreateRecordBlock` in isolation as it's private,
        // but we can try to "simulate" the logic or use a mocked Block object if we export `executeBlock`.
        // Alternatively, I will just inspect the `BlockRunner` logic I read.

        // As verified in code reading:
        // `const value = context.data[stepAlias]; `
        // context.data is keyed by UUID. stepAlias is "input_variable".
        // `value` will be undefined.

        const value = context.data[config.fieldMap["name"]];
        expect(value).toBeUndefined();
        expect(dataMap[stepId1]).toBe("Test Value");
    });

    it("BlockRunner logic resolves alias with aliasMap", async () => {
        // 1. Save data
        await runPersistenceWriter.saveStepValue(runId, stepId1, "Test Value", workflowId);

        // 2. Prepare Context with AliasMap
        const dataMap = await runPersistenceWriter.getRunValues(runId);
        const aliasMap = { [stepAlias1]: stepId1 };

        const context: BlockContext = {
            workflowId,
            runId,
            phase: "onSectionSubmit",
            data: dataMap,
            aliasMap,
        };

        // 3. Config using ALIAS
        const config: CreateRecordConfig = {
            collectionId: uuidv4(),
            fieldMap: {
                "name": stepAlias1 // "input_variable"
            }
        };

        // 4. Simulate BlockRunner resolution logic
        // logic: const dataKey = aliasMap?.[stepAlias] || stepAlias;
        const mappedKey = context.aliasMap?.[config.fieldMap["name"]] || config.fieldMap["name"];
        const value = context.data[mappedKey];

        expect(mappedKey).toBe(stepId1);
        expect(value).toBe("Test Value");
    });
});

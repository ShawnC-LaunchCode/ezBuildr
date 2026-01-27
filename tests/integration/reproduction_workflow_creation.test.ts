import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { users, tenants } from "@shared/schema";
import { insertWorkflowSchema } from "@shared/schema"; // Import schema for parsing

import { db } from "../../server/db";
import { workflowService } from "../../server/services/WorkflowService";

describe("Reproduction: Workflow Creation", () => {
    let tenantId: string;
    let userId: string;

    beforeAll(async () => {
        // Create Tenant
        const [tenant] = await db.insert(tenants).values({
            name: "Reproduction Tenant",
            plan: "pro"
        }).returning();
        tenantId = tenant.id;

        // Create User
        const [user] = await db.insert(users).values({
            email: `repro_test_${Date.now()}@example.com`,
            fullName: "Reproduction Tester",
            tenantId: tenant.id,
            role: "admin",
            tenantRole: "owner"
        }).returning();
        userId = user.id;
    });

    afterAll(async () => {
        if (userId) {
            await db.delete(users).where(eq(users.id, userId));
        }
        if (tenantId) {
            await db.delete(tenants).where(eq(tenants.id, tenantId));
        }
    });

    it("should create a workflow successfully via service simulating route logic", async () => {
        const reqBody = {
            title: "Reproduction Workflow",
            description: "Created for debugging",
        };

        // Simulate route logic
        const workflowData = insertWorkflowSchema.parse({
            ...reqBody,
            creatorId: userId,
            ownerId: userId, // Creator is also the initial owner
        });

        console.log("Parsed Workflow Data:", workflowData);

        try {
            const workflow = await workflowService.createWorkflow(workflowData, userId);
            expect(workflow).toBeDefined();
            expect(workflow.title).toBe(reqBody.title);
            expect(workflow.creatorId).toBe(userId);
            console.log("Workflow Created:", workflow);
        } catch (error) {
            console.error("Workflow Creation Failed:", error);
            throw error;
        }
    });
});

import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { users, tenants, insertWorkflowSchema } from "@shared/schema";

import { workflowService } from "../../server/services/WorkflowService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

describe("Reproduction: Workflow Creation", () => {
    let tenantId: string;
    let userId: string;

    beforeAll(async () => {
        // Create Tenant
        const [tenant] = await getOwnerDb().insert(tenants).values({
            name: "Reproduction Tenant",
            plan: "pro"
        }).returning();
        tenantId = tenant.id;

        // Create User
        const [user] = await getOwnerDb().insert(users).values({
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
            await getOwnerDb().delete(users).where(eq(users.id, userId));
        }
        if (tenantId) {
            await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId));
        }
    });

    it("should create a workflow successfully via service simulating route logic", { timeout: 30000 }, async () => {
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
            // RLS-5 recipe step 3: this drives `workflowService` DIRECTLY, so no
            // middleware opens a tenant context. Without it `withTx` degrades to
            // an UNSCOPED transaction (the documented staged-rollout behaviour),
            // `app_current_tenant()` is NULL, and `workflows`' ownership-derived
            // WITH CHECK rejects the insert.
            enterTenantContextForTests(tenantId);
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

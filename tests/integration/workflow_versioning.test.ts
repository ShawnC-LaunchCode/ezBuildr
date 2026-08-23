import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { workflows, users, tenants, projects, auditLogs, pages, steps } from "@shared/schema";

import { workflowDiffService } from "../../server/services/diff/WorkflowDiffService";
import { snapshotService } from "../../server/services/SnapshotService";
import { versionService } from "../../server/services/VersionService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
// RLS-5 recipe step 3: direct service calls get no middleware, so the tenant
// context is entered per test body — a hook entry does not propagate.
import { enterTenantContextForTests } from "../../server/utils/rlsContext";
describe("Workflow Versioning & Lineage", () => {
    let tenantId: string;
    let projectId: string;
    let workflowId: string;
    let userId: string;
    beforeAll(async () => {
        // Create Tenant
        const [tenant] = await getOwnerDb().insert(tenants).values({
            name: "Versioning Test Tenant",
            plan: "pro"
        }).returning();
        tenantId = tenant.id;
        // Create User (Needed for Project creator/owner)
        const [user] = await getOwnerDb().insert(users).values({
            email: `test_versioning_${Date.now()}@example.com`,
            fullName: "Versioning Tester",
            tenantId: tenant.id,
            role: "admin",
            tenantRole: "owner"
        }).returning();
        userId = user.id;
        // Create Project
        const [project] = await getOwnerDb().insert(projects).values({
            title: "Versioning Test Project", // Legacy field
            name: "Versioning Test Project",
            tenantId: tenant.id,
            creatorId: userId, // Legacy field
            createdBy: userId,
            ownerId: userId    // Required
        }).returning();
        projectId = project.id;
        // Create Workflow
        const [workflow] = await getOwnerDb().insert(workflows).values({
            creatorId: userId,
            ownerId: userId,
            title: "Versioning Test Workflow",
            projectId: project.id
        }).returning();
        workflowId = workflow.id;
    });
    afterAll(async () => {
        if (workflowId) { 
            await getOwnerDb().delete(steps).where(eq(steps.workflowId, workflowId));
            await getOwnerDb().delete(pages).where(eq(pages.workflowId, workflowId));
            await getOwnerDb().delete(workflows).where(eq(workflows.id, workflowId)); 
        }
        if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
        // Cleanup audit logs/events to satisfy FK constraints
        if (userId) {
            // Try to delete from both tables if they exist/are imported
            // auditEvents removed as it is not in schema

            // eslint-disable-next-line no-empty
            try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { }
            await getOwnerDb().delete(users).where(eq(users.id, userId));
        }
        if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
    });
    it("should diff two versions correctly", () => {
        const v1 = {
            pages: [{
                id: "p1",
                steps: [
                    { id: "b1", type: "short_text", title: "Name", alias: "name" }
                ]
            }]
        };
        const v2 = {
            pages: [{
                id: "p1",
                steps: [
                    { id: "b1", type: "short_text", title: "Name", alias: "name_updated" }, // Modified
                    { id: "b2", type: "email", title: "Email", alias: "email" }   // Added
                ]
            }]
        };
        const diff = workflowDiffService.diff(v1 as any, v2 as any);
        expect(diff.modified.length).toBe(1);
        expect(diff.modified[0].id).toBe("b1");
        expect(diff.added.length).toBe(1);
        expect(diff.added[0].id).toBe("b2");
        expect(diff.removed.length).toBe(0);
    });
    it("should create a version from relational tables and populate changelog", async () => {
      enterTenantContextForTests(tenantId);
        const [page] = await getOwnerDb().insert(pages).values({
            workflowId, title: "Page 1", order: 0
        }).returning();
        await getOwnerDb().insert(steps).values({
            workflowId, pageId: page.id, title: "Short Text", type: "short_text", alias: "text_1", order: 0
        }).returning();

        const v1 = await versionService.publishVersion(workflowId, userId, "Initial version");
        expect(v1.versionNumber).toBeDefined();
        
        let graph = v1.graphJson as any;
        expect(graph.pages.length).toBe(1);
        expect(graph.pages[0].steps.length).toBe(1);
        expect(graph.pages[0].steps[0].alias).toBe("text_1");

        const [step2] = await getOwnerDb().insert(steps).values({
            workflowId, pageId: page.id, title: "Email", type: "email", alias: "email_1", order: 1
        }).returning();

        const v2 = await versionService.publishVersion(workflowId, userId, "Second version");
        
        graph = v2.graphJson as any;
        expect(graph.pages[0].steps.length).toBe(2);
        expect(graph.pages[0].steps[1].alias).toBe("email_1");

        // Verify changelog
        expect(v2.changelog).toBeDefined();
        const changelog = v2.changelog as any;
        expect(changelog.added.length).toBe(1);
        expect(changelog.added[0].id).toBe(step2.id);
    });
    it("should track execution lineage via snapshot", async () => {
      enterTenantContextForTests(tenantId);
        // Use v2 from previous test (it is the current version)
        // Create Snapshot
        const snapshot = await snapshotService.createSnapshot(workflowId, "Test Snapshot", (await versionService.listVersions(workflowId))[0].id);
        expect(snapshot.workflowVersionId).toBeDefined();
        // Validate Snapshot
        const validation = await snapshotService.validateSnapshot(snapshot.id);
        expect(validation.valid).toBe(true); // Should be valid as schema matches current (v2)
        // TODO: Test Run Creation linking to snapshot
        // We need 'RunService' or similar. 
        // For now, confirm snapshot has version.
    });
});
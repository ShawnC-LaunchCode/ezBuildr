import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { workflows, users, tenants, projects, auditLogs } from "@shared/schema";

import { db } from "../../server/db";
import { workflowDiffService } from "../../server/services/diff/WorkflowDiffService";
import { snapshotService } from "../../server/services/SnapshotService";
import { versionService } from "../../server/services/VersionService";
describe("Workflow Versioning & Lineage", () => {
    let tenantId: string;
    let projectId: string;
    let workflowId: string;
    let userId: string;
    beforeAll(async () => {
        // Create Tenant
        const [tenant] = await db.insert(tenants).values({
            name: "Versioning Test Tenant",
            plan: "pro"
        }).returning();
        tenantId = tenant.id;
        // Create User (Needed for Project creator/owner)
        const [user] = await db.insert(users).values({
            email: `test_versioning_${Date.now()}@example.com`,
            fullName: "Versioning Tester",
            tenantId: tenant.id,
            role: "admin",
            tenantRole: "owner"
        }).returning();
        userId = user.id;
        // Create Project
        const [project] = await db.insert(projects).values({
            title: "Versioning Test Project", // Legacy field
            name: "Versioning Test Project",
            tenantId: tenant.id,
            creatorId: userId, // Legacy field
            createdBy: userId,
            ownerId: userId    // Required
        }).returning();
        projectId = project.id;
        // Create Workflow
        const [workflow] = await db.insert(workflows).values({
            creatorId: userId,
            ownerId: userId,
            title: "Versioning Test Workflow",
        }).returning();
        workflowId = workflow.id;
    });
    afterAll(async () => {
        if (workflowId) { await db.delete(workflows).where(eq(workflows.id, workflowId)); }
        if (projectId) { await db.delete(projects).where(eq(projects.id, projectId)); }
        // Cleanup audit logs/events to satisfy FK constraints
        if (userId) {
            // Try to delete from both tables if they exist/are imported
            // auditEvents removed as it is not in schema

            try { await db.delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { }
            await db.delete(users).where(eq(users.id, userId));
        }
        if (tenantId) { await db.delete(tenants).where(eq(tenants.id, tenantId)); }
    });
    it("should diff two versions correctly", () => {
        const v1 = {
            pages: [{
                id: "p1",
                blocks: [
                    { id: "b1", type: "short_text", title: "Name", variableName: "name" }
                ]
            }]
        };
        const v2 = {
            pages: [{
                id: "p1",
                blocks: [
                    { id: "b1", type: "short_text", title: "Name", variableName: "name_updated" }, // Modified
                    { id: "b2", type: "email", title: "Email", variableName: "email" }   // Added
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
    it("should create a version and populate changelog", async () => {
        const v1Graph = {
            id: "root",
            title: "Test Workflow",
            pages: [{ id: "p1", title: "Page 1", order: 0, blocks: [{ id: "b1", type: "short_text", title: "Short Text", variableName: "text_1" }] }]
        };
        const v1 = await versionService.publishVersion(workflowId, userId, v1Graph, "Initial version");
        expect(v1.versionNumber).toBeDefined();
        const v2Graph = {
            id: "root",
            title: "Test Workflow",
            pages: [{ id: "p1", title: "Page 1", order: 0, blocks: [{ id: "b1", type: "short_text", title: "Short Text", variableName: "text_1" }, { id: "b2", type: "email", title: "Email", variableName: "email_1" }] }] // Added b2
        };
        const v2 = await versionService.publishVersion(workflowId, userId, v2Graph, "Second version");
        // Verify changelog
        expect(v2.changelog).toBeDefined();
        const changelog = v2.changelog as any;
        expect(changelog.added.length).toBe(1);
        expect(changelog.added[0].id).toBe("b2");
    });
    it("should track execution lineage via snapshot", async () => {
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
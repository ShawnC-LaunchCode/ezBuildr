import * as fs from "fs";
import * as path from "path";

import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";

import { storageProvider } from "../../server/services/storage";
import { generateMarketplaceBundles } from "../../scripts/generateMarketplaceBundles";
import {
    setupIntegrationTest,
    createAuthenticatedAgent,
    type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

/**
 * TM-3 vertical proof: POST /api/templates/:id/install through the real
 * route chain (hybridAuth -> requireTenant -> MarketplaceService ->
 * ImportService) against a real generated bundle and a real database.
 * Nothing here is mocked - two entirely separate tenants (their own users,
 * projects, JWTs) exercise the cross-tenant case, exactly the way a real
 * deployment would be attacked.
 */
describe.sequential("Template install API (TM-3)", () => {
    let ctx: IntegrationTestContext;
    let agent: ReturnType<typeof createAuthenticatedAgent>;
    let projectIdA: string;

    // A second, entirely separate tenant, for the cross-tenant cases.
    let otherCtx: IntegrationTestContext;
    let otherAgent: ReturnType<typeof createAuthenticatedAgent>;
    let projectIdB: string;

    let firstInstalledWorkflowId: string;

    beforeAll(async () => {
        await generateMarketplaceBundles();

        ctx = await setupIntegrationTest({ createProject: true, tenantName: "TM-3 Tenant A" });
        agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
        if (ctx.projectId === undefined) {
            throw new Error("setupIntegrationTest({ createProject: true }) did not create a project");
        }
        projectIdA = ctx.projectId;

        otherCtx = await setupIntegrationTest({ createProject: true, tenantName: "TM-3 Tenant B" });
        otherAgent = createAuthenticatedAgent(otherCtx.baseURL, otherCtx.authToken);
        if (otherCtx.projectId === undefined) {
            throw new Error("setupIntegrationTest({ createProject: true }) did not create a project");
        }
        projectIdB = otherCtx.projectId;
    });

    afterAll(async () => {
        await ctx.cleanup();
        await otherCtx.cleanup();
    });

    // AC1, AC2, AC5
    it("installs into the caller's own project, creating sections/steps and a retrievable DOCX", async () => {
        const res = await agent.post("/api/templates/nda/install").send({ projectId: projectIdA });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe("string");
        firstInstalledWorkflowId = res.body.id as string;

        const [workflow] = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.id, firstInstalledWorkflowId));
        expect(workflow).toBeDefined();
        // AC2: scoped to the caller's own project (and, transitively, tenant -
        // workflows carry no tenantId column directly; tenancy flows through
        // the project, which `setupIntegrationTest` created under ctx.tenantId).
        expect(workflow.projectId).toBe(projectIdA);
        expect(workflow.ownerUuid).toBe(ctx.userId);
        expect(workflow.creatorId).toBe(ctx.userId);

        const sections = await getOwnerDb().select().from(schema.sections)
            .where(eq(schema.sections.workflowId, firstInstalledWorkflowId));
        expect(sections.length).toBeGreaterThan(0);

        const steps = await getOwnerDb().select().from(schema.steps)
            .where(eq(schema.steps.workflowId, firstInstalledWorkflowId));
        expect(steps.length).toBeGreaterThan(0);

        // AC5: the template's DOCX is attached and round-trips byte-identical.
        const [workflowTemplate] = await getOwnerDb().select().from(schema.workflowTemplates)
            .where(eq(schema.workflowTemplates.workflowVersionId, workflow.currentVersionId as string));
        expect(workflowTemplate).toBeDefined();

        const [template] = await getOwnerDb().select().from(schema.templates)
            .where(eq(schema.templates.id, workflowTemplate.templateId));
        expect(template).toBeDefined();
        expect(template.projectId).toBe(projectIdA);

        const installedDocx = await storageProvider.getFile(template.fileRef);
        const sourceDocx = fs.readFileSync(
            path.resolve(process.cwd(), "templates/curated/nda/template.docx")
        );
        expect(installedDocx.equals(sourceDocx)).toBe(true);
    });

    // AC4: two installs are entirely independent workflows.
    it("a second install of the same template creates a second, independent workflow", async () => {
        const res = await agent.post("/api/templates/nda/install").send({ projectId: projectIdA });
        expect(res.status).toBe(200);
        const secondWorkflowId = res.body.id as string;

        expect(secondWorkflowId).not.toBe(firstInstalledWorkflowId);

        const firstSections = await getOwnerDb().select().from(schema.sections)
            .where(eq(schema.sections.workflowId, firstInstalledWorkflowId));
        const secondSections = await getOwnerDb().select().from(schema.sections)
            .where(eq(schema.sections.workflowId, secondWorkflowId));
        const firstIds = new Set(firstSections.map((s) => s.id));
        expect(secondSections.every((s) => !firstIds.has(s.id))).toBe(true);

        // Editing one does not affect the other.
        await getOwnerDb().update(schema.workflows)
            .set({ title: "Edited After Install" })
            .where(eq(schema.workflows.id, secondWorkflowId));

        const [untouched] = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.id, firstInstalledWorkflowId));
        expect(untouched.title).not.toBe("Edited After Install");
    });

    // Cross-tenant case (Vertical proof): tenant B installing the same
    // template gets its OWN workflow in its OWN tenant/project.
    it("a user of a different tenant installing the same template gets their own workflow in their own project", async () => {
        const res = await otherAgent.post("/api/templates/nda/install").send({ projectId: projectIdB });

        expect(res.status).toBe(200);
        const otherWorkflowId = res.body.id as string;
        expect(otherWorkflowId).not.toBe(firstInstalledWorkflowId);

        const [otherWorkflow] = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.id, otherWorkflowId));
        expect(otherWorkflow.projectId).toBe(projectIdB);
        expect(otherWorkflow.ownerUuid).toBe(otherCtx.userId);

        // Tenant B cannot reach tenant A's installed workflow through the
        // normal workflow-access route.
        const denied = await otherAgent.get(`/api/workflows/${firstInstalledWorkflowId}`);
        expect([403, 404]).toContain(denied.status);
    });

    // AC3 (Vertical proof): installing into a project the caller does not
    // own is rejected, and nothing is written.
    it("installing into a project the caller does not own is rejected, and nothing is written", async () => {
        const before = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.projectId, projectIdB));

        const res = await agent.post("/api/templates/nda/install").send({ projectId: projectIdB });

        expect([403, 404]).toContain(res.status);

        const after = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.projectId, projectIdB));
        expect(after.length).toBe(before.length);
    });

    it("an unknown template id 404s and writes nothing", async () => {
        const before = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.projectId, projectIdA));

        const res = await agent.post("/api/templates/not-a-real-template/install").send({ projectId: projectIdA });
        expect(res.status).toBe(404);

        const after = await getOwnerDb().select().from(schema.workflows)
            .where(eq(schema.workflows.projectId, projectIdA));
        expect(after.length).toBe(before.length);
    });

    it("requires authentication", async () => {
        const res = await request(ctx.baseURL)
            .post("/api/templates/nda/install")
            .send({ projectId: projectIdA });
        expect(res.status).toBe(401);
    });
});

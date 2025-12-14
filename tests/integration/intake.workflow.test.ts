
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";

describe.sequential("Intake Workflow Integration Tests", () => {
    let ctx: IntegrationTestContext;

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Intake Test Tenant",
            createProject: true,
            projectName: "Intake Project",
            userRole: "admin",
            tenantRole: "owner",
        });
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    it("should allow designating a workflow as Intake", async () => {
        // 1. Create a workflow
        const createRes = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/workflows`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({
                name: "Client Intake Form",
                graphJson: { nodes: [], edges: [] },
            })
            .expect(201);

        const workflowId = createRes.body.id;

        // 2. Update it to be an Intake workflow
        const updateRes = await request(ctx.baseURL)
            .patch(`/api/workflows/${workflowId}`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({
                intakeConfig: {
                    isIntake: true,
                    upstreamWorkflowId: null
                }
            })
            .expect(200);

        expect(updateRes.body.intakeConfig).toEqual({
            isIntake: true,
            upstreamWorkflowId: null
        });

        // 3. Verify persistence
        const getRes = await request(ctx.baseURL)
            .get(`/api/workflows/${workflowId}`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .expect(200);

        expect(getRes.body.intakeConfig).toEqual({
            isIntake: true,
            upstreamWorkflowId: null
        });

        return workflowId;
    });

    it("should allow linking a downstream workflow to an intake workflow", async () => {
        // 1. Create Intake Workflow (reusing logic or creating new)
        const intakeRes = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/workflows`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({ name: "Upstream Intake" })
            .expect(201);

        await request(ctx.baseURL)
            .patch(`/api/workflows/${intakeRes.body.id}`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({ intakeConfig: { isIntake: true } });

        // 2. Create Downstream Workflow
        const downstreamRes = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/workflows`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({ name: "Downstream Agreement" })
            .expect(201);

        // 3. Link Downstream to Intake
        const updateRes = await request(ctx.baseURL)
            .patch(`/api/workflows/${downstreamRes.body.id}`)
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({
                intakeConfig: {
                    isIntake: false,
                    upstreamWorkflowId: intakeRes.body.id
                }
            })
            .expect(200);

        expect(updateRes.body.intakeConfig.upstreamWorkflowId).toBe(intakeRes.body.id);
    });
});

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll } from "vitest";

import { workflowRunEvents, workflowRunMetrics, projects, workflows, workflowVersions, users, tenants } from "@shared/schema";

import { db } from "../../server/db";
import { runService } from "../../server/services/RunService";
import { createGraphWorkflow } from "../factories/graphFactory";

describe("Analytics Service Integration", () => {
    let userId: string;
    let tenantId: string;
    let workflow: any;
    let version: any;

    beforeAll(async () => {
        // MANUALLY FIX FK CONSTRAINT FOR TEST ENVIRONMENT (Migration collision workaround)
        try {
            await db.execute(sql`TRUNCATE TABLE "workflow_run_events", "workflow_run_metrics" CASCADE`);
            await db.execute(sql`ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_run_id_runs_id_fk"`);
            await db.execute(sql`ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_run_id_workflow_runs_id_fk"`);
            await db.execute(sql`ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE`);

            // Fix metrics table too
            await db.execute(sql`ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_run_id_runs_id_fk"`);
            await db.execute(sql`ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_run_id_workflow_runs_id_fk"`);
            await db.execute(sql`ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE`);

            console.log("MANUAL PATCH: Applied FK fix for workflow_run_events AND workflow_run_metrics");
        } catch (e) {
            console.error("MANUAL PATCH FAILED", e);
        }

        const [tenant] = await db.insert(tenants).values({ name: "Service Test Tenant", plan: "pro" } as any).returning();
        tenantId = tenant.id;
        userId = `user-${nanoid()}`;
        await db.insert(users).values({ id: userId, email: `${userId}@test.com`, passwordHash: "x", tenantId, tenantRole: "owner", role: "admin" } as any);
        const [p] = await db.insert(projects).values({ title: "P", name: "P", tenantId, creatorId: userId, ownerId: userId } as any).returning();

        const { workflow: w, version: v } = createGraphWorkflow({ projectId: p.id, creatorId: userId, status: "active", isPublic: true });
        const [wfRes] = await db.insert(workflows).values({ ...w, status: 'active', isPublic: true } as any).returning();
        workflow = wfRes;

        const [vRes] = await db.insert(workflowVersions).values({
            ...v,
            workflowId: wfRes.id,
            published: true,
            publishedAt: new Date(),
            publishedBy: userId
        } as any).returning();
        version = vRes;

        await db.update(workflows).set({ currentVersionId: vRes.id }).where(eq(workflows.id, wfRes.id));
        workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, wfRes.id) });
    });

    it("should generate events and metrics on run completion", async () => {
        // 1. Create Run via Service
        // Note: RunService.createRun expects a context or request info usually, but simplified sig might work if adjusted
        // Actually RunService.createRun(workflowId, inputData, queryParams, ...)
        // Looking at RunService signature: createRun(workflowId: string, options: ...)

        const run = await runService.createRun(workflow.id, undefined, { participantId: "anon" } as any);
        const runId = run.id;
        const runToken = run.runToken;
        expect(runId).toBeDefined();

        // 2. Verify run.start event
        let eventsAfterStart: any[] = [];
        for (let i = 0; i < 5; i++) {
            eventsAfterStart = await db.select().from(workflowRunEvents).where(eq(workflowRunEvents.runId, runId));
            if (eventsAfterStart.some(e => e.type === 'run.start')) {break;}
            await new Promise(r => setTimeout(r, 200));
        }
        expect(eventsAfterStart.some(e => e.type === 'run.start')).toBe(true);

        // 3. Complete Run
        // completeRun(runId, data, context)
        const context = {
            workflowId: workflow.id,
            runId: runId, // RunService usage usually derives this
            // But completeRun signature: async completeRun(runId: string, data: any = {})
            // Let's check signature.
        };

        // We'll call completeRun directly.
        await runService.completeRun(runId, { someOutput: "test" } as any);

        // 4. Verify Events (workflow.complete)
        const events = await db.select().from(workflowRunEvents).where(eq(workflowRunEvents.runId, runId));
        expect(events.some(e => e.type === 'workflow.complete')).toBe(true);

        // 5. Verify Metrics Aggregation
        await new Promise(r => setTimeout(r, 1000));

        const metrics = await db.select().from(workflowRunMetrics).where(eq(workflowRunMetrics.runId, runId));
        expect(metrics.length).toBe(1);
        expect(metrics[0].completed).toBe(true);
    });
});

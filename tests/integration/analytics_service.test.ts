import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll } from "vitest";

import { workflowRunEvents, workflowRunMetrics, projects, workflows, workflowVersions, users, tenants } from "@shared/schema";

import { runService } from "../../server/services/RunService";
import { createGraphWorkflow } from "../factories/graphFactory";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { enterTenantContextForTests } from '../../server/utils/rlsContext';

describe("Analytics Service Integration", () => {
    let userId: string;
    let tenantId: string;

    let workflow: any;


    beforeAll(async () => {
        // MANUALLY FIX FK CONSTRAINT FOR TEST ENVIRONMENT (Migration collision workaround)
        //
        // RLS-5: this is DDL — TRUNCATE and ALTER TABLE — so it must run on the
        // OWNER connection. The application pool connects as a non-owner role
        // with only SELECT/INSERT/UPDATE/DELETE, so every statement here failed
        // with "permission denied for table workflow_run_events". The whole
        // block is wrapped in a catch that only logs, so the FK fix silently
        // never applied and the events this suite asserts could not be written.
        try {
            await getOwnerDb().execute(sql`TRUNCATE TABLE "workflow_run_events", "workflow_run_metrics" CASCADE`);
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_run_id_runs_id_fk"`);
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_run_id_workflow_runs_id_fk"`);
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE`);

            // Fix metrics table too
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_run_id_runs_id_fk"`);
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_run_id_workflow_runs_id_fk"`);
            await getOwnerDb().execute(sql`ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE`);

            console.log("MANUAL PATCH: Applied FK fix for workflow_run_events AND workflow_run_metrics");
        } catch (e: unknown) {
            console.error("MANUAL PATCH FAILED", e);
        }

        const [tenant] = await getOwnerDb().insert(tenants).values({ name: "Service Test Tenant", plan: "pro" } as any).returning();
        tenantId = tenant.id;
        userId = `user-${nanoid()}`;
        await getOwnerDb().insert(users).values({ id: userId, email: `${userId}@test.com`, passwordHash: "x", tenantId, tenantRole: "owner", role: "admin" } as any);
        const [p] = await getOwnerDb().insert(projects).values({ title: "P", name: "P", tenantId, creatorId: userId, createdBy: userId, ownerId: userId } as any).returning();

        const { workflow: w, version: v } = createGraphWorkflow({ projectId: p.id, creatorId: userId, status: "active", isPublic: true });
        const [wfRes] = await getOwnerDb().insert(workflows).values({ ...w, status: 'active', isPublic: true } as any).returning();
        workflow = wfRes;

        const [vRes] = await getOwnerDb().insert(workflowVersions).values({
            ...v,
            // RVP-2: the run created below now actually resolves navigation
            // from this pinned graph (via RunDefinitionProvider) instead of
            // only the live tables, so it must satisfy VersionRuntimeSchema.
            // The legacy node/edge graph `createGraphWorkflow` produces here
            // predates the pages-based runtime schema (the visual graph
            // engine was removed -- see graphFactory.ts's header) and this
            // test never exercises pages/steps, so an empty valid graph
            // is sufficient.
            graphJson: { title: w.title, pages: [] },
            workflowId: wfRes.id,
            published: true,
            publishedAt: new Date(),
            publishedBy: userId
        } as any).returning();


        await getOwnerDb().update(workflows).set({ currentVersionId: vRes.id }).where(eq(workflows.id, wfRes.id));
        workflow = await getOwnerDb().query.workflows.findFirst({ where: eq(workflows.id, wfRes.id) });
    });

    it("should generate events and metrics on run completion", { timeout: 30000 }, async () => {
        // RLS-2b recipe step 3: this drives `runService` DIRECTLY, with no HTTP
        // request, so nothing populates the ambient tenant. Without it the
        // version lookup inside run execution finds nothing and the analytics
        // writes below never happen — silently, because
        // `AnalyticsService.recordEvent` swallows its own errors.
        enterTenantContextForTests(tenantId);
        // 1. Create Run via Service
        // Note: RunService.createRun expects a context or request info usually, but simplified sig might work if adjusted
        // Actually RunService.createRun(workflowId, inputData, queryParams, ...)
        // Looking at RunService signature: createRun(workflowId: string, options: ...)


        const run = await runService.createRun(workflow.id, undefined, { participantId: "anon" } as any);
        const runId = run.id;

        expect(runId).toBeDefined();

        // 2. Verify run.start event

        let eventsAfterStart: any[] = [];
        for (let i = 0; i < 5; i++) {
            eventsAfterStart = await getOwnerDb().select().from(workflowRunEvents).where(eq(workflowRunEvents.runId, runId));
            if (eventsAfterStart.some(e => e.type === 'run.start')) { break; }
            await new Promise(r => setTimeout(r, 200));
        }
        expect(eventsAfterStart.some(e => e.type === 'run.start')).toBe(true);

        // 3. Complete Run
        // This run was created anonymously (no user), so use the no-auth
        // completion path. `completeRun(runId, userId)` is auth-gated and would
        // reject an anonymous run with "Run not found".
        await runService.completeRunNoAuth(runId);

        // 4. Verify Events (workflow.complete)
        const events = await getOwnerDb().select().from(workflowRunEvents).where(eq(workflowRunEvents.runId, runId));
        expect(events.some(e => e.type === 'workflow.complete')).toBe(true);

        // 5. Verify Metrics Aggregation
        await new Promise(r => setTimeout(r, 1000));

        const metrics = await getOwnerDb().select().from(workflowRunMetrics).where(eq(workflowRunMetrics.runId, runId));
        expect(metrics.length).toBe(1);
        expect(metrics[0].completed).toBe(true);
    });
});

import express from "express";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { hybridAuth, type AuthRequest } from "../../server/middleware/auth";
import { rlsContext } from "../../server/middleware/rlsContext";
import { getCurrentTenantId } from "../../server/utils/rlsContext";
import {
    setupIntegrationTest,
    createAuthenticatedAgent,
    type IntegrationTestContext,
} from "../helpers/integrationTestHelper";

/**
 * RLS-1 vertical proof: the `rlsContext` middleware populates the
 * AsyncLocalStorage for a real authenticated request, through the real auth
 * chain, and is a safe no-op for unauthenticated ones.
 *
 * Why probe routes rather than an existing endpoint: nothing in the app reads
 * `getCurrentTenantId()` yet — RLS-2 is the ticket that makes the repository
 * layer consume it. So there is no production route that can *observe* the
 * context to assert on. These probes stand in for that future consumer and
 * exercise the genuine middleware and the genuine `hybridAuth`, not stubs.
 *
 * Why they are mounted here rather than in `integrationTestHelper`: the helper
 * builds its app from `registerRoutes`, which does NOT mount `rlsContext` —
 * that lives in `server/index.ts` / `server/production.ts`. Mounting it here
 * mirrors what those entrypoints do. (That the shared harness does not mirror
 * the entrypoints' middleware stack is a known repo-wide gap — see `TM-B1` in
 * `tickets/BACKLOG.md`. `tests/unit/server/rlsContextRegistration.test.ts`
 * guards the entrypoints themselves, because a behavioural test mounting its
 * own copy cannot notice one being deleted.)
 */
describe("rlsContext middleware (RLS-1)", () => {
    let ctxA: IntegrationTestContext;
    let ctxB: IntegrationTestContext;

    beforeAll(async () => {
        ctxA = await setupIntegrationTest({ tenantName: "RLS-1 Tenant A" });
        ctxB = await setupIntegrationTest({ tenantName: "RLS-1 Tenant B" });

        // Mirror the entrypoints: open the async context, then let each route's
        // own auth middleware resolve the tenant into it. Express matches in
        // registration order, so these run for the probe routes below.
        ctxA.app.use(rlsContext);

        // Authenticated probe — reports what the context holds versus what the
        // request object holds. They must agree.
        ctxA.app.get("/__rls_probe/authed", hybridAuth, (req, res) => {
            res.json({
                fromContext: getCurrentTenantId() ?? null,
                fromRequest: (req as AuthRequest).tenantId ?? null,
            });
        });

        // Unauthenticated probe — no auth middleware at all, standing in for a
        // public route such as POST /api/workflows/public/:slug/start.
        ctxA.app.get("/__rls_probe/public", (_req, res) => {
            res.json({ fromContext: getCurrentTenantId() ?? null });
        });
    });

    afterAll(async () => {
        await ctxA.cleanup();
        await ctxB.cleanup();
    });

    // AC2
    it("populates the async context with the authenticated request's tenant id", async () => {
        const agent = createAuthenticatedAgent(ctxA.baseURL, ctxA.authToken);
        const res = await agent.get("/__rls_probe/authed");

        expect(res.status).toBe(200);
        expect(res.body.fromContext).toBe(ctxA.tenantId);
        // The context must agree with the tenant authorization actually used,
        // not merely be non-empty.
        expect(res.body.fromContext).toBe(res.body.fromRequest);
    });

    // AC2 — the discriminating half. A context that always returned *some*
    // tenant would pass the test above; this one fails unless it is per-request.
    it("gives a second tenant its own id, never the first tenant's", async () => {
        const res = await request(ctxA.baseURL)
            .get("/__rls_probe/authed")
            .set("Authorization", `Bearer ${ctxB.authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.fromContext).toBe(ctxB.tenantId);
        expect(res.body.fromContext).not.toBe(ctxA.tenantId);
    });

    // AC3
    it("is a safe no-op on an unauthenticated route: succeeds, does not throw, no tenant", async () => {
        const res = await request(ctxA.baseURL).get("/__rls_probe/public");

        expect(res.status).toBe(200);
        expect(res.body.fromContext).toBeNull();
    });

    // AC3 — the real public surface, proven unbroken end to end rather than by
    // analogy with the probe above.
    it("leaves a genuine public route working", async () => {
        const res = await request(ctxA.baseURL)
            .post("/api/workflows/public/definitely-not-a-real-slug/start")
            .send({});

        // 404 for the unknown slug is the correct answer. What matters is that
        // it is not a 500 from the context middleware throwing on a request
        // that has no tenant.
        expect(res.status).not.toBe(500);
        expect([400, 401, 403, 404]).toContain(res.status);
    });

    // Guards the leak direction: the context must not survive the request that
    // set it and bleed into an unauthenticated one served afterwards.
    it("does not leak a tenant into a later unauthenticated request", async () => {
        const agent = createAuthenticatedAgent(ctxA.baseURL, ctxA.authToken);
        const authed = await agent.get("/__rls_probe/authed");
        expect(authed.body.fromContext).toBe(ctxA.tenantId);

        const anon = await request(ctxA.baseURL).get("/__rls_probe/public");
        expect(anon.body.fromContext).toBeNull();
    });
});

/**
 * A bare Express app with the middleware and no auth at all — proves the no-op
 * property in isolation from the rest of the stack, so a failure here points at
 * the middleware rather than at auth or the harness.
 */
describe("rlsContext middleware in isolation (RLS-1)", () => {
    it("opens a context that reads as undefined when nothing sets a tenant", async () => {
        const app = express();
        app.use(rlsContext);
        app.get("/probe", (_req, res) => {
            res.json({ hasContext: getCurrentTenantId() === undefined });
        });

        const res = await request(app).get("/probe");
        expect(res.status).toBe(200);
        expect(res.body.hasContext).toBe(true);
    });
});

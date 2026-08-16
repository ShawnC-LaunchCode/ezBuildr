import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

import {
    setupIntegrationTest,
    createAuthenticatedAgent,
    type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { generateMarketplaceBundles } from "../../scripts/generateMarketplaceBundles";

/**
 * TM-2 vertical proof: GET /api/templates(/:id) through the real route chain
 * (hybridAuth -> requireTenant -> MarketplaceService -> CuratedCatalogProvider)
 * against the real generated `dist/marketplace/index.json`. Nothing here is
 * mocked - `beforeAll` runs the actual TM-1 generator (the same one `npm run
 * build` invokes) so this test is self-sufficient regardless of whether a
 * build already ran in this environment, exactly mirroring what a deployed
 * environment does: build once, then serve requests.
 */
describe.sequential("Marketplace catalog API (TM-2)", () => {
    let ctx: IntegrationTestContext;
    let agent: ReturnType<typeof createAuthenticatedAgent>;

    beforeAll(async () => {
        await generateMarketplaceBundles();
        ctx = await setupIntegrationTest();
        agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    // AC1
    it("GET /api/templates returns the three curated templates for an authenticated user", async () => {
        const res = await agent.get("/api/templates");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(3);

        const slugs = (res.body as Array<{ id: string }>).map((t) => t.id).sort();
        expect(slugs).toEqual(["intake-questionnaire", "nda", "retainer-agreement"]);

        for (const template of res.body as Array<Record<string, unknown>>) {
            expect(typeof template.title).toBe("string");
            expect((template.title as string).length).toBeGreaterThan(0);
            expect(typeof template.description).toBe("string");
            expect(typeof template.category).toBe("string");
        }
    });

    // AC2
    it("GET /api/templates/:id returns one curated template", async () => {
        const res = await agent.get("/api/templates/nda");

        expect(res.status).toBe(200);
        expect(res.body.id).toBe("nda");
        expect(res.body.category).toBe("legal");
        expect(typeof res.body.title).toBe("string");
    });

    // AC2
    it("GET /api/templates/:id 404s for an unknown id", async () => {
        const res = await agent.get("/api/templates/not-a-real-template");

        expect(res.status).toBe(404);
    });

    // Regression guard for the route collision this ticket found and fixed:
    // GET /api/templates/:id is also served by the Stage-4 document-templates
    // router, keyed by UUID. A UUID-shaped id must fall through to that
    // router unchanged, not be swallowed by the marketplace's own 404.
    it("does not intercept a UUID-shaped id - falls through to the document-templates route", async () => {
        const res = await agent.get("/api/templates/00000000-0000-0000-0000-000000000000");

        expect(res.status).toBe(404);
        // The marketplace 404 body is `{ error: "Template not found" }` (a
        // string); the document-templates route's is `{ error: { code,
        // message } }` (an object). An object here proves the request
        // reached the other router, not this one.
        expect(typeof res.body.error).toBe("object");
    });

    // AC3
    it("filters by category", async () => {
        const legal = await agent.get("/api/templates?category=legal");
        expect(legal.status).toBe(200);
        expect(legal.body).toHaveLength(3);

        // AC3 no-match case
        const none = await agent.get("/api/templates?category=does-not-exist");
        expect(none.status).toBe(200);
        expect(none.body).toEqual([]);
    });

    // AC3
    it("filters by search", async () => {
        // Search anchors to word starts, so "NDA" matches the NDA template and
        // NOT the retainer's description, which contains "cale(nda)r". A plain
        // substring match returned both — see matchesWholeWord.
        const byTitle = await agent.get("/api/templates?search=NDA");
        expect(byTitle.status).toBe(200);
        expect((byTitle.body as Array<{ id: string }>).map((t) => t.id)).toEqual(["nda"]);

        // Still a prefix search, not a whole-word one: "retain" finds "retainer".
        const byPrefix = await agent.get("/api/templates?search=retain");
        expect(byPrefix.status).toBe(200);
        expect((byPrefix.body as Array<{ id: string }>).map((t) => t.id)).toEqual([
            "retainer-agreement",
        ]);

        const byTag = await agent.get("/api/templates?search=confidentiality");
        expect(byTag.status).toBe(200);
        expect((byTag.body as Array<{ id: string }>).map((t) => t.id)).toEqual(["nda"]);

        // AC3 no-match case
        const none = await agent.get("/api/templates?search=no-such-template-exists-anywhere");
        expect(none.status).toBe(200);
        expect(none.body).toEqual([]);
    });

    it("requires authentication", async () => {
        const res = await request(ctx.baseURL).get("/api/templates");
        expect(res.status).toBe(401);
    });
});

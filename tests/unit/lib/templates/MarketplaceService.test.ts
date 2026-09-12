import { describe, it, expect, vi, beforeEach } from "vitest";

import { MarketplaceService } from "../../../../server/lib/templates/MarketplaceService";
import type { CatalogTemplate, TemplateCatalog } from "../../../../server/lib/templates/TemplateCatalog";
import { importService } from "../../../../server/services/portability/ImportService";

// MarketplaceService.installTemplate (TM-3) delegates to the real
// ImportService singleton, which needs a database - not appropriate for
// unit-fast. Mock the module so these tests stay DB-free and only assert
// MarketplaceService's own delegation logic; the real end-to-end behavior
// (cross-tenant denial, project-not-owned rejection, ...) is proven by
// tests/integration/api.marketplace.install.test.ts instead.
vi.mock("../../../../server/services/portability/ImportService", () => ({
    importService: { apply: vi.fn() },
}));

function makeFakeCatalog(templates: CatalogTemplate[], bundlePaths: Record<string, string> = {}): TemplateCatalog {
    return {
        listTemplates: vi.fn(async (params: { category?: string; search?: string }) => {
            return templates.filter((t) => {
                const categoryMatches = params.category === undefined || t.category === params.category;
                const searchMatches = params.search === undefined || t.title.includes(params.search);
                return categoryMatches && searchMatches;
            });
        }),
        getTemplate: vi.fn(async (id: string) => templates.find((t) => t.id === id) ?? null),
        getBundlePath: vi.fn(async (id: string) => bundlePaths[id] ?? null),
    };
}

const SAMPLE: CatalogTemplate[] = [
    { id: "nda", title: "Mutual NDA", description: "d1", category: "legal", tags: ["nda"] },
    { id: "retainer-agreement", title: "Retainer", description: "d2", category: "legal", tags: ["retainer"] },
];

describe("MarketplaceService (TM-2, TM-3)", () => {
    beforeEach(() => {
        vi.mocked(importService.apply).mockReset();
    });

    // AC4: MarketplaceService depends on a TemplateCatalog abstraction, not
    // file paths - a fake in-memory catalog can be injected and used directly.
    it("delegates listTemplates to the injected catalog, passing through category and search", async () => {
        const catalog = makeFakeCatalog(SAMPLE);
        const service = new MarketplaceService(catalog);

        const result = await service.listTemplates({ category: "legal", search: "NDA", isPublic: true });

        expect(catalog.listTemplates).toHaveBeenCalledWith({ category: "legal", search: "NDA" });
        expect(result).toEqual([SAMPLE[0]]);
    });

    it("delegates getTemplate to the injected catalog", async () => {
        const catalog = makeFakeCatalog(SAMPLE);
        const service = new MarketplaceService(catalog);

        const found = await service.getTemplate("retainer-agreement");
        expect(found).toEqual(SAMPLE[1]);

        const missing = await service.getTemplate("does-not-exist");
        expect(missing).toBeNull();
    });

    it("uses the real CuratedCatalogProvider singleton by default when no catalog is injected", async () => {
        const service = new MarketplaceService();
        // No assertion on contents - only that it doesn't throw when the
        // build artifact may or may not exist in this test environment.
        await expect(service.listTemplates({})).resolves.toBeInstanceOf(Array);
    });

    // AC5: publishTemplate still throws, so a later refactor cannot quietly
    // "enable" user publishing, which is explicitly out of scope for TM.
    it("publishTemplate still throws - user publishing remains out of scope", async () => {
        const service = new MarketplaceService(makeFakeCatalog(SAMPLE));

        await expect(
            service.publishTemplate("workflow-1", { title: "New Template" }, { userId: "user-1" })
        ).rejects.toThrow("Marketplace functionality not yet available");
    });

    // AC1: installTemplate delegates entirely to ImportService.apply (no
    // second importer), feeding it the catalog's bundle path, the caller's
    // userId, and the requested project as targetProjectId - and returns an
    // object carrying `id` (the client redirects to
    // `/workflows/${id}/builder`).
    it("installTemplate resolves the bundle path from the catalog and delegates to ImportService.apply", async () => {
        const catalog = makeFakeCatalog(SAMPLE, { nda: "/dist/marketplace/nda.ezb" });
        const service = new MarketplaceService(catalog);
        vi.mocked(importService.apply).mockResolvedValue({
            rootId: "new-workflow-id",
            scope: "workflow",
            tenantId: "tenant-1",
            entityCounts: {},
            warnings: [],
            blobsRestored: 1,
            adjustments: [],
        });

        const result = await service.installTemplate("nda", { userId: "user-1", projectId: "project-1" });

        expect(catalog.getBundlePath).toHaveBeenCalledWith("nda");
        expect(importService.apply).toHaveBeenCalledWith(
            "/dist/marketplace/nda.ezb",
            "user-1",
            { targetProjectId: "project-1" }
        );
        expect(result).toEqual({ id: "new-workflow-id" });
    });

    // Unknown template id: rejected before ever touching the importer.
    it("installTemplate throws 'Template not found' for an unknown id, without calling ImportService", async () => {
        const service = new MarketplaceService(makeFakeCatalog(SAMPLE));

        await expect(
            service.installTemplate("does-not-exist", { userId: "user-1", projectId: "project-1" })
        ).rejects.toThrow("Template not found");
        expect(importService.apply).not.toHaveBeenCalled();
    });

    // Errors ImportService throws (e.g. the caller lacking access to the
    // requested project) propagate unchanged, so the route's error
    // classification (message -> 403/404) still applies.
    it("installTemplate propagates ImportService's rejection unchanged", async () => {
        const catalog = makeFakeCatalog(SAMPLE, { nda: "/dist/marketplace/nda.ezb" });
        const service = new MarketplaceService(catalog);
        vi.mocked(importService.apply).mockRejectedValue(
            new Error("Access denied - insufficient permissions for target project")
        );

        await expect(
            service.installTemplate("nda", { userId: "user-1", projectId: "someone-elses-project" })
        ).rejects.toThrow("Access denied - insufficient permissions for target project");
    });
});

import { describe, it, expect, vi } from "vitest";

import { MarketplaceService } from "../../../../server/lib/templates/MarketplaceService";
import type { CatalogTemplate, TemplateCatalog } from "../../../../server/lib/templates/TemplateCatalog";

function makeFakeCatalog(templates: CatalogTemplate[]): TemplateCatalog {
    return {
        listTemplates: vi.fn(async (params: { category?: string; search?: string }) => {
            return templates.filter((t) => {
                const categoryMatches = params.category === undefined || t.category === params.category;
                const searchMatches = params.search === undefined || t.title.includes(params.search);
                return categoryMatches && searchMatches;
            });
        }),
        getTemplate: vi.fn(async (id: string) => templates.find((t) => t.id === id) ?? null),
    };
}

const SAMPLE: CatalogTemplate[] = [
    { id: "nda", title: "Mutual NDA", description: "d1", category: "legal", tags: ["nda"] },
    { id: "retainer-agreement", title: "Retainer", description: "d2", category: "legal", tags: ["retainer"] },
];

describe("MarketplaceService (TM-2)", () => {
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

    it("installTemplate still throws (TM-3 scope, not implemented here)", async () => {
        const service = new MarketplaceService(makeFakeCatalog(SAMPLE));

        await expect(
            service.installTemplate("nda", { userId: "user-1", projectId: "project-1" })
        ).rejects.toThrow("Marketplace functionality not yet available");
    });
});

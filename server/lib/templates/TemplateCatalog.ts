/**
 * Provider-shaped abstraction over "where the marketplace gallery's template
 * list comes from" (TM-2).
 *
 * Today there is exactly one implementation, `CuratedCatalogProvider`, which
 * serves TM-1's build-time generated `dist/marketplace/index.json`. The
 * interface exists so `MarketplaceService` never has to know that, and so a
 * future database-backed provider (user publishing, explicitly out of scope
 * here — see `tickets/TEMPLATE_MARKETPLACE_TICKETS.md`'s "Decisions already
 * made") can be added and unioned with this one later without touching
 * routes or the client.
 */
export interface CatalogTemplate {
    id: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
}

export interface TemplateCatalogListParams {
    category?: string;
    search?: string;
}

export interface TemplateCatalog {
    listTemplates(params: TemplateCatalogListParams): Promise<CatalogTemplate[]>;
    getTemplate(id: string): Promise<CatalogTemplate | null>;
}

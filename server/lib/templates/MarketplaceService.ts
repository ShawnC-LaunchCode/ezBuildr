import { logger } from "../../logger";
import { importService } from "../../services/portability/ImportService";

import { curatedCatalogProvider } from "./CuratedCatalogProvider";
import type { CatalogTemplate, TemplateCatalog } from "./TemplateCatalog";
import type { TemplateManifest } from "./types";
export class MarketplaceService {
    private readonly catalog: TemplateCatalog;

    constructor(catalog?: TemplateCatalog) {
        this.catalog = catalog ?? curatedCatalogProvider;
    }

    /**
     * List available templates with filtering.
     *
     * Delegates to a `TemplateCatalog` (today, `CuratedCatalogProvider` —
     * TM-1's build-time generated curated bundles). `isPublic`,
     * `organizationId`, `limit` and `offset` are accepted for route-shape
     * compatibility but not meaningful for a code-shipped, tenant-less
     * catalog; a future database-backed provider (user publishing, out of
     * scope here) can honour them without this signature changing.
     */
    async listTemplates(params: {
        category?: string;
        search?: string;
        isPublic?: boolean;
        organizationId?: string;
        limit?: number;
        offset?: number;
    }): Promise<CatalogTemplate[]> {
        return this.catalog.listTemplates({ category: params.category, search: params.search });
    }

    /**
     * Get a specific template by ID. Returns `null` when not found — the
     * route maps that to a 404.
     */
    async getTemplate(templateId: string): Promise<CatalogTemplate | null> {
        return this.catalog.getTemplate(templateId);
    }
    /**
     * Publish a workflow as a new template
     * TODO: Implement once marketplaceTemplates table is added to schema
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async publishTemplate(
        _workflowId: string,
        _metadata: Partial<TemplateManifest>,
        _userContext: { userId: string, organizationId?: string }
    ) {
        logger.warn('MarketplaceService.publishTemplate: marketplaceTemplates table not yet implemented');
        throw new Error('Marketplace functionality not yet available');
    }
    /**
     * Install a curated template into the caller's own tenant and the
     * requested project (TM-3).
     *
     * Delegates entirely to `ImportService.apply` — no second importer. The
     * generated bundle's `creatorId`/`ownerId`/`tenantId`/`projectId`
     * columns hold only a well-formed placeholder UUID (see
     * `generateMarketplaceBundles.ts`'s `PLACEHOLDER_ID`), never a real row:
     * `ImportService.enforceOwnership` unconditionally overwrites every
     * owner/tenant column with the caller's own identity, and passing
     * `targetProjectId` makes `resolveProjectIdOverride` overwrite
     * `workflows.projectId`/`templates.projectId` with the requested
     * project regardless of what the bundle carried. So the installed
     * workflow can never end up attributed to the placeholder.
     *
     * The tenant boundary is `ImportService`'s own explicit check —
     * `resolveTargetOwnerForProject` proves the caller has `edit` access to
     * `targetProjectId` (and, for an org-owned project, org-admin rights)
     * before anything is written, and throws "Target project not found" /
     * "Access denied - ..." otherwise. Tenancy is service-layer only here
     * (RLS is not enforced), so this check — not a database backstop — is
     * what makes the created workflow always land in the caller's own
     * tenant and never in someone else's project.
     *
     * Two installs of the same template are entirely independent: each call
     * re-runs `ImportService.apply`, which mints fresh ids for every row.
     *
     * @returns An object carrying `id` — the new workflow's id, which the
     * client redirects to (`/workflows/${id}/builder`).
     */
    async installTemplate(
        templateId: string,
        userContext: { userId: string, projectId: string }
    ): Promise<{ id: string }> {
        const bundlePath = await this.catalog.getBundlePath(templateId);
        if (bundlePath === null) {
            throw new Error('Template not found');
        }
        const result = await importService.apply(bundlePath, userContext.userId, {
            targetProjectId: userContext.projectId,
        });
        return { id: result.rootId };
    }
}
export const marketplaceService = new MarketplaceService();
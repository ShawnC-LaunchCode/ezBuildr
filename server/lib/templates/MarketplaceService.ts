import { eq } from "drizzle-orm";

import {
    workflows,
} from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";

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
     * Export a workflow as a template manifest
     */
    async exportTemplate(workflowId: string): Promise<TemplateManifest> {
        // 1. Fetch workflow and its current version
        const workflow = await db.query.workflows.findFirst({
            where: eq(workflows.id, workflowId),
            with: {
                currentVersion: true
            }
        });
        if (!workflow?.currentVersion) {
            throw new Error("Workflow not found or has no versions");
        }
        // 2. Fetch the graph definition
        // In a real implementation, we might need to sanitize this (remove secrets, sensitive data)
        const graphJson = workflow.currentVersion.graphJson;
        // 3. Construct manifest
        const manifest: TemplateManifest = {
            title: workflow.title ?? "Untitled Workflow",
            description: workflow.description ?? "",
            category: "general",
            tags: [],
            version: "1.0.0",
            author: workflow.creatorId ?? '',
            minCompatibleVersion: "1.0.0",
            requiredBlocks: [], // Would analyze graph to find types
            requiredFeatures: [],
            workflow: graphJson,
            createdAt: new Date().toISOString()
        };
        return manifest;
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
     * Import a template to create a new workflow
     * TODO: Implement once marketplaceTemplates table is added to schema
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async installTemplate(
        _templateId: string,
        _userContext: { userId: string, projectId: string }
    ) {
        logger.warn('MarketplaceService.installTemplate: marketplaceTemplates table not yet implemented');
        throw new Error('Marketplace functionality not yet available');
    }
}
export const marketplaceService = new MarketplaceService();
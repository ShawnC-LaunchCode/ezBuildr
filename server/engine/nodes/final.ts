import { eq } from 'drizzle-orm';
import * as schema from '@shared/schema';
import type { FinalBlockConfig } from '@shared/types/stepConfigs';
import { db } from '../../db';
import { finalBlockRenderer, createTemplateResolver, FinalBlockRenderRequest } from '../../services/document/FinalBlockRenderer';
import type { EvalContext } from '../expr';
/**
 * Final Block Executor
 * 
 * Terminal node that generates documents using the FinalBlockRenderer.
 * Supports both Live (persist) and Preview/Snapshot (ephemeral) modes.
 */
export interface FinalBlockInput {
    nodeId: string;
    config: FinalBlockConfig;
    context: EvalContext;
    tenantId: string;
    runId?: string;
    workflowVersionId?: string;
}
export type { FinalBlockConfig };
export interface FinalBlockOutput {
    status: 'executed' | 'skipped' | 'error';
    generatedDocuments?: Array<{
        alias: string;
        filename: string;
        filePath: string;
        size: number;
        mimeType: string;
    }>;
    archive?: {
        filename: string;
        filePath: string;
        size: number;
    };
    markdownContent?: string;
    skipReason?: string;
    error?: string;
    durationMs?: number;
}
export async function executeFinalNode(input: FinalBlockInput): Promise<FinalBlockOutput> {
    const { nodeId, config, context, tenantId, runId, workflowVersionId } = input;
    const startTime = Date.now();
    try {
        // 1. Resolve Markdown content (if any)
        let markdownContent = config.markdownHeader || '';
        if (markdownContent) {
            // Simple interpolation for now, could use evaluateExpression for more complex templates if needed
            markdownContent = markdownContent.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
                return context.vars[varName] !== undefined ? String(context.vars[varName]) : match;
            });
        }
        // 2. Prepare Step Values for Renderer
        // The renderer expects global context variables.
        // The renderer internally uses the config.documents[].mapping to resolve specific fields if needed,
        // although looking at FinalBlockRenderer, it often passes stepValues directly to the doc engine.
        // We pass context.vars as the source of truth.
        // 3. Template Resolver
        const templateResolver = createTemplateResolver(async (id) => {
            const template = await db.query.templates.findFirst({
                where: eq(schema.templates.id, id),
                with: { project: true }
            });
            return template && template.project.tenantId === tenantId ? { fileRef: template.fileRef } : null;
        });
        // 4. Render
        const request: FinalBlockRenderRequest = {
            finalBlockConfig: config,
            stepValues: context.vars,
            workflowId: context.workflowId || 'unknown',
            runId: runId || `preview-${Date.now()}`,
            resolveTemplate: templateResolver,
            toPdf: false // Default to false for now
        };
        const renderResult = await finalBlockRenderer.render(request);
        // 5. Build Output
        // Partial failure handling is implicitly managed by returning what succeeded.
        return {
            status: 'executed',
            generatedDocuments: renderResult.documents,
            archive: renderResult.archive,
            markdownContent,
            durationMs: Date.now() - startTime
        };
    } catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error executing Final Block',
            durationMs: Date.now() - startTime
        };
    }
}
/**
 * TemplateParser — thin compatibility wrapper around RenderCore.
 *
 * Historically one of three drifted docxtemplater implementations (this one
 * shipped the /s+/ helper-parsing bug). All rendering now lives in
 * RenderCore.ts; keep using that for new code.
 */

import { renderDocxBuffer } from './RenderCore';

export interface TemplateParserOptions {
    templatePath: string;
    templateBuffer?: Buffer;
    data: Record<string, unknown>;
    unresolvedVariables?: string[];
    workflowSettings?: unknown;
}

export class TemplateParser {
    /**
     * Render a DOCX template with data
     */
    async render(options: TemplateParserOptions): Promise<Buffer> {
        return renderDocxBuffer(options);
    }
}

/**
 * Template Test Service
 * PR4: Template testing orchestration with stub implementations
 *
 * Handles template validation and rendering for the test runner.
 * Uses real services where available, stubs where not yet implemented.
 */

import { analyzeTemplate, type TemplateAnalysis } from './TemplateAnalysisService';
import { renderDocx, type RenderResult } from './docxRenderer';
import { createError } from '../utils/errors';
import { logger } from '../logger';
import path from 'path';
import fs from 'fs/promises';

export interface TemplateTestRequest {
  workflowId: string;
  templateId: string;
  outputType: 'docx' | 'pdf' | 'both';
  sampleData: Record<string, any>;
}

export interface TemplateTestError {
  code: string;
  message: string;
  placeholder?: string;
  path?: string;
}

export interface TemplateTestResult {
  ok: boolean;
  status: 'validated' | 'rendered' | 'error';
  durationMs: number;
  errors?: TemplateTestError[];
  docxUrl?: string;
  pdfUrl?: string;
  analysis?: {
    variableCount: number;
    loopCount: number;
    conditionalCount: number;
  };
}

export class TemplateTestService {
  /**
   * Run a template test with sample data
   */
  async runTest(request: TemplateTestRequest): Promise<TemplateTestResult> {
    const startTime = Date.now();

    try {
      // 1. Validate JSON (already done by caller, but double-check)
      if (!request.sampleData || typeof request.sampleData !== 'object') {
        return {
          ok: false,
          status: 'error',
          durationMs: Date.now() - startTime,
          errors: [
            {
              code: 'INVALID_JSON',
              message: 'Sample data must be a valid JSON object',
            },
          ],
        };
      }

      // 2. Get template file path (STUB - will be replaced with actual template lookup)
      const templatePath = await this.getTemplatePath(request.templateId);

      if (!templatePath) {
        return {
          ok: false,
          status: 'error',
          durationMs: Date.now() - startTime,
          errors: [
            {
              code: 'TEMPLATE_NOT_FOUND',
              message: `Template ${request.templateId} not found`,
            },
          ],
        };
      }

      // 3. Analyze template (if analysis service available)
      let analysis: TemplateAnalysis | undefined;
      try {
        // STUB: For now, skip analysis if template doesn't exist yet
        // In real implementation, this would call analyzeTemplate(templatePath)
        logger.info({ templateId: request.templateId }, 'Skipping template analysis (stub)');
      } catch (error) {
        logger.warn({ error, templateId: request.templateId }, 'Template analysis failed (non-fatal)');
      }

      // 4. Render DOCX
      let renderResult: RenderResult | undefined;
      let docxUrl: string | undefined;
      let pdfUrl: string | undefined;

      try {
        // STUB: Create a simple stub DOCX for now
        renderResult = await this.stubRenderDocx(request.templateId, request.sampleData);

        // Create URLs for the generated files
        if (renderResult.docxPath) {
          docxUrl = `/api/files/test-outputs/${path.basename(renderResult.docxPath)}`;
        }

        // 5. Convert to PDF if requested (STUB)
        if ((request.outputType === 'pdf' || request.outputType === 'both') && renderResult.docxPath) {
          const pdfPath = await this.stubConvertToPdf(renderResult.docxPath);
          if (pdfPath) {
            pdfUrl = `/api/files/test-outputs/${path.basename(pdfPath)}`;
          }
        }

        const durationMs = Date.now() - startTime;

        return {
          ok: true,
          status: 'rendered',
          durationMs,
          docxUrl: request.outputType !== 'pdf' ? docxUrl : undefined,
          pdfUrl: request.outputType !== 'docx' ? pdfUrl : undefined,
          analysis: analysis
            ? {
                variableCount: analysis.stats.uniqueVariables,
                loopCount: analysis.stats.loopCount,
                conditionalCount: analysis.stats.conditionalCount,
              }
            : undefined,
        };
      } catch (error) {
        logger.error({ error, templateId: request.templateId }, 'Template rendering failed');

        return {
          ok: false,
          status: 'error',
          durationMs: Date.now() - startTime,
          errors: [
            {
              code: 'RENDER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to render template',
            },
          ],
        };
      }
    } catch (error) {
      logger.error({ error, request }, 'Template test failed');

      return {
        ok: false,
        status: 'error',
        durationMs: Date.now() - startTime,
        errors: [
          {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        ],
      };
    }
  }

  /**
   * Get template file path (STUB)
   * TODO: Replace with actual template repository lookup
   */
  private async getTemplatePath(templateId: string): Promise<string | null> {
    // STUB: Return a dummy path
    // In real implementation, this would look up the template in the database
    // and return the actual file path
    return `/tmp/template-${templateId}.docx`;
  }

  /**
   * Stub DOCX renderer
   * TODO: Replace with actual renderDocx call when templates exist
   */
  private async stubRenderDocx(
    templateId: string,
    data: Record<string, any>
  ): Promise<RenderResult> {
    const outputDir = path.join(process.cwd(), 'server', 'files', 'test-outputs');
    await fs.mkdir(outputDir, { recursive: true });

    const outputFileName = `test-${templateId}-${Date.now()}.docx`;
    const outputPath = path.join(outputDir, outputFileName);

    // Create a dummy DOCX file (just an empty file for now)
    await fs.writeFile(
      outputPath,
      `STUB DOCX: Template ${templateId} rendered with data: ${JSON.stringify(data, null, 2)}`
    );

    const stats = await fs.stat(outputPath);

    return {
      docxPath: outputPath,
      size: stats.size,
    };
  }

  /**
   * Stub PDF converter
   * TODO: Replace with actual PDF conversion when implemented
   */
  private async stubConvertToPdf(docxPath: string): Promise<string | null> {
    const pdfPath = docxPath.replace('.docx', '.pdf');

    // Create a dummy PDF file
    await fs.writeFile(pdfPath, `STUB PDF: Converted from ${path.basename(docxPath)}`);

    return pdfPath;
  }
}

// Singleton instance
export const templateTestService = new TemplateTestService();

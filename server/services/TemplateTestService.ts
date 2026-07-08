/**
 * Template Test Service
 * PR4: Template testing orchestration with stub implementations
 *
 * Handles template validation and rendering for the test runner.
 * Uses real services where available, stubs where not yet implemented.
 */
import path from 'path';

import { logger } from '../logger';

import { enhancedDocumentEngine } from './document/EnhancedDocumentEngine';
import { type TemplateAnalysis } from './TemplateAnalysisService';
export interface TemplateTestRequest {
  workflowId: string;
  templateId: string;
  outputType: 'docx' | 'pdf' | 'both';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sample data is dynamically typed workflow data
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
  // eslint-disable-next-line sonarjs/cognitive-complexity -- template test orchestration with multiple validation/render/error steps
  async runTest(request: TemplateTestRequest): Promise<TemplateTestResult> {
    const startTime = Date.now();
    try {
      // 1. Validate JSON (already done by caller, but double-check)
      if (request.sampleData === null || request.sampleData === undefined || typeof request.sampleData !== 'object') {
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
      // eslint-disable-next-line @typescript-eslint/await-thenable
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
      let renderResult: { docxPath: string, pdfPath?: string, size: number } | undefined;
      let docxUrl: string | undefined;
      let pdfUrl: string | undefined;
      try {
        // Use real renderDocx via helper
        const toPdf = request.outputType === 'pdf' || request.outputType === 'both';
        renderResult = await this.renderTemplateInternal(
          request.templateId,
          request.sampleData,
          toPdf
        );
        // Create URLs for the generated files
        if (renderResult.docxPath) {
          docxUrl = `/api/files/test-outputs/${path.basename(renderResult.docxPath)}`;
        }
        if (renderResult.pdfPath) {
          pdfUrl = `/api/files/test-outputs/${path.basename(renderResult.pdfPath)}`;
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
  private getTemplatePath(templateId: string): string | null {
    // STUB: Return a dummy path
    // In real implementation, this would look up the template in the database
    // and return the actual file path
    return `/tmp/template-${templateId}.docx`;
  }
  /**
   * Stub DOCX renderer
   * TODO: Replace with actual renderDocx call when templates exist
   */
  /*
   * Render DOCX using the real renderer
   */
  private async renderTemplateInternal(
    templateId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data is dynamically typed workflow data
    data: Record<string, any>,
    toPdf: boolean
  ): Promise<{ docxPath: string, pdfPath?: string, size: number }> {
    // In real implementation, this would look up the template in the database
    // For now, we still need a template path. 
    // We will assume the template is at a fixed location or use a dummy for testing if not found.
    // But better to fail if not found.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const templatePath = await this.getTemplatePath(templateId);
    if (!templatePath) {
      throw new Error(`Template ${templateId} not found`);
    }
    // Use the enhanced document engine
    return enhancedDocumentEngine.generateWithMapping({
      templatePath,
      rawData: data,
      outputName: `test-render-${templateId}`,
      toPdf,
      normalize: false // Assume test data is already prepared
    });
  }
  /**
   * Convert DOCX to PDF using real converter
   */
  private async _stubConvertToPdf(_docxPath: string): Promise<string | null> {
    return null; // Placeholder
  }
}
// Singleton instance
export const templateTestService = new TemplateTestService();
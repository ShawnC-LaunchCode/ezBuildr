/**
 * Template Test Service
 *
 * Backs the Templates Test Runner: renders a template with caller-supplied
 * sample data and returns download URLs plus template analysis.
 */
import path from 'path';

import { logger } from '../logger';
import { documentTemplateRepository } from '../repositories';

import { enhancedDocumentEngine } from './document/EnhancedDocumentEngine';
import { analyzeTemplate, type TemplateAnalysis } from './TemplateAnalysisService';
import { getTemplateFilePath, templateFileExists } from './templateFiles';

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

      // 2. Resolve the template's file path from the database
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

      // 3. Analyze template (non-fatal: analysis enriches the result)
      let analysis: TemplateAnalysis | undefined;
      try {
        analysis = await analyzeTemplate(templatePath);
      } catch (error) {
        logger.warn({ error, templateId: request.templateId }, 'Template analysis failed (non-fatal)');
      }

      // 4. Render
      try {
        const toPdf = request.outputType === 'pdf' || request.outputType === 'both';
        const renderResult = await enhancedDocumentEngine.generateWithMapping({
          templatePath,
          rawData: request.sampleData,
          outputName: `test-render-${request.templateId}`,
          toPdf,
          normalize: false, // test data is already prepared by the caller
        });

        const docxUrl = renderResult.docxPath
          ? `/api/files/download/${path.basename(renderResult.docxPath)}`
          : undefined;
        const pdfUrl = renderResult.pdfPath
          ? `/api/files/download/${path.basename(renderResult.pdfPath)}`
          : undefined;

        return {
          ok: true,
          status: 'rendered',
          durationMs: Date.now() - startTime,
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
   * Look up the template row and return its on-disk file path, or null when
   * the template (or its file) does not exist. Workflow-level authorization
   * happens at the route.
   */
  private async getTemplatePath(templateId: string): Promise<string | null> {
    const template = await documentTemplateRepository.findById(templateId);
    if (!template) {
      return null;
    }
    const exists = await templateFileExists(template.fileRef);
    if (!exists) {
      logger.warn({ templateId, fileRef: template.fileRef }, 'Template row exists but file is missing');
      return null;
    }
    return getTemplateFilePath(template.fileRef);
  }
}
// Singleton instance
export const templateTestService = new TemplateTestService();

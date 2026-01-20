/**
 * Final Block Renderer
 *
 * Main pipeline for rendering Final Block documents. This service orchestrates:
 * - Template loading
 * - Document generation with mapping
 * - Conditional document filtering
 * - Multi-document ZIP bundling
 * - File persistence and cleanup
 *
 * This is the primary entry point for Final Block document generation from API endpoints.
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import { promises as fs } from 'fs';
import path from 'path';

import { createLogger } from '../../logger.js';
import { createError } from '../../utils/errors.js';
import { documentHookService } from '../scripting/DocumentHookService.js';

import { enhancedDocumentEngine } from './EnhancedDocumentEngine.js';
import { createFinalBlockZip, type ZipDocument, type ZipResult } from './ZipBundler.js';

import type { EnhancedGenerationResult, FinalBlockRenderResult } from './EnhancedDocumentEngine.js';
import type { FinalBlockConfig } from '../../../shared/types/stepConfigs.js';


const logger = createLogger({ module: 'finalBlock-renderer' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Final Block rendering request
 */
export interface FinalBlockRenderRequest {
  /** Final Block configuration */
  finalBlockConfig: FinalBlockConfig;

  /** Step values from workflow run */
  stepValues: Record<string, any>;

  /** Workflow ID (for metadata) */
  workflowId: string;

  /** Run ID (for metadata and file naming) */
  runId: string;

  /** Template resolver function */
  resolveTemplate: (documentId: string) => Promise<string>;

  /** Whether to convert documents to PDF */
  toPdf?: boolean;

  /** PDF conversion strategy */
  pdfStrategy?: 'puppeteer' | 'libreoffice';

  /** Output directory (optional, defaults to server/files/archives) */
  outputDir?: string;
}

/**
 * Final Block rendering response
 */
export interface FinalBlockRenderResponse {
  /** Generated documents */
  documents: Array<{
    alias: string;
    filename: string;
    filePath: string;
    mimeType: string;
    size: number;
  }>;

  /** ZIP archive (if multiple documents) */
  archive?: {
    filename: string;
    filePath: string;
    size: number;
  };

  /** Documents that were skipped */
  skipped: string[];

  /** Documents that failed */
  failed: Array<{
    alias: string;
    error: string;
  }>;

  /** Total documents attempted */
  totalAttempted: number;

  /** Total documents generated */
  totalGenerated: number;

  /** Whether a ZIP archive was created */
  isArchived: boolean;
}

// ============================================================================
// MAIN RENDERER CLASS
// ============================================================================

/**
 * Final Block Renderer
 *
 * Orchestrates the complete document generation pipeline for Final Blocks.
 */
export class FinalBlockRenderer {
  /**
   * Render Final Block documents
   *
   * Main entry point for Final Block rendering. Handles:
   * 1. Template resolution
   * 2. Document generation
   * 3. ZIP bundling (if multiple documents)
   * 4. File persistence
   *
   * @param request - Rendering request
   * @returns Rendering response with file paths and metadata
   */
  async render(request: FinalBlockRenderRequest): Promise<FinalBlockRenderResponse> {
    const {
      finalBlockConfig,
      stepValues,
      workflowId,
      runId,
      resolveTemplate,
      toPdf = false,
      outputDir = path.join(process.cwd(), 'server', 'files', 'archives'),
    } = request;

    logger.info({
      workflowId,
      runId,
      documentCount: finalBlockConfig.documents.length,
      toPdf,
    }, 'Rendering Final Block');

    // Validate configuration
    if (!finalBlockConfig.documents || finalBlockConfig.documents.length === 0) {
      throw createError.validation('Final Block has no documents configured');
    }

    // Step 1: Resolve all template paths
    const documentsWithPaths = await this.resolveTemplatePaths(
      finalBlockConfig.documents,
      resolveTemplate
    );

    logger.debug({
      count: documentsWithPaths.length,
    }, 'Template paths resolved');

    // Step 1.5: Execute beforeGeneration document hooks
    let enhancedStepValues = stepValues;
    try {
      const beforeHooksResult = await documentHookService.executeHooksForPhase({
        workflowId,
        runId,
        phase: 'beforeGeneration',
        data: stepValues,
      });

      enhancedStepValues = beforeHooksResult.data;

      if (beforeHooksResult.errors && beforeHooksResult.errors.length > 0) {
        logger.warn({
          errors: beforeHooksResult.errors,
        }, 'Document hooks (beforeGeneration) had errors');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to execute beforeGeneration hooks');
      // Non-breaking: continue with original stepValues
    }

    // Step 2: Generate documents
    const generationResult = await enhancedDocumentEngine.renderFinalBlock({
      documents: documentsWithPaths,
      stepValues: enhancedStepValues,
      outputDir,
      toPdf,
    });

    logger.info({
      generated: generationResult.totalGenerated,
      skipped: generationResult.skipped.length,
      failed: generationResult.failed.length,
    }, 'Document generation complete');

    // Step 2.5: Execute afterGeneration document hooks
    try {
      const afterHooksResult = await documentHookService.executeHooksForPhase({
        workflowId,
        runId,
        phase: 'afterGeneration',
        data: enhancedStepValues,
      });

      if (afterHooksResult.errors && afterHooksResult.errors.length > 0) {
        logger.warn({
          errors: afterHooksResult.errors,
        }, 'Document hooks (afterGeneration) had errors');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to execute afterGeneration hooks');
      // Non-breaking: continue with document processing
    }

    // Step 3: Prepare response documents
    const documents = await this.prepareResponseDocuments(
      generationResult.documents,
      toPdf
    );

    // Step 4: Create ZIP archive if multiple documents
    let archive: FinalBlockRenderResponse['archive'] | undefined;
    const isArchived = documents.length > 1;

    if (isArchived) {
      try {
        archive = await this.createArchive(
          generationResult.documents,
          workflowId,
          runId,
          outputDir,
          toPdf
        );

        logger.info({
          filename: archive.filename,
          size: archive.size,
        }, 'ZIP archive created');
      } catch (error) {
        logger.error({ error }, 'Failed to create ZIP archive');
        // Continue without archive - individual files still available
      }
    }

    // Step 5: Build response
    const response: FinalBlockRenderResponse = {
      documents,
      archive,
      skipped: generationResult.skipped.map(s => s.alias),
      failed: generationResult.failed,
      totalAttempted: generationResult.totalAttempted,
      totalGenerated: generationResult.totalGenerated,
      isArchived,
    };

    logger.info(response, 'Final Block rendering complete');

    return response;
  }

  /**
   * Resolve template file paths for all documents
   */
  private async resolveTemplatePaths(
    documents: FinalBlockConfig['documents'],
    resolveTemplate: (documentId: string) => Promise<string>
  ): Promise<Array<{
    documentId: string;
    templatePath: string;
    alias: string;
    mapping: FinalBlockConfig['documents'][0]['mapping'];
    conditions: FinalBlockConfig['documents'][0]['conditions'];
  }>> {
    const resolved = [];

    for (const doc of documents) {
      try {
        const templatePath = await resolveTemplate(doc.documentId);

        // Verify template file exists
        await fs.access(templatePath);

        resolved.push({
          documentId: doc.documentId,
          templatePath,
          alias: doc.alias,
          mapping: doc.mapping,
          conditions: doc.conditions,
        });
      } catch (error) {
        logger.error({
          documentId: doc.documentId,
          alias: doc.alias,
          error,
        }, 'Failed to resolve template');
        throw createError.notFound(
          'Template',
          doc.alias,
          { documentId: doc.documentId }
        );
      }
    }

    return resolved;
  }

  /**
   * Prepare response documents from generation results
   */
  private async prepareResponseDocuments(
    results: EnhancedGenerationResult[],
    toPdf: boolean
  ): Promise<FinalBlockRenderResponse['documents']> {
    const documents: FinalBlockRenderResponse['documents'] = [];

    for (const result of results) {
      // Prefer PDF if generated, otherwise use DOCX
      const filePath = toPdf && result.pdfPath ? result.pdfPath : result.docxPath;
      const filename = path.basename(filePath);
      const mimeType = filePath.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const stats = await fs.stat(filePath);

      documents.push({
        alias: result.alias || 'document',
        filename,
        filePath,
        mimeType,
        size: stats.size,
      });
    }

    return documents;
  }

  /**
   * Create ZIP archive for multiple documents
   */
  private async createArchive(
    results: EnhancedGenerationResult[],
    workflowId: string,
    runId: string,
    outputDir: string,
    toPdf: boolean
  ): Promise<NonNullable<FinalBlockRenderResponse['archive']>> {
    const zipDocuments: ZipDocument[] = [];

    // Read all generated files into memory for zipping
    for (const result of results) {
      const filePath = toPdf && result.pdfPath ? result.pdfPath : result.docxPath;
      const filename = path.basename(filePath);
      const buffer = await fs.readFile(filePath);
      const mimeType = filePath.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      zipDocuments.push({
        filename,
        buffer,
        mimeType,
        size: buffer.length,
      });
    }

    // Create ZIP archive
    const zipResult: ZipResult = await createFinalBlockZip(
      zipDocuments,
      workflowId,
      runId,
      {
        'Document Count': String(zipDocuments.length),
        'Format': toPdf ? 'PDF' : 'DOCX',
      }
    );

    // Save ZIP to disk
    await fs.mkdir(outputDir, { recursive: true });
    const zipPath = path.join(outputDir, zipResult.filename);
    await fs.writeFile(zipPath, zipResult.buffer);

    return {
      filename: zipResult.filename,
      filePath: zipPath,
      size: zipResult.size,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton instance for reuse across application
 */
export const finalBlockRenderer = new FinalBlockRenderer();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Render Final Block documents (convenience function)
 *
 * @param request - Rendering request
 * @returns Rendering response
 */
export async function renderFinalBlock(
  request: FinalBlockRenderRequest
): Promise<FinalBlockRenderResponse> {
  return finalBlockRenderer.render(request);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a simple template resolver from template repository
 *
 * @param getTemplateById - Function to fetch template by ID
 * @returns Template resolver function
 */
export function createTemplateResolver(
  getTemplateById: (id: string) => Promise<{ fileRef: string } | null>
): (documentId: string) => Promise<string> {
  return async (documentId: string) => {
    const template = await getTemplateById(documentId);

    if (!template) {
      throw createError.notFound('Template', documentId);
    }

    // Construct full path to template file
    const templatesDir = path.join(process.cwd(), 'server', 'files');
    return path.join(templatesDir, template.fileRef);
  };
}

/**
 * Cleanup generated files after a specified delay
 *
 * Useful for temporary file cleanup after download.
 *
 * @param filePaths - Paths to files to delete
 * @param delayMs - Delay before deletion (default: 1 hour)
 */
export async function scheduleCleanup(
  filePaths: string[],
  delayMs: number = 60 * 60 * 1000 // 1 hour
): Promise<void> {
  setTimeout(async () => {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        logger.debug({ filePath }, 'Cleaned up temporary file');
      } catch (error) {
        logger.warn({ filePath, error }, 'Failed to cleanup file');
      }
    }
  }, delayMs);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  FinalBlockRenderer,
  finalBlockRenderer,
  renderFinalBlock,
  createTemplateResolver,
  scheduleCleanup,
};

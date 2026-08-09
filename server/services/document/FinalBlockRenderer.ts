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

import { getTemplateFilePath } from '../templateFiles.js';
import { validateTemplateWithData } from '../TemplateAnalysisService.js';
import { enhancedDocumentEngine } from './EnhancedDocumentEngine.js';
import { createFinalBlockZip, type ZipDocument, type ZipResult } from './ZipBundler.js';
import { storageProvider } from '../storage/index.js';

import type { EnhancedGenerationResult } from './EnhancedDocumentEngine.js';
import type { PdfConversionNotice, PdfStrategyName } from './PdfConverter.js';
import type { NormalizationOptions } from './VariableNormalizer.js';
import type { FinalBlockConfig, FinalDocumentOutputFormat } from '../../../shared/types/stepConfigs.js';


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
  stepValues: Record<string, unknown>;

  /** Workflow ID (for metadata) */
  workflowId: string;

  /** Run ID (for metadata and file naming) */
  runId: string;

  /** Template resolver function */
  resolveTemplate: (documentId: string) => Promise<string>;

  /** Whether to convert documents to PDF */
  toPdf?: boolean;

  /** Output directory (optional, defaults to server/files/archives) */
  outputDir?: string;

  /** Variable normalization metadata, including List configs by alias. */
  normalizationOptions?: NormalizationOptions;

  /** Tenant scope for resolving `datavault` mapping bindings (GH-156). */
  tenantId?: string;
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
    storageKey: string;
    mimeType: string;
    size: number;
    unresolvedVariables?: string[];
    /** The converter that actually produced the PDF, observed at generation time. */
    pdfStrategy?: PdfStrategyName;
    /** True when the high-fidelity converter failed and a degraded one produced the PDF. */
    pdfFellBack?: boolean;
    pdfFailed?: boolean;
    /** Safe, actionable explanation of a degraded or failed PDF conversion. */
    pdfNotice?: PdfConversionNotice;
  }>;

  /** ZIP archive (if multiple documents) */
  archive?: {
    filename: string;
    filePath: string;
    storageKey: string;
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
      normalizationOptions,
      tenantId,
      // DEBT-15: intentionally ephemeral. This is only the scratch directory the
      // renderer writes into while building a document; the bytes are uploaded to
      // storageProvider in prepareResponseDocuments and unlinked from here before
      // this method returns. Nothing durable may be read back out of this path.
      outputDir = path.join(process.cwd(), 'server', 'files', 'archives'),
    } = request;
    const outputFormats = this.resolveOutputFormats(finalBlockConfig.outputFormats, toPdf);
    const generatePdf = outputFormats.includes('pdf');

    logger.info({
      workflowId,
      runId,
      documentCount: finalBlockConfig.documents.length,
      outputFormats,
    }, 'Rendering Final Block');

    // Validate configuration
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

    // Step 1.25: Pre-generation validation
    for (const doc of documentsWithPaths) {
      if (!doc.templatePath) {
        continue;
      }
      
      try {
        const validationResult = await validateTemplateWithData(doc.templatePath, stepValues);
        if (!validationResult.valid && validationResult.warnings.length > 0) {
          logger.warn({
            documentId: doc.documentId,
            warnings: validationResult.warnings,
          }, 'Template validation generated warnings before rendering');
        }
      } catch (validationErr) {
        logger.warn({ error: validationErr, documentId: doc.documentId }, 'Failed to validate template before rendering');
      }
    }

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
      toPdf: generatePdf,
      runId,
      normalizationOptions,
      tenantId,
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
      outputFormats,
      runId
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
          outputFormats
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

    // Step 4.5: Cleanup local temporary files
    for (const res of generationResult.documents) {
      if (res.pdfPath) {await fs.unlink(res.pdfPath).catch(() => {});}
      if (res.docxPath) {await fs.unlink(res.docxPath).catch(() => {});}
    }
    if (archive?.filePath) {
      await fs.unlink(archive.filePath).catch(() => {});
    }

    // Step 5: Build response
    const response: FinalBlockRenderResponse = {
      documents,
      archive,
      skipped: generationResult.skipped.map(s => s.alias),
      failed: generationResult.failed,
      totalAttempted: generationResult.totalAttempted,
      totalGenerated: documents.length,
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
    outputFormats: FinalDocumentOutputFormat[],
    runId: string
  ): Promise<FinalBlockRenderResponse['documents']> {
    const documents: FinalBlockRenderResponse['documents'] = [];

    for (const result of results) {
      for (const selected of this.selectOutputFiles(result, outputFormats)) {
        const filename = path.basename(selected.filePath);
        const mimeType = selected.isPdf
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const stats = await fs.stat(selected.filePath);
        const fileBuffer = await fs.readFile(selected.filePath);
        const storageKey = `runs/${runId}/documents/${filename}`;
        await storageProvider.uploadFile(storageKey, fileBuffer, mimeType);

        documents.push({
          alias: result.alias ?? 'document',
          filename,
          filePath: selected.filePath,
          storageKey,
          mimeType,
          size: stats.size,
          unresolvedVariables: result.unresolvedVariables,
          // Observed, not requested: whichever converter actually ran for THIS
          // PDF. DOCX siblings deliberately carry no conversion metadata.
          pdfStrategy: selected.isPdf ? result.pdfStrategy : undefined,
          pdfFellBack: selected.isPdf ? result.pdfFellBack : undefined,
          pdfFailed: result.pdfFailed,
          pdfNotice: result.pdfNotice,
        });
      }
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
    outputFormats: FinalDocumentOutputFormat[]
  ): Promise<NonNullable<FinalBlockRenderResponse['archive']>> {
    const zipDocuments: ZipDocument[] = [];

    for (const result of results) {
      for (const selected of this.selectOutputFiles(result, outputFormats)) {
        zipDocuments.push({
          filename: path.basename(selected.filePath),
          filePath: selected.filePath,
          mimeType: selected.isPdf
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      }
    }

    await fs.mkdir(outputDir, { recursive: true });

    const zipResult: ZipResult = await createFinalBlockZip(
      zipDocuments,
      workflowId,
      runId,
      outputDir,
      {
        'Document Count': String(zipDocuments.length),
        'Format': outputFormats.map((format) => format.toUpperCase()).join(' + '),
      }
    );

    const stats = await fs.stat(zipResult.filePath);
    const fileBuffer = await fs.readFile(zipResult.filePath);

    const storageKey = `runs/${runId}/documents/${zipResult.filename}`;
    await storageProvider.uploadFile(storageKey, fileBuffer, 'application/zip');

    return {
      filename: zipResult.filename,
      filePath: zipResult.filePath,
      storageKey,
      size: stats.size,
    };
  }

  private resolveOutputFormats(
    configured: FinalDocumentOutputFormat[] | undefined,
    toPdf: boolean
  ): FinalDocumentOutputFormat[] {
    const valid = configured?.filter((format, index) =>
      (format === 'docx' || format === 'pdf') && configured.indexOf(format) === index
    );
    return valid?.length ? valid : [toPdf ? 'pdf' : 'docx'];
  }

  /**
   * Select the concrete files requested by the author. A failed PDF-only
   * conversion retains the usable DOCX fallback, matching the converter's
   * existing fail-soft contract. Paths are de-duplicated for a DOCX+PDF
   * request whose PDF fell back to that same DOCX.
   */
  private selectOutputFiles(
    result: EnhancedGenerationResult,
    outputFormats: FinalDocumentOutputFormat[]
  ): Array<{ filePath: string; isPdf: boolean }> {
    const selected = new Map<string, { filePath: string; isPdf: boolean }>();
    if (outputFormats.includes('docx')) {
      selected.set(result.docxPath, { filePath: result.docxPath, isPdf: false });
    }
    if (outputFormats.includes('pdf')) {
      const filePath = result.pdfPath ?? result.docxPath;
      selected.set(filePath, { filePath, isPdf: result.pdfPath !== undefined });
    }
    return [...selected.values()];
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

    // Resolve through the configured storage provider rather than assuming the
    // disk layout, so this keeps working under S3 (DEBT-5). The provider owns
    // containment now — DiskStorageProvider.resolveWithinBase refuses a ref
    // that escapes the storage root, and S3StorageProvider sanitises the ref
    // before it becomes a temp filename — so the traversal check that used to
    // live here is inherited rather than re-implemented per caller.
    return getTemplateFilePath(template.fileRef);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  FinalBlockRenderer,
  finalBlockRenderer,
  renderFinalBlock,
  createTemplateResolver,
};

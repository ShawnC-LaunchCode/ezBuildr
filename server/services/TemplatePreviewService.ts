/**
 * Template Preview Service
 *
 * Generate preview documents with sample data without saving to database.
 * Useful for testing templates before deployment.
 *
 * Features:
 * - Generate preview with test data
 * - Return temporary signed URL
 * - Auto-cleanup of preview files
 * - Validation before preview
 * - Support both PDF and DOCX previews
 *
 * Usage:
 * ```typescript
 * const preview = await templatePreviewService.generatePreview({
 *   templateId,
 *   mapping,
 *   sampleData,
 *   outputFormat: 'pdf'
 * });
 *
 * // Returns signed URL valid for 5 minutes
 * console.log(preview.previewUrl);
 * ```
 */

import path from 'path';

import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { templates } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../logger';
import { createError } from '../utils/errors';

import { EnhancedDocumentEngine } from './document/EnhancedDocumentEngine';
import { mappingValidator } from './document/MappingValidator';
import { getStorageProvider } from './storage';

import type { DocumentMapping } from './document/MappingInterpreter';

// ============================================================================
// TYPES
// ============================================================================

export interface GeneratePreviewOptions {
  /** Template ID */
  templateId: string;

  /** Field mapping */
  mapping?: DocumentMapping;

  /** Sample data to use for preview */
  sampleData: Record<string, any>;

  /** Output format */
  outputFormat?: 'pdf' | 'docx';

  /** Preview expiration in seconds (default: 300 = 5 minutes) */
  expiresIn?: number;

  /** Validate mapping before generating */
  validateMapping?: boolean;
}

export interface PreviewResult {
  /** Temporary signed URL for preview (expires after expiresIn) */
  previewUrl: string;

  /** File path (for cleanup) */
  filePath: string;

  /** Output format */
  format: 'pdf' | 'docx';

  /** File size in bytes */
  size: number;

  /** Expiration timestamp */
  expiresAt: Date;

  /** Validation report (if requested) */
  validationReport?: any;

  /** Mapping metadata */
  mappingMetadata?: {
    mappedFields: number;
    unmappedFields: number;
    missingVariables: string[];
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class TemplatePreviewService {
  private previewDir = 'previews'; // Subdirectory for preview files

  /**
   * Generate a preview document
   */
  async generatePreview(options: GeneratePreviewOptions): Promise<PreviewResult> {
    const {
      templateId,
      mapping,
      sampleData,
      outputFormat = 'pdf',
      expiresIn = 300, // 5 minutes
      validateMapping = true,
    } = options;

    logger.info({ templateId, outputFormat }, 'Generating template preview');

    try {
      // Step 1: Load template
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1);

      if (!template) {
        throw createError.notFound('Template not found');
      }

      // Step 2: Validate mapping (if requested)
      let validationReport;
      if (validateMapping && mapping) {
        validationReport = await mappingValidator.validateWithTestData(
          templateId,
          mapping,
          sampleData
        );

        if (!validationReport.valid) {
          logger.warn(
            {
              templateId,
              errors: validationReport.errors,
            },
            'Mapping validation failed, proceeding with preview anyway'
          );
        }
      }

      // Step 3: Load template file from storage
      const storage = getStorageProvider();
      const templateBuffer = await storage.download(template.fileRef);

      // Step 4: Create temporary file path for preview
      const previewFileName = `preview-${nanoid(16)}.${outputFormat}`;
      const previewKey = `${this.previewDir}/${previewFileName}`;

      // Step 5: Generate document
      const engine = new EnhancedDocumentEngine();

      // For previews, we'll use a temporary local path and then upload
      const tempOutputDir = path.join(process.cwd(), 'server', 'files', 'outputs', 'previews');
      const { default: fs } = await import('fs/promises');
      await fs.mkdir(tempOutputDir, { recursive: true });

      const result = await engine.generateWithMapping({
        templatePath: template.fileRef, // Reference for error messages
        rawData: sampleData,
        mapping,
        outputName: `preview-${nanoid(8)}`,
        outputDir: tempOutputDir,
        toPdf: outputFormat === 'pdf',
        pdfStrategy: 'puppeteer',
        normalize: true,
      });

      // Step 6: Read generated file and upload to storage
      const generatedFilePath = outputFormat === 'pdf' ? result.pdfPath : result.docxPath;
      if (!generatedFilePath) {
        throw createError.internal('Failed to generate preview file');
      }

      const fileBuffer = await fs.readFile(generatedFilePath);
      const fileSize = fileBuffer.length;

      // Upload to storage with preview prefix
      await storage.upload(fileBuffer, previewKey, {
        contentType:
          outputFormat === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        metadata: {
          preview: 'true',
          templateId,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        },
      });

      // Step 7: Generate signed URL
      const previewUrl = await storage.getSignedUrl(previewKey, {
        expiresIn,
        contentType:
          outputFormat === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contentDisposition: `inline; filename="preview.${outputFormat}"`,
      });

      // Step 8: Clean up local temp file
      await fs.unlink(generatedFilePath).catch(() => {});
      if (result.docxPath && result.pdfPath && outputFormat === 'pdf') {
        await fs.unlink(result.docxPath).catch(() => {});
      }

      // Step 9: Schedule cleanup of preview file
      this.scheduleCleanup(previewKey, expiresIn + 60); // Clean up 1 minute after expiration

      logger.info(
        {
          templateId,
          previewKey,
          size: fileSize,
          expiresIn,
        },
        'Template preview generated'
      );

      // Step 10: Prepare mapping metadata
      const mappingMetadata = result.mappingResult
        ? {
            mappedFields: result.mappingResult.mapped.length,
            unmappedFields: result.mappingResult.unused.length,
            missingVariables: result.mappingResult.missing,
          }
        : undefined;

      return {
        previewUrl,
        filePath: previewKey,
        format: outputFormat,
        size: fileSize,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        validationReport,
        mappingMetadata,
      };
    } catch (error: any) {
      logger.error({ error, templateId }, 'Preview generation failed');
      throw error;
    }
  }

  /**
   * Schedule cleanup of preview file after expiration
   */
  private scheduleCleanup(fileKey: string, delaySeconds: number): void {
    setTimeout(async () => {
      try {
        const storage = getStorageProvider();
        await storage.delete(fileKey);
        logger.debug({ fileKey }, 'Preview file cleaned up');
      } catch (error) {
        logger.error({ error, fileKey }, 'Failed to clean up preview file');
      }
    }, delaySeconds * 1000);
  }

  /**
   * Clean up all expired preview files
   * Call this periodically (e.g., via cron job)
   */
  async cleanupExpiredPreviews(): Promise<number> {
    logger.info('Cleaning up expired preview files');

    try {
      const storage = getStorageProvider();
      const previewFiles = await storage.list(this.previewDir);

      let cleaned = 0;

      for (const fileKey of previewFiles) {
        try {
          // Check metadata for expiration
          const metadata = await storage.getMetadata(fileKey);

          if (metadata && (metadata as any).expiresAt) {
            const expiresAt = new Date((metadata as any).expiresAt);

            if (expiresAt < new Date()) {
              await storage.delete(fileKey);
              cleaned++;
              logger.debug({ fileKey }, 'Expired preview file deleted');
            }
          }
        } catch (error) {
          logger.error({ error, fileKey }, 'Failed to process preview file for cleanup');
        }
      }

      logger.info({ cleaned, total: previewFiles.length }, 'Preview cleanup completed');

      return cleaned;
    } catch (error: any) {
      logger.error({ error }, 'Preview cleanup failed');
      return 0;
    }
  }

  /**
   * Delete a specific preview file
   */
  async deletePreview(fileKey: string): Promise<void> {
    const storage = getStorageProvider();
    await storage.delete(fileKey);
    logger.info({ fileKey }, 'Preview file deleted');
  }
}

// Singleton instance
export const templatePreviewService = new TemplatePreviewService();

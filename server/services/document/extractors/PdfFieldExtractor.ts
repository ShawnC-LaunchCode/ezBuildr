/**
 * PDF Field Extractor - Multi-Strategy Extractor with Fallbacks
 *
 * This service attempts to extract fields from PDFs using multiple strategies:
 * 1. pdf-lib (primary) - Fast, standard AcroForms
 * 2. PDF.js (fallback 1) - More robust parsing, handles XFA forms
 * 3. OCR (fallback 2) - Last resort for scanned/flattened PDFs
 *
 * Benefits:
 * - Robust field extraction across different PDF types
 * - Automatic fallback when primary method fails
 * - Detailed logging of which extractor succeeded
 * - Validation of extracted fields
 *
 * Usage:
 * ```typescript
 * const extractor = new PdfFieldExtractor();
 * const metadata = await extractor.extract(pdfBuffer);
 * ```
 */

import { logger } from '../../../logger';

import { OcrExtractor } from './OcrExtractor';
import { PdfJsExtractor } from './PdfJsExtractor';
import { PdfLibExtractor } from './PdfLibExtractor';

import type { IPdfExtractor, PdfMetadata, ExtractionResult } from './IPdfExtractor';

export class PdfFieldExtractor {
  private extractors: IPdfExtractor[];

  constructor(extractors?: IPdfExtractor[]) {
    // Default extractors in priority order
    this.extractors = extractors || [
      new PdfLibExtractor(),
      new PdfJsExtractor(),
      new OcrExtractor(),
    ];

    // Sort by priority (lower = higher priority)
    this.extractors.sort((a, b) => a.priority - b.priority);

    logger.info(
      {
        extractors: this.extractors.map((e) => e.name),
      },
      'PdfFieldExtractor initialized with extractors'
    );
  }

  /**
   * Extract fields from PDF using the first extractor that succeeds
   *
   * Tries each extractor in priority order until one succeeds.
   * Falls back to next extractor if current one fails.
   *
   * @param buffer - PDF file buffer
   * @returns PDF metadata with extracted fields
   * @throws Error if all extractors fail
   */
  async extract(buffer: Buffer): Promise<PdfMetadata> {
    const errors: Array<{ extractor: string; error: string }> = [];

    logger.info('Attempting PDF field extraction with multi-strategy approach');

    for (const extractor of this.extractors) {
      try {
        // Check if extractor can handle this PDF
        const canHandle = await extractor.canHandle(buffer);

        if (!canHandle) {
          logger.debug(
            { extractor: extractor.name },
            'Extractor cannot handle this PDF, skipping'
          );
          continue;
        }

        // Attempt extraction
        logger.debug({ extractor: extractor.name }, 'Attempting extraction');

        const result: ExtractionResult = await extractor.extract(buffer);

        if (result.success && result.metadata) {
          logger.info(
            {
              extractor: extractor.name,
              fieldCount: result.metadata.fields.length,
              hasWarnings: !!result.metadata.extractionWarnings,
            },
            'PDF field extraction succeeded'
          );

          return result.metadata;
        } else {
          // Extraction failed, record error and try next extractor
          const error = result.error || 'Unknown error';
          errors.push({ extractor: extractor.name, error });

          logger.warn(
            {
              extractor: extractor.name,
              error,
            },
            'Extractor failed, trying next one'
          );
        }
      } catch (error: any) {
        // Unexpected error, record and try next extractor
        const errorMessage = error.message || 'Unexpected error';
        errors.push({ extractor: extractor.name, error: errorMessage });

        logger.error(
          {
            error,
            extractor: extractor.name,
          },
          'Extractor threw unexpected error'
        );
      }
    }

    // All extractors failed
    logger.error(
      {
        errors,
        extractorCount: this.extractors.length,
      },
      'All PDF extractors failed'
    );

    throw new Error(
      `Failed to extract PDF fields. Tried ${this.extractors.length} extractor(s): ${errors
        .map((e) => `${e.extractor} (${e.error})`)
        .join(', ')}`
    );
  }

  /**
   * Extract fields with detailed error reporting
   *
   * Returns both the result and any errors encountered.
   * Useful for debugging and providing user feedback.
   *
   * @param buffer - PDF file buffer
   * @returns Object with metadata (if successful) and all errors
   */
  async extractWithDetails(
    buffer: Buffer
  ): Promise<{
    metadata?: PdfMetadata;
    errors: Array<{ extractor: string; error: string }>;
    attemptedExtractors: string[];
  }> {
    const errors: Array<{ extractor: string; error: string }> = [];
    const attemptedExtractors: string[] = [];

    for (const extractor of this.extractors) {
      attemptedExtractors.push(extractor.name);

      try {
        const canHandle = await extractor.canHandle(buffer);

        if (!canHandle) {
          continue;
        }

        const result = await extractor.extract(buffer);

        if (result.success && result.metadata) {
          return {
            metadata: result.metadata,
            errors,
            attemptedExtractors,
          };
        } else {
          errors.push({
            extractor: extractor.name,
            error: result.error || 'Unknown error',
          });
        }
      } catch (error: any) {
        errors.push({
          extractor: extractor.name,
          error: error.message || 'Unexpected error',
        });
      }
    }

    return {
      errors,
      attemptedExtractors,
    };
  }

  /**
   * Get list of available extractors
   */
  getExtractors(): Array<{ name: string; priority: number }> {
    return this.extractors.map((e) => ({
      name: e.name,
      priority: e.priority,
    }));
  }

  /**
   * Add a custom extractor
   */
  addExtractor(extractor: IPdfExtractor): void {
    this.extractors.push(extractor);
    this.extractors.sort((a, b) => a.priority - b.priority);

    logger.info(
      {
        extractor: extractor.name,
        priority: extractor.priority,
      },
      'Custom extractor added'
    );
  }
}

// Singleton instance
let extractorInstance: PdfFieldExtractor | null = null;

/**
 * Get the PDF field extractor instance (singleton)
 */
export function getPdfFieldExtractor(): PdfFieldExtractor {
  if (!extractorInstance) {
    extractorInstance = new PdfFieldExtractor();
  }
  return extractorInstance;
}

/**
 * Reset the extractor instance (useful for testing)
 */
export function resetPdfFieldExtractor(): void {
  extractorInstance = null;
}

// Re-export types
export type { IPdfExtractor, PdfMetadata, PdfField, ExtractionResult } from './IPdfExtractor';

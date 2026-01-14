/**
 * OCR Extractor (STUB - To be implemented)
 *
 * Last-resort PDF field extractor using OCR (Optical Character Recognition).
 * Used when the PDF has no form fields (flattened PDF or scanned document).
 *
 * SETUP REQUIRED:
 * 1. Install dependencies:
 *    npm install tesseract.js pdf-poppler
 *
 * 2. Install system dependencies:
 *    - Tesseract OCR: https://github.com/tesseract-ocr/tesseract
 *    - Poppler (for PDF to image conversion): https://poppler.freedesktop.org/
 *
 * 3. Set environment variables:
 *    TESSERACT_PATH=/usr/bin/tesseract (optional, if not in PATH)
 *
 * Workflow:
 * 1. Convert PDF pages to images using Poppler
 * 2. Run Tesseract OCR on each image
 * 3. Parse OCR output to identify potential form fields
 * 4. Use heuristics to determine field types and boundaries
 *
 * Heuristics for field detection:
 * - Lines with colons or underscores may be labels
 * - Blank spaces after labels may be field values
 * - Checkboxes: Look for □, ☐, [ ] patterns
 * - Dates: Look for MM/DD/YYYY patterns
 * - Signatures: Look for "Signature:", "Sign here:" text
 *
 * Limitations:
 * - Much slower than form-based extraction
 * - Less accurate (depends on OCR quality)
 * - Cannot determine exact field boundaries
 * - Best for simple forms with clear labels
 */

import { logger } from '../../../logger';

import type { IPdfExtractor, ExtractionResult, PdfField } from './IPdfExtractor';

export class OcrExtractor implements IPdfExtractor {
  readonly name = 'ocr';
  readonly priority = 3; // Last resort

  async canHandle(buffer: Buffer): Promise<boolean> {
    // OCR can technically handle any PDF, but it's slow
    // Only use as last resort when other extractors fail
    return true;
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    logger.info(
      { extractor: this.name },
      'OCR extractor is not yet implemented - install tesseract.js and implement this method'
    );

    // TODO: Implement OCR-based field extraction
    /*
    Example implementation:

    import Tesseract from 'tesseract.js';
    import { pdf } from 'pdf-poppler';

    // Convert PDF to images
    const images = await this.pdfToImages(buffer);

    const fields: PdfField[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      // Run OCR on the image
      const { data: { text } } = await Tesseract.recognize(image, 'eng');

      // Parse OCR text to find potential fields
      const detectedFields = this.parseOcrText(text, i);
      fields.push(...detectedFields);
    }

    return {
      success: true,
      metadata: {
        pageCount: images.length,
        fields,
        isEncrypted: false,
        extractorUsed: this.name,
        extractionWarnings: [
          'Fields detected using OCR - positions and types are approximate',
        ],
      },
    };
    */

    return {
      success: false,
      error: 'OCR extractor not yet implemented',
    };
  }

  /**
   * Convert PDF to images (one per page)
   */
  private async pdfToImages(buffer: Buffer): Promise<Buffer[]> {
    // TODO: Implement using pdf-poppler or similar
    return [];
  }

  /**
   * Parse OCR text to detect form fields
   */
  private parseOcrText(text: string, pageIndex: number): PdfField[] {
    const fields: PdfField[] = [];

    // Split into lines
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Heuristic 1: Lines ending with colon are likely labels
      if (line.endsWith(':')) {
        const fieldName = line.slice(0, -1).trim();
        fields.push({
          name: fieldName,
          type: 'text', // Default to text
          pageIndex,
          // Note: We don't have exact coordinates from OCR
          rect: undefined,
        });
      }

      // Heuristic 2: Checkbox patterns
      if (line.match(/\[[ xX]\]|☐|☑|□|■/)) {
        const fieldName = line.replace(/\[[ xX]\]|☐|☑|□|■/g, '').trim();
        fields.push({
          name: fieldName,
          type: 'checkbox',
          pageIndex,
          rect: undefined,
        });
      }

      // Heuristic 3: Signature lines
      if (line.match(/signature|sign here|signed/i)) {
        fields.push({
          name: line.trim(),
          type: 'signature',
          pageIndex,
          rect: undefined,
        });
      }

      // Heuristic 4: Date patterns
      if (line.match(/date|mm\/dd\/yyyy|__\/__\/__/i)) {
        fields.push({
          name: line.trim(),
          type: 'text', // Treat dates as text fields
          pageIndex,
          rect: undefined,
        });
      }
    }

    return fields;
  }
}

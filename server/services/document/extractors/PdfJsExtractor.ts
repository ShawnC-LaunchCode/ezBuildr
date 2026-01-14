/**
 * PDF.js Extractor (STUB - To be implemented)
 *
 * Fallback PDF field extractor using Mozilla's PDF.js library.
 * This is a more robust parser that can handle some PDFs that pdf-lib cannot.
 *
 * SETUP REQUIRED:
 * 1. Install dependencies:
 *    npm install pdfjs-dist canvas
 *
 * 2. Implementation notes:
 *    - PDF.js is designed for rendering but can also parse form fields
 *    - Better handling of non-standard PDF structures
 *    - Can extract text content even from flattened forms
 *    - Useful for XFA forms (XML Forms Architecture)
 *
 * Supports:
 * - AcroForm fields
 * - XFA forms (XML-based)
 * - Text extraction from flattened PDFs
 *
 * Usage:
 * - This extractor is currently a stub and will always return success: false
 * - Implement the extract() method to enable this fallback
 */

import { logger } from '../../../logger';

import type { IPdfExtractor, ExtractionResult } from './IPdfExtractor';

export class PdfJsExtractor implements IPdfExtractor {
  readonly name = 'pdf.js';
  readonly priority = 2; // Fallback extractor

  async canHandle(buffer: Buffer): Promise<boolean> {
    // TODO: Check if PDF.js can parse this buffer
    // For now, assume it can handle any PDF
    return true;
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    logger.info(
      { extractor: this.name },
      'PDF.js extractor is not yet implemented - install pdfjs-dist and implement this method'
    );

    // TODO: Implement PDF.js-based extraction
    /*
    Example implementation:

    import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdfDoc = await loadingTask.promise;

    const fields: PdfField[] = [];
    const numPages = pdfDoc.numPages;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const annotations = await page.getAnnotations();

      for (const annotation of annotations) {
        if (annotation.subtype === 'Widget' && annotation.fieldType) {
          fields.push({
            name: annotation.fieldName || `field_${i}_${annotation.id}`,
            type: this.mapFieldType(annotation.fieldType),
            pageIndex: i - 1,
            rect: annotation.rect ? {
              x: annotation.rect[0],
              y: annotation.rect[1],
              width: annotation.rect[2] - annotation.rect[0],
              height: annotation.rect[3] - annotation.rect[1],
            } : undefined,
            value: annotation.fieldValue,
            options: annotation.options?.map(o => o.displayValue),
          });
        }
      }
    }

    return {
      success: true,
      metadata: {
        pageCount: numPages,
        fields,
        isEncrypted: false,
        extractorUsed: this.name,
      },
    };
    */

    return {
      success: false,
      error: 'PDF.js extractor not yet implemented',
    };
  }

  private mapFieldType(pdfJsType: string): 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button' | 'signature' | 'unknown' {
    switch (pdfJsType?.toLowerCase()) {
      case 'tx':
        return 'text';
      case 'btn':
        return 'button';
      case 'ch':
        return 'dropdown';
      case 'sig':
        return 'signature';
      default:
        return 'unknown';
    }
  }
}

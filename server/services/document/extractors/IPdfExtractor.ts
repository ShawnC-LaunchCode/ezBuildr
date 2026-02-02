/**
 * PDF Field Extractor Interface
 *
 * Defines the contract for PDF field extraction implementations.
 * Multiple extractors can be used as fallbacks for robustness.
 */

export interface PdfField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button' | 'signature' | 'unknown';
  pageIndex: number; // 0-based
  rect?: { x: number; y: number; width: number; height: number }; // User space coordinates
  value?: string;
  options?: string[]; // For dropdowns/radios
  isReadOnly?: boolean;
}

export interface PdfMetadata {
  pageCount: number;
  fields: PdfField[];
  isEncrypted: boolean;
  extractorUsed?: string; // Which extractor successfully parsed the PDF
  extractionWarnings?: string[]; // Any warnings encountered
}

export interface ExtractionResult {
  success: boolean;
  metadata?: PdfMetadata;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- I-prefix is industry standard for extractor interfaces
export interface IPdfExtractor {
  /**
   * Name of the extractor (for logging)
   */
  readonly name: string;

  /**
   * Priority (lower = higher priority)
   * Primary extractor = 1, fallbacks = 2, 3, etc.
   */
  readonly priority: number;

  /**
   * Extract fields and metadata from a PDF buffer
   *
   * @param buffer - PDF file buffer
   * @returns Extraction result
   */
  extract(buffer: Buffer): Promise<ExtractionResult>;

  /**
   * Check if this extractor can handle the given PDF
   * Quick pre-check before attempting full extraction
   *
   * @param buffer - PDF file buffer
   * @returns True if extractor can likely handle this PDF
   */
  canHandle(buffer: Buffer): Promise<boolean>;
}

/**
 * Validation utilities for extracted fields
 */
export class FieldValidator {
  /**
   * Check for overlapping fields (may indicate parsing error)
   */
  static findOverlappingFields(fields: PdfField[]): Array<[PdfField, PdfField]> {
    const overlaps: Array<[PdfField, PdfField]> = [];

    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const field1 = fields[i];
        const field2 = fields[j];

        // Only check fields on the same page with rect data
        if (
          field1.pageIndex === field2.pageIndex &&
          field1.rect &&
          field2.rect &&
          this.rectsOverlap(field1.rect, field2.rect)
        ) {
          overlaps.push([field1, field2]);
        }
      }
    }

    return overlaps;
  }

  /**
   * Check for duplicate field names
   */
  static findDuplicateNames(fields: PdfField[]): string[] {
    const names = fields.map((f) => f.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    return [...new Set(duplicates)]; // Unique duplicates
  }

  /**
   * Validate extracted fields and return warnings
   */
  static validate(fields: PdfField[]): string[] {
    const warnings: string[] = [];

    // Check for overlapping fields
    const overlaps = this.findOverlappingFields(fields);
    if (overlaps.length > 0) {
      warnings.push(
        `Found ${overlaps.length} overlapping field(s): ${overlaps
          .map(([f1, f2]) => `${f1.name} & ${f2.name}`)
          .join(', ')}`
      );
    }

    // Check for duplicate names
    const duplicates = this.findDuplicateNames(fields);
    if (duplicates.length > 0) {
      warnings.push(`Found ${duplicates.length} duplicate field name(s): ${duplicates.join(', ')}`);
    }

    // Check for fields without names
    const unnamed = fields.filter((f) => !f.name || f.name.trim() === '');
    if (unnamed.length > 0) {
      warnings.push(`Found ${unnamed.length} field(s) without names`);
    }

    return warnings;
  }

  /**
   * Check if two rectangles overlap
   */
  private static rectsOverlap(
    r1: { x: number; y: number; width: number; height: number },
    r2: { x: number; y: number; width: number; height: number }
  ): boolean {
    return !(
      r1.x + r1.width < r2.x ||
      r2.x + r2.width < r1.x ||
      r1.y + r1.height < r2.y ||
      r2.y + r2.height < r1.y
    );
  }
}

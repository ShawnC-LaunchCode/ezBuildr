/**
 * PDF-Lib Extractor
 *
 * Primary PDF field extractor using pdf-lib library.
 * This is the default extractor and works for most standard PDFs.
 *
 * Supports:
 * - AcroForm fields (text, checkbox, radio, dropdown)
 * - Encrypted PDFs (with ignoreEncryption flag)
 * - Field coordinates and metadata
 *
 * Limitations:
 * - Doesn't work with XFA forms (XML Forms Architecture)
 * - May struggle with heavily customized or malformed PDFs
 */

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

import { logger } from '../../../logger';

import { FieldValidator } from './IPdfExtractor';

import type { IPdfExtractor, ExtractionResult, PdfField, PdfMetadata } from './IPdfExtractor';

export class PdfLibExtractor implements IPdfExtractor {
  readonly name = 'pdf-lib';
  readonly priority = 1; // Primary extractor

  async canHandle(buffer: Buffer): Promise<boolean> {
    try {
      // Try to load the PDF
      const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });

      // Check if it has a form
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      // Can handle if we successfully loaded and found fields
      return true; // Even PDFs without fields can be "handled"
    } catch (error) {
      logger.debug({ error, extractor: this.name }, 'Cannot handle PDF');
      return false;
    }
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    try {
      logger.debug({ extractor: this.name }, 'Attempting PDF field extraction');

      const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });

      const form = pdfDoc.getForm();
      const fields = form.getFields();
      const pageCount = pdfDoc.getPageCount();
      const pages = pdfDoc.getPages();

      const extractedFields: PdfField[] = [];

      for (const field of fields) {
        const name = field.getName();
        const type = this.getFieldType(field);

        // Find which page the field is on and its coordinates
        const widgets = field.acroField.getWidgets();
        let pageIndex = 0;
        let rect: { x: number; y: number; width: number; height: number } | undefined;

        if (widgets.length > 0) {
          const widget = widgets[0];
          const rectangle = widget.getRectangle();

          rect = {
            x: rectangle.x,
            y: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
          };

          // Find page index
          const pageRef = widget.P();
          if (pageRef) {
            try {
              const foundIndex = pages.findIndex(p => {
                // Compare refs
                if (p.ref === pageRef) {return true;}

                const pRef = p.ref as any;
                const wRef = pageRef as any;

                // Robust comparison helper
                const getObjNum = (ref: any) => ref.objectNumber ?? (typeof ref.tag === 'string' ? parseInt(ref.tag.split(' ')[0]) : undefined);
                const getGenNum = (ref: any) => ref.generationNumber ?? (typeof ref.tag === 'string' ? parseInt(ref.tag.split(' ')[1]) : undefined);

                const pObj = getObjNum(pRef);
                const wObj = getObjNum(wRef);
                const pGen = getGenNum(pRef) ?? 0;
                const wGen = getGenNum(wRef) ?? 0;

                return pObj !== undefined && wObj !== undefined && pObj === wObj && pGen === wGen;
              });

              if (foundIndex !== -1) {
                pageIndex = foundIndex;
              }
            } catch (e) {
              logger.debug({ error: e, fieldName: name }, 'Failed to determine field page');
            }
          }
        }

        // Get field options (for dropdowns/radios)
        let options: string[] | undefined;
        if (field instanceof PDFDropdown) {
          options = field.getOptions();
        } else if (field instanceof PDFRadioGroup) {
          options = field.getOptions();
        }

        // Get current value (if any)
        let value: string | undefined;
        try {
          if (field instanceof PDFTextField) {
            value = field.getText() || undefined;
          } else if (field instanceof PDFCheckBox) {
            value = field.isChecked() ? 'true' : 'false';
          } else if (field instanceof PDFDropdown) {
            const selected = field.getSelected();
            value = selected.length > 0 ? selected[0] : undefined;
          } else if (field instanceof PDFRadioGroup) {
            value = field.getSelected() || undefined;
          }
        } catch (e) {
          logger.debug({ error: e, fieldName: name }, 'Failed to get field value');
        }

        extractedFields.push({
          name,
          type,
          pageIndex,
          rect,
          value,
          options,
          isReadOnly: field.isReadOnly(),
        });
      }

      // Validate extracted fields
      const warnings = FieldValidator.validate(extractedFields);

      const metadata: PdfMetadata = {
        pageCount,
        fields: extractedFields,
        isEncrypted: pdfDoc.isEncrypted,
        extractorUsed: this.name,
        extractionWarnings: warnings.length > 0 ? warnings : undefined,
      };

      logger.info(
        {
          extractor: this.name,
          fieldCount: extractedFields.length,
          pageCount,
          hasWarnings: warnings.length > 0,
        },
        'PDF fields extracted successfully'
      );

      return {
        success: true,
        metadata,
      };
    } catch (error: any) {
      logger.error(
        {
          error,
          extractor: this.name,
          message: error.message,
        },
        'PDF field extraction failed'
      );

      return {
        success: false,
        error: error.message || 'Unknown extraction error',
      };
    }
  }

  private getFieldType(field: any): PdfField['type'] {
    if (field instanceof PDFTextField) {return 'text';}
    if (field instanceof PDFCheckBox) {return 'checkbox';}
    if (field instanceof PDFDropdown) {return 'dropdown';}
    if (field instanceof PDFRadioGroup) {return 'radio';}
    return 'unknown';
  }
}

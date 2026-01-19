/**
 * Stage 22: PDF Service
 * 
 * Handles PDF form unlocking, field extraction, and filling.
 * Uses a hybrid approach:
 * - node-qpdf2 (qpdf): For robust unlocking/decryption of government forms
 * - pdf-lib: For field extraction and filling
 */
import { exec } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import { logger } from '../../logger';
import { createError } from '../../utils/errors';
const execAsync = promisify(exec);
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
}
export class PdfService {
    /**
     * Unlock a PDF by removing encryption/restrictions using qpdf
     * This is essential for government forms that are "locked" for editing
     */
    async unlockPdf(inputBuffer: Buffer): Promise<Buffer> {
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `locked-${Date.now()}.pdf`);
        const outputPath = path.join(tempDir, `unlocked-${Date.now()}.pdf`);
        try {
            await fs.writeFile(inputPath, inputBuffer);
            // Sanitize paths for command line
            // qpdf --decrypt input.pdf output.pdf
            // This command removes restrictions (like filling prevention)
            await execAsync(`qpdf --decrypt "${inputPath}" "${outputPath}"`);
            return await fs.readFile(outputPath);
        } catch (error: any) {
            logger.error({ error }, 'Failed to unlock PDF with qpdf');
            // Fallback: If qpdf fails or isn't installed, return original buffer
            // The caller might still be able to use it if it wasn't actually locked
            logger.warn('Returning original PDF buffer due to unlock failure');
            return inputBuffer;
        } finally {
            // Cleanup temp files
            await Promise.all([
                fs.unlink(inputPath).catch(() => { }),
                fs.unlink(outputPath).catch(() => { }),
            ]);
        }
    }
    /**
     * Extract form fields and metadata from a PDF
     */
    async extractFields(pdfBuffer: Buffer): Promise<PdfMetadata> {
        try {
            const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            const extractedFields: PdfField[] = [];
            const pageCount = pdfDoc.getPageCount();
            const pages = pdfDoc.getPages();
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
                    const pageRef = widget.P;
                    if (pageRef) {
                        try {
                            // Compare refs using tag/gen to avoid type mismatches
                            pageIndex = pages.findIndex(p => {
                                const pRef = p.ref as any;
                                const wRef = pageRef as any;
                                return pRef && wRef && pRef.tag === wRef.tag && pRef.gen === wRef.gen;
                            });
                        } catch (e) {
                            // ignore page finding error
                        }
                    }
                }
                if (pageIndex === -1) {pageIndex = 0;}
                let options: string[] | undefined;
                if (field instanceof PDFDropdown) {
                    options = field.getOptions();
                } else if (field instanceof PDFRadioGroup) {
                    options = field.getOptions();
                }
                extractedFields.push({
                    name,
                    type,
                    pageIndex,
                    rect,
                    options,
                    isReadOnly: field.isReadOnly(),
                });
            }
            return {
                pageCount,
                fields: extractedFields,
                isEncrypted: pdfDoc.isEncrypted,
            };
        } catch (error: any) {
            logger.error({ error }, 'Failed to extract PDF fields');
            throw createError.internal(`Failed to parse PDF: ${  error.message}`);
        }
    }
    /**
     * Fill a PDF form with data
     * @param mapping - Map of PDF field names to string values
     */
    async fillPdf(pdfBuffer: Buffer, mapping: Record<string, string>): Promise<Buffer> {
        try {
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            const form = pdfDoc.getForm();
            for (const [fieldName, value] of Object.entries(mapping)) {
                if (value === undefined || value === null || value === '') {continue;}
                try {
                    const field = form.getField(fieldName);
                    if (field instanceof PDFTextField) {
                        field.setText(String(value));
                    } else if (field instanceof PDFCheckBox) {
                        if (String(value).toLowerCase() === 'true' || value === '1' || value === 'yes') {
                            field.check();
                        } else {
                            field.uncheck();
                        }
                    } else if (field instanceof PDFDropdown) {
                        field.select(String(value));
                    } else if (field instanceof PDFRadioGroup) {
                        field.select(String(value));
                    }
                } catch (err) {
                    // Field might not exist or wrong type, log and continue
                    logger.warn({ fieldName, error: err }, 'Failed to fill PDF field');
                }
            }
            // Flatten the form to prevent further editing (optional, but good for final docs)
            form.flatten();
            return Buffer.from(await pdfDoc.save());
        } catch (error: any) {
            logger.error({ error }, 'Failed to fill PDF');
            throw createError.internal(`Failed to generate PDF: ${  error.message}`);
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
export const pdfService = new PdfService();
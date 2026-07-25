import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { logger } from '../../logger';

import { PdfConverter } from './PdfConverter';
import { TemplateParser } from './TemplateParser';
export interface DocumentGenerationOptions {
    templatePath: string;
    templateBuffer?: Buffer;
    data: Record<string, unknown>;
    outputName: string;
    outputDir?: string;
    toPdf?: boolean;
    pdfStrategy?: 'puppeteer';
    unresolvedVariables?: string[];
}
export interface DocumentGenerationResult {
    docxPath: string;
    pdfPath?: string;
    pdfFailed?: boolean;
    size: number;
    unresolvedVariables?: string[];
}
export class DocumentEngine {
    private parser: TemplateParser;
    private pdfConverter: PdfConverter;
    constructor() {
        this.parser = new TemplateParser();
        this.pdfConverter = new PdfConverter();
    }
    async generate(options: DocumentGenerationOptions): Promise<DocumentGenerationResult> {
        const {
            templatePath,
            templateBuffer, // Extract buffer if provided
            data,
            outputName,
            outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
            toPdf = false,
            unresolvedVariables = [],
        } = options;
        logger.info({ templatePath, outputName, toPdf }, 'Starting document generation');
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });
        // 1. Render DOCX
        const buffer = await this.parser.render({ templatePath, templateBuffer, data, unresolvedVariables });
        // Generate output filename
        const uniqueId = crypto.randomUUID();
        const docxFileName = `${outputName}-${uniqueId}.docx`;
        const docxPath = path.join(outputDir, docxFileName);
        // Write DOCX
        await fs.writeFile(docxPath, buffer);
        const stats = await fs.stat(docxPath);
        const result: DocumentGenerationResult = {
            docxPath,
            size: stats.size,
            unresolvedVariables,
        };
        // 2. Convert to PDF if requested
        if (toPdf) {
            try {
                const pdfFileName = `${outputName}-${uniqueId}.pdf`;
                const pdfPath = path.join(outputDir, pdfFileName);
                // Instantiate converter (defaults to Puppeteer)
                const converter = new PdfConverter();
                await converter.convert({
                    docxPath,
                    outputPath: pdfPath,
                });
                result.pdfPath = pdfPath;
                logger.info({ pdfPath }, 'PDF generated successfully');
            } catch (error) {
                logger.warn({ error }, 'PDF conversion failed, returning DOCX only');
                result.pdfFailed = true;
                // Don't fail the whole process if PDF fails
            }
        }
        return result;
    }
}
export const documentEngine = new DocumentEngine();
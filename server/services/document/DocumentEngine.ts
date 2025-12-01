import path from 'path';
import fs from 'fs/promises';
import { TemplateParser } from './TemplateParser';
import { PdfConverter } from './PdfConverter';
import { logger } from '../../logger';
import { createError } from '../../utils/errors';

export interface DocumentGenerationOptions {
    templatePath: string;
    data: Record<string, any>;
    outputName: string;
    outputDir?: string;
    toPdf?: boolean;
    pdfStrategy?: 'puppeteer' | 'libreoffice';
}

export interface DocumentGenerationResult {
    docxPath: string;
    pdfPath?: string;
    size: number;
}

export class DocumentEngine {
    private parser: TemplateParser;
    private pdfConverter: PdfConverter;

    constructor() {
        this.parser = new TemplateParser();
        // Default to puppeteer, can be overridden per request
        this.pdfConverter = new PdfConverter('puppeteer');
    }

    async generate(options: DocumentGenerationOptions): Promise<DocumentGenerationResult> {
        const {
            templatePath,
            data,
            outputName,
            outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
            toPdf = false,
            pdfStrategy = 'puppeteer',
        } = options;

        logger.info({ templatePath, outputName, toPdf, pdfStrategy }, 'Starting document generation');

        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // 1. Render DOCX
        const buffer = await this.parser.render({ templatePath, data });

        // Generate output filename
        const timestamp = Date.now();
        const docxFileName = `${outputName}-${timestamp}.docx`;
        const docxPath = path.join(outputDir, docxFileName);

        // Write DOCX
        await fs.writeFile(docxPath, buffer);
        const stats = await fs.stat(docxPath);

        const result: DocumentGenerationResult = {
            docxPath,
            size: stats.size,
        };

        // 2. Convert to PDF if requested
        if (toPdf) {
            try {
                const pdfFileName = `${outputName}-${timestamp}.pdf`;
                const pdfPath = path.join(outputDir, pdfFileName);

                // Instantiate converter with requested strategy
                const converter = new PdfConverter(pdfStrategy);

                await converter.convert({
                    docxPath,
                    outputPath: pdfPath,
                });

                result.pdfPath = pdfPath;
                logger.info({ pdfPath }, 'PDF generated successfully');
            } catch (error) {
                logger.warn({ error }, 'PDF conversion failed, returning DOCX only');
                // Don't fail the whole process if PDF fails
            }
        }

        return result;
    }
}

export const documentEngine = new DocumentEngine();

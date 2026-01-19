import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../logger';
import { PdfConverter } from './PdfConverter';
import { TemplateParser } from './TemplateParser';
export interface DocumentGenerationOptions {
    templatePath: string;
    data: Record<string, any>;
    outputName: string;
    outputDir?: string;
    toPdf?: boolean;
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
        this.pdfConverter = new PdfConverter();
    }
    async generate(options: DocumentGenerationOptions): Promise<DocumentGenerationResult> {
        const {
            templatePath,
            data,
            outputName,
            outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
            toPdf = false,
        } = options;
        logger.info({ templatePath, outputName, toPdf }, 'Starting document generation');
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
                // Don't fail the whole process if PDF fails
            }
        }
        return result;
    }
}
export const documentEngine = new DocumentEngine();
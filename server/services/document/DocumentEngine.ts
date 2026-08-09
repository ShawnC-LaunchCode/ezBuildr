import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { logger } from '../../logger';

import {
    PDF_CONVERSION_UNAVAILABLE_NOTICE,
    PdfConversionError,
    PdfConverter,
    type PdfConversionNotice,
    type PdfStrategyName,
} from './PdfConverter';
import { TemplateParser } from './TemplateParser';
export interface DocumentGenerationOptions {
    templatePath: string;
    templateBuffer?: Buffer;
    data: Record<string, unknown>;
    outputName: string;
    outputDir?: string;
    toPdf?: boolean;
    unresolvedVariables?: string[];
}
export interface DocumentGenerationResult {
    docxPath: string;
    pdfPath?: string;
    pdfFailed?: boolean;
    /**
     * The converter that actually produced `pdfPath`. An observed fact, not a
     * request — the strategy is chosen from `PDF_CONVERTER_API_URL`, so callers
     * cannot ask for one. Undefined when no PDF was requested or produced.
     */
    pdfStrategy?: PdfStrategyName;
    /** True when the high-fidelity converter failed and a degraded one produced the PDF. */
    pdfFellBack?: boolean;
    /** Safe, actionable author-facing explanation of degradation or failure. */
    pdfNotice?: PdfConversionNotice;
    size: number;
    unresolvedVariables?: string[];
}

export function sanitizeDocumentOutputName(outputName: string): string {
    const sanitized = outputName
        .replace(/[\\/]/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 180);

    return sanitized === '' || sanitized === '.' || sanitized === '..'
        ? 'document'
        : sanitized;
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
            // DEBT-15: intentionally ephemeral. The engine writes its rendered
            // output here for the caller to pick up within the same request;
            // callers that need the artifact to survive (final-block documents)
            // upload it to storageProvider and delete this copy.
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
        const safeOutputName = sanitizeDocumentOutputName(outputName);
        const docxFileName = `${safeOutputName}-${uniqueId}.docx`;
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
                const pdfFileName = `${safeOutputName}-${uniqueId}.pdf`;
                const pdfPath = path.join(outputDir, pdfFileName);
                const outcome = await this.pdfConverter.convert({
                    docxPath,
                    outputPath: pdfPath,
                });
                result.pdfPath = pdfPath;
                result.pdfStrategy = outcome.strategy;
                result.pdfFellBack = outcome.fellBack;
                result.pdfNotice = outcome.notice;
                logger.info(
                    {
                        pdfPath,
                        strategy: outcome.strategy,
                        fellBack: outcome.fellBack,
                        noticeCode: outcome.notice?.code,
                    },
                    'PDF generated successfully'
                );
            } catch (error) {
                const notice = error instanceof PdfConversionError
                    ? error.notice
                    : PDF_CONVERSION_UNAVAILABLE_NOTICE;
                logger.error(
                    { error, docxPath, noticeCode: notice.code },
                    'PDF conversion failed; returning DOCX with an actionable author notice'
                );
                result.pdfFailed = true;
                result.pdfNotice = notice;
                // Don't fail the whole process if PDF fails
            }
        }
        return result;
    }
}
export const documentEngine = new DocumentEngine();

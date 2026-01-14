import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

const execAsync = promisify(exec);

export interface PdfConversionOptions {
    docxPath: string;
    outputPath: string;
}

export interface PdfConversionStrategy {
    convert(options: PdfConversionOptions): Promise<void>;
}

/**
 * Strategy using Puppeteer (Headless Chrome)
 * Converts DOCX -> HTML (via Mammoth) -> PDF (via Puppeteer)
 * Pros: No external system dependencies (LibreOffice), highly customizable via CSS
 * Cons: Layout fidelity depends on Mammoth's conversion quality
 */
export class PuppeteerStrategy implements PdfConversionStrategy {
    async convert({ docxPath, outputPath }: PdfConversionOptions): Promise<void> {
        try {
            // 1. Convert DOCX to HTML using Mammoth
            const result = await mammoth.convertToHtml({ path: docxPath });
            const html = result.value; // The generated HTML
            const messages = result.messages; // Any warnings

            if (messages.length > 0) {
                logger.warn({ messages }, 'Mammoth conversion warnings');
            }

            // 2. Wrap HTML in a basic template for better styling
            const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin-bottom: 1em;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            h1, h2, h3 {
              color: #2c3e50;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

            // 3. Launch Puppeteer to generate PDF
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for some container environments
            });
            const page = await browser.newPage();

            // Set content
            await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

            // Generate PDF
            await page.pdf({
                path: outputPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm',
                },
            });

            await browser.close();
        } catch (error: any) {
            logger.error({ error }, 'Puppeteer PDF conversion failed');
            throw createError.internal(`PDF conversion failed: ${error.message}`);
        }
    }
}

/**
 * Strategy using LibreOffice (System Command)
 * Uses 'libreoffice --headless --convert-to pdf'
 * Pros: High layout fidelity (native DOCX support)
 * Cons: Requires LibreOffice installed on the system
 */
export class LibreOfficeStrategy implements PdfConversionStrategy {
    async convert({ docxPath, outputPath }: PdfConversionOptions): Promise<void> {
        try {
            const outputDir = path.dirname(outputPath);

            // LibreOffice places the output in the dir, we can't specify exact filename in the command easily
            // So we convert to dir, then rename if needed.
            // But here we assume outputPath has same basename as docxPath but .pdf extension, which is default behavior.

            await execAsync(
                `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`,
                { timeout: 30000 }
            );

            // Verify output exists
            // Note: LibreOffice uses the same basename, so if docxPath is 'foo.docx', output is 'foo.pdf'
            // We need to ensure that matches outputPath
            const expectedOutput = path.join(outputDir, `${path.basename(docxPath, path.extname(docxPath))  }.pdf`);

            if (expectedOutput !== outputPath) {
                // Rename if needed (unlikely if we stick to standard naming)
                await fs.rename(expectedOutput, outputPath);
            }

            await fs.access(outputPath);
        } catch (error: any) {
            logger.error({ error }, 'LibreOffice PDF conversion failed');
            throw createError.internal(`LibreOffice conversion failed: ${error.message}`);
        }
    }
}

/**
 * Factory to get the appropriate strategy
 */
export class PdfConverter {
    private strategy: PdfConversionStrategy;

    constructor(strategyType: 'puppeteer' | 'libreoffice' = 'puppeteer') {
        if (strategyType === 'libreoffice') {
            this.strategy = new LibreOfficeStrategy();
        } else {
            this.strategy = new PuppeteerStrategy();
        }
    }

    async convert(options: PdfConversionOptions): Promise<void> {
        return this.strategy.convert(options);
    }
}

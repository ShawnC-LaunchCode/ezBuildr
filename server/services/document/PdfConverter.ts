import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';

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
        } catch (error: unknown) {
            logger.error({ error }, 'Puppeteer PDF conversion failed');
            throw createError.internal(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

/**
 * Factory to get the appropriate strategy
 * Enforced to PuppeteerStrategy
 */
export class PdfConverter {
    private strategy: PdfConversionStrategy;

    constructor() {
        this.strategy = new PuppeteerStrategy();
    }

    async convert(options: PdfConversionOptions): Promise<void> {
        return this.strategy.convert(options);
    }
}

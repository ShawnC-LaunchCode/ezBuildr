import mammoth from 'mammoth';
import puppeteer, { type Browser } from 'puppeteer';

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
    /**
     * Shared browser instance, launched lazily and reused across conversions.
     * Launching Chromium per conversion is too expensive for callers like
     * PdfQueueService that convert on a polling loop.
     */
    private static browserPromise: Promise<Browser> | null = null;

    private static async getBrowser(): Promise<Browser> {
        if (PuppeteerStrategy.browserPromise !== null) {
            try {
                const existing = await PuppeteerStrategy.browserPromise;
                if (existing.connected) { return existing; }
            } catch {
                // fall through and relaunch
            }
            PuppeteerStrategy.browserPromise = null;
        }

        PuppeteerStrategy.browserPromise = puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for some container environments
        });

        try {
            return await PuppeteerStrategy.browserPromise;
        } catch (error) {
            PuppeteerStrategy.browserPromise = null;
            throw error;
        }
    }

    /** Close the shared browser (e.g. on graceful shutdown or in tests). */
    static async closeBrowser(): Promise<void> {
        if (PuppeteerStrategy.browserPromise === null) { return; }
        const promise = PuppeteerStrategy.browserPromise;
        PuppeteerStrategy.browserPromise = null;
        try {
            const browser = await promise;
            await browser.close();
        } catch (error) {
            logger.warn({ error }, 'Failed to close shared Puppeteer browser');
        }
    }

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

            // 3. Generate PDF via the shared headless browser
            const browser = await PuppeteerStrategy.getBrowser();
            const page = await browser.newPage();

            try {
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
            } finally {
                await page.close().catch((closeError: unknown) => {
                    logger.warn({ error: closeError }, 'Failed to close Puppeteer page');
                });
            }
        } catch (error: unknown) {
            logger.error({ error }, 'Puppeteer PDF conversion failed');
            throw createError.internal(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

/**
 * Strategy using Gotenberg API (or similar)
 */
export class ApiStrategy implements PdfConversionStrategy {
    async convert(options: PdfConversionOptions): Promise<void> {
        const apiUrl = process.env.PDF_CONVERTER_API_URL;
        if (!apiUrl) throw new Error('PDF_CONVERTER_API_URL is not set');
        
        logger.info({ docxPath: options.docxPath, apiUrl }, 'Converting PDF via API');
        
        // Pseudo-implementation for API conversion
        // e.g. POST to Gotenberg /forms/chromium/convert/html (after Mammoth HTML conversion)
        // or /forms/libreoffice/convert for raw docx.
        
        // For now, we will just simulate a failed API call so it falls back or fails cleanly
        // if the API isn't actually implemented
        throw new Error('API PDF conversion not fully implemented');
    }
}

/**
 * Factory to get the appropriate strategy
 */
export class PdfConverter {
    private strategy: PdfConversionStrategy;

    constructor() {
        if (process.env.PDF_CONVERTER_API_URL) {
            this.strategy = new ApiStrategy();
        } else {
            this.strategy = new PuppeteerStrategy();
        }
    }

    async convert(options: PdfConversionOptions): Promise<void> {
        return this.strategy.convert(options);
    }
}

export const pdfConverter = new PdfConverter();

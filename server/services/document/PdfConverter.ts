import fs from 'fs/promises';
import path from 'path';

import mammoth from 'mammoth';
import puppeteer, { type Browser } from 'puppeteer';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';
import { internalServiceRequest } from '../../utils/internalService';

/**
 * DOCX -> PDF conversion.
 *
 * Two strategies, selected by whether `PDF_CONVERTER_API_URL` is set:
 *
 * - **gotenberg** (`ApiStrategy`) — posts the DOCX to Gotenberg's LibreOffice
 *   route, which preserves headers, footers, numbering, fonts and section
 *   layout. This is the high-fidelity path and the one document-automation
 *   customers expect.
 * - **puppeteer** (`PuppeteerStrategy`) — converts DOCX -> HTML with Mammoth,
 *   then HTML -> PDF with headless Chromium. No external dependency, but
 *   Mammoth discards headers/footers, page and list numbering, table structure
 *   and section layout. It is a **degraded** fallback, not an equivalent.
 *
 * When the API is configured it is primary and Puppeteer is the fallback, so a
 * Gotenberg outage degrades fidelity instead of failing generation. That
 * fallback is deliberately loud: `convert()` reports which strategy actually
 * produced the file so callers can record it (`run_generated_documents
 * .pdf_strategy`), because a silently degraded PDF is indistinguishable from a
 * correct one to everybody except the customer reading it.
 */

/** Which converter produced a file. Persisted, so do not rename casually. */
export type PdfStrategyName = 'gotenberg' | 'puppeteer';

export interface PdfConversionOptions {
    docxPath: string;
    outputPath: string;
}

export interface PdfConversionOutcome {
    /** The converter that actually produced the output file. */
    strategy: PdfStrategyName;
    /** True when the primary strategy failed and the fallback produced the file. */
    fellBack: boolean;
    /** Safe, author-facing explanation when the PDF was produced at reduced fidelity. */
    notice?: PdfConversionNotice;
}

export interface PdfConversionNotice {
    code: 'PDF_FIDELITY_DEGRADED' | 'PDF_CONVERSION_UNAVAILABLE';
    message: string;
}

export const PDF_FIDELITY_DEGRADED_NOTICE: PdfConversionNotice = {
    code: 'PDF_FIDELITY_DEGRADED',
    message: 'The high-fidelity PDF converter was unavailable, so a reduced-fidelity PDF was created. Review headers, footers, page numbering, fonts, and tables before publishing.',
};

export const PDF_CONVERSION_UNAVAILABLE_NOTICE: PdfConversionNotice = {
    code: 'PDF_CONVERSION_UNAVAILABLE',
    message: 'PDF conversion is temporarily unavailable. Download the DOCX output and retry the PDF conversion later.',
};

/**
 * A safe error boundary for callers that surface conversion failures to authors.
 * Raw upstream and browser errors remain attached as `cause` for server logs but
 * never need to cross the API boundary.
 */
export class PdfConversionError extends Error {
    readonly notice = PDF_CONVERSION_UNAVAILABLE_NOTICE;

    constructor(cause: unknown) {
        super(PDF_CONVERSION_UNAVAILABLE_NOTICE.message, { cause });
        this.name = 'PdfConversionError';
    }
}

export interface PdfConversionStrategy {
    readonly name: PdfStrategyName;
    convert(options: PdfConversionOptions): Promise<void>;
}

/** Conversion budget. Gotenberg LibreOffice runs can be slow on large documents. */
const CONVERSION_TIMEOUT_MS = parseInt(process.env.PDF_CONVERTER_TIMEOUT_MS ?? '60000', 10);
/** Health probes must never hold up a request or a boot. */
const HEALTH_TIMEOUT_MS = 3000;
/**
 * Budget for each Puppeteer page operation (`setContent`, `pdf`). The HTML is
 * locally generated from Mammoth output and normally references nothing
 * remote, so this only bites when a template embeds a remote image/font or
 * Chromium's rendering hangs. A few seconds is generous for locally-generated
 * HTML, and this must stay well under any upstream request timeout.
 */
const PUPPETEER_PAGE_TIMEOUT_MS = 10_000;

/**
 * Strategy using Puppeteer (Headless Chrome)
 * Converts DOCX -> HTML (via Mammoth) -> PDF (via Puppeteer)
 * Pros: No external office-suite dependency, highly customizable via CSS
 * Cons: Layout fidelity depends on Mammoth's conversion quality — headers,
 * footers, numbering and section layout are lost. See the module header.
 */
export class PuppeteerStrategy implements PdfConversionStrategy {
    readonly name = 'puppeteer' as const;

    /**
     * Shared browser instance, launched lazily and reused across conversions.
     * Launching Chromium per conversion is too expensive when converting many
     * documents in a row.
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
                await page.setContent(styledHtml, {
                    waitUntil: 'networkidle0',
                    timeout: PUPPETEER_PAGE_TIMEOUT_MS,
                });

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
                    timeout: PUPPETEER_PAGE_TIMEOUT_MS,
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

/** Gotenberg's LibreOffice conversion route. */
const CONVERT_PATH = '/forms/libreoffice/convert';

/**
 * Strategy using a Gotenberg (LibreOffice) conversion service.
 *
 * Gotenberg picks its converter from the uploaded file's extension, so the part
 * filename must keep its real `.docx` suffix.
 */
export class ApiStrategy implements PdfConversionStrategy {
    readonly name = 'gotenberg' as const;

    constructor(private readonly apiUrl: string) {}

    async convert(options: PdfConversionOptions): Promise<void> {
        const filename = path.basename(options.docxPath);
        const startedAt = Date.now();

        logger.info({ docxPath: options.docxPath, path: CONVERT_PATH }, 'Converting PDF via Gotenberg');

        const fileBuffer = await fs.readFile(options.docxPath);

        const formData = new FormData();
        formData.append('files', new Blob([fileBuffer]), filename);

        let response: Response;
        try {
            // Goes through internalServiceRequest, not safeFetch: this is
            // operator-configured infrastructure that is deliberately private,
            // which safeFetch rejects by design. See that module's header.
            response = await internalServiceRequest(this.apiUrl, CONVERT_PATH, {
                method: 'POST',
                body: formData,
                // Without a budget a hung converter holds the request open
                // indefinitely and takes a document-processing slot with it.
                signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
            });
        } catch (error: unknown) {
            // AbortError from the timeout arrives here alongside network errors;
            // both mean "Gotenberg did not produce a PDF", so both fall back.
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Gotenberg request failed after ${Date.now() - startedAt}ms: ${reason}`
            );
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => 'unreadable error body');
            throw new Error(`Gotenberg returned ${response.status}: ${errText.slice(0, 500)}`);
        }

        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        if (pdfBuffer.length === 0) {
            throw new Error('Gotenberg returned an empty body');
        }

        await fs.writeFile(options.outputPath, pdfBuffer);
        logger.info(
            { outputPath: options.outputPath, bytes: pdfBuffer.length, durationMs: Date.now() - startedAt },
            'Gotenberg conversion succeeded'
        );
    }

    /** Non-destructive reachability probe — never converts a document. */
    async ping(): Promise<void> {
        const response = await internalServiceRequest(this.apiUrl, '/health', {
            method: 'GET',
            signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`health endpoint returned ${response.status}`);
        }
    }
}

export interface PdfConverterHealth {
    /** The strategy this instance will try first. */
    strategy: PdfStrategyName;
    /** Whether that strategy is usable right now. Always true for local Puppeteer. */
    reachable: boolean;
    responseTimeMs?: number;
    /**
     * Internal diagnostic only. Callers exposing health publicly MUST NOT echo
     * this — it can contain the converter URL or hostname.
     */
    error?: string;
}

/**
 * Selects a strategy at construction and reports what actually ran.
 *
 * When `PDF_CONVERTER_API_URL` is set the API strategy is primary with local
 * Puppeteer as the fallback, so a converter outage degrades fidelity rather
 * than failing generation outright.
 */
export class PdfConverter {
    private readonly strategy: PdfConversionStrategy;
    private readonly fallback: PdfConversionStrategy | null;

    constructor(apiUrl: string | undefined = process.env.PDF_CONVERTER_API_URL) {
        if (apiUrl !== undefined && apiUrl.length > 0) {
            this.strategy = new ApiStrategy(apiUrl);
            this.fallback = new PuppeteerStrategy();
        } else {
            this.strategy = new PuppeteerStrategy();
            this.fallback = null;
        }
    }

    /** The strategy that will be attempted first. */
    get primaryStrategy(): PdfStrategyName {
        return this.strategy.name;
    }

    async convert(options: PdfConversionOptions): Promise<PdfConversionOutcome> {
        try {
            await this.strategy.convert(options);
            return { strategy: this.strategy.name, fellBack: false };
        } catch (primaryError) {
            if (this.fallback === null) {
                logger.error(
                    {
                        error: primaryError,
                        event: 'pdf_conversion_failed',
                        primary: this.strategy.name,
                        fallback: null,
                    },
                    'PDF conversion failed; no fallback converter is configured'
                );
                throw new PdfConversionError(primaryError);
            }
            // `error`, not `warn`: this means every document produced from here
            // on is materially lower fidelity than the approved template, which
            // is an operational incident rather than a curiosity.
            logger.error(
                {
                    error: primaryError,
                    event: 'pdf_conversion_fallback',
                    primary: this.strategy.name,
                    fallback: this.fallback.name,
                },
                'Primary PDF conversion failed; falling back to lower-fidelity converter'
            );

            try {
                await this.fallback.convert(options);
            } catch (fallbackError) {
                logger.error(
                    {
                        primaryError,
                        fallbackError,
                        event: 'pdf_conversion_failed',
                        primary: this.strategy.name,
                        fallback: this.fallback.name,
                    },
                    'PDF conversion failed in both the primary and fallback converters'
                );
                throw new PdfConversionError(fallbackError);
            }

            logger.warn(
                {
                    event: 'pdf_conversion_degraded',
                    primary: this.strategy.name,
                    strategy: this.fallback.name,
                    noticeCode: PDF_FIDELITY_DEGRADED_NOTICE.code,
                },
                'PDF conversion completed with reduced fidelity'
            );
            return {
                strategy: this.fallback.name,
                fellBack: true,
                notice: PDF_FIDELITY_DEGRADED_NOTICE,
            };
        }
    }

    /**
     * Report whether the configured converter is usable. Local Puppeteer needs
     * no probe and is always considered reachable; a configured API strategy is
     * pinged with a short timeout.
     */
    async healthCheck(): Promise<PdfConverterHealth> {
        if (!(this.strategy instanceof ApiStrategy)) {
            return { strategy: this.strategy.name, reachable: true };
        }

        const startedAt = Date.now();
        try {
            await this.strategy.ping();
            return {
                strategy: this.strategy.name,
                reachable: true,
                responseTimeMs: Date.now() - startedAt,
            };
        } catch (error: unknown) {
            return {
                strategy: this.strategy.name,
                reachable: false,
                responseTimeMs: Date.now() - startedAt,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export const pdfConverter = new PdfConverter();

/**
 * Log which converter this process will use, once, at boot.
 *
 * Setting `PDF_CONVERTER_API_URL` against an unimplemented API strategy silently
 * degraded every production PDF for weeks with nothing in the boot log to show
 * it. This line, plus the `/health` field, is what makes that state visible.
 */
export function logPdfConverterSelection(): void {
    const configured = process.env.PDF_CONVERTER_API_URL;
    if (configured !== undefined && configured.length > 0) {
        // `warn`, not `info`, even though this is the healthy case. This line
        // exists to be *read* — it is how an operator confirms which converter a
        // deployed instance actually picked. Deployments here run with
        // `LOG_LEVEL=warn` (see .env), which would filter an info line out and
        // leave exactly the blind spot this function was added to close. Same
        // reasoning as `serving on port` in server/index.ts: a once-per-process
        // operational fact must survive log-level filtering.
        logger.warn(
            { strategy: 'gotenberg', fallback: 'puppeteer', timeoutMs: CONVERSION_TIMEOUT_MS },
            'PDF converter: high-fidelity API configured, local Puppeteer as fallback'
        );
    } else {
        logger.warn(
            { strategy: 'puppeteer' },
            'PDF converter: no PDF_CONVERTER_API_URL set — using local Puppeteer, which loses headers, footers, numbering and section layout'
        );
    }
}

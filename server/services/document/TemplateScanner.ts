import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { logger } from '../../logger';

import { TemplateParser } from './TemplateParser';

export interface ScanResult {
    fixed: boolean;
    buffer: Buffer;
    repairs: string[];
    isValid: boolean;
    errors?: string[];
}

export class TemplateScanner {
    private parser: TemplateParser;

    constructor() {
        this.parser = new TemplateParser();
    }

    /**
     * Scan a DOCX buffer, attempt to fix common issues, and validate
     */
    async scanAndFix(buffer: Buffer): Promise<ScanResult> {
        const repairs: string[] = [];
        let currentBuffer = buffer;
        let fixed = false;

        try {
            // 1. Load Zip
            const zip = new PizZip(currentBuffer);

            // 2. Get document.xml
            const docXml = zip.file('word/document.xml')?.asText();

            if (!docXml) {
                return {
                    fixed: false,
                    buffer,
                    repairs,
                    isValid: false,
                    errors: ['Could not find word/document.xml in DOCX file']
                };
            }

            // 3. Normalize XML (remove invisible chars)
            const normalizedXml = this.normalizeXml(docXml);

            // 4. Apply fixes
            const { xml: newXml, repairs: xmlRepairs } = this.repairXml(normalizedXml);

            if (normalizedXml !== docXml) {
                // repairs.push('Normalized invisible characters'); // Optional: don't report if just cleaning
            }

            if (xmlRepairs.length > 0) {
                repairs.push(...xmlRepairs);
                fixed = true;
            }

            // 5. If fixed or normalized, update zip
            if (fixed || normalizedXml !== docXml) {
                zip.file('word/document.xml', newXml);
                currentBuffer = zip.generate({ type: 'nodebuffer' });
            }

            // 6. Validate
            try {
                this.validateBuffer(currentBuffer);

                return {
                    fixed: fixed || normalizedXml !== docXml,
                    buffer: currentBuffer,
                    repairs,
                    isValid: true
                };

            } catch (error: unknown) {
                // Log the XML context for debugging
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const errorContext = this.extractErrorContext(newXml, error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error({
                    error: errorMessage,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    context: errorContext,
                    repairsApplied: repairs
                }, 'Template validation failed after repairs');

                // If validation fails
                return {
                    fixed: fixed || normalizedXml !== docXml,
                    buffer: currentBuffer,
                    repairs,
                    isValid: false,
                    errors: this.extractErrors(error)
                };
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ error }, 'Template scanning failed');
            return {
                fixed: false,
                buffer,
                repairs,
                isValid: false,
                errors: [errorMessage]
            };
        }
    }

    /**
     * Remove invisible characters and normalize spaces
     */
    private normalizeXml(xml: string): string {
        return xml
            .replace(/\u200B/g, '') // Zero-width space
            .replace(/\uFEFF/g, '') // BOM
            .replace(/\u00A0/g, ' '); // Non-breaking space -> regular space
    }

    /**
     * Repair XML content by fixing common template issues
     */
    public repairXml(xml: string): { xml: string; repairs: string[] } {
        let newXml = xml;
        const repairs: string[] = [];

        // Fix 1: Duplicate delimiters (e.g. {{{{ or <w:t>{{</w:t><w:t>{{</w:t>)
        // Strategy: Find {{ followed by (tags or whitespace or non-brace chars) followed by {{
        // We want to keep the first {{ and the intermediate content, but remove the second {{

        // Regex for Open: ({{)((?:(?!}}|{{)[\s\S])*)({{)
        // Capture group 1: {{
        // Capture group 2: Intermediate content (anything that doesn't contain }} or {{, including newlines)
        // Capture group 3: {{
        // Replace with: $1$2 (Keep first {{, keep intermediate, remove second {{)
        const duplicateOpenRegex = /({{)((?:(?!}}|{{)[\s\S])*)({{)/g;
        let loopCountOpen = 0;
        while (duplicateOpenRegex.test(newXml) && loopCountOpen < 5) {
            newXml = newXml.replace(duplicateOpenRegex, '$1$2');
            repairs.push('Fixed duplicate open delimiters');
            loopCountOpen++;
        }

        // Regex for Close: (}})((?:(?!}}|{{)[\s\S])*)(}})
        // Capture group 1: }}
        // Capture group 2: Intermediate content
        // Capture group 3: }}
        // Replace with: $1$2 (Keep first }}, keep intermediate, remove second }})
        const duplicateCloseRegex = /(}})((?:(?!}}|{{)[\s\S])*)(}})/g;
        let loopCountClose = 0;
        while (duplicateCloseRegex.test(newXml) && loopCountClose < 5) {
            newXml = newXml.replace(duplicateCloseRegex, '$1$2');
            repairs.push('Fixed duplicate close delimiters');
            loopCountClose++;
        }

        // Fix 2: Split tags (XML tags inside placeholders)
        let hasSplitTags = true;
        let loopCount = 0;
        const maxLoops = 10;

        while (hasSplitTags && loopCount < maxLoops) {
            const originalXml = newXml;
            // Regex to find {{...<...>...}}
            // This regex looks for {{ followed by any characters that are NOT } (lazy), 
            // then a tag <...>, then any characters (lazy) until }}
            newXml = newXml.replace(/({{[^}]*?)(<[^>]+>)(.*?}})/g, '$1$3');

            if (newXml !== originalXml) {
                hasSplitTags = true;
                loopCount++;
            } else {
                hasSplitTags = false;
            }
        }

        if (loopCount > 0) {
            repairs.push(`Removed hidden XML formatting tags from ${loopCount} placeholders`);
        }

        return { xml: newXml, repairs };
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private validateBuffer(buffer: Buffer) {
        const zip = new PizZip(buffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });
        doc.compile();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private extractErrors(error: any): string[] {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (error.properties?.errors) {

            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            return error.properties.errors.map((e: any) => e.message || e.name);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return [error.message];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private extractErrorContext(xml: string, error: any): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!error.properties) {return null;}

        // Handle Multi error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (error.properties.errors && Array.isArray(error.properties.errors)) {

            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
            return error.properties.errors.map((e: any) => this.extractErrorContext(xml, e));
        }

        // Try to find the tag in the XML
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const tag = error.properties.xtag;
        if (!tag) {return null;}

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const index = xml.indexOf(tag);
        if (index === -1) {return `Tag '${tag}' not found in XML`;}

        // Return 100 chars before and after
        const start = Math.max(0, index - 100);
        const end = Math.min(xml.length, index + 100);
        const snippet = xml.substring(start, end);

        // Create hex dump of snippet for deep debugging
        const hex = Buffer.from(snippet).toString('hex').match(/../g)?.join(' ');

        return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            tag,
            snippet,
            hex
        };
    }
}

export const templateScanner = new TemplateScanner();

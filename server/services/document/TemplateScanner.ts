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

/**
 * Inline XML elements Word wraps around run text while the author is
 * mid-edit (autocorrect, spell-check, revision marks, bookmarks). Safe to
 * strip from inside a `{{ }}` placeholder -- no content is lost. `w:p` is
 * deliberately included: a placeholder split across `</w:p><w:p>` already
 * repairs and renders correctly today and must keep doing so (TPL-4 AC4).
 * Table/row/table elements are NOT in this list on purpose -- see
 * `repairXml`'s structural-boundary check below.
 */
const INLINE_SPLIT_TAGS = [
    'w:t', 'w:r', 'w:rPr', 'w:pPr', 'w:p', 'w:proofErr',
    'w:bookmarkStart', 'w:bookmarkEnd', 'w:rFonts', 'w:noProof',
    'w:lang', 'w:ins', 'w:del', 'w:smartTag', 'w:hyperlink'
] as const;

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
            const { xml: newXml, repairs: xmlRepairs, errors: xmlErrors } = this.repairXml(normalizedXml);

            if (normalizedXml !== docXml) {
                // repairs.push('Normalized invisible characters'); // Optional: don't report if just cleaning
            }

            // A placeholder spanning a structural XML boundary (table cell/row)
            // is objectively broken per D2: hard-fail the upload rather than
            // silently merging cells. Report it immediately, before any other
            // repair is written to the buffer.
            if (xmlErrors.length > 0) {
                return {
                    fixed: false,
                    buffer,
                    repairs,
                    isValid: false,
                    errors: xmlErrors
                };
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
     * Remove invisible characters, normalize spaces, and straighten curly
     * quotes -- but only inside placeholder bodies.
     *
     * Word's autocorrect turns a straight quote into U+201C/U+201D (double)
     * or U+2018/U+2019 (single) as the author types, which silently breaks a
     * quoted filter argument (`formatDate:"MM/DD/YYYY"` becomes unparseable
     * once the quotes are curly). This is defence in depth: the render-time
     * parser (`docxtemplater/expressions.js`) already normalises quotes
     * inside `{{ }}` at render time, but the stored template is what every
     * other consumer reads, so fixing it at the upload boundary too is
     * correct.
     *
     * The replacement is scoped to `{{ ... }}` spans on purpose (TPL-4 AC2):
     * a legal document is full of quoted terms in ordinary prose, and
     * rewriting the author's prose quotes outside a placeholder would be a
     * content change, not a repair. The matching regex tolerates XML tags
     * inside the span so it still finds a placeholder Word has split across
     * runs -- smart quotes are plain Unicode text characters, never part of
     * a tag, so blindly straightening every quote character within a
     * matched span (tags included) is safe.
     */
    private normalizeXml(xml: string): string {
        const withoutInvisibles = xml
            .replace(/\u200B/g, '') // Zero-width space
            .replace(/\uFEFF/g, '') // BOM
            .replace(/\u00A0/g, ' '); // Non-breaking space -> regular space

        return withoutInvisibles.replace(/\{\{[^}]*?\}\}/g, (placeholder) =>
            placeholder
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
        );
    }

    /**
     * Repair XML content by fixing common template issues.
     *
     * Returns `errors` for damage that must NOT be silently repaired: a
     * placeholder spanning a structural XML boundary (a table cell or row
     * split) per D2 -- see the structural-boundary check below.
     */
    public repairXml(xml: string): { xml: string; repairs: string[]; errors: string[] } {
        let newXml = xml;
        const repairs: string[] = [];
        const errors: string[] = [];

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

        // Fix 2: Split tags (inline XML tags inside placeholders).
        // Only INLINE_SPLIT_TAGS are stripped here -- run/paragraph-level
        // wrappers that Word inserts mid-edit with no semantic content of
        // their own. A structural tag (table cell/row) is deliberately NOT
        // matched by this regex; it is caught by the structural-boundary
        // check below instead of being stripped, because removing it would
        // silently merge two cells into one (TPL-4 finding b).
        const inlineTagAlternation = INLINE_SPLIT_TAGS.join('|');
        const splitInlineTagRegex = new RegExp(
            `({{[^}]*?)(<\\/?(?:${inlineTagAlternation})(?:\\s[^>]*)?\\/?>)(.*?}})`,
            'g'
        );

        let hasSplitTags = true;
        let loopCount = 0;
        const maxLoops = 10;

        while (hasSplitTags && loopCount < maxLoops) {
            const originalXml = newXml;
            // Regex to find {{...<inline tag>...}}
            // This regex looks for {{ followed by any characters that are NOT } (lazy),
            // then an allow-listed inline tag <...>, then any characters (lazy) until }}
            newXml = newXml.replace(splitInlineTagRegex, '$1$3');

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

        // Structural-boundary check: after the inline pass above, anything
        // still inside a `{{ }}` span is a tag we deliberately did not
        // strip -- a table cell/row/table split, or anything else not
        // recognised as safe. Leave the XML untouched and hard-fail per D2
        // (TPL-4 AC5) instead of silently merging structure.
        const structuralTagRegex = /\{\{[^}]*?(<[^>]+>)[^}]*?\}\}/g;
        let structuralMatch: RegExpExecArray | null;
        while ((structuralMatch = structuralTagRegex.exec(newXml)) !== null) {
            errors.push(
                `Placeholder spans a structural XML boundary (${structuralMatch[1]}) and cannot be safely repaired -- likely a table cell or row split. Edit the template in Word so the entire {{ }} tag sits inside one table cell.`
            );
        }

        // A structurally broken placeholder means the upload is rejected (D2),
        // so no repair should be applied to it -- or to anything else in the
        // document. Returning `newXml` here would hand back XML whose inline
        // tags had already been stripped around the structural boundary,
        // leaving `<w:t>` spanning a cell edge: unbalanced markup, and worse
        // than the input we were given. Return the caller's original bytes.
        if (errors.length > 0) {
            return { xml, repairs: [], errors };
        }

        return { xml: newXml, repairs, errors };
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

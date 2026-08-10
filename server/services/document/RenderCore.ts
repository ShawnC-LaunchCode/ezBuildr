/**
 * Render Core — the single docxtemplater configuration and expression parser
 * every DOCX render path goes through.
 *
 * History: three drifted copies of this logic existed (TemplateParser,
 * docxRenderer2, legacy docxRenderer) with divergent bugs. Both live entry
 * points now delegate here; do not add another copy.
 */

import fs from 'fs/promises';


import Docxtemplater from 'docxtemplater';
// docxtemplater's own angular-expressions wrapper (not the bare `angular-expressions`
// package): it already implements the scopeList parent-scope walk, `$index` via
// `scopePathItem`, and `.`-to-`this` rewriting that a hand-rolled parser would
// otherwise have to reimplement -- see TPL-2's turn-in notes for why this
// supersedes TPL-1 spike's manual scopeList merge.
import angularExpressionParser from 'docxtemplater/expressions.js';

import PizZip from 'pizzip';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';
import { docxHelpers, formatArrayForDisplay, resolveHelperArg, tokenizeTag } from '../docxHelpers';

const TEMPLATE_SYNTAX_ERROR_PREFIX = 'Template syntax error: ';
const ERROR_SEPARATOR = ' | ';

// D4: `{%` and `{#` are reserved for future Jinja-style statement/comment
// syntax and must be rejected now rather than left silently unrenderable.
// Real docxtpl migrations write them as bare text (`{%tr if ... %}`), outside
// our `{{ }}` delimiters, so docxtemplater's own tag scanner never sees them --
// catching this has to be a raw-text scan, not a parser-level check.
//
// `{#` must exclude `{{#`, which is docxtemplater's own loop/section syntax
// (every `{{#items}}` contains the literal substring `{#`) -- the negative
// lookbehind is the whole reason this isn't a plain substring search. `{%`
// has no such collision: no docxtemplater module character is `%`.
const RESERVED_STATEMENT_PATTERN = /(?<!\{)\{#|\{%/;
const RESERVED_STATEMENT_SCAN_PATTERN = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/**
 * Register every `docxHelpers` function as an angular-expressions filter,
 * once, at module load. Filters are called as `fn(value, ...args)`, the same
 * shape every docxHelpers function already uses, so no wrapping is needed.
 *
 * MUST iterate the `docxHelpers` *object* (already true here -- this file
 * imports `{ docxHelpers }`, never `import * as docxHelpers`): the module
 * namespace misses the 8 formatters merged in via `...formatters` and pulls
 * in 5 non-helper exports (tokenizeTag, parseHelperArg, resolveHelperArg,
 * formatArrayForDisplay). TPL-1's first submission had exactly this bug --
 * `{{ fee | currency }}` threw `Filter 'currency' is not defined`.
 */
for (const [filterName, helperFn] of Object.entries(docxHelpers)) {
  if (typeof helperFn === 'function') {
    angularExpressionParser.filters[filterName] = helperFn as (...args: unknown[]) => unknown;
  }
}

interface DocxtemplaterError {
    name?: string;
    message?: string;
    properties?: {
        id?: string;
        explanation?: string;
        errors?: DocxtemplaterError[];
    };
}

interface RenderError extends Error {
    code?: string;
    status?: number;
    properties?: {
        errors?: DocxtemplaterError[];
    };
}

type HelperFunction = (...args: unknown[]) => unknown;

/** Subset of the context docxtemplater passes to parser.get */
interface ParserContext {
    meta?: {
        part?: {
            module?: string;
        };
    };
}

/** True when the tag is a loop/inverted section, which needs the raw array */
function isLoopContext(context: unknown): boolean {
    return (context as ParserContext)?.meta?.part?.module === 'loop';
}

/**
 * Get nested value from object using dot notation
 * Example: "user.address.city" -> scope.user.address.city
 */
export function getNestedValue(obj: Record<string, unknown>, pathStr: string): unknown {
    if (!pathStr) { return obj; }

    let current: unknown = obj;
    for (const key of pathStr.split('.')) {
        if (current === null || current === undefined) { return undefined; }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

interface TagParser {
    get(scope: Record<string, unknown>, context: unknown): unknown;
}

/**
 * The legacy single-slot grammar: `{{helperName value arg1 arg2}}`. Fixed
 * positions -- helper, value, args -- with no slot for chaining, no
 * comparisons, and no bracket indexing. Kept working, unchanged, only because
 * ~13 existing tests are still coupled to it; TPL-3 deletes this branch
 * entirely. Returns undefined when `tag` does not match the shape, so the
 * caller falls through to the new grammar.
 */
function tryLegacyHelperTag(tag: string): TagParser | undefined {
    const parts = tokenizeTag(tag);
    if (parts.length <= 1 || !(parts[0] in docxHelpers)) {
        return undefined;
    }

    const helperName = parts[0];
    const helper = docxHelpers[helperName as keyof typeof docxHelpers] as HelperFunction | undefined;
    if (typeof helper !== 'function') {
        return undefined;
    }

    return {
        get(scope: Record<string, unknown>): unknown {
            const value = getNestedValue(scope, parts[1]);
            const args = parts.slice(2).map((arg) => resolveHelperArg(scope, arg));

            try {
                return helper(value, ...args);
            } catch (error) {
                logger.error({ error, helperName }, `Helper ${helperName} failed`);
                return '';
            }
        },
    };
}

/**
 * The expression parser. Two grammars, tried in order:
 *
 * 1. The legacy helper-prefix form ({{formatDate dob "MMMM DD, YYYY"}}) --
 *    kept working only within this ticket; TPL-3 deletes it.
 * 2. Everything else, through docxtemplater's angular-expressions parser:
 *    pipe filters and chaining ({{ x | trim | upper }}), filter arguments
 *    ({{ d | formatDate:"MM/DD/YYYY" }}), comparisons in section tags
 *    ({{#a == b}}), array indexing ({{ Children[9].name }}), `{{$index}}`,
 *    and `.` self-reference (handled by docxtemplater's own dot-to-`this`
 *    rewrite).
 *
 * Both paths are wrapped identically: arrays used as a scalar {{tag}} render
 * as joined text; loop tags ({{#tag}}) receive the raw array for iteration.
 */
export function createExpressionParser(tag: string): TagParser {
    const parser = tryLegacyHelperTag(tag) ?? (angularExpressionParser(tag) as TagParser);

    return {
        get(scope: Record<string, unknown>, context: unknown): unknown {
            const value = parser.get(scope, context);

            if (Array.isArray(value) && !isLoopContext(context)) {
                return formatArrayForDisplay(value);
            }

            return value;
        },
    };
}

/**
 * Strip XML markup so a placeholder split across runs reads as intact text.
 * Word routinely splits `{{#items}}` as `{` + `{#items}}` across two `<w:t>`
 * runs, and `TemplateScanner.repairXml` does not repair delimiter splits
 * (only structural ones), so these reach the renderer still split. Scanning
 * raw markup would read the intervening `</w:t></w:r><w:r><w:t>` as the
 * character before `{#`, so the negative-lookbehind exclusion for
 * docxtemplater's own `{{#...}}` syntax misses and a perfectly valid loop
 * tag gets rejected as reserved syntax. Stripping tags first also means a
 * genuinely reserved `{%`/`{#` split the same way is still caught.
 */
function stripMarkupForReservedScan(xml: string): string {
    return xml.replace(/<[^>]+>/g, '');
}

/**
 * Find the first reserved statement/comment marker (`{%`, bare `{#`) in
 * placeholder text, returning the snippet from the marker up to (and
 * including) the next `}` so the error can name the offending tag. Falls
 * back to a fixed-length slice when no closing brace is found
 * (malformed/truncated markup).
 */
function findReservedStatementTag(text: string): string | undefined {
    const match = RESERVED_STATEMENT_PATTERN.exec(text);
    if (match === null) { return undefined; }

    const earliestIndex = match.index;
    const closeIdx = text.indexOf('}', earliestIndex);
    return closeIdx === -1
        ? text.slice(earliestIndex, earliestIndex + 60)
        : text.slice(earliestIndex, closeIdx + 1);
}

/** D4: hard-fail an upload containing reserved `{%`/`{#` statement syntax. */
function assertNoReservedStatementSyntax(zip: PizZip): void {
    for (const file of zip.file(RESERVED_STATEMENT_SCAN_PATTERN)) {
        const text = stripMarkupForReservedScan(file.asText());
        const reservedTag = findReservedStatementTag(text);
        if (reservedTag !== undefined) {
            throw createError.internal(
                `${TEMPLATE_SYNTAX_ERROR_PREFIX}statement syntax is reserved and not yet supported: ${reservedTag}`
            );
        }
    }
}

/** Shared docxtemplater construction — the one place render options live */
export function createDocxRenderer(zip: PizZip, unresolvedVariables?: string[]): Docxtemplater {
    return new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter: (part: { value?: string }): string => {
            if (unresolvedVariables && part?.value && !unresolvedVariables.includes(part.value)) {
                unresolvedVariables.push(part.value);
            }
            return '';
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- docxtemplater parser type is not publicly exported
        parser: ((tag: string) => createExpressionParser(tag)) as any,
    });
}

export interface RenderDocxBufferOptions {
    templatePath: string;
    templateBuffer?: Buffer;
    data: Record<string, unknown>;
    unresolvedVariables?: string[];
}

/**
 * Render a DOCX template to a buffer. Accepts an in-memory buffer or a file
 * path; throws structured, user-facing errors for template syntax problems.
 */
export async function renderDocxBuffer({
    templatePath,
    templateBuffer,
    data,
    unresolvedVariables,
}: RenderDocxBufferOptions): Promise<Buffer> {
    try {

        const content = templateBuffer ?? (await fs.readFile(templatePath, 'binary'));
        const zip = new PizZip(content);
        assertNoReservedStatementSyntax(zip);
        const doc = createDocxRenderer(zip, unresolvedVariables);

        // Merge data with helpers for template use (top-level access)
        const templateData = {
            ...data,
            ...docxHelpers,
        };

        try {
            doc.render(templateData);
        } catch (error: unknown) {
            handleRenderError(error as RenderError);
        }

        return (doc.getZip() as PizZip).generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });
    } catch (error: unknown) {
        const renderErr = error as RenderError;
        logger.error({ error: renderErr, props: renderErr.properties }, 'Template rendering raw error');

        if (renderErr.code !== undefined && renderErr.status !== undefined) { throw renderErr; } // Re-throw known errors

        if (renderErr.properties?.errors !== undefined) {
            const errorDetails = renderErr.properties.errors
                .map((err: DocxtemplaterError) => `${err.name ?? 'Error'}: ${err.message ?? 'Unknown'}`)
                .join(ERROR_SEPARATOR);
            throw createError.internal(`${TEMPLATE_SYNTAX_ERROR_PREFIX}${errorDetails}`);
        }

        throw createError.internal(`Template rendering failed: ${renderErr.message ?? 'Unknown error'}`);
    }
}

function handleRenderError(error: RenderError): void {
    const errors = error.properties?.errors;
    logger.error({ error, errors }, 'Docxtemplater render error');

    if (errors !== undefined) {
        const errorDetails = errors
            .map((err: DocxtemplaterError) => {
                const detailParts: string[] = [err.name ?? 'Error'];
                if (err.message !== undefined) { detailParts.push(err.message); }
                if (err.properties?.id !== undefined) { detailParts.push(`at ${err.properties.id}`); }
                if (err.properties?.explanation !== undefined) { detailParts.push(`(${err.properties.explanation})`); }
                return detailParts.join(': ');
            })
            .join(ERROR_SEPARATOR);

        throw createError.internal(`${TEMPLATE_SYNTAX_ERROR_PREFIX}${errorDetails}`, {
            errors,
        });
    }
    throw error;
}

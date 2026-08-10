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
import { ApiError, createError } from '../../utils/errors';
import { docxHelpers, formatArrayForDisplay } from '../docxHelpers';

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

interface TagParser {
    get(scope: Record<string, unknown>, context: unknown): unknown;
}

/**
 * The expression parser. D1: one grammar, no compatibility shim -- the old
 * `{{helperName value arg1 arg2}}` prefix form (fixed positions, no slot for
 * chaining, no comparisons, no bracket indexing) is deleted outright, not
 * flag-guarded. Everything goes through docxtemplater's angular-expressions
 * parser: pipe filters and chaining ({{ x | trim | upper }}), filter
 * arguments ({{ d | formatDate:"MM/DD/YYYY" }}), comparisons in section tags
 * ({{#a == b}}), array indexing ({{ Children[9].name }}), `{{$index}}`, and
 * `.` self-reference (handled by docxtemplater's own dot-to-`this` rewrite).
 * A tag using the old grammar (e.g. `{{formatDate dob "..."}}`) is not valid
 * angular-expressions syntax and fails compilation with a "Scope parser
 * compilation failed" error naming the tag -- see `renderDocxBuffer`.
 *
 * Arrays used as a scalar {{tag}} render as joined text; loop tags
 * ({{#tag}}) receive the raw array for iteration.
 */
export function createExpressionParser(tag: string): TagParser {
    const parser = angularExpressionParser(tag) as TagParser;

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

/**
 * Split the tag text before its first top-level `|` -- the plain
 * variable/path reference a bare (filter-less) tag resolves. A tag with a
 * filter chain never needs this: most filters already turn null into a safe
 * default before nullGetter would ever fire, and `| default(...)` opts in to
 * that explicitly (see `defaultValue` in docxHelpers). `|` inside a quoted
 * filter argument or bracket index must not be mistaken for the split point.
 */
function extractPrimaryPath(tagText: string): string {
    let depth = 0;
    let quote: string | undefined;
    for (let i = 0; i < tagText.length; i++) {
        const ch = tagText[i];
        if (quote !== undefined) {
            if (ch === quote) { quote = undefined; }
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '(' || ch === '[') { depth += 1; continue; }
        if (ch === ')' || ch === ']') { depth -= 1; continue; }
        if (ch === '|' && depth === 0) { return tagText.slice(0, i).trim(); }
    }
    return tagText.trim();
}

/**
 * D3: split "not in the data contract" from "present but empty" -- but only
 * for TOP-LEVEL variables (`scopeList.length === 1`, i.e. not inside a
 * `{{#loop}}`). Once inside a loop, `scopeList`'s inner entries are
 * arbitrary per-item data (List answers, DataVault rows, JSON imports) with
 * no guarantee every item shares the same keys -- a field present on one
 * array item and absent on the next is completely ordinary, not a typo, and
 * `scopeList` has no visibility into sibling items to prove otherwise either
 * way. `TemplateValidationService.buildReport` draws the same line for the
 * same reason ("Fields inside {{#loop}} resolve against loop items; they
 * cannot be statically verified against workflow variables"). Verified
 * against a real render: a two-item loop where only the second item lacks an
 * optional field raised for every render before this check was added here.
 *
 * - Past the root, a missing key on a plain (non-loop) object is unknown.
 * - An out-of-range array index is *not* unknown (TPL-2 AC4): the list is
 *   just shorter than the template accounts for, which is ordinary data
 *   shape, not a typo.
 * - Once any segment resolves to null/undefined, deeper segments are moot --
 *   a parent that is itself "present but empty" makes the whole path empty,
 *   not unknown.
 */
function isUnknownPath(scopeList: readonly unknown[], rawPath: string): boolean {
    if (scopeList.length !== 1) { return false; }
    const topScope = scopeList[0];
    if (topScope === null || typeof topScope !== 'object') { return false; }

    const path = extractPrimaryPath(rawPath);
    // `.` (self-reference) and `$index` are docxtemplater/expressions.js's
    // own loop variables, never entries in the data contract.
    if (path === '' || path === '.' || path === 'this' || path === '$index') { return false; }

    const segments = path.match(/[^.[\]]+/g);
    if (segments === null || segments.length === 0) { return false; }

    const [rootSegment, ...restSegments] = segments;
    if (!Object.prototype.hasOwnProperty.call(topScope, rootSegment)) { return true; }

    let current: unknown = (topScope as Record<string, unknown>)[rootSegment];
    for (const segment of restSegments) {
        if (current === null || current === undefined) { return false; }

        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index)) { return true; }
            if (index < 0 || index >= current.length) { return false; }
            current = current[index];
            continue;
        }

        if (typeof current !== 'object') { return true; }
        if (!Object.prototype.hasOwnProperty.call(current, segment)) { return true; }
        current = (current as Record<string, unknown>)[segment];
    }
    return false;
}

/** Minimal shape of docxtemplater's ScopeManager needed for the strict-undefined check -- see DXT.ScopeManager in docxtemplater's own .d.ts. */
interface NullGetterScopeManager {
    scopeList?: readonly unknown[];
}

/** Shared docxtemplater construction — the one place render options live */
export function createDocxRenderer(
    zip: PizZip,
    templateData: Record<string, unknown>,
    unresolvedVariables?: string[]
): Docxtemplater {
    return new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter: (part: { value?: string }, sm?: NullGetterScopeManager): string => {
            const path = part?.value;
            if (path === undefined) { return ''; }

            const scopeList = sm?.scopeList ?? [templateData];
            if (isUnknownPath(scopeList, path)) {
                // D3: unknown (not in the data contract) is loud, not blank --
                // a typo'd or deleted-question variable must not silently
                // disappear from a generated legal document.
                throw createError.internal(
                    `${TEMPLATE_SYNTAX_ERROR_PREFIX}undefined variable "${path}" is not present in the submitted data`
                );
            }

            if (unresolvedVariables && !unresolvedVariables.includes(path)) {
                unresolvedVariables.push(path);
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

        // Merge data with helpers for template use (top-level access)
        const templateData = {
            ...data,
            ...docxHelpers,
        };

        // Construction (tag compilation) and render() share one try/catch so
        // a bad-grammar tag -- which fails at construction, not render, see
        // probed evidence in this ticket's turn-in notes -- gets the same
        // detailed formatting (tag name via `explanation`) as a runtime
        // render error, instead of the generic fallback below.
        let doc: Docxtemplater;
        try {
            doc = createDocxRenderer(zip, templateData, unresolvedVariables);
            doc.render(templateData);
        } catch (error: unknown) {
            handleRenderError(error as RenderError);
        }

        return (doc.getZip() as PizZip).generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });
    } catch (error: unknown) {
        if (error instanceof ApiError) { throw error; } // Already a structured, user-facing error (e.g. D3's strict-undefined) -- pass through unchanged.

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

function handleRenderError(error: RenderError): never {
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

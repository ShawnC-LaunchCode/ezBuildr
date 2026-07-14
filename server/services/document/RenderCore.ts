/**
 * Render Core — the single docxtemplater configuration and expression parser
 * every DOCX render path goes through.
 *
 * History: three drifted copies of this logic existed (TemplateParser,
 * docxRenderer2, legacy docxRenderer) with divergent bugs. Both live entry
 * points now delegate here; do not add another copy.
 */

import fs from 'fs/promises';

// eslint-disable-next-line @typescript-eslint/naming-convention
import Docxtemplater from 'docxtemplater';
// eslint-disable-next-line @typescript-eslint/naming-convention
import PizZip from 'pizzip';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';
import { docxHelpers, formatArrayForDisplay, resolveHelperArg, tokenizeTag } from '../docxHelpers';

const TEMPLATE_SYNTAX_ERROR_PREFIX = 'Template syntax error: ';
const ERROR_SEPARATOR = ' | ';

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

/**
 * The expression parser: plain variables and dot paths, helper calls with
 * literal or variable arguments ({{formatDate dob "MMMM DD, YYYY"}},
 * {{multiply price quantity}}), arrays joined for scalar display but passed
 * raw to loops.
 */
export function createExpressionParser(tag: string): {
    get(scope: Record<string, unknown>, context: unknown): unknown;
} {
    return {
        get(scope: Record<string, unknown>, context: unknown): unknown {
            if (tag === '.') {
                return scope;
            }

            const parts = tokenizeTag(tag);

            if (parts.length > 1 && parts[0] in docxHelpers) {
                const helperName = parts[0];
                const helper = docxHelpers[helperName as keyof typeof docxHelpers] as
                    | HelperFunction
                    | undefined;

                if (typeof helper === 'function') {
                    const value = getNestedValue(scope, parts[1]);
                    const args = parts.slice(2).map((arg) => resolveHelperArg(scope, arg));

                    try {
                        return helper(value, ...args);
                    } catch (error) {
                        logger.error({ error, helperName }, `Helper ${helperName} failed`);
                        return '';
                    }
                }
            }

            const value = getNestedValue(scope, tag);

            // Arrays used as a scalar {{tag}} render as joined text;
            // loop tags ({{#tag}}) receive the raw array for iteration
            if (Array.isArray(value) && !isLoopContext(context)) {
                return formatArrayForDisplay(value);
            }

            return value;
        },
    };
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
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const content = templateBuffer ?? (await fs.readFile(templatePath, 'binary'));
        const zip = new PizZip(content);
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

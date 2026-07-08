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

export interface TemplateParserOptions {
    templatePath: string;
    templateBuffer?: Buffer;
    data: Record<string, unknown>;
}

export class TemplateParser {
    /**
     * Custom expression parser for docxtemplater
     * Enables angular-like syntax with helper functions
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private createExpressionParser(tag: string) {
        const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
            if (!path) { return obj; }
            const keys = path.split('.');
            let current: unknown = obj;
            for (const key of keys) {
                if (current === null || current === undefined) { return undefined; }
                current = (current as Record<string, unknown>)[key];
            }
            return current;
        };

        return {
            get: (scope: Record<string, unknown>, context: Record<string, unknown>): unknown => {
                // Parse tag which may include filters/helpers
                // Example: "upper name" -> call upper(scope.name)

                if (tag === '.') {
                    return scope;
                }

                const parts = tokenizeTag(tag);

                // If first part is a helper function, call it
                if (parts.length > 1 && parts[0] in docxHelpers) {
                    const helperName = parts[0] as keyof typeof docxHelpers;
                    const helper = docxHelpers[helperName] as HelperFunction | undefined;

                    if (typeof helper === 'function') {
                        // Get the value from scope
                        const valuePath = parts[1];
                        const value = getNestedValue(scope, valuePath);

                        // Additional arguments: literals (quoted/number/boolean)
                        // or variable paths resolved from scope
                        const args = parts.slice(2).map((arg) => resolveHelperArg(scope, arg));

                        try {
                            return helper(value, ...args);
                        } catch (error) {
                            logger.error({ error, helperName }, `Helper ${helperName} failed`);
                            return '';
                        }
                    }
                }

                // Otherwise, just get the value
                const value = getNestedValue(scope, tag);

                // Arrays used as a scalar {{tag}} render as joined text;
                // loop tags ({{#tag}}) receive the raw array for iteration
                if (Array.isArray(value) && !isLoopContext(context)) {
                    return formatArrayForDisplay(value);
                }

                return value;
            }
        };
    }

    /**
     * Render a DOCX template with data
     */
    async render({ templatePath, templateBuffer, data }: TemplateParserOptions): Promise<Buffer> {
        try {
            // Read template file (or use provided buffer)
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const content = templateBuffer ?? (await fs.readFile(templatePath, 'binary'));
            const zip = new PizZip(content);

            // Merge data with helpers for template use (top-level access)
            const templateData = {
                ...data,
                ...docxHelpers,
            };

            // Create docxtemplater instance
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' },
                nullGetter: (): string => '',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                parser: ((tag: string) => this.createExpressionParser(tag)) as any,
            });

            try {
                doc.render(templateData);
            } catch (error: unknown) {
                this.handleRenderError(error as RenderError);
            }

            // Generate output buffer
            return doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

        } catch (error: unknown) {
            const renderErr = error as RenderError;
            // Log the raw error for debugging
            logger.error({ error: renderErr, props: renderErr.properties }, 'Template rendering raw error');

            if (renderErr.code !== undefined && renderErr.status !== undefined) { throw renderErr; } // Re-throw known errors

            // If it's a MultiError from docxtemplater that wasn't caught by handleRenderError
            if (renderErr.properties?.errors !== undefined) {
                const errorDetails = renderErr.properties.errors
                    .map((err: DocxtemplaterError) => `${err.name ?? 'Error'}: ${err.message ?? 'Unknown'}`)
                    .join(ERROR_SEPARATOR);
                throw createError.internal(`${TEMPLATE_SYNTAX_ERROR_PREFIX}${errorDetails}`);
            }

            throw createError.internal(`Template rendering failed: ${renderErr.message ?? 'Unknown error'}`);
        }
    }

    private handleRenderError(error: RenderError): void {
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
}

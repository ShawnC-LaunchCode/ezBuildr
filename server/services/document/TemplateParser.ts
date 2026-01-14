import fs from 'fs/promises';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { logger } from '../../logger';
import { createError } from '../../utils/errors';
import { docxHelpers } from '../docxHelpers';

export interface TemplateParserOptions {
    templatePath: string;
    data: Record<string, any>;
}

export class TemplateParser {
    /**
     * Custom expression parser for docxtemplater
     * Enables angular-like syntax with helper functions
     */
    private createExpressionParser(tag: string) {
        const getNestedValue = (obj: any, path: string): any => {
            if (!path) {return obj;}
            const keys = path.split('.');
            let current = obj;
            for (const key of keys) {
                if (current == null) {return undefined;}
                current = current[key];
            }
            return current;
        };

        return {
            get: (scope: any, context: any) => {
                // Parse tag which may include filters/helpers
                // Example: "upper name" -> call upper(scope.name)

                if (tag === '.') {
                    return scope;
                }

                const parts = tag.trim().split(/\s+/);

                // If first part is a helper function, call it
                if (parts.length > 1 && parts[0] in docxHelpers) {
                    const helperName = parts[0];
                    const helper = (docxHelpers as any)[helperName];

                    if (typeof helper === 'function') {
                        // Get the value from scope
                        const valuePath = parts[1];
                        const value = getNestedValue(scope, valuePath);

                        // Additional arguments
                        const args = parts.slice(2);

                        try {
                            return helper(value, ...args);
                        } catch (error) {
                            logger.error({ error, helperName }, `Helper ${helperName} failed`);
                            return '';
                        }
                    }
                }

                // Otherwise, just get the value
                return getNestedValue(scope, tag);
            }
        };
    }

    /**
     * Render a DOCX template with data
     */
    async render({ templatePath, data }: TemplateParserOptions): Promise<Buffer> {
        try {
            // Read template file
            const content = await fs.readFile(templatePath, 'binary');
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
                nullGetter: () => '',
                parser: ((tag: string) => this.createExpressionParser(tag)) as any,
            });

            // Set data and render
            // Set data and render
            doc.setData(templateData);

            try {
                doc.render();
            } catch (error: any) {
                this.handleRenderError(error);
            }

            // Generate output buffer
            return doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

        } catch (error: any) {
            // Log the raw error for debugging
            logger.error({ error, props: error.properties }, 'Template rendering raw error');

            if (error.code && error.status) {throw error;} // Re-throw known errors

            // If it's a MultiError from docxtemplater that wasn't caught by handleRenderError
            if (error.properties?.errors) {
                const errorDetails = error.properties.errors
                    .map((err: any) => `${err.name}: ${err.message}`)
                    .join(' | ');
                throw createError.internal(`Template syntax error: ${errorDetails}`);
            }

            throw createError.internal(`Template rendering failed: ${error.message}`);
        }
    }

    private handleRenderError(error: any) {
        logger.error({ error, errors: error.properties?.errors }, 'Docxtemplater render error');

        if (error.properties?.errors) {
            const errorDetails = error.properties.errors
                .map((err: any) => {
                    const parts = [err.name];
                    if (err.message) {parts.push(err.message);}
                    if (err.properties?.id) {parts.push(`at ${err.properties.id}`);}
                    if (err.properties?.explanation) {parts.push(`(${err.properties.explanation})`);}
                    return parts.join(': ');
                })
                .join(' | ');

            throw createError.internal(`Template syntax error: ${errorDetails}`, {
                errors: error.properties.errors,
            });
        }
        throw error;
    }
}

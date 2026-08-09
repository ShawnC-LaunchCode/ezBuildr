import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentEngine } from '../../../server/services/document/DocumentEngine.js';

vi.mock('../../../server/services/document/TemplateParser.js', () => ({
    TemplateParser: class {
        render = vi.fn().mockResolvedValue(Buffer.from('rendered document'));
    },
}));

vi.mock('../../../server/services/document/PdfConverter.js', () => ({
    PDF_CONVERSION_UNAVAILABLE_NOTICE: { code: 'unavailable', message: 'Unavailable' },
    PdfConversionError: class extends Error {},
    PdfConverter: class {},
}));

describe('DocumentEngine output names', () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(temporaryDirectories.splice(0).map(async (directory) =>
            fs.rm(directory, { recursive: true, force: true })
        ));
    });

    it('keeps author-supplied output titles inside the output directory', async () => {
        const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-engine-output-'));
        temporaryDirectories.push(outputDir);

        const result = await new DocumentEngine().generate({
            templatePath: 'unused.docx',
            data: {},
            outputName: '../../outside/client agreement',
            outputDir,
        });

        expect(path.dirname(result.docxPath)).toBe(outputDir);
        expect(path.basename(result.docxPath)).toMatch(
            /^\.\._\.\._outside_client_agreement-[0-9a-f-]+\.docx$/
        );
        await expect(fs.readFile(result.docxPath, 'utf8')).resolves.toBe('rendered document');
    });
});

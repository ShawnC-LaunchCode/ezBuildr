/**
 * EnhancedDocumentEngine — DOC-104 unresolved-variable reporting.
 *
 * These run the REAL DocumentEngine and RenderCore against an in-memory DOCX,
 * because the defect this guards lived precisely in the seam between them:
 * `run_generated_documents.unresolved_variables` was structurally always `[]`,
 * since normalization collapsed an unanswered variable's `null` to `''` and
 * `nullGetter` — the only thing that records — never fires for `''`.
 *
 * The pre-existing unit coverage could not catch that: it mocks the engine and
 * hardcodes `unresolvedVariables: ["missingField"]` inside the mock, proving
 * only that the array is forwarded. So do not add mocks for DocumentEngine
 * here; the render is the point.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// GH-156: importing the engine pulls in DatavaultRowsService. Mocked so this
// stays a unit-fast test (no real DB); no test below resolves a datavault
// binding.
vi.mock('../../../server/services/DatavaultRowsService.js', () => ({
    datavaultRowsService: { getRow: vi.fn() },
}));

import { EnhancedDocumentEngine } from '../../../server/services/document/EnhancedDocumentEngine';

import type { DocumentGenerationError } from '../../../server/errors/DocumentGenerationError';

function createDocxBuffer(bodyText: string): Buffer {
    const zip = new PizZip();

    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );
    zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${bodyText}</w:t></w:r></w:p></w:body></w:document>`
    );

    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function readDocxText(docxPath: string): Promise<string> {
    const buffer = await fs.readFile(docxPath);
    const xml = new PizZip(buffer).file('word/document.xml')?.asText() ?? '';
    return xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

describe('EnhancedDocumentEngine — DOC-104 unresolved variables', () => {
    const engine = new EnhancedDocumentEngine();
    let outputDir: string;

    beforeAll(async () => {
        outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc104-'));
    });

    afterAll(async () => {
        await fs.rm(outputDir, { recursive: true, force: true });
    });

    /** Render `body` against `rawData`, returning both the report and the text. */
    async function render(
        body: string,
        rawData: Record<string, unknown>,
        mapping?: Parameters<typeof engine.generateWithMapping>[0]['mapping']
    ): Promise<{ unresolved: string[]; text: string }> {
        const result = await engine.generateWithMapping({
            templatePath: path.join(outputDir, 'template.docx'),
            templateBuffer: createDocxBuffer(body),
            outputName: 'out',
            outputDir,
            rawData,
            mapping,
        });

        return {
            unresolved: result.unresolvedVariables ?? [],
            text: await readDocxText(result.docxPath),
        };
    }

    it('reports an aliased-but-unanswered variable and still renders it blank', async () => {
        // `RunDataService.buildForRun` seeds every alias, so an unanswered
        // question arrives as null rather than absent.
        const { unresolved, text } = await render(
            'Hello {{clientName}}, matter {{matterNumber}}?',
            { clientName: 'Acme Corporation', matterNumber: null }
        );

        expect(unresolved).toContain('matterNumber');
        expect(unresolved).not.toContain('clientName');
        expect(text).toBe('Hello Acme Corporation, matter ?');
    });

    it('does not report a variable answered with an empty string', async () => {
        // The whole reason normalization must not collapse null to '': an
        // answered-then-cleared field is a resolved value, not a missing one.
        const { unresolved, text } = await render(
            'Notes: {{notes}}.',
            { notes: '' }
        );

        expect(unresolved).toEqual([]);
        expect(text).toBe('Notes: .');
    });

    it('reports an unanswered variable that passes through a filter', async () => {
        // A filtered tag is a second reason `nullGetter` could never report:
        // the filter itself turns the missing value into output, so nothing is
        // ever null by the time docxtemplater would ask. Keying the report off
        // the variable rather than the resolved value covers these too, and the
        // rendered text is byte-for-byte what it was before.
        const { unresolved, text } = await render('Fee: {{ fee | number }}.', { fee: null });

        expect(unresolved).toContain('fee');
        expect(text).toBe('Fee: .');
    });

    it('reports a variable the template never references as neither resolved nor unresolved', async () => {
        const { unresolved } = await render(
            'Hello {{clientName}}.',
            { clientName: 'Acme Corporation', unusedAlias: null }
        );

        expect(unresolved).toEqual([]);
    });

    it('reports a mapped target whose source is unanswered, without failing the document', async () => {
        // Regression guard for the fix itself: `applyMapping` counts a null
        // source as missing and omits the target, and an omitted key is exactly
        // what RenderCore's strict-undefined check raises on — so a mapped
        // field left unanswered must not disappear from the data contract.
        const { unresolved, text } = await render(
            'Client: {{client_name}}.',
            { fullName: null },
            { client_name: { type: 'variable', source: 'fullName' } }
        );

        expect(unresolved).toContain('client_name');
        expect(text).toBe('Client: .');
    });

    it('still maps a source that has a value', async () => {
        const { unresolved, text } = await render(
            'Client: {{client_name}}.',
            { fullName: 'Ada Lovelace' },
            { client_name: { type: 'variable', source: 'fullName' } }
        );

        expect(unresolved).toEqual([]);
        expect(text).toBe('Client: Ada Lovelace.');
    });

    it('still raises for a tag that is not in the data contract at all', async () => {
        // TPL-3: unknown is loud, not blank. Reporting must not soften this —
        // a typo'd variable cannot silently vanish from a legal document.
        // The engine wraps it as a DocumentGenerationError, so the tag name is
        // on the original error rather than the outer message.
        const error = await render(
            'Hello {{clientName}}, where is the {{unknownTag}}?',
            { clientName: 'Acme' }
        ).then(
            () => undefined,
            (thrown: DocumentGenerationError) => thrown
        );

        expect(error).toBeDefined();
        expect(error?.phase).toBe('render');
        expect(error?.originalError?.message).toMatch(/undefined variable "unknownTag"/);
    });
});

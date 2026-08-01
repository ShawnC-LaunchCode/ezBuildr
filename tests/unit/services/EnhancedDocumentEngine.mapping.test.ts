/**
 * EnhancedDocumentEngine — mapping must MERGE, not replace.
 *
 * Regression: applying a partial mapping used to replace the whole variable
 * set with only the mapped targets, silently blanking every unmapped
 * {{variable}} in the template.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateMock } = vi.hoisted(() => ({
    generateMock: vi.fn().mockResolvedValue({ docxPath: '/tmp/out.docx' }),
}));

vi.mock('../../../server/services/document/DocumentEngine.js', () => ({
    DocumentEngine: class {
        generate = generateMock;
    },
}));

import { EnhancedDocumentEngine } from '../../../server/services/document/EnhancedDocumentEngine';

describe('EnhancedDocumentEngine.generateWithMapping', () => {
    let engine: EnhancedDocumentEngine;

    beforeEach(() => {
        generateMock.mockClear();
        engine = new EnhancedDocumentEngine();
    });

    it('keeps unmapped variables available alongside mapped targets', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
            mapping: { client_name: { type: 'variable', source: 'fullName' } },
        });

        expect(generateMock).toHaveBeenCalledTimes(1);
        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        // Mapped target present…
        expect(data.client_name).toBe('Ada Lovelace');
        // …and the unmapped variable still renders (used to become blank)
        expect(data.email).toBe('ada@example.com');
        // The mapped source also stays available for templates using both names
        expect(data.fullName).toBe('Ada Lovelace');
    });

    it('mapped names win on key collisions', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: { total: 10, computedTotal: 42 },
            mapping: { total: { type: 'variable', source: 'computedTotal' } },
        });

        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.total).toBe(42);
    });

    it('passes data through untouched when no mapping is provided', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: { a: 1 },
        });

        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.a).toBe(1);
    });
});

/**
 * EnhancedDocumentEngine — mapping must MERGE, not replace.
 *
 * Regression: applying a partial mapping used to replace the whole variable
 * set with only the mapped targets, silently blanking every unmapped
 * {{variable}} in the template.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateMock, getRowMock } = vi.hoisted(() => ({
    generateMock: vi.fn().mockResolvedValue({ docxPath: '/tmp/out.docx' }),
    getRowMock: vi.fn(),
}));

vi.mock('../../../server/services/document/DocumentEngine.js', () => ({
    DocumentEngine: class {
        generate = generateMock;
    },
}));

// GH-156: `datavault` mapping bindings resolve through DatavaultRowsService.
// Mocked here so this stays a unit-fast test (no real DB).
vi.mock('../../../server/services/DatavaultRowsService.js', () => ({
    datavaultRowsService: { getRow: getRowMock },
}));

import { EnhancedDocumentEngine } from '../../../server/services/document/EnhancedDocumentEngine';

describe('EnhancedDocumentEngine.generateWithMapping', () => {
    let engine: EnhancedDocumentEngine;

    beforeEach(() => {
        generateMock.mockClear();
        getRowMock.mockReset();
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

// GH-156: Document Mapping Workbench binding kinds beyond `variable`.
describe('EnhancedDocumentEngine.generateWithMapping — GH-156 binding kinds', () => {
    let engine: EnhancedDocumentEngine;

    beforeEach(() => {
        generateMock.mockClear();
        getRowMock.mockReset();
        engine = new EnhancedDocumentEngine();
    });

    it('resolves a constant binding to its fixed value', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: {},
            mapping: { firm_name: { type: 'constant', value: 'Acme Legal' } },
        });

        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.firm_name).toBe('Acme Legal');
    });

    it('resolves a formula binding by substituting {{alias}} tokens', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: { firstName: 'Ada', lastName: 'Lovelace' },
            mapping: { greeting: { type: 'formula', expression: 'Dear {{firstName}} {{lastName}},' } },
        });

        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.greeting).toBe('Dear Ada Lovelace,');
    });

    it('resolves a datavault binding via DatavaultRowsService when tenantId is provided', async () => {
        getRowMock.mockResolvedValue({
            row: { id: 'row-1' },
            values: { 'col-1': 'Acme LLP' },
        });

        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: {},
            mapping: { firm_name: { type: 'datavault', tableId: 'table-1', columnId: 'col-1', rowId: 'row-1' } },
            tenantId: 'tenant-1',
        });

        expect(getRowMock).toHaveBeenCalledWith('row-1', 'tenant-1');
        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.firm_name).toBe('Acme LLP');
    });

    it('leaves a datavault binding unresolved (no crash) when no tenantId is available', async () => {
        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: {},
            mapping: { firm_name: { type: 'datavault', tableId: 'table-1', columnId: 'col-1', rowId: 'row-1' } },
            // no tenantId
        });

        expect(getRowMock).not.toHaveBeenCalled();
        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.firm_name).toBeUndefined();
    });

    it('leaves a datavault binding unresolved when the row lookup fails (cross-tenant, missing row)', async () => {
        getRowMock.mockRejectedValue(new Error('Access denied'));

        await engine.generateWithMapping({
            templatePath: '/tmp/template.docx',
            outputName: 'out',
            rawData: {},
            mapping: { firm_name: { type: 'datavault', tableId: 'table-1', columnId: 'col-1', rowId: 'row-1' } },
            tenantId: 'tenant-1',
        });

        const { data } = generateMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(data.firm_name).toBeUndefined();
    });
});

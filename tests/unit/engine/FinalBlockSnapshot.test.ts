
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FinalBlockConfig } from '@shared/types/stepConfigs';

import { db } from '../../../server/db';
import { executeFinalNode, FinalBlockInput } from '../../../server/engine/nodes/final';
import { finalBlockRenderer } from '../../../server/services/document/FinalBlockRenderer';

// Mock dependencies
vi.mock('../../../server/services/document/FinalBlockRenderer', () => ({
    finalBlockRenderer: {
        render: vi.fn()
    },
    createTemplateResolver: vi.fn((cb) => cb)
}));

vi.mock('../../../server/db', () => ({
    db: {
        query: {
            templates: {
                findFirst: vi.fn()
            }
        }
    }
}));

describe('FinalBlock Executor', () => {
    let context: any;
    let config: FinalBlockConfig;

    beforeEach(() => {
        context = {
            vars: {
                user: 'Barney',
                age: 30,
                zip: '12345'
            },
            workflowId: 'wf-123',
            executionMode: 'live' // Default to live
        };

        config = {
            markdownHeader: 'Hello {{user}}',
            documents: [
                {
                    id: 'doc-entry-1',
                    documentId: 'doc-1',
                    alias: 'Contract',
                    mapping: {
                        'Name': { type: 'variable', source: 'user' },
                        'Age': { type: 'variable', source: 'age' }
                    }
                }
            ]
        };

        vi.clearAllMocks();
    });

    it('should interpolate markdown content', async () => {
        (finalBlockRenderer.render as any).mockResolvedValue({
            documents: [],
            failed: [],
            skipped: [],
            isArchived: false
        });

        const input: FinalBlockInput = {
            nodeId: 'final-1',
            config,
            context,
            tenantId: 'tenant-1',
            runId: 'run-1'
        };

        const result = await executeFinalNode(input);

        expect(result.status).toBe('executed');
        expect(result.markdownContent).toBe('Hello Barney');
    });

    it('should call renderer with correct request', async () => {
        (finalBlockRenderer.render as any).mockResolvedValue({
            documents: [{ filename: 'Contract.docx' }],
            failed: [],
            skipped: [],
            isArchived: false
        });

        // Mock template DB lookup
        (db.query.templates.findFirst as any).mockResolvedValue({
            id: 'doc-1',
            fileRef: 'file-123.docx',
            project: { tenantId: 'tenant-1' }
        });

        const input: FinalBlockInput = {
            nodeId: 'final-1',
            config,
            context,
            tenantId: 'tenant-1'
        };

        const result = await executeFinalNode(input);

        expect(finalBlockRenderer.render).toHaveBeenCalledWith(expect.objectContaining({
            stepValues: context.vars,
            finalBlockConfig: config,
            workflowId: 'wf-123'
        }));

        expect(result.generatedDocuments).toHaveLength(1);
        expect(result.generatedDocuments![0].filename).toBe('Contract.docx');
    });

    it('should handle preview execution (snapshot mode)', async () => {
        context.executionMode = 'snapshot';

        (finalBlockRenderer.render as any).mockResolvedValue({
            documents: [{ filename: 'Preview.docx' }],
            failed: [],
            skipped: [],
            isArchived: false
        });

        const input: FinalBlockInput = {
            nodeId: 'final-1',
            config,
            context,
            tenantId: 'tenant-1'
        };

        const result = await executeFinalNode(input);

        expect(result.status).toBe('executed');
    });
});

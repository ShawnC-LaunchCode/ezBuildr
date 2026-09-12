// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ListToolsBlockEditor } from '../../../client/src/components/blocks/ListToolsBlockEditor';
import { selectListSourceVariables } from '../../../client/src/components/blocks/list-tools/listSourceVariables';
import type { ApiStep } from '../../../client/src/lib/vault-api';

const listByPage = vi.fn<(pageId: string) => Promise<ApiStep[]>>();
const listByWorkflow = vi.fn<(workflowId: string) => Promise<ApiStep[]>>();

vi.mock('../../../client/src/lib/vault-api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../client/src/lib/vault-api')>();
    return {
        ...actual,
        stepAPI: {
            ...actual.stepAPI,
            list: (pageId: string) => listByPage(pageId),
            listByWorkflow: (workflowId: string) => listByWorkflow(workflowId),
        },
    };
});

function step(overrides: Partial<ApiStep>): ApiStep {
    return {
        id: 'step-1',
        workflowId: 'workflow-1',
        pageId: 'page-1',
        type: 'computed',
        title: 'Read Table: Clients',
        description: null,
        required: false,
        alias: 'clients',
        order: 0,
        config: null,
        createdAt: '2026-09-10T00:00:00.000Z',
        ...overrides,
    } as ApiStep;
}

describe('selectListSourceVariables', () => {
    it('offers computed steps — including the virtual output steps blocks create', () => {
        const result = selectListSourceVariables([
            step({ id: 's1', alias: 'clients', isVirtual: true }),
            step({ id: 's2', alias: 'matched', title: 'Query: Matched', isVirtual: true }),
            step({ id: 's3', alias: 'score', title: 'Score', isVirtual: false }),
        ]);

        expect(result.map((s) => s.alias)).toEqual(['clients', 'matched', 'score']);
    });

    it('excludes non-list step types and aliasless steps', () => {
        const result = selectListSourceVariables([
            step({ id: 's1', type: 'text', alias: 'first_name', title: 'First name' }),
            step({ id: 's2', type: 'list', alias: 'children', title: 'Children' }),
            step({ id: 's3', alias: null, title: 'Read Table: unaliased' }),
            step({ id: 's4', alias: '', title: 'Read Table: blank alias' }),
            step({ id: 's5', alias: 'clients' }),
        ]);

        expect(result.map((s) => s.alias)).toEqual(['clients']);
    });

    it("excludes the block's own output so it cannot read from itself", () => {
        const result = selectListSourceVariables(
            [
                step({ id: 's1', alias: 'clients' }),
                step({ id: 's2', alias: 'filtered_clients', title: 'List Tools: Filter' }),
            ],
            'filtered_clients'
        );

        expect(result.map((s) => s.alias)).toEqual(['clients']);
    });

    it('tolerates a missing steps query', () => {
        expect(selectListSourceVariables(undefined)).toEqual([]);
    });
});

describe('ListToolsBlockEditor source picker (LIST-B1)', () => {
    beforeEach(() => {
        listByPage.mockReset();
        listByWorkflow.mockReset();
        listByPage.mockResolvedValue([]);
        listByWorkflow.mockResolvedValue([step({ isVirtual: true })]);
    });

    function renderEditor() {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        return render(
            <QueryClientProvider client={queryClient}>
                <ListToolsBlockEditor
                    workflowId="workflow-1"
                    config={{}}
                    onChange={vi.fn()}
                    mode="advanced"
                />
            </QueryClientProvider>
        );
    }

    it('fetches the workflow\'s steps, not a page\'s, so sources can be offered', async () => {
        renderEditor();

        // The regression: the editor passed its workflowId to `useSteps`, which
        // takes a pageId, so it queried /api/pages/<workflowId>/steps and the
        // Source List Variable dropdown was permanently empty. Both parameters
        // are `string`, so tsc cannot catch the swap — only this can.
        await vi.waitFor(() => {
            expect(listByWorkflow).toHaveBeenCalledWith('workflow-1');
        });
        expect(listByPage).not.toHaveBeenCalled();
    });

    it('renders the source section with the config still incomplete', async () => {
        renderEditor();

        await vi.waitFor(() => {
            expect(listByWorkflow).toHaveBeenCalled();
        });
        expect(screen.getByText('Source & Output')).toBeInTheDocument();
        expect(screen.getByText('Required Fields')).toBeInTheDocument();
    });
});

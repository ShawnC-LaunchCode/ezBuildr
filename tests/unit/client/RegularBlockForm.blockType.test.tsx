// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RegularBlockForm } from '../../../client/src/components/builder/forms/RegularBlockForm';
import { blockTypeLabel } from '../../../client/src/components/builder/forms/blockTypeLabel';
import type { BlockFormData } from '../../../client/src/components/builder/BlockEditorDialog.hooks';
import type { Mode } from '../../../client/src/lib/mode';

vi.mock('../../../client/src/lib/vault-api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../client/src/lib/vault-api')>();
    return {
        ...actual,
        stepAPI: { ...actual.stepAPI, list: async () => [], listByWorkflow: async () => [] },
    };
});

describe('blockTypeLabel', () => {
    it('names every block type the dialog can display', () => {
        expect(blockTypeLabel('list_tools')).toBe('List Tools');
        expect(blockTypeLabel('query')).toBe('Read Data (Legacy)');
        expect(blockTypeLabel('prefill')).toBe('Prefill (Deprecated)');
        expect(blockTypeLabel('js')).toBe('Script');
        expect(blockTypeLabel('transform')).toBe('Transform');
    });

    it('falls back to the raw type rather than an empty string', () => {
        // LIST-B2: a blank Block Type field reads as a broken dialog. Whatever
        // this returns, it must never be empty.
        expect(blockTypeLabel('some_future_type')).toBe('some_future_type');
        expect(blockTypeLabel('')).toBe('');
    });
});

describe('RegularBlockForm Block Type field (LIST-B2)', () => {
    function renderForm(type: string, mode: Mode) {
        const formData: BlockFormData = {
            phase: 'onRunStart',
            enabled: true,
            order: 0,
            type,
            config: {},
        };
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(
            <QueryClientProvider client={queryClient}>
                <RegularBlockForm
                    formData={formData}
                    setFormData={vi.fn()}
                    mode={mode}
                    workflowId="workflow-1"
                />
            </QueryClientProvider>
        );
    }

    it('names a list_tools block in easy mode', () => {
        // The regression: the field was a Select whose options came from
        // EASY_BLOCK_TYPES, which omitted list_tools — so it rendered blank
        // with a value set.
        renderForm('list_tools', 'easy');

        expect(screen.getByTestId('block-type-value')).toHaveTextContent('List Tools');
    });

    it('names a list_tools block in advanced mode too', () => {
        renderForm('list_tools', 'advanced');

        expect(screen.getByTestId('block-type-value')).toHaveTextContent('List Tools');
    });

    it('names a legacy js block, which no mode ever listed', () => {
        renderForm('js', 'easy');

        expect(screen.getByTestId('block-type-value')).toHaveTextContent('Script');
    });

    it('never renders the field empty, whatever the type', () => {
        for (const type of ['list_tools', 'query', 'js', 'transform', 'prefill', 'unknown_type']) {
            const { unmount } = renderForm(type, 'easy');
            expect(screen.getByTestId('block-type-value').textContent?.trim()).not.toBe('');
            unmount();
        }
    });

    it('omits the field entirely for data blocks that carry their own editor', () => {
        renderForm('external_send', 'easy');

        expect(screen.queryByTestId('block-type-value')).not.toBeInTheDocument();
    });
});

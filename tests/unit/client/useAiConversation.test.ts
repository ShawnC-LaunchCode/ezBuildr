// @vitest-environment jsdom
/**
 * ICW2-10 — the builder AI panel is propose-then-apply. These tests pin the
 * client half of the contract: advanced mode only dry-runs on send, Apply
 * replays the reviewed ops, and Discard issues no request at all (the old
 * handleDiscard was a lie because the server had already committed).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { proposeMutate, applyMutate, modeRef, toastSpy } = vi.hoisted(() => ({
    proposeMutate: vi.fn(),
    applyMutate: vi.fn(),
    modeRef: { mode: 'advanced' },
    toastSpy: vi.fn(),
}));

vi.mock('@/hooks/api/useAi', () => ({
    useProposeAiEdit: () => ({ mutateAsync: proposeMutate, isPending: false }),
    useApplyAiEdit: () => ({ mutateAsync: applyMutate, isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/lib/vault-hooks', () => ({
    useWorkflowMode: () => ({ data: { mode: modeRef.mode } }),
}));
vi.mock('@/components/builder/ai/useFileUpload', () => ({
    useFileUpload: () => ({
        isDragging: false,
        uploading: false,
        contextFiles: [],
        setContextFiles: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragLeave: vi.fn(),
        handleDrop: vi.fn(),
    }),
}));

import { useAiConversation } from '../../../client/src/components/builder/ai/useAiConversation';

const PROPOSAL = {
    ops: [{ op: 'section.create' as const, title: 'Contact', order: 1 }],
    changes: [{ type: 'add' as const, entity: 'section' as const, explanation: 'Add section "Contact"' }],
    summary: ['Added a contact section'],
    confidence: 0.9,
    warnings: [],
    questions: [],
};

describe('useAiConversation', () => {
    beforeEach(() => {
        proposeMutate.mockReset().mockResolvedValue(PROPOSAL);
        applyMutate.mockReset().mockResolvedValue({
            workflowId: 'wf-1',
            versionId: 'v-1',
            noChanges: false,
            summary: ['Added a contact section'],
            warnings: [],
        });
        toastSpy.mockReset();
        modeRef.mode = 'advanced';
    });

    it('advanced mode only proposes on send — nothing is applied', async () => {
        const { result } = renderHook(() => useAiConversation('wf-1'));

        await act(async () => { await result.current.handleSend('Add a contact section'); });

        expect(proposeMutate).toHaveBeenCalledWith({ workflowId: 'wf-1', userMessage: 'Add a contact section' });
        expect(applyMutate).not.toHaveBeenCalled();

        await waitFor(() => { expect(result.current.proposal).not.toBeNull(); });
        const last = result.current.messages[result.current.messages.length - 1];
        expect(last.status).toBe('pending');
        expect(last.changes).toEqual(PROPOSAL.changes);
    });

    it('Apply replays the reviewed ops through the apply endpoint', async () => {
        const { result } = renderHook(() => useAiConversation('wf-1'));
        await act(async () => { await result.current.handleSend('Add a contact section'); });

        await act(async () => { await result.current.handleApply(); });

        expect(applyMutate).toHaveBeenCalledWith({
            workflowId: 'wf-1',
            userMessage: 'Add a contact section',
            ops: PROPOSAL.ops,
        });
        expect(result.current.proposal).toBeNull();
        expect(result.current.messages[result.current.messages.length - 1].status).toBe('applied');
    });

    it('Discard issues no request and clears the proposal (AC4)', async () => {
        const { result } = renderHook(() => useAiConversation('wf-1'));
        await act(async () => { await result.current.handleSend('Add a contact section'); });

        proposeMutate.mockClear();
        act(() => { result.current.handleDiscard(); });

        expect(applyMutate).not.toHaveBeenCalled();
        expect(proposeMutate).not.toHaveBeenCalled();
        expect(result.current.proposal).toBeNull();
        expect(result.current.messages[result.current.messages.length - 1].status).toBe('discarded');
    });

    it('easy mode auto-applies in a single call and never proposes', async () => {
        modeRef.mode = 'easy';
        const { result } = renderHook(() => useAiConversation('wf-1'));

        await act(async () => { await result.current.handleSend('Add a contact section'); });

        expect(proposeMutate).not.toHaveBeenCalled();
        expect(applyMutate).toHaveBeenCalledWith({ workflowId: 'wf-1', userMessage: 'Add a contact section' });
        expect(result.current.proposal).toBeNull();
        expect(result.current.messages[result.current.messages.length - 1].status).toBe('applied');
    });

    it('surfaces a proposal failure as an assistant message without a pending proposal', async () => {
        proposeMutate.mockRejectedValueOnce(new Error('AI service is busy.'));
        const { result } = renderHook(() => useAiConversation('wf-1'));

        await act(async () => { await result.current.handleSend('Add a contact section'); });

        expect(result.current.proposal).toBeNull();
        expect(result.current.messages[result.current.messages.length - 1].content)
            .toContain('AI service is busy.');
    });

    it('reports an empty op set instead of offering an empty Apply', async () => {
        proposeMutate.mockResolvedValueOnce({ ...PROPOSAL, ops: [], changes: [], summary: [] });
        const { result } = renderHook(() => useAiConversation('wf-1'));

        await act(async () => { await result.current.handleSend('Nothing to do'); });

        expect(result.current.proposal).toBeNull();
        expect(result.current.messages[result.current.messages.length - 1].status).toBeUndefined();
    });
});

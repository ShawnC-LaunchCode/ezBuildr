
import { useState, useRef, useEffect } from 'react';

import { useProposeAiEdit, useApplyAiEdit } from "@/hooks/api/useAi";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowMode } from "@/lib/vault-hooks";

import type { AiEditProposal } from "@shared/validation/aiWorkflowEdit.schema";

import { Message, UploadedFile } from "./types";
import { useFileUpload } from "./useFileUpload";

interface UseAiConversationReturn {
    input: string;
    setInput: (val: string) => void;
    messages: Message[];
    proposal: AiEditProposal | null;
    isDragging: boolean;
    uploading: boolean;
    contextFiles: UploadedFile[];
    setContextFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    scrollRef: React.RefObject<HTMLDivElement>;
    isBusy: boolean;
    mode: string;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => Promise<void>;
    handleSend: (textOverride?: string) => Promise<void>;
    handleApply: () => Promise<void>;
    handleDiscard: () => void;
}

/**
 * Drives the builder AI panel against the hardened ops pipeline (ICW2-10).
 *
 * Advanced mode is propose-then-apply: sending only dry-runs, so the database
 * is untouched while the user reviews and Discard is a genuine no-op. Easy mode
 * auto-applies in a single call.
 */
export function useAiConversation(
    workflowId: string,
    initialPrompt?: string
): UseAiConversationReturn {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Hi! I can help you revise this workflow. Try saying "Add a phone number question" or "Make the email required".\n\nYou can also drop PDF or DOCX files here to give me more context!',
            timestamp: Date.now()
        }
    ]);
    const [proposal, setProposal] = useState<AiEditProposal | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const proposeMutation = useProposeAiEdit();
    const applyMutation = useApplyAiEdit();
    const { data: workflowMode } = useWorkflowMode(workflowId);
    const mode = workflowMode?.mode ?? 'easy';

    // The instruction that produced the pending proposal, replayed on Apply so
    // the resulting draft version keeps a meaningful changelog entry.
    const proposalMessageRef = useRef<string>('');

    const {
        isDragging,
        uploading,
        contextFiles,
        setContextFiles,
        handleDragOver,
        handleDragLeave,
        handleDrop
    } = useFileUpload();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Handle initial prompt from "Create with AI" flow
    const hasSentInitialPrompt = useRef(false);
    useEffect(() => {
        if (initialPrompt && !hasSentInitialPrompt.current && messages.length === 1) { // 1 because of greeting
            hasSentInitialPrompt.current = true;
            setInput(initialPrompt);
            // We need to wait a tick for the state to update, then send
            setTimeout(() => {
                void handleSend(initialPrompt);
            }, 100);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPrompt, messages.length]);

    const buildFullMessage = (text: string, files: UploadedFile[]): string => {
        let fullMessage = text;
        if (files.length > 0) {
            fullMessage += `\n\n--- CONTEXT FROM UPLOADED FILES ---\n`;
            files.forEach(f => {
                fullMessage += `DATA FROM FILE: ${f.name}\n${f.content}\n\n`;
            });
            fullMessage += `--- END CONTEXT ---\n`;
        }
        return fullMessage;
    };

    const appendAssistant = (message: Omit<Message, 'role' | 'timestamp'>): void => {
        setMessages(prev => [...prev, { role: 'assistant', timestamp: Date.now(), ...message }]);
    };

    /** Mark the trailing pending-proposal message as resolved. */
    const settleLastPending = (status: 'applied' | 'discarded', fallbackContent: string): void => {
        setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.role === 'assistant' && lastMsg.status === 'pending') {
                newMessages[newMessages.length - 1] = { ...lastMsg, status };
            } else {
                newMessages.push({ role: 'assistant', content: fallbackContent, timestamp: Date.now(), status });
            }
            return newMessages;
        });
    };

    const summaryText = (summary: string[], fallback: string): string =>
        summary.length > 0 ? summary.join(' ') : fallback;

    const sendEasyMode = async (fullMessage: string): Promise<void> => {
        const result = await applyMutation.mutateAsync({ workflowId, userMessage: fullMessage });
        appendAssistant({
            content: result.noChanges
                ? 'I did not find anything to change.'
                : summaryText(result.summary, 'I have updated the workflow.'),
            status: result.noChanges ? undefined : 'applied',
        });
        if (!result.noChanges) {
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
        }
    };

    const sendReviewMode = async (fullMessage: string): Promise<void> => {
        const result = await proposeMutation.mutateAsync({ workflowId, userMessage: fullMessage });

        if (result.ops.length === 0) {
            appendAssistant({ content: summaryText(result.summary, 'I did not find anything to change.') });
            return;
        }

        proposalMessageRef.current = fullMessage;
        appendAssistant({
            content: summaryText(result.summary, 'Here are the suggested changes.'),
            changes: result.changes,
            status: 'pending',
        });
        setProposal(result);
    };

    const handleSend = async (textOverride?: string): Promise<void> => {
        const textToSend = textOverride ?? input;

        const isInputEmpty = textToSend.trim() === '';
        const hasNoFiles = contextFiles.length === 0;

        if (isInputEmpty && hasNoFiles) { return; }

        const fullMessage = buildFullMessage(textToSend, contextFiles);

        // Display message (hide massive context from UI, show attachment badges instead)
        const displayContent = !isInputEmpty ? textToSend : "Processed uploaded files.";

        const userMsg: Message = {
            role: 'user',
            content: displayContent,
            timestamp: Date.now()
        };

        // Add a "visible" note about attachments if they exist
        if (contextFiles.length > 0) {
            userMsg.content += `\n\n[Attached: ${contextFiles.map(f => f.name).join(', ')}]`;
        }

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setContextFiles([]); // Clear context after sending
        setProposal(null);

        try {
            if (mode === 'easy') {
                await sendEasyMode(fullMessage);
            } else {
                await sendReviewMode(fullMessage);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            appendAssistant({ content: `Sorry, I encountered an error: ${errorMessage}` });
        }
    };

    const handleApply = async (): Promise<void> => {
        if (proposal === null) { return; }
        try {
            await applyMutation.mutateAsync({
                workflowId,
                userMessage: proposalMessageRef.current,
                ops: proposal.ops,
            });
            setProposal(null);
            settleLastPending('applied', "Changes applied!");
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
        } catch (error) {
            const description = error instanceof Error ? error.message : "Could not apply changes.";
            toast({ title: "Update Failed", variant: "destructive", description });
        }
    };

    /** Nothing was written on propose, so discarding is purely local state. */
    const handleDiscard = (): void => {
        setProposal(null);
        settleLastPending('discarded', "Changes discarded.");
    };

    return {
        input,
        setInput,
        messages,
        proposal,
        isDragging,
        uploading,
        contextFiles,
        setContextFiles,
        scrollRef,
        isBusy: proposeMutation.isPending || applyMutation.isPending,
        mode,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleSend,
        handleApply,
        handleDiscard
    };
}

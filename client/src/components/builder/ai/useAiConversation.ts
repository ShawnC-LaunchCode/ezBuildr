
import { useState, useRef, useEffect } from 'react';

import { useToast } from "@/hooks/use-toast";
import { useReviseWorkflow, useUpdateWorkflow, useWorkflowMode } from "@/lib/vault-hooks";

import { AIGeneratedWorkflow, AIGeneratedTransformBlock, AIWorkflowRevisionResponse } from "@shared/types/ai";

import { Message, UploadedFile } from "./types";
import { useFileUpload } from "./useFileUpload";

interface UseAiConversationReturn {
    input: string;
    setInput: (val: string) => void;
    messages: Message[];
    proposedWorkflow: AIGeneratedWorkflow | Record<string, unknown> | null;
    isDragging: boolean;
    uploading: boolean;
    contextFiles: UploadedFile[];
    setContextFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    scrollRef: React.RefObject<HTMLDivElement>;
    reviseMutation: ReturnType<typeof useReviseWorkflow>;
    mode: string;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => Promise<void>;
    handleSend: (textOverride?: string) => Promise<void>;
    handleApply: () => Promise<void>;
    handleDiscard: () => void;
}

export function useAiConversation(
    workflowId: string,
    currentWorkflow: AIGeneratedWorkflow | Record<string, unknown>,
    transformBlocks: AIGeneratedTransformBlock[] = [],
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
    const [proposedWorkflow, setProposedWorkflow] = useState<AIGeneratedWorkflow | Record<string, unknown> | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const reviseMutation = useReviseWorkflow();
    const updateMutation = useUpdateWorkflow();
    const { data: workflowMode } = useWorkflowMode(workflowId);
    const mode = workflowMode?.mode ?? 'easy';

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

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const buildFullMessage = (text: string, files: UploadedFile[]) => {
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

    const processAutoApply = async (result: AIWorkflowRevisionResponse): Promise<void> => {
        try {
            await updateMutation.mutateAsync({
                id: workflowId,
                ...result.updatedWorkflow
            });

            const assistantMsg: Message = {
                role: 'assistant',
                content: result.explanation ? result.explanation.join(' ') : 'I have updated the workflow.',
                diff: result.diff,
                timestamp: Date.now(),
                status: 'applied'
            };

            setMessages(prev => [...prev, assistantMsg]);
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
        } catch (error) {
            console.error("Auto-apply failed", error);
        }
    };

    const handleSend = async (textOverride?: string): Promise<void> => {
        const textToSend = textOverride ?? input;

        // Explicit boolean check for empty input and context files
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
        setProposedWorkflow(null);

        try {
            const history = messages
                .filter(m => !m.diff)
                .map(m => ({ role: m.role, content: m.content }));

            const fullWorkflow = {
                title: (currentWorkflow as AIGeneratedWorkflow).title ?? 'Untitled Workflow',
                description: (currentWorkflow as AIGeneratedWorkflow).description ?? '',
                sections: (currentWorkflow as AIGeneratedWorkflow).sections ?? [],
                logicRules: (currentWorkflow as AIGeneratedWorkflow).logicRules ?? [],
                transformBlocks: transformBlocks,
                notes: ''
            };

            const result = await reviseMutation.mutateAsync({
                workflowId,
                currentWorkflow: fullWorkflow,
                userInstruction: fullMessage, // Send the full context to AI
                conversationHistory: history,
                mode: mode
            });

            // Auto-apply if in easy mode
            if (mode === 'easy') {
                await processAutoApply(result);
                return;
            }

            // Normal Flow (Manual Review)
            const assistantMsg: Message = {
                role: 'assistant',
                content: result.explanation ? result.explanation.join(' ') : 'Here are the suggested changes.',
                diff: result.diff,
                timestamp: Date.now(),
                status: 'pending'
            };

            setMessages(prev => [...prev, assistantMsg]);
            setProposedWorkflow(result.updatedWorkflow);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I encountered an error: ${errorMessage}`,
                timestamp: Date.now()
            }]);
        }
    };

    const handleApply = async (): Promise<void> => {
        if (proposedWorkflow === null) { return; }
        try {
            await updateMutation.mutateAsync({
                id: workflowId,
                ...proposedWorkflow
            });
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
            setProposedWorkflow(null);

            // Update the last message status to applied
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant' && lastMsg.status === 'pending') {
                    lastMsg.status = 'applied';
                } else {
                    // fallback if message structure changed, though unlikely in this flow
                    newMessages.push({
                        role: 'assistant',
                        content: "Changes applied!",
                        timestamp: Date.now(),
                        status: 'applied'
                    });
                }
                return newMessages;
            });
        } catch (error) {
            toast({ title: "Update Failed", variant: "destructive", description: "Could not apply changes." });
        }
    };

    const handleDiscard = (): void => {
        setProposedWorkflow(null);
        setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.role === 'assistant' && lastMsg.status === 'pending') {
                lastMsg.status = 'discarded';
            } else {
                newMessages.push({
                    role: 'assistant',
                    content: "Changes discarded.",
                    timestamp: Date.now()
                });
            }
            return newMessages;
        });
    };

    return {
        input,
        setInput,
        messages,
        proposedWorkflow,
        isDragging,
        uploading,
        contextFiles,
        setContextFiles,
        scrollRef,
        reviseMutation,
        mode,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleSend,
        handleApply,
        handleDiscard
    };
}

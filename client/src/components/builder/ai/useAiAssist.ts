
import { useState, useRef, useEffect } from 'react';

import { useToast } from "@/hooks/use-toast";
import { useReviseWorkflow, useUpdateWorkflow, useWorkflowMode } from "@/lib/vault-hooks";

import { AIGeneratedWorkflow, QualityScore } from "@shared/types/ai";

import { inspirationalPhrases } from "./constants";
import { Message, OperationMeta } from "./types";

interface UseInspirationalPhrasesReturn {
    currentPhrase: string;
    inspirationIndex: number;
}

function useInspirationalPhrases(isPending: boolean): UseInspirationalPhrasesReturn {
    const [inspirationIndex, setInspirationIndex] = useState(0);

    // Rotate inspirational phrases while AI is thinking
    useEffect(() => {
        if (isPending) {
            const interval = setInterval(() => {
                setInspirationIndex((prev) => (prev + 1) % inspirationalPhrases.length);
            }, 4000); // Change phrase every 4 seconds
            return () => clearInterval(interval);
        }
    }, [isPending]);

    return {
        currentPhrase: inspirationalPhrases[inspirationIndex],
        inspirationIndex // keeping index for now if needed, but phrase is enough
    };
}

interface UseAiAssistReturn {
    input: string;
    setInput: (input: string) => void;
    messages: Message[];
    proposedWorkflow: AIGeneratedWorkflow | Record<string, unknown> | null;
    showFeedbackWidget: boolean;
    setShowFeedbackWidget: (show: boolean) => void;
    lastQualityScore: QualityScore | undefined;
    lastOperationMeta: OperationMeta | null;
    inspirationIndex: number;
    scrollRef: React.RefObject<HTMLDivElement>;
    reviseMutation: ReturnType<typeof useReviseWorkflow>;
    mode: 'easy' | 'advanced';
    inspirationalPhrases: string[];
    handleSend: () => Promise<void>;
    handleApply: () => Promise<void>;
    handleDiscard: () => void;
}

export function useAiAssist(
    workflowId: string,
    currentWorkflow: AIGeneratedWorkflow | Record<string, unknown>
): UseAiAssistReturn {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Hi! I can help you revise this workflow. Try saying "Add a phone number question" or "Make the email required".',
            timestamp: Date.now()
        }
    ]);
    const [proposedWorkflow, setProposedWorkflow] = useState<AIGeneratedWorkflow | Record<string, unknown> | null>(null);
    const [showFeedbackWidget, setShowFeedbackWidget] = useState(false);
    const [lastQualityScore, setLastQualityScore] = useState<QualityScore | undefined>(undefined);
    const [lastOperationMeta, setLastOperationMeta] = useState<OperationMeta | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const reviseMutation = useReviseWorkflow();
    const updateMutation = useUpdateWorkflow();
    const { data: workflowMode } = useWorkflowMode(workflowId);
    const mode = workflowMode?.mode ?? 'easy';

    const { inspirationIndex } = useInspirationalPhrases(reviseMutation.isPending);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async (): Promise<void> => {
        if (!input.trim()) { return; }

        const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setProposedWorkflow(null); // Clear previous proposal if any

        try {
            // Convert messages to history format
            const history = messages
                .filter(m => !m.diff)
                .map(m => ({ role: m.role, content: m.content }));

            const result = await reviseMutation.mutateAsync({
                workflowId,
                currentWorkflow: currentWorkflow as AIGeneratedWorkflow,
                userInstruction: userMsg.content,
                conversationHistory: history,
                mode: mode
            });

            // Capture quality score if available
            const qualityScore = result.quality;
            if (qualityScore) {
                setLastQualityScore(qualityScore);
                setLastOperationMeta({
                    aiProvider: result.metadata?.provider,
                    aiModel: result.metadata?.model,
                    requestDescription: userMsg.content,
                });
            }

            // NOTE: Backend now auto-applies changes (Option B implementation)
            // Backend returns metadata.applied: true when changes are persisted
            const backendApplied = result.metadata?.applied === true;

            if (backendApplied) {
                // Backend already applied changes - show as applied
                const assistantMsg: Message = {
                    role: 'assistant',
                    content: result.explanation ? result.explanation.join(' ') : 'I have updated the workflow.',
                    diff: result.diff,
                    timestamp: Date.now(),
                    status: 'applied',
                    qualityScore,
                };
                setMessages(prev => [...prev, assistantMsg]);
                toast({
                    title: "Changes Applied",
                    description: `${result.diff?.changes?.length ?? 0} changes applied successfully.`
                });
                // Show feedback widget after successful auto-apply
                if (qualityScore) {
                    setShowFeedbackWidget(true);
                }
                // Force refetch workflow to show updated data in UI
                window.location.reload(); // Simple approach - can be improved with cache invalidation
            } else {
                // Fallback: Show as pending (advanced mode or old backend)
                const assistantMsg: Message = {
                    role: 'assistant',
                    content: result.explanation ? result.explanation.join(' ') : 'Here are the suggested changes.',
                    diff: result.diff,
                    timestamp: Date.now(),
                    status: 'pending',
                    qualityScore,
                };
                setMessages(prev => [...prev, assistantMsg]);
                setProposedWorkflow(result.updatedWorkflow);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I encountered an error: ${errorMessage}`,
                timestamp: Date.now()
            }]);
        }
    };

    const handleApply = async (): Promise<void> => {
        if (!proposedWorkflow) { return; }
        try {
            await updateMutation.mutateAsync({
                id: workflowId,
                ...proposedWorkflow
            });
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
            setProposedWorkflow(null);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant' && lastMsg.status === 'pending') {
                    lastMsg.status = 'applied';
                } else {
                    newMessages.push({
                        role: 'assistant',
                        content: "Changes applied!",
                        timestamp: Date.now(),
                        status: 'applied'
                    });
                }
                return newMessages;
            });
            // Show feedback widget after successful apply
            if (lastQualityScore) {
                setShowFeedbackWidget(true);
            }
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
        showFeedbackWidget,
        setShowFeedbackWidget,
        lastQualityScore,
        lastOperationMeta,
        inspirationIndex,
        scrollRef,
        reviseMutation,
        mode,
        inspirationalPhrases,
        handleSend,
        handleApply,
        handleDiscard
    };
}

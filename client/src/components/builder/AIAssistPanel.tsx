import { Loader2, Sparkles, Send, Check, X } from "lucide-react";
import React, { useState, useRef, useEffect } from 'react';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useReviseWorkflow, useUpdateWorkflow, useWorkflowMode } from "@/lib/vault-hooks";

import { AIFeedbackWidget, QualityScore } from "./AIFeedbackWidget";
interface Message {
    role: 'user' | 'assistant';
    content: string;
    diff?: any; // Structured diff if available
    timestamp: number;
    status?: 'pending' | 'applied' | 'discarded';
    qualityScore?: QualityScore;
}
interface AIAssistPanelProps {
    workflowId: string;
    currentWorkflow: any;
    isOpen: boolean;
    onClose: () => void;
}
export function AIAssistPanel({ workflowId, currentWorkflow, isOpen, onClose }: AIAssistPanelProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Hi! I can help you revise this workflow. Try saying "Add a phone number question" or "Make the email required".',
            timestamp: Date.now()
        }
    ]);
    const [proposedWorkflow, setProposedWorkflow] = useState<any>(null);
    const [showFeedbackWidget, setShowFeedbackWidget] = useState(false);
    const [lastQualityScore, setLastQualityScore] = useState<QualityScore | undefined>(undefined);
    const [lastOperationMeta, setLastOperationMeta] = useState<any>(null);
    const [inspirationIndex, setInspirationIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const reviseMutation = useReviseWorkflow();
    const updateMutation = useUpdateWorkflow();
    const { data: workflowMode } = useWorkflowMode(workflowId);
    const mode = workflowMode?.mode || 'easy';
    const inspirationalPhrases = [
        "Every great workflow starts with a single step.",
        "Automation is not about replacing humans, it's about empowering them.",
        "Good workflows are built, great workflows are evolved.",
        "The best time to automate was yesterday. The second best time is now.",
        "Small improvements in process lead to massive gains in productivity.",
        "A well-designed workflow is like a good conversation - it flows naturally.",
        "Simplicity is the ultimate sophistication in workflow design.",
        "Your future self will thank you for documenting this process.",
        "Great workflows don't just save time, they create possibilities.",
        "Think of this as building the future, one question at a time."
    ];
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);
    // Rotate inspirational phrases while AI is thinking
    useEffect(() => {
        if (reviseMutation.isPending) {
            const interval = setInterval(() => {
                setInspirationIndex((prev) => (prev + 1) % inspirationalPhrases.length);
            }, 4000); // Change phrase every 4 seconds
            return () => clearInterval(interval);
        }
    }, [reviseMutation.isPending, inspirationalPhrases.length]);
    const handleSend = async () => {
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
                currentWorkflow,
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
                    description: `${result.diff?.changes?.length || 0} changes applied successfully.`
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
        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error.message}`,
                timestamp: Date.now()
            }]);
        }
    };
    const handleApply = async () => {
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
    const handleDiscard = () => {
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
    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        AI Assistant
                        {mode === 'easy' && <Badge variant="secondary" className="ml-auto text-xs">Easy Mode</Badge>}
                    </SheetTitle>
                    <SheetDescription>
                        Iterate on your workflow using natural language.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
                    <div className="space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`rounded-lg p-3 max-w-[85%] text-sm ${msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                    }`}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                </div>
                                {msg.diff?.changes && msg.diff.changes.length > 0 && (
                                    <Card className={cn(
                                        "w-full mt-2 p-3 border shadow-sm",
                                        msg.status === 'applied' ? "bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-900" :
                                            msg.status === 'discarded' ? "bg-muted/50 opacity-70" :
                                                "bg-purple-50/50 border-purple-200 dark:bg-purple-900/10 dark:border-purple-900"
                                    )}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={cn(
                                                "text-xs font-semibold",
                                                msg.status === 'applied' ? "text-green-700 dark:text-green-400" :
                                                    msg.status === 'discarded' ? "text-muted-foreground" :
                                                        "text-purple-700 dark:text-purple-300"
                                            )}>
                                                {msg.status === 'applied' ? 'Changes Applied' :
                                                    msg.status === 'discarded' ? 'Changes Discarded' :
                                                        'Proposed Changes'}
                                            </span>
                                            <Badge variant="outline" className="text-[10px]">{msg.diff.changes.length} changes</Badge>
                                        </div>
                                        <ul className="space-y-1 mb-3">
                                            {msg.diff.changes.map((change: any, i: number) => (
                                                <li key={i} className="text-xs flex gap-2">
                                                    <Badge variant={change.type === 'add' ? 'default' : change.type === 'remove' ? 'destructive' : 'secondary'} className="h-5 px-1 text-[10px] capitalize shrink-0">
                                                        {change.type}
                                                    </Badge>
                                                    <span className="truncate flex-1 text-muted-foreground">{change.explanation}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {msg.status === 'pending' && proposedWorkflow && idx === messages.length - 1 && (
                                            <div className="flex gap-2 justify-end pt-2 border-t border-purple-200/50">
                                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { void handleDiscard(); }}>
                                                    <X className="w-3 h-3 mr-1" /> Discard
                                                </Button>
                                                <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => { void handleApply(); }}>
                                                    <Check className="w-3 h-3 mr-1" /> Apply
                                                </Button>
                                            </div>
                                        )}
                                    </Card>
                                )}
                            </div>
                        ))}
                        {reviseMutation.isPending && (
                            <div className="flex flex-col gap-3">
                                <div className="bg-muted rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                                        <span className="text-sm font-medium text-foreground">Thinking...</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-3">
                                        This can take a few minutes for larger documents. Great time to go get a coffee ☕
                                    </p>
                                    <div className="border-t border-border pt-3">
                                        <p className="text-xs italic text-muted-foreground transition-opacity duration-500">
                                            {inspirationalPhrases[inspirationIndex]}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showFeedbackWidget && lastQualityScore && (
                            <div className="mt-4">
                                <AIFeedbackWidget
                                    workflowId={workflowId}
                                    operationType="revision"
                                    qualityScore={lastQualityScore}
                                    aiProvider={lastOperationMeta?.aiProvider}
                                    aiModel={lastOperationMeta?.aiModel}
                                    requestDescription={lastOperationMeta?.requestDescription}
                                    onClose={() => setShowFeedbackWidget(false)}
                                />
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </div>
                <div className="p-4 border-t bg-background">
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSend();
                        }}
                    >
                        <Input
                            placeholder={mode === 'easy' ? "Describe changes to auto-apply..." : "Describe changes..."}
                            value={input}
                            onChange={(e) => { void setInput(e.target.value); }}
                            disabled={reviseMutation.isPending || !!proposedWorkflow}
                        />
                        <Button type="submit" size="icon" disabled={!input.trim() || reviseMutation.isPending || !!proposedWorkflow}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                    {!!proposedWorkflow && (
                        <p className="text-xs text-center mt-2 text-muted-foreground animate-pulse">Waiting for your review...</p>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
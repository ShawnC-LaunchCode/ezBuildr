
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Send, Check, X, Undo, MessageSquare } from "lucide-react";
import { useReviseWorkflow, useUpdateWorkflow } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";

interface Message {
    role: 'user' | 'assistant';
    content: string;
    diff?: any; // Structured diff if available
    timestamp: number;
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

    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const reviseMutation = useReviseWorkflow();
    const updateMutation = useUpdateWorkflow();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setProposedWorkflow(null); // Clear previous proposal if any

        try {
            // Convert messages to history format
            const history = messages
                .filter(m => !m.diff) // Exclude system/diff messages if we want pure chat history? 
                // Actually the API expects 'user' | 'assistant'
                .map(m => ({ role: m.role, content: m.content }));

            const result = await reviseMutation.mutateAsync({
                workflowId,
                currentWorkflow,
                userInstruction: userMsg.content,
                conversationHistory: history,
                mode: 'easy' // Could pull this from props
            });

            const assistantMsg: Message = {
                role: 'assistant',
                content: result.explanation ? result.explanation.join(' ') : 'Here are the suggested changes.',
                diff: result.diff,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMsg]);
            setProposedWorkflow(result.updatedWorkflow);

        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error.message}`,
                timestamp: Date.now()
            }]);
        }
    };

    const handleApply = async () => {
        if (!proposedWorkflow) return;
        try {
            await updateMutation.mutateAsync({
                id: workflowId,
                ...proposedWorkflow
            });
            toast({ title: "Changes Applied", description: "Workflow updated successfully." });
            setProposedWorkflow(null);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Changes applied! What else can I help with?",
                timestamp: Date.now()
            }]);
        } catch (error) {
            toast({ title: "Update Failed", variant: "destructive", description: "Could not apply changes." });
        }
    };

    const handleDiscard = () => {
        setProposedWorkflow(null);
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: "Changes discarded.",
            timestamp: Date.now()
        }]);
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        AI Assistant
                    </SheetTitle>
                    <SheetDescription>
                        Iterate on your workflow using natural language.
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="space-y-4">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`rounded-lg p-3 max-w-[85%] ${msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted'
                                    }`}>
                                    <p className="text-sm">{msg.content}</p>
                                </div>

                                {msg.diff && msg.diff.changes && msg.diff.changes.length > 0 && idx === messages.length - 1 && proposedWorkflow && (
                                    <Card className="w-full mt-2 p-3 border-purple-200 bg-purple-50/50 dark:bg-purple-900/10">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Proposed Changes</span>
                                            <Badge variant="outline" className="text-[10px]">{msg.diff.changes.length} changes</Badge>
                                        </div>
                                        <ul className="space-y-1 mb-3">
                                            {msg.diff.changes.map((change: any, i: number) => (
                                                <li key={i} className="text-xs flex gap-2">
                                                    <Badge variant={change.type === 'add' ? 'default' : change.type === 'remove' ? 'destructive' : 'secondary'} className="h-5 px-1 text-[10px] capitalize">
                                                        {change.type}
                                                    </Badge>
                                                    <span className="truncate flex-1">{change.explanation}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex gap-2 justify-end">
                                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDiscard}>
                                                <X className="w-3 h-3 mr-1" /> Discard
                                            </Button>
                                            <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={handleApply}>
                                                <Check className="w-3 h-3 mr-1" /> Apply
                                            </Button>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        ))}
                        {reviseMutation.isPending && (
                            <div className="flex items-start gap-2">
                                <div className="bg-muted rounded-lg p-3">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} /> {/* Auto-scroll anchor */}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t bg-background">
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                    >
                        <Input
                            placeholder="Describe changes..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={reviseMutation.isPending || !!proposedWorkflow} // Disable while pending or waiting for decision
                        />
                        <Button type="submit" size="icon" disabled={!input.trim() || reviseMutation.isPending || !!proposedWorkflow}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                    {!!proposedWorkflow && (
                        <p className="text-xs text-center mt-2 text-muted-foreground">Apply or discard changes to continue</p>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Send, RotateCcw, Check, X } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { applyAiSuggestions } from "@/lib/ai-operations";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useCreateSection, useCreateStep } from "@/lib/vault-hooks";
interface AiAssistantDialogProps {
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    suggestions?: any;
    applied?: boolean;
}
export function AiAssistantDialog({ workflowId, open, onOpenChange }: AiAssistantDialogProps) {
    const [prompt, setPrompt] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);
    // Hooks for mutations
    const createSection = useCreateSection();
    const createStep = useCreateStep();
    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);
    const handleApply = async (suggestions: any) => {
        const success = await applyAiSuggestions(workflowId, suggestions, {
            createSection,
            createStep
        });
        if (success) {
            onOpenChange(false);
            // Optionally mark message as applied in UI if we kept dialog open
        }
    };
    const suggestMutation = useMutation({
        mutationFn: async (description: string) => {
            const res = await apiRequest("POST", `/api/ai/workflows/${workflowId}/suggest`, {
                description,
            });
            return res.json();
        },
        onSuccess: (data) => {
            // Add assistant message with suggestions
            const newMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: "I've generated some suggestions based on your request. Please review the changes below.",
                suggestions: data
            };
            setMessages(prev => [...prev, newMessage]);
        },
        onError: (error: any) => {
            toast({
                title: "AI Error",
                description: error?.message || "Failed to generate suggestions.",
                variant: "destructive",
            });
        },
    });
    const handleGenerate = () => {
        if (!prompt.trim()) {return;}
        // Add user message via optimistic update
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: prompt
        };
        setMessages(prev => [...prev, userMsg]);
        suggestMutation.mutate(prompt);
        setPrompt("");
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl flex flex-col h-[600px] p-0 gap-0">
                <DialogHeader className="p-6 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-indigo-600" />
                        Edit Workflow with AI
                    </DialogTitle>
                    <DialogDescription>
                        Refine your workflow using natural language. Review changes before applying.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                        {messages.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <Sparkles className="w-12 h-12 mx-auto mb-3 text-indigo-100" />
                                <p>Describe what you want to change.</p>
                                <p className="text-xs mt-1 opacity-70">"Add a phone number question"</p>
                                <p className="text-xs opacity-70">"Create a new page for payment info"</p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div key={msg.id} className={cn(
                                "flex gap-3",
                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                            )}>
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                    msg.role === 'user' ? "bg-slate-200" : "bg-indigo-100 text-indigo-600"
                                )}>
                                    {msg.role === 'user' ? <div className="text-xs font-semibold">You</div> : <Sparkles className="w-4 h-4" />}
                                </div>
                                <div className={cn(
                                    "rounded-lg p-3 text-sm max-w-[80%]",
                                    msg.role === 'user' ? "bg-slate-100 text-slate-900" : "bg-white border text-slate-900"
                                )}>
                                    <p>{msg.content}</p>
                                    {/* Placeholder for Diff View */}
                                    {msg.suggestions && (
                                        <div className="mt-3 border rounded-md p-2 bg-slate-50">
                                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
                                                <RotateCcw className="w-3 h-3" />
                                                Proposed Changes
                                            </div>
                                            {/* We will replace this with AiDiffView later */}
                                            <pre className="text-[10px] overflow-x-auto p-2 bg-white rounded border">
                                                {JSON.stringify(msg.suggestions, null, 2).slice(0, 200)}...
                                            </pre>
                                            <div className="flex gap-2 mt-3">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs w-full"
                                                    onClick={() => {
                                                        // Reject just hides/removes the message or marks it rejected
                                                        // For now, simpler to just toast and ignore
                                                        toast({ title: "Suggestion Rejected", description: "No changes were made." });
                                                    }}
                                                >
                                                    <X className="w-3 h-3 mr-1" /> Reject
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-xs w-full bg-indigo-600 hover:bg-indigo-700"
                                                    onClick={() => { void handleApply(msg.suggestions); }}
                                                >
                                                    <Check className="w-3 h-3 mr-1" /> Apply Changes
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {suggestMutation.isPending && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm ml-11">
                                <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>
                <div className="p-4 border-t bg-slate-50 shrink-0">
                    <div className="flex gap-2">
                        <Textarea
                            placeholder="Message AI..."
                            value={prompt}
                            onChange={(e) => { void setPrompt(e.target.value); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                            className="min-h-[44px] max-h-[120px] resize-none py-3"
                        />
                        <Button
                            onClick={() => { void handleGenerate(); }}
                            disabled={suggestMutation.isPending || !prompt.trim()}
                            size="icon"
                            className="h-[44px] w-[44px] shrink-0"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
import { Loader2, Sparkles, Send, Check, X, Paperclip, FileText } from "lucide-react";
import React, { useState, useRef, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/vault-api";
import { useReviseWorkflow, useUpdateWorkflow, useWorkflowMode } from "@/lib/vault-hooks";
interface Message {
    role: 'user' | 'assistant';
    content: string;
    diff?: any;
    timestamp: number;
    status?: 'pending' | 'applied' | 'discarded';
}
interface UploadedFile {
    name: string;
    content: string;
}
interface AiConversationPanelProps {
    workflowId: string;
    currentWorkflow: any; // Basic workflow metadata
    transformBlocks?: any[];
    initialPrompt?: string;
    className?: string;
}
export function AiConversationPanel({ workflowId, currentWorkflow, transformBlocks = [], initialPrompt, className }: AiConversationPanelProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Hi! I can help you revise this workflow. Try saying "Add a phone number question" or "Make the email required".\n\nYou can also drop PDF or DOCX files here to give me more context!',
            timestamp: Date.now()
        }
    ]);
    const [proposedWorkflow, setProposedWorkflow] = useState<any>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [contextFiles, setContextFiles] = useState<UploadedFile[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const reviseMutation = useReviseWorkflow();
    const updateMutation = useUpdateWorkflow();
    const { data: workflowMode } = useWorkflowMode(workflowId);
    const mode = workflowMode?.mode || 'easy';
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
    }, [initialPrompt, messages.length]);
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        // Prevent flickering: only disable if leaving the main container, not entering a child
        if (e.currentTarget.contains(e.relatedTarget as Node)) { return; }
        setIsDragging(false);
    };
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) { return; }
        setUploading(true);
        const newContextFiles: UploadedFile[] = [];
        try {
            for (const file of files) {
                // Check type (MIME or Extension)
                const allowedTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain',
                    'text/markdown'
                ];
                const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
                const isTypeValid = allowedTypes.includes(file.type);
                const isExtValid = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
                if (!isTypeValid && !isExtValid) {
                    toast({ title: "Skipped File", description: `${file.name} is not a supported document type (PDF/Word/Txt).` });
                    continue;
                }
                const formData = new FormData();
                formData.append('file', file);
                try {
                    // Use fetch directly to handle FormData correctly (apiRequest forces JSON)
                    const token = getAccessToken();
                    const headers: Record<string, string> = {};
                    if (token) { headers['Authorization'] = `Bearer ${token}`; }
                    const res = await fetch('/api/ai/doc/extract-text', {
                        method: 'POST',
                        body: formData,
                        headers
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.message || res.statusText);
                    }
                    const data = await res.json();
                    if (data.text) {
                        newContextFiles.push({
                            name: file.name,
                            content: data.text
                        });
                    }
                } catch (err) {
                    console.error(err);
                    toast({ title: "Upload Failed", variant: "destructive", description: `Could not process ${file.name}` });
                }
            }
            setContextFiles(prev => [...prev, ...newContextFiles]);
        } finally {
            setUploading(false);
        }
    };
    const handleSend = async (textOverride?: string) => {
        const textToSend = textOverride !== undefined ? textOverride : input;
        if (!textToSend.trim() && contextFiles.length === 0) { return; }
        // Construct full message with context
        let fullMessage = textToSend;
        if (contextFiles.length > 0) {
            fullMessage += `\n\n--- CONTEXT FROM UPLOADED FILES ---\n`;
            contextFiles.forEach(f => {
                fullMessage += `DATA FROM FILE: ${f.name}\n${f.content}\n\n`;
            });
            fullMessage += `--- END CONTEXT ---\n`;
        }
        // Display message (hide massive context from UI, show attachment badges instead)
        const displayContent = textToSend || (contextFiles.length > 0 ? "Processed uploaded files." : "");
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
                title: currentWorkflow.title || 'Untitled Workflow',
                description: currentWorkflow.description || '',
                sections: currentWorkflow.sections || [],
                logicRules: currentWorkflow.logicRules || [],
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
            if (mode === 'easy' && result.updatedWorkflow) {
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
                    return; // Done
                } catch (error) {
                    console.error("Auto-apply failed", error);
                    // Fallback to manual if update fails
                }
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
        <div
            className={cn("flex flex-col h-full bg-background relative", className)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { void handleDrop(e); }}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-background/90 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
                    <div className="text-center p-8">
                        <Paperclip className="w-12 h-12 mx-auto mb-4 text-primary" />
                        <h3 className="text-lg font-semibold">Drop files to add context</h3>
                        <p className="text-sm text-muted-foreground">PDFs and Word documents supported</p>
                    </div>
                </div>
            )}
            <div className="p-4 border-b flex items-center gap-2 font-semibold bg-muted/40">
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI Assistant
                {mode === 'easy' && <Badge variant="secondary" className="ml-auto text-xs">Easy Mode</Badge>}
            </div>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-6 pb-4">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                            <div className={`rounded-lg p-3 max-w-[80%] text-sm shadow-sm ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card border'
                                }`}>
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                            {msg.diff?.changes && msg.diff.changes.length > 0 && (
                                <Card className={cn(
                                    "w-full max-w-[80%] mt-1 p-3 border shadow-sm self-start",
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
                                        <Badge variant="outline" className="text-[10px] whitespace-nowrap ml-2">{msg.diff.changes.length} changes</Badge>
                                    </div>
                                    <ul className="space-y-1 mb-3 min-w-0">
                                        {msg.diff.changes.map((change: any, i: number) => (
                                            <li key={i} className="text-xs flex gap-2 w-full min-w-0 items-center">
                                                <Badge
                                                    variant={change.type === 'add' ? 'default' : change.type === 'remove' ? 'destructive' : 'secondary'}
                                                    className={cn("h-5 px-1 text-[10px] capitalize shrink-0",
                                                        change.type === 'add' && "bg-green-500 hover:bg-green-600",
                                                        change.type === 'update' && "bg-blue-500 hover:bg-blue-600"
                                                    )}
                                                >
                                                    {change.type}
                                                </Badge>
                                                <span className="whitespace-normal break-words text-muted-foreground min-w-0">{change.explanation}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {/* Only show buttons if pending */}
                                    {msg.status === 'pending' && proposedWorkflow && idx === messages.length - 1 && (
                                        <div className="flex gap-2 justify-end pt-2 border-t border-purple-200/50 dark:border-purple-800/50">
                                            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30" onClick={() => { void handleDiscard(); }}>
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
                    {(reviseMutation.isPending || uploading) && (
                        <div className="flex items-start gap-2">
                            <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                    {uploading ? "Processing file..." : "Thinking..."}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>
            <div className="p-4 border-t bg-background">
                {/* File Previews */}
                {contextFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {contextFiles.map((f, i) => (
                            <Badge key={i} variant="secondary" className="pl-1 pr-2 py-0.5 h-6 text-xs flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                <span className="max-w-[100px] truncate">{f.name}</span>
                                <button
                                    onClick={() => setContextFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    className="ml-1 hover:text-destructive"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                )}
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
                        disabled={reviseMutation.isPending || !!proposedWorkflow || uploading}
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={(!input.trim() && contextFiles.length === 0) || reviseMutation.isPending || !!proposedWorkflow || uploading}>
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
                {!!proposedWorkflow && (
                    <p className="text-xs text-center mt-2 text-muted-foreground animate-pulse">Waiting for your review...</p>
                )}
            </div>
        </div>
    );
}
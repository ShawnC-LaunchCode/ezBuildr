
import { Loader2, Sparkles, Paperclip } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { AiInputArea } from "./AiInputArea";
import { AiMessageItem } from "./AiMessageItem";
import { useAiConversation } from "./useAiConversation";

interface AiConversationPanelProps {
    workflowId: string;
    initialPrompt?: string;
    className?: string;
}

export function AiConversationPanel({ workflowId, initialPrompt, className }: AiConversationPanelProps) {
    const {
        input,
        setInput,
        messages,
        proposal,
        isDragging,
        uploading,
        contextFiles,
        setContextFiles,
        scrollRef,
        isBusy,
        mode,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleSend,
        handleApply,
        handleDiscard
    } = useAiConversation(workflowId, initialPrompt);

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

            {/* min-h-0 is load-bearing: a flex item defaults to
                min-height:auto, so `flex-1` alone could not shrink below the
                conversation's height. Once the thread got long the scroller
                grew instead of scrolling and pushed the composer past the
                bottom of the panel, so you had to scroll the page to reach it.
                The ref belongs to the bottom sentinel below, not here — Radix
                scrolls its Viewport child, not this Root. */}
            <ScrollArea className="min-h-0 flex-1 p-4">
                <div className="space-y-6 pb-4">
                    {messages.map((msg, idx) => (
                        <AiMessageItem
                            key={idx}
                            msg={msg}
                            isLast={idx === messages.length - 1}
                            proposedWorkflow={proposal}
                            onApply={() => { void handleApply(); }}
                            onDiscard={() => { void handleDiscard(); }}
                        />
                    ))}

                    {(isBusy || uploading) && (
                        <div className="flex items-start gap-2">
                            <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                    {uploading ? "Processing file..." : "Thinking..."}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} aria-hidden="true" />
                </div>
            </ScrollArea>

            <AiInputArea
                input={input}
                setInput={setInput}
                contextFiles={contextFiles}
                setContextFiles={setContextFiles}
                mode={mode}
                isBusy={isBusy}
                uploading={uploading}
                hasPendingProposal={proposal !== null}
                onSend={() => void handleSend()}
            />
        </div>
    );
}

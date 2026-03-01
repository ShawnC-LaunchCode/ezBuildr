
import { Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { AIGeneratedWorkflow } from "@shared/types/ai";

import { AiAssistInput } from "./ai/AiAssistInput";
import { AiMessageItem } from "./ai/AiMessageItem";
import { useAiAssist } from "./ai/useAiAssist";
import { AIFeedbackWidget } from "./AIFeedbackWidget";

interface AIAssistPanelProps {
    workflowId: string;
    currentWorkflow: AIGeneratedWorkflow | Record<string, unknown>;
    isOpen: boolean;
    onClose: () => void;
}

export function AIAssistPanel({ workflowId, currentWorkflow, isOpen, onClose }: AIAssistPanelProps) {
    const {
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
    } = useAiAssist(workflowId, currentWorkflow);

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
                            <AiMessageItem
                                key={idx}
                                msg={msg}
                                isLast={idx === messages.length - 1}
                                proposedWorkflow={proposedWorkflow}
                                onApply={() => { void handleApply(); }}
                                onDiscard={() => { void handleDiscard(); }}
                            />
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
                <AiAssistInput
                    input={input}
                    setInput={setInput}
                    handleSend={() => { void handleSend(); }}
                    isLoading={reviseMutation.isPending}
                    isWaitingForReview={!!proposedWorkflow}
                    mode={mode}
                />
            </SheetContent>
        </Sheet>
    );
}
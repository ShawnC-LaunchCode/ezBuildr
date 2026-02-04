
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AIGeneratedWorkflow, WorkflowChange } from "@shared/types/ai";

import { Message } from "./types";

interface AiMessageItemProps {
    msg: Message;
    isLast: boolean;
    proposedWorkflow: AIGeneratedWorkflow | Record<string, unknown> | null;
    onApply: () => void;
    onDiscard: () => void;
}

export function AiMessageItem({ msg, isLast, proposedWorkflow, onApply, onDiscard }: AiMessageItemProps) {
    return (
        <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
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
                        {msg.diff.changes.map((change: WorkflowChange, i: number) => (
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
                    {msg.status === 'pending' && proposedWorkflow !== null && isLast && (
                        <div className="flex gap-2 justify-end pt-2 border-t border-purple-200/50 dark:border-purple-800/50">
                            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30" onClick={() => { void onDiscard(); }}>
                                <X className="w-3 h-3 mr-1" /> Discard
                            </Button>
                            <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => { void onApply(); }}>
                                <Check className="w-3 h-3 mr-1" /> Apply
                            </Button>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}

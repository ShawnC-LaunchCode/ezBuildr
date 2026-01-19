/**
 * ExecutionTimeline Component
 * 
 * Displays a chronological list of executed steps, logic evaluations, and errors.
 * Used in the DevPanel to help users understand what happened during a workflow run.
 * 
 * Enhanced with filters for granular visibility (Skipped, Logic, Mutations).
 */
import { format } from "date-fns";
import { CheckCircle, XCircle, ArrowRight, Filter, Eye, EyeOff, GitBranch, Database, Zap } from "lucide-react";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TraceEntry } from "@/lib/previewRunner/PreviewEnvironment";
import { cn } from "@/lib/utils";
interface ExecutionTimelineProps {
    trace: TraceEntry[];
    isLoading?: boolean;
}
export function ExecutionTimeline({ trace, isLoading }: ExecutionTimelineProps) {
    const [showSkipped, setShowSkipped] = useState(false);
    const [showLogic, setShowLogic] = useState(true);
    const [showDetails, setShowDetails] = useState(false);
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading trace...
            </div>
        );
    }
    if (!trace || trace.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <p>No execution trace yet</p>
                <p className="text-xs mt-2">Run the workflow to see execution steps</p>
            </div>
        );
    }
    // Filter trace
    const filteredTrace = trace.filter(entry => {
        if (!showSkipped && entry.status === 'skipped') {return false;}
        if (!showLogic && entry.type === 'logic') {return false;}
        return true;
    });
    return (
        <div className="h-full flex flex-col">
            {/* Filter Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b bg-muted/20">
                <Filter className="w-3 h-3 text-muted-foreground mr-1" />
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle
                                size="sm"
                                pressed={showSkipped}
                                onPressedChange={setShowSkipped}
                                className="h-6 text-[10px] px-2"
                            >
                                Skipped
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>Show steps that were skipped due to logic</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle
                                size="sm"
                                pressed={showLogic}
                                onPressedChange={setShowLogic}
                                className="h-6 text-[10px] px-2"
                            >
                                Logic
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>Show branching and validation outcomes</TooltipContent>
                    </Tooltip>
                    <div className="flex-1" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                {showDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{showDetails ? "Hide All Details" : "Show All Details"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {filteredTrace.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                            No events match current filters.
                        </p>
                    )}
                    {filteredTrace.map((entry, index) => (
                        <TimelineItem key={entry.id} entry={entry} index={index} forceDetails={showDetails} />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
function TimelineItem({ entry, index, forceDetails }: { entry: TraceEntry; index: number, forceDetails: boolean }) {
    const isSkipped = entry.status === 'skipped';
    const isFailed = entry.status === 'failed';
    const isLogic = entry.type === 'logic';
    const isAction = entry.type === 'action'; // e.g. Write, Send
    // Determine Mutation context
    const isMutation = isAction || (entry.type === 'step' && entry.details?.outputs);
    const getIcon = () => {
        if (isFailed) {return <XCircle className="w-4 h-4 text-destructive" />;}
        if (isSkipped) {return <ArrowRight className="w-4 h-4 text-muted-foreground" />;}
        if (isLogic) {return <GitBranch className="w-4 h-4 text-amber-500" />;}
        if (isAction) {return <Database className="w-4 h-4 text-blue-500" />;}
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    };
    const formattedTime = format(new Date(entry.timestamp), "HH:mm:ss.SSS");
    return (
        <div className={cn("flex gap-3 relative group", isSkipped && "opacity-60")}>
            {/* Connector Line */}
            <div className="absolute left-[7px] top-6 bottom-[-14px] w-[2px] bg-border last:hidden group-last:hidden" />
            {/* Icon */}
            <div className={cn("mt-1 relative z-10 bg-background", isLogic && "scale-90")}>
                {getIcon()}
            </div>
            {/* Content */}
            <div className={cn(
                "flex-1 min-w-0 border rounded-md p-2 text-sm shadow-sm transition-colors",
                isFailed ? "bg-red-50 border-red-200" : "bg-card",
                isLogic && "bg-amber-50/50 border-amber-100",
                isAction && "bg-blue-50/30 border-blue-100",
                isSkipped && "bg-muted/30 border-transparent shadow-none"
            )}>
                <div className="flex justify-between items-start mb-1">
                    <div className={cn("font-medium truncate pr-2", isSkipped && "line-through decoration-muted-foreground/30")}>
                        {entry.message || `Step ${index + 1}`}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                        {formattedTime}
                    </span>
                </div>
                {/* Tags/Badges */}
                <div className="flex gap-2 mb-1 items-center">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 capitalize bg-background/50">
                        {entry.type}
                    </Badge>
                    {/* Logic Result Badge */}
                    {isLogic && entry.status === 'executed' && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-amber-100 text-amber-800 hover:bg-amber-200">
                            Condition Met
                        </Badge>
                    )}
                    {/* Mutation Badge */}
                    {isMutation && entry.status === 'executed' && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium px-1">
                            <Zap className="w-3 h-3" />
                            <span>Update</span>
                        </div>
                    )}
                    {isFailed && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                            Failed
                        </Badge>
                    )}
                </div>
                {/* Details Section */}
                {(forceDetails || entry.details) && (
                    <div className={cn(
                        "mt-2 text-xs bg-muted/50 p-1.5 rounded font-mono overflow-x-auto",
                        !forceDetails && "hidden group-hover:block" // Auto-show on hover unless forced
                    )}>
                        {entry.status === 'skipped' && (
                            <div className="text-muted-foreground">
                                Reason: {entry.details?.reason ? JSON.stringify(entry.details.reason) : "Conditional logic evaluated to false"}
                            </div>
                        )}
                        {entry.status === 'executed' && entry.details?.outputs && (
                            <div className="text-blue-700 dark:text-blue-300">
                                Output: {JSON.stringify(entry.details.outputs)}
                            </div>
                        )}
                        {entry.status === 'executed' && entry.details?.result !== undefined && (
                            <div className="text-amber-700 dark:text-amber-300">
                                Result: {String(entry.details.result)}
                            </div>
                        )}
                        {entry.status === 'failed' && (
                            <div className="text-destructive font-semibold">
                                Error: {typeof entry.details?.error === 'string' ? entry.details.error : JSON.stringify(entry.details?.error || "Unknown Error")}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
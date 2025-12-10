/**
 * RuntimeVariableList Component
 * Displays real-time variable values for Preview mode
 */

import { useState } from "react";
import { Copy, Pin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useDevPanel } from "@/store/devpanel";
import type { ApiWorkflowVariable } from "@/lib/vault-api";

interface RuntimeVariableListProps {
    workflowId: string;
    variables: ApiWorkflowVariable[];
    values: Record<string, any>;
}

export function RuntimeVariableList({ workflowId, variables, values }: RuntimeVariableListProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const { isPinned, togglePin } = useDevPanel();

    // Filter variables based on search query
    const filteredVariables = variables.filter((v) => {
        const searchText = searchQuery.toLowerCase();
        const displayKey = v.alias || v.key;
        return (
            displayKey.toLowerCase().includes(searchText) ||
            v.label.toLowerCase().includes(searchText)
        );
    });

    // Group by section
    const groupedVariables = filteredVariables.reduce((acc, variable) => {
        const section = variable.sectionTitle || "Uncategorized";
        if (!acc[section]) {
            acc[section] = [];
        }
        acc[section].push(variable);
        return acc;
    }, {} as Record<string, ApiWorkflowVariable[]>);

    // Sort sections alphabetically, but put "Uncategorized" last if needed (though usually not an issue)
    const sortedSections = Object.keys(groupedVariables).sort();

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({
                title: "Copied",
                description: "Value copied to clipboard",
            });
        });
    };

    const handlePin = (key: string) => {
        togglePin(workflowId, key);
    };

    const formatValue = (val: any) => {
        if (val === undefined || val === null) return <span className="text-muted-foreground italic">undefined</span>;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    if (variables.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <p>No variables available</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="p-3 border-b">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search variables..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            {/* Variables List */}
            <ScrollArea className="flex-1">
                <div className="p-2">
                    {filteredVariables.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-4">
                            No variables match your search
                        </div>
                    ) : (
                        <Accordion
                            type="multiple"
                            defaultValue={sortedSections} // Default expand all to see content
                            className="w-full space-y-2"
                        >
                            {sortedSections.map((sectionTitle) => (
                                <AccordionItem key={sectionTitle} value={sectionTitle} className="border rounded-md px-2">
                                    <AccordionTrigger className="py-2 hover:no-underline hover:bg-muted/50 -mx-2 px-2 rounded-t-md data-[state=open]:rounded-b-none">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{sectionTitle}</span>
                                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                                                {groupedVariables[sectionTitle].length}
                                            </span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-2 pt-1">
                                        <div className="space-y-1">
                                            {groupedVariables[sectionTitle].map((variable) => {
                                                const displayKey = variable.alias || variable.key;
                                                const pinned = isPinned(workflowId, displayKey);
                                                const currentValue = values[variable.stepId];
                                                const isUndefined = currentValue === undefined || currentValue === null;

                                                return (
                                                    <div
                                                        key={variable.stepId}
                                                        className={cn(
                                                            "group flex flex-col gap-1 p-2 rounded-md hover:bg-accent transition-colors border border-transparent hover:border-border",
                                                            pinned && "bg-accent/50"
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            {/* Variable Name */}
                                                            <div className="flex-1 min-w-0 mr-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-sm font-bold text-primary truncate" title={displayKey}>
                                                                        {displayKey}
                                                                    </span>
                                                                    {variable.alias && variable.key !== variable.alias && (
                                                                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]" title={variable.key}>
                                                                            ({variable.key})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground truncate" title={variable.label}>
                                                                    {variable.label}
                                                                </div>
                                                            </div>

                                                            {/* Actions */}
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-6 w-6"
                                                                    onClick={() => handleCopy(JSON.stringify(currentValue))}
                                                                    disabled={isUndefined}
                                                                    title="Copy value"
                                                                >
                                                                    <Copy className="h-3 w-3" />
                                                                </Button>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className={cn(
                                                                        "h-6 w-6",
                                                                        pinned && "text-primary opacity-100"
                                                                    )}
                                                                    onClick={() => handlePin(displayKey)}
                                                                    title={pinned ? "Unpin" : "Pin"}
                                                                >
                                                                    <Pin className={cn("h-3 w-3", pinned && "fill-current")} />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {/* Runtime Value */}
                                                        <div className={cn(
                                                            "mt-1 p-1.5 rounded bg-muted/50 font-mono text-xs break-all",
                                                            isUndefined && "text-muted-foreground italic"
                                                        )}>
                                                            {formatValue(currentValue)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

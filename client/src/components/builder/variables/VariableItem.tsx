
import { Copy, ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ApiStep, type ApiWorkflowVariable } from "@/lib/vault-api";

import { ListFieldTree } from "./ListFieldTree";
import { buildListVariableTree } from "./listVariableTree";
import { getVariableIcon, isListType } from "./utils";

interface VariableItemProps {
    variable: ApiWorkflowVariable;
    isExpanded: boolean;
    onToggle: (key: string) => void;
    onCopy: (path: string) => void;
    /** Full steps (with config), needed to expand a `list` variable's field tree. */
    steps?: ApiStep[];
}

export function VariableItem({
    variable,
    isExpanded,
    onToggle,
    onCopy,
    steps = []
}: VariableItemProps) {
    const listTree = buildListVariableTree(variable, steps);
    const showExpand = isListType(variable.type) || listTree !== null;
    const variablePath = variable.alias ?? variable.key;

    return (
        <div className="space-y-1">
            {/* Main Variable Row */}
            <div
                className={cn(
                    "flex items-center gap-2 p-2 rounded-md hover:bg-accent group transition-colors",
                    isExpanded && "bg-accent/50"
                )}
            >
                {/* Expand Button */}
                {showExpand && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={() => { void onToggle(variable.key); }}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </Button>
                )}
                {/* Icon */}
                <div className="shrink-0">
                    {getVariableIcon(variable.type)}
                </div>
                {/* Variable Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-medium text-xs truncate font-mono">
                            {variablePath}
                        </span>
                        {variable.type && (
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 uppercase">
                                {variable.type.replace("_", " ")}
                            </Badge>
                        )}
                    </div>
                    {variable.label && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {variable.label}
                        </div>
                    )}
                </div>
                {/* Copy Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { void onCopy(variablePath); }}
                    title="Copy variable name"
                >
                    <Copy className="h-3 w-3" />
                </Button>
            </div>
            {/* Expanded List Inspector */}
            {showExpand && isExpanded && listTree && (
                <div className="ml-7 pl-2 border-l-2 border-muted">
                    <ListFieldTree nodes={listTree} onCopy={onCopy} />
                </div>
            )}
            {showExpand && isExpanded && !listTree && (
                <div className="ml-7 pl-2 border-l-2 border-muted">
                    {/* Placeholder for actual list data - in real usage, this would need list metadata */}
                    <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
                        <div className="space-y-1">
                            <div className="font-medium">List Properties:</div>
                            <div className="font-mono text-[10px] space-y-0.5 pl-2">
                                <div className="cursor-pointer hover:text-foreground" onClick={() => { void onCopy(`${variablePath}.count`); }}>
                                    .count - Number of rows
                                </div>
                                <div className="cursor-pointer hover:text-foreground" onClick={() => { void onCopy(`${variablePath}.rows`); }}>
                                    .rows - Array of row objects
                                </div>
                                <div className="cursor-pointer hover:text-foreground" onClick={() => { void onCopy(`${variablePath}.columns`); }}>
                                    .columns - Column metadata
                                </div>
                                <div className="cursor-pointer hover:text-foreground" onClick={() => { void onCopy(`${variablePath}.rows[0]`); }}>
                                    .rows[0] - First row (example)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

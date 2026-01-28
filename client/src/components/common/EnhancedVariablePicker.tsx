/**
 * Enhanced Variable Picker Component
 * Supports selecting variables and list properties (list.count, list.rows[0].column, etc.)
 */

import { Copy, ChevronRight, ChevronDown, ListIcon } from "lucide-react";
import React, { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type ApiWorkflowVariable } from "@/lib/vault-api";
import { useWorkflowVariables } from "@/lib/vault-hooks";

interface EnhancedVariablePickerProps {
  workflowId: string;
  onInsert: (path: string) => void;
  onCopy?: (path: string) => void;
  showListProperties?: boolean; // Show expandable list properties
}

export function EnhancedVariablePicker({
  workflowId,
  onInsert,
  onCopy,
  showListProperties = true,
}: EnhancedVariablePickerProps) {
  const { data: variables = [] } = useWorkflowVariables(workflowId);
  const { toast } = useToast();
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());

  // Group variables by section/page
  const grouped = useMemo(() => {
    const groups = new Map<string, ApiWorkflowVariable[]>();

    variables.forEach((variable) => {
      const sectionTitle = variable.sectionTitle || "Other";
      if (!groups.has(sectionTitle)) {
        groups.set(sectionTitle, []);
      }
      groups.get(sectionTitle)!.push(variable);
    });

    return Array.from(groups.entries());
  }, [variables]);

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    toast({
      title: "Copied",
      description: `Variable path "${path}" copied to clipboard`,
      duration: 2000,
    });
    if (onCopy) { onCopy(path); }
  };

  const isListType = (type: string) => {
    // Check if the type suggests a list/array
    return type === "query" || type === "read_table" || type === "list_tools" || type === "computed";
  };

  const toggleExpanded = (key: string) => {
    setExpandedVars((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (variables.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No variables available yet. Add questions to your pages to create variables.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Variables</h3>
          <p className="text-xs text-muted-foreground">
            Click to insert variable paths into your code
          </p>
        </div>

        {grouped.map(([sectionTitle, vars]) => (
          <div key={sectionTitle} className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {sectionTitle}
            </h4>
            <div className="space-y-1">
              {vars.map((variable) => {
                const isExpanded = expandedVars.has(variable.key);
                const showExpand = showListProperties && isListType(variable.type);
                const variablePath = variable.alias || variable.key;

                return (
                  <div key={variable.key} className="space-y-0.5">
                    {/* Main Variable Row */}
                    <div
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md hover:bg-accent group",
                        isExpanded && "bg-accent/50"
                      )}
                    >
                      {/* Expand Button (if list) */}
                      {showExpand && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 shrink-0"
                          onClick={() => { void toggleExpanded(variable.key); }}
                          title={isExpanded ? "Collapse" : "Expand list properties"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </Button>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {showExpand && <ListIcon className="h-3 w-3 text-muted-foreground" />}
                          <span className="font-medium text-sm truncate font-mono">
                            {variablePath}
                          </span>
                          {variable.type && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 uppercase">
                              {variable.type.replace("_", " ")}
                            </Badge>
                          )}
                        </div>
                        {variable.label && (
                          <div className="text-xs text-muted-foreground truncate pl-1">
                            {variable.label}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { void handleCopy(variablePath); }}
                          title="Copy path"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { void onInsert(variablePath); }}
                          title="Insert path"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded List Properties */}
                    {showExpand && isExpanded && (
                      <div className="ml-9 space-y-0.5 border-l-2 border-muted pl-2">
                        {/* .count property */}
                        <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 group/item">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {variablePath}.count
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              Number of rows in the list
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void handleCopy(`${variablePath}.count`); }}
                              title="Copy"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void onInsert(`${variablePath}.count`); }}
                              title="Insert"
                            >
                              <ChevronRight className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>

                        {/* .rows property */}
                        <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 group/item">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {variablePath}.rows
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              Array of row objects
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void handleCopy(`${variablePath}.rows`); }}
                              title="Copy"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void onInsert(`${variablePath}.rows`); }}
                              title="Insert"
                            >
                              <ChevronRight className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>

                        {/* .rows[0] example */}
                        <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 group/item">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {variablePath}.rows[0]
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              First row object (example)
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void handleCopy(`${variablePath}.rows[0]`); }}
                              title="Copy"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void onInsert(`${variablePath}.rows[0]`); }}
                              title="Insert"
                            >
                              <ChevronRight className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>

                        {/* .columns property */}
                        <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 group/item">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {variablePath}.columns
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              Column metadata array
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void handleCopy(`${variablePath}.columns`); }}
                              title="Copy"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => { void onInsert(`${variablePath}.columns`); }}
                              title="Insert"
                            >
                              <ChevronRight className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

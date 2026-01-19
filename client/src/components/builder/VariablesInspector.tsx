/**
 * Variables Inspector Panel
 * Shows all workflow variables with enhanced list inspection
 * Designed for Advanced Mode control room UX
 */
import { Search, Database, Code, Copy, ChevronDown, ChevronRight, Layers } from "lucide-react";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWorkflowVariables } from "@/lib/vault-hooks";
interface VariablesInspectorProps {
  workflowId: string;
  className?: string;
}
export function VariablesInspector({ workflowId, className }: VariablesInspectorProps) {
  const { data: variables = [] } = useWorkflowVariables(workflowId);
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("all");
  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    toast({
      title: "Copied",
      description: `Variable "${path}" copied to clipboard`,
      duration: 2000,
    });
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
  const isListType = (type: string) => {
    return type === "query" || type === "read_table" || type === "list_tools";
  };
  // Filter and group variables
  const filteredVariables = variables.filter((v) => {
    if (searchQuery && !v.alias?.toLowerCase().includes(searchQuery.toLowerCase()) && !v.label?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (activeTab === "all") {return true;}
    if (activeTab === "lists") {return isListType(v.type);}
    if (activeTab === "computed") {return v.type === "js_question" || v.type === "computed";}
    if (activeTab === "questions") {return !isListType(v.type) && v.type !== "js_question" && v.type !== "computed";}
    return true;
  });
  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    const section = variable.sectionTitle || "Other";
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(variable);
    return acc;
  }, {} as Record<string, typeof variables>);
  const getVariableIcon = (type: string) => {
    if (isListType(type)) {return <Database className="w-3.5 h-3.5 text-blue-500" />;}
    if (type === "js_question" || type === "computed") {return <Code className="w-3.5 h-3.5 text-purple-500" />;}
    return <Layers className="w-3.5 h-3.5 text-gray-500" />;
  };
  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          Variables Inspector
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Filters */}
        <div className="p-3 space-y-2 border-b bg-muted/20">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="questions" className="text-xs">Questions</TabsTrigger>
              <TabsTrigger value="lists" className="text-xs">Lists</TabsTrigger>
              <TabsTrigger value="computed" className="text-xs">Computed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search variables..."
              className="pl-8 h-8 text-xs"
              value={searchQuery}
              onChange={(e) => { void setSearchQuery(e.target.value); }}
            />
          </div>
        </div>
        {/* Variables List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            {variables.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No variables yet. Add questions or data blocks to create variables.
              </div>
            )}
            {Object.entries(groupedVariables).map(([sectionTitle, vars]) => (
              <div key={sectionTitle} className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-background/95 backdrop-blur py-1">
                  {sectionTitle}
                </h4>
                <div className="space-y-1">
                  {vars.map((variable) => {
                    const isExpanded = expandedVars.has(variable.key);
                    const showExpand = isListType(variable.type);
                    const variablePath = variable.alias || variable.key;
                    return (
                      <div key={variable.key} className="space-y-1">
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
                              onClick={() => { void toggleExpanded(variable.key); }}
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
                            onClick={() => { void handleCopy(variablePath); }}
                            title="Copy variable name"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {/* Expanded List Inspector */}
                        {showExpand && isExpanded && (
                          <div className="ml-7 pl-2 border-l-2 border-muted">
                            {/* Placeholder for actual list data - in real usage, this would need list metadata */}
                            <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
                              <div className="space-y-1">
                                <div className="font-medium">List Properties:</div>
                                <div className="font-mono text-[10px] space-y-0.5 pl-2">
                                  <div className="cursor-pointer hover:text-foreground" onClick={() => { void handleCopy(`${variablePath}.count`); }}>
                                    .count - Number of rows
                                  </div>
                                  <div className="cursor-pointer hover:text-foreground" onClick={() => { void handleCopy(`${variablePath}.rows`); }}>
                                    .rows - Array of row objects
                                  </div>
                                  <div className="cursor-pointer hover:text-foreground" onClick={() => { void handleCopy(`${variablePath}.columns`); }}>
                                    .columns - Column metadata
                                  </div>
                                  <div className="cursor-pointer hover:text-foreground" onClick={() => { void handleCopy(`${variablePath}.rows[0]`); }}>
                                    .rows[0] - First row (example)
                                  </div>
                                </div>
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
        {/* Quick Stats Footer */}
        <div className="p-2 border-t bg-muted/20 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>{filteredVariables.length} variable{filteredVariables.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-500" />
              {filteredVariables.filter(v => isListType(v.type)).length}
            </span>
            <span className="flex items-center gap-1">
              <Code className="w-3 h-3 text-purple-500" />
              {filteredVariables.filter(v => v.type === "js_question" || v.type === "computed").length}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
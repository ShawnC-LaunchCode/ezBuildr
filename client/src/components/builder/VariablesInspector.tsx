/**
 * Variables Inspector Panel
 * Shows all workflow variables with enhanced list inspection
 * Designed for Advanced Mode control room UX
 */
import { Search, Database, Code } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWorkflowVariables } from "@/lib/vault-hooks";

import { useFilteredVariables } from "./variables/useFilteredVariables";
import { VariableItem } from "./variables/VariableItem";

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

  const { groupedVariables, counts } = useFilteredVariables(variables, searchQuery, activeTab);

  const handleCopy = (path: string) => {
    void navigator.clipboard.writeText(path);
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
              onChange={(e) => { setSearchQuery(e.target.value); }}
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
                  {vars.map((variable) => (
                    <VariableItem
                      key={variable.key}
                      variable={variable}
                      isExpanded={expandedVars.has(variable.key)}
                      onToggle={toggleExpanded}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        {/* Quick Stats Footer */}
        <div className="p-2 border-t bg-muted/20 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>{counts.total} variable{counts.total !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-500" />
              {counts.lists}
            </span>
            <span className="flex items-center gap-1">
              <Code className="w-3 h-3 text-purple-500" />
              {counts.computed}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
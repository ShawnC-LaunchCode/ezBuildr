/**
 * VariableList Component
 * Displays workflow variables with Copy/Insert/Pin actions
 */

import { useState } from "react";
import { Copy, Plus, Pin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { DevPanelBus } from "@/lib/devpanelBus";
import { useDevPanel } from "@/store/devpanel";
import type { ApiWorkflowVariable } from "@/lib/vault-api";

interface VariableListProps {
  workflowId: string;
  variables: ApiWorkflowVariable[];
  isLoading?: boolean;
}

export function VariableList({ workflowId, variables, isLoading }: VariableListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { isPinned, togglePin } = useDevPanel();

  // Filter variables based on search query
  const filteredVariables = variables.filter((v) => {
    const searchText = searchQuery.toLowerCase();
    return (
      v.alias?.toLowerCase().includes(searchText) ||
      v.label.toLowerCase().includes(searchText) ||
      v.key.toLowerCase().includes(searchText)
    );
  });

  // Sort: pinned first, then alphabetically
  const sortedVariables = [...filteredVariables].sort((a, b) => {
    const aKey = a.alias || a.key;
    const bKey = b.alias || b.key;
    const aPinned = isPinned(workflowId, aKey);
    const bPinned = isPinned(workflowId, bKey);

    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return aKey.localeCompare(bKey);
  });

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      toast({
        title: "Copied",
        description: `Variable key "${key}" copied to clipboard`,
      });
    });
  };

  const handleInsert = (key: string) => {
    DevPanelBus.emitInsert(key);
  };

  const handlePin = (key: string) => {
    togglePin(workflowId, key);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading variables...
      </div>
    );
  }

  if (variables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
        <p>No variables available</p>
        <p className="text-xs mt-2">Add questions to your workflow to create variables</p>
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
        <div className="p-2 space-y-1">
          {sortedVariables.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">
              No variables match your search
            </div>
          ) : (
            sortedVariables.map((variable) => {
              const displayKey = variable.alias || variable.key;
              const pinned = isPinned(workflowId, displayKey);

              return (
                <div
                  key={variable.stepId}
                  className={cn(
                    "group flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors",
                    pinned && "bg-accent/50"
                  )}
                >
                  {/* Variable Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-medium truncate">
                      {displayKey}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {variable.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {variable.sectionTitle} • {variable.type}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleCopy(displayKey)}
                      title="Copy to clipboard"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleInsert(displayKey)}
                      title="Insert into editor"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7",
                        pinned && "text-primary opacity-100"
                      )}
                      onClick={() => handlePin(displayKey)}
                      title={pinned ? "Unpin" : "Pin"}
                    >
                      <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

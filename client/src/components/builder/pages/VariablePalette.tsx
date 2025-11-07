/**
 * Variable Palette Component
 * Lists available variables/aliases with insert and copy helpers
 */

import { useWorkflowVariables } from "@/lib/vault-hooks";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMemo } from "react";

interface VariablePaletteProps {
  workflowId: string;
  onInsert: (key: string) => void;
}

export function VariablePalette({ workflowId, onInsert }: VariablePaletteProps) {
  const { data: variables = [] } = useWorkflowVariables(workflowId);
  const { toast } = useToast();

  // Group variables by section/page
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof variables>();

    variables.forEach((variable) => {
      const sectionTitle = variable.sectionTitle || "Other";
      if (!groups.has(sectionTitle)) {
        groups.set(sectionTitle, []);
      }
      groups.get(sectionTitle)!.push(variable);
    });

    return Array.from(groups.entries());
  }, [variables]);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({
      title: "Copied",
      description: `Variable key "${key}" copied to clipboard`,
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
            Click to insert variable keys into your code
          </p>
        </div>

        {grouped.map(([sectionTitle, vars]) => (
          <div key={sectionTitle} className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {sectionTitle}
            </h4>
            <div className="space-y-1">
              {vars.map((variable) => (
                <div
                  key={variable.key}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-accent group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {variable.alias || variable.key}
                    </div>
                    {variable.alias && (
                      <div className="font-mono text-xs text-muted-foreground truncate">
                        {variable.key}
                      </div>
                    )}
                    {variable.label && (
                      <div className="text-xs text-muted-foreground truncate">
                        {variable.label}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(variable.key)}
                      title="Copy key"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onInsert(variable.key)}
                      title="Insert key"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

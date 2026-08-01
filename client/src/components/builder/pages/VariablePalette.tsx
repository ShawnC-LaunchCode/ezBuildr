/**
 * Variable Palette Component
 * Lists available variables/aliases with insert and copy helpers
 */

import { Copy, ChevronRight, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkflowSteps } from "@/hooks/api/useSteps";
import { useToast } from "@/hooks/use-toast";
import { type ApiStep, type ApiWorkflowVariable } from "@/lib/vault-api";
import { useWorkflowVariables } from "@/lib/vault-hooks";

import { ListFieldTree } from "../variables/ListFieldTree";
import { buildListVariableTree } from "../variables/listVariableTree";

interface VariablePaletteProps {
  workflowId: string;
  onInsert: (key: string) => void;
}

interface VariablePaletteRowProps {
  variable: ApiWorkflowVariable;
  steps: ApiStep[];
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onCopy: (key: string) => void;
  onInsert: (key: string) => void;
}

function VariablePaletteRow({ variable, steps, isExpanded, onToggleExpand, onCopy, onInsert }: VariablePaletteRowProps) {
  const listTree = buildListVariableTree(variable, steps);

  return (
    <div className="rounded-md hover:bg-accent group">
      <div className="flex items-center gap-2 p-2">
        {listTree ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 shrink-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${variable.alias ?? variable.key}` : `Expand ${variable.alias ?? variable.key}`}
            onClick={() => { onToggleExpand(variable.key); }}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm truncate">
              {variable.alias ?? variable.key}
            </span>
            {variable.type && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 uppercase">
                {variable.type.replace('_', ' ')}
              </Badge>
            )}
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
            onClick={() => { onCopy(variable.key); }}
            title="Copy key"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => { onInsert(variable.key); }}
            title="Insert key"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {listTree && isExpanded && (
        <div className="ml-7 pl-2 pb-2 border-l-2 border-muted">
          <ListFieldTree nodes={listTree} onCopy={onCopy} />
        </div>
      )}
    </div>
  );
}

export function VariablePalette({ workflowId, onInsert }: VariablePaletteProps) {
  const { data: variables = [] } = useWorkflowVariables(workflowId);
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Group variables by section/page
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof variables>();

    variables.forEach((variable) => {
      const sectionTitle = variable.sectionTitle ?? "Other";
      if (!groups.has(sectionTitle)) {
        groups.set(sectionTitle, []);
      }
      groups.get(sectionTitle)?.push(variable);
    });

    return Array.from(groups.entries());
  }, [variables]);

  const handleCopy = (key: string) => {
    void navigator.clipboard.writeText(key);
    toast({
      title: "Copied",
      description: `Variable key "${key}" copied to clipboard`,
    });
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
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
                <VariablePaletteRow
                  key={variable.key}
                  variable={variable}
                  steps={steps}
                  isExpanded={expandedKeys.has(variable.key)}
                  onToggleExpand={toggleExpanded}
                  onCopy={handleCopy}
                  onInsert={onInsert}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

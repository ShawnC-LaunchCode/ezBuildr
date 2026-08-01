/**
 * Recursive renderer for a List variable's field tree (LIST-7). Each level
 * manages its own expand/collapse state so a deep list doesn't dump every
 * field at once — only the level a user has explicitly opened is expanded.
 */
import { ChevronDown, ChevronRight, Copy, ListTree } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ListVariableNode } from "./listVariableTree";

interface ListFieldTreeProps {
  nodes: ListVariableNode[];
  onCopy: (snippet: string) => void;
  className?: string;
}

export function ListFieldTree({ nodes, onCopy, className }: ListFieldTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cn("space-y-0.5", className)}>
      {nodes.map((node) => {
        const isOpen = expanded.has(node.id);
        return (
          <div key={node.id}>
            <div className="flex items-center gap-1.5 py-0.5 group">
              {node.kind === "list" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 shrink-0"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${node.alias}` : `Expand ${node.alias}`}
                  onClick={() => { toggle(node.id); }}
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {node.kind === "list" && <ListTree className="h-3 w-3 text-blue-500 shrink-0" />}
              <span className="font-mono text-[11px] truncate">{node.alias}</span>
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 uppercase shrink-0">
                {node.kind === "list" ? "list" : node.fieldType}
              </Badge>
              <span className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Copy template syntax"
                onClick={() => { onCopy(node.templateSnippet); }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            {node.kind === "list" && isOpen && node.children && (
              <ListFieldTree nodes={node.children} onCopy={onCopy} className="ml-5 pl-2 border-l-2 border-muted" />
            )}
          </div>
        );
      })}
    </div>
  );
}

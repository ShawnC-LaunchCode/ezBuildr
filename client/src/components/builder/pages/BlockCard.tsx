/**
 * Block Card Component
 * Renders a card for Logic Blocks
 * Used in the inline page view
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Code2, Database, CheckCircle, GitBranch, Trash2, ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from "lucide-react";
import React from "react";

import { JSBlockEditor, type JSBlock } from "@/components/blocks/JSBlockEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { PageItem } from "@/lib/dnd";
import { cn } from "@/lib/utils";
import { type ApiBlock } from '@/lib/vault-api';
import { useDeleteBlock, useDeleteTransformBlock, useUpdateTransformBlock } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

// Narrowed prop type
interface BlockCardProps {
  item: Extract<PageItem, { kind: 'block' }>;
  workflowId: string;
  sectionId: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEnterNext?: () => void;
  onEdit?: () => void;
}

const BLOCK_TYPE_ICONS: Record<string, typeof Code2> = {
  prefill: Database,
  validate: CheckCircle,
  branch: GitBranch,
  js: Code2,
  read_table: ArrowRight,
  write: ArrowLeft,
  send_table: ArrowLeft,
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  prefill: "Prefill Data",
  validate: "Validate",
  branch: "Branch",
  js: "JS Transform",
  write: "Send Data to Table",
  send_table: "Send Data to Table",
  read_table: "Read from Table",
  external_send: "Send Data to API",
  list_tools: "List Tool",
};

// Helper to generate block summaries
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
function getBlockSummary(block: ApiBlock): string | null {
  try {
    const type = block.type as string; // Allow legacy types like send_table
    const config = block.config ?? {};

    if (type === 'write' || type === 'send_table') {
      const mode = config.mode === 'create' ? 'Insert' : config.mode === 'update' ? 'Update' : 'Upsert';
      const mappingCount = Array.isArray(config.columnMappings) ? config.columnMappings.length : 0;
      if (!mappingCount) { return null; }
      return `${mode} ${mappingCount} field${mappingCount === 1 ? '' : 's'}`;
    }

    if (type === 'read_table') {
      const columnCount = Array.isArray(config.columns) ? config.columns.length : undefined;
      const totalCount = typeof config.totalColumnCount === 'number' ? config.totalColumnCount : 0;

      if (columnCount === undefined || columnCount === null) {
        // All fields selected
        return `Retrieving all(${totalCount}) fields`;
      } else {
        // Specific fields selected
        return `Retrieving ${columnCount} field${columnCount === 1 ? '' : 's'}`;
      }
    }

    if (type === 'external_send') {
      const mappingCount = Array.isArray(config.payloadMappings) ? config.payloadMappings.length : 0;
      if (!mappingCount) { return null; }
      return `${mappingCount} field${mappingCount === 1 ? '' : 's'}`;
    }

    if (type === 'list_tools') {
      const parts: string[] = [];

      if (config.sourceListVar && config.outputListVar) {
        parts.push(`${config.sourceListVar} → ${config.outputListVar}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const filterCount = config.filters?.rules?.length || 0;
      if (filterCount > 0) {
        parts.push(`filters:${filterCount}`);
      }

      const sortCount = (config.sort as unknown[])?.length || 0;
      if (sortCount > 0) {
        parts.push(`sort:${sortCount}`);
      }

      if (config.limit !== undefined) {
        parts.push(`limit:${config.limit}`);
      }

      if (Array.isArray(config.select) && config.select.length > 0) {
        parts.push(`select:${config.select.length}`);
      }

      if (config.dedupe) {
        parts.push('dedupe');
      }

      return parts.length > 0 ? parts.join(' | ') : 'Configure list transformation';
    }
  } catch (e) {
    return null;
  }

  return null;
}

// eslint-disable-next-line complexity
export function BlockCard({ item, workflowId, sectionId: _sectionId, isExpanded = false, onToggleExpand, onEnterNext: _onEnterNext, onEdit }: BlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { selection, selectBlock } = useWorkflowBuilder();
  const deleteBlockMutation = useDeleteBlock();
  const deleteTransformBlockMutation = useDeleteTransformBlock();
  const updateTransformBlockMutation = useUpdateTransformBlock();
  const { toast } = useToast();

  const isSelected = selection?.type === "block" && selection.id === item.id;

  // Helper to check if read/write blocks are configured
  const isReadWriteConfigured = () => {
    const { type, config } = item.data;
    const typeStr = type as string;
    if (typeStr === 'read_table') {
      return !!(config?.tableId && config?.outputKey);
    }
    if (typeStr === 'write' || typeStr === 'send_table') {
      return !!(config?.tableId && config?.mode);
    }
    return true; // Other blocks considered configured by default for this styling purpose
  };

  const typeStr = item.data.type as string;
  const isReadTableOrWrite = ['read_table', 'write', 'send_table'].includes(typeStr);
  const isNotConfigured = !isReadWriteConfigured();

  const handleClick = () => {
    selectBlock(item.id);
    // For non-JS blocks, also open the editor dialog
    if (item.data.type !== "js" && onEdit) {
      onEdit();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Use different API for transform blocks (type === "js")
      if (item.data.type === "js") {
        await deleteTransformBlockMutation.mutateAsync({ id: item.id, workflowId });
      } else {
        await deleteBlockMutation.mutateAsync({ id: item.id, workflowId });
      }
      toast({
        title: "Logic block deleted",
        description: "Logic block removed from page",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete logic block",
        variant: "destructive",
      });
    }
  };

  const handleJSBlockChange = (updated: JSBlock) => {
    if (item.data.type === "js") {
      updateTransformBlockMutation.mutate({
        id: item.id,
        workflowId,
        name: updated.config?.name,
        code: updated.config?.code,
        inputKeys: updated.config?.inputKeys,
        outputKey: updated.config?.outputKey,
        timeoutMs: updated.config?.timeoutMs,
      });
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-shadow",
          isSelected && "ring-2 ring-primary",
          isReadTableOrWrite && isNotConfigured && !isSelected && "ring-2 ring-green-500 bg-green-50/50",
          isReadTableOrWrite && isNotConfigured && isSelected && "bg-green-50/30",
          isDragging && "opacity-50"
        )}
        onClick={handleClick}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <button
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Reorder block"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>

            {/* Icon and Collapse Button (stacked vertically) */}
            <div className="flex flex-col items-center gap-1">
              <div className="mt-0.5">
                {(() => {
                  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                  const Icon = BLOCK_TYPE_ICONS[item.data.type as string] || Code2;
                  return <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
                })()}
              </div>
              {!isReadTableOrWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label={isExpanded ? "Collapse block" : "Expand block"}
                  aria-expanded={isExpanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.();
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {item.data.type === "js" && item.data.config?.name
                  ? item.data.config.name
                  : (BLOCK_TYPE_LABELS[item.data.type as string] || item.data.type)}
              </div>
              {/* Block summary */}
              {getBlockSummary(item.data) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {getBlockSummary(item.data)}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {item.data.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {item.data.phase}
                </Badge>
                {item.data.type === "js" && item.data.config?.outputKey && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    → {item.data.config.outputKey}
                  </Badge>
                )}
                {!item.data.enabled && (
                  <span className="text-xs text-muted-foreground">Disabled</span>
                )}
              </div>
            </div>

            {/* Delete Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              aria-label="Delete block"
              onClick={(e) => { void handleDelete(e); }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Expanded Content - Block Editors */}
          {isExpanded && item.data.type === "js" && (
            <div className="mt-3 pt-3 border-t">
              <JSBlockEditor
                block={item.data as unknown as JSBlock}
                onChange={handleJSBlockChange}
                workflowId={workflowId}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

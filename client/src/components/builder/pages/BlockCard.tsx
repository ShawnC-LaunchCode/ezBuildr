/**
 * Block Card Component
 * Renders a card for Logic Blocks
 * Used in the inline page view
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Code2, Database, CheckCircle, GitBranch, Trash2, ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from "lucide-react";
import React, { useState } from "react";

import { JSBlockEditor } from "@/components/blocks/JSBlockEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { PageItem } from "@/lib/dnd";
import { cn } from "@/lib/utils";
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

const BLOCK_TYPE_ICONS: Record<string, any> = {
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
function getBlockSummary(block: any): string | null {
  try {
    if (block.type === 'write' || block.type === 'send_table') {
      const config = block.config || {};
      const mode = config.mode === 'create' ? 'Insert' : config.mode === 'update' ? 'Update' : 'Upsert';
      const mappingCount = config.columnMappings?.length || 0;
      if (!mappingCount) { return null; }
      return `${mode} ${mappingCount} field${mappingCount === 1 ? '' : 's'}`;
    }

    if (block.type === 'read_table') {
      const config = block.config || {};
      const columnCount = config.columns?.length;
      const totalCount = config.totalColumnCount || 0;

      if (columnCount === undefined || columnCount === null) {
        // All fields selected
        return `Retrieving all(${totalCount}) fields`;
      } else {
        // Specific fields selected
        return `Retrieving ${columnCount} field${columnCount === 1 ? '' : 's'}`;
      }
    }

    if (block.type === 'external_send') {
      const config = block.config || {};
      const mappingCount = config.payloadMappings?.length || 0;
      if (!mappingCount) { return null; }
      return `${mappingCount} field${mappingCount === 1 ? '' : 's'}`;
    }

    if (block.type === 'list_tools') {
      const config = block.config || {};
      const parts: string[] = [];

      if (config.sourceListVar && config.outputListVar) {
        parts.push(`${config.sourceListVar} → ${config.outputListVar}`);
      }

      const filterCount = config.filters?.rules?.length || 0;
      if (filterCount > 0) {
        parts.push(`filters:${filterCount}`);
      }

      const sortCount = config.sort?.length || 0;
      if (sortCount > 0) {
        parts.push(`sort:${sortCount}`);
      }

      if (config.limit !== undefined) {
        parts.push(`limit:${config.limit}`);
      }

      if (config.select && config.select.length > 0) {
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

export function BlockCard({ item, workflowId, sectionId, isExpanded = false, onToggleExpand, onEnterNext, onEdit }: BlockCardProps) {
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
    if (type === 'read_table') {
      return !!(config?.tableId && config?.outputKey);
    }
    if ((type as string) === 'write' || (type as string) === 'send_table') {
      return !!(config?.tableId && config?.mode);
    }
    return true; // Other blocks considered configured by default for this styling purpose
  };

  const isReadTableOrWrite = ['read_table', 'write', 'send_table'].includes((item.data as any).type);
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

  const handleJSBlockChange = (updated: any) => {
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
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Icon and Collapse Button (stacked vertically) */}
            <div className="flex flex-col items-center gap-1">
              <div className="mt-0.5">
                {(() => {
                  const Icon = BLOCK_TYPE_ICONS[item.data.type] || Code2;
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()}
              </div>
              {!isReadTableOrWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.();
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {item.data.type === "js" && item.data.config?.name
                  ? item.data.config.name
                  : (BLOCK_TYPE_LABELS[item.data.type] || item.data.type)}
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
              onClick={(e) => { void handleDelete(e); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Expanded Content - Block Editors */}
          {isExpanded && item.data.type === "js" && (
            <div className="mt-3 pt-3 border-t">
              <JSBlockEditor
                block={item.data}
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

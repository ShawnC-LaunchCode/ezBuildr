/**
 * Transform Blocks Panel - CRUD for JavaScript/Python transform blocks
 */

import { Plus } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import type { ApiTransformBlock } from "@/lib/vault-api";
import { useTransformBlocks } from "@/lib/vault-hooks";

import { TransformBlockCard } from "./transforms/TransformBlockCard";
import { TransformBlockEditorDialog } from "./transforms/TransformBlockEditorDialog";

export function TransformBlocksPanel({ workflowId }: { workflowId: string }) {
  const { data: blocks } = useTransformBlocks(workflowId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ApiTransformBlock | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Transform Blocks</h3>
          <p className="text-xs text-muted-foreground">JavaScript/Python code execution</p>
        </div>
        <Button size="sm" onClick={() => { setIsCreateOpen(true); }}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {blocks && blocks.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No transform blocks yet. Add blocks to transform data with custom code.
        </div>
      )}

      <div className="space-y-2">
        {blocks?.map((block) => (
          <TransformBlockCard key={block.id} block={block} workflowId={workflowId} onEdit={setEditingBlock} />
        ))}
      </div>

      <TransformBlockEditorDialog
        workflowId={workflowId}
        block={editingBlock}
        isOpen={isCreateOpen || !!editingBlock}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingBlock(null);
        }}
      />
    </div>
  );
}

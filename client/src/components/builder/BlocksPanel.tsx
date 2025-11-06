/**
 * Blocks Panel - CRUD for prefill/validate/branch blocks
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useBlocks, useCreateBlock, useDeleteBlock, useUpdateBlock } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { BlockType, BlockPhase } from "@/lib/vault-api";

export function BlocksPanel({ workflowId }: { workflowId: string }) {
  const { data: blocks } = useBlocks(workflowId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const { toast } = useToast();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Workflow Blocks</h3>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {blocks && blocks.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No blocks yet. Add blocks to prefill data, validate inputs, or branch logic.
        </div>
      )}

      <div className="space-y-2">
        {blocks?.map((block) => (
          <BlockCard key={block.id} block={block} workflowId={workflowId} onEdit={setEditingBlock} />
        ))}
      </div>

      <BlockEditor
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

function BlockCard({ block, workflowId, onEdit }: { block: any; workflowId: string; onEdit: (block: any) => void }) {
  const deleteMutation = useDeleteBlock();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: block.id, workflowId });
      toast({ title: "Success", description: "Block deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete block", variant: "destructive" });
    }
  };

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onEdit(block)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {block.type}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {block.phase}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Order: {block.order} • {block.enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BlockEditor({
  workflowId,
  block,
  isOpen,
  onClose,
}: {
  workflowId: string;
  block: any | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const createMutation = useCreateBlock();
  const updateMutation = useUpdateBlock();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type: block?.type || ("prefill" as BlockType),
    phase: block?.phase || ("onRunStart" as BlockPhase),
    config: block?.config || {},
    enabled: block?.enabled ?? true,
    order: block?.order ?? 0,
    sectionId: block?.sectionId || null,
  });

  const handleSave = async () => {
    try {
      if (block) {
        await updateMutation.mutateAsync({ id: block.id, workflowId, ...formData });
        toast({ title: "Success", description: "Block updated" });
      } else {
        await createMutation.mutateAsync({ workflowId, ...formData });
        toast({ title: "Success", description: "Block created" });
      }
      onClose();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save block", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{block ? "Edit Block" : "Create Block"}</DialogTitle>
          <DialogDescription>Configure block behavior and runtime phase</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(v: BlockType) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefill">Prefill</SelectItem>
                  <SelectItem value="validate">Validate</SelectItem>
                  <SelectItem value="branch">Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Phase</Label>
              <Select
                value={formData.phase}
                onValueChange={(v: BlockPhase) => setFormData({ ...formData, phase: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onRunStart">On Run Start</SelectItem>
                  <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                  <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                  <SelectItem value="onNext">On Next</SelectItem>
                  <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Config (JSON)</Label>
            <Textarea
              value={JSON.stringify(formData.config, null, 2)}
              onChange={(e) => {
                try {
                  const config = JSON.parse(e.target.value);
                  setFormData({ ...formData, config });
                } catch {}
              }}
              rows={10}
              className="font-mono text-xs"
              placeholder={`Example for prefill:\n{\n  "mode": "static",\n  "staticMap": { "key": "value" }\n}`}
            />
          </div>

          <div className="space-y-2">
            <Label>Order</Label>
            <Input
              type="number"
              value={formData.order}
              onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            {block ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

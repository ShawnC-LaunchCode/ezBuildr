/**
 * Blocks Panel - CRUD for prefill/validate/branch blocks
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { useBlocks, useCreateBlock, useDeleteBlock, useUpdateBlock, useWorkflowMode } from "@/lib/vault-hooks";
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
import { getAvailableBlockTypes, type Mode } from "@/lib/mode";
import type { BlockType, BlockPhase } from "@/lib/vault-api";
import { JSBlockEditor } from "@/components/blocks/JSBlockEditor";
import { QueryBlockEditor } from "@/components/blocks/QueryBlockEditor";
import { WriteBlockEditor } from "@/components/blocks/WriteBlockEditor";
import { ExternalSendBlockEditor } from "@/components/blocks/ExternalSendBlockEditor";

export function BlocksPanel({ workflowId }: { workflowId: string }) {
  const { data: blocks } = useBlocks(workflowId);
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const { toast } = useToast();

  const mode = workflowMode?.mode || 'easy';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Workflow Blocks</h3>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        {mode === 'easy' ? (
          <p>Easy mode: Block types available: prefill, validate, branch</p>
        ) : (
          <p>Advanced mode: All block types available including JS Transform</p>
        )}
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
        mode={mode}
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
  mode,
  isOpen,
  onClose,
}: {
  workflowId: string;
  block: any | null;
  mode: Mode;
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

  // Reset form data when dialog opens or block changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        type: block?.type || ("prefill" as BlockType),
        phase: block?.phase || ("onRunStart" as BlockPhase),
        config: block?.config || {},
        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,
        sectionId: block?.sectionId || null,
      });
    }
  }, [isOpen, block]);

  const availableBlockTypes = getAvailableBlockTypes(mode);

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
                  {availableBlockTypes.includes('query') && (
                    <SelectItem value="query">Query Data</SelectItem>
                  )}
                  {availableBlockTypes.includes('write') && (
                    <SelectItem value="write">Save Data</SelectItem>
                  )}
                  {availableBlockTypes.includes('external_send') && (
                    <SelectItem value="external_send">Send Data</SelectItem>
                  )}
                  {availableBlockTypes.includes('js') && (
                    <SelectItem value="js">JS Transform</SelectItem>
                  )}
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

          {formData.type === 'js' ? (
            <div className="space-y-2">
              <JSBlockEditor
                block={{ ...block, config: formData.config, type: formData.type }}
                onChange={(updated) => setFormData({ ...formData, config: updated.config })}
                workflowId={workflowId}
              />
            </div>
          ) : formData.type === 'query' ? (
            <QueryBlockEditor
              workflowId={workflowId}
              config={formData.config}
              onChange={(config) => setFormData({ ...formData, config })}
            />
          ) : formData.type === 'write' ? (
            <WriteBlockEditor
              workflowId={workflowId}
              config={formData.config}
              onChange={(config) => setFormData({ ...formData, config })}
            />
          ) : formData.type === 'external_send' ? (
            <ExternalSendBlockEditor
              workflowId={workflowId}
              config={formData.config}
              onChange={(config) => setFormData({ ...formData, config })}
            />
          ) : (
            <div className="space-y-2">
              <Label>Config (JSON)</Label>
              {mode === 'easy' && (
                <p className="text-xs text-muted-foreground mb-1">
                  Easy mode: JSON configuration is available for all block types.
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-1">
                Use step IDs or aliases to reference variables. Aliases make configs more readable.
              </p>
              <Textarea
                value={JSON.stringify(formData.config, null, 2)}
                onChange={(e) => {
                  try {
                    const config = JSON.parse(e.target.value);
                    setFormData({ ...formData, config });
                  } catch { }
                }}
                rows={10}
                className="font-mono text-xs"
                placeholder={`Example for prefill:\n{\n  "mode": "static",\n  "staticMap": { "firstName": "John" }\n}`}
              />
            </div>
          )}

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

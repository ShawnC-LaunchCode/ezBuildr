/**
 * Transform Blocks Panel - CRUD for JavaScript/Python transform blocks
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { useTransformBlocks, useCreateTransformBlock, useDeleteTransformBlock, useUpdateTransformBlock, useTestTransformBlock, useWorkflowVariables } from "@/lib/vault-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { TransformBlockLanguage } from "@/lib/vault-api";

export function TransformBlocksPanel({ workflowId }: { workflowId: string }) {
  const { data: blocks } = useTransformBlocks(workflowId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const { toast } = useToast();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Transform Blocks</h3>
          <p className="text-xs text-muted-foreground">JavaScript/Python code execution</p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
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

      <TransformBlockEditor
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

function TransformBlockCard({ block, workflowId, onEdit }: { block: any; workflowId: string; onEdit: (block: any) => void }) {
  const deleteMutation = useDeleteTransformBlock();
  const { toast } = useToast();
  const { data: variables = [] } = useWorkflowVariables(workflowId);

  const getVariableDisplayName = (key: string) => {
    const variable = variables.find((v) => v.key === key);
    return variable?.alias || key;
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: block.id, workflowId });
      toast({ title: "Success", description: "Transform block deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete block", variant: "destructive" });
    }
  };

  const displayInputKeys = block.inputKeys.map(getVariableDisplayName).join(", ") || "none";

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onEdit(block)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{block.name}</span>
              <Badge variant="outline" className="text-xs">
                {block.language}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Phase: {block.phase || "onSectionSubmit"}</div>
              <div>Inputs: {displayInputKeys}</div>
              <div>Output: {block.outputKey}</div>
              <div>Order: {block.order} • {block.enabled ? "Enabled" : "Disabled"}</div>
            </div>
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

function TransformBlockEditor({
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
  const createMutation = useCreateTransformBlock();
  const updateMutation = useUpdateTransformBlock();
  const testMutation = useTestTransformBlock();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: block?.name || "",
    language: block?.language || ("javascript" as TransformBlockLanguage),
    phase: block?.phase || "onSectionSubmit",
    code: block?.code || "",
    inputKeys: block?.inputKeys || [],
    outputKey: block?.outputKey || "",
    timeoutMs: block?.timeoutMs || 1000,
    enabled: block?.enabled ?? true,
    order: block?.order ?? 0,
  });

  const [inputKeysText, setInputKeysText] = useState(block?.inputKeys?.join(", ") || "");
  const [testData, setTestData] = useState("{}");
  const [testResult, setTestResult] = useState<any>(null);

  // Reset form data when dialog opens or block changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: block?.name || "",
        language: block?.language || ("javascript" as TransformBlockLanguage),
        phase: block?.phase || "onSectionSubmit",
        code: block?.code || "",
        inputKeys: block?.inputKeys || [],
        outputKey: block?.outputKey || "",
        timeoutMs: block?.timeoutMs || 1000,
        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,
      });
      setInputKeysText(block?.inputKeys?.join(", ") || "");
      setTestData("{}");
      setTestResult(null);
    }
  }, [isOpen, block]);

  const handleSave = async () => {
    try {
      // Parse input keys from comma-separated string
      const inputKeys = inputKeysText
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const data = {
        ...formData,
        inputKeys,
      };

      if (block) {
        await updateMutation.mutateAsync({ id: block.id, workflowId, ...data });
        toast({ title: "Success", description: "Transform block updated" });
      } else {
        await createMutation.mutateAsync({ workflowId, ...data });
        toast({ title: "Success", description: "Transform block created" });
      }
      onClose();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save block", variant: "destructive" });
    }
  };

  const handleTest = async () => {
    if (!block?.id) {
      toast({ title: "Info", description: "Save the block first before testing", variant: "default" });
      return;
    }

    try {
      const parsedData = JSON.parse(testData);
      const result = await testMutation.mutateAsync({ id: block.id, testData: parsedData });
      setTestResult(result);

      if (result.success) {
        toast({ title: "Test Successful", description: "Check output below" });
      } else {
        toast({ title: "Test Failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast({ title: "Invalid JSON", description: "Test data must be valid JSON", variant: "destructive" });
      } else {
        toast({ title: "Test Error", description: "Failed to test block", variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{block ? "Edit Transform Block" : "Create Transform Block"}</DialogTitle>
          <DialogDescription>Write JavaScript or Python code to transform workflow data</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Calculate Total"
              />
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select
                value={formData.language}
                onValueChange={(v: TransformBlockLanguage) => setFormData({ ...formData, language: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Execution Phase</Label>
            <Select
              value={formData.phase}
              onValueChange={(v) => setFormData({ ...formData, phase: v })}
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
            <p className="text-xs text-muted-foreground">When this block should execute</p>
          </div>

          <div className="space-y-2">
            <Label>Code</Label>
            <Textarea
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              rows={12}
              className="font-mono text-xs"
              placeholder={
                formData.language === "javascript"
                  ? "// Input values available as variables\n// Return the output value\nreturn inputValue1 + inputValue2;"
                  : "# Input values available as variables\n# Return the output value\nreturn input_value1 + input_value2"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Input Keys (comma-separated)</Label>
              <Input
                value={inputKeysText}
                onChange={(e) => setInputKeysText(e.target.value)}
                placeholder="e.g., firstName, lastName"
              />
              <p className="text-xs text-muted-foreground">Variables available in your code</p>
            </div>

            <div className="space-y-2">
              <Label>Output Key</Label>
              <Input
                value={formData.outputKey}
                onChange={(e) => setFormData({ ...formData, outputKey: e.target.value })}
                placeholder="e.g., fullName"
              />
              <p className="text-xs text-muted-foreground">Where the result will be stored</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                value={formData.timeoutMs}
                onChange={(e) => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) || 1000 })}
                min={100}
                max={3000}
              />
              <p className="text-xs text-muted-foreground">100-3000ms</p>
            </div>

            <div className="space-y-2">
              <Label>Order</Label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Enabled</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
                <span className="text-sm text-muted-foreground">
                  {formData.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {block && (
            <div className="space-y-2 pt-4 border-t">
              <Label>Test Block</Label>
              <div className="flex gap-2">
                <Textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  rows={4}
                  className="font-mono text-xs flex-1"
                  placeholder='{"inputKey1": "value1", "inputKey2": "value2"}'
                />
                <Button type="button" variant="outline" onClick={handleTest} disabled={testMutation.isPending}>
                  <Play className="w-3 h-3 mr-1" />
                  Test
                </Button>
              </div>
              {testResult && (
                <div className="mt-2">
                  <Label className="text-xs">Result:</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
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

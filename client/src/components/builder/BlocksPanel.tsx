/**
 * Blocks Panel - Unified CRUD for all block types
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, Info, Database, Save, Send, Code, Play, CheckCircle, GitBranch, GripVertical, Copy, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBlocks, useCreateBlock, useDeleteBlock, useUpdateBlock, useWorkflowMode, useTransformBlocks, useCreateTransformBlock, useUpdateTransformBlock, useDeleteTransformBlock } from "@/lib/vault-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getAvailableBlockTypes, type Mode } from "@/lib/mode";
import type { BlockType, BlockPhase } from "@/lib/vault-api";
import { JSBlockEditor } from "@/components/blocks/JSBlockEditor";
import { QueryBlockEditor } from "@/components/blocks/QueryBlockEditor";
import { WriteBlockEditor } from "@/components/blocks/WriteBlockEditor";
import { ExternalSendBlockEditor } from "@/components/blocks/ExternalSendBlockEditor";

// Combine regular blocks and transform blocks for display
type UniversalBlock = {
  id: string;
  type: BlockType | 'transform'; // 'transform' is our internal type for JS/Python blocks from the other hook
  displayType: string;
  title: string;
  phase: string;
  order: number;
  enabled: boolean;
  raw: any; // The original block object
  source: 'regular' | 'transform';
};

export function BlocksPanel({ workflowId }: { workflowId: string }) {
  const { data: blocks } = useBlocks(workflowId);
  const { data: transformBlocks } = useTransformBlocks(workflowId);
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const mode = workflowMode?.mode || 'easy';

  // Merge and normalize blocks
  const universalBlocks: UniversalBlock[] = [
    ...(blocks || []).map((b: any) => ({
      id: b.id,
      type: b.type as any,
      displayType: b.type,
      title: getBlockLabel(b.type),
      phase: b.phase,
      order: b.order || 0,
      enabled: b.enabled,
      raw: b,
      source: 'regular' as const
    })),
    ...(transformBlocks || []).map((b: any) => ({
      id: b.id,
      type: 'transform' as const,
      displayType: b.language === 'python' ? 'python' : 'js',
      title: b.name || 'Transform Script',
      phase: b.phase || 'onSectionSubmit',
      order: b.order || 0,
      enabled: b.enabled,
      raw: b,
      source: 'transform' as const
    }))
  ].sort((a, b) => a.order - b.order);

  // Filter blocks based on tab and search
  const filteredBlocks = universalBlocks.filter(block => {
    // Search filter
    if (searchQuery && !block.title.toLowerCase().includes(searchQuery.toLowerCase()) && !block.displayType.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Tab filter
    if (activeTab === "all") return true;
    if (activeTab === "logic") return ['branch', 'validate', 'transform', 'js'].includes(block.type) || block.type === 'transform';
    if (activeTab === "data") return ['prefill', 'query', 'write'].includes(block.type);
    if (activeTab === "output") return ['external_send'].includes(block.type);
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      <div className="p-4 border-b space-y-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Workflow Blocks
          </h3>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1">
            <Plus className="w-3 h-3" />
            Add Block
          </Button>
        </div>

        <div className="space-y-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="logic">Logic</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="output">Output</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search blocks..."
              className="pl-8 h-8 text-xs bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredBlocks.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {searchQuery ? "No matching blocks found." : "No blocks found in this category."}
          </div>
        )}

        {filteredBlocks.map((block) => (
          <UniversalBlockCard
            key={block.id}
            block={block}
            workflowId={workflowId}
            onEdit={setEditingBlock}
          />
        ))}
      </div>

      <BlockEditor
        workflowId={workflowId}
        block={editingBlock} // Pass full universal block for editing
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

function UniversalBlockCard({ block, workflowId, onEdit }: { block: UniversalBlock; workflowId: string; onEdit: (b: UniversalBlock) => void }) {
  const deleteBlockMutation = useDeleteBlock();
  const deleteTransformMutation = useDeleteTransformBlock();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      if (block.source === 'regular') {
        await deleteBlockMutation.mutateAsync({ id: block.id, workflowId });
      } else {
        await deleteTransformMutation.mutateAsync({ id: block.id, workflowId });
      }
      toast({ title: "Success", description: "Block deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete block", variant: "destructive" });
    }
  };

  const getBlockStyles = (type: string, displayType: string) => {
    if (type === 'transform') return "bg-block-logic border-block-logic-border text-block-logic-foreground";
    switch (displayType) {
      case 'query': return "bg-block-read border-block-read-border text-block-read-foreground";
      case 'write': return "bg-block-write border-block-write-border text-block-write-foreground";
      case 'external_send': return "bg-block-action border-block-action-border text-block-action-foreground";
      case 'js': return "bg-block-logic border-block-logic-border text-block-logic-foreground";
      case 'branch': return "bg-amber-50 border-amber-200 text-amber-900";
      case 'validate': return "bg-red-50 border-red-200 text-red-900";
      default: return "bg-card border-border text-card-foreground";
    }
  };

  const getBlockIcon = (type: string, displayType: string) => {
    if (type === 'transform') return <Code className="w-4 h-4" />;
    switch (displayType) {
      case 'query': return <Database className="w-4 h-4" />;
      case 'write': return <Save className="w-4 h-4" />;
      case 'external_send': return <Send className="w-4 h-4" />;
      case 'js': return <Code className="w-4 h-4" />;
      case 'prefill': return <Play className="w-4 h-4" />;
      case 'validate': return <CheckCircle className="w-4 h-4" />;
      case 'branch': return <GitBranch className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const styles = getBlockStyles(block.type, block.displayType);

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all group border-l-4",
        styles.replace('bg-', 'hover:bg-opacity-80 ').replace('border-', 'border-l-')
      )}
      onClick={() => onEdit(block)}
    >
      <div className={cn("flex items-center gap-3 p-3 text-sm", styles)}>
        <GripVertical className="w-4 h-4 opacity-50 cursor-grab" />

        <div className="p-2 bg-background/50 rounded-md backdrop-blur-sm border shadow-sm">
          {getBlockIcon(block.type, block.displayType)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{block.title}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-background/30 border-current opacity-70">
              {block.phase}
            </Badge>
            {!block.enabled && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">Disabled</Badge>
            )}
            {block.type === 'transform' && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-indigo-100 text-indigo-700 border-indigo-200">
                {block.displayType}
              </Badge>
            )}
          </div>
          <div className="text-xs opacity-80 truncate font-mono mt-0.5">
            Block #{block.order} • ID: {block.id.slice(0, 8)}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 rounded-md p-0.5 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Block Label Helper
function getBlockLabel(type: string) {
  switch (type) {
    case 'query': return 'Read Data';
    case 'write': return 'Save Data';
    case 'external_send': return 'Send Data';
    case 'js': return 'JS Transform';
    case 'prefill': return 'Prefill';
    case 'validate': return 'Validate';
    case 'branch': return 'Branch';
    default: return type;
  }
}

// Editor Component
function BlockEditor({
  workflowId,
  block,
  mode,
  isOpen,
  onClose,
}: {
  workflowId: string;
  block: UniversalBlock | null;
  mode: Mode;
  isOpen: boolean;
  onClose: () => void;
}) {
  const createBlockMutation = useCreateBlock();
  const updateBlockMutation = useUpdateBlock();
  const createTransformMutation = useCreateTransformBlock();
  const updateTransformMutation = useUpdateTransformBlock();
  const { toast } = useToast();

  // Determine initial state
  const isTransform = block?.source === 'transform' || (block === null && false); // Default new to regular, toggle later?

  // We need a unified form state that can handle both
  const [formData, setFormData] = useState<any>({
    // Common
    phase: block?.phase || "onRunStart",
    enabled: block?.enabled ?? true,
    order: block?.order ?? 0,

    // Regular Block
    type: (block?.source === 'regular' ? block.type : 'prefill'),
    config: block?.raw?.config || {},

    // Transform Block
    name: block?.raw?.name || "",
    language: block?.raw?.language || "javascript",
    code: block?.raw?.code || "",
    inputKeys: block?.raw?.inputKeys || [],
    outputKey: block?.raw?.outputKey || "",
    timeoutMs: block?.raw?.timeoutMs || 1000,
  });

  // Keep track of which "Mode" of creation we are in (Regular vs Transform)
  // If editing, lock to source. If new, allow switch.
  const [creationMode, setCreationMode] = useState<'regular' | 'transform'>(block?.source || 'regular');

  useEffect(() => {
    if (isOpen) {
      const source = block?.source || 'regular';
      setCreationMode(source);
      setFormData({
        phase: block?.phase || "onRunStart",
        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,
        type: (source === 'regular' ? block?.type : 'prefill'),
        config: block?.raw?.config || {},
        name: block?.raw?.name || "",
        language: block?.raw?.language || "javascript",
        code: block?.raw?.code || "",
        inputKeys: block?.raw?.inputKeys || [],
        outputKey: block?.raw?.outputKey || "",
        timeoutMs: block?.raw?.timeoutMs || 1000,
      });
    }
  }, [isOpen, block]);

  const handleSave = async () => {
    try {
      if (creationMode === 'regular') {
        const data = {
          type: formData.type,
          phase: formData.phase,
          config: formData.config,
          enabled: formData.enabled || true,
          order: Number(formData.order) || 0,
          sectionId: null // We might want to support sectionId later
        };

        if (block && block.source === 'regular') {
          await updateBlockMutation.mutateAsync({ id: block.id, workflowId, ...data });
        } else {
          await createBlockMutation.mutateAsync({ workflowId, ...data });
        }
      } else {
        // Transform
        const data = {
          name: formData.name,
          language: formData.language,
          phase: formData.phase,
          code: formData.code,
          inputKeys: formData.inputKeys,
          outputKey: formData.outputKey,
          timeoutMs: formData.timeoutMs,
          enabled: formData.enabled || true,
          order: Number(formData.order) || 0,
        };

        if (block && block.source === 'transform') {
          await updateTransformMutation.mutateAsync({ id: block.id, workflowId, ...data });
        } else {
          await createTransformMutation.mutateAsync({ workflowId, ...data });
        }
      }

      toast({ title: "Success", description: "Block saved successfully." });
      onClose();
    } catch (e) {
      toast({ title: "Error", description: "Failed to save block.", variant: "destructive" });
    }
  };

  const availableBlockTypes = getAvailableBlockTypes(mode);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{block ? `Edit ${block.title}` : "Add New Block"}</DialogTitle>
          <DialogDescription>
            {creationMode === 'regular' ? "Configure a standard workflow block." : "Configure a custom code transformation."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Top Controls: Type Selection (Only if creating new) */}
          {!block && (
            <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
              <Label>Block Category:</Label>
              <div className="flex gap-2">
                <Button
                  variant={creationMode === 'regular' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreationMode('regular')}
                >
                  Standard Block
                </Button>
                <Button
                  variant={creationMode === 'transform' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreationMode('transform')}
                  disabled={mode === 'easy'} // Transform blocks only in advanced? Or just hidden?
                >
                  Code Transform
                </Button>
              </div>
              {mode === 'easy' && creationMode === 'regular' && (
                <span className="text-xs text-muted-foreground ml-2">Code transforms are an Advanced Mode feature.</span>
              )}
            </div>
          )}

          {/* Configuration Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Settings */}
            <div className="space-y-4">
              {creationMode === 'regular' ? (
                <div className="space-y-3">
                  <Label>Block Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v, config: {} })} // Reset config on type change
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prefill">Prefill</SelectItem>
                      <SelectItem value="validate">Validate</SelectItem>
                      <SelectItem value="branch">Branch</SelectItem>
                      {availableBlockTypes.includes('query') && <SelectItem value="query">Query Data</SelectItem>}
                      {availableBlockTypes.includes('write') && <SelectItem value="write">Save Data</SelectItem>}
                      {availableBlockTypes.includes('external_send') && <SelectItem value="external_send">Send Data</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Language</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(v) => setFormData({ ...formData, language: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="pt-2">
                    <Label>Block Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Calculate Risk Score"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Execution Phase</Label>
                <Select value={formData.phase} onValueChange={(v) => setFormData({ ...formData, phase: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onRunStart">On Run Start</SelectItem>
                    <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                    <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                    <SelectItem value="onNext">On Next</SelectItem>
                    <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">When should this block run?</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Order</Label>
                  <Input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                  />
                </div>
                <div className="space-y-2 pt-8">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">Enabled</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Editor */}
            <div className="border-l pl-6">
              <Label className="mb-2 block">Configuration</Label>

              {creationMode === 'regular' ? (
                <>
                  {/* Render specific editors based on type */}
                  {formData.type === 'query' ? (
                    <QueryBlockEditor workflowId={workflowId} config={formData.config} onChange={(c) => setFormData({ ...formData, config: c })} />
                  ) : formData.type === 'write' ? (
                    <WriteBlockEditor workflowId={workflowId} config={formData.config} onChange={(c) => setFormData({ ...formData, config: c })} />
                  ) : formData.type === 'external_send' ? (
                    <ExternalSendBlockEditor workflowId={workflowId} config={formData.config} onChange={(c) => setFormData({ ...formData, config: c })} />
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        value={JSON.stringify(formData.config, null, 2)}
                        onChange={(e) => {
                          try { setFormData({ ...formData, config: JSON.parse(e.target.value) }) } catch (e) { }
                        }}
                        className="font-mono text-xs h-[300px]"
                        placeholder="{}"
                      />
                      <p className="text-xs text-muted-foreground">JSON Configuration for {formData.type}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full">
                  {/* Reuse JSBlockEditor Logic? 
                          The JSBlockEditor component expects a block object. 
                          We can wrap it or manually build the UI here. 
                          JSBlockEditor is quite complex (Variables palette, testing). 
                          Ideally we reuse it.
                      */}
                  <JSBlockEditor
                    workflowId={workflowId}
                    block={{
                      config: {
                        name: formData.name,
                        code: formData.code,
                        inputKeys: formData.inputKeys,
                        outputKey: formData.outputKey,
                        timeoutMs: formData.timeoutMs,
                      }
                    }}
                    onChange={(updated) => {
                      setFormData({
                        ...formData,
                        name: updated.config.name,
                        code: updated.config.code,
                        inputKeys: updated.config.inputKeys,
                        outputKey: updated.config.outputKey,
                        timeoutMs: updated.config.timeoutMs
                      })
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Block</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

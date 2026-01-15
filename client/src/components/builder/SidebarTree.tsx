/**
 * Sidebar Tree - Drag-and-drop page/question hierarchy
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, ChevronDown, ChevronRight, FileText, Blocks, Code, FileCheck, Sparkles, Database, Save, Send, GitBranch, Play, CheckCircle, Info, Lock, Zap, Settings, Trash2 } from "lucide-react";
import React, { useState } from "react";

import { LogicIndicator } from "@/components/logic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UI_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useSections, useSteps, useCreateSection, useCreateStep, useReorderSections, useReorderSteps, useWorkflowMode, useBlocks, useTransformBlocks, useWorkflow, useCreateBlock, useDeleteStep, useDeleteBlock } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { AddSnipDialog } from "./AddSnipDialog";
import { AiAssistantDialog } from "./ai/AiAssistantDialog";
import { BlockEditorDialog, type UniversalBlock } from "./BlockEditorDialog";
import { SectionSettingsDialog } from "./SectionSettingsDialog";
import { DocumentStatusPanel } from "./sidebar/DocumentStatusPanel";



export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { data: workflow } = useWorkflow(workflowId);
  const { data: sections } = useSections(workflowId);
  const { data: transformBlocks } = useTransformBlocks(workflowId);
  const mode = workflow?.modeOverride || 'easy';
  const { data: blocks } = useBlocks(workflowId);
  const createSectionMutation = useCreateSection();
  const createStepMutation = useCreateStep();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [editingSection, setEditingSection] = useState<any>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isSectionSettingsOpen, setIsSectionSettingsOpen] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showSnipDialog, setShowSnipDialog] = useState(false);

  // Group blocks by section
  const blocksBySection = (blocks || []).reduce((acc: Record<string, any[]>, block: any) => {
    if (block.sectionId) {
      if (!acc[block.sectionId]) {acc[block.sectionId] = [];}
      acc[block.sectionId].push({ ...block, source: 'regular' });
    }
    return acc;
  }, {});

  // We don't have sectionId for transform blocks easily available in current API mock/usage potentially?
  // If they don't have sectionId, we might not be able to map them easily. 
  // Assuming they might be mapped by logic or assume they are global if not mapped.
  // For now, let's just map regular blocks which have explicit sectionId.

  const handleCreateSection = async () => {
    const order = sections?.length || 0;
    await createSectionMutation.mutateAsync({
      workflowId,
      title: `${UI_LABELS.PAGE} ${order + 1}`,
      order,
    });
  };

  const handleCreateFinalDocumentsSection = async () => {
    const order = sections?.length || 0;
    const section = await createSectionMutation.mutateAsync({
      workflowId,
      title: "Final Documents",
      order,
      config: {
        finalBlock: true,
        templates: [],
        screenTitle: "Your Completed Documents",
        markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
        advanced: {}
      }
    });

    // Create the system step for this section
    await createStepMutation.mutateAsync({
      sectionId: section.id,
      type: "final_documents",
      title: "Final Documents",
      description: null,
      required: false,
      alias: "final_documents",
      options: null,
      order: 0,
      config: {},
    });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
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
    <div className="h-full flex flex-col">
      <div className="p-4 border-b space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {UI_LABELS.ADD_PAGE}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={handleCreateSection}>
              <FileText className="w-4 h-4 mr-2" />
              Regular Page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCreateFinalDocumentsSection}>
              <FileCheck className="w-4 h-4 mr-2" />
              Final Documents Section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>


        {/* AI Assistant Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
          onClick={() => setShowAiDialog(true)}
        >
          <Sparkles className="w-3 h-3 mr-2" />
          Edit with AI
        </Button>

        {/* Add Snip Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => setShowSnipDialog(true)}
        >
          <Plus className="w-3 h-3 mr-2" />
          Add Snip
        </Button>
      </div>

      {mode === 'easy' && workflow?.projectId && (
        <DocumentStatusPanel workflowId={workflowId} projectId={workflow.projectId} />
      )}

      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4 animate-in fade-in duration-500">
              <div className="p-3 bg-indigo-50 rounded-full mb-3 ring-4 ring-indigo-50/50">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <h4 className="font-medium text-sm text-foreground mb-1">Start Building</h4>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Pages are the main steps of your workflow. Add one to begin.
              </p>
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-indigo-200"></div>
                <Button onClick={handleCreateSection} size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add First Page
                </Button>
              </div>
            </div>
          )}
          {sections?.map((section) => (
            <SectionItem
              key={section.id}
              section={section}
              workflowId={workflowId}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              mode={mode}
              blocks={blocksBySection[section.id] || []}
              onEditBlock={(rawBlock) => {
                // Transform raw block to UniversalBlock format
                const universalBlock: UniversalBlock = {
                  id: rawBlock.id,
                  type: rawBlock.type,
                  phase: rawBlock.phase,
                  order: rawBlock.order,
                  enabled: rawBlock.enabled,
                  raw: rawBlock,
                  source: 'regular',
                  title: rawBlock.name || undefined,
                  displayType: rawBlock.type,
                };
                setEditingBlock(universalBlock);
                setIsBlockEditorOpen(true);
              }}
              onEditSection={() => {
                setEditingSection(section);
                setIsSectionSettingsOpen(true);
              }}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Block Editor Dialog */}
      <BlockEditorDialog
        workflowId={workflowId}
        block={editingBlock}
        mode={mode as any}
        isOpen={isBlockEditorOpen}
        onClose={() => {
          setIsBlockEditorOpen(false);
          setEditingBlock(null);
        }}
      />

      {/* Section Settings Dialog */}
      <SectionSettingsDialog
        workflowId={workflowId}
        section={editingSection}
        isOpen={isSectionSettingsOpen}
        onClose={() => {
          setIsSectionSettingsOpen(false);
          setEditingSection(null);
        }}
        mode={mode as any}
      />

      <AiAssistantDialog
        workflowId={workflowId}
        open={showAiDialog}
        onOpenChange={setShowAiDialog}
      />

      <AddSnipDialog
        workflowId={workflowId}
        open={showSnipDialog}
        onOpenChange={setShowSnipDialog}
      />
    </div>
  );
}

function SectionItem({
  section,
  workflowId,
  isExpanded,
  onToggle,
  mode,
  blocks,
  onEditBlock,
  onEditSection,
}: {
  section: any;
  workflowId: string;
  isExpanded: boolean;
  onToggle: () => void;
  mode: string;
  blocks: any[];
  onEditBlock: (block: any) => void;
  onEditSection: () => void;
}) {
  const { data: steps } = useSteps(section.id);
  const createStepMutation = useCreateStep();
  const createBlockMutation = useCreateBlock();
  const { selection, selectSection } = useWorkflowBuilder();

  const isSelected = selection?.type === "section" && selection.id === section.id;

  // Check if this is a Final Documents section
  const isFinalSection = (section.config)?.finalBlock === true;

  // Don't show page-level required pill based on questions - only show if page is conditional
  const isPageConditional = !!section.visibleIf;

  const handleCreateStep = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Prevent adding questions to Final Documents sections
    if (isFinalSection) {
      return;
    }

    const order = steps?.length || 0;
    await createStepMutation.mutateAsync({
      sectionId: section.id,
      type: "short_text",
      title: `${UI_LABELS.QUESTION} ${order + 1}`,
      description: null,
      required: false,
      alias: null,
      options: null,
      order,
      config: {},
    });
    if (!isExpanded) {onToggle();}
  };

  const handleCreateLogicBlock = async (type: "write" | "read_table" | "list_tools" | "external_send") => {
    const order = blocks?.length || 0;
    // Default configs for quick-add
    const config = type === "write" ? {
      dataSourceId: "",
      tableId: "",
      mode: "upsert",
      columnMappings: []
    } : type === "read_table" ? {
      tableId: "",
      outputKey: "list_data",
      filters: []
    } : {};

    await createBlockMutation.mutateAsync({
      workflowId,
      type,
      phase: "onSectionSubmit", // Default to submit phase for flow
      sectionId: section.id,
      config,
      enabled: true,
      order
    });
    if (!isExpanded) {onToggle();}
  };

  // Combine steps and blocks for display (if advanced mode or simple mode interoperability)
  // In Advanced: Show items interleaved based on something? 
  // Blocks have 'order'. Steps have 'order'. They might clash.
  // For now, let's just show blocks AT THE TOP of the section (like pre-fill) or BOTTOM?
  // Blocks have phases. 
  // onSectionEnter -> Top
  // onSectionSubmit -> Bottom

  const topBlocks = blocks.filter(b => b.phase === 'onSectionEnter' || b.phase === 'onRunStart');
  const bottomBlocks = blocks.filter(b => !topBlocks.includes(b)); // Submit, Next, etc.

  return (
    <div className="mb-1">
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-md hover:bg-sidebar-accent/50 cursor-pointer group transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        )}
        onClick={() => selectSection(section.id)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectSection(section.id);
          }
          if (e.key === 'ArrowRight') {
            if (!isExpanded) {onToggle();}
          }
          if (e.key === 'ArrowLeft') {
            if (isExpanded) {onToggle();}
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </Button>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm truncate">{section.title}</span>
        {isFinalSection && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            <FileCheck className="h-3 w-3 mr-1" />
            Final
          </Badge>
        )}
        {isPageConditional && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
            Conditional
          </Badge>
        )}
        <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEditSection();
            }}
            title="Page Settings"
          >
            <Settings className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
        {!isFinalSection && (
          <div className={cn(
            "flex gap-1",
            mode === 'easy' ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCreateStep}
              title="Add Question"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {(mode === 'easy' || mode === 'advanced') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Add Logic"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Zap className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleCreateLogicBlock("write");
                  }}>
                    <Save className="w-3 h-3 mr-2" />
                    Send Data to Table
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleCreateLogicBlock("read_table");
                  }}>
                    <Database className="w-3 h-3 mr-2" />
                    Read from Table
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleCreateLogicBlock("external_send");
                  }}>
                    <Send className="w-3 h-3 mr-2" />
                    Send Data to API
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleCreateLogicBlock("list_tools");
                  }}>
                    <Sparkles className="w-3 h-3 mr-2" />
                    List Tools
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4 pl-2 mt-1 space-y-0.5 border-l border-sidebar-border/50">

          {/* Top Blocks (Prefill/Enter) */}
          {topBlocks.map((block: any) => (
            <BlockTreeItem key={block.id} block={block} mode={mode} onEdit={() => onEditBlock(block)} workflowId={workflowId} />
          ))}

          {/* Steps */}
          {steps && steps.length > 0 &&
            steps
              // Filter out system steps and questions in final sections
              .filter((step) => {
                // Hide final_documents system steps (they're just metadata)
                if (step.type === 'final_documents') {return false;}
                // Hide any other questions that might exist in final sections (orphaned data)
                if (isFinalSection) {return false;}
                return true;
              })
              .map((step) => (
                <StepItem key={step.id} step={step} sectionId={section.id} />
              ))}

          {/* Bottom Blocks (Submit/Next) */}
          {bottomBlocks.map((block: any) => (
            <BlockTreeItem key={block.id} block={block} mode={mode} onEdit={() => onEditBlock(block)} workflowId={workflowId} />
          ))}

        </div>
      )}
    </div>
  );
}

function StepItem({ step, sectionId }: { step: any; sectionId: string }) {
  const { selection, selectStep } = useWorkflowBuilder();
  const deleteStepMutation = useDeleteStep();
  const isSelected = selection?.type === "step" && selection.id === step.id;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this question?")) {
      deleteStepMutation.mutate({ id: step.id, sectionId });
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 py-1.5 px-1.5 rounded-md hover:bg-sidebar-accent/50 cursor-pointer text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 group",
        isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      )}
      onClick={() => selectStep(step.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectStep(step.id);
        }
      }}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />

      {/* Required pill before question */}
      {step.required && (
        <Badge variant="destructive" className="text-[8px] h-3.5 px-1 font-medium shrink-0 mt-0.5">
          Req
        </Badge>
      )}

      <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />

      {/* Question title and alias stacked */}
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs leading-tight">{step.title || "(Untitled)"}</div>
        {step.alias && (
          <div className="text-[10px] text-muted-foreground/70 font-mono ml-2 truncate leading-tight mt-0.5">
            {step.alias}
          </div>
        )}
      </div>

      {step.visibleIf && (
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium shrink-0 mt-0.5">
          Cond
        </Badge>
      )}

      {/* Delete Action (Hover) */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          title="Delete Question"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function BlockTreeItem({ block, mode, onEdit, workflowId }: { block: any, mode: string, onEdit: () => void, workflowId: string }) {
  // Unlock editing for supported blocks in Easy Mode
  const isEditableInEasyMode = ['read_table', 'write', 'send_table', 'external_send', 'list_tools', 'query'].includes(block.type);
  const isLocked = mode === 'easy' && !isEditableInEasyMode;
  const deleteBlockMutation = useDeleteBlock();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this block?")) {
      deleteBlockMutation.mutate({ id: block.id, workflowId });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'prefill': return <Play className="w-3 h-3" />;
      case 'validate': return <CheckCircle className="w-3 h-3" />;
      case 'branch': return <GitBranch className="w-3 h-3" />;
      case 'query': case 'read_table': return <Database className="w-3 h-3" />;
      case 'write': case 'send_table': return <Save className="w-3 h-3" />;
      case 'external_send': return <Send className="w-3 h-3" />;
      case 'js': case 'transform': return <Code className="w-3 h-3" />;
      case 'list_tools': return <Sparkles className="w-3 h-3" />;
      default: return <Blocks className="w-3 h-3" />;
    }
  }

  const getLabel = (type: string) => {
    switch (type) {
      case 'read_table': return 'Read Table';
      case 'write': case 'send_table': return 'Send to Table';
      case 'external_send': return 'Send to API';
      case 'list_tools': return 'List Tool';
      case 'js': return 'Script';
      case 'query': return 'Read Data (Legacy)';
      default: return type;
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-1.5 rounded-md text-sm transition-colors border border-transparent group",
        isLocked
          ? "bg-slate-50 text-slate-400 cursor-not-allowed italic"
          : "hover:bg-sidebar-accent/50 cursor-pointer text-slate-600"
      )}
      onClick={(e) => {
        if (!isLocked) {
          e.stopPropagation();
          onEdit();
        }
      }}
      title={isLocked ? "This block type is only editable in Advanced Mode" : block.type}
    >
      <div className={cn("w-3 mr-1", isLocked ? "opacity-50" : "")}>
        {isLocked ? <Lock className="w-3 h-3" /> : <GripVertical className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div className={cn(isLocked ? "opacity-50" : "text-indigo-500")}>
        {getIcon(block.type)}
      </div>
      <span className="flex-1 truncate text-xs font-medium">
        {getLabel(block.type)}
        {block.phase === 'onSectionEnter' ? ' (Enter)' : ' (Submit)'}
      </span>

      {/* Delete Action (Hover) */}
      {!isLocked && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            title="Delete Block"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

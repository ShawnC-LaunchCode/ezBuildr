/**
 * Sidebar Tree - Drag-and-drop page/question hierarchy
 */

import { useState } from "react";
import { Plus, GripVertical, ChevronDown, ChevronRight, FileText, Blocks, Code, FileCheck, Sparkles, Database, Save, Send, GitBranch, Play, CheckCircle, Info, Lock } from "lucide-react";
import { useSections, useSteps, useCreateSection, useCreateStep, useReorderSections, useReorderSteps, useWorkflowMode, useBlocks, useTransformBlocks, useWorkflow } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LogicIndicator } from "@/components/logic";
import { BlocksPanel } from "./BlocksPanel";
import { DocumentStatusPanel } from "./sidebar/DocumentStatusPanel";
import { AiAssistantDialog } from "./ai/AiAssistantDialog";
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
import { UI_LABELS } from "@/lib/labels";

export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { data: sections } = useSections(workflowId);
  const { data: blocks } = useBlocks(workflowId);
  const { data: transformBlocks } = useTransformBlocks(workflowId);
  const { data: workflow } = useWorkflow(workflowId);
  const createSectionMutation = useCreateSection();
  const createStepMutation = useCreateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const mode = workflowMode?.mode || 'easy';
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showBlocksDialog, setShowBlocksDialog] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);

  // Group blocks by section
  const blocksBySection = (blocks || []).reduce((acc: Record<string, any[]>, block: any) => {
    if (block.sectionId) {
      if (!acc[block.sectionId]) acc[block.sectionId] = [];
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
        {/* Blocks button - Hidden in Easy Mode */}
        {mode === 'advanced' && (
          <div className="flex gap-2">
            <Button onClick={() => setShowBlocksDialog(true)} size="sm" variant="outline" className="flex-1">
              <Blocks className="w-3 h-3 mr-1" />
              Blocks
            </Button>
          </div>
        )}

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
            />
          ))}
        </div>
      </ScrollArea>

      {/* Blocks Dialog */}
      <Dialog open={showBlocksDialog} onOpenChange={setShowBlocksDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Blocks</DialogTitle>
          </DialogHeader>
          <BlocksPanel workflowId={workflowId} />
        </DialogContent>
      </Dialog>

      <AiAssistantDialog
        workflowId={workflowId}
        open={showAiDialog}
        onOpenChange={setShowAiDialog}
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
}: {
  section: any;
  workflowId: string;
  isExpanded: boolean;
  onToggle: () => void;
  mode: string;
  blocks: any[];
}) {
  const { data: steps } = useSteps(section.id);
  const createStepMutation = useCreateStep();
  const { selection, selectSection } = useWorkflowBuilder();

  const isSelected = selection?.type === "section" && selection.id === section.id;

  // Check if this is a Final Documents section
  const isFinalSection = (section.config as any)?.finalBlock === true;

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
    if (!isExpanded) onToggle();
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
            if (!isExpanded) onToggle();
          }
          if (e.key === 'ArrowLeft') {
            if (isExpanded) onToggle();
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
        <LogicIndicator
          visibleIf={section.visibleIf}
          variant="icon"
          size="sm"
          elementType="section"
        />
        {!isFinalSection && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={handleCreateStep}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4 pl-2 mt-1 space-y-0.5 border-l border-sidebar-border/50">

          {/* Top Blocks (Prefill/Enter) */}
          {topBlocks.map(block => (
            <BlockTreeItem key={block.id} block={block} mode={mode} />
          ))}

          {/* Steps */}
          {steps && steps.length > 0 &&
            steps
              // Filter out system steps and questions in final sections
              .filter((step) => {
                // Hide final_documents system steps (they're just metadata)
                if (step.type === 'final_documents') return false;
                // Hide any other questions that might exist in final sections (orphaned data)
                if (isFinalSection) return false;
                return true;
              })
              .map((step) => (
                <StepItem key={step.id} step={step} sectionId={section.id} />
              ))}

          {/* Bottom Blocks (Submit/Next) */}
          {bottomBlocks.map(block => (
            <BlockTreeItem key={block.id} block={block} mode={mode} />
          ))}

        </div>
      )}
    </div>
  );
}

function StepItem({ step, sectionId }: { step: any; sectionId: string }) {
  const { selection, selectStep } = useWorkflowBuilder();
  const isSelected = selection?.type === "step" && selection.id === step.id;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-1.5 rounded-md hover:bg-sidebar-accent/50 cursor-pointer text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
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
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      <FileText className="h-3 w-3 text-muted-foreground" />
      <span className="flex-1 truncate">{step.title}</span>
      <LogicIndicator
        visibleIf={step.visibleIf}
        variant="icon"
        size="sm"
        elementType="question"
      />
      {step.alias && (
        <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0">
          {step.alias}
        </Badge>
      )}
      {step.required && <span className="text-xs text-destructive">*</span>}
    </div>
  );
}

function BlockTreeItem({ block, mode }: { block: any, mode: string }) {
  // In Easy Mode, show as read-only/locked
  const isLocked = mode === 'easy';

  const getIcon = (type: string) => {
    switch (type) {
      case 'prefill': return <Play className="w-3 h-3" />;
      case 'validate': return <CheckCircle className="w-3 h-3" />;
      case 'branch': return <GitBranch className="w-3 h-3" />;
      case 'query': return <Database className="w-3 h-3" />;
      case 'write': return <Save className="w-3 h-3" />;
      case 'external_send': return <Send className="w-3 h-3" />;
      case 'js': case 'transform': return <Code className="w-3 h-3" />;
      default: return <Blocks className="w-3 h-3" />;
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-1.5 rounded-md text-sm transition-colors border border-transparent",
        isLocked
          ? "bg-slate-50 text-slate-400 cursor-not-allowed italic"
          : "hover:bg-sidebar-accent/50 cursor-pointer text-slate-600"
      )}
      title={isLocked ? "Switch to Advanced Mode to edit this logic block" : block.type}
    >
      {/* Indent slightly deeper to show it's 'attached' to section logic? Or same level? Same level seems fine. */}
      <div className={cn("w-3 mr-1", isLocked ? "opacity-50" : "")}>
        {isLocked ? <Lock className="w-3 h-3" /> : <GripVertical className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div className={cn(isLocked ? "opacity-50" : "text-indigo-500")}>
        {getIcon(block.type)}
      </div>
      <span className="flex-1 truncate text-xs font-medium">
        {block.type === 'js' ? 'Script' : block.type}
        {block.phase === 'onSectionEnter' ? ' (Enter)' : ' (Submit)'}
      </span>
    </div>
  )
}

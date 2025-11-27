/**
 * Sidebar Tree - Drag-and-drop page/question hierarchy
 */

import { useState } from "react";
import { Plus, GripVertical, ChevronDown, ChevronRight, FileText, Blocks, Code, FileCheck } from "lucide-react";
import { useSections, useSteps, useCreateSection, useCreateStep, useReorderSections, useReorderSteps, useWorkflowMode } from "@/lib/vault-hooks";
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
import { TransformBlocksPanel } from "./TransformBlocksPanel";
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
  const createSectionMutation = useCreateSection();
  const createStepMutation = useCreateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const mode = workflowMode?.mode || 'easy';
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showBlocksDialog, setShowBlocksDialog] = useState(false);
  const [showTransformDialog, setShowTransformDialog] = useState(false);

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
        {/* Blocks and Transform buttons - Hidden in Easy Mode */}
        {mode === 'advanced' && (
          <div className="flex gap-2">
            <Button onClick={() => setShowBlocksDialog(true)} size="sm" variant="outline" className="flex-1">
              <Blocks className="w-3 h-3 mr-1" />
              Blocks
            </Button>
            <Button onClick={() => setShowTransformDialog(true)} size="sm" variant="outline" className="flex-1">
              <Code className="w-3 h-3 mr-1" />
              Transform
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections?.map((section) => (
            <SectionItem
              key={section.id}
              section={section}
              workflowId={workflowId}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Blocks Dialog */}
      <Dialog open={showBlocksDialog} onOpenChange={setShowBlocksDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Blocks</DialogTitle>
          </DialogHeader>
          <BlocksPanel workflowId={workflowId} />
        </DialogContent>
      </Dialog>

      {/* Transform Blocks Dialog */}
      <Dialog open={showTransformDialog} onOpenChange={setShowTransformDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transform Blocks</DialogTitle>
          </DialogHeader>
          <TransformBlocksPanel workflowId={workflowId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionItem({
  section,
  workflowId,
  isExpanded,
  onToggle,
}: {
  section: any;
  workflowId: string;
  isExpanded: boolean;
  onToggle: () => void;
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
    });
    if (!isExpanded) onToggle();
  };

  return (
    <div className="mb-1">
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer group",
          isSelected && "bg-accent"
        )}
        onClick={() => selectSection(section.id)}
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

      {isExpanded && steps && steps.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {steps
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
        "flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer text-sm",
        isSelected && "bg-accent"
      )}
      onClick={() => selectStep(step.id)}
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

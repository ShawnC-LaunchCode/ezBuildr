/**
 * Sidebar Tree - Drag-and-drop section/step hierarchy
 */

import { useState } from "react";
import { Plus, GripVertical, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useSections, useSteps, useCreateSection, useCreateStep, useReorderSections, useReorderSteps } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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

export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { data: sections } = useSections(workflowId);
  const createSectionMutation = useCreateSection();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const handleCreateSection = async () => {
    const order = sections?.length || 0;
    await createSectionMutation.mutateAsync({
      workflowId,
      title: `Section ${order + 1}`,
      order,
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
      <div className="p-4 border-b">
        <Button onClick={handleCreateSection} size="sm" className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Section
        </Button>
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

  const handleCreateStep = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const order = steps?.length || 0;
    await createStepMutation.mutateAsync({
      sectionId: section.id,
      type: "short_text",
      title: `Step ${order + 1}`,
      description: null,
      required: false,
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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={handleCreateStep}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {isExpanded && steps && steps.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {steps.map((step) => (
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
      {step.required && <span className="text-xs text-destructive">*</span>}
    </div>
  );
}

/**
 * Canvas Editor - Section/Step editor in center pane
 */

import { Workflow } from "lucide-react";

import { useSections, useStep } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { SectionCanvas } from "./canvas/SectionCanvas";
import { StepCanvas } from "./canvas/StepCanvas";

export function CanvasEditor({ workflowId }: { workflowId: string }) {
  const { selection } = useWorkflowBuilder();
  const { data: sections } = useSections(workflowId);
  const { data: step } = useStep(selection && selection.type === "step" ? selection.id : "");

  if (!selection) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Workflow className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Selection</h3>
          <p className="text-muted-foreground text-sm">
            Select a section or step from the sidebar to edit its properties
          </p>
        </div>
      </div>
    );
  }

  if (selection.type === "section") {
    const section = sections?.find((s) => s.id === selection.id);
    if (!section) { return null; }
    return <SectionCanvas section={section} workflowId={workflowId} />;
  }

  if (selection.type === "step" && step) {
    return <StepCanvas step={step} sectionId={step.sectionId} />;
  }

  return null;
}

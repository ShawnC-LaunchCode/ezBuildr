/**
 * LogicPanel - Panel for editing visibility conditions on sections and steps
 *
 * This component wraps the LogicBuilder and handles API calls to persist changes.
 */

import { Info } from "lucide-react";
import React, { useMemo } from "react";

import { LogicBuilder } from "@/components/logic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSections, useUpdateSection, useStep, useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";


interface LogicPanelProps {
  workflowId: string;
  selection: {
    type: "step" | "section" | "block" | "workflow";
    id: string;
  } | null;
}

export function LogicPanel({ workflowId, selection }: LogicPanelProps) {
  const { toast } = useToast();

  // Fetch all sections (usually already cached)
  const { data: sections, isLoading: sectionsLoading } = useSections(workflowId);

  // Find the selected section from the cached list
  const section = useMemo(() => {
    if (selection?.type !== "section" || !sections) {return null;}
    return sections.find((s) => s.id === selection.id) || null;
  }, [selection, sections]);

  // Fetch step data when selection is a step
  const { data: step, isLoading: stepLoading } = useStep(
    selection?.type === "step" ? selection.id : undefined
  );

  // Update mutations
  const updateSectionMutation = useUpdateSection();
  const updateStepMutation = useUpdateStep();

  // Handle no selection
  if (!selection) {
    return (
      <div className="p-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select a section or question to configure its visibility conditions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle block or workflow selection
  if (selection.type === "block" || selection.type === "workflow") {
    return (
      <div className="p-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Visibility conditions can only be set on sections and questions.
            Select a section or question to configure visibility.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle section selection
  if (selection.type === "section") {
    if (sectionsLoading || !section) {
      return (
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </div>
      );
    }

    const handleSectionLogicChange = (expression: ConditionExpression) => {
      updateSectionMutation.mutate(
        {
          id: section.id,
          workflowId: section.workflowId,
          visibleIf: expression,
        },
        {
          onSuccess: () => {
            toast({
              title: "Visibility updated",
              description: "Section visibility conditions have been saved.",
            });
          },
          onError: (error) => {
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to save visibility conditions",
              variant: "destructive",
            });
          },
        }
      );
    };

    return (
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Section: {section.title}</h3>
          <p className="text-xs text-muted-foreground">
            Configure when this section should be visible
          </p>
        </div>
        <LogicBuilder
          workflowId={workflowId}
          elementId={section.id}
          elementType="section"
          value={(section.visibleIf as ConditionExpression) || null}
          onChange={handleSectionLogicChange}
          isSaving={updateSectionMutation.isPending}
        />
      </div>
    );
  }

  // Handle step selection
  if (selection.type === "step") {
    if (stepLoading || !step) {
      return (
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </div>
      );
    }

    const handleStepLogicChange = (expression: ConditionExpression) => {
      updateStepMutation.mutate(
        {
          id: step.id,
          sectionId: step.sectionId,
          visibleIf: expression,
        },
        {
          onSuccess: () => {
            toast({
              title: "Visibility updated",
              description: "Question visibility conditions have been saved.",
            });
          },
          onError: (error) => {
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to save visibility conditions",
              variant: "destructive",
            });
          },
        }
      );
    };

    return (
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Question: {step.title}</h3>
          <p className="text-xs text-muted-foreground">
            Configure when this question should be visible
          </p>
        </div>
        <LogicBuilder
          workflowId={workflowId}
          elementId={step.id}
          elementType="step"
          value={(step.visibleIf as ConditionExpression) || null}
          onChange={handleStepLogicChange}
          isSaving={updateStepMutation.isPending}
        />
      </div>
    );
  }

  return null;
}

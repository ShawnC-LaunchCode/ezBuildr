/**
 * LogicPanel - Panel for editing visibility conditions on pages and steps
 *
 * This component wraps the LogicBuilder and handles API calls to persist changes.
 */

import { Info } from "lucide-react";
import { useMemo } from "react";

import { LogicBuilder } from "@/components/logic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { usePages, useUpdatePage, useStep, useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";


interface LogicPanelProps {
  workflowId: string;
  selection: {
    type: "step" | "page" | "block" | "workflow";
    id: string;
  } | null;
}

export function LogicPanel({ workflowId, selection }: LogicPanelProps) {
  const { toast } = useToast();

  // Fetch all pages (usually already cached)
  const { data: pages, isLoading: pagesLoading } = usePages(workflowId);

  // Find the selected page from the cached list
  const page = useMemo(() => {
    if (selection?.type !== "page" || !pages) {return null;}
    return pages.find((s) => s.id === selection.id) ?? null;
  }, [selection, pages]);

  // Fetch step data when selection is a step
  const { data: step, isLoading: stepLoading } = useStep(
    selection?.type === "step" ? selection.id : undefined
  );

  // Update mutations
  const updatePageMutation = useUpdatePage();
  const updateStepMutation = useUpdateStep();

  // Handle no selection
  if (!selection) {
    return (
      <div className="p-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select a page or question to configure its visibility conditions.
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
            Visibility conditions can only be set on pages and questions.
            Select a page or question to configure visibility.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle page selection
  if (selection.type === "page") {
    if (pagesLoading || !page) {
      return (
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </div>
      );
    }

    const handlePageLogicChange = (expression: ConditionExpression) => {
      updatePageMutation.mutate(
        {
          id: page.id,
          workflowId: page.workflowId,
          visibleIf: expression,
        },
        {
          onSuccess: () => {
            toast({
              title: "Visibility updated",
              description: "Page visibility conditions have been saved.",
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
          <h3 className="text-sm font-semibold">Page: {page.title}</h3>
          <p className="text-xs text-muted-foreground">
            Configure when this page should be visible
          </p>
        </div>
        <LogicBuilder
          workflowId={workflowId}
          elementId={page.id}
          elementType="page"
          value={(page.visibleIf as ConditionExpression) ?? null}
          onChange={handlePageLogicChange}
          isSaving={updatePageMutation.isPending}
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
          pageId: step.pageId,
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
          value={(step.visibleIf as ConditionExpression) ?? null}
          onChange={handleStepLogicChange}
          isSaving={updateStepMutation.isPending}
        />
      </div>
    );
  }

  return null;
}

/**
 * PageLogicSheet - Sheet (slide-out panel) for editing page visibility logic
 *
 * Wraps the LogicBuilder in a Sheet component for page-level visibility configuration.
 * Opens from the page card gear menu.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import type { ApiPage } from "@/lib/vault-api";
import { useUpdatePage } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";


import { LogicBuilder } from "./LogicBuilder";

interface PageLogicSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The page being edited */
  page: ApiPage;
  /** The workflow ID */
  workflowId: string;
}

export function PageLogicSheet({
  open,
  onOpenChange,
  page,
  workflowId,
}: PageLogicSheetProps) {
  const { toast } = useToast();
  const updatePageMutation = useUpdatePage();

  const handleLogicChange = (expression: ConditionExpression) => {
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
            description:
              error instanceof Error
                ? error.message
                : "Failed to save visibility conditions",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" data-testid="page-logic-sheet">
        <SheetHeader className="mb-6">
          <SheetTitle>Page Visibility</SheetTitle>
          <SheetDescription>
            Configure when &quot;{page.title}&quot; should be visible based on answers to other questions.
          </SheetDescription>
        </SheetHeader>

        <LogicBuilder
          workflowId={workflowId}
          elementId={page.id}
          elementType="page"
          value={(page.visibleIf as ConditionExpression) ?? null}
          onChange={handleLogicChange}
          isSaving={updatePageMutation.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}

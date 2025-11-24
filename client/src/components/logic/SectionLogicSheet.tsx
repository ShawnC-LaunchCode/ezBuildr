/**
 * SectionLogicSheet - Sheet (slide-out panel) for editing section visibility logic
 *
 * Wraps the LogicBuilder in a Sheet component for section-level visibility configuration.
 * Opens from the section/page card gear menu.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { LogicBuilder } from "./LogicBuilder";
import { useUpdateSection } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import type { ConditionExpression } from "@shared/types/conditions";
import type { ApiSection } from "@/lib/vault-api";

interface SectionLogicSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The section being edited */
  section: ApiSection;
  /** The workflow ID */
  workflowId: string;
}

export function SectionLogicSheet({
  open,
  onOpenChange,
  section,
  workflowId,
}: SectionLogicSheetProps) {
  const { toast } = useToast();
  const updateSectionMutation = useUpdateSection();

  const handleLogicChange = (expression: ConditionExpression) => {
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
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Page Visibility</SheetTitle>
          <SheetDescription>
            Configure when "{section.title}" should be visible based on answers to other questions.
          </SheetDescription>
        </SheetHeader>

        <LogicBuilder
          workflowId={workflowId}
          elementId={section.id}
          elementType="section"
          value={(section.visibleIf as ConditionExpression) || null}
          onChange={handleLogicChange}
          isSaving={updateSectionMutation.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * ConfirmMoveWorkflowModal - Confirmation dialog for moving workflow to project
 * PR3: Modal implementation
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmMoveWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  targetName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmMoveWorkflowModal({
  open,
  onOpenChange,
  workflowName,
  targetName,
  onConfirm,
  isLoading = false,
}: ConfirmMoveWorkflowModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move Workflow?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to move{" "}
              <span className="font-semibold text-foreground">&quot;{workflowName}&quot;</span>{" "}
              to{" "}
              <span className="font-semibold text-foreground">{targetName}</span>?
            </p>
            <p className="text-sm text-muted-foreground">
              You can move it again later if needed.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? "Moving..." : "Move Workflow"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

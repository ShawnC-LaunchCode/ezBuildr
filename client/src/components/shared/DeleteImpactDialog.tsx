/**
 * Delete Impact Dialog (ICW2-13)
 *
 * Destructive-confirm dialog shown only when a step/section delete would
 * cascade-destroy stored run answers (step_values.stepId onDelete: cascade).
 * Fully controlled — no trigger — because the caller must check the impact
 * count (an async fetch) before deciding whether to show this at all.
 * Zero-impact deletes skip this dialog entirely and keep their existing
 * one-click confirmation.
 */
import { AlertTriangle } from "lucide-react";

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
import type { ApiDeleteImpact } from "@/lib/vault-api";

interface DeleteImpactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    impact: ApiDeleteImpact | null;
    /** Noun for the thing being deleted, e.g. "question" or "page". */
    itemLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
}

export function DeleteImpactDialog({
    open,
    onOpenChange,
    impact,
    itemLabel,
    onConfirm,
    isPending = false,
}: DeleteImpactDialogProps): JSX.Element {
    const answerCount = impact?.answerCount ?? 0;
    const runCount = impact?.runCount ?? 0;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        Delete {itemLabel} with collected answers?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="font-semibold text-foreground">
                            {answerCount} answer{answerCount === 1 ? "" : "s"} from {runCount} run{runCount === 1 ? "" : "s"}
                        </span>
                        {" "}will be permanently deleted. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isPending ? "Deleting..." : "Delete permanently"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

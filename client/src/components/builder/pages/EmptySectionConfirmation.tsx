import { FolderX } from "lucide-react";

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

interface EmptySectionConfirmationProps {
  sectionTitle: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EmptySectionConfirmation({
  sectionTitle,
  isPending,
  onCancel,
  onConfirm,
}: EmptySectionConfirmationProps) {
  return (
    <AlertDialog open={sectionTitle !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FolderX className="size-5 text-destructive" aria-hidden="true" />
            Delete empty Section “{sectionTitle}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This move removes the last page from “{sectionTitle}”. The page will move as requested,
            and the now-empty Section will be deleted. No page content is deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Keep Section
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? "Moving…" : "Move page and delete Section"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

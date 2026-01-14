/**
 * Delete Row Button Component (PR 7)
 * Button to delete a row from the table
 */

import { Trash2, Loader2 } from "lucide-react";
import React, { useState } from "react";

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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { datavaultAPI } from "@/lib/datavault-api";

interface DeleteRowButtonProps {
  tableId: string;
  rowId: string;
  onDelete: () => void;
}

export function DeleteRowButton({ tableId, rowId, onDelete }: DeleteRowButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await datavaultAPI.deleteRow(rowId);

      toast({
        title: "Row deleted",
        description: "The row has been deleted successfully.",
      });

      setConfirmOpen(false);
      onDelete();
    } catch (error) {
      toast({
        title: "Failed to delete row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setConfirmOpen(true)}
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete row"
        title="Delete row"
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Row?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

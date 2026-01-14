/**
 * Note Item Component
 * Displays a single row note with author, timestamp, and optional delete button
 */

import { formatDistanceToNow, format } from "date-fns";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

import type { DatavaultRowNote } from "@shared/schema";

interface NoteItemProps {
  note: DatavaultRowNote;
  onDelete: (noteId: string) => Promise<void>;
  canDelete: boolean; // True if current user is owner or table owner
}

export function NoteItem({ note, onDelete, canDelete }: NoteItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(note.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const isOwnNote = user?.id === note.userId;

  // Get user initials for avatar
  const getInitials = () => {
    // In a real app, we'd fetch user details from an API
    // For now, just use a placeholder
    return "U";
  };

  const fullDateTime = note.createdAt ? format(new Date(note.createdAt), "PPpp") : "Unknown";
  const relativeTime = note.createdAt ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }) : "";

  return (
    <div className="flex gap-3 py-3 px-3 rounded-lg hover:bg-accent/50 transition-colors">
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
          {getInitials()}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header with timestamp */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-medium">
            {isOwnNote ? "You" : "User"}
          </span>
          <span
            className="text-xs text-muted-foreground cursor-help"
            title={fullDateTime}
          >
            {relativeTime}
          </span>
        </div>

        {/* Note text */}
        <div className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {note.text}
        </div>
      </div>

      {/* Delete button (only for owner or table owner) */}
      {canDelete && (
        <div className="flex-shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Note</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this note? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

/**
 * Move Table Modal Component
 * Modal for moving a table between databases or to the main folder
 * DataVault Phase 2: Table Movement
 */

import { Loader2, FolderOpen, Database as DatabaseIcon } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DatavaultDatabase } from "@/lib/datavault-api";

interface MoveTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  currentDatabaseId: string | null;
  databases: DatavaultDatabase[];
  onMove: (databaseId: string | null) => Promise<void>;
  isLoading: boolean;
}

export function MoveTableModal({
  open,
  onOpenChange,
  tableName,
  currentDatabaseId,
  databases,
  onMove,
  isLoading,
}: MoveTableModalProps) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    currentDatabaseId
  );

  const handleMove = async () => {
    await onMove(selectedDatabaseId);
    onOpenChange(false);
  };

  const hasChanged = selectedDatabaseId !== currentDatabaseId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Move Table</DialogTitle>
          <DialogDescription>
            Move "{tableName}" to a different database or to the main folder.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="destination">
              Destination <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedDatabaseId || "main"}
              onValueChange={(value) =>
                setSelectedDatabaseId(value === "main" ? null : value)
              }
            >
              <SelectTrigger id="destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    <span>Main Folder (No Database)</span>
                  </div>
                </SelectItem>
                {databases.map((database) => (
                  <SelectItem key={database.id} value={database.id}>
                    <div className="flex items-center gap-2">
                      <DatabaseIcon className="w-4 h-4" />
                      <span>{database.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentDatabaseId && (
            <div className="text-sm text-muted-foreground">
              Current location:{" "}
              <span className="font-medium">
                {databases.find((db) => db.id === currentDatabaseId)?.name ||
                  "Unknown"}
              </span>
            </div>
          )}

          {!currentDatabaseId && (
            <div className="text-sm text-muted-foreground">
              Current location: <span className="font-medium">Main Folder</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!hasChanged || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

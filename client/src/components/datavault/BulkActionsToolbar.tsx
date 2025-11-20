/**
 * Bulk Actions Toolbar
 * Displays bulk action buttons when rows are selected
 */

import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkArchive: () => void;
  onBulkUnarchive: () => void;
  onBulkDelete: () => void;
}

export function BulkActionsToolbar({
  selectedCount,
  onClearSelection,
  onBulkArchive,
  onBulkUnarchive,
  onBulkDelete,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-primary/10 border rounded-lg p-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-medium">
          {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBulkArchive}>
            <Archive className="w-4 h-4 mr-2" />
            Archive
          </Button>
          <Button variant="outline" size="sm" onClick={onBulkUnarchive}>
            <ArchiveRestore className="w-4 h-4 mr-2" />
            Restore
          </Button>
          <Button variant="outline" size="sm" onClick={onBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X className="w-4 h-4 mr-2" />
        Clear
      </Button>
    </div>
  );
}

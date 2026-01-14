/**
 * ColumnManager Component with Drag & Drop
 * Manage columns for a table: add, edit, delete, reorder with drag & drop
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import React, { useState, useEffect } from "react";

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTables, useTableSchema } from "@/hooks/useDatavaultTables";

import type { DatavaultColumn } from "@shared/schema";

import { ColumnTypeIcon, getColumnTypeColor } from "./ColumnTypeIcon";



interface ColumnManagerProps {
  columns: DatavaultColumn[];
  tableId: string;
  onAddColumn: (data: {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    referenceTableId?: string;
    referenceDisplayColumnSlug?: string;
  }) => Promise<void>;
  onUpdateColumn: (columnId: string, data: { name: string; required: boolean; description?: string }) => Promise<void>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onReorderColumns?: (columnIds: string[]) => Promise<void>;
  isLoading?: boolean;
}

interface SortableColumnProps {
  column: DatavaultColumn;
  onEdit: () => void;
  onDelete: () => void;
  isLoading: boolean;
  canDelete: boolean;
}

function SortableColumn({ column, onEdit, onDelete, isLoading, canDelete }: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 flex-wrap">
            <ColumnTypeIcon type={column.type} className={getColumnTypeColor(column.type)} />
            <p className="font-medium truncate">{column.name}</p>
            {column.isPrimaryKey && (
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded font-semibold">
                🔑 PRIMARY KEY
              </span>
            )}
            {column.isUnique && !column.isPrimaryKey && (
              <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 rounded">
                Unique
              </span>
            )}
            {column.required && !column.isPrimaryKey && (
              <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded">
                Required
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Type: <span className="font-mono">{column.type}</span>
            {column.slug && (
              <span className="ml-3">
                Slug: <span className="font-mono">{column.slug}</span>
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={isLoading}
          title="Edit column"
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isLoading || !canDelete}
          className="text-destructive hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            !canDelete
              ? "Cannot delete the only primary key column"
              : "Delete column"
          }
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function ColumnManagerWithDnd({
  columns,
  tableId,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  onReorderColumns,
  isLoading = false,
}: ColumnManagerProps) {
  const { toast } = useToast();
  const [localColumns, setLocalColumns] = useState(columns);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<{ id: string; name: string; required: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Add column state
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnRequired, setNewColumnRequired] = useState(false);
  const [newColumnDescription, setNewColumnDescription] = useState("");
  const [newReferenceTableId, setNewReferenceTableId] = useState<string>("");
  const [newReferenceDisplayColumnSlug, setNewReferenceDisplayColumnSlug] = useState<string>("");

  // Edit column state
  const [editColumnName, setEditColumnName] = useState("");
  const [editColumnRequired, setEditColumnRequired] = useState(false);
  const [editColumnDescription, setEditColumnDescription] = useState("");

  // Fetch tables for reference column dropdown
  const { data: tables } = useTables();
  // Fetch schema of selected reference table to get columns
  const { data: refTableSchema } = useTableSchema(newReferenceTableId || undefined);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update local columns when props change
  // Update local columns when props change
  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  // Listen for custom event from header button
  useEffect(() => {
    const handleOpenDialog = () => {
      setAddDialogOpen(true);
    };

    window.addEventListener('openAddColumnDialog', handleOpenDialog);

    return () => {
      window.removeEventListener('openAddColumnDialog', handleOpenDialog);
    };
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localColumns.findIndex((col) => col.id === active.id);
      const newIndex = localColumns.findIndex((col) => col.id === over.id);

      const newColumns = arrayMove(localColumns, oldIndex, newIndex);
      setLocalColumns(newColumns);

      // Call reorder API
      if (onReorderColumns) {
        try {
          await onReorderColumns(newColumns.map((col) => col.id));
          toast({
            title: "Columns reordered",
            description: "Column order has been updated successfully.",
          });
        } catch (error) {
          // Revert on error
          setLocalColumns(columns);
          toast({
            title: "Failed to reorder columns",
            description: error instanceof Error ? error.message : "An error occurred",
            variant: "destructive",
          });
        }
      }
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {return;}

    // Validate reference column
    if (newColumnType === 'reference' && !newReferenceTableId) {
      toast({
        title: "Reference table required",
        description: "Please select a table to reference",
        variant: "destructive",
      });
      return;
    }

    await onAddColumn({
      name: newColumnName.trim(),
      type: newColumnType,
      required: newColumnRequired,
      description: newColumnDescription.trim() || undefined,
      referenceTableId: newColumnType === 'reference' ? newReferenceTableId : undefined,
      referenceDisplayColumnSlug: newColumnType === 'reference' ? newReferenceDisplayColumnSlug : undefined,
    });

    // Reset form
    setNewColumnName("");
    setNewColumnType("text");
    setNewColumnRequired(false);
    setNewColumnDescription("");
    setNewReferenceTableId("");
    setNewReferenceDisplayColumnSlug("");
    setAddDialogOpen(false);
  };

  const handleEditColumn = async () => {
    if (!editDialog || !editColumnName.trim()) {return;}

    try {
      await onUpdateColumn(editDialog.id, {
        name: editColumnName.trim(),
        required: editColumnRequired,
        description: editColumnDescription.trim() || undefined,
      });

      setEditDialog(null);
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deleteConfirm) {return;}

    await onDeleteColumn(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const openEditDialog = (column: DatavaultColumn) => {
    setEditDialog({ id: column.id, name: column.name, required: column.required });
    setEditColumnName(column.name);
    setEditColumnRequired(column.required);
    setEditColumnDescription(column.description || "");
  };

  return (
    <>
      <div className="space-y-2">
        {localColumns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No columns yet. Click "Add Column" above to get started.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localColumns.map((col) => col.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {localColumns.map((column) => (
                  <SortableColumn
                    key={column.id}
                    column={column}
                    onEdit={() => openEditDialog(column)}
                    onDelete={() => setDeleteConfirm({ id: column.id, name: column.name })}
                    isLoading={isLoading}
                    canDelete={!(column.isPrimaryKey && localColumns.filter(c => c.isPrimaryKey).length === 1)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add Column Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>Add a new column to the table</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="column-name">
                Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="column-name"
                placeholder="e.g., Full Name, Email, Age"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="column-type">Type</Label>
              <Select value={newColumnType} onValueChange={(value) => {
                setNewColumnType(value);
                // Reset reference fields when changing away from reference type
                if (value !== 'reference') {
                  setNewReferenceTableId("");
                  setNewReferenceDisplayColumnSlug("");
                }
              }}>
                <SelectTrigger id="column-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="datetime">Date/Time</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="reference">🔗 Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="column-description">Description (optional)</Label>
              <Textarea
                id="column-description"
                placeholder="Describe this column's purpose..."
                value={newColumnDescription}
                onChange={(e) => setNewColumnDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Reference-specific fields */}
            {newColumnType === 'reference' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="ref-table">
                    Reference Table <span className="text-destructive">*</span>
                  </Label>
                  <Select value={newReferenceTableId} onValueChange={setNewReferenceTableId}>
                    <SelectTrigger id="ref-table">
                      <SelectValue placeholder="Select a table..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tables
                        ?.filter(t => t.id !== tableId) // Don't allow self-reference
                        .map((table) => (
                          <SelectItem key={table.id} value={table.id}>
                            {table.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {newReferenceTableId && refTableSchema?.columns && (
                  <div className="grid gap-2">
                    <Label htmlFor="ref-display-column">Display Field (optional)</Label>
                    <Select
                      value={newReferenceDisplayColumnSlug}
                      onValueChange={setNewReferenceDisplayColumnSlug}
                    >
                      <SelectTrigger id="ref-display-column">
                        <SelectValue placeholder="Use row ID" />
                      </SelectTrigger>
                      <SelectContent>
                        {refTableSchema.columns.map((col) => (
                          <SelectItem key={col.id} value={col.slug}>
                            {col.name} ({col.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="column-required"
                checked={newColumnRequired}
                onCheckedChange={(checked) => setNewColumnRequired(checked as boolean)}
              />
              <Label htmlFor="column-required" className="cursor-pointer">
                Required field
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim() || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
            <DialogDescription>
              Update column name and settings. Type cannot be changed after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-column-name">
                Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-column-name"
                value={editColumnName}
                onChange={(e) => setEditColumnName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-column-description">Description (optional)</Label>
              <Textarea
                id="edit-column-description"
                placeholder="Describe this column's purpose..."
                value={editColumnDescription}
                onChange={(e) => setEditColumnDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-column-required"
                checked={editColumnRequired}
                onCheckedChange={(checked) => setEditColumnRequired(checked as boolean)}
              />
              <Label htmlFor="edit-column-required" className="cursor-pointer">
                Required field
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditColumn} disabled={!editColumnName.trim() || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Column?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the column "{deleteConfirm?.name}"? This will permanently
              delete all data in this column for all rows. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteColumn}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

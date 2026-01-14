/**
 * ColumnManager Component
 * Manage columns for a table: add, edit, delete, reorder
 */

import { Loader2, Plus, Edit2, Trash2, GripVertical } from "lucide-react";
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
import type { SelectOption } from "@/lib/types/datavault";

import type { DatavaultColumn } from "@shared/schema";

import { OptionsEditor } from "./OptionsEditor";


/**
 * Type guard to safely convert unknown jsonb data to SelectOption array
 */
function isSelectOptionArray(value: unknown): value is SelectOption[] {
  if (!Array.isArray(value)) {return false;}
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'label' in item &&
      'value' in item &&
      typeof item.label === 'string' &&
      typeof item.value === 'string'
  );
}

/**
 * Safely extracts SelectOption array from unknown jsonb column data
 */
function extractSelectOptions(options: unknown): SelectOption[] {
  if (isSelectOptionArray(options)) {
    return options;
  }
  return [];
}

interface ColumnManagerProps {
  columns: DatavaultColumn[];
  onAddColumn: (data: { name: string; type: string; required: boolean; options?: SelectOption[] }) => Promise<void>;
  onUpdateColumn: (columnId: string, data: { name: string; required: boolean; options?: SelectOption[] }) => Promise<void>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  isLoading?: boolean;
}

export function ColumnManager({
  columns,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  isLoading = false,
}: ColumnManagerProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<{ id: string; name: string; required: boolean; type: string; options?: SelectOption[] | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Add column state
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnRequired, setNewColumnRequired] = useState(false);
  const [newColumnOptions, setNewColumnOptions] = useState<SelectOption[]>([]);

  // Edit column state
  const [editColumnName, setEditColumnName] = useState("");
  const [editColumnRequired, setEditColumnRequired] = useState(false);
  const [editColumnOptions, setEditColumnOptions] = useState<SelectOption[]>([]);

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {return;}

    // Validate select/multiselect have options
    if ((newColumnType === 'select' || newColumnType === 'multiselect') && newColumnOptions.length === 0) {
      return;
    }

    await onAddColumn({
      name: newColumnName.trim(),
      type: newColumnType,
      required: newColumnRequired,
      options: (newColumnType === 'select' || newColumnType === 'multiselect') ? newColumnOptions : undefined,
    });

    // Reset form
    setNewColumnName("");
    setNewColumnType("text");
    setNewColumnRequired(false);
    setNewColumnOptions([]);
    setAddDialogOpen(false);
  };

  const handleEditColumn = async () => {
    if (!editDialog || !editColumnName.trim()) {return;}

    // Validate select/multiselect have options
    if ((editDialog.type === 'select' || editDialog.type === 'multiselect') && editColumnOptions.length === 0) {
      return;
    }

    try {
      await onUpdateColumn(editDialog.id, {
        name: editColumnName.trim(),
        required: editColumnRequired,
        options: (editDialog.type === 'select' || editDialog.type === 'multiselect') ? editColumnOptions : undefined,
      });

      setEditDialog(null);
    } catch (error) {
      // Error is handled by parent component with toast
      // Dialog stays open so user can fix the issue
      console.error('Failed to update column:', error);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deleteConfirm) {return;}

    await onDeleteColumn(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const openEditDialog = (column: DatavaultColumn) => {
    const options = extractSelectOptions(column.options);
    setEditDialog({
      id: column.id,
      name: column.name,
      required: column.required,
      type: column.type,
      options: options.length > 0 ? options : null
    });
    setEditColumnName(column.name);
    setEditColumnRequired(column.required);
    setEditColumnOptions(options);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Columns</CardTitle>
              <CardDescription>Manage table columns and their properties</CardDescription>
            </div>
            <Button onClick={() => setAddDialogOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Column
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {columns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <i className="fas fa-columns text-4xl mb-4"></i>
              <p>No columns yet. Add your first column to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
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
                      onClick={() => openEditDialog(column)}
                      disabled={isLoading}
                      title="Edit column"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm({ id: column.id, name: column.name })}
                      disabled={isLoading || (column.isPrimaryKey && columns.filter(c => c.isPrimaryKey).length === 1)}
                      className="text-destructive hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        column.isPrimaryKey && columns.filter(c => c.isPrimaryKey).length === 1
                          ? "Cannot delete the only primary key column"
                          : "Delete column"
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <Select value={newColumnType} onValueChange={setNewColumnType}>
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
                  <SelectItem value="select">Select (Single Choice)</SelectItem>
                  <SelectItem value="multiselect">Multiselect (Multiple Choice)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            {(newColumnType === 'select' || newColumnType === 'multiselect') && (
              <OptionsEditor
                options={newColumnOptions}
                onChange={setNewColumnOptions}
              />
            )}
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
            {editDialog && (editDialog.type === 'select' || editDialog.type === 'multiselect') && (
              <OptionsEditor
                options={editColumnOptions}
                onChange={setEditColumnOptions}
              />
            )}
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

/**
 * ColumnManager Component
 * Manage columns for a table: add, edit, delete, reorder
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2, Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import type { DatavaultColumn } from "@shared/schema";

interface ColumnManagerProps {
  columns: DatavaultColumn[];
  onAddColumn: (data: { name: string; type: string; required: boolean }) => Promise<void>;
  onUpdateColumn: (columnId: string, data: { name: string; required: boolean }) => Promise<void>;
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
  const [editDialog, setEditDialog] = useState<{ id: string; name: string; required: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Add column state
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnRequired, setNewColumnRequired] = useState(false);

  // Edit column state
  const [editColumnName, setEditColumnName] = useState("");
  const [editColumnRequired, setEditColumnRequired] = useState(false);

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;

    await onAddColumn({
      name: newColumnName.trim(),
      type: newColumnType,
      required: newColumnRequired,
    });

    // Reset form
    setNewColumnName("");
    setNewColumnType("text");
    setNewColumnRequired(false);
    setAddDialogOpen(false);
  };

  const handleEditColumn = async () => {
    if (!editDialog || !editColumnName.trim()) return;

    await onUpdateColumn(editDialog.id, {
      name: editColumnName.trim(),
      required: editColumnRequired,
    });

    setEditDialog(null);
  };

  const handleDeleteColumn = async () => {
    if (!deleteConfirm) return;

    await onDeleteColumn(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const openEditDialog = (column: DatavaultColumn) => {
    setEditDialog({ id: column.id, name: column.name, required: column.required });
    setEditColumnName(column.name);
    setEditColumnRequired(column.required);
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
                      <div className="flex items-center space-x-2">
                        <p className="font-medium truncate">{column.name}</p>
                        {column.required && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
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
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm({ id: column.id, name: column.name })}
                      disabled={isLoading}
                      className="text-destructive hover:text-destructive"
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

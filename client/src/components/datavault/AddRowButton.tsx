/**
 * Add Row Button Component (PR 7)
 * Button to add a new row to the table
 */

import { Plus, Loader2 } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { datavaultAPI } from "@/lib/datavault-api";

import type { DatavaultColumn } from "@shared/schema";

interface AddRowButtonProps {
  tableId: string;
  columns: DatavaultColumn[];
  onAdd: () => void;
}

export function AddRowButton({ tableId, columns, onAdd }: AddRowButtonProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Filter out empty values and auto-number fields
      const filteredValues: Record<string, any> = {};
      for (const [colId, value] of Object.entries(values)) {
        const column = columns.find(c => c.id === colId);
        if (column?.type === 'auto_number') {continue;} // Skip auto-number fields

        if (value !== undefined && value !== null && value !== '') {
          filteredValues[colId] = value;
        }
      }

      await datavaultAPI.createRow(tableId, filteredValues);

      toast({
        title: "Row added",
        description: "The new row has been created successfully.",
      });

      // Reset and close
      setValues({});
      setOpen(false);
      onAdd();
    } catch (error) {
      toast({
        title: "Failed to add row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderInput = (column: DatavaultColumn) => {
    const value = values[column.id];

    // Auto-number fields are read-only
    if (column.type === 'auto_number') {
      return (
        <Input
          type="number"
          disabled
          placeholder="Auto-generated"
          className="bg-muted"
        />
      );
    }

    switch (column.type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <Input
            type={column.type === 'email' ? 'email' : column.type === 'url' ? 'url' : 'text'}
            value={value || ''}
            onChange={(e) => setValues(prev => ({ ...prev, [column.id]: e.target.value }))}
            required={column.required}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => setValues(prev => ({
              ...prev,
              [column.id]: e.target.value ? parseFloat(e.target.value) : null
            }))}
            required={column.required}
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => setValues(prev => ({ ...prev, [column.id]: checked }))}
            />
            <span className="text-sm text-muted-foreground">
              {value ? 'Yes' : 'No'}
            </span>
          </div>
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => setValues(prev => ({ ...prev, [column.id]: e.target.value }))}
            required={column.required}
          />
        );

      case 'datetime':
        return (
          <Input
            type="datetime-local"
            value={value || ''}
            onChange={(e) => setValues(prev => ({ ...prev, [column.id]: e.target.value }))}
            required={column.required}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={value || ''}
            onChange={(e) => setValues(prev => ({ ...prev, [column.id]: e.target.value }))}
            required={column.required}
          />
        );
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <Plus className="w-4 h-4 mr-2" />
        Add Row
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add New Row</DialogTitle>
              <DialogDescription>
                Fill in the values for the new row. Required fields are marked with *.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {columns.map((column) => (
                <div key={column.id} className="grid gap-2">
                  <Label htmlFor={column.id}>
                    {column.name}
                    {column.required && <span className="text-red-500 ml-1">*</span>}
                    {column.isPrimaryKey && (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded ml-2">
                        PK
                      </span>
                    )}
                  </Label>
                  {renderInput(column)}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Row
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

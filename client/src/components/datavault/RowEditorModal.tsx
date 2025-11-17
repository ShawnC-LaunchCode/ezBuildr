/**
 * RowEditorModal Component
 * Modal for adding or editing a row with dynamic form fields based on columns
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import type { DatavaultColumn } from "@shared/schema";

interface RowEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: DatavaultColumn[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  isLoading?: boolean;
  mode: "add" | "edit";
}

export function RowEditorModal({
  open,
  onOpenChange,
  columns,
  initialValues = {},
  onSubmit,
  isLoading = false,
  mode,
}: RowEditorModalProps) {
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      setValues(initialValues);
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const missingRequired = columns
      .filter((col) => col.required && !values[col.id])
      .map((col) => col.name);

    if (missingRequired.length > 0) {
      alert(`Please fill in required fields: ${missingRequired.join(", ")}`);
      return;
    }

    await onSubmit(values);
    setValues({});
  };

  const handleCancel = () => {
    setValues({});
    onOpenChange(false);
  };

  const renderField = (column: DatavaultColumn) => {
    const value = values[column.id] ?? "";

    switch (column.type) {
      case "text":
      case "email":
      case "phone":
      case "url":
        return (
          <Input
            id={column.id}
            type={column.type === "email" ? "email" : column.type === "url" ? "url" : "text"}
            value={value}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
          />
        );

      case "long_text":
      case "json":
        return (
          <Textarea
            id={column.id}
            value={typeof value === "object" ? JSON.stringify(value, null, 2) : value}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
            rows={4}
          />
        );

      case "number":
        return (
          <Input
            id={column.id}
            type="number"
            value={value}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
          />
        );

      case "boolean":
        return (
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id={column.id}
              checked={Boolean(value)}
              onCheckedChange={(checked) => setValues({ ...values, [column.id]: checked })}
              disabled={isLoading}
            />
            <Label htmlFor={column.id} className="cursor-pointer">
              {value ? "Yes" : "No"}
            </Label>
          </div>
        );

      case "date":
        return (
          <Input
            id={column.id}
            type="date"
            value={value ? new Date(value).toISOString().split("T")[0] : ""}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
          />
        );

      case "datetime":
        return (
          <Input
            id={column.id}
            type="datetime-local"
            value={value ? new Date(value).toISOString().slice(0, 16) : ""}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
          />
        );

      default:
        return (
          <Input
            id={column.id}
            value={value}
            onChange={(e) => setValues({ ...values, [column.id]: e.target.value })}
            required={column.required}
            disabled={isLoading}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Add Row" : "Edit Row"}</DialogTitle>
            <DialogDescription>
              {mode === "add" ? "Add a new row to the table" : "Update the row data"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {columns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No columns defined. Add columns first before adding rows.
              </p>
            ) : (
              columns.map((column) => (
                <div key={column.id} className="grid gap-2">
                  <Label htmlFor={column.id}>
                    {column.name}
                    {column.required && <span className="text-destructive ml-1">*</span>}
                    <span className="text-xs text-muted-foreground ml-2">({column.type})</span>
                  </Label>
                  {renderField(column)}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || columns.length === 0}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "add" ? "Add Row" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * RecordEditorModal Component
 * Dynamic form for creating/editing collection records
 */
import { Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiCollectionField, ApiCollectionRecord } from "@/lib/vault-api";
interface RecordEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: ApiCollectionField[];
  record?: ApiCollectionRecord;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  isLoading?: boolean;
}
export function RecordEditorModal({
  open,
  onOpenChange,
  fields,
  record,
  onSubmit,
  isLoading = false,
}: RecordEditorModalProps) {
  const isEditing = !!record;
  const [formData, setFormData] = useState<Record<string, any>>({});
  // Initialize form data from record or defaults
  useEffect(() => {
    if (open) {
      const initialData: Record<string, any> = {};
      fields.forEach((field) => {
        if (record) {
          // Editing: use existing value
          initialData[field.slug] = record.data[field.slug] ?? getDefaultValue(field);
        } else {
          // Creating: use default value
          initialData[field.slug] = getDefaultValue(field);
        }
      });
      setFormData(initialData);
    }
  }, [open, record, fields]);
  // Get default value for a field
  const getDefaultValue = (field: ApiCollectionField): any => {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      return field.defaultValue;
    }
    switch (field.type) {
      case "boolean":
        return false;
      case "number":
        return "";
      case "multi_select":
        return [];
      case "json":
        return {};
      default:
        return "";
    }
  };
  // Update form field value
  const updateField = (slug: string, value: any) => {
    setFormData((prev) => ({ ...prev, [slug]: value }));
  };
  // Validate and submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    const missingFields = fields
      .filter((field) => field.isRequired)
      .filter((field) => {
        const value = formData[field.slug];
        if (value === null || value === undefined || value === "") {return true;}
        if (Array.isArray(value) && value.length === 0) {return true;}
        return false;
      })
      .map((field) => field.name);
    if (missingFields.length > 0) {
      alert(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }
    // Clean up data (remove empty optional fields, convert types)
    const cleanedData: Record<string, any> = {};
    fields.forEach((field) => {
      let value = formData[field.slug];
      // Skip empty optional fields
      if (!field.isRequired && (value === "" || value === null || value === undefined)) {
        return;
      }
      // Type conversions
      if (field.type === "number" && value !== "" && value !== null) {
        value = Number(value);
      }
      if (field.type === "json" && typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if invalid JSON
        }
      }
      cleanedData[field.slug] = value;
    });
    await onSubmit(cleanedData);
  };
  // Render field input based on type
  const renderFieldInput = (field: ApiCollectionField) => {
    const value = formData[field.slug] ?? getDefaultValue(field);
    switch (field.type) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
            placeholder={`Enter ${field.name.toLowerCase()}`}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
            placeholder="0"
          />
        );
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={value}
              onCheckedChange={(checked) => updateField(field.slug, checked)}
            />
            <span className="text-sm text-muted-foreground">
              {value ? "True" : "False"}
            </span>
          </div>
        );
      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
          />
        );
      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={value || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
          />
        );
      case "select":
        const selectOptions = Array.isArray(field.options) ? field.options : [];
        return (
          <Select
            value={value || ""}
            onValueChange={(val) => updateField(field.slug, val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multi_select":
        const multiOptions = Array.isArray(field.options) ? field.options : [];
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {multiOptions.map((option) => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      updateField(field.slug, [...selectedValues, option]);
                    } else {
                      updateField(
                        field.slug,
                        selectedValues.filter((v) => v !== option)
                      );
                    }
                  }}
                />
                <Label className="font-normal">{option}</Label>
              </div>
            ))}
          </div>
        );
      case "file":
        return (
          <div className="space-y-2">
            <Input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // For now, just store the filename
                  // TODO: Implement actual file upload in future
                  updateField(field.slug, file.name);
                }
              }}
            />
            {value && (
              <p className="text-sm text-muted-foreground">
                Current: {value}
              </p>
            )}
          </div>
        );
      case "json":
        const jsonValue = typeof value === "object" ? JSON.stringify(value, null, 2) : value;
        return (
          <Textarea
            value={jsonValue || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
            placeholder='{"key": "value"}'
            className="font-mono text-sm"
            rows={4}
          />
        );
      default:
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => { void updateField(field.slug, e.target.value); }}
            placeholder={`Enter ${field.name.toLowerCase()}`}
            rows={3}
          />
        );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Record" : "Create Record"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the record details below."
              : "Fill in the details to create a new record."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(e); }} className="space-y-6">
          {fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label>
                {field.name}
                {field.isRequired && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <div className="text-xs text-muted-foreground mb-1">
                <code>{field.slug}</code> · {field.type}
              </div>
              {renderFieldInput(field)}
            </div>
          ))}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { void onOpenChange(false); }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Update Record" : "Create Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
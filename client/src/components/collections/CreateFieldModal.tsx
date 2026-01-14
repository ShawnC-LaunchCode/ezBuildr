/**
 * CreateFieldModal Component
 * Modal dialog for creating/editing collection fields
 */

import { Loader2, Plus, X } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiCollectionField } from "@/lib/vault-api";

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'file' | 'select' | 'multi_select' | 'json';

interface CreateFieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) => void;
  isLoading?: boolean;
  field?: ApiCollectionField; // For editing existing field
}

const FIELD_TYPES: { value: FieldType; label: string; description: string }[] = [
  { value: 'text', label: 'Text', description: 'Single line text' },
  { value: 'number', label: 'Number', description: 'Numeric values' },
  { value: 'boolean', label: 'Boolean', description: 'True/false checkbox' },
  { value: 'date', label: 'Date', description: 'Date only' },
  { value: 'datetime', label: 'Date & Time', description: 'Date with time' },
  { value: 'file', label: 'File', description: 'File upload' },
  { value: 'select', label: 'Select', description: 'Single choice from options' },
  { value: 'multi_select', label: 'Multi-Select', description: 'Multiple choices' },
  { value: 'json', label: 'JSON', description: 'Structured data' },
];

export function CreateFieldModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  field,
}: CreateFieldModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [autoGenerateSlug, setAutoGenerateSlug] = useState(true);

  // For select/multi-select
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");

  // Default value
  const [defaultValue, setDefaultValue] = useState("");

  // Initialize form for editing
  useEffect(() => {
    if (field) {
      setName(field.name);
      setSlug(field.slug);
      setType(field.type);
      setIsRequired(field.isRequired);
      setAutoGenerateSlug(false);

      if (field.options && Array.isArray(field.options)) {
        setOptions(field.options);
      }

      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        setDefaultValue(String(field.defaultValue));
      }
    }
  }, [field]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (autoGenerateSlug && !field) {
      const generatedSlug = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleAddOption = () => {
    if (newOption.trim() && !options.includes(newOption.trim())) {
      setOptions([...options, newOption.trim()]);
      setNewOption("");
    }
  };

  const handleRemoveOption = (option: string) => {
    setOptions(options.filter(o => o !== option));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {return;}

    // Validate select/multi-select has options
    if ((type === 'select' || type === 'multi_select') && options.length === 0) {
      return;
    }

    const fieldData: Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      slug: slug.trim(),
      type,
      isRequired,
      options: (type === 'select' || type === 'multi_select') ? options : null,
      defaultValue: defaultValue.trim() ? parseDefaultValue(type, defaultValue.trim()) : null,
    };

    onSubmit(fieldData);

    // Reset form
    if (!field) {
      resetForm();
    }
  };

  const parseDefaultValue = (type: FieldType, value: string): any => {
    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true';
      case 'multi_select':
        return value.split(',').map(v => v.trim());
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      default:
        return value;
    }
  };

  const resetForm = () => {
    setName("");
    setSlug("");
    setType("text");
    setIsRequired(false);
    setAutoGenerateSlug(true);
    setOptions([]);
    setNewOption("");
    setDefaultValue("");
  };

  const handleCancel = () => {
    if (!field) {
      resetForm();
    }
    onOpenChange(false);
  };

  const requiresOptions = type === 'select' || type === 'multi_select';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{field ? 'Edit Field' : 'Create Field'}</DialogTitle>
            <DialogDescription>
              {field ? 'Update field properties and configuration.' : 'Add a new field to this collection.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Email, Age, Status"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">
                Slug <span className="text-xs text-muted-foreground">(field identifier)</span>
              </Label>
              <Input
                id="slug"
                placeholder="e.g., email, age, status"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setAutoGenerateSlug(false);
                }}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {autoGenerateSlug && !field ? "Auto-generated from name" : "Custom slug"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select value={type} onValueChange={(value) => setType(value as FieldType)} disabled={!!field || isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{ft.label}</span>
                        <span className="text-xs text-muted-foreground">{ft.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field && (
                <p className="text-xs text-muted-foreground">Field type cannot be changed after creation</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="required"
                checked={isRequired}
                onCheckedChange={(checked) => setIsRequired(checked === true)}
                disabled={isLoading}
              />
              <Label htmlFor="required" className="cursor-pointer">
                Required field
              </Label>
            </div>

            {/* Options for select/multi-select */}
            {requiresOptions && (
              <div className="grid gap-2">
                <Label>
                  Options <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add option"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddOption();
                      }
                    }}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={handleAddOption}
                    disabled={!newOption.trim() || isLoading}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {options.map((option) => (
                    <Badge key={option} variant="secondary" className="gap-1">
                      {option}
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                        onClick={() => handleRemoveOption(option)}
                      />
                    </Badge>
                  ))}
                </div>
                {options.length === 0 && (
                  <p className="text-xs text-destructive">At least one option is required</p>
                )}
              </div>
            )}

            {/* Default value */}
            {type !== 'file' && (
              <div className="grid gap-2">
                <Label htmlFor="defaultValue">Default Value</Label>
                <Input
                  id="defaultValue"
                  placeholder={
                    type === 'boolean' ? 'true or false' :
                    type === 'multi_select' ? 'option1, option2' :
                    type === 'json' ? '{"key": "value"}' :
                    'Default value...'
                  }
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !slug.trim() || (requiresOptions && options.length === 0) || isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {field ? 'Update Field' : 'Create Field'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

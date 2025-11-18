/**
 * CreateTableModal Component
 * Modal dialog for creating a new DataVault table with column definitions
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface Column {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'email' | 'phone' | 'url' | 'json' | 'auto_number';
  required: boolean;
}

interface CreateTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; slug?: string; description?: string; columns: Column[] }) => void;
  isLoading?: boolean;
}

export function CreateTableModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: CreateTableModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [autoGenerateSlug, setAutoGenerateSlug] = useState(true);
  const [columns, setColumns] = useState<Column[]>([
    { name: "", type: "text", required: false }
  ]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (autoGenerateSlug) {
      const generatedSlug = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
    }
  };

  const addColumn = () => {
    setColumns([...columns, { name: "", type: "text", required: false }]);
  };

  const removeColumn = (index: number) => {
    if (columns.length > 1) {
      setColumns(columns.filter((_, i) => i !== index));
    }
  };

  const updateColumn = (index: number, field: keyof Column, value: any) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: value };
    setColumns(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Filter out empty columns
    const validColumns = columns.filter(col => col.name.trim());
    if (validColumns.length === 0) {
      alert("Please add at least one column");
      return;
    }

    onSubmit({
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      columns: validColumns,
    });

    // Reset form
    setName("");
    setSlug("");
    setDescription("");
    setAutoGenerateSlug(true);
    setColumns([{ name: "", type: "text", required: false }]);
  };

  const handleCancel = () => {
    setName("");
    setSlug("");
    setDescription("");
    setAutoGenerateSlug(true);
    setColumns([{ name: "", type: "text", required: false }]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Table</DialogTitle>
            <DialogDescription>
              Create a new data table with custom columns
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., People, Businesses, Contacts"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">
                Slug
                <span className="text-xs text-muted-foreground ml-2">
                  (URL-safe identifier)
                </span>
              </Label>
              <Input
                id="slug"
                placeholder="e.g., people, businesses, contacts"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setAutoGenerateSlug(false);
                }}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {autoGenerateSlug ? "Auto-generated from name" : "Custom slug"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={2}
              />
            </div>

            {/* Columns Section */}
            <div className="grid gap-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>
                  Columns <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addColumn}
                  disabled={isLoading}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Column
                </Button>
              </div>

              <div className="space-y-3">
                {columns.map((column, index) => (
                  <div key={index} className="grid grid-cols-[1fr_140px_80px_40px] gap-2 items-start">
                    <Input
                      placeholder="Column name"
                      value={column.name}
                      onChange={(e) => updateColumn(index, 'name', e.target.value)}
                      disabled={isLoading}
                    />
                    <Select
                      value={column.type}
                      onValueChange={(value) => updateColumn(index, 'type', value)}
                      disabled={isLoading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto_number">Auto Number</SelectItem>
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
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id={`required-${index}`}
                        checked={column.required}
                        onCheckedChange={(checked) => updateColumn(index, 'required', checked)}
                        disabled={isLoading}
                      />
                      <Label htmlFor={`required-${index}`} className="text-xs">Req</Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(index)}
                      disabled={isLoading || columns.length === 1}
                      className="h-9"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
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
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

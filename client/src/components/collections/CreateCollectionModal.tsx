/**
 * CreateCollectionModal Component
 * Modal dialog for creating a new collection
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface CreateCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; slug?: string; description?: string }) => void;
  isLoading?: boolean;
}

export function CreateCollectionModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: CreateCollectionModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [autoGenerateSlug, setAutoGenerateSlug] = useState(true);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
    });

    // Reset form
    setName("");
    setSlug("");
    setDescription("");
    setAutoGenerateSlug(true);
  };

  const handleCancel = () => {
    setName("");
    setSlug("");
    setDescription("");
    setAutoGenerateSlug(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new data collection to store structured records.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Customers, Products, Orders"
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
                placeholder="e.g., customers, products, orders"
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
                placeholder="Describe what this collection stores..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isLoading}
              />
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
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Collection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

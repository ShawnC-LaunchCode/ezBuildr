import { Loader2 } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConfetti } from "@/hooks/useConfetti";
import { useTemplates } from "@/hooks/useTemplates";


interface Template {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
}

interface EditTemplateModalProps {
  open: boolean;
  onClose: () => void;
  template: Template | null;
}

export default function EditTemplateModal({ open, onClose, template }: EditTemplateModalProps) {
  const { update } = useTemplates();
  const { toast } = useToast();
  const { fire } = useConfetti();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (template) {
      setName(template.name || "");
      setDescription(template.description || "");
      setTags(template.tags?.join(", ") || "");
    }
  }, [template]);

  async function handleSave() {
    if (!template) {return;}

    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Template name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await update.mutateAsync({
        id: template.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      fire("success");
      toast({
        title: "Template updated",
        description: "Your changes have been saved successfully",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update template",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit template details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Customer Feedback Questions"
              disabled={update.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this template contains..."
              rows={3}
              disabled={update.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., customer, feedback, nps (comma separated)"
              disabled={update.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple tags with commas
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={update.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

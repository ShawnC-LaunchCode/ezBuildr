import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useGenerateWorkflow } from "@/lib/vault-hooks";

import { WorkflowCategorySelect, type WorkflowCategory } from "./WorkflowCategorySelect";

interface AIWorkflowGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess?: (workflowId: string) => void;
}

export function AIWorkflowGeneratorDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: AIWorkflowGeneratorDialogProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WorkflowCategory>("general");
  const { toast } = useToast();
  const [, _navigate] = useLocation();
  const queryClient = useQueryClient();

  const generateMutation = useGenerateWorkflow();

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe what kind of workflow you want to create.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        projectId,
        description: description.trim(),
        category,
      });

      if (result.success && result.workflow) {
        // Show quality feedback if available
        if (result.quality) {
          const qualityMsg = result.quality.passed
            ? `Quality score: ${result.quality.overall}/100`
            : `Generated with quality score: ${result.quality.overall}/100. Consider reviewing the suggestions.`;

          toast({
            title: "Workflow Generated",
            description: qualityMsg,
          });
        } else {
          toast({
            title: "Workflow Generated",
            description: `Created ${result.metadata.sectionsGenerated} sections with ${result.metadata.logicRulesGenerated} logic rules.`,
          });
        }

        // Close dialog and reset
        onOpenChange(false);
        setDescription("");
        setCategory("general");

        // Invalidate queries to refresh workflow list
        queryClient.invalidateQueries({ queryKey: ["workflows"] });

        // Navigate to the new workflow or call onSuccess
        if (onSuccess) {
          onSuccess(result.workflow.id);
        }
      }
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error?.message || "Failed to generate workflow. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Generate Workflow with AI
          </DialogTitle>
          <DialogDescription>
            Describe your workflow and select a category. AI will create a complete
            workflow structure with sections, fields, and logic rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <WorkflowCategorySelect
            value={category}
            onChange={setCategory}
            disabled={generateMutation.isPending}
          />

          <div className="space-y-2">
            <Label htmlFor="description">Describe your workflow</Label>
            <Textarea
              id="description"
              placeholder="e.g., Create an employee onboarding form that collects personal information, emergency contacts, tax details, and equipment preferences..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={generateMutation.isPending}
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be specific about what information you want to collect and any special requirements.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !description.trim()}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate Workflow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AIWorkflowGeneratorDialog;

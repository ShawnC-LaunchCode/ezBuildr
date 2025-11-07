/**
 * New Workflow Creation Page
 * Shows a form to create a new workflow, then redirects to the builder
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateWorkflow } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";

export default function NewWorkflow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const createWorkflowMutation = useCreateWorkflow();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Workflow title is required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare data, converting empty description to undefined
      const workflowData = {
        title: formData.title.trim(),
        ...(formData.description.trim() && { description: formData.description.trim() }),
      };

      const workflow = await createWorkflowMutation.mutateAsync(workflowData);
      toast({
        title: "Success",
        description: "Workflow created successfully",
      });
      // Navigate to the builder for the newly created workflow
      navigate(`/workflows/${workflow.id}/builder`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create workflow",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/workflows")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Workflows
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Create New Workflow</CardTitle>
            <CardDescription>
              Enter the details for your new workflow. You'll be able to add sections, steps, and configure everything in the builder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Customer Onboarding"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this workflow is for..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/workflows")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createWorkflowMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {createWorkflowMutation.isPending ? "Creating..." : "Create Workflow"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

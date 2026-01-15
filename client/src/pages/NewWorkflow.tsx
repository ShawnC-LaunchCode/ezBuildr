/**
 * New Workflow Creation Page
 * Shows a form to create a new workflow, then redirects to the builder
 */

import { ArrowLeft, Sparkles, LayoutTemplate } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";

import { TemplateBrowserDialog } from "@/components/templates/TemplateBrowserDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { blueprintAPI, ApiBlueprint } from "@/lib/vault-api";
import { useCreateWorkflow } from "@/lib/vault-hooks";

export default function NewWorkflow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const createWorkflowMutation = useCreateWorkflow();

  const [isTemplateBrowserOpen, setIsTemplateBrowserOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });
  const [aiPrompt, setAiPrompt] = useState("");


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
      });
    }
  };

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: "Error",
        description: "Please describe what you want to build.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create a default workflow shell
      const workflowData = {
        title: "AI Generated Workflow", // Could ask for this or generic
        description: "Created via AI Assistant",
      };

      const workflow = await createWorkflowMutation.mutateAsync(workflowData);

      toast({
        title: "Success",
        description: "Workflow created. Opening AI Assistant...",
      });

      // Navigate to builder with AI panel open and prompt
      navigate(`/workflows/${workflow.id}/builder?aiPanel=true&prompt=${encodeURIComponent(aiPrompt)}`);

    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create workflow",
        variant: "destructive",
      });
    }
  };

  const handleTemplateSelect = async (template: ApiBlueprint) => {
    try {
      // Instantiate workflow from blueprint
      const { workflowId } = await blueprintAPI.instantiate(template.id, {
        projectId: "" // Unfiled
      });

      toast({
        title: "Success",
        description: "Created workflow from template",
      });

      navigate(`/workflows/${workflowId}/builder`);

    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create workflow from template",
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
            <Tabs defaultValue="manual" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="manual">Manual Creation</TabsTrigger>
                <TabsTrigger value="template">Start from Template</TabsTrigger>
                <TabsTrigger value="ai">Create with AI</TabsTrigger>
              </TabsList>

              <TabsContent value="manual">
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
              </TabsContent>

              <TabsContent value="template">
                <div className="space-y-4 py-8 flex flex-col items-center justify-center text-center">
                  <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <LayoutTemplate className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium">Browse Templates</h3>
                  <p className="text-muted-foreground max-w-md">
                    Start with a pre-built workflow. Browse our library of templates for workflows and forms.
                  </p>
                  <Button onClick={() => setIsTemplateBrowserOpen(true)} className="mt-4">
                    Open Template Library
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="ai">
                <div className="space-y-4 py-2">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4 flex gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-indigo-900">
                      <p className="font-medium mb-1">Describe your workflow</p>
                      <p className="opacity-90">
                        Tell us what you want to build. Our AI assistant will generate the structure, steps, and logic for you to review.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-prompt">What do you want to build?</Label>
                    <Textarea
                      id="ai-prompt"
                      placeholder="e.g. A customer feedback form that asks for a rating, and if the rating is low, asks for detailed feedback and contact info."
                      className="min-h-[150px] text-base resize-none"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
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
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleAiSubmit}
                      disabled={createWorkflowMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {createWorkflowMutation.isPending ? "Projecting..." : "Generate Workflow"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <TemplateBrowserDialog
        open={isTemplateBrowserOpen}
        onOpenChange={setIsTemplateBrowserOpen}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}

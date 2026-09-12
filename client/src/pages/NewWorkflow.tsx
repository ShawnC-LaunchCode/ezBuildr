/**
 * New Workflow Creation Page
 * Shows a form to create a new workflow, then redirects to the builder
 */

import { ArrowLeft, Sparkles, LayoutTemplate, FileUp } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

import { TemplateBrowserDialog } from "@/components/templates/TemplateBrowserDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CreateWorkflowForm } from "@/components/workflows/CreateWorkflowForm";
import { useToast } from "@/hooks/use-toast";
import { blueprintAPI, ApiBlueprint } from "@/lib/vault-api";
import { useCreateWorkflow } from "@/lib/vault-hooks";

export default function NewWorkflow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const createWorkflowMutation = useCreateWorkflow();

  const [isTemplateBrowserOpen, setIsTemplateBrowserOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const defaultTab =
    requestedTab === "ai" || requestedTab === "template" || requestedTab === "document"
      ? requestedTab
      : "manual";

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
      // Derive a title from the first ~40 chars of the prompt so the workflow
      // list doesn't fill with identical "AI Generated Workflow" names (the AI
      // edit can rename it later).
      const derivedTitle = aiPrompt.trim().slice(0, 40).trim();
      const workflowData = {
        title: derivedTitle.length > 0 ? derivedTitle : "AI Generated Workflow",
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
          onClick={() => { void navigate("/workflows"); }}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Workflows
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Create New Workflow</CardTitle>
            <CardDescription>
              Enter the details for your new workflow. You&apos;ll be able to add pages, steps, and configure everything in the builder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={defaultTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="manual">Manual Creation</TabsTrigger>
                <TabsTrigger value="template">Start from Template</TabsTrigger>
                <TabsTrigger value="ai">Create with AI</TabsTrigger>
                <TabsTrigger value="document">From Document</TabsTrigger>
              </TabsList>

              <TabsContent value="manual">
                <CreateWorkflowForm
                  autoFocus
                  submitLabel="Create Workflow"
                  onCancel={() => { void navigate("/workflows"); }}
                  onCreated={(workflow) => { void navigate(`/workflows/${workflow.id}/builder`); }}
                />
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
                  <Button onClick={() => { void setIsTemplateBrowserOpen(true); }} className="mt-4">
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
                      onChange={(e) => { void setAiPrompt(e.target.value); }}
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { void navigate("/workflows"); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => { void handleAiSubmit(); }}
                      disabled={createWorkflowMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {createWorkflowMutation.isPending ? "Generating..." : "Generate Workflow"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="document">
                <div className="space-y-4 py-8 flex flex-col items-center justify-center text-center">
                  <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <FileUp className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium">Build from a document</h3>
                  <p className="text-muted-foreground max-w-md">
                    Upload a DOCX or PDF and AI drafts the workflow, questions, and field mapping for
                    you to review and approve before anything is created.
                  </p>
                  <Button onClick={() => { void navigate("/workflows/onboarding"); }} className="mt-4">
                    <FileUp className="w-4 h-4 mr-2" />
                    Start from a document
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <TemplateBrowserDialog
        open={isTemplateBrowserOpen}
        onOpenChange={setIsTemplateBrowserOpen}
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}

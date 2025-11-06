/**
 * Workflow Builder - 3-pane layout
 * Sidebar: Section/Step tree | Canvas: Editor | Inspector: Properties/Blocks
 */

import { useParams } from "wouter";
import { useState } from "react";
import { Settings, Play, Eye, EyeOff } from "lucide-react";
import { useWorkflow, useSections, useCreateRun } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTree } from "@/components/builder/SidebarTree";
import { CanvasEditor } from "@/components/builder/CanvasEditor";
import { Inspector } from "@/components/builder/Inspector";
import { RunnerPreview } from "@/components/builder/RunnerPreview";
import { useToast } from "@/hooks/use-toast";

export default function WorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { data: sections } = useSections(workflowId);
  const createRunMutation = useCreateRun();
  const { toast } = useToast();

  const {
    mode,
    setMode,
    isPreviewOpen,
    previewRunId,
    startPreview,
    stopPreview,
  } = useWorkflowBuilder();

  const handleStartPreview = async () => {
    if (!workflowId) return;

    try {
      const run = await createRunMutation.mutateAsync({ workflowId, metadata: { preview: true } });
      startPreview(run.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to start preview", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Workflow not found</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">{workflow.title}</h1>
          <span className="text-sm text-muted-foreground">
            {sections?.length || 0} sections
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Easy/Advanced Toggle */}
          <div className="flex items-center gap-2 mr-4">
            <Button
              variant={mode === "easy" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("easy")}
            >
              Easy
            </Button>
            <Button
              variant={mode === "advanced" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("advanced")}
            >
              Advanced
            </Button>
          </div>

          {/* Preview Toggle */}
          <Toggle
            pressed={isPreviewOpen}
            onPressedChange={(pressed) => {
              if (pressed) {
                handleStartPreview();
              } else {
                stopPreview();
              }
            }}
          >
            {isPreviewOpen ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            Preview
          </Toggle>

          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* 3-Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Section/Step Tree */}
        <div className="w-64 border-r bg-card overflow-y-auto">
          <SidebarTree workflowId={workflowId!} />
        </div>

        {/* Canvas - Editor */}
        <div className={`flex-1 overflow-y-auto ${isPreviewOpen ? 'border-r' : ''}`}>
          <CanvasEditor workflowId={workflowId!} />
        </div>

        {/* Inspector - Properties/Blocks */}
        {!isPreviewOpen && (
          <div className="w-96 border-l bg-card overflow-y-auto">
            <Inspector workflowId={workflowId!} />
          </div>
        )}

        {/* Preview Pane */}
        {isPreviewOpen && previewRunId && (
          <div className="w-96 bg-muted/30 overflow-y-auto">
            <RunnerPreview runId={previewRunId} />
          </div>
        )}
      </div>
    </div>
  );
}

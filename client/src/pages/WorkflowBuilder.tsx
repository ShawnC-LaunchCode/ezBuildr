/**
 * Workflow Builder - 3-pane layout
 * Sidebar: Section/Step tree | Canvas: Editor | Inspector: Properties/Blocks
 */

import { useParams } from "wouter";
import { useState } from "react";
import { Settings, Play, Eye, EyeOff, ChevronDown } from "lucide-react";
import { useWorkflow, useSections, useCreateRun, useWorkflowMode, useSetWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTree } from "@/components/builder/SidebarTree";
import { CanvasEditor } from "@/components/builder/CanvasEditor";
import { Inspector } from "@/components/builder/Inspector";
import { RunnerPreview } from "@/components/builder/RunnerPreview";
import { WorkflowSettings } from "@/components/builder/WorkflowSettings";
import { AdvancedModeBanner } from "@/components/builder/AdvancedModeBanner";
import { PageCanvas } from "@/components/builder/pages/PageCanvas";
import { DevPanel } from "@/components/devpanel/DevPanel";
import { UI_LABELS } from "@/lib/labels";
import { useToast } from "@/hooks/use-toast";
import { getModeLabel, type Mode } from "@/lib/mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function WorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { data: sections } = useSections(workflowId);
  const { data: workflowMode, isLoading: modeLoading } = useWorkflowMode(workflowId);
  const setWorkflowModeMutation = useSetWorkflowMode();
  const createRunMutation = useCreateRun();
  const { toast } = useToast();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    isPreviewOpen,
    previewRunId,
    startPreview,
    stopPreview,
  } = useWorkflowBuilder();

  const mode = workflowMode?.mode || 'easy';

  const handleStartPreview = async () => {
    if (!workflowId) return;

    try {
      const run = await createRunMutation.mutateAsync({ workflowId, metadata: { preview: true } });
      startPreview(run.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to start preview", variant: "destructive" });
    }
  };

  const handleModeChange = (newMode: Mode) => {
    if (!workflowId) return;

    setWorkflowModeMutation.mutate({ workflowId, modeOverride: newMode }, {
      onSuccess: () => {
        toast({
          title: "Mode updated",
          description: `Workflow mode set to ${newMode === 'easy' ? 'Easy' : 'Advanced'}.`,
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update workflow mode.",
          variant: "destructive",
        });
      },
    });
  };

  const handleClearOverride = () => {
    if (!workflowId) return;

    setWorkflowModeMutation.mutate({ workflowId, modeOverride: null }, {
      onSuccess: () => {
        toast({
          title: "Mode reset",
          description: "Using account default mode.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to clear mode override.",
          variant: "destructive",
        });
      },
    });
  };

  if (isLoading || modeLoading) {
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
            {sections?.length || 0} {sections?.length === 1 ? UI_LABELS.PAGE.toLowerCase() : UI_LABELS.PAGES.toLowerCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="mr-2">
                {getModeLabel(mode, workflowMode?.source || 'user')}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleModeChange('easy')}>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Switch to Easy</span>
                  <span className="text-xs text-muted-foreground">
                    Curated set of features
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleModeChange('advanced')}>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Switch to Advanced</span>
                  <span className="text-xs text-muted-foreground">
                    Full logic and all blocks
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClearOverride}>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Clear Override</span>
                  <span className="text-xs text-muted-foreground">
                    Use account default
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Workflow Settings</DialogTitle>
                <DialogDescription>
                  Configure settings for "{workflow.title}"
                </DialogDescription>
              </DialogHeader>
              <WorkflowSettings workflowId={workflowId!} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Advanced Mode Banner */}
      {mode === 'advanced' && (
        <div className="px-6 py-3">
          <AdvancedModeBanner />
        </div>
      )}

      {/* 3-Pane Layout + Dev Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Section/Step Tree */}
        <div className="w-64 border-r bg-card overflow-y-auto">
          <SidebarTree workflowId={workflowId!} />
        </div>

        {/* Canvas - Page Builder */}
        <div className={`flex-1 overflow-hidden ${isPreviewOpen ? 'border-r' : ''}`}>
          <PageCanvas workflowId={workflowId!} />
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

        {/* Dev Panel - Advanced Mode Only */}
        {mode === 'advanced' && (
          <DevPanel workflowId={workflowId!} />
        )}
      </div>
    </div>
  );
}

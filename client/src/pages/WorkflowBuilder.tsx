/**
 * Workflow Builder - Tabbed interface with Sections, Templates, Data Sources, Settings, Snapshots
 * PR1: Added tab-based navigation structure
 */

import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Settings, Play, Eye, EyeOff, ChevronDown, ArrowLeft } from "lucide-react";
import { useWorkflow, useSections, useCreateRun, useWorkflowMode, useSetWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { usePreviewStore } from "@/store/preview";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvancedModeBanner } from "@/components/builder/AdvancedModeBanner";
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

// Tab components
import { BuilderTabNav, type BuilderTab } from "@/components/builder/layout/BuilderTabNav";
import { SectionsTab } from "@/components/builder/tabs/SectionsTab";
import { TemplatesTab } from "@/components/builder/tabs/TemplatesTab";
import { DataSourcesTab } from "@/components/builder/tabs/DataSourcesTab";
import { SettingsTab } from "@/components/builder/tabs/SettingsTab";
import { SnapshotsTab } from "@/components/builder/tabs/SnapshotsTab";
import { ActivateToggle } from "@/components/builder/ActivateToggle";
import { CollectionsDrawer } from "@/components/builder/data-sources/CollectionsDrawer";

export default function WorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { data: sections } = useSections(workflowId);
  const { data: workflowMode, isLoading: modeLoading } = useWorkflowMode(workflowId);
  const setWorkflowModeMutation = useSetWorkflowMode();
  const createRunMutation = useCreateRun();
  const { toast } = useToast();

  const [launchingPreview, setLaunchingPreview] = useState(false);
  const [collectionsDrawerOpen, setCollectionsDrawerOpen] = useState(false);

  // Extract active tab from URL query params (default: sections)
  const searchParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState<BuilderTab>(
    (searchParams.get("tab") as BuilderTab) || "sections"
  );

  const { setToken } = usePreviewStore();

  const mode = workflowMode?.mode || 'easy';

  // Handle workflow status changes
  const handleStatusChange = (newStatus: "draft" | "open" | "closed") => {
    // Optimistically update the UI by refetching workflow data
    // The useWorkflow hook will automatically refetch with invalidation
    console.log("Workflow status changed to:", newStatus);
  };

  // Update URL when tab changes
  const handleTabChange = (tab: BuilderTab) => {
    setActiveTab(tab);
    const newUrl = `/workflows/${workflowId}/builder?tab=${tab}`;
    window.history.pushState({}, "", newUrl);
  };

  // Sync tab state with URL on mount and location changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabFromUrl = params.get("tab") as BuilderTab;
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location]);

  const handleStartPreview = async () => {
    if (!workflowId) return;

    try {
      setLaunchingPreview(true);
      const result = await createRunMutation.mutateAsync({
        workflowId,
        metadata: { preview: true }
      });

      // Extract runId and runToken from response
      const runId = result.data?.runId || (result as any).id;
      const runToken = result.data?.runToken || (result as any).runToken;

      if (!runId || !runToken) {
        throw new Error("Invalid response from server - missing runId or runToken");
      }

      // Store token in preview store
      setToken(runId, runToken);

      // Navigate to preview page
      navigate(`/preview/${runId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start preview",
        variant: "destructive"
      });
    } finally {
      setLaunchingPreview(false);
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
      {/* Header - Sticky at top */}
      <div className="sticky top-0 z-10 bg-background">
        {/* Top bar with title and controls */}
        <div className="border-b px-6 py-3 flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/workflows')}
              className="mr-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
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

            {/* Activate Toggle */}
            <div className="border-l pl-2 ml-2">
              <ActivateToggle
                workflowId={workflowId!}
                currentStatus={workflow.status}
                onStatusChange={handleStatusChange}
              />
            </div>

            {/* Preview Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartPreview}
              disabled={launchingPreview}
            >
              {launchingPreview ? (
                <>
                  <Play className="w-4 h-4 mr-2 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <BuilderTabNav
          workflowId={workflowId!}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </div>

      {/* Advanced Mode Banner */}
      {mode === 'advanced' && activeTab === 'sections' && (
        <div className="px-6 py-3">
          <AdvancedModeBanner />
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'sections' && (
          <SectionsTab workflowId={workflowId!} mode={mode} />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab workflowId={workflowId!} />
        )}
        {activeTab === 'data-sources' && (
          <DataSourcesTab
            workflowId={workflowId!}
            onConfigureCollections={() => setCollectionsDrawerOpen(true)}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab workflowId={workflowId!} />
        )}
        {activeTab === 'snapshots' && (
          <SnapshotsTab workflowId={workflowId!} />
        )}
      </div>

      {/* Collections Configuration Drawer */}
      <CollectionsDrawer
        open={collectionsDrawerOpen}
        onOpenChange={setCollectionsDrawerOpen}
        workflowId={workflowId!}
      />
    </div>
  );
}

/**
 * SectionsTab - Main workflow section/step builder view
 * This is the default/primary builder interface
 */

import { PageCanvas } from "@/components/builder/pages/PageCanvas";
import { RunnerPreview } from "@/components/builder/RunnerPreview";
import { SidebarTree } from "@/components/builder/SidebarTree";
import { DevPanel } from "@/components/devpanel/DevPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface SectionsTabProps {
  workflowId: string;
  mode: "easy" | "advanced";
}

const SIDEBAR_WIDTH_KEY = "builder-sidebar-width";

export function SectionsTab({ workflowId, mode }: SectionsTabProps) {
  const { isPreviewOpen, previewRunId } = useWorkflowBuilder();

  // Restore from localStorage or use default (20% of width)
  const defaultLayout = [20, 80];
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 2) {
        defaultLayout[0] = parsed[0];
        defaultLayout[1] = parsed[1];
      }
    }
  } catch (e) {
    console.warn("[SectionsTab] Failed to restore sidebar width from localStorage:", e);
  }

  const handleLayoutChange = (sizes: number[]) => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, JSON.stringify(sizes));
    } catch (e) {
      console.warn("[SectionsTab] Failed to save sidebar width to localStorage:", e);
    }
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex-1"
      onLayout={handleLayoutChange}
    >
      {/* Sidebar - Section/Step Tree */}
      <ResizablePanel
        defaultSize={defaultLayout[0]}
        minSize={15}
        maxSize={40}
        className="bg-card"
      >
        <div className="h-full overflow-y-auto border-r">
          <SidebarTree workflowId={workflowId} />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Canvas - Page Builder */}
      <ResizablePanel defaultSize={defaultLayout[1]}>
        <div className={`h-full overflow-hidden ${isPreviewOpen ? "border-r" : ""}`}>
          <PageCanvas workflowId={workflowId} />
        </div>

        {/* Preview Pane */}
        {isPreviewOpen && previewRunId && (
          <div className="absolute top-0 right-0 w-96 h-full bg-muted/30 overflow-y-auto border-l shadow-lg">
            <RunnerPreview runId={previewRunId} />
          </div>
        )}
      </ResizablePanel>

      {/* Dev Panel - Advanced Mode Only */}
      {mode === "advanced" && <DevPanel workflowId={workflowId} />}
    </ResizablePanelGroup>
  );
}

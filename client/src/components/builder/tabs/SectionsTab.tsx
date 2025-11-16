/**
 * SectionsTab - Main workflow section/step builder view
 * This is the default/primary builder interface
 */

import { SidebarTree } from "@/components/builder/SidebarTree";
import { PageCanvas } from "@/components/builder/pages/PageCanvas";
import { DevPanel } from "@/components/devpanel/DevPanel";
import { RunnerPreview } from "@/components/builder/RunnerPreview";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface SectionsTabProps {
  workflowId: string;
  mode: "easy" | "advanced";
}

export function SectionsTab({ workflowId, mode }: SectionsTabProps) {
  const { isPreviewOpen, previewRunId } = useWorkflowBuilder();

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar - Section/Step Tree */}
      <div className="w-64 border-r bg-card overflow-y-auto">
        <SidebarTree workflowId={workflowId} />
      </div>

      {/* Canvas - Page Builder */}
      <div className={`flex-1 overflow-hidden ${isPreviewOpen ? "border-r" : ""}`}>
        <PageCanvas workflowId={workflowId} />
      </div>

      {/* Preview Pane */}
      {isPreviewOpen && previewRunId && (
        <div className="w-96 bg-muted/30 overflow-y-auto">
          <RunnerPreview runId={previewRunId} />
        </div>
      )}

      {/* Dev Panel - Advanced Mode Only */}
      {mode === "advanced" && <DevPanel workflowId={workflowId} />}
    </div>
  );
}

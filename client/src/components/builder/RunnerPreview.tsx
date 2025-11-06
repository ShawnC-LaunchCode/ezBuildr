/**
 * Runner Preview - Embedded preview of the runner in builder
 */

import { WorkflowRunner } from "@/pages/WorkflowRunner";

export function RunnerPreview({ runId }: { runId: string }) {
  return (
    <div className="h-full bg-background">
      <div className="border-b px-4 py-2 bg-muted/50">
        <p className="text-xs font-medium text-muted-foreground">Preview Mode</p>
      </div>
      <div className="h-full overflow-y-auto">
        <WorkflowRunner runId={runId} isPreview={true} />
      </div>
    </div>
  );
}

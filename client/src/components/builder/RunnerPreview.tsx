/**
 * Runner Preview - Embedded preview of the runner in builder
 */

import { X, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WorkflowRunner } from "@/pages/WorkflowRunner";
import { useWorkflowBuilder } from "@/store/workflow-builder";

export function RunnerPreview({ runId }: { runId: string }) {
  const { stopPreview } = useWorkflowBuilder();

  return (
    <div className="h-full bg-background flex flex-col">
      <div className="border-b px-4 py-3 bg-amber-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-amber-100 text-amber-700 p-1 rounded">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-none">Preview Mode</p>
            <p className="text-[10px] text-muted-foreground mt-1">Viewing as a client would see it</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={stopPreview}
          className="h-8 text-xs bg-white"
        >
          <X className="w-3 h-3 mr-1" />
          Return to Builder
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        <div className="max-w-4xl mx-auto shadow-sm min-h-full bg-white border-x border-slate-100">
          <WorkflowRunner runId={runId} isPreview={true} />
        </div>
      </div>
    </div>
  );
}

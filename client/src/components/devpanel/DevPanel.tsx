/**
 * DevPanel Component
 * Floating development panel for Advanced mode
 * Wrapper for UnifiedDevPanel to connect store and live data
 */

import React, { useEffect, useState } from "react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkflowVariablesLive } from "@/hooks/useWorkflowVariablesLive";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";
import { useDevPanel } from "@/store/devpanel";

import { ExecutionTimeline } from "./ExecutionTimeline";
import { UnifiedDevPanel } from "./UnifiedDevPanel";
import { VariableList } from "./VariableList";


interface DevPanelProps {
  workflowId: string;
  className?: string;
  previewEnvironment?: PreviewEnvironment | null;
}

export function DevPanel({ workflowId, className, previewEnvironment }: DevPanelProps) {
  const { isOpen: openState, setIsOpen } = useDevPanel();
  const isOpen = openState[workflowId] ?? true; // Default to open
  const [activeTab, setActiveTab] = useState("variables");

  // Fetch variables with live sync
  const { data: variables = [], isLoading } = useWorkflowVariablesLive(workflowId);

  // Fetch trace from preview environment if available
  const previewState = usePreviewEnvironment(previewEnvironment || null);
  const trace = previewState?.trace || [];

  // Initialize panel state if not set
  useEffect(() => {
    if (openState[workflowId] === undefined) {
      setIsOpen(workflowId, true);
    }
  }, [workflowId, openState, setIsOpen]);

  return (
    <UnifiedDevPanel
      workflowId={workflowId}
      isOpen={isOpen}
      onToggle={() => setIsOpen(workflowId, !isOpen)}
      className={className}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-4 py-2 border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="execution">Execution</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="variables" className="flex-1 overflow-hidden data-[state=inactive]:hidden mt-0">
          <VariableList
            workflowId={workflowId}
            variables={variables}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="execution" className="flex-1 overflow-hidden data-[state=inactive]:hidden mt-0">
          <ExecutionTimeline
            trace={trace}
          />
        </TabsContent>
      </Tabs>
    </UnifiedDevPanel>
  );
}

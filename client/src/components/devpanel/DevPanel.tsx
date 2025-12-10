/**
 * DevPanel Component
 * Floating development panel for Advanced mode
 * Wrapper for UnifiedDevPanel to connect store and live data
 */

import { useEffect } from "react";
import { useDevPanel } from "@/store/devpanel";
import { useWorkflowVariablesLive } from "@/hooks/useWorkflowVariablesLive";
import { UnifiedDevPanel } from "./UnifiedDevPanel";
import { VariableList } from "./VariableList";

interface DevPanelProps {
  workflowId: string;
  className?: string;
}

export function DevPanel({ workflowId, className }: DevPanelProps) {
  const { isOpen: openState, setIsOpen } = useDevPanel();
  const isOpen = openState[workflowId] ?? true; // Default to open

  // Fetch variables with live sync
  const { data: variables = [], isLoading } = useWorkflowVariablesLive(workflowId);

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
      <VariableList
        workflowId={workflowId}
        variables={variables}
        isLoading={isLoading}
      />
    </UnifiedDevPanel>
  );
}

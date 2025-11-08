/**
 * Inspector - Right panel with tabs for Properties, Blocks, Logic
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { BlocksPanel } from "./BlocksPanel";
import { TransformBlocksPanel } from "./TransformBlocksPanel";
import { StepPropertiesPanel } from "./StepPropertiesPanel";
import { Settings, Blocks, GitBranch, Code } from "lucide-react";

export function Inspector({ workflowId }: { workflowId: string }) {
  const { inspectorTab, setInspectorTab, selection } = useWorkflowBuilder();

  if (!selection) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Select an element to view its properties
        </p>
      </div>
    );
  }

  // Determine which properties panel to show based on selection type
  const renderPropertiesPanel = () => {
    if (selection.type === "step") {
      // We need the sectionId to update the step, which we can get from the step data
      // For now, we'll pass it through. The StepPropertiesPanel will fetch the step and get sectionId
      return <StepPropertiesPanel stepId={selection.id} sectionId="" />;
    } else if (selection.type === "section") {
      return (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Section properties can be edited directly in the canvas.
          </p>
        </div>
      );
    } else if (selection.type === "block") {
      return (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Block properties can be edited by clicking on the block in the Blocks tab.
          </p>
        </div>
      );
    }

    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          Select a question to edit its properties.
        </p>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={inspectorTab} onValueChange={(v: any) => setInspectorTab(v)} className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-4 m-2">
          <TabsTrigger value="properties" className="text-xs">
            <Settings className="w-3 h-3 mr-1" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="blocks" className="text-xs">
            <Blocks className="w-3 h-3 mr-1" />
            Blocks
          </TabsTrigger>
          <TabsTrigger value="transform" className="text-xs">
            <Code className="w-3 h-3 mr-1" />
            Transform
          </TabsTrigger>
          <TabsTrigger value="logic" className="text-xs">
            <GitBranch className="w-3 h-3 mr-1" />
            Logic
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="flex-1 overflow-y-auto">
          {renderPropertiesPanel()}
        </TabsContent>

        <TabsContent value="blocks" className="flex-1 overflow-y-auto">
          <BlocksPanel workflowId={workflowId} />
        </TabsContent>

        <TabsContent value="transform" className="flex-1 overflow-y-auto">
          <TransformBlocksPanel workflowId={workflowId} />
        </TabsContent>

        <TabsContent value="logic" className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Logic rules coming soon... When implemented, use VariableSelect component from components/common/VariableSelect.tsx to allow selecting variables by alias or key.
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Available features:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Variables API: GET /api/workflows/:id/variables</li>
                <li>Hook: useWorkflowVariables(workflowId)</li>
                <li>Component: VariableSelect with alias/key display</li>
                <li>Resolver: server/utils/variableResolver.ts</li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

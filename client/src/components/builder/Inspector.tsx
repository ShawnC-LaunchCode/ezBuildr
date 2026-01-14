/**
 * Inspector - Right panel with tabs for Properties, Blocks, Logic
 */

import { Settings, Blocks, GitBranch, Code } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { BlocksPanel } from "./BlocksPanel";
// const BlocksPanel = ({ workflowId }: { workflowId: string }) => <div className="p-4 text-sm text-muted-foreground">Blocks Panel is currently unavailable.</div>;
import { LogicPanel } from "./LogicPanel";
import { StepPropertiesPanel } from "./StepPropertiesPanel";
import { TransformBlocksPanel } from "./TransformBlocksPanel";

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

        <TabsContent value="logic" className="flex-1 overflow-y-auto">
          <LogicPanel workflowId={workflowId} selection={selection} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

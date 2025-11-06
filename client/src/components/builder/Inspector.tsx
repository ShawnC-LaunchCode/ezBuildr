/**
 * Inspector - Right panel with tabs for Properties, Blocks, Logic
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { BlocksPanel } from "./BlocksPanel";
import { TransformBlocksPanel } from "./TransformBlocksPanel";
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

        <TabsContent value="properties" className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Edit properties in the canvas area →
            </p>
          </div>
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
              Logic rules coming soon...
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

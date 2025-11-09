/**
 * DevPanel Component
 * Floating development panel for Advanced mode
 * Shows variables, console, and data map tabs
 */

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Code2, Terminal, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDevPanel } from "@/store/devpanel";
import { useWorkflowVariablesLive } from "@/hooks/useWorkflowVariablesLive";
import { VariableList } from "./VariableList";

interface DevPanelProps {
  workflowId: string;
  className?: string;
}

export function DevPanel({ workflowId, className }: DevPanelProps) {
  const { isOpen: openState, setIsOpen, activeTab, setActiveTab } = useDevPanel();
  const isOpen = openState[workflowId] ?? true; // Default to open
  const currentTab = activeTab[workflowId] ?? "variables";

  // Fetch variables with live sync
  const { data: variables = [], isLoading } = useWorkflowVariablesLive(workflowId);

  // Initialize panel state if not set
  useEffect(() => {
    if (openState[workflowId] === undefined) {
      setIsOpen(workflowId, true);
    }
  }, [workflowId, openState, setIsOpen]);

  const handleToggle = () => {
    setIsOpen(workflowId, !isOpen);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(workflowId, tab as "variables" | "console" | "datamap");
  };

  return (
    <div
      className={cn(
        "flex h-full border-l bg-background transition-all duration-300",
        isOpen ? "w-[360px]" : "w-0",
        className
      )}
    >
      {/* Collapse/Expand Button */}
      <div className="relative">
        <Button
          size="icon"
          variant="ghost"
          className="absolute -left-8 top-3 h-8 w-8 z-10 bg-background border shadow-sm"
          onClick={handleToggle}
          title={isOpen ? "Collapse Dev Panel" : "Expand Dev Panel"}
        >
          {isOpen ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Panel Content */}
      {isOpen && (
        <div className="flex flex-col w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              <h3 className="font-semibold text-sm">Dev Tools</h3>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            value={currentTab}
            onValueChange={handleTabChange}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <TabsList className="w-full justify-start rounded-none border-b h-10">
              <TabsTrigger value="variables" className="flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5" />
                <span>Variables</span>
              </TabsTrigger>
              <TabsTrigger value="console" className="flex items-center gap-1.5" disabled>
                <Terminal className="h-3.5 w-3.5" />
                <span>Console</span>
              </TabsTrigger>
              <TabsTrigger value="datamap" className="flex items-center gap-1.5" disabled>
                <Map className="h-3.5 w-3.5" />
                <span>Data Map</span>
              </TabsTrigger>
            </TabsList>

            {/* Variables Tab */}
            <TabsContent value="variables" className="flex-1 overflow-hidden m-0">
              <VariableList
                workflowId={workflowId}
                variables={variables}
                isLoading={isLoading}
              />
            </TabsContent>

            {/* Console Tab (Future) */}
            <TabsContent value="console" className="flex-1 overflow-hidden m-0">
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <Terminal className="h-12 w-12 mb-3 opacity-50" />
                <p className="font-medium">Console Coming Soon</p>
                <p className="text-xs mt-2">
                  Stream JS block executions and errors in real-time
                </p>
              </div>
            </TabsContent>

            {/* Data Map Tab (Future) */}
            <TabsContent value="datamap" className="flex-1 overflow-hidden m-0">
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <Map className="h-12 w-12 mb-3 opacity-50" />
                <p className="font-medium">Data Map Coming Soon</p>
                <p className="text-xs mt-2">
                  Visualize workflow data flow during Preview/Run mode
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

/**
 * PreviewSidebar - Collapsible right panel for preview mode
 * Contains Snapshots and Dev tabs
 */

import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, Camera, Code2, Sparkles, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { snapshotAPI } from "@/lib/vault-api";
import type { ApiStep } from "@/lib/vault-api";

/**
 * AliasedJsonViewer - Display JSON with aliases and UUID tooltips
 */
interface AliasedJsonViewerProps {
  data: Record<string, any>;
  stepIdToAlias: Record<string, { alias: string | null; title: string }>;
  formValues: Record<string, any>;
}

function AliasedJsonViewer({ data, stepIdToAlias, formValues }: AliasedJsonViewerProps) {
  // Find original UUID for a given display key (alias or UUID)
  const findUuidForKey = (displayKey: string): string | null => {
    // First check if it's already a UUID
    if (formValues[displayKey] !== undefined) {
      return displayKey;
    }
    // Otherwise find by alias
    const entry = Object.entries(stepIdToAlias).find(([_, info]) => info.alias === displayKey);
    return entry ? entry[0] : null;
  };

  const renderValue = (value: any, indent: number = 0): JSX.Element => {
    const indentStr = "  ".repeat(indent);

    if (value === null) {
      return <span className="text-muted-foreground">null</span>;
    }

    if (typeof value === "boolean") {
      return <span className="text-blue-400">{value.toString()}</span>;
    }

    if (typeof value === "number") {
      return <span className="text-green-400">{value}</span>;
    }

    if (typeof value === "string") {
      return <span className="text-yellow-400">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span>[]</span>;
      }
      return (
        <span>
          {"[\n"}
          {value.map((item, i) => (
            <span key={i}>
              {indentStr}  {renderValue(item, indent + 1)}
              {i < value.length - 1 ? "," : ""}
              {"\n"}
            </span>
          ))}
          {indentStr}]
        </span>
      );
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <span>{"{}"}</span>;
      }
      return (
        <span>
          {"{}\n"}
          {entries.map(([k, v], i) => (
            <span key={k}>
              {indentStr}  "{k}": {renderValue(v, indent + 1)}
              {i < entries.length - 1 ? "," : ""}
              {"\n"}
            </span>
          ))}
          {indentStr}{"}"}
        </span>
      );
    }

    return <span>{String(value)}</span>;
  };

  const entries = Object.entries(data);

  return (
    <TooltipProvider>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[600px] font-mono">
        <code>
          {"{\n"}
          {entries.map(([key, value], index) => {
            const uuid = findUuidForKey(key);
            const stepInfo = uuid ? stepIdToAlias[uuid] : null;
            const hasAlias = stepInfo?.alias !== null;

            const keyElement = (
              <span className="text-cyan-400 cursor-help">
                "{key}"
              </span>
            );

            return (
              <span key={key}>
                {"  "}
                {hasAlias && uuid ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {keyElement}
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <div><strong>Alias:</strong> {stepInfo?.alias}</div>
                        <div><strong>UUID:</strong> <code className="text-[10px]">{uuid}</code></div>
                        <div><strong>Title:</strong> {stepInfo?.title}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  keyElement
                )}
                {": "}
                {renderValue(value, 1)}
                {index < entries.length - 1 ? "," : ""}
                {"\n"}
              </span>
            );
          })}
          {"}"}
        </code>
      </pre>
    </TooltipProvider>
  );
}

interface PreviewSidebarProps {
  workflowId: string;
  runId: string;
  runToken: string;
  formValues: Record<string, any>;
  allWorkflowSteps: ApiStep[];
}

export function PreviewSidebar({
  workflowId,
  runId,
  runToken,
  formValues,
  allWorkflowSteps,
}: PreviewSidebarProps) {
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Create UUID → alias mapping
  const stepIdToAlias = useMemo(() => {
    const map: Record<string, { alias: string | null; title: string }> = {};
    allWorkflowSteps.forEach(step => {
      map[step.id] = {
        alias: step.alias || null,
        title: step.title
      };
    });
    return map;
  }, [allWorkflowSteps]);

  // Transform formValues to use aliases as keys
  const displayValues = useMemo(() => {
    const transformed: Record<string, any> = {};
    Object.entries(formValues).forEach(([stepId, value]) => {
      const stepInfo = stepIdToAlias[stepId];
      const displayKey = stepInfo?.alias || stepId;
      transformed[displayKey] = value;
    });
    return transformed;
  }, [formValues, stepIdToAlias]);

  // Handle save snapshot
  const handleSaveSnapshot = async () => {
    if (!snapshotName.trim()) {
      toast({
        title: "Error",
        description: "Snapshot name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Create the snapshot first
      const snapshot = await snapshotAPI.create(workflowId, snapshotName.trim());

      // Then save the current run values to it
      await snapshotAPI.saveFromRun(workflowId, snapshot.id, runId);

      toast({
        title: "Success",
        description: `Snapshot "${snapshotName}" saved`,
      });

      setSnapshotName("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save snapshot",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle generate snapshot with AI
  const handleGenerateSnapshot = async () => {
    // TODO: Implement AI-generated snapshot creation
    toast({
      title: "Coming Soon",
      description: "AI-generated snapshots will be available soon",
    });
  };

  if (isCollapsed) {
    return (
      <div className="fixed right-0 top-0 bottom-0 flex items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCollapsed(false)}
          className="rounded-l-md rounded-r-none h-24"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-background border-l shadow-lg flex flex-col">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Preview Tools</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="snapshots" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="snapshots" className="flex-1">
            <Camera className="w-4 h-4 mr-2" />
            Snapshots
          </TabsTrigger>
          <TabsTrigger value="dev" className="flex-1">
            <Code2 className="w-4 h-4 mr-2" />
            Dev
          </TabsTrigger>
        </TabsList>

        {/* Snapshots Tab */}
        <TabsContent value="snapshots" className="flex-1 overflow-auto p-4 space-y-4">
          {/* Save Snapshot Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Save as Snapshot</CardTitle>
              <CardDescription>
                Save current form data as a test snapshot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="snapshot-name">Snapshot Name</Label>
                <Input
                  id="snapshot-name"
                  placeholder="e.g., Test Case 1"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveSnapshot()}
                />
              </div>
              <Button
                onClick={handleSaveSnapshot}
                disabled={isSaving || !snapshotName.trim()}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Snapshot"}
              </Button>
            </CardContent>
          </Card>

          {/* Generate Snapshot Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate Snapshot</CardTitle>
              <CardDescription>
                Use AI to generate realistic test data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGenerateSnapshot}
                variant="secondary"
                className="w-full"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate with AI
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dev Tab */}
        <TabsContent value="dev" className="flex-1 overflow-auto p-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Form Data (JSON)</CardTitle>
              <CardDescription>
                Real-time view of current form values. Hover over aliases to see UUIDs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AliasedJsonViewer
                data={displayValues}
                stepIdToAlias={stepIdToAlias}
                formValues={formValues}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

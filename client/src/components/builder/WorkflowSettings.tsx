/**
 * Workflow Settings Dialog
 * Allows users to configure workflow-specific settings including mode toggle
 */

import { Loader2, Code2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowMode, useSetWorkflowMode } from "@/lib/vault-hooks";

interface WorkflowSettingsProps {
  workflowId: string;
}

export function WorkflowSettings({ workflowId }: WorkflowSettingsProps) {
  const { data: modeData, isLoading } = useWorkflowMode(workflowId);
  const setModeMutation = useSetWorkflowMode();
  const { toast } = useToast();

  const mode = modeData?.mode ?? "easy";
  const source = modeData?.source ?? "user";

  const handleModeSwitch = async (targetMode: "easy" | "advanced") => {
    if (mode === targetMode) {return;}

    try {
      await setModeMutation.mutateAsync({
        workflowId,
        modeOverride: targetMode
      });

      toast({
        title: targetMode === "easy" ? "Easy Mode Active" : "Advanced Mode Unlocked",
        description: targetMode === "easy"
          ? "Simplified interface enabled. Advanced features are hidden."
          : "You now have access to logic, scripting, and data tools.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update workflow mode.",
        variant: "destructive",
      });
    }
  };

  const handleClearOverride = async () => {
    if (source === "user") {return;}

    try {
      await setModeMutation.mutateAsync({
        workflowId,
        modeOverride: null
      });

      toast({
        title: "Mode reset",
        description: "Now using your account's default mode.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear mode override.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Workflow Mode Card */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Workflow Mode
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            Switch between Easy and Advanced modes.
            Advanced mode unlocks JS blocks and full logic control.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Current Mode Display */}
          <div>
            <Label className="text-sm font-medium">Current Mode</Label>
            <div className="mt-2 flex items-center gap-2">
              {mode === "advanced" ? (
                <>
                  <Code2 className="h-5 w-5 text-violet-500" />
                  <span className="text-lg font-semibold text-violet-500">Advanced</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 text-slate-600" />
                  <span className="text-lg font-semibold text-slate-600">Easy</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {source === "workflow"
                ? "Mode overridden for this workflow"
                : "Using your account's default mode"}
            </p>
          </div>

          {/* Mode Toggle Buttons */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Switch Mode</Label>
            <div className="flex gap-3">
              <Button
                size="default"
                variant={mode === "easy" ? "default" : "outline"}
                onClick={() => handleModeSwitch("easy")}
                disabled={setModeMutation.isPending || mode === "easy"}
                className="flex-1"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Easy
              </Button>
              <Button
                size="default"
                variant={mode === "advanced" ? "default" : "outline"}
                onClick={() => handleModeSwitch("advanced")}
                disabled={setModeMutation.isPending || mode === "advanced"}
                className="flex-1"
              >
                <Code2 className="h-4 w-4 mr-2" />
                Advanced
              </Button>
            </div>
          </div>

          {/* Reset to Default Button */}
          {source === "workflow" && (
            <div className="pt-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearOverride}
                disabled={setModeMutation.isPending}
                className="w-full"
              >
                Clear Override & Use Account Default
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future Settings Cards Can Go Here */}
    </div>
  );
}

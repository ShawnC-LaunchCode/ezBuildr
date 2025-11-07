/**
 * Logic Add Menu Component
 * Dropdown menu for adding logic blocks (prefill, validate, branch, js)
 * JS blocks only available in Advanced mode
 */

import { Code2, Database, CheckCircle, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateBlock, useWorkflowMode } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { isFeatureAllowed } from "@/lib/mode";
import { UI_LABELS } from "@/lib/labels";

interface LogicAddMenuProps {
  workflowId: string;
  sectionId: string;
  nextOrder: number;
}

const LOGIC_TYPES = {
  easy: [
    {
      type: "prefill" as const,
      label: "Prefill Data",
      icon: Database,
      description: "Set default values for questions",
    },
    {
      type: "validate" as const,
      label: "Validate Input",
      icon: CheckCircle,
      description: "Check if answers meet criteria",
    },
    {
      type: "branch" as const,
      label: "Branch Logic",
      icon: GitBranch,
      description: "Show/hide pages based on answers",
    },
  ],
  advanced: [
    {
      type: "js" as const,
      label: "JS Transform",
      icon: Code2,
      description: "Custom JavaScript logic",
    },
  ],
};

export function LogicAddMenu({ workflowId, sectionId, nextOrder }: LogicAddMenuProps) {
  const createBlockMutation = useCreateBlock();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const { toast } = useToast();
  const { selectBlock } = useWorkflowBuilder();

  const mode = workflowMode?.mode || "easy";
  const showAdvanced = isFeatureAllowed(mode, "js");

  const handleAddLogic = async (type: "prefill" | "validate" | "branch" | "js") => {
    try {
      let config = {};
      let phase: any = "onSectionEnter";

      // Set default config based on type
      if (type === "prefill") {
        config = { mode: "static", staticMap: {} };
        phase = "onSectionEnter";
      } else if (type === "validate") {
        config = { rules: [] };
        phase = "onSectionSubmit";
      } else if (type === "branch") {
        config = { conditions: [], targetSectionId: null };
        phase = "onSectionSubmit";
      } else if (type === "js") {
        config = {
          code: "// Write your custom JavaScript here\n// Access variables via input.variableName\n// Return an object with your transformed data\n\nreturn {\n  // your computed values\n};",
          inputKeys: [],
          outputKey: "computed_value",
          timeoutMs: 1000,
        };
        phase = "onSectionSubmit";
      }

      const block = await createBlockMutation.mutateAsync({
        workflowId,
        sectionId,
        type,
        phase,
        config,
        enabled: true,
        order: nextOrder,
      });

      // Select the newly created block
      selectBlock(block.id);

      toast({
        title: "Logic block added",
        description: `${LOGIC_TYPES.easy.find((t) => t.type === type)?.label || LOGIC_TYPES.advanced.find((t) => t.type === type)?.label} created`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create logic block",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Code2 className="w-3 h-3 mr-1" />
          {UI_LABELS.ADD_LOGIC}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {LOGIC_TYPES.easy.map((logic) => {
          const Icon = logic.icon;
          return (
            <DropdownMenuItem
              key={logic.type}
              onClick={() => handleAddLogic(logic.type)}
            >
              <div className="flex items-start gap-2">
                <Icon className="w-4 h-4 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{logic.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {logic.description}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}

        {showAdvanced && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Advanced
            </div>
            {LOGIC_TYPES.advanced.map((logic) => {
              const Icon = logic.icon;
              return (
                <DropdownMenuItem
                  key={logic.type}
                  onClick={() => handleAddLogic(logic.type)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{logic.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {logic.description}
                      </div>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

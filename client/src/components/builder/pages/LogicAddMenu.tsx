/**
 * Logic Add Menu Component
 * Dropdown menu for adding logic blocks (new data blocks + advanced)
 */

import { Code2, Database, Save, Send, Sparkles, GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { UI_LABELS } from "@/lib/labels";
import { isFeatureAllowed } from "@/lib/mode";
import { useCreateBlock, useCreateTransformBlock, useWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface LogicAddMenuProps {
  workflowId: string;
  sectionId: string;
  nextOrder: number;
}

const LOGIC_TYPES = {
  easy: [
    {
      type: "read_table" as const,
      label: "Read from Table",
      icon: Database,
      description: "Query rows from DataVault",
    },
    {
      type: "write" as const,
      label: "Send Data to Table",
      icon: Save,
      description: "Save data to a DataVault table",
    },
    {
      type: "external_send" as const,
      label: "Send Data to API",
      icon: Send,
      description: "Send payload to external API",
    },
    {
      type: "list_tools" as const,
      label: "List Tools",
      icon: Sparkles,
      description: "Filter, sort and transform lists",
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
  const createTransformBlockMutation = useCreateTransformBlock();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const { toast } = useToast();
  const { selectBlock } = useWorkflowBuilder();

  const mode = workflowMode?.mode || "easy";
  const showAdvanced = isFeatureAllowed(mode, "js");

  const handleAddLogic = async (type: string) => {
    try {
      // Handle JS blocks differently
      if (type === "js") {
        const block = await createTransformBlockMutation.mutateAsync({
          workflowId,
          sectionId,
          name: "JS Transform",
          language: "javascript" as const,
          phase: "onSectionSubmit",
          code: "// Write your custom JavaScript here\n// Access variables via input.variableName\n// Return an object with your transformed data\n\nreturn {\n  // your computed values\n};",
          inputKeys: [],
          outputKey: "computed_value",
          timeoutMs: 1000,
          enabled: true,
          order: nextOrder,
        });
        selectBlock(block.id);
        toast({ title: "Logic block added", description: "JS Transform created" });
        return;
      }

      // Handle regular blocks
      let config = {};
      let phase: "onSectionEnter" | "onSectionSubmit" = "onSectionSubmit";
      const blockType = type as any;

      // New Block Defaults
      if (type === 'write') {
        config = {
          mode: 'upsert',
          dataSourceId: '',
          tableId: '',
          columnMappings: [],
          matchStrategy: undefined
        };
      } else if (type === 'read_table') {
        config = {
          dataSourceId: '',
          tableId: '',
          outputKey: 'list_data',
          filters: []
        };
        phase = 'onSectionEnter';
      } else if (type === 'external_send') {
        config = {
          destinationId: '',
          payloadMappings: []
        };
      } else if (type === 'list_tools') {
        config = {
          inputKey: '',
          operation: 'filter',
          outputKey: 'processed_list'
        };
      } else if (type === 'branch') {
        config = { conditions: [], targetSectionId: null };
      }

      const block = await createBlockMutation.mutateAsync({
        workflowId,
        sectionId,
        type: blockType,
        phase,
        config,
        enabled: true,
        order: nextOrder,
      });

      selectBlock(block.id);

      const label = [...LOGIC_TYPES.easy, ...LOGIC_TYPES.advanced].find((t) => t.type === type)?.label;
      toast({
        title: "Logic block added",
        description: `${label} created`,
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

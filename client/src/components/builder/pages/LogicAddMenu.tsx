/**
 * Logic Add Menu Component
 * Dropdown menu for adding data and list logic blocks
 */
import { Code2, Database, Save, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { UI_LABELS } from "@/lib/labels";
import { useCreateBlock } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { NEW_BLOCK_DEFAULTS, type LogicBlockType } from "./newBlockDefaults";

interface LogicAddMenuProps {
  workflowId: string;
  pageId: string;
  nextOrder: number;
}

/**
 * The menu's entries. Typing `type` as `LogicBlockType` keeps this list and
 * `NEW_BLOCK_DEFAULTS` from drifting apart (LIST-B16).
 */
const LOGIC_TYPES: {
  easy: Array<{
    type: LogicBlockType;
    label: string;
    icon: typeof Database;
    description: string;
  }>;
} = {
  easy: [
    {
      type: "read_table",
      label: "Read from Table",
      icon: Database,
      description: "Query rows from DataVault",
    },
    {
      type: "write",
      label: "Send Data to Table",
      icon: Save,
      description: "Save data to a DataVault table",
    },
    {
      type: "external_send",
      label: "Send Data to API",
      icon: Send,
      description: "Send payload to external API",
    },
    {
      type: "list_tools",
      label: "List Tools",
      icon: Sparkles,
      description: "Filter, sort and transform lists",
    },
  ],
};

export function LogicAddMenu({ workflowId, pageId, nextOrder }: LogicAddMenuProps) {
  const createBlockMutation = useCreateBlock();
  const { toast } = useToast();
  const { selectBlock } = useWorkflowBuilder();

  const handleAddLogic = async (type: LogicBlockType) => {
    try {
      const { config, phase } = NEW_BLOCK_DEFAULTS[type];

      const block = await createBlockMutation.mutateAsync({
        workflowId,
        pageId,
        type,
        phase,
        config,
        enabled: true,
        order: nextOrder,
      });

      selectBlock(block.id);

      const label = LOGIC_TYPES.easy.find((t) => t.type === type)?.label;
      toast({
        title: "Logic block added",
        description: `${label ?? type} created`,
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
              onClick={() => { void handleAddLogic(logic.type); }}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
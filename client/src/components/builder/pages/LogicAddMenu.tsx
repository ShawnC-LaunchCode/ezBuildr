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
import { BlockPhase, BlockType } from "@/lib/vault-api";
import { useCreateBlock } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface LogicAddMenuProps {
  workflowId: string;
  pageId: string;
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
};

export function LogicAddMenu({ workflowId, pageId, nextOrder }: LogicAddMenuProps) {
  const createBlockMutation = useCreateBlock();
  const { toast } = useToast();
  const { selectBlock } = useWorkflowBuilder();

  const handleAddLogic = async (type: string) => {
    try {
      // Handle regular blocks
      let config: Record<string, unknown> = {};
      let phase: BlockPhase = "onPageSubmit";
      const blockType = type as BlockType;

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
        phase = 'onPageEnter';
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
        config = { conditions: [], targetPageId: null };
      }

      const block = await createBlockMutation.mutateAsync({
        workflowId,
        pageId,
        type: blockType,
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
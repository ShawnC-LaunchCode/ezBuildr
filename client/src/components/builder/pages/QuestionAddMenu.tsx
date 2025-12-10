/**
 * Question Add Menu Component
 * Dropdown menu for adding different question types to a page
 *
 * Uses the centralized Block Registry for block types and mode filtering
 *
 * @version 2.0.0 - Block System Overhaul
 */

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateStep, useWorkflowMode } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import {
  getBlocksByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type BlockRegistryEntry,
} from "@/lib/blockRegistry";

interface QuestionAddMenuProps {
  sectionId: string;
  nextOrder: number;
  workflowId: string;
}

export function QuestionAddMenu({ sectionId, nextOrder, workflowId }: QuestionAddMenuProps) {
  const createStepMutation = useCreateStep();
  const { toast } = useToast();
  const { selectStep } = useWorkflowBuilder();
  const { data: workflowMode } = useWorkflowMode(workflowId);

  const mode = workflowMode?.mode || "easy";

  const handleAddQuestion = async (block: BlockRegistryEntry) => {
    try {
      // Generate default config
      const config = block.createDefaultConfig();

      // Create the step
      const step = await createStepMutation.mutateAsync({
        sectionId,
        type: block.type as any, // Cast to any to avoid strict StepType mismatch until registry is fully typed
        title: `New ${block.label}`,
        description: null,
        required: false,
        alias: null,
        options: config || null,
        config: config || {},
        order: nextOrder,
      });

      // Select the newly created step
      selectStep(step.id);

      toast({
        title: "Question added",
        description: `${block.label} question created`,
      });
    } catch (error) {
      console.error("Failed to create question:", error);
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    }
  };

  // Get blocks grouped by category for the current mode
  const blocksByCategory = getBlocksByCategory(mode);

  // Filter out empty categories and sort by defined order
  const orderedCategories = CATEGORY_ORDER.filter(
    (category) => blocksByCategory[category]?.length > 0
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-[600px] overflow-y-auto">
        {orderedCategories.map((category, categoryIndex) => (
          <div key={category}>
            {categoryIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </DropdownMenuLabel>
            {blocksByCategory[category].map((block) => {
              const Icon = block.icon;
              return (
                <DropdownMenuItem
                  key={block.type}
                  onClick={() => handleAddQuestion(block)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{block.label}</span>
                    {block.description && (
                      <span className="text-xs text-muted-foreground">
                        {block.description}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

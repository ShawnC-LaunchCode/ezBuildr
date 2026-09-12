/**
 * Question Add Menu Component
 * Dropdown menu for adding different question types to a page
 *
 * Uses the centralized Block Registry for block types and mode filtering
 *
 * @version 2.0.0 - Block System Overhaul
 */

import { Plus } from "lucide-react";

import { QuestionTypeIcon } from "@/components/shared/QuestionTypeIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  getBlocksByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type BlockRegistryEntry,
} from "@/lib/blockRegistry";
import { StepType } from "@/lib/vault-api";
import { useCreateStep, useWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface QuestionAddMenuProps {
  pageId: string;
  nextOrder: number;
  workflowId: string;
}

export function QuestionAddMenu({
  pageId,
  nextOrder,
  workflowId,
}: QuestionAddMenuProps) {
  const createStepMutation = useCreateStep();
  const { toast } = useToast();
  const { selectStep } = useWorkflowBuilder();
  const { data: workflowMode } = useWorkflowMode(workflowId);

  const mode = workflowMode?.mode ?? "easy";

  const handleAddQuestion = async (block: BlockRegistryEntry): Promise<void> => {
    try {
      // Generate default config
      const config = block.createDefaultConfig();

      // Create the step
      const step = await createStepMutation.mutateAsync({
        pageId,
        type: block.type as StepType,
        title: `New ${block.label}`,
        description: null,
        required: false,
        alias: null,
        config: config ?? {},
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
    (category) => (blocksByCategory[category]?.length ?? 0) > 0
  );
  const categoryColumns = [
    orderedCategories.filter((_, index) => index % 2 === 0),
    orderedCategories.filter((_, index) => index % 2 === 1),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[36rem] max-w-[calc(100vw-2rem)] p-2"
      >
        <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
          {categoryColumns.map((categories, columnIndex) => (
            <div
              key={columnIndex}
              data-testid="question-category-column"
              className="flex min-w-0 flex-col gap-2"
            >
              {categories.map((category) => (
                <div
                  key={category}
                  className="min-w-0 rounded-md border border-border/60 p-1"
                >
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </DropdownMenuLabel>
                  {blocksByCategory[category]?.map((block) => (
                    <DropdownMenuItem
                      key={block.id ?? block.type}
                      onClick={() => {
                        void handleAddQuestion(block);
                      }}
                      className="cursor-pointer gap-2.5 py-1.5"
                    >
                      <QuestionTypeIcon type={block.type} presentation={block} size="md" />
                      <div className="min-w-0 flex flex-col">
                        <span>{block.label}</span>
                        {block.description !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {block.description}
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
